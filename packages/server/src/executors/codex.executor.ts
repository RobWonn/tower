/**
 * CodexExecutor - OpenAI Codex CLI 执行器
 * 参考: https://shipyard.build/blog/codex-cli-cheat-sheet/
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentType } from '../types/index.js';
import { which } from '../utils/index.js';
import {
  BaseExecutor,
  AvailabilityInfo,
  AgentCapability,
  ExecutorSpawnConfig,
  SpawnedChild,
} from './base.executor.js';
import { CommandBuilder, applyOverrides, CmdOverrides } from './command-builder.js';

/**
 * Codex CLI 配置
 */
export interface CodexConfig {
  /** 追加到 prompt 的文本 */
  appendPrompt?: string;
  /** 模型选择 (gpt-5.3-codex, gpt-5.3-codex-spark, gpt-5.1-codex-max) */
  model?: string;
  /** 沙箱模式 (read-only, workspace-write, danger-full-access) */
  sandbox?: string;
  /** 审批策略 (untrusted, on-request, never, reject) */
  approvalPolicy?: string;
  /** 全自动模式 - 相当于 on-request + workspace-write */
  fullAuto?: boolean;
  /** 启用实时网络搜索 */
  liveSearch?: boolean;
  /** 命令覆盖 */
  cmd?: CmdOverrides;
}

/**
 * 获取基础命令
 */
function getBaseCommand(): string {
  return 'codex';
}

export class CodexExecutor extends BaseExecutor {
  readonly agentType = AgentType.CODEX;
  readonly displayName = 'Codex';

  private config: CodexConfig;

  constructor(config: CodexConfig = {}) {
    super();
    this.config = config;
    this.cmdOverrides = config.cmd;
  }

  /**
   * 获取可用性信息
   */
  async getAvailabilityInfo(): Promise<AvailabilityInfo> {
    // 检查 codex 命令是否存在
    const codexPath = await which('codex');
    if (!codexPath) {
      return { type: 'NOT_FOUND', error: 'Codex CLI not installed' };
    }

    // 检查配置文件是否存在
    const configPath = path.join(os.homedir(), '.codex', 'config.toml');
    const authPath = path.join(os.homedir(), '.codex', 'auth.json');

    try {
      // 检查认证文件
      if (fs.existsSync(authPath)) {
        const stats = fs.statSync(authPath);
        const timestamp = Math.floor(stats.mtimeMs / 1000);
        return {
          type: 'LOGIN_DETECTED',
          lastAuthTimestamp: timestamp,
        };
      }

      // 检查配置文件
      if (fs.existsSync(configPath)) {
        return { type: 'INSTALLATION_FOUND' };
      }

      return { type: 'NOT_FOUND', error: 'Codex CLI not authenticated' };
    } catch {
      return { type: 'NOT_FOUND', error: 'Codex CLI not configured' };
    }
  }

  /**
   * 获取 Agent 能力
   */
  getCapabilities(): AgentCapability[] {
    return [AgentCapability.SESSION_FORK];
  }

  /**
   * 获取默认 MCP 配置路径
   */
  getDefaultMcpConfigPath(): string | null {
    return path.join(os.homedir(), '.codex', 'config.toml');
  }

  /**
   * 构建命令
   */
  protected buildCommandBuilder(): CommandBuilder {
    let builder = CommandBuilder.new(getBaseCommand());

    // 模型选择
    if (this.config.model) {
      builder.extendParams(['--model', this.config.model]);
    }

    // 沙箱模式
    if (this.config.sandbox) {
      builder.extendParams(['--sandbox', this.config.sandbox]);
    }

    // 审批策略
    if (this.config.approvalPolicy) {
      builder.extendParams(['--ask-for-approval', this.config.approvalPolicy]);
    }

    // 全自动模式
    if (this.config.fullAuto) {
      builder.extendParams(['--full-auto']);
    }

    // 实时搜索
    if (this.config.liveSearch) {
      builder.extendParams(['--search', 'live']);
    }

    // 应用覆盖
    return applyOverrides(builder, this.cmdOverrides);
  }

  /**
   * 启动新会话
   */
  async spawn(config: ExecutorSpawnConfig): Promise<SpawnedChild> {
    const commandBuilder = this.buildCommandBuilder();

    // Codex 使用 exec 子命令进行非交互式执行
    commandBuilder.extendParams(['exec', '--json', '--ephemeral', '--skip-git-repo-check']);

    const commandParts = commandBuilder.buildInitial();

    // 组合 prompt
    const prompt = this.combinePrompt(config.prompt);
    const newConfig = { ...config, prompt };

    return this.spawnInternal(newConfig, commandParts);
  }

  /**
   * 继续现有会话
   */
  async spawnFollowUp(
    config: ExecutorSpawnConfig,
    sessionId: string,
    resetToMessageId?: string
  ): Promise<SpawnedChild> {
    const commandBuilder = this.buildCommandBuilder();

    // Codex 使用 exec resume 命令继续会话（支持 JSON 输出）
    const additionalArgs = ['exec', 'resume', '--json', '--skip-git-repo-check'];

    if (sessionId) {
      additionalArgs.push(sessionId);
    }

    // 注意：Codex 的 exec resume 不支持 --from 参数
    // resetToMessageId 参数暂时忽略

    const commandParts = commandBuilder.buildFollowUp(additionalArgs);

    // 组合 prompt
    const prompt = this.combinePrompt(config.prompt);
    const newConfig = { ...config, prompt };

    return this.spawnInternal(newConfig, commandParts);
  }

  /**
   * 组合 prompt
   */
  private combinePrompt(prompt: string): string {
    if (this.config.appendPrompt) {
      return `${prompt}${this.config.appendPrompt}`;
    }
    return prompt;
  }
}
