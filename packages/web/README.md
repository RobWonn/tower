# `packages/web`

Agent Tower 的前端应用，基于 React、Vite、TanStack Query、Zustand 和 Socket.IO Client 构建。

## 主要职责

- 展示项目与任务看板
- 展示任务详情、日志流、Todo、token usage
- 提供 workspace 工作台：编辑器、终端、Git changes、历史视图
- 通过 REST API 读写数据
- 通过 Socket.IO 订阅任务、会话、终端和工作区实时事件

## 开发命令

```bash
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web lint
```

默认情况下，前端通过 `VITE_API_URL` 访问后端；未配置时使用相对路径 `/api`。

## 目录概览

```text
src/
├── routes/        # 路由定义
├── layouts/       # 页面布局
├── pages/         # 看板页、设置页、demo 页
├── components/
│   ├── task/      # 任务列表、任务详情、启动 Agent 对话框
│   ├── workspace/ # 编辑器、终端、Git 视图、历史视图
│   ├── agent/     # 日志流、Todo、token usage
│   └── ui/        # 通用 UI 组件
├── hooks/         # TanStack Query hooks
├── lib/
│   ├── api-client.ts
│   └── socket/    # Socket manager 与订阅 hooks
└── stores/        # Zustand stores
```

## 关键实现约定

- 服务端状态优先走 TanStack Query
- 客户端 UI 状态使用 Zustand
- 应用启动时只建立一个 Socket 连接，各功能按需订阅 room
- 共享类型与 Socket 事件定义来自 `@agent-tower/shared`

## 相关文档

- 根目录 `README.md`
- `docs/ARCHITECTURE.md`
- `docs/PROJECT_SPEC.md`
