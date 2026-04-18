import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ClashService } from '../services/clash.service.js';

export async function clashRoutes(app: FastifyInstance) {
  // Status: is clash installed + running?
  app.get('/clash/status', async () => {
    return ClashService.getStatus();
  });

  // Start mihomo
  app.post('/clash/start', async () => {
    return { result: ClashService.start() };
  });

  // Stop mihomo
  app.post('/clash/stop', async () => {
    return { result: ClashService.stop() };
  });

  // Restart (merge config + restart)
  app.post('/clash/restart', async () => {
    ClashService.mergeConfigRestart();
    return { result: 'restarted' };
  });

  // List subscriptions
  app.get('/clash/subscriptions', async () => {
    return ClashService.listSubscriptions();
  });

  // Add subscription
  app.post('/clash/subscriptions', async (request, reply) => {
    const { url } = z.object({ url: z.string().url() }).parse(request.body);
    try {
      const result = ClashService.addSubscription(url);
      return result;
    } catch (e: any) {
      reply.code(400);
      return { error: e.message };
    }
  });

  // Delete subscription
  app.delete<{ Params: { id: string } }>('/clash/subscriptions/:id', async (request) => {
    ClashService.deleteSubscription(parseInt(request.params.id, 10));
    return { success: true };
  });

  // Use (activate) subscription
  app.post<{ Params: { id: string } }>('/clash/subscriptions/:id/use', async (request, reply) => {
    try {
      ClashService.useSubscription(parseInt(request.params.id, 10));
      return { success: true };
    } catch (e: any) {
      reply.code(400);
      return { error: e.message };
    }
  });

  // Update subscription from URL
  app.post('/clash/subscriptions/update', async (request, reply) => {
    const { id } = z.object({ id: z.number().optional() }).parse(request.body || {});
    try {
      ClashService.updateSubscription(id);
      return { success: true };
    } catch (e: any) {
      reply.code(400);
      return { error: e.message };
    }
  });

  // Proxy groups (from mihomo API)
  app.get('/clash/groups', async () => {
    return ClashService.getProxyGroups();
  });

  // Proxy nodes
  app.get('/clash/nodes', async () => {
    return ClashService.getProxyNodes();
  });

  // Switch node in a group
  app.post('/clash/switch', async (request, reply) => {
    const { group, node } = z.object({ group: z.string(), node: z.string() }).parse(request.body);
    try {
      await ClashService.switchNode(group, node);
      return { success: true };
    } catch (e: any) {
      reply.code(400);
      return { error: e.message };
    }
  });

  // Test connectivity
  app.post('/clash/test', async () => {
    return ClashService.testConnectivity();
  });
}
