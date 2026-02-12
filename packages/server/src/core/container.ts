import { EventBus } from './event-bus.js';
import { SessionManager } from '../services/session-manager.js';
// TerminalManager is lazy-imported to avoid eager native module (node-pty) loading
// that could break getEventBus()/getSessionManager() if the import fails.
import type { TerminalManager } from '../services/terminal-manager.js';

let eventBus: EventBus | null = null;
let sessionManager: SessionManager | null = null;
let terminalManager: TerminalManager | null = null;

export function getEventBus(): EventBus {
  if (!eventBus) {
    eventBus = new EventBus();
  }
  return eventBus;
}

export function getSessionManager(): SessionManager {
  if (!sessionManager) {
    sessionManager = new SessionManager(getEventBus());
  }
  return sessionManager;
}

export async function getTerminalManager(): Promise<TerminalManager> {
  if (!terminalManager) {
    const { TerminalManager: TM } = await import('../services/terminal-manager.js');
    terminalManager = new TM(getEventBus());
  }
  return terminalManager;
}
