/**
 * Profile CRUD API
 *
 * GET    /api/profiles                      — 获取完整 profiles
 * GET    /api/profiles/:agentType           — 获取某 agent 的所有 variant
 * PUT    /api/profiles/:agentType/:variant  — 创建/更新 variant 配置
 * DELETE /api/profiles/:agentType/:variant  — 删除用户自定义 variant
 * POST   /api/profiles/reload               — 重新加载配置
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  getProfiles,
  reloadProfiles,
  getVariantConfig,
  getVariantNames,
  setVariantConfig,
  deleteVariantConfig,
  getDefaultProfiles,
} from '../executors/index.js';

const variantConfigSchema = z.record(z.unknown());

export async function profileRoutes(app: FastifyInstance) {

  // 获取完整 profiles（合并后的）
  app.get('/profiles', async () => {
    return getProfiles();
  });

  // 获取默认 profiles（不含用户覆盖）
  app.get('/profiles/defaults', async () => {
    return getDefaultProfiles();
  });

  // 重新加载配置
  app.post('/profiles/reload', async () => {
    const profiles = reloadProfiles();
    return { success: true, profiles };
  });

  // 获取某个 agent 的所有 variant
  app.get<{ Params: { agentType: string } }>(
    '/profiles/:agentType',
    async (request, reply) => {
      const { agentType } = request.params;
      const variants = getVariantNames(agentType);

      if (variants.length === 0) {
        reply.code(404);
        return { error: `Agent type '${agentType}' not found` };
      }

      const result: Record<string, unknown> = {};
      for (const v of variants) {
        result[v] = getVariantConfig(agentType, v);
      }
      return result;
    }
  );

  // 获取某个 variant 的配置
  app.get<{ Params: { agentType: string; variant: string } }>(
    '/profiles/:agentType/:variant',
    async (request, reply) => {
      const { agentType, variant } = request.params;
      const config = getVariantConfig(agentType, variant);

      if (!config) {
        reply.code(404);
        return { error: `Variant '${variant}' not found for '${agentType}'` };
      }

      return config;
    }
  );

  // 创建/更新 variant 配置
  app.put<{ Params: { agentType: string; variant: string } }>(
    '/profiles/:agentType/:variant',
    async (request, reply) => {
      const { agentType, variant } = request.params;
      const config = variantConfigSchema.parse(request.body);

      setVariantConfig(agentType, variant, config);
      reply.code(200);
      return { success: true };
    }
  );

  // 删除 variant 配置
  app.delete<{ Params: { agentType: string; variant: string } }>(
    '/profiles/:agentType/:variant',
    async (request, reply) => {
      const { agentType, variant } = request.params;

      try {
        const deleted = deleteVariantConfig(agentType, variant);
        if (!deleted) {
          reply.code(404);
          return { error: `Variant '${variant}' not found for '${agentType}'` };
        }
        return { success: true };
      } catch (e) {
        reply.code(400);
        return { error: e instanceof Error ? e.message : 'Failed to delete variant' };
      }
    }
  );
}
