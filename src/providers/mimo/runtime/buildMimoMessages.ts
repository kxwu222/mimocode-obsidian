import type { PreparedChatTurn } from '../../../core/runtime/types';
import type { ChatMessage, ImageAttachment } from '../../../core/types';

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

const DEFAULT_IMAGE_PROMPT = 'Please look at the attached image.';
const MIMO_IMAGE_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export function mimoCurrentTurnHasImages(turn: PreparedChatTurn): boolean {
  return usableImages(turn.request.images).length > 0;
}

export function mimoTurnHasImages(
  turn: PreparedChatTurn,
  conversationHistory: ChatMessage[] | undefined,
): boolean {
  if (mimoCurrentTurnHasImages(turn)) {
    return true;
  }
  return (conversationHistory ?? []).some((msg) => usableImages(msg.images).length > 0);
}

function usableImages(images: ImageAttachment[] | undefined): ImageAttachment[] {
  return (images ?? []).filter((image) => (
    typeof image.data === 'string'
    && image.data.trim().length > 0
    && MIMO_IMAGE_MEDIA_TYPES.has(image.mediaType)
  ));
}

function userContent(text: string, images?: ImageAttachment[]): string | MimoContentPart[] {
  const attached = usableImages(images);
  if (attached.length === 0) {
    return text;
  }

  const parts: MimoContentPart[] = attached.map((img) => ({
    type: 'image_url',
    image_url: { url: `data:${img.mediaType};base64,${img.data}` },
  }));
  parts.push({ type: 'text', text: text.trim() || DEFAULT_IMAGE_PROMPT });
  return parts;
}

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
    if (msg.role === 'user') {
      messages.push({ role: 'user', content: userContent(msg.content, msg.images) });
      continue;
    }
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: 'user', content: userContent(turn.prompt, turn.request.images) });

  return messages;
}
