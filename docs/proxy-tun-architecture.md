# 代理与 TUN 透明代理架构

> 最后更新：2026-04-18

## 1. 为什么需要代理

Cursor Agent (Opus 4.6) 等 AI 模型有区域限制，从中国大陆访问会返回 "Model not available - This model provider is not supported in your region"。Agent Tower 通过 [mihomo](https://github.com/MetaCubeX/mihomo)（Clash Meta 内核）+ TUN 透明代理解决此问题。

### 为什么选择 TUN 而非 HTTP_PROXY

| 方式 | 优点 | 缺点 |
|------|------|------|
| `HTTP_PROXY` 环境变量 | 无需 root | `cursor-agent` 等 Node.js 程序 **不遵守** 标准代理环境变量 |
| SSH 反向隧道 | 无需远程安装 | 需要维护隧道生命周期；且 agent 仍不走隧道端口 |
| **TUN 模式** | 内核级劫持，**所有流量**透明代理 | 需要 root；配置不当会断 SSH |

最终方案：本地 + 远程服务器均使用 TUN 模式。

## 2. 整体架构

```text
┌──────────────────────────────────────────────────────────┐
│               Agent Tower Server (Hub)                    │
│                                                          │
│  ClashService (本地 mihomo)      RemoteClashService       │
│    ↓ 管理本机 ~/clashctl            ↓ 通过 SSH 管理远程    │
│                                      ~/clashctl           │
│  [TUN 代理] ← cursor-agent       [TUN 代理] ← 远程 agent │
│      ↓                                ↓                   │
│   美国自动 proxy-group            美国自动 proxy-group     │
│      ↓                                ↓                   │
│   US 出口 IP                       US 出口 IP             │
└──────────────────────────────────────────────────────────┘
```

## 3. 配置文件体系

mihomo 使用 clashctl 的三层配置合并：

```
config.yaml   ← 订阅下载的原始配置（proxies、rules、proxy-groups）
     +
mixin.yaml    ← 我们自定义的覆盖/注入（TUN、LAN 规则、域名路由）
     ↓ yq eval-all 合并
runtime.yaml  ← 最终运行配置（mihomo -f runtime.yaml）
     ↓ ensureLanRules() 二次注入
runtime.yaml  ← 确保 LAN 直连规则在最顶部
```

### 3.1 mixin.yaml 关键配置项

```yaml
# TUN 透明代理
tun:
  enable: true
  stack: system
  auto-route: true
  strict-route: false          # ← 关键：false 允许 mihomo 重启时 SSH 回退到正常路由
  route-exclude-address:       # ← TUN 层排除：这些 IP 完全不经过 TUN
    - 127.0.0.1/32
    - 10.0.0.0/8               # 私有网络 A 类
    - 172.16.0.0/12             # 私有网络 B 类（包括 172.18.x.x 等远程服务器）
    - 192.168.0.0/16            # 私有网络 C 类
    - 100.64.0.0/10             # CGNAT

# 域名路由规则（mixin.rules.prefix，合并时插入到 rules 最前面）
rules:
  prefix:
    # 第一组：LAN 直连
    - IP-CIDR,127.0.0.0/8,DIRECT
    - IP-CIDR,10.0.0.0/8,DIRECT
    - IP-CIDR,172.16.0.0/12,DIRECT
    - IP-CIDR,192.168.0.0/16,DIRECT
    - IP-CIDR,100.64.0.0/10,DIRECT
    # 第二组：AI 域名走美国节点
    - DOMAIN-SUFFIX,cursor.sh,美国自动
    - DOMAIN-SUFFIX,cursor.com,美国自动
    - DOMAIN-KEYWORD,anthropic,美国自动
    - DOMAIN-KEYWORD,openai,美国自动

# 美国自动选择组
proxy-groups:
  prefix:
    - name: 美国自动
      type: url-test
      interval: 120
      tolerance: 50
      proxies: [ 美国西雅图, 美国西雅图2, 美国硅谷, ... ]
```

## 4. SSH 安全保障：三层防护

当 TUN 开启后，所有流量（包括 SSH）默认经过 mihomo。为确保 SSH 到远程服务器不受影响，我们设计了三层防护：

### 第一层：TUN `route-exclude-address`（内核级）

```yaml
tun:
  route-exclude-address:
    - 10.0.0.0/8
    - 172.16.0.0/12
    - 192.168.0.0/16
```

私有 IP 段的流量在 TUN 设备层就被排除，**完全不进入 mihomo**。这是最强的保护——即使 mihomo 进程崩溃或规则配置错误，SSH 到内网服务器仍然正常。

### 第二层：`rules` 中的 IP-CIDR DIRECT 规则（应用级）

```yaml
rules:
  - IP-CIDR,10.0.0.0/8,DIRECT
  - IP-CIDR,172.16.0.0/12,DIRECT
  ...
```

即使某些流量绕过了 TUN 排除进入 mihomo，这些规则确保它们走 DIRECT 直连。代码中 `ensureLanRules()` 会在每次 merge 后自动检查并注入这些规则到 `runtime.yaml` 的最顶部。

### 第三层：`strict-route: false`（故障恢复）

```yaml
tun:
  strict-route: false
```

当 mihomo 被杀掉（重启过程中），`strict-route: false` 允许内核回退到正常路由表。这样 SSH 连接在 mihomo 短暂下线期间仍然存活。

> **对比**：`strict-route: true` 时，mihomo 死亡 = 所有网络流量中断 = SSH 断连。

## 5. 订阅更新时的自动保护

当用户通过 Web UI 添加/切换订阅时，完整流程：

```
用户添加订阅
  → addSubscription()     本地下载配置 → SFTP 上传到远程
  → useSubscription()     将订阅配置复制为 config.yaml
  → mergeConfigRestart()
      1. yq 合并 config.yaml + mixin.yaml → runtime.yaml
         mixin 中已有 LAN 规则 (rules.prefix) + TUN 排除 (route-exclude-address)
      2. ensureLanRules()
         再次检查 runtime.yaml 顶部是否有 IP-CIDR DIRECT 规则
         如果缺失则自动注入（双保险）
      3. 重启 mihomo
         远程：nohup 后台脚本，不阻塞 SSH
         本地：直接 kill + restart
```

**关键保证**：无论订阅配置文件内容如何，LAN 直连规则都会被保留，因为：
- `mixin.yaml` 的 `rules.prefix` 在合并时总是被插入到最前面
- `ensureLanRules()` 在合并后再次验证并补充
- `tun.route-exclude-address` 来自 mixin，合并时覆盖订阅中的 TUN 配置

## 6. 远程服务器安装流程

远程服务器的 mihomo 安装不依赖 `git clone`（远程可能无法访问 GitHub），而是：

1. **从本地上传二进制**：通过 SFTP 上传 `~/clashctl/bin/mihomo` 和 `~/clashctl/bin/yq`
2. **写入 mixin.yaml**：包含完整的 TUN + LAN 规则配置
3. **下载订阅**：在本地（有代理的）机器下载，再 SFTP 上传到远程
4. **合并并启动**：mergeConfigRestart 生成 runtime.yaml 并启动

### 远程重启的特殊处理

远程 mihomo 重启时，TUN 会短暂中断网络，可能导致 SSH 断连。解决方案：

```bash
# restart.sh — 写入远程后通过 nohup 执行，独立于 SSH 会话
#!/bin/bash
sleep 0.5
sudo pkill -9 -f mihomo || true
sleep 0.5
sudo nohup /home/user/clashctl/bin/mihomo -d ... -f ... &
```

脚本通过 `nohup` 启动，即使 SSH 会话断开也能完成重启。服务端等待 3 秒后重新建立 SSH 连接验证状态。

## 7. 相关代码文件

| 文件 | 职责 |
|------|------|
| `packages/server/src/services/clash.service.ts` | 本地 mihomo 管理（状态、启停、订阅、ensureLanRules） |
| `packages/server/src/services/remote-clash.service.ts` | 远程 mihomo 管理（通过 SSH，含 SFTP 安装） |
| `packages/server/src/routes/clash.ts` | REST API：`/clash/*` (本地) + `/remote-servers/:id/clash/*` (远程) |
| `packages/web/src/hooks/use-clash.ts` | 前端 hook：本地 Clash 状态和操作 |
| `packages/web/src/hooks/use-remote-clash.ts` | 前端 hook：远程 Clash 状态和操作 |
| `packages/web/src/pages/ProxySettingsPage.tsx` | 代理设置页面（本地） |
| `packages/web/src/pages/RemoteServersSettingsPage.tsx` | 服务器管理页面（含远程 Clash 面板） |
| `~/clashctl/resources/mixin.yaml` | 本地 mixin 配置模板 |

## 8. 注意事项

1. **新增远程服务器**时需要确保其 IP 在私有网段内（10.x / 172.16-31.x / 192.168.x），否则需要在 mixin 的 `route-exclude-address` 和 `rules.prefix` 中手动添加该 IP 的 DIRECT 规则。

2. **订阅中的代理节点名称**必须与 mixin 中 `proxy-groups.prefix[美国自动].proxies` 列表匹配。如果换了订阅商，节点名称变了，需要同步更新 mixin 中的节点列表。

3. **远程服务器必须有 sudo 权限**，因为 TUN 模式需要操作内核网络设备。

4. **本地 mixin 的 `tun.enable`** 设为 `false`（按需手动开启）；远程 mixin 的 `tun.enable` 设为 `true`（安装时即启用）。
