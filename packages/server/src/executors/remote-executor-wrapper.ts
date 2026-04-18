/**
 * Wraps a local executor to run its commands on a remote server via SSH.
 * The CommandBuilder / ExecutionEnv logic is reused; only the PTY spawn is replaced.
 */
import type { ClientChannel } from 'ssh2';
import type { SpawnedChild, ExecutorSpawnConfig } from './base.executor.js';
import { BaseExecutor, CancellationToken, type AvailabilityInfo, AgentCapability } from './base.executor.js';
import { CommandBuilder, type CommandParts, type CmdOverrides, resolveCommandParts } from './command-builder.js';
import { SSHService } from '../services/ssh.service.js';
import { createSSHPty, type SSHPty } from '../services/ssh-pty-adapter.js';
import { AgentType } from '../types/index.js';

export class RemoteExecutorWrapper extends BaseExecutor {
  readonly agentType: AgentType;
  readonly displayName: string;

  constructor(
    private readonly inner: BaseExecutor,
    private readonly serverId: string,
  ) {
    super();
    this.agentType = inner.agentType;
    this.displayName = `${inner.displayName} (Remote)`;
    this.cmdOverrides = (inner as any).cmdOverrides;
  }

  protected buildCommandBuilder(): CommandBuilder {
    return (this.inner as any).buildCommandBuilder();
  }

  async getAvailabilityInfo(): Promise<AvailabilityInfo> {
    return this.inner.getAvailabilityInfo();
  }

  getCapabilities(): AgentCapability[] {
    return this.inner.getCapabilities();
  }

  async spawn(config: ExecutorSpawnConfig): Promise<SpawnedChild> {
    const commandBuilder = this.buildCommandBuilder();
    const commandParts = commandBuilder.buildInitial();
    return this.spawnRemote(config, commandParts);
  }

  async spawnFollowUp(
    config: ExecutorSpawnConfig,
    sessionId: string,
    resetToMessageId?: string,
  ): Promise<SpawnedChild> {
    const commandBuilder = this.buildCommandBuilder();
    const additionalArgs = ['--resume', sessionId];
    const commandParts = commandBuilder.buildFollowUp
      ? commandBuilder.buildFollowUp(additionalArgs)
      : commandBuilder.buildInitial();
    return this.spawnRemote(config, commandParts);
  }

  private async spawnRemote(
    config: ExecutorSpawnConfig,
    commandParts: CommandParts,
  ): Promise<SpawnedChild> {
    const { programPath, args } = await resolveCommandParts(commandParts);
    const env = config.env.withProfile(this.cmdOverrides);
    const cancel = new CancellationToken();

    const fullArgs = [...args, config.prompt];

    // Build the shell command to execute remotely
    const envVars = env.getFullEnv();
    const envPrefix = Object.entries(envVars)
      .filter(([k]) => !['HOME', 'USER', 'SHELL', 'PATH', 'TERM', 'LANG'].includes(k))
      .map(([k, v]) => `${k}=${shellEscape(v)}`)
      .join(' ');

    const cmdStr = [programPath, ...fullArgs.map(shellEscape)].join(' ');
    const remoteCommand = envPrefix
      ? `cd ${shellEscape(config.workingDir)} && ${envPrefix} ${cmdStr}`
      : `cd ${shellEscape(config.workingDir)} && ${cmdStr}`;

    const { client, channel } = await SSHService.shellWithProxyTunnel(this.serverId);
    const sshPty = createSSHPty(channel);

    // Write the command to the shell
    channel.write(remoteCommand + '\n');

    cancel.onCancelled(() => {
      sshPty.kill('INT');
    });

    return {
      pid: sshPty.pid,
      pty: sshPty as any, // SSHPty is duck-type compatible with IPty
      cancel,
    };
  }
}

function shellEscape(s: string): string {
  if (/^[a-zA-Z0-9_./:=-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}
