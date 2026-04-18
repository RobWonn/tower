import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/index.js';
import { SSHService, encryptPassword, decryptPassword } from '../services/ssh.service.js';
import { getIO } from '../socket/index.js';
import {
  NAMESPACE,
  ServerEvents,
  type ServerLoginUrlPayload,
  type ServerLoginOutputPayload,
  type ServerLoginDonePayload,
  type ServerStatusChangedPayload,
} from '@agent-tower/shared/socket';

export async function remoteServerRoutes(app: FastifyInstance) {
  // List all remote servers
  app.get('/remote-servers', async () => {
    const servers = await prisma.remoteServer.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return servers.map(s => ({ ...s, password: s.password ? '********' : null }));
  });

  // Get a single server
  app.get<{ Params: { id: string } }>('/remote-servers/:id', async (request, reply) => {
    const server = await prisma.remoteServer.findUnique({
      where: { id: request.params.id },
    });
    if (!server) {
      reply.code(404);
      return { error: 'Server not found' };
    }
    return { ...server, password: server.password ? '********' : null };
  });

  // Create a remote server
  app.post<{
    Body: {
      name: string;
      host: string;
      port?: number;
      username: string;
      authType?: string;
      privateKeyPath?: string;
      password?: string;
    };
  }>('/remote-servers', async (request, reply) => {
    const { name, host, port = 22, username, authType = 'key', privateKeyPath, password } = request.body;

    if (!name || !host || !username) {
      reply.code(400);
      return { error: 'name, host, and username are required' };
    }

    const server = await prisma.remoteServer.create({
      data: {
        name,
        host,
        port,
        username,
        authType,
        privateKeyPath: privateKeyPath || null,
        password: password ? encryptPassword(password) : null,
      },
    });

    return { ...server, password: server.password ? '********' : null };
  });

  // Update a remote server
  app.put<{
    Params: { id: string };
    Body: {
      name?: string;
      host?: string;
      port?: number;
      username?: string;
      authType?: string;
      privateKeyPath?: string;
      password?: string;
    };
  }>('/remote-servers/:id', async (request, reply) => {
    const existing = await prisma.remoteServer.findUnique({ where: { id: request.params.id } });
    if (!existing) {
      reply.code(404);
      return { error: 'Server not found' };
    }

    const data: Record<string, unknown> = {};
    const { name, host, port, username, authType, privateKeyPath, password } = request.body;
    if (name !== undefined) data.name = name;
    if (host !== undefined) data.host = host;
    if (port !== undefined) data.port = port;
    if (username !== undefined) data.username = username;
    if (authType !== undefined) data.authType = authType;
    if (privateKeyPath !== undefined) data.privateKeyPath = privateKeyPath || null;
    if (password !== undefined) data.password = password ? encryptPassword(password) : null;

    const server = await prisma.remoteServer.update({
      where: { id: request.params.id },
      data,
    });

    SSHService.disconnect(request.params.id);

    return { ...server, password: server.password ? '********' : null };
  });

  // Delete a remote server
  app.delete<{ Params: { id: string } }>('/remote-servers/:id', async (request, reply) => {
    const existing = await prisma.remoteServer.findUnique({ where: { id: request.params.id } });
    if (!existing) {
      reply.code(404);
      return { error: 'Server not found' };
    }

    SSHService.disconnect(request.params.id);

    await prisma.remoteServer.delete({ where: { id: request.params.id } });
    return { success: true };
  });

  // Test connection
  app.post<{ Params: { id: string } }>('/remote-servers/:id/test', async (request, reply) => {
    const server = await prisma.remoteServer.findUnique({ where: { id: request.params.id } });
    if (!server) {
      reply.code(404);
      return { error: 'Server not found' };
    }

    const result = await SSHService.testConnection({
      ...server,
      password: server.password ? decryptPassword(server.password) : null,
    });
    return result;
  });

  // Check cursor-agent status
  app.post<{ Params: { id: string } }>('/remote-servers/:id/check-agent', async (request, reply) => {
    const server = await prisma.remoteServer.findUnique({ where: { id: request.params.id } });
    if (!server) {
      reply.code(404);
      return { error: 'Server not found' };
    }

    try {
      const result = await SSHService.checkCursorAgent(request.params.id);
      emitServerStatus(request.params.id, result.installed, result.loggedIn);
      return result;
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Install cursor-agent
  app.post<{ Params: { id: string } }>('/remote-servers/:id/install-agent', async (request, reply) => {
    const server = await prisma.remoteServer.findUnique({ where: { id: request.params.id } });
    if (!server) {
      reply.code(404);
      return { error: 'Server not found' };
    }

    try {
      const output = await SSHService.installCursorAgent(request.params.id);
      const check = await SSHService.checkCursorAgent(request.params.id);
      emitServerStatus(request.params.id, check.installed, check.loggedIn);
      return { success: check.installed, output };
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Login cursor-agent on remote server (auth URL pushed via WebSocket)
  app.post<{ Params: { id: string } }>('/remote-servers/:id/login-agent', async (request, reply) => {
    const server = await prisma.remoteServer.findUnique({ where: { id: request.params.id } });
    if (!server) {
      reply.code(404);
      return { error: 'Server not found' };
    }

    reply.send({ status: 'login_started', serverId: request.params.id });

    // Run login in background and stream events via WebSocket
    (async () => {
      try {
        for await (const event of SSHService.loginCursorAgent(request.params.id)) {
          const nsp = getIO().of(NAMESPACE);
          if (event.type === 'url') {
            nsp.emit(ServerEvents.SERVER_LOGIN_URL, {
              serverId: request.params.id,
              url: event.url,
            } satisfies ServerLoginUrlPayload);
          } else if (event.type === 'output') {
            nsp.emit(ServerEvents.SERVER_LOGIN_OUTPUT, {
              serverId: request.params.id,
              data: event.data,
            } satisfies ServerLoginOutputPayload);
          } else if (event.type === 'done') {
            nsp.emit(ServerEvents.SERVER_LOGIN_DONE, {
              serverId: request.params.id,
              success: event.success,
            } satisfies ServerLoginDonePayload);
            const check = await SSHService.checkCursorAgent(request.params.id);
            emitServerStatus(request.params.id, check.installed, check.loggedIn);
          }
        }
      } catch (err) {
        const nsp = getIO().of(NAMESPACE);
        nsp.emit(ServerEvents.SERVER_LOGIN_DONE, {
          serverId: request.params.id,
          success: false,
        } satisfies ServerLoginDonePayload);
        console.error(`[RemoteServer] Login failed for ${request.params.id}:`, err);
      }
    })();
  });

  // Login cursor-agent locally
  app.post('/remote-servers/local/login-agent', async (_request, reply) => {
    reply.send({ status: 'login_started', serverId: 'local' });

    (async () => {
      try {
        for await (const event of SSHService.loginLocalCursorAgent()) {
          const nsp = getIO().of(NAMESPACE);
          if (event.type === 'url') {
            nsp.emit(ServerEvents.SERVER_LOGIN_URL, {
              serverId: 'local',
              url: event.url,
            } satisfies ServerLoginUrlPayload);
          } else if (event.type === 'output') {
            nsp.emit(ServerEvents.SERVER_LOGIN_OUTPUT, {
              serverId: 'local',
              data: event.data,
            } satisfies ServerLoginOutputPayload);
          } else if (event.type === 'done') {
            nsp.emit(ServerEvents.SERVER_LOGIN_DONE, {
              serverId: 'local',
              success: event.success,
            } satisfies ServerLoginDonePayload);
          }
        }
      } catch (err) {
        const nsp = getIO().of(NAMESPACE);
        nsp.emit(ServerEvents.SERVER_LOGIN_DONE, {
          serverId: 'local',
          success: false,
        } satisfies ServerLoginDonePayload);
        console.error('[RemoteServer] Local login failed:', err);
      }
    })();
  });

  // Browse remote filesystem (for project creation)
  app.get<{
    Params: { id: string };
    Querystring: { path?: string };
  }>('/remote-servers/:id/browse', async (request, reply) => {
    const server = await prisma.remoteServer.findUnique({ where: { id: request.params.id } });
    if (!server) {
      reply.code(404);
      return { error: 'Server not found' };
    }

    const dirPath = (request.query as { path?: string }).path || '~';
    try {
      const output = await SSHService.exec(
        request.params.id,
        `cd ${dirPath} 2>/dev/null && pwd && ls -1pA 2>/dev/null | head -200`,
      );
      const lines = output.trim().split('\n');
      const resolvedPath = lines[0];
      const entries = lines.slice(1).map(name => ({
        name: name.replace(/\/$/, ''),
        isDir: name.endsWith('/'),
      }));
      return { path: resolvedPath, entries };
    } catch (err) {
      reply.code(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}

function emitServerStatus(serverId: string, agentInstalled: boolean, agentLoggedIn: boolean): void {
  try {
    const nsp = getIO().of(NAMESPACE);
    nsp.emit(ServerEvents.SERVER_STATUS_CHANGED, {
      serverId,
      agentInstalled,
      agentLoggedIn,
    } satisfies ServerStatusChangedPayload);
  } catch { /* Socket.IO may not be initialized yet */ }
}
