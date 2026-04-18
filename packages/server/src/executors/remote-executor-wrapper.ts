/**
 * Wraps a local executor to run its commands on a remote server via SSH.
 * Uses SSH exec (non-interactive) mode to get clean stdout/stderr without
 * login banners or shell prompts that corrupt the JSON stream.
 */
import type { ClientChannel } from 'ssh2';
import type { SpawnedChild, ExecutorSpawnConfig } from './base.executor.js';
import { BaseExecutor, CancellationToken, type AvailabilityInfo, AgentCapability } from './base.executor.js';
import { CommandBuilder, type CommandParts, type CmdOverrides } from './command-builder.js';
import { SSHService } from '../services/ssh.service.js';
import { createSSHPty, type SSHPty } from '../services/ssh-pty-adapter.js';
import { AgentType } from '../types/index.js';
import { stripAnsiSequences } from '../output/utils/ansi.js';
import { appendFileSync } from 'node:fs';
import { getPtyLogFilePath } from '../utils/process-launch.js';

const PTY_LOG_FILE = getPtyLogFilePath();
function ptyLog(pid: number, msg: string): void {
  const line = `[${new Date().toISOString()}][pid=${pid}] ${msg}\n`;
  process.stdout.write(line);
  try { appendFileSync(PTY_LOG_FILE, line); } catch { /* ignore */ }
}

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
    const env = config.env.withProfile(this.cmdOverrides);
    const cancel = new CancellationToken();

    const fullArgs = [...commandParts.args, config.prompt];

    // Only export explicitly-set vars (proxy + provider config), NOT process.env.
    const envVars = env.toObject();
    const envExports = Object.entries(envVars)
      .map(([k, v]) => `${k}=${shellEscape(v)}`)
      .join(' ');

    const cmdStr = [commandParts.program, ...fullArgs.map(shellEscape)].join(' ');
    const cdCmd = `cd ${shellEscape(config.workingDir)}`;
    // Use `env` to set vars inline (avoids `;` breaking `&&` chains).
    // No `exec` prefix — let bash manage the child process normally.
    const innerCmd = envExports
      ? `${cdCmd} && env ${envExports} ${cmdStr}`
      : `${cdCmd} && ${cmdStr}`;
    const remoteCommand = `bash -l -c ${shellEscape(innerCmd)}`;

    ptyLog(0, `[Remote] Spawning on server ${this.serverId}`);
    ptyLog(0, `[Remote] Program: ${commandParts.program}`);
    ptyLog(0, `[Remote] WorkingDir: ${config.workingDir}`);
    ptyLog(0, `[Remote] Command: ${cmdStr.slice(0, 300)}`);
    ptyLog(0, `[Remote] Full SSH exec: ${remoteCommand.slice(0, 500)}`);

    const { client, channel } = await SSHService.execWithProxyTunnel(this.serverId, remoteCommand);
    const sshPty = createSSHPty(channel);

    ptyLog(sshPty.pid, `[Remote] SSH exec channel opened`);

    let outputBuffer = '';
    const offData = sshPty.onData((data) => {
      if (outputBuffer.length < 8000) {
        outputBuffer += data;
      }
      const cleaned = stripAnsiSequences(data).replace(/\s+/g, ' ').trim();
      if (cleaned) {
        ptyLog(sshPty.pid, `PTY> ${cleaned.slice(0, 300)}`);
      }
    });

    const serverId = this.serverId;
    sshPty.onExit(({ exitCode, signal }) => {
      offData.dispose();
      ptyLog(sshPty.pid, `PTY exited code=${exitCode} signal=${signal}`);
      if (exitCode !== 0) {
        const cleaned = stripAnsiSequences(outputBuffer).replace(/\s+/g, ' ').trim();
        if (cleaned) {
          ptyLog(sshPty.pid, `full output: ${cleaned.slice(0, 1000)}`);
        }
      }
      SSHService.releaseClient(serverId, client);
    });

    cancel.onCancelled(() => {
      sshPty.kill('INT');
    });

    return {
      pid: sshPty.pid,
      pty: sshPty as any,
      cancel,
    };
  }
}

function shellEscape(s: string): string {
  if (/^[a-zA-Z0-9_./:=-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}
