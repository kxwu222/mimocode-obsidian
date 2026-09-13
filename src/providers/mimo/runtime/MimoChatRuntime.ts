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
import { getLocalIsoDate, getTodayDate } from '../../../utils/date';
import { appendEditorContext } from '../../../utils/editor';
import { MIMO_PROVIDER_CAPABILITIES } from '../capabilities';
import { getMimoBaseUrl, getMimoProviderSettings, isMimoModel, resolveMimoChatModel } from '../settings';
import {
  buildMimoMessages,
  mimoCurrentTurnHasImages,
  type MimoMessage,
  type MimoToolCall,
  mimoTurnHasImages,
} from './buildMimoMessages';
import {
  buildMimoChatTools,
  emitMimoWebSearchChunks,
  hasMimoWebSearchTool,
  isMimoServerSearchTool,
  type MimoChatTool,
} from './mimoChatTools';
import { parseMimoCompletion, parseToolArguments } from './parseMimoCompletion';
import { applyVaultNoteSnippets, loadVaultNoteSnippets } from './vaultNoteContext';
import {
  executeVaultTool,
  isMimoVaultTool,
  type VaultToolContext,
} from './vaultTools';

const MAX_VAULT_TOOL_ROUNDS = 8;

export function isMimoWebSearchUnavailable(status: number, body: string): boolean {
  return (status === 400 || status === 403 || status === 422)
    && /web[_\s-]?search|联网服务/i.test(body);
}

export function formatMimoWebSearchFallbackNotice(body: string): string {
  const tokenPlanHint = /webSearchEnabled is false/i.test(body)
    ? ' Xiaomi returned webSearchEnabled is false — Token Plan (tp-) clusters often reject search even when Settings → MiMo is on.'
    : '';
  return 'Xiaomi refused web search on this API key.'
    + tokenPlanHint
    + ' Settings → MiMo only asks for search; the Web Search Plugin must also be on for a pay-as-you-go (sk-) key.'
    + ' Answering without it.';
}

export function formatMimoHttpError(status: number, body: string): string {
  if (status === 404 && /image input/i.test(body)) {
    return 'MiMo cannot read this image. Only mimo-v2.5 accepts images — Pro is text-only. '
      + 'Switch the chat model to MiMo V2.5 and send the image again.';
  }
  if (isMimoWebSearchUnavailable(status, body)) {
    return 'MiMo web search is not available on this key. Enable the Web Search Plugin in the MiMo console, '
      + 'or turn off Web search in Settings → MiMo.';
  }
  return `MiMo API error ${status}: ${body}`.trim();
}

