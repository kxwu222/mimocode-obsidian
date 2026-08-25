import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import type { ChatMessage, Conversation } from '@/core/types';
import { MimoConversationHistoryService } from '@/providers/mimo/history/MimoConversationHistoryService';
import { buildMimoTranscriptPath } from '@/providers/mimo/history/mimoTranscriptStore';

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

function createMemoryAdapter() {
  const files = new Map<string, string>();
  const adapter = {
    exists: async (path: string) => files.has(path),
    read: async (path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`Missing file: ${path}`);
      }
      return content;
    },
    write: async (path: string, content: string) => {
      files.set(path, content);
    },
    delete: async (path: string) => {
      files.delete(path);
    },
  } as unknown as VaultFileAdapter;

  return { files, adapter };
}

describe('MimoConversationHistoryService', () => {
  const configDir = '.obsidian';
  const pluginId = 'mimocode';
  const transcriptPath = buildMimoTranscriptPath(configDir, pluginId, 'conv-1');

  function createAttachedService() {
    const memory = createMemoryAdapter();
    const service = new MimoConversationHistoryService();
    service.attachWorkspaceStorage({
      adapter: memory.adapter,
      configDir,
      pluginId,
    });
    return { service, memory };
  }

  it('persists messages and hydrates them back including image data', async () => {
    const { service } = createAttachedService();
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
      ],
    });

    await service.persistConversationMessages(conversation);

    const restored = makeConversation({ messages: [] });
    await service.hydrateConversationHistory(restored, null);

    expect(restored.messages).toEqual(conversation.messages);
    expect(restored.messages[0].images?.[0].data).toBe('abc123');
  });

  it('writes under the plugin sessions folder', async () => {
    const { service, memory } = createAttachedService();

    await service.persistConversationMessages(makeConversation());

    expect(memory.files.has(transcriptPath)).toBe(true);
  });

    it('removes an existing transcript when messages become empty', async () => {
      const { service, memory } = createAttachedService();
      await service.persistConversationMessages(makeConversation());
      expect(memory.files.has(transcriptPath)).toBe(true);

      await service.persistConversationMessages(makeConversation({ messages: [] }));
      expect(memory.files.has(transcriptPath)).toBe(false);
    });

  it('leaves messages empty when the transcript file is missing or corrupt', async () => {
    const { service, memory } = createAttachedService();
    const missing = makeConversation({ messages: [] });
    await service.hydrateConversationHistory(missing, null);
    expect(missing.messages).toEqual([]);

    memory.files.set(transcriptPath, '{not-json');
    const corrupt = makeConversation({ messages: [] });
    await service.hydrateConversationHistory(corrupt, null);
    expect(corrupt.messages).toEqual([]);
  });

  it('deletes the transcript file with the conversation', async () => {
    const { service, memory } = createAttachedService();
    await service.persistConversationMessages(makeConversation());
    expect(memory.files.has(transcriptPath)).toBe(true);

    await service.deleteConversationSession(makeConversation(), null);
    expect(memory.files.has(transcriptPath)).toBe(false);
  });

  it('no-ops persist, hydrate, and delete until storage is attached', async () => {
    const service = new MimoConversationHistoryService();
    const conversation = makeConversation({ messages: [] });

    await expect(service.persistConversationMessages(makeConversation())).resolves.toBeUndefined();
    await expect(service.hydrateConversationHistory(conversation, null)).resolves.toBeUndefined();
    await expect(service.deleteConversationSession(conversation, null)).resolves.toBeUndefined();
    expect(conversation.messages).toEqual([]);
  });
});
