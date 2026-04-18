/**
 * Remote Clash Service — installs and manages mihomo on remote servers via SSH.
 * All commands use absolute paths (resolved via `echo $HOME`) to avoid
 * single-quote quoting issues with `$HOME`.
 */

import { existsSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { SSHService } from './ssh.service.js';

const LOCAL_CLASH_DIR = `${process.env.HOME}/clashctl`;

interface RPaths {
  base: string; res: string; yq: string; mihomo: string;
  runtime: string; mixin: string; config: string; profiles: string;
}

const cache = new Map<string, RPaths>();

async function paths(sid: string): Promise<RPaths> {
  let p = cache.get(sid);
  if (p) return p;
  const home = (await SSHService.exec(sid, 'echo $HOME')).trim();
  const base = `${home}/clashctl`;
  const res = `${base}/resources`;
  p = {
    base, res, yq: `${base}/bin/yq`, mihomo: `${base}/bin/mihomo`,
    runtime: `${res}/runtime.yaml`, mixin: `${res}/mixin.yaml`,
    config: `${res}/config.yaml`, profiles: `${res}/profiles.yaml`,
  };
  cache.set(sid, p);
  return p;
}

async function rx(sid: string, cmd: string): Promise<string> {
  return (await SSHService.exec(sid, cmd)).trim();
}

export interface RemoteClashStatus {
  installed: boolean;
  running: boolean;
  version?: string;
  mixedPort?: number;
  tunEnabled?: boolean;
}

export class RemoteClashService {

  static async getStatus(sid: string): Promise<RemoteClashStatus> {
    try {
      const p = await paths(sid);
      const check = await rx(sid, `test -f '${p.mihomo}' && test -f '${p.yq}' && echo YES || echo NO`);
      if (check !== 'YES') return { installed: false, running: false };

      const ps = await rx(sid, 'pgrep -f "mihomo.*runtime.yaml" || true');
      const running = ps.length > 0;

      let version: string | undefined;
      try { version = await rx(sid, `'${p.mihomo}' -v 2>/dev/null | head -1`); } catch { /* */ }

      let mixedPort: number | undefined;
      let tunEnabled = false;
      try {
        mixedPort = parseInt(await rx(sid, `'${p.yq}' '.mixed-port // 0' '${p.runtime}'`), 10) || undefined;
        tunEnabled = (await rx(sid, `'${p.yq}' '.tun.enable // false' '${p.runtime}'`)) === 'true';
      } catch { /* */ }

      return { installed: true, running, version, mixedPort, tunEnabled };
    } catch {
      return { installed: false, running: false };
    }
  }

  static async install(sid: string): Promise<{ success: boolean; message: string }> {
    try {
      const p = await paths(sid);
      const check = await rx(sid, `test -f '${p.mihomo}' && echo YES || echo NO`);
      if (check === 'YES') return { success: true, message: 'Already installed' };

      const localMihomo = `${LOCAL_CLASH_DIR}/bin/mihomo`;
      const localYq = `${LOCAL_CLASH_DIR}/bin/yq`;
      if (!existsSync(localMihomo) || !existsSync(localYq))
        return { success: false, message: 'Local clashctl not installed — install locally first' };

      await rx(sid, `mkdir -p '${p.base}/bin' '${p.res}/profiles'`);
      await SSHService.uploadFile(sid, localMihomo, `${p.base}/bin/mihomo`);
      await SSHService.uploadFile(sid, localYq, `${p.base}/bin/yq`);
      await rx(sid, `chmod +x '${p.mihomo}' '${p.yq}'`);

      await rx(sid, `test -f '${p.profiles}' || printf 'use: 0\\nprofiles: []\\n' > '${p.profiles}'`);
      await this.writeMixin(sid);
      await rx(sid, `test -f '${p.config}' || printf 'proxies: []\\nrules: []\\n' > '${p.config}'`);

      const ver = await rx(sid, `'${p.mihomo}' -v 2>&1 | head -1`);
      return { success: true, message: `Installed: ${ver}` };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  static async writeMixin(sid: string): Promise<void> {
    const p = await paths(sid);
    const mixin = `mixed-port: 7890
external-controller: "0.0.0.0:9090"
external-ui: dist
external-ui-url: https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip
secret: mtAWfj
allow-lan: false
rules:
  prefix:
    - DOMAIN,api64.ipify.org,DIRECT
    - DOMAIN-SUFFIX,cursor.sh,美国自动
    - DOMAIN-SUFFIX,cursor.com,美国自动
    - DOMAIN-SUFFIX,cursorapi.com,美国自动
    - DOMAIN-KEYWORD,cursor,美国自动
    - DOMAIN-KEYWORD,anthropic,美国自动
    - DOMAIN-KEYWORD,openai,美国自动
  suffix:
proxies:
  prefix:
  suffix:
  override:
proxy-groups:
  prefix:
    - name: 美国自动
      type: url-test
      url: http://www.gstatic.com/generate_204
      interval: 120
      tolerance: 50
      proxies:
        - 美国西雅图
        - 美国西雅图2
        - 美国洛杉矶[CU]
        - 美国硅谷
        - 美国硅谷2
        - 美国圣何塞
        - 美国洛杉矶
        - 美国洛杉矶2
  suffix:
  override:
tun:
  enable: true
  stack: system
  auto-route: true
  auto-redir: true
  auto-redirect: true
  auto-detect-interface: true
  dns-hijack:
    - any:53
    - tcp://any:53
  strict-route: false
  route-exclude-address:
    - 1.1.1.1/32
    - 127.0.0.1/32
    - 10.0.0.0/8
    - 172.16.0.0/12
    - 192.168.0.0/16
    - 100.64.0.0/10
  exclude-interface:
    - docker0
    - podman0
dns:
  enable: true
  listen: 0.0.0.0:1053
  enhanced-mode: fake-ip
  nameserver:
    - 114.114.114.114
    - 8.8.8.8`;

    await rx(sid, `cat > '${p.mixin}' << 'MIXIN_EOF'\n${mixin}\nMIXIN_EOF`);
  }

  static async ensureLanRules(sid: string): Promise<void> {
    const p = await paths(sid);
    const lanRules = [
      'IP-CIDR,127.0.0.0/8,DIRECT', 'IP-CIDR,10.0.0.0/8,DIRECT',
      'IP-CIDR,172.16.0.0/12,DIRECT', 'IP-CIDR,192.168.0.0/16,DIRECT',
      'IP-CIDR,100.64.0.0/10,DIRECT', 'IP-CIDR,169.254.0.0/16,DIRECT',
      'IP-CIDR6,::1/128,DIRECT', 'IP-CIDR6,fc00::/7,DIRECT', 'IP-CIDR6,fe80::/10,DIRECT',
    ];
    try {
      const first = await rx(sid, `'${p.yq}' '.rules[0] // ""' '${p.runtime}'`);
      if (first === lanRules[0]) return;
    } catch { /* */ }

    const entries = lanRules.map(r => `"${r}"`).join(', ');
    await rx(sid, `'${p.yq}' -i '.rules = [${entries}] + (.rules // [])' '${p.runtime}'`);
  }

  static async start(sid: string): Promise<string> {
    const p = await paths(sid);
    await this.ensureLanRules(sid);
    await rx(sid, `sudo bash -c 'nohup ${p.mihomo} -d ${p.res} -f ${p.runtime} >> ${p.res}/mihomo.log 2>&1 &'`);
    await rx(sid, 'sleep 1');
    return 'started';
  }

  static async stop(sid: string): Promise<string> {
    // Disable TUN in config first so it doesn't break networking after kill
    const p = await paths(sid);
    try { await rx(sid, `'${p.yq}' -i '.tun.enable = false' '${p.runtime}'`); } catch { /* */ }
    await rx(sid, `sudo bash -c 'pkill -9 -f mihomo || true'`);
    return 'stopped';
  }

  static async restart(sid: string): Promise<string> {
    await this.mergeConfigRestart(sid);
    return 'restarted';
  }

  /**
   * Hot-reload mihomo config via its REST API — no process restart, SSH stays alive.
   * Falls back to kill+restart if the API is not reachable.
   */
  /**
   * Restart mihomo on the remote. When TUN is active, killing mihomo breaks
   * SSH, so we write a restart script and launch it with `nohup` / `disown`
   * so it executes independently of our SSH session.
   */
  private static async reloadOrRestart(sid: string): Promise<void> {
    const p = await paths(sid);
    const script = `${p.base}/restart.sh`;

    // Write a self-contained restart script
    await rx(sid, `cat > '${script}' << 'SCRIPT_EOF'
#!/bin/bash
sleep 0.5
sudo pkill -9 -f mihomo || true
sleep 0.5
sudo nohup ${p.mihomo} -d ${p.res} -f ${p.runtime} >> ${p.res}/mihomo.log 2>&1 &
SCRIPT_EOF`);
    await rx(sid, `chmod +x '${script}'`);

    // Launch it fully detached from our SSH session
    try {
      await rx(sid, `nohup bash '${script}' >> /dev/null 2>&1 &`);
    } catch { /* expected — SSH channel may close during restart */ }

    // Give it time to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  static async mergeConfigRestart(sid: string): Promise<void> {
    const p = await paths(sid);

    await rx(sid, `cd '${p.base}' && bin/yq eval-all '
      select(fileIndex==0) as $config |
      select(fileIndex==1) as $mixin |
      $mixin |= del(._custom) |
      (($config // {}) * $mixin) as $runtime |
      $runtime |
      .rules = (($mixin.rules.prefix // []) + ($config.rules // []) + ($mixin.rules.suffix // [])) |
      .proxies = (($mixin.proxies.prefix // []) + (($config.proxies // []) as $cl | ($mixin.proxies.override // []) as $ol | $cl | map(. as $ci | ($ol[] | select(.name == $ci.name)) // $ci)) + ($mixin.proxies.suffix // [])) |
      .proxy-groups = (($mixin.proxy-groups.prefix // []) + (($config.proxy-groups // []) as $cl | ($mixin.proxy-groups.override // []) as $ol | $cl | map(. as $ci | ($ol[] | select(.name == $ci.name)) // $ci)) + ($mixin.proxy-groups.suffix // []))
    ' resources/config.yaml resources/mixin.yaml > resources/runtime.yaml`);

    await this.ensureLanRules(sid);
    await this.reloadOrRestart(sid);
  }

  static async addSubscription(sid: string, url: string): Promise<{ id: number }> {
    const p = await paths(sid);
    const localTemp = '/tmp/clash-sub-temp.yaml';
    const ua = 'clash-verge/v2.4.0';

    try {
      execSync(`curl -sf --insecure -L --max-time 30 --user-agent '${ua}' -o '${localTemp}' '${url}'`, {
        encoding: 'utf-8', timeout: 35_000, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e: any) {
      throw new Error(`Failed to download subscription: ${e.message}`);
    }

    await rx(sid, `mkdir -p '${p.res}/profiles'`);
    await rx(sid, `test -f '${p.profiles}' || printf 'use: 0\\nprofiles: []\\n' > '${p.profiles}'`);

    const nextId = parseInt(await rx(sid, `'${p.yq}' '.profiles // [] | (map(.id) | max) // 0 | . + 1' '${p.profiles}'`), 10) || 1;
    const profilePath = `${p.res}/profiles/${nextId}.yaml`;

    await SSHService.uploadFile(sid, localTemp, profilePath);
    try { unlinkSync(localTemp); } catch { /* */ }

    await rx(sid, `'${p.yq}' -i '.profiles = (.profiles // []) + [{"id": ${nextId}, "path": "${profilePath}", "url": "${url}"}]' '${p.profiles}'`);
    return { id: nextId };
  }

  static async listSubscriptions(sid: string): Promise<{ use: number; profiles: Array<{ id: number; url: string }> }> {
    try {
      const p = await paths(sid);
      const exists = await rx(sid, `test -f '${p.profiles}' && echo YES || echo NO`);
      if (exists !== 'YES') return { use: 0, profiles: [] };

      const useId = parseInt(await rx(sid, `'${p.yq}' '.use // 0' '${p.profiles}'`), 10);
      const count = parseInt(await rx(sid, `'${p.yq}' '.profiles // [] | length' '${p.profiles}'`), 10);
      const profiles: Array<{ id: number; url: string }> = [];
      for (let i = 0; i < count; i++) {
        const id = parseInt(await rx(sid, `'${p.yq}' '.profiles[${i}].id' '${p.profiles}'`), 10);
        const url = await rx(sid, `'${p.yq}' '.profiles[${i}].url' '${p.profiles}'`);
        profiles.push({ id, url });
      }
      return { use: useId, profiles };
    } catch {
      return { use: 0, profiles: [] };
    }
  }

  static async useSubscription(sid: string, id: number): Promise<void> {
    const p = await paths(sid);
    const profilePath = await rx(sid, `'${p.yq}' '.profiles[] | select(.id == ${id}) | .path' '${p.profiles}'`);
    if (!profilePath) throw new Error(`Subscription id ${id} not found`);

    await rx(sid, `cat '${profilePath}' > '${p.config}'`);
    await this.mergeConfigRestart(sid);
    await rx(sid, `'${p.yq}' -i '.use = ${id}' '${p.profiles}'`);
  }

  static async testConnectivity(sid: string): Promise<{ success: boolean; ip?: string; country?: string; error?: string }> {
    try {
      const p = await paths(sid);
      const port = await rx(sid, `'${p.yq}' '.mixed-port // 7890' '${p.runtime}'`);
      const result = await rx(sid, `curl -s -x http://127.0.0.1:${port} --connect-timeout 10 --max-time 15 https://ipinfo.io/json`);
      const parsed = JSON.parse(result);
      return { success: true, ip: parsed.ip, country: parsed.country };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  static async setTunEnabled(sid: string, enabled: boolean): Promise<void> {
    const p = await paths(sid);
    await rx(sid, `'${p.yq}' -i '.tun.enable = ${enabled}' '${p.runtime}'`);
    if (enabled) await this.ensureLanRules(sid);
    await this.reloadOrRestart(sid);
  }

  static async fullSetup(sid: string, subscriptionUrl: string): Promise<{ success: boolean; message: string }> {
    const installResult = await this.install(sid);
    if (!installResult.success) return installResult;

    await this.writeMixin(sid);

    let subs = await this.listSubscriptions(sid);
    if (!subs.profiles.some(p => p.url === subscriptionUrl)) {
      await this.addSubscription(sid, subscriptionUrl);
      subs = await this.listSubscriptions(sid);
    }

    if (subs.profiles.length > 0) {
      await this.useSubscription(sid, subs.profiles[0].id);
    }

    return { success: true, message: 'Setup complete — TUN proxy active' };
  }
}
