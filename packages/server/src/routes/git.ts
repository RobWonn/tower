import type { FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';
import { execFile } from 'node:child_process';
import * as path from 'node:path';

function handleError(error: unknown, reply: any) {
  if (error instanceof ZodError) {
    reply.code(400);
    return { error: 'Validation failed', code: 'VALIDATION_ERROR', details: error.errors };
  }

  reply.code(500);
  return { error: 'Internal server error', code: 'INTERNAL_ERROR' };
}

/** execFile promisified with timeout */
function execGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 10_000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        // git diff returns exit code 1 when there are differences — that's fine
        if (stdout !== undefined && stdout !== '') {
          resolve(stdout);
          return;
        }
        reject(err);
        return;
      }
      resolve(stdout);
    });
  });
}

type ChangeEntry = { status: string; path: string };

function parseNameStatus(output: string): ChangeEntry[] {
  if (!output.trim()) return [];
  return output
    .trim()
    .split('\n')
    .map((line) => {
      // Format: "M\tpath" or "R100\told\tnew"
      const parts = line.split('\t');
      if (parts.length < 2) return null;
      const rawStatus = parts[0]!;
      // Normalize rename status (R100 -> R)
      const status = rawStatus.startsWith('R') ? 'R' : rawStatus;
      const filePath = parts.length >= 3 ? parts[2]! : parts[1]!;
      return { status, path: filePath };
    })
    .filter((entry): entry is ChangeEntry => entry !== null);
}

const changesQuerySchema = z.object({
  workingDir: z
    .string()
    .min(1, 'workingDir is required')
    .refine((v) => path.isAbsolute(v), { message: 'workingDir must be absolute' })
    .refine((v) => !v.split(path.sep).includes('..'), {
      message: 'Path traversal (..) is not allowed',
    }),
});

const diffQuerySchema = z.object({
  workingDir: z
    .string()
    .min(1, 'workingDir is required')
    .refine((v) => path.isAbsolute(v), { message: 'workingDir must be absolute' })
    .refine((v) => !v.split(path.sep).includes('..'), {
      message: 'Path traversal (..) is not allowed',
    }),
  path: z
    .string()
    .min(1, 'path is required')
    .refine((v) => !v.split('/').includes('..'), {
      message: 'Path traversal (..) is not allowed',
    }),
  type: z.enum(['uncommitted', 'committed']),
});

export async function gitRoutes(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    return handleError(error, reply);
  });

  /**
   * GET /changes?workingDir=/path/to/worktree
   * Returns uncommitted and committed changes relative to main.
   */
  app.get('/changes', async (request, reply) => {
    try {
      const { workingDir } = changesQuerySchema.parse(request.query);

      // Uncommitted changes (staged + unstaged vs HEAD)
      let uncommitted: ChangeEntry[] = [];
      try {
        const output = await execGit(workingDir, ['diff', '--name-status', 'HEAD']);
        uncommitted = parseNameStatus(output);
      } catch {
        // If HEAD doesn't exist (initial commit), try against empty tree
        try {
          const output = await execGit(workingDir, ['diff', '--name-status']);
          uncommitted = parseNameStatus(output);
        } catch {
          // ignore
        }
      }

      // Also include untracked files
      try {
        const untrackedOutput = await execGit(workingDir, [
          'ls-files', '--others', '--exclude-standard',
        ]);
        if (untrackedOutput.trim()) {
          const untrackedFiles = untrackedOutput.trim().split('\n');
          for (const f of untrackedFiles) {
            uncommitted.push({ status: 'A', path: f });
          }
        }
      } catch {
        // ignore
      }

      // Committed changes (main...HEAD)
      let committed: ChangeEntry[] = [];
      try {
        const output = await execGit(workingDir, ['diff', '--name-status', 'main...HEAD']);
        committed = parseNameStatus(output);
      } catch {
        // main branch might not exist — try origin/main
        try {
          const output = await execGit(workingDir, ['diff', '--name-status', 'origin/main...HEAD']);
          committed = parseNameStatus(output);
        } catch {
          // ignore — no main branch to compare against
        }
      }

      return { uncommitted, committed };
    } catch (error) {
      return handleError(error, reply);
    }
  });

  /**
   * GET /diff?workingDir=/path&path=src/index.ts&type=uncommitted|committed
   * Returns the diff content for a single file.
   */
  app.get('/diff', async (request, reply) => {
    try {
      const { workingDir, path: filePath, type } = diffQuerySchema.parse(request.query);

      let diff = '';
      try {
        if (type === 'uncommitted') {
          diff = await execGit(workingDir, ['diff', '--', filePath]);
          // If no staged/unstaged diff, the file might be untracked — show full content as addition
          if (!diff.trim()) {
            diff = await execGit(workingDir, ['diff', '--no-index', '/dev/null', filePath]).catch(
              () => '',
            );
          }
        } else {
          diff = await execGit(workingDir, ['diff', 'main...HEAD', '--', filePath]);
          if (!diff.trim()) {
            diff = await execGit(workingDir, ['diff', 'origin/main...HEAD', '--', filePath]).catch(
              () => '',
            );
          }
        }
      } catch {
        // ignore — return empty diff
      }

      return { diff };
    } catch (error) {
      return handleError(error, reply);
    }
  });
}
