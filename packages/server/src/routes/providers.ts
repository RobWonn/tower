/**
 * Provider CRUD API
 *
 * GET    /api/providers                — 获取所有 providers（带可用性检查）
 * GET    /api/providers/backup         — 导出 Provider 备份（仅用户层配置）
 * POST   /api/providers/import/preview — 预览导入结果
 * POST   /api/providers/import         — 执行导入
 * GET    /api/providers/:id            — 获取单个 provider 详情
 * POST   /api/providers                — 创建 provider
 * PUT    /api/providers/:id            — 更新 provider
 * DELETE /api/providers/:id            — 删除 provider
 * POST   /api/providers/reload         — 重新加载配置
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getProviderById,
  createProviderBackup,
  previewProviderImport,
  importProvidersFromBackup,
  createProvider,
  updateProvider,
  deleteProvider,
  reloadProviders,
  getAllProvidersAvailability,
} from '../executors/index.js';
import { AgentType } from '../types/index.js';

const createProviderSchema = z.object({
  name: z.string().min(1),
  agentType: z.nativeEnum(AgentType),
  env: z.record(z.string()).default({}),
  config: z.record(z.unknown()).default({}),
  settings: z.string().optional(),
  isDefault: z.boolean().default(false),
});

const updateProviderSchema = z.object({
  name: z.string().min(1).optional(),
  env: z.record(z.string()).optional(),
  config: z.record(z.unknown()).optional(),
  settings: z.string().optional(),
  isDefault: z.boolean().optional(),
});

const backupProviderSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  agentType: z.nativeEnum(AgentType),
  env: z.record(z.string()).default({}),
  config: z.record(z.unknown()).default({}),
  settings: z.string().optional(),
  isDefault: z.boolean().default(false),
  createdAt: z.string().optional(),
});

const providerBackupSchema = z.object({
  version: z.literal(1),
  kind: z.literal('provider-backup'),
  exportedAt: z.string().min(1),
  mode: z.literal('full'),
  providers: z.array(backupProviderSchema),
}).superRefine((backup, ctx) => {
  const seenIds = new Set<string>();

  backup.providers.forEach((provider, index) => {
    if (seenIds.has(provider.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate provider id in backup: ${provider.id}`,
        path: ['providers', index, 'id'],
      });
      return;
    }
    seenIds.add(provider.id);
  });
});

function parseBackupPayload(body: unknown) {
  const result = providerBackupSchema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? 'Invalid provider backup payload';
    throw new Error(message);
  }
  return result.data;
}

export async function providerRoutes(app: FastifyInstance) {
  // 获取所有 providers（带可用性检查）
  app.get('/providers', async () => {
    const providersWithAvailability = await getAllProvidersAvailability();
    return providersWithAvailability;
  });

  // 导出 Provider 备份（仅用户层配置）
  app.get('/providers/backup', async () => {
    return createProviderBackup();
  });

  // 预览导入结果
  app.post('/providers/import/preview', async (request, reply) => {
    try {
      const backup = parseBackupPayload(request.body);
      return previewProviderImport(backup);
    } catch (e) {
      reply.code(400);
      return { message: e instanceof Error ? e.message : 'Failed to preview provider import' };
    }
  });

  // 执行导入
  app.post('/providers/import', async (request, reply) => {
    try {
      const backup = parseBackupPayload(request.body);
      return importProvidersFromBackup(backup);
    } catch (e) {
      reply.code(400);
      return { message: e instanceof Error ? e.message : 'Failed to import providers' };
    }
  });

  // 获取单个 provider 详情
  app.get<{ Params: { id: string } }>(
    '/providers/:id',
    async (request, reply) => {
      const provider = getProviderById(request.params.id);
      if (!provider) {
        reply.code(404);
        return { error: `Provider not found: ${request.params.id}` };
      }
      return provider;
    }
  );

  // 创建 provider
  app.post('/providers', async (request, reply) => {
    const body = createProviderSchema.parse(request.body);
    try {
      const provider = createProvider(body);
      reply.code(201);
      return provider;
    } catch (e) {
      reply.code(400);
      return { error: e instanceof Error ? e.message : 'Failed to create provider' };
    }
  });

  // 更新 provider
  app.put<{ Params: { id: string } }>(
    '/providers/:id',
    async (request, reply) => {
      const body = updateProviderSchema.parse(request.body);
      try {
        const provider = updateProvider(request.params.id, body);
        return provider;
      } catch (e) {
        reply.code(400);
        return { error: e instanceof Error ? e.message : 'Failed to update provider' };
      }
    }
  );

  // 删除 provider
  app.delete<{ Params: { id: string } }>(
    '/providers/:id',
    async (request, reply) => {
      try {
        const deleted = deleteProvider(request.params.id);
        if (!deleted) {
          reply.code(404);
          return { error: `Provider not found: ${request.params.id}` };
        }
        return { success: true };
      } catch (e) {
        reply.code(400);
        return { error: e instanceof Error ? e.message : 'Failed to delete provider' };
      }
    }
  );

  // 重新加载配置
  app.post('/providers/reload', async () => {
    const providers = reloadProviders();
    return { success: true, providers };
  });
}
