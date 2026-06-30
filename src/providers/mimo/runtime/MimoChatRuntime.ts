import type { ProviderCapabilities } from '../../../core/providers/types';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type {
  ApprovalCallback,
  AskUserQuestionCallback,
  AutoTurnCallback,
  ChatRewindMode,
  ChatRewindResult,
  ChatRuntimeConversationState,
  ChatRuntimeEnsureReadyOptions,
  ChatRuntimeQueryOptions,
  ChatTurnMetadata,
  ChatTurnRequest,
  ExitPlanModeCallback,
  PreparedChatTurn,
  SessionUpdateResult,
  SubagentRuntimeState,
} from '../../../core/runtime/types';
import type {
  ChatMessage,
  Conversation,
  SlashCommand,
  StreamChunk,
} from '../../../core/types';
import type ClaudianPlugin from '../../../main';
import { appendBrowserContext } from '../../../utils/browser';
import { appendCanvasContext } from '../../../utils/canvas';
import { appendCurrentNote } from '../../../utils/context';
import { appendEditorContext } from '../../../utils/editor';
import { MIMO_PROVIDER_CAPABILITIES } from '../capabilities';
import { getMimoBaseUrl, getMimoProviderSettings, isMimoModel } from '../settings';
import { buildMimoMessages } from './buildMimoMessages';

const MIMO_SYSTEM_PROMPT =
  'You are MiMo, an advanced AI coding assistant developed by Xiaomi. '
  + 'Help the user with their coding tasks, answer questions, and assist with their vault.';

export class MimoChatRuntime implements ChatRuntime {
  readonly providerId = 'mimo' as const;

  private abortController: AbortController | null = null;
  private currentTurnMetadata: ChatTurnMetadata = {};

  constructor(private readonly plugin: ClaudianPlugin) {}

  getCapabilities(): Readonly<ProviderCapabilities> {
    return MIMO_PROVIDER_CAPABILITIES;
  }

  prepareTurn(request: ChatTurnRequest): PreparedChatTurn {
    let prompt = request.text;

    if (request.currentNotePath) {
      prompt = appendCurrentNote(prompt, request.currentNotePath);
    }

    if (request.editorSelection && request.editorSelection.mode !== 'none') {
      prompt = appendEditorContext(prompt, request.editorSelection);
    }

    if (request.browserSelection) {
      prompt = appendBrowserContext(prompt, request.browserSelection);
    }

    if (request.canvasSelection) {
      prompt = appendCanvasContext(prompt, request.canvasSelection);
    }

    return {
      isCompact: false,
      mcpMentions: request.enabledMcpServers ?? new Set(),
      persistedContent: request.text,
      prompt,
      request,
    };
  }

  onReadyStateChange(_listener: (ready: boolean) => void): () => void {
    return () => {};
  }

  setResumeCheckpoint(_checkpointId: string | undefined): void {}

  syncConversationState(_conversation: ChatRuntimeConversationState | null): void {}

  reloadMcpServers(): Promise<void> {
    return Promise.resolve();
  }

  ensureReady(_options?: ChatRuntimeEnsureReadyOptions): Promise<boolean> {
    return Promise.resolve(true);
  }

