import { Client, type ConnectConfig, type ClientChannel } from 'ssh2';
import { readFileSync } from 'node:fs';
import { createConnection as netCreateConnection } from 'node:net';
import { prisma } from '../utils/index.js';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { ClashService } from './clash.service.js';

const ENCRYPTION_KEY = process.env.AGENT_TOWER_ENCRYPTION_KEY || 'agent-tower-default-key-32chars!';
const ALGO = 'aes-256-gcm';

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function getKeyBuffer(): Buffer {
  const raw = Buffer.from(ENCRYPTION_KEY, 'utf-8');
  if (raw.length >= 32) return raw.subarray(0, 32);
  const padded = Buffer.alloc(32);
  raw.copy(padded);
  return padded;
}

export function encryptPassword(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKeyBuffer(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptPassword(blob: string): string {
  const [ivHex, tagHex, dataHex] = blob.split(':');
  if (!ivHex || !tagHex || !dataHex) return blob;
  try {
    const decipher = createDecipheriv(ALGO, getKeyBuffer(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf-8');
  } catch {
    return blob;
  }
}

interface PooledConnection {
  client: Client;
  lastUsed: number;
  busy: number;
}

const MAX_CONNECTIONS_PER_SERVER = 3;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

class SSHConnectionPool {
  private pools = new Map<string, PooledConnection[]>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.pruneIdle(), 60_000);
  }

  async acquire(serverId: string, config: ConnectConfig): Promise<Client> {
    const pool = this.pools.get(serverId) || [];
    const idle = pool.find(c => c.busy === 0);
    if (idle) {
      idle.busy++;
      idle.lastUsed = Date.now();
      return idle.client;
    }

    if (pool.length < MAX_CONNECTIONS_PER_SERVER) {
      const client = await this.connect(config);
      const entry: PooledConnection = { client, lastUsed: Date.now(), busy: 1 };
      pool.push(entry);
      this.pools.set(serverId, pool);

      client.on('close', () => {
        const arr = this.pools.get(serverId);
        if (arr) {
          const idx = arr.indexOf(entry);
          if (idx >= 0) arr.splice(idx, 1);
        }
      });

      return client;
    }

    const leastBusy = pool.reduce((a, b) => (a.busy <= b.busy ? a : b));
    leastBusy.busy++;
    leastBusy.lastUsed = Date.now();
    return leastBusy.client;
  }

  release(serverId: string, client: Client): void {
    const pool = this.pools.get(serverId);
    if (!pool) return;
    const entry = pool.find(c => c.client === client);
    if (entry) {
      entry.busy = Math.max(0, entry.busy - 1);
      entry.lastUsed = Date.now();
    }
  }

  disconnect(serverId: string): void {
    const pool = this.pools.get(serverId);
    if (!pool) return;
    for (const entry of pool) {
      entry.client.end();
    }
    this.pools.delete(serverId);
  }

  disconnectAll(): void {
    for (const [id] of this.pools) {
      this.disconnect(id);
    }
  }

  private connect(config: ConnectConfig): Promise<Client> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      const timeout = setTimeout(() => {
        client.end();
        reject(new Error('SSH connection timed out'));
      }, 15_000);

      client.on('ready', () => {
        clearTimeout(timeout);
        resolve(client);
      });
      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      client.connect(config);
    });
  }

  private pruneIdle(): void {
    const now = Date.now();
    for (const [serverId, pool] of this.pools) {
      const keep: PooledConnection[] = [];
      for (const entry of pool) {
        if (entry.busy === 0 && now - entry.lastUsed > IDLE_TIMEOUT_MS) {
          entry.client.end();
        } else {
          keep.push(entry);
        }
      }
      if (keep.length === 0) {
        this.pools.delete(serverId);
      } else {
        this.pools.set(serverId, keep);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.disconnectAll();
  }
}

const pool = new SSHConnectionPool();

async function buildConnectConfig(server: {
  host: string;
  port: number;
  username: string;
  authType: string;
  privateKeyPath?: string | null;
  password?: string | null;
}): Promise<ConnectConfig> {
  const config: ConnectConfig = {
    host: server.host,
    port: server.port,
    username: server.username,
    readyTimeout: 15_000,
  };

  if (server.authType === 'password' && server.password) {
    config.password = decryptPassword(server.password);
  } else if (server.privateKeyPath) {
    try {
      config.privateKey = readFileSync(server.privateKeyPath);
    } catch {
      throw new Error(`Cannot read private key: ${server.privateKeyPath}`);
    }
  } else {
    const defaultKeyPaths = [
      `${process.env.HOME}/.ssh/id_rsa`,
      `${process.env.HOME}/.ssh/id_ed25519`,
    ];
    for (const p of defaultKeyPaths) {
      try {
        config.privateKey = readFileSync(p);
        break;
      } catch { /* try next */ }
    }
    if (!config.privateKey) {
      throw new Error('No SSH key found and no password provided');
    }
  }

  return config;
}

export class SSHService {
  static async testConnection(config: {
    host: string;
    port: number;
    username: string;
    authType: string;
    privateKeyPath?: string | null;
    password?: string | null;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const connectConfig = await buildConnectConfig(config);
      const client = await new Promise<Client>((resolve, reject) => {
        const c = new Client();
        const timeout = setTimeout(() => { c.end(); reject(new Error('Connection timed out')); }, 15_000);
        c.on('ready', () => { clearTimeout(timeout); resolve(c); });
        c.on('error', (err) => { clearTimeout(timeout); reject(err); });
        c.connect(connectConfig);
      });
      client.end();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  static async exec(serverId: string, command: string): Promise<string> {
    const server = await prisma.remoteServer.findUnique({ where: { id: serverId } });
    if (!server) throw new Error(`Server ${serverId} not found`);

    const config = await buildConnectConfig(server);
    const client = await pool.acquire(serverId, config);
    // Wrap in login shell so ~/.bashrc / ~/.profile are sourced (picks up ~/.local/bin etc.)
    const wrapped = `bash -l -c ${shellQuote(command)}`;
    try {
      return await new Promise<string>((resolve, reject) => {
        client.exec(wrapped, (err, stream) => {
          if (err) return reject(err);
          let stdout = '';
          let stderr = '';
          stream.on('data', (data: Buffer) => { stdout += data.toString(); });
          stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
          stream.on('close', (code: number) => {
            if (code !== 0) {
              reject(new Error(`Command exited with code ${code}: ${stderr.trim() || stdout.trim()}`));
            } else {
              resolve(stdout);
            }
          });
        });
      });
    } finally {
      pool.release(serverId, client);
    }
  }

  static async shell(serverId: string): Promise<{ client: Client; channel: ClientChannel }> {
    const server = await prisma.remoteServer.findUnique({ where: { id: serverId } });
    if (!server) throw new Error(`Server ${serverId} not found`);

    const config = await buildConnectConfig(server);
    const client = await pool.acquire(serverId, config);
    return new Promise((resolve, reject) => {
      client.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, channel) => {
        if (err) {
          pool.release(serverId, client);
          return reject(err);
        }
        resolve({ client, channel });
      });
    });
  }

  /**
   * Open a shell with SSH reverse port forwarding for proxy tunnel.
   * Remote side can access the tower host's proxy via localhost:{port}.
   */
  static async shellWithProxyTunnel(serverId: string): Promise<{ client: Client; channel: ClientChannel }> {
    const server = await prisma.remoteServer.findUnique({ where: { id: serverId } });
    if (!server) throw new Error(`Server ${serverId} not found`);

    const config = await buildConnectConfig(server);
    const client = await pool.acquire(serverId, config);

    const status = ClashService.getStatus();
    if (status.running && status.mixedPort) {
      const localPort = status.mixedPort;
      try {
        await new Promise<void>((resolve) => {
          client.forwardIn('127.0.0.1', localPort, (err) => {
            if (err) {
              console.warn(`[SSH] Reverse tunnel failed (port ${localPort}): ${err.message}`);
            } else {
              console.log(`[SSH] Reverse tunnel: remote 127.0.0.1:${localPort} -> local 127.0.0.1:${localPort}`);
            }
            resolve();
          });
        });

        client.on('tcp connection', (_info, accept) => {
          const upstream = accept();
          const local = netCreateConnection({ host: '127.0.0.1', port: localPort });
          upstream.pipe(local).pipe(upstream);
          upstream.on('error', () => local.destroy());
          local.on('error', () => upstream.close());
        });
      } catch (err) {
        console.warn(`[SSH] Proxy tunnel setup failed:`, err);
      }
    }

    return new Promise((resolve, reject) => {
      client.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, channel) => {
        if (err) {
          pool.release(serverId, client);
          return reject(err);
        }
        resolve({ client, channel });
      });
    });
  }

  /**
   * Run a command via SSH exec (non-interactive) with reverse proxy tunnel.
   * Unlike shell(), exec() gives clean stdout/stderr without login banners or prompts.
   */
  static async execWithProxyTunnel(
    serverId: string,
    command: string,
    options?: { term?: string; cols?: number; rows?: number },
  ): Promise<{ client: Client; channel: ClientChannel }> {
    const server = await prisma.remoteServer.findUnique({ where: { id: serverId } });
    if (!server) throw new Error(`Server ${serverId} not found`);

    const config = await buildConnectConfig(server);

    // Set up reverse tunnel on a SEPARATE connection so it doesn't
    // interfere with the exec channel's data flow (forwardIn on the same
    // connection causes silent data loss).
    let tunnelClient: Client | undefined;
    const status = ClashService.getStatus();
    if (status.running && status.mixedPort) {
      const localPort = status.mixedPort;
      try {
        tunnelClient = new Client();
        await new Promise<void>((resolve, reject) => {
          tunnelClient!.on('ready', () => resolve());
          tunnelClient!.on('error', (err) => {
            console.warn(`[SSH] Tunnel connection failed: ${err.message}`);
            tunnelClient = undefined;
            resolve();
          });
          tunnelClient!.connect(config);
        });

        if (tunnelClient) {
          await new Promise<void>((resolve) => {
            tunnelClient!.forwardIn('127.0.0.1', localPort, (err) => {
              if (err) {
                console.warn(`[SSH] Reverse tunnel failed (port ${localPort}): ${err.message}`);
              } else {
                console.log(`[SSH] Reverse tunnel: remote 127.0.0.1:${localPort} -> local 127.0.0.1:${localPort}`);
              }
              resolve();
            });
          });

          tunnelClient.on('tcp connection', (_info, accept) => {
            const upstream = accept();
            const local = netCreateConnection({ host: '127.0.0.1', port: localPort });
            upstream.pipe(local).pipe(upstream);
            upstream.on('error', () => local.destroy());
            local.on('error', () => upstream.close());
          });
        }
      } catch (err) {
        console.warn(`[SSH] Proxy tunnel setup failed:`, err);
        tunnelClient = undefined;
      }
    }

    // Create a separate, dedicated connection for the exec channel.
    const client = new Client();
    await new Promise<void>((resolve, reject) => {
      client.on('ready', () => resolve());
      client.on('error', reject);
      client.connect(config);
    });

    const term = options?.term ?? 'xterm-256color';
    const cols = options?.cols ?? 120;
    const rows = options?.rows ?? 30;

    return new Promise((resolve, reject) => {
      client.exec(command, { pty: { term, cols, rows } }, (err, channel) => {
        if (err) {
          client.end();
          if (tunnelClient) tunnelClient.end();
          return reject(err);
        }
        // Clean up tunnel connection when the exec channel closes
        channel.on('close', () => {
          if (tunnelClient) {
            try { tunnelClient.end(); } catch { /* ignore */ }
          }
        });
        resolve({ client, channel });
      });
    });
  }

  /**
   * Upload a local file to the remote server via SFTP.
   */
  static async uploadFile(serverId: string, localPath: string, remotePath: string): Promise<void> {
    const server = await prisma.remoteServer.findUnique({ where: { id: serverId } });
    if (!server) throw new Error(`Server ${serverId} not found`);

    const config = await buildConnectConfig(server);
    const client = await pool.acquire(serverId, config);
    try {
      await new Promise<void>((resolve, reject) => {
        client.sftp((err, sftp) => {
          if (err) return reject(err);
          sftp.fastPut(localPath, remotePath, (err2) => {
            sftp.end();
            if (err2) return reject(err2);
            resolve();
          });
        });
      });
    } finally {
      pool.release(serverId, client);
    }
  }

  static async checkCursorAgent(serverId: string): Promise<{
    installed: boolean;
    loggedIn: boolean;
    version?: string;
    agentCmd?: string;
  }> {
    const result = { installed: false, loggedIn: false, version: undefined as string | undefined, agentCmd: undefined as string | undefined };

    // Try multiple possible binary names / paths
    const candidates = [
      'cursor-agent',
      'agent',
      '$HOME/.local/bin/cursor-agent',
      '$HOME/.local/bin/agent',
    ];

    for (const cmd of candidates) {
      try {
        const versionOutput = await SSHService.exec(serverId, `${cmd} --version 2>/dev/null || echo NOT_FOUND`);
        if (!versionOutput.includes('NOT_FOUND')) {
          result.installed = true;
          result.version = versionOutput.trim().split('\n')[0];
          result.agentCmd = cmd;
          break;
        }
      } catch {
        continue;
      }
    }

    if (result.installed && result.agentCmd) {
      try {
        const authCheck = await SSHService.exec(
          serverId,
          `${result.agentCmd} auth status 2>&1 || true`,
        );
        const lower = authCheck.toLowerCase();
        result.loggedIn = !lower.includes('not logged in')
          && !lower.includes('not authenticated')
          && !lower.includes('error')
          && !lower.includes('usage');
      } catch {
        // auth check failure = not logged in
      }
    }

    await prisma.remoteServer.update({
      where: { id: serverId },
      data: {
        agentInstalled: result.installed,
        agentLoggedIn: result.loggedIn,
        lastCheckedAt: new Date(),
      },
    });

    return result;
  }

  static async installCursorAgent(serverId: string): Promise<string> {
    // Install cursor-agent, then ensure ~/.local/bin is in PATH for future sessions
    const output = await SSHService.exec(
      serverId,
      'curl -fsSL https://cursor.com/install | bash 2>&1',
    );

    // Add ~/.local/bin to PATH in .bashrc if not already there
    try {
      await SSHService.exec(
        serverId,
        'grep -q \'export PATH="$HOME/.local/bin:$PATH"\' ~/.bashrc 2>/dev/null || echo \'export PATH="$HOME/.local/bin:$PATH"\' >> ~/.bashrc',
      );
    } catch { /* best-effort */ }

    const check = await SSHService.checkCursorAgent(serverId);
    if (!check.installed) {
      throw new Error('Installation completed but cursor-agent binary not found. Output:\n' + output.substring(0, 500));
    }
    return output;
  }

  /**
   * Run cursor-agent login on a remote server.
   * Returns an async generator that yields events as the login proceeds.
   */
  static async *loginCursorAgent(
    serverId: string,
  ): AsyncGenerator<{ type: 'url'; url: string } | { type: 'done'; success: boolean } | { type: 'output'; data: string }> {
    const server = await prisma.remoteServer.findUnique({ where: { id: serverId } });
    if (!server) throw new Error(`Server ${serverId} not found`);

    const config = await buildConnectConfig(server);
    const client = await pool.acquire(serverId, config);

    try {
      // Discover the agent binary name first
      let agentCmd = 'cursor-agent';
      try {
        const check = await SSHService.checkCursorAgent(serverId);
        if (check.agentCmd) agentCmd = check.agentCmd;
      } catch { /* fallback to cursor-agent */ }

      const loginCmd = `bash -l -c ${shellQuote(`NO_OPEN_BROWSER=1 ${agentCmd} login 2>&1`)}`;
      const channel = await new Promise<ClientChannel>((resolve, reject) => {
        client.exec(loginCmd, (err, stream) => {
          if (err) return reject(err);
          resolve(stream);
        });
      });

      const urlPattern = /https?:\/\/[^\s]+auth[^\s]*/i;
      let done = false;
      let buffer = '';

      const lines = new Promise<void>((resolve) => {
        channel.on('data', (data: Buffer) => {
          buffer += data.toString();
        });
        channel.on('close', () => {
          done = true;
          resolve();
        });
      });

      // Poll the buffer for URL and completion
      while (!done) {
        await new Promise(r => setTimeout(r, 200));
        if (buffer.length > 0) {
          const current = buffer;
          buffer = '';
          yield { type: 'output', data: current };

          const match = current.match(urlPattern);
          if (match) {
            yield { type: 'url', url: match[0] };
          }
        }
      }
      // Drain remaining buffer
      if (buffer.length > 0) {
        yield { type: 'output', data: buffer };
        const match = buffer.match(urlPattern);
        if (match) {
          yield { type: 'url', url: match[0] };
        }
      }

      await lines;
      await SSHService.checkCursorAgent(serverId);
      yield { type: 'done', success: true };
    } finally {
      pool.release(serverId, client);
    }
  }

  /**
   * Run cursor-agent login locally (on the hub server).
   */
  static async *loginLocalCursorAgent(): AsyncGenerator<
    { type: 'url'; url: string } | { type: 'done'; success: boolean } | { type: 'output'; data: string }
  > {
    const { spawn } = await import('node:child_process');
    const child = spawn('cursor-agent', ['login'], {
      env: { ...process.env, NO_OPEN_BROWSER: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const urlPattern = /https?:\/\/[^\s]+auth[^\s]*/i;
    let buffer = '';
    let done = false;

    child.stdout?.on('data', (data: Buffer) => { buffer += data.toString(); });
    child.stderr?.on('data', (data: Buffer) => { buffer += data.toString(); });

    const exitPromise = new Promise<number>((resolve) => {
      child.on('close', (code) => { done = true; resolve(code ?? 1); });
      child.on('error', () => { done = true; resolve(1); });
    });

    while (!done) {
      await new Promise(r => setTimeout(r, 200));
      if (buffer.length > 0) {
        const current = buffer;
        buffer = '';
        yield { type: 'output', data: current };
        const match = current.match(urlPattern);
        if (match) {
          yield { type: 'url', url: match[0] };
        }
      }
    }

    if (buffer.length > 0) {
      yield { type: 'output', data: buffer };
      const match = buffer.match(urlPattern);
      if (match) {
        yield { type: 'url', url: match[0] };
      }
    }

    const exitCode = await exitPromise;
    yield { type: 'done', success: exitCode === 0 };
  }

  static getPool(): SSHConnectionPool {
    return pool;
  }

  static releaseClient(_serverId: string, client: Client): void {
    // For dedicated connections (from execWithProxyTunnel), just close them.
    try { client.end(); } catch { /* ignore */ }
  }

  static disconnect(serverId: string): void {
    pool.disconnect(serverId);
  }

  static disconnectAll(): void {
    pool.disconnectAll();
  }

  static destroy(): void {
    pool.destroy();
  }
}
