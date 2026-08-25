import type { ChatMessage, Conversation } from '../../../core/types';

export const MIMO_TRANSCRIPT_VERSION = 1;

export interface MimoTranscriptFile {
  version: number;
  conversationId: string;
  messages: ChatMessage[];
}

export function sanitizeTranscriptPathSegment(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._-]/g, '_');
  return sanitized.length > 0 ? sanitized : 'unknown';
}

export function buildMimoTranscriptPath(
  configDir: string,
  pluginId: string,
  conversationId: string,
): string {
  const safeConfigDir = configDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const safePluginId = sanitizeTranscriptPathSegment(pluginId);
  const safeId = sanitizeTranscriptPathSegment(conversationId);
  return `${safeConfigDir}/plugins/${safePluginId}/sessions/${safeId}.json`;
}

export function serializeMimoTranscript(conversation: Conversation): string {
  const file: MimoTranscriptFile = {
    version: MIMO_TRANSCRIPT_VERSION,
    conversationId: conversation.id,
    messages: conversation.messages,
  };
  return JSON.stringify(file);
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const message = value as Record<string, unknown>;
  return (message.role === 'user' || message.role === 'assistant')
    && typeof message.content === 'string'
    && typeof message.id === 'string'
    && typeof message.timestamp === 'number';
}

export function parseMimoTranscript(raw: string): ChatMessage[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const messages = (parsed as { messages?: unknown }).messages;
    if (!Array.isArray(messages)) {
      return null;
    }
    return messages.filter(isChatMessage);
  } catch {
    return null;
  }
}