export function buildMimoSystemPrompt(options?: { webSearch?: boolean }): string {
  const iso = getLocalIsoDate();
  const webSearch = options?.webSearch
    ? 'You can search the public web for current facts when needed. Prefer vault tools for notes. '
    : '';
  const fileScope = options?.webSearch
    ? 'Stay inside the vault for file tools and only touch text notes. Web search is allowed for current public facts.'
    : 'Stay inside the vault and only touch text notes.';
  return 'You are MiMo, an AI assistant developed by Xiaomi, working inside the user\'s Obsidian vault. '
    + `Today is ${getTodayDate()}. For daily notes and dated filenames, use ${iso}. Do not invent an older date. `
    + 'When a message includes <linked_note> or <attached_note> blocks, those blocks contain the full note text. '
    + 'Use that text directly. You can browse and change the vault with the Read, LS, Glob, Grep, Write, Edit, and Delete tools. '
    + 'Use those tools when the user asks about notes you have not been given, or when they ask you to create, update, or trash notes. '
    + webSearch
    + 'When you mention a vault note in your reply, write it as an Obsidian wikilink such as [[folder/note.md]] so it is clickable. '
    + 'Do not wrap those wikilinks in backticks. Delete moves a note to Obsidian trash; it is not a permanent delete. '
    + fileScope;
}

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
    const preparedTurn = { ...turn, prompt };
    const currentTurnHasImages = mimoCurrentTurnHasImages(preparedTurn);
    const webSearchEnabledForTurn = mimoSettings.webSearch && !currentTurnHasImages;
    const messages = buildMimoMessages(
      preparedTurn,
      conversationHistory,
      buildMimoSystemPrompt({ webSearch: webSearchEnabledForTurn }),
    );

    const rawModel = typeof settings.model === 'string' ? settings.model.trim() : '';
    const selectedModel = rawModel && isMimoModel(rawModel) ? rawModel : mimoSettings.model;
    const model = resolveMimoChatModel(selectedModel, mimoTurnHasImages(preparedTurn, conversationHistory));
    const baseUrl = getMimoBaseUrl(mimoSettings);

    try {
      yield* this._runAgentLoop(
        baseUrl,
        mimoSettings.apiKey,
        model,
        messages,
        buildMimoChatTools(webSearchEnabledForTurn),
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
    tools: MimoChatTool[],
    signal: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    let inputTokens = 0;
    let outputTokens = 0;
    let requestTools = tools;
    const vaultTools = this.createVaultToolContext();

    for (let round = 0; round < MAX_VAULT_TOOL_ROUNDS; round++) {
      const result = yield* this.completeOnce(
        baseUrl,
        apiKey,
        model,
        messages,
        requestTools,
        signal,
      );
      if (!result) {
        return;
      }

      requestTools = result.tools;
      const { completion } = result;
      inputTokens = completion.usage.prompt_tokens || inputTokens;
      outputTokens += completion.usage.completion_tokens;

      const vaultCalls = completion.toolCalls.filter((call) => isMimoVaultTool(call.function.name));
      const serverSearchCalls = completion.toolCalls.filter((call) => (
        isMimoServerSearchTool(call.function.name)
      ));
      const searchQuery = parseToolArguments(serverSearchCalls[0]?.function.arguments ?? '').query;

      yield* emitMimoWebSearchChunks(
        completion.annotations,
        completion.webSearchError,
        `mimo-web-search-${round}`,
        typeof searchQuery === 'string' ? searchQuery : undefined,
      );

      if (completion.text) {
        yield { type: 'text', content: completion.text };
      }

      if (vaultCalls.length === 0) {
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
        tool_calls: vaultCalls,
      });

      for (const toolCall of vaultCalls) {
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
    tools: MimoChatTool[],
    signal: AbortSignal,
  ): AsyncGenerator<StreamChunk, { completion: ReturnType<typeof parseMimoCompletion>; tools: MimoChatTool[] } | null> {
    let requestTools = tools;
    let sseText = '';

    for (let attempt = 0; attempt < 2; attempt++) {
      const body: Record<string, unknown> = {
        model,
        messages,
        stream: true,
        max_completion_tokens: 32768,
        tools: requestTools,
      };

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

        if (response.status >= 200 && response.status < 300) {
          sseText = response.text ?? '';
          break;
        }

        const canRetry = attempt === 0
          && hasMimoWebSearchTool(requestTools)
          && isMimoWebSearchUnavailable(response.status, response.text || '');
        if (canRetry) {
          yield {
            type: 'notice',
            content: formatMimoWebSearchFallbackNotice(response.text || ''),
          };
          requestTools = buildMimoChatTools(false);
          continue;
        }

        yield {
          type: 'error',
          content: formatMimoHttpError(response.status, response.text || ''),
        };
        yield { type: 'done' };
        return null;
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
    }

    if (!sseText) {
      yield { type: 'error', content: 'MiMo response body is empty.' };
      yield { type: 'done' };
      return null;
    }

    return { completion: parseMimoCompletion(sseText), tools: requestTools };
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
      writeNote: (path, contents) => this.writeVaultNote(path, contents),
      trashNote: (path) => this.trashVaultNote(path),
    };
  }

  private async writeVaultNote(path: string, contents: string): Promise<'created' | 'updated'> {
    await this.ensureVaultParentFolders(path);
    const existing = this.plugin.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.plugin.app.vault.modify(existing, contents);
      return 'updated';
    }
    if (existing) {
      throw new Error(`Cannot write ${path}: a folder already exists there.`);
    }
    await this.plugin.app.vault.create(path, contents);
    return 'created';
  }

  private async trashVaultNote(path: string): Promise<boolean> {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      return false;
    }

    await this.plugin.app.fileManager.trashFile(file);
    return true;
  }

  private async ensureVaultParentFolders(path: string): Promise<void> {
    const segments = path.split('/').slice(0, -1);
    let acc = '';
    for (const segment of segments) {
      if (!segment) {
        continue;
      }
      acc = acc ? `${acc}/${segment}` : segment;
      const existing = this.plugin.app.vault.getAbstractFileByPath(acc);
      if (existing instanceof TFile) {
        throw new Error(`Cannot create folder ${acc}: a file already exists there.`);
      }
      if (!existing) {
        await this.plugin.app.vault.createFolder(acc);
      }
    }
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
