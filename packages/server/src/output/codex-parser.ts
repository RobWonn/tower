/**
 * Codex JSON 输出解析器
 * 将 Codex 的 JSONL 输出转换为标准化日志
 */

import type { MsgStore } from './msg-store.js';

const DEBUG_PARSER = process.env.DEBUG_PARSER === 'true';

import {
  createAssistantMessage,
  createToolUse,
  createTokenUsageInfo,
} from './types.js';

import {
  EntryIndexProvider,
  addNormalizedEntry,
  updateEntryContent,
  updateToolStatus,
  setSessionId,
} from './utils/patch.js';

import { stripAnsiSequences } from './utils/ansi.js';

/**
 * Codex 事件类型
 */
interface CodexEvent {
  type: string;
  thread_id?: string;
  item?: {
    id: string;
    type: string;
    text?: string;
    command?: string;
    aggregated_output?: string;
    exit_code?: number | null;
    status?: string;
  };
  usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
  };
}

/**
 * Codex 解析器
 */
export class CodexParser {
  private msgStore: MsgStore;
  private buffer = '';
  private currentToolUseId: string | null = null;
  private currentToolIndex: number | null = null;
  private toolOutputBuffer = '';

  constructor(msgStore: MsgStore) {
    this.msgStore = msgStore;
  }

  private get indexProvider() {
    return this.msgStore.entryIndex;
  }

  /**
   * 处理数据流
   */
  processData(data: string): void {
    this.buffer += data;

    // 按行分割
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 跳过非 JSON 行（如 ERROR 日志）
      if (!trimmed.startsWith('{')) {
        if (DEBUG_PARSER) {
          console.log('[CodexParser] Skipping non-JSON line:', trimmed.substring(0, 100));
        }
        continue;
      }

      this.parseLine(trimmed);
    }
  }

  /**
   * 解析单行 JSON
   */
  private parseLine(line: string): void {
    try {
      const event: CodexEvent = JSON.parse(line);
      this.handleEvent(event);
    } catch (err) {
      if (DEBUG_PARSER) {
        console.error('[CodexParser] Failed to parse JSON:', line.substring(0, 200), err);
      }
    }
  }

  /**
   * 处理事件
   */
  private handleEvent(event: CodexEvent): void {
    if (DEBUG_PARSER) {
      console.log('[CodexParser] Event:', event.type, event);
    }

    switch (event.type) {
      case 'thread.started':
        if (event.thread_id) {
          this.msgStore.pushSessionId(event.thread_id);
          const patch = setSessionId(event.thread_id);
          this.msgStore.pushPatch(patch);
        }
        break;

      case 'item.completed':
        this.handleItemCompleted(event);
        break;

      case 'item.started':
        this.handleItemStarted(event);
        break;

      case 'turn.completed':
        if (event.usage) {
          this.handleUsage(event.usage);
        }
        break;
    }
  }

  /**
   * 处理 item.started 事件
   */
  private handleItemStarted(event: CodexEvent): void {
    const item = event.item;
    if (!item) return;

    if (item.type === 'command_execution' && item.command) {
      // 创建工具使用记录
      const toolUse = createToolUse(
        'bash',
        item.command,
        'command_run',
        undefined,
        item.id
      );
      const index = this.indexProvider.next();
      const patch = addNormalizedEntry(index, toolUse);
      this.msgStore.pushPatch(patch);
      this.currentToolUseId = item.id;
      this.currentToolIndex = index;
      this.toolOutputBuffer = '';
    }
  }

  /**
   * 处理 item.completed 事件
   */
  private handleItemCompleted(event: CodexEvent): void {
    const item = event.item;
    if (!item) return;

    if (item.type === 'agent_message' && item.text) {
      // Agent 消息
      const cleanText = stripAnsiSequences(item.text);
      const message = createAssistantMessage(cleanText);
      const index = this.indexProvider.next();
      const patch = addNormalizedEntry(index, message);
      this.msgStore.pushPatch(patch);
    } else if (item.type === 'command_execution') {
      // 命令执行完成
      if (this.currentToolUseId === item.id && this.currentToolIndex !== null) {
        const status = item.exit_code === 0 ? 'success' : 'failed';
        const patch = updateToolStatus(this.currentToolIndex, status);
        this.msgStore.pushPatch(patch);

        this.currentToolUseId = null;
        this.currentToolIndex = null;
        this.toolOutputBuffer = '';
      }
    }
  }

  /**
   * 处理 token 使用信息
   */
  private handleUsage(usage: CodexEvent['usage']): void {
    if (!usage) return;

    // 计算总 token 数：input_tokens + output_tokens
    // 注意：cached_input_tokens 是 input_tokens 的一部分，不应该额外相加
    const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);

    const tokenUsage = createTokenUsageInfo(totalTokens);

    const index = this.indexProvider.next();
    const patch = addNormalizedEntry(index, tokenUsage);
    this.msgStore.pushPatch(patch);
  }

  /**
   * 完成解析
   */
  finish(): void {
    if (this.buffer.trim()) {
      this.parseLine(this.buffer);
    }
  }
}

/**
 * 创建 Codex 解析器
 */
export function createCodexParser(msgStore: MsgStore): CodexParser {
  return new CodexParser(msgStore);
}
