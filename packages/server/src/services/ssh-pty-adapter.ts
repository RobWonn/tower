/**
 * Wraps an ssh2 ClientChannel into an object that satisfies the IPty interface
 * used by AgentPipeline (onData, onExit, write, resize, kill, pid).
 */
import type { ClientChannel } from 'ssh2';

interface Disposable {
  dispose(): void;
}

export interface SSHPty {
  readonly pid: number;
  onData(callback: (data: string) => void): Disposable;
  onExit(callback: (e: { exitCode: number; signal?: number }) => void): Disposable;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

let fakePidCounter = 900000;

export function createSSHPty(channel: ClientChannel): SSHPty {
  const pid = ++fakePidCounter;
  let killed = false;
  const dataListeners: Array<(data: string) => void> = [];
  const exitListeners: Array<(e: { exitCode: number; signal?: number }) => void> = [];

  channel.on('data', (data: Buffer) => {
    const str = data.toString();
    for (const cb of dataListeners) cb(str);
  });

  channel.stderr?.on('data', (data: Buffer) => {
    const str = data.toString();
    for (const cb of dataListeners) cb(str);
  });

  channel.on('close', () => {
    const exitCode = (channel as any).exitCode ?? 0;
    const signal = (channel as any).exitSignal;
    for (const cb of exitListeners) cb({ exitCode, signal });
  });

  channel.on('exit', (code: number | null, signalName?: string) => {
    (channel as any).exitCode = code ?? 0;
    (channel as any).exitSignal = signalName;
  });

  return {
    pid,
    onData(callback) {
      dataListeners.push(callback);
      return {
        dispose() {
          const idx = dataListeners.indexOf(callback);
          if (idx >= 0) dataListeners.splice(idx, 1);
        },
      };
    },
    onExit(callback) {
      exitListeners.push(callback);
      return {
        dispose() {
          const idx = exitListeners.indexOf(callback);
          if (idx >= 0) exitListeners.splice(idx, 1);
        },
      };
    },
    write(data: string) {
      if (!killed) channel.write(data);
    },
    resize(cols: number, rows: number) {
      if (!killed) {
        try {
          channel.setWindow(rows, cols, 0, 0);
        } catch { /* may fail if channel closed */ }
      }
    },
    kill(_signal?: string) {
      killed = true;
      try {
        channel.signal?.('INT');
      } catch { /* ignore */ }
      try {
        channel.close();
      } catch { /* ignore */ }
    },
  };
}
