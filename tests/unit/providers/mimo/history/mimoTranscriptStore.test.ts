import type { ChatMessage, Conversation } from '@/core/types';
import {
  buildMimoTranscriptPath,
  parseMimoTranscript,
  serializeMimoTranscript,
} from '@/providers/mimo/history/mimoTranscriptStore';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'Hello',
    timestamp: 100,
    ...overrides,
  };
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    providerId: 'mimo',
    title: 'Chat',
    createdAt: 1,
    updatedAt: 2,
    sessionId: null,
    messages: [makeMessage()],
    ...overrides,
  };
}

describe('buildMimoTranscriptPath', () => {
  it('writes under the plugin folder inside the vault config dir', () => {
    expect(buildMimoTranscriptPath('.obsidian', 'mimocode', 'conv-1')).toBe(
      '.obsidian/plugins/mimocode/sessions/conv-1.json',
    );
  });

  it('sanitizes path-unsafe conversation ids', () => {
    expect(buildMimoTranscriptPath('.obsidian', 'mimocode', '../evil/id')).toBe(
      '.obsidian/plugins/mimocode/sessions/.._evil_id.json',
    );
  });
});

describe('serializeMimoTranscript / parseMimoTranscript', () => {
  it('round-trips messages including image bytes', () => {
    const conversation = makeConversation({
      messages: [
        makeMessage({
          images: [{
            id: 'img-1',
            name: 'shot.png',
            mediaType: 'image/png',
            data: 'abc123',
            size: 6,
            source: 'paste',
          }],
        }),
        makeMessage({
          id: 'msg-2',
          role: 'assistant',
          content: 'Seen it',
          timestamp: 200,
        }),
      ],
    });

    const parsed = parseMimoTranscript(serializeMimoTranscript(conversation));

    expect(parsed).toEqual(conversation.messages);
  });

  it('returns null for corrupt JSON and non-transcript objects', () => {
    expect(parseMimoTranscript('not-json')).toBeNull();
    expect(parseMimoTranscript('{"version":1}')).toBeNull();
    expect(parseMimoTranscript('[]')).toBeNull();
  });

  it('drops entries that are not chat messages', () => {
    const raw = JSON.stringify({
      version: 1,
      conversationId: 'conv-1',
      messages: [
        { id: 'ok', role: 'user', content: 'hi', timestamp: 1 },
        { role: 'system', content: 'nope' },
        null,
      ],
    });

    expect(parseMimoTranscript(raw)).toEqual([
      { id: 'ok', role: 'user', content: 'hi', timestamp: 1 },
    ]);
  });
});
