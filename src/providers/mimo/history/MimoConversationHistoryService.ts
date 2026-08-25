import type { ProviderConversationHistoryService } from '../../../core/providers/types';
import type { VaultFileAdapter } from '../../../core/storage/VaultFileAdapter';
import type { Conversation } from '../../../core/types';
import {
  buildMimoTranscriptPath,
  parseMimoTranscript,
  serializeMimoTranscript,
} from './mimoTranscriptStore';

export interface MimoTranscriptStorage {
  adapter: VaultFileAdapter;
  configDir: string;
  pluginId: string;
}

// MiMo is a stateless HTTP provider. Transcripts live in the plugin folder
// so chats survive Obsidian restarts without writing into note git.
export class MimoConversationHistoryService implements ProviderConversationHistoryService {
  private storage: MimoTranscriptStorage | null = null;

  attachWorkspaceStorage(storage: MimoTranscriptStorage): void {
    this.storage = storage;
  }

  async persistConversationMessages(conversation: Conversation): Promise<void> {
    const storage = this.storage;
    if (!storage) {
      return;
    }

    const path = this.getTranscriptPath(conversation);
    if (!path) {
      return;
    }

    if (conversation.messages.length === 0) {
      if (await storage.adapter.exists(path)) {
        await storage.adapter.delete(path);
      }
      return;
    }

    await storage.adapter.write(path, serializeMimoTranscript(conversation));
  }

  async hydrateConversationHistory(
    conversation: Conversation,
    _vaultPath: string | null,
  ): Promise<void> {
    const storage = this.storage;
    const path = this.getTranscriptPath(conversation);
    if (!storage || !path) {
      return;
    }

    try {
      if (!(await storage.adapter.exists(path))) {
        return;
      }
      const parsed = parseMimoTranscript(await storage.adapter.read(path));
      if (parsed) {
        conversation.messages = parsed;
      }
    } catch {
      // Leave messages empty so load can skip unrestorable shells.
    }
  }

  async deleteConversationSession(
    conversation: Conversation,
    _vaultPath: string | null,
  ): Promise<void> {
    const storage = this.storage;
    const path = this.getTranscriptPath(conversation);
    if (!storage || !path) {
      return;
    }

    await storage.adapter.delete(path);
  }

  resolveSessionIdForConversation(_conversation: Conversation | null): string | null {
    return null;
  }

  isPendingForkConversation(_conversation: Conversation): boolean {
    return false;
  }

  buildForkProviderState(
    _sourceSessionId: string,
    _resumeAt: string,
  ): Record<string, unknown> {
    return {};
  }

  private getTranscriptPath(conversation: Conversation): string | null {
    const storage = this.storage;
    if (!storage) {
      return null;
    }
    return buildMimoTranscriptPath(storage.configDir, storage.pluginId, conversation.id);
  }
}
