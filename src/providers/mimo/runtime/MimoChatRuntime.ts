import { MarkdownView, requestUrl, TFile } from 'obsidian';

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
import type { ChatMessage, Conversation, SlashCommand, StreamChunk } from '../../../core/types';
import type ClaudianPlugin from '../../../main';
import { appendBrowserContext } from '../../../utils/browser';
import { appendCanvasContext } from '../../../utils/canvas';
import { appendCurrentNote } from '../../../utils/context';
import { appendEditorContext } from '../../../utils/editor';
import { MIMO_PROVIDER_CAPABILITIES } from '../capabilities';
import { getMimoBaseUrl, getMimoProviderSettings, isMimoModel } from '../settings';
import {
  buildMimoMessages,
  type MimoMessage,
  type MimoToolCall,
} from './buildMimoMessages';
import { parseMimoCompletion, parseToolArguments } from './parseMimoCompletion';
import { applyVaultNoteSnippets, loadVaultNoteSnippets } from './vaultNoteContext';
import {
  executeVaultTool,
  isMimoVaultTool,
  MIMO_VAULT_TOOLS,
  type VaultToolContext,
} from './vaultTools';

const MAX_VAULT_TOOL_ROUNDS = 8;

const MIMO_SYSTEM_PROMPT =
  'You are MiMo, an AI assistant developed by Xiaomi, working inside the user\'s Obsidian vault. '
  + 'When a message includes <linked_note> or <attached_note> blocks, those blocks contain the full note text. '
  + 'Use that text directly. You can also browse the vault with the Read, LS, Glob, and Grep tools. '
  + 'Use those tools when the user asks about notes you have not been given. You cannot write, edit, or delete files.';

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function abortAsError(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const abort = (): void => {
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}

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

    const prompt = await this.applyVaultNoteContext(turn);
    const messages = buildMimoMessages({ ...turn, prompt }, conversationHistory, MIMO_SYSTEM_PROMPT);

    const rawModel = typeof settings.model === 'string' ? settings.model.trim() : '';
    const selectedModel = rawModel && isMimoModel(rawModel) ? rawModel : mimoSettings.model;
    const baseUrl = getMimoBaseUrl(mimoSettings);

    try {
      yield* this._runAgentLoop(
        baseUrl,
        mimoSettings.apiKey,
        selectedModel,
        messages,
        signal,
      );
    } finally {
      this.abortController = null;
    }
  }

  private async applyVaultNoteContext(turn: PreparedChatTurn): Promise<string> {
    const currentNotePath = turn.request.currentNotePath;
    const attachedFilePaths = turn.request.attachedFilePaths ?? [];
    if (!currentNotePath && attachedFilePaths.length === 0) {
      return turn.prompt;
    }

    const snippets = await loadVaultNoteSnippets({
      currentNotePath,
      paths: attachedFilePaths,
      blockedSegments: [this.plugin.app.vault.configDir],
      readNote: (path) => this.readVaultNote(path),
    });

    if (snippets.length > 0) {
      return applyVaultNoteSnippets(turn.prompt, snippets);
    }

    if (currentNotePath) {
      return appendCurrentNote(turn.prompt, currentNotePath);
    }

    return turn.prompt;
  }

  private async readVaultNote(path: string): Promise<string | null> {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return null;
    }

    for (const leaf of this.plugin.app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === path) {
        return view.editor.getValue();
      }
    }

    try {
      return await this.plugin.app.vault.cachedRead(file);
    } catch {
      return null;
    }
  }

  /** Stream one HTTP completion, executing vault tools until the model stops. */
  private async *_runAgentLoop(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: MimoMessage[],
    signal: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    let inputTokens = 0;
    let outputTokens = 0;
    const vaultTools = this.createVaultToolContext();

    for (let round = 0; round < MAX_VAULT_TOOL_ROUNDS; round++) {
      const completion = yield* this.completeOnce(
        baseUrl,
        apiKey,
        model,
        messages,
        signal,
      );
      if (!completion) {
        return;
      }

      inputTokens = completion.usage.prompt_tokens || inputTokens;
      outputTokens += completion.usage.completion_tokens;

      if (completion.text) {
        yield { type: 'text', content: completion.text };
      }

      if (completion.toolCalls.length === 0) {
        const totalTokens = inputTokens + outputTokens;
        if (totalTokens > 0) {
          const contextWindow = 1_000_000;
          yield {
            type: 'usage',
            usage: {
              contextTokens: inputTokens,
              contextWindow,
              inputTokens,
              model,
              percentage: inputTokens / contextWindow,
            },
          };
        }
        yield { type: 'done' };
        return;
      }

      messages.push({
        role: 'assistant',
        content: completion.text || null,
        tool_calls: completion.toolCalls,
      });

      for (const toolCall of completion.toolCalls) {
        yield* this.executeToolCall(toolCall, vaultTools, messages);
      }
    }

    yield { type: 'error', content: 'Stopped after too many vault tool calls.' };
    yield { type: 'done' };
  }

  private async *completeOnce(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: MimoMessage[],
    signal: AbortSignal,
  ): AsyncGenerator<StreamChunk, ReturnType<typeof parseMimoCompletion> | null> {
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      max_completion_tokens: 32768,
      tools: MIMO_VAULT_TOOLS,
    };

    let sseText: string;
    try {
      const response = await Promise.race([
        requestUrl({
          url: `${baseUrl}/chat/completions`,
          method: 'POST',
          headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          throw: false,
        }),
        abortAsError(signal),
      ]);

      if (signal.aborted) {
        yield { type: 'done' };
        return null;
      }

      if (response.status < 200 || response.status >= 300) {
        yield {
          type: 'error',
          content: `MiMo API error ${response.status}: ${response.text || ''}`.trim(),
        };
        yield { type: 'done' };
        return null;
      }

      sseText = response.text ?? '';
    } catch (error) {
      if (signal.aborted || isAbortError(error)) {
        yield { type: 'done' };
        return null;
      }
      const message = error instanceof Error ? error.message : 'Network error';
      yield { type: 'error', content: `MiMo request failed: ${message}` };
      yield { type: 'done' };
      return null;
    }

    if (!sseText) {
      yield { type: 'error', content: 'MiMo response body is empty.' };
      yield { type: 'done' };
      return null;
    }

    return parseMimoCompletion(sseText);
  }

  private async *executeToolCall(
    toolCall: MimoToolCall,
    vaultTools: VaultToolContext,
    messages: MimoMessage[],
  ): AsyncGenerator<StreamChunk> {
    const name = toolCall.function.name;
    const input = parseToolArguments(toolCall.function.arguments);
    yield { type: 'tool_use', id: toolCall.id, name, input };

    const result = isMimoVaultTool(name)
      ? await executeVaultTool(name, input, vaultTools)
      : { content: `Unknown tool: ${name}`, isError: true };

    yield {
      type: 'tool_result',
      id: toolCall.id,
      content: result.content,
      isError: result.isError,
    };

    messages.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: result.content,
    });
  }

  private createVaultToolContext(): VaultToolContext {
    return {
      configDir: this.plugin.app.vault.configDir,
      listMarkdownFiles: () => this.plugin.app.vault.getMarkdownFiles().map((file) => ({ path: file.path })),
      readNote: (path) => this.readVaultNote(path),
    };
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
