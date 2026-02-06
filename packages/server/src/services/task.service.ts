import { prisma } from '../utils/index.js';
import { TaskStatus } from '../types/index.js';
import {
  NotFoundError,
  ValidationError,
  InvalidStateTransitionError,
} from '../errors.js';

interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: number;
}

interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: number;
}

interface FindTasksParams {
  status?: TaskStatus;
  page?: number;
  limit?: number;
}

/**
 * 合法的状态流转规则
 * - TODO → IN_PROGRESS
 * - IN_PROGRESS → IN_REVIEW | TODO (允许回退到 TODO)
 * - IN_REVIEW → DONE | IN_PROGRESS (允许打回)
 * - DONE → IN_PROGRESS (允许重新打开)
 */
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.IN_REVIEW, TaskStatus.TODO],
  [TaskStatus.IN_REVIEW]: [TaskStatus.DONE, TaskStatus.IN_PROGRESS],
  [TaskStatus.DONE]: [TaskStatus.IN_PROGRESS],
};

export class TaskService {
  /**
   * 获取项目的任务列表（支持按状态过滤和分页）
   */
  async findByProjectId(projectId: string, params: FindTasksParams = {}) {
    // 校验项目存在
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundError('Project', projectId);
    }

    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 50));
    const skip = (page - 1) * limit;

    const where: any = { projectId };
    if (params.status) {
      where.status = params.status;
    }

    const [data, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: { workspaces: true },
        orderBy: [{ status: 'asc' }, { position: 'asc' }],
        skip,
        take: limit,
      }),
      prisma.task.count({ where }),
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
   * 获取任务详情
   */
  async findById(id: string) {
    const task = await prisma.task.findUnique({
      where: { id },
      include: { workspaces: { include: { sessions: true } } },
    });

    if (!task) {
      throw new NotFoundError('Task', id);
    }

    return task;
  }

  /**
   * 创建任务
   * - 校验项目存在
   * - 自动计算 position（同状态下最大 position + 1）
   */
  async create(projectId: string, input: CreateTaskInput) {
    // 校验项目存在
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundError('Project', projectId);
    }

    // 自动计算 position
    const maxPosition = await prisma.task.aggregate({
      where: { projectId, status: TaskStatus.TODO },
      _max: { position: true },
    });

    return prisma.task.create({
      data: {
        title: input.title,
        description: input.description,
        priority: input.priority ?? 0,
        position: (maxPosition._max.position ?? 0) + 1,
        projectId,
      },
    });
  }

  /**
   * 更新任务基本信息
   */
  async update(id: string, input: UpdateTaskInput) {
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundError('Task', id);
    }

    return prisma.task.update({
      where: { id },
      data: input,
    });
  }

  /**
   * 更新任务状态（含状态流转校验）
   */
  async updateStatus(id: string, status: TaskStatus) {
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundError('Task', id);
    }

    const currentStatus = task.status as TaskStatus;

    // 如果状态没有变化，直接返回
    if (currentStatus === status) {
      return task;
    }

    // 校验状态流转是否合法
    const allowedTransitions = VALID_TRANSITIONS[currentStatus];
    if (!allowedTransitions || !allowedTransitions.includes(status)) {
      throw new InvalidStateTransitionError(currentStatus, status);
    }

    // 切换状态时自动计算新列的 position
    const maxPosition = await prisma.task.aggregate({
      where: { projectId: task.projectId, status },
      _max: { position: true },
    });

    return prisma.task.update({
      where: { id },
      data: {
        status,
        position: (maxPosition._max.position ?? 0) + 1,
      },
    });
  }

  /**
   * 更新任务位置（用于拖拽排序）
   */
  async updatePosition(id: string, position: number, status?: TaskStatus) {
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundError('Task', id);
    }

    // 如果同时传了 status，进行状态流转校验
    if (status && status !== task.status) {
      const currentStatus = task.status as TaskStatus;
      const allowedTransitions = VALID_TRANSITIONS[currentStatus];
      if (!allowedTransitions || !allowedTransitions.includes(status)) {
        throw new InvalidStateTransitionError(currentStatus, status);
      }
    }

    return prisma.task.update({
      where: { id },
      data: { position, ...(status && { status }) },
    });
  }

  /**
   * 删除任务
   * Prisma schema 中已配置 onDelete: Cascade，
   * 删除任务会自动级联删除关联的 Workspace 和 Session
   */
  async delete(id: string) {
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundError('Task', id);
    }

    await prisma.task.delete({ where: { id } });
    return true;
  }

  /**
   * 获取项目的任务统计
   */
  async getStatsByProjectId(projectId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundError('Project', projectId);
    }

    const counts = await prisma.task.groupBy({
      by: ['status'],
      where: { projectId },
      _count: { id: true },
    });

    const stats = {
      total: 0,
      todo: 0,
      inProgress: 0,
      inReview: 0,
      done: 0,
    };

    for (const row of counts) {
      const count = row._count.id;
      stats.total += count;
      switch (row.status) {
        case TaskStatus.TODO:
          stats.todo = count;
          break;
        case TaskStatus.IN_PROGRESS:
          stats.inProgress = count;
          break;
        case TaskStatus.IN_REVIEW:
          stats.inReview = count;
          break;
        case TaskStatus.DONE:
          stats.done = count;
          break;
      }
    }

    return stats;
  }
}
