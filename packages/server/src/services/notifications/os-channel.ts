import { execFile } from 'child_process';
import { platform } from 'os';
import type { NotificationChannel, NotificationEvent } from './types.js';

export class OSNotificationChannel implements NotificationChannel {
  name = 'os';

  async send(event: NotificationEvent): Promise<void> {
    const os = platform();

    if (os === 'darwin') {
      await this.macosNotify(event.title, event.body);
    } else if (os === 'linux') {
      await this.linuxNotify(event.title, event.body);
    } else {
      console.warn(`[OSNotification] Unsupported platform: ${os}`);
    }
  }

  private macosNotify(title: string, body: string): Promise<void> {
    // 使用 execFile 避免 shell 注入，参数作为数组传递不经过 shell 解析
    const script = `display notification "${body.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}" sound name "default"`;

    return new Promise((resolve) => {
      execFile('osascript', ['-e', script], (err) => {
        if (err) console.error('[OSNotification] macOS notification failed:', err.message);
        resolve();
      });
    });
  }

  private linuxNotify(title: string, body: string): Promise<void> {
    return new Promise((resolve) => {
      execFile('notify-send', [title, body], (err) => {
        if (err) console.error('[OSNotification] Linux notification failed:', err.message);
        resolve();
      });
    });
  }
}
