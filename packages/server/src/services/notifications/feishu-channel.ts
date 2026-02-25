import type { NotificationChannel, NotificationEvent } from './types.js';

export class FeishuChannel implements NotificationChannel {
  name = 'feishu';

  constructor(
    private webhookUrl: string,
    private baseUrl?: string,
  ) {}

  async send(event: NotificationEvent): Promise<void> {
    const card: Record<string, unknown> = {
      msg_type: 'interactive',
      card: {
        header: {
          title: { tag: 'plain_text', content: event.title },
          template: event.type === 'task_failed' ? 'red' : 'green',
        },
        elements: [
          {
            tag: 'div',
            text: { tag: 'lark_md', content: event.body },
          },
        ],
      },
    };

    // 如果配置了 baseUrl 且有 taskId，添加跳转按钮
    if (this.baseUrl && event.metadata?.taskId) {
      const taskUrl = `${this.baseUrl.replace(/\/$/, '')}/projects/${event.metadata.projectId}/tasks/${event.metadata.taskId}`;
      const cardObj = card.card as { elements: Record<string, unknown>[] };
      cardObj.elements.push({
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '查看任务' },
            url: taskUrl,
            type: 'primary',
          },
        ],
      });
    }

    const res = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });

    if (!res.ok) {
      throw new Error(`Feishu webhook failed: ${res.status} ${await res.text()}`);
    }
  }
}
