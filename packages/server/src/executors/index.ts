/**
 * Executors 模块导出
 *
 * 改造: 不再使用全局单例 Map，而是从 profiles 读取配置动态构造 executor 实例
 */

import { AgentType } from '../types/index.js';
import { BaseExecutor, AvailabilityInfo } from './base.executor.js';
import { ClaudeCodeExecutor, type ClaudeCodeConfig } from './claude-code.executor.js';
import { GeminiCliExecutor, type GeminiCliConfig } from './gemini-cli.executor.js';
import { CursorAgentExecutor, type CursorAgentConfig } from './cursor-agent.executor.js';
import { CodexExecutor, type CodexConfig } from './codex.executor.js';
import { getVariantConfig, type VariantConfig } from './profiles.js';

// ─── Executor Factory ────────────────────────────────────────────

/**
 * 根据 agent 类型和 variant 配置创建 executor 实例
 */
function createExecutor(agentType: AgentType, config: VariantConfig = {}): BaseExecutor {
  switch (agentType) {
    case AgentType.CLAUDE_CODE:
      return new ClaudeCodeExecutor(config as ClaudeCodeConfig);
    case AgentType.GEMINI_CLI:
      return new GeminiCliExecutor(config as GeminiCliConfig);
    case AgentType.CURSOR_AGENT:
      return new CursorAgentExecutor(config as CursorAgentConfig);
    case AgentType.CODEX:
      return new CodexExecutor(config as CodexConfig);
    default:
      throw new Error(`Unknown agent type: ${agentType}`);
  }
}

/**
 * 获取指定类型的执行器（支持 variant）
 *
 * @param agentType - agent 类型
 * @param variant - 配置变体名称，默认 'DEFAULT'
 */
export function getExecutor(agentType: AgentType, variant: string = 'DEFAULT'): BaseExecutor | undefined {
  const config = getVariantConfig(agentType, variant);
  if (!config) {
    // variant 不存在时 fallback 到 DEFAULT
    const defaultConfig = getVariantConfig(agentType, 'DEFAULT');
    if (!defaultConfig) return undefined;
    return createExecutor(agentType, defaultConfig);
  }
  return createExecutor(agentType, config);
}

/**
 * 获取所有已注册的 agent 类型
 */
export function getAllAgentTypes(): AgentType[] {
  return Object.values(AgentType);
}

/**
 * 获取所有执行器（每种 agent 的 DEFAULT variant）
 */
export function getAllExecutors(): BaseExecutor[] {
  return getAllAgentTypes()
    .map(type => getExecutor(type))
    .filter((e): e is BaseExecutor => e !== undefined);
}

/**
 * 获取可用的执行器列表
 */
export async function getAvailableExecutors(): Promise<BaseExecutor[]> {
  const available: BaseExecutor[] = [];

  for (const executor of getAllExecutors()) {
    const availability = await executor.getAvailabilityInfo();
    if (availability.type !== 'NOT_FOUND') {
      available.push(executor);
    }
  }

  return available;
}

/**
 * 获取所有执行器的可用性信息
 */
export async function getAllExecutorsAvailability(): Promise<
  Array<{
    agentType: AgentType;
    displayName: string;
    availability: AvailabilityInfo;
  }>
> {
  const results = [];

  for (const executor of getAllExecutors()) {
    const availability = await executor.getAvailabilityInfo();
    results.push({
      agentType: executor.agentType,
      displayName: executor.displayName,
      availability,
    });
  }

  return results;
}

// 导出类
export { BaseExecutor, CancellationToken } from './base.executor.js';
export { ClaudeCodeExecutor, PermissionMode } from './claude-code.executor.js';
export { GeminiCliExecutor } from './gemini-cli.executor.js';
export { CursorAgentExecutor } from './cursor-agent.executor.js';
export { CodexExecutor } from './codex.executor.js';
export { CommandBuilder } from './command-builder.js';
export { ExecutionEnv } from './execution-env.js';

// 导出 profiles
export {
  getProfiles,
  loadProfiles,
  reloadProfiles,
  getVariantConfig,
  getVariantNames,
  setVariantConfig,
  deleteVariantConfig,
  getDefaultProfiles,
} from './profiles.js';

// 导出类型
export type { AvailabilityInfo, SpawnedChild, ExecutorSpawnConfig, AgentCapability } from './base.executor.js';
export type { ClaudeCodeConfig } from './claude-code.executor.js';
export type { GeminiCliConfig } from './gemini-cli.executor.js';
export type { CursorAgentConfig } from './cursor-agent.executor.js';
export type { CodexConfig } from './codex.executor.js';
export type { CmdOverrides, CommandParts } from './command-builder.js';
export type { RepoContext } from './execution-env.js';
export type { ExecutorProfiles, VariantConfig, AgentVariants } from './profiles.js';
