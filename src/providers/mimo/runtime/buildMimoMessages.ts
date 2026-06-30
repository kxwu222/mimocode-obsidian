import type { PreparedChatTurn } from '../../../core/runtime/types';
import type { ChatMessage } from '../../../core/types';

export interface MimoTextContent {
  type: 'text';
  text: string;
}

export interface MimoImageUrlContent {
  type: 'image_url';
  image_url: { url: string };
}

export type MimoContentPart = MimoTextContent | MimoImageUrlContent;

/** Serialised tool call reference embedded in an assistant message. */
export interface MimoToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** Assistant turn — may carry text content, tool calls, or both. */
export interface MimoAssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: MimoToolCall[];
}

/** Tool result message sent after a tool call. */
export interface MimoToolResultMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

export type MimoMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | MimoContentPart[] }
  | MimoAssistantMessage
  | MimoToolResultMessage;

export function buildMimoMessages(
  turn: PreparedChatTurn,
  conversationHistory: ChatMessage[] | undefined,
  systemPrompt: string,
): MimoMessage[] {
  const messages: MimoMessage[] = [{ role: 'system', content: systemPrompt }];

  for (const msg of conversationHistory ?? []) {
    // Skip rebuilt-context filler messages injected on session reset.
    if (msg.isRebuiltContext) {
      continue;
    }
    messages.push({ role: msg.role, content: msg.content });
  }

  const { images } = turn.request;
  if (images && images.length > 0) {
    const parts: MimoContentPart[] = [{ type: 'text', text: turn.prompt }];
    for (const img of images) {
      if (img.data) {
        parts.push({
          type: 'image_url',
          image_url: { url: `data:${img.mediaType};base64,${img.data}` },
        });
      }
    }
    messages.push({ role: 'user', content: parts });
  } else {
    messages.push({ role: 'user', content: turn.prompt });
  }

  return messages;
}
