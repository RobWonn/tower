import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AgentType } from '../types/index.js';
import { getExecutor, getAllExecutorsAvailability, ExecutionEnv } from '../executors/index.js';
import { getProcessManager } from '../socket/index.js';

const startDemoSchema = z.object({
  agentType: z.nativeEnum(AgentType),
  prompt: z.string().min(1),
  workingDir: z.string().optional(),
});

const sendMessageSchema = z.object({
  message: z.string().min(1),
});

// 简单的内存存储，用于 MVP 演示
const demoSessions = new Map<string, { agentType: AgentType; status: string }>();

export async function demoRoutes(app: FastifyInstance) {
  // 快速启动 demo 会话（跳过 workspace/task 创建）
  app.post('/demo/start', async (request, reply) => {
    const body = startDemoSchema.parse(request.body);

    const executor = getExecutor(body.agentType);
    if (!executor) {
      reply.code(400);
      return { error: `Unsupported agent type: ${body.agentType}` };
    }

    // 检查可用性
    const availability = await executor.getAvailabilityInfo();
    if (availability.type === 'NOT_FOUND') {
      reply.code(400);
      return { error: `Agent not available: ${availability.error || 'Not installed'}` };
    }

    // 生成简单的 session ID
    const sessionId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      const workingDir = body.workingDir || process.cwd();
      const env = ExecutionEnv.default(workingDir);

      const spawnResult = await executor.spawn({
        workingDir,
        prompt: body.prompt,
        env,
      });

      // 使用共享的 ProcessManager，这样 Socket.IO 可以正确推送输出
      const processManager = getProcessManager();
      processManager.track(sessionId, spawnResult.pty);
      demoSessions.set(sessionId, {
        agentType: body.agentType,
        status: 'running',
      });

      reply.code(201);
      return {
        sessionId,
        agentType: body.agentType,
        status: 'running',
        pid: spawnResult.pid,
      };
    } catch (error) {
      reply.code(500);
      return {
        error: 'Failed to start agent',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // 发送消息到 demo 会话
  app.post<{ Params: { sessionId: string } }>(
    '/demo/:sessionId/message',
    async (request, reply) => {
      const { sessionId } = request.params;
      const body = sendMessageSchema.parse(request.body);

      const session = demoSessions.get(sessionId);
      if (!session) {
        reply.code(404);
        return { error: 'Session not found' };
      }

      const processManager = getProcessManager();
      processManager.write(sessionId, body.message);
      return { success: true };
    }
  );

  // 停止 demo 会话
  app.post<{ Params: { sessionId: string } }>(
    '/demo/:sessionId/stop',
    async (request, reply) => {
      const { sessionId } = request.params;

      const session = demoSessions.get(sessionId);
      if (!session) {
        reply.code(404);
        return { error: 'Session not found' };
      }

      const processManager = getProcessManager();
      processManager.kill(sessionId);
      demoSessions.set(sessionId, { ...session, status: 'stopped' });

      return { success: true };
    }
  );

  // 获取可用的 agent 列表（带实际可用性检查）
  app.get('/demo/agents', async () => {
    const executorsInfo = await getAllExecutorsAvailability();

    const agents = executorsInfo.map(info => ({
      type: info.agentType,
      name: info.displayName,
      available: info.availability.type !== 'NOT_FOUND',
      availabilityType: info.availability.type,
      lastAuthTimestamp: info.availability.type === 'LOGIN_DETECTED'
        ? info.availability.lastAuthTimestamp
        : undefined,
      error: info.availability.type === 'NOT_FOUND'
        ? (info.availability as { error?: string }).error
        : undefined,
    }));

    return { agents };
  });
}
