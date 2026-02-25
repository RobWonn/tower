export interface NotificationEvent {
  type: 'task_in_review' | 'task_failed';
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationChannel {
  name: string;
  send(event: NotificationEvent): Promise<void>;
}
