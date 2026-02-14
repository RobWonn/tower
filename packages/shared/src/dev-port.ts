/**
 * 确定性端口计算工具
 * 基于工作目录路径 hash 生成固定端口号，解决 worktree 多分支并行开发端口冲突问题。
 */

const PORT_MIN = 10000
const PORT_MAX = 49151

/**
 * FNV-1a hash（32-bit）
 * 纯整数运算，分布均匀，无需 crypto 模块。
 */
function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash
}

/**
 * 根据目录路径计算确定性端口号。
 *
 * @param dirPath - 工作目录的绝对路径（通常传入 monorepo 根目录）
 * @returns 端口号（10000-49151）
 */
export function getDevPort(dirPath: string): number {
  if (!dirPath) return PORT_MIN
  const hash = fnv1aHash(dirPath)
  return PORT_MIN + (hash % (PORT_MAX - PORT_MIN + 1))
}
