/**
 * 自定义业务错误基类
 * 用于 Service 层抛出结构化错误，Route 层统一捕获并响应
 */
export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

/** 资源未找到 */
export class NotFoundError extends ServiceError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/** 数据校验失败 */
export class ValidationError extends ServiceError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

/** 状态流转非法 */
export class InvalidStateTransitionError extends ServiceError {
  constructor(from: string, to: string) {
    super(
      `Invalid state transition: ${from} → ${to}`,
      'INVALID_STATE_TRANSITION',
      400
    );
    this.name = 'InvalidStateTransitionError';
  }
}
