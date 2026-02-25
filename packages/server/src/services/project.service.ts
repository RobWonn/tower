import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../utils/index.js';
import { NotFoundError, ValidationError } from '../errors.js';
import { TaskStatus } from '../types/index.js';

interface CreateProjectInput {
  name: string;
  description?: string;
  repoPath: string;
  mainBranch?: string;
  copyFiles?: string;
  setupScript?: string;
  quickCommands?: string;
}

interface UpdateProjectInput {
  name?: string;
  description?: string;
  mainBranch?: string;
  copyFiles?: string | null;
  setupScript?: string | null;
  quickCommands?: string | null;
}

interface PaginationParams {
  page?: number;
  limit?: number;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** 各状态的任务数量统计 */
interface TaskStats {
  total: number;
  todo: number;
  inProgress: number;
  inReview: number;
  done: number;
}

export class ProjectService {
  /**
   * 获取项目列表（支持分页）
   */
  async findAll(params: PaginationParams = {}): Promise<PaginatedResult<any>> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.project.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.project.count(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 根据 ID 查询项目详情，包含任务统计
   */
  async findById(id: string) {
    const project = await prisma.project.findUnique({
      where: { id },
      include: { tasks: true },
    });

    if (!project) {
      throw new NotFoundError('Project', id);
    }

    // 计算各状态的任务数量
    const taskStats: TaskStats = {
      total: project.tasks.length,
      todo: 0,
      inProgress: 0,
      inReview: 0,
      done: 0,
    };

    for (const task of project.tasks) {
      switch (task.status) {
        case TaskStatus.TODO:
          taskStats.todo++;
          break;
        case TaskStatus.IN_PROGRESS:
          taskStats.inProgress++;
          break;
        case TaskStatus.IN_REVIEW:
          taskStats.inReview++;
          break;
        case TaskStatus.DONE:
          taskStats.done++;
          break;
      }
    }

    return { ...project, taskStats };
  }

  /**
   * 创建项目
   * - 校验 repoPath 是否存在且为有效的 Git 仓库
   */
  async create(input: CreateProjectInput) {
    // 校验 repoPath 是否存在
    const resolvedPath = path.resolve(input.repoPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new ValidationError(
        `repoPath does not exist: ${resolvedPath}`
      );
    }

    // 校验是否是目录
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      throw new ValidationError(
        `repoPath is not a directory: ${resolvedPath}`
      );
    }

    // 校验是否是有效的 Git 仓库（检查 .git 目录或 .git 文件）
    const gitPath = path.join(resolvedPath, '.git');
    if (!fs.existsSync(gitPath)) {
      throw new ValidationError(
        `repoPath is not a valid Git repository (no .git found): ${resolvedPath}`
      );
    }

    // 检查同名项目
    const existing = await prisma.project.findFirst({
      where: { name: input.name },
    });
    if (existing) {
      throw new ValidationError(
        `A project with name "${input.name}" already exists`
      );
    }

    return prisma.project.create({
      data: {
        name: input.name,
        description: input.description,
        repoPath: resolvedPath,
        mainBranch: input.mainBranch || 'main',
        copyFiles: input.copyFiles,
        setupScript: input.setupScript,
        quickCommands: input.quickCommands,
      },
    });
  }

  /**
   * 更新项目
   */
  async update(id: string, input: UpdateProjectInput) {
    // 先确认项目存在
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundError('Project', id);
    }

    // 若更新名称，检查同名
    if (input.name && input.name !== project.name) {
      const existing = await prisma.project.findFirst({
        where: { name: input.name },
      });
      if (existing) {
        throw new ValidationError(
          `A project with name "${input.name}" already exists`
        );
      }
    }

    return prisma.project.update({
      where: { id },
      data: input,
    });
  }

  /**
   * 删除项目（级联删除关联的 Tasks / Workspaces / Sessions）
   */
  async delete(id: string) {
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundError('Project', id);
    }

    await prisma.project.delete({ where: { id } });
    return true;
  }
}
