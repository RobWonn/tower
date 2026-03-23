import pkg from '@prisma/client';
import { normalizeCommandLookupOutput } from './process-launch.js';
const { PrismaClient } = pkg;

export const prisma = new PrismaClient();

export async function execAsync(
  command: string
): Promise<{ stdout: string; stderr: string }> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execPromise = promisify(exec);
  return execPromise(command);
}

/**
 * 查找可执行文件路径
 * 类似于 Unix 的 which 命令
 */
export async function which(command: string): Promise<string | null> {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await execAsync(`${whichCmd} ${command}`);
    return normalizeCommandLookupOutput(stdout);
  } catch {
    return null;
  }
}
