import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ClashService } from '../services/clash.service.js';
import { RemoteClashService } from '../services/remote-clash.service.js';

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

  // ─── Remote Clash Management ─────────────────────────────────────────────────

  const serverIdParam = z.object({ serverId: z.string().min(1) });

  app.get<{ Params: { serverId: string } }>('/remote-servers/:serverId/clash/status', async (request) => {
    const { serverId } = serverIdParam.parse(request.params);
    return RemoteClashService.getStatus(serverId);
  });

  app.post<{ Params: { serverId: string } }>('/remote-servers/:serverId/clash/install', async (request, reply) => {
    const { serverId } = serverIdParam.parse(request.params);
    const { subscriptionUrl } = z.object({ subscriptionUrl: z.string().optional() }).parse(request.body || {});
    try {
      return await RemoteClashService.install(serverId);
    } catch (e: any) {
      reply.code(500);
      return { success: false, message: e.message };
    }
  });

  app.post<{ Params: { serverId: string } }>('/remote-servers/:serverId/clash/full-setup', async (request, reply) => {
    const { serverId } = serverIdParam.parse(request.params);
    const { subscriptionUrl } = z.object({ subscriptionUrl: z.string().url() }).parse(request.body);
    try {
      return await RemoteClashService.fullSetup(serverId, subscriptionUrl);
    } catch (e: any) {
      reply.code(500);
      return { success: false, message: e.message };
    }
  });

  app.post<{ Params: { serverId: string } }>('/remote-servers/:serverId/clash/start', async (request) => {
    const { serverId } = serverIdParam.parse(request.params);
    return { result: await RemoteClashService.start(serverId) };
  });

  app.post<{ Params: { serverId: string } }>('/remote-servers/:serverId/clash/stop', async (request) => {
    const { serverId } = serverIdParam.parse(request.params);
    return { result: await RemoteClashService.stop(serverId) };
  });

  app.post<{ Params: { serverId: string } }>('/remote-servers/:serverId/clash/restart', async (request) => {
    const { serverId } = serverIdParam.parse(request.params);
    return { result: await RemoteClashService.restart(serverId) };
  });

  app.get<{ Params: { serverId: string } }>('/remote-servers/:serverId/clash/subscriptions', async (request) => {
    const { serverId } = serverIdParam.parse(request.params);
    return RemoteClashService.listSubscriptions(serverId);
  });

  app.post<{ Params: { serverId: string } }>('/remote-servers/:serverId/clash/subscriptions', async (request, reply) => {
    const { serverId } = serverIdParam.parse(request.params);
    const { url } = z.object({ url: z.string().url() }).parse(request.body);
    try {
      return await RemoteClashService.addSubscription(serverId, url);
    } catch (e: any) {
      reply.code(400);
      return { error: e.message };
    }
  });

  app.post<{ Params: { serverId: string; id: string } }>('/remote-servers/:serverId/clash/subscriptions/:id/use', async (request, reply) => {
    const { serverId } = serverIdParam.parse(request.params);
    try {
      await RemoteClashService.useSubscription(serverId, parseInt(request.params.id, 10));
      return { success: true };
    } catch (e: any) {
      reply.code(400);
      return { error: e.message };
    }
  });

  app.post<{ Params: { serverId: string } }>('/remote-servers/:serverId/clash/tun', async (request) => {
    const { serverId } = serverIdParam.parse(request.params);
    const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
    await RemoteClashService.setTunEnabled(serverId, enabled);
    return { success: true };
  });

  app.post<{ Params: { serverId: string } }>('/remote-servers/:serverId/clash/test', async (request) => {
    const { serverId } = serverIdParam.parse(request.params);
    return RemoteClashService.testConnectivity(serverId);
  });
}
