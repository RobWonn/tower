import path from 'path';
import { fileURLToPath } from 'url';
import { buildApp } from './app.js';
import { getDevPort } from '@agent-tower/shared/dev-port';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, '../../..');
const PORT = getDevPort(monorepoRoot);

async function main() {
  const app = await buildApp();

  // 优雅关闭处理
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    try {
      await app.close();
      console.log('Server closed');
      // 等待 OS 释放端口
      await new Promise((resolve) => setTimeout(resolve, 200));
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server is running on http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