  async *query(
    turn: PreparedChatTurn,
    conversationHistory?: ChatMessage[],
    _queryOptions?: ChatRuntimeQueryOptions,
  ): AsyncGenerator<StreamChunk> {
    const settings = this.plugin.settings as unknown as Record<string, unknown>;
    const mimoSettings = getMimoProviderSettings(settings);

    if (!mimoSettings.apiKey) {
      yield { type: 'error', content: 'MiMo API key is not configured. Set it in Settings → MiMo.' };
      yield { type: 'done' };
      return;
    }

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const messages = buildMimoMessages(turn, conversationHistory, MIMO_SYSTEM_PROMPT);

    // Resolve the model: use tab-level selection only when it is a valid MiMo model,
    // so stale Claude model names stored in settings never reach the MiMo API.
    const rawModel = typeof settings.model === 'string' ? settings.model.trim() : '';
    const selectedModel = rawModel && isMimoModel(rawModel) ? rawModel : mimoSettings.model;

    const baseUrl = getMimoBaseUrl(mimoSettings);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'api-key': mimoSettings.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          messages,
          stream: true,
          max_completion_tokens: 32768,
        }),
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        yield { type: 'done' };
        return;
      }
      const message = error instanceof Error ? error.message : 'Network error';
      yield { type: 'error', content: `MiMo request failed: ${message}` };
      yield { type: 'done' };
      return;
    }

    if (!response.ok) {
      let errBody = '';
      try {
        errBody = await response.text();
      } catch {
        // ignore
      }
      yield {
        type: 'error',
        content: `MiMo API error ${response.status}: ${errBody || response.statusText}`,
      };
      yield { type: 'done' };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', content: 'MiMo response body is empty.' };
      yield { type: 'done' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      let finished = false;
      while (!finished) {
        const { done, value } = await reader.read();
        if (done || signal.aborted) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) {
            continue;
          }

          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') {
            finished = true;
            break;
          }

          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{
                delta?: { content?: string };
                finish_reason?: string | null;
              }>;
              usage?: {
                prompt_tokens?: number;
                completion_tokens?: number;
              };
            };

            const choice = parsed.choices?.[0];
            if (choice?.delta?.content) {
              yield { type: 'text', content: choice.delta.content };
            }
            if (choice?.finish_reason) {
              finished = true;
              break;
            }
            if (parsed.usage) {
              inputTokens = parsed.usage.prompt_tokens ?? 0;
              outputTokens = parsed.usage.completion_tokens ?? 0;
            }
          } catch {
            // Skip malformed SSE frames.
          }
        }
      }
    } finally {
      reader.releaseLock();
      this.abortController = null;
    }

    const totalTokens = inputTokens + outputTokens;
    if (totalTokens > 0) {
      const contextWindow = 1_000_000;
      yield {
        type: 'usage',
        usage: {
          contextTokens: inputTokens,
          contextWindow,
          inputTokens,
          model: selectedModel,
          percentage: inputTokens / contextWindow,
        },
      };
    }

    yield { type: 'done' };
  }

  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  resetSession(): void {}

  getSessionId(): string | null {
    return null;
  }

  consumeSessionInvalidation(): boolean {
    return false;
  }

  isReady(): boolean {
    return true;
  }

  getSupportedCommands(): Promise<SlashCommand[]> {
    return Promise.resolve([]);
  }

  cleanup(): void {
    this.cancel();
  }

  rewind(
    _userMessageId: string,
    _assistantMessageId: string | undefined,
    _mode?: ChatRewindMode,
  ): Promise<ChatRewindResult> {
    return Promise.resolve({ canRewind: false });
  }

  setApprovalCallback(_callback: ApprovalCallback | null): void {}
  setApprovalDismisser(_dismisser: (() => void) | null): void {}
  setAskUserQuestionCallback(_callback: AskUserQuestionCallback | null): void {}
  setExitPlanModeCallback(_callback: ExitPlanModeCallback | null): void {}
  setPermissionModeSyncCallback(_callback: ((sdkMode: string) => void) | null): void {}
  setSubagentHookProvider(_getState: () => SubagentRuntimeState): void {}
  setAutoTurnCallback(_callback: AutoTurnCallback | null): void {}

  consumeTurnMetadata(): ChatTurnMetadata {
    const meta = { ...this.currentTurnMetadata };
    this.currentTurnMetadata = {};
    return meta;
  }

  buildSessionUpdates(_params: {
    conversation: Conversation | null;
    sessionInvalidated: boolean;
  }): SessionUpdateResult {
    return { updates: {} };
  }

  resolveSessionIdForFork(_conversation: Conversation | null): string | null {
    return null;
  }
}
