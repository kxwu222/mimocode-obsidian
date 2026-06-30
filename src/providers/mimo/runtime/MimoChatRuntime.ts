import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
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
import type { McpServerConfig } from '../../../core/types';
import type ClaudianPlugin from '../../../main';
import { appendBrowserContext } from '../../../utils/browser';
import { appendCanvasContext } from '../../../utils/canvas';
import { appendCurrentNote } from '../../../utils/context';
import { appendEditorContext } from '../../../utils/editor';
import { MIMO_PROVIDER_CAPABILITIES } from '../capabilities';
import { getMimoBaseUrl, getMimoProviderSettings, isMimoModel } from '../settings';
import {
  buildMimoMessages,
  type MimoAssistantMessage,
  type MimoMessage,
  type MimoToolCall,
  type MimoToolResultMessage,
} from './buildMimoMessages';
import type { OpenAIToolDef } from './McpToolRunner';
import { McpToolRunner } from './McpToolRunner';

const MIMO_SYSTEM_PROMPT =
  'You are MiMo, an advanced AI coding assistant developed by Xiaomi. '
  + 'Help the user with their coding tasks, answer questions, and assist with their vault.';

/** Accumulated tool call data from an OpenAI streaming response. */
interface AccumulatedToolCall {
  index: number;
  id: string;
  name: string;
  arguments: string;
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

    const rawModel = typeof settings.model === 'string' ? settings.model.trim() : '';
    const selectedModel = rawModel && isMimoModel(rawModel) ? rawModel : mimoSettings.model;
    const baseUrl = getMimoBaseUrl(mimoSettings);

    // Resolve MCP tools if any servers are mentioned.
    let toolDefs: OpenAIToolDef[] = [];
    let serverConfigs: Record<string, McpServerConfig> = {};
    const runner = new McpToolRunner();

    try {
      if (turn.mcpMentions.size > 0) {
        const mcpManager = ProviderWorkspaceRegistry.getMcpServerManager('mimo');
        if (mcpManager) {
          serverConfigs = mcpManager.getActiveServers(turn.mcpMentions);
          if (Object.keys(serverConfigs).length > 0) {
            toolDefs = await runner.listTools(serverConfigs);
          }
        }
      }

      yield* this._runAgentLoop(
        baseUrl,
        mimoSettings.apiKey,
        selectedModel,
        messages,
        toolDefs,
        serverConfigs,
        runner,
        signal,
      );
    } finally {
      await runner.close();
      this.abortController = null;
    }
  }

  /** The core agent loop: stream → accumulate tool calls → execute → repeat. */
  private async *_runAgentLoop(
    baseUrl: string,
    apiKey: string,
    model: string,
    messages: MimoMessage[],
    toolDefs: OpenAIToolDef[],
    serverConfigs: Record<string, McpServerConfig>,
    runner: McpToolRunner,
    signal: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    let inputTokens = 0;
    let outputTokens = 0;
    const MAX_TOOL_LOOPS = 20;
    let loopCount = 0;

    while (loopCount < MAX_TOOL_LOOPS) {
      loopCount++;

      const body: Record<string, unknown> = {
        model,
        messages,
        stream: true,
        max_completion_tokens: 32768,
      };
      if (toolDefs.length > 0) {
        body.tools = toolDefs;
        body.tool_choice = 'auto';
      }

      let response: Response;
      try {
        // requestUrl does not support streaming responses; fetch is required for SSE
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
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

      // Accumulated tool calls for this response turn.
      const pendingToolCalls = new Map<number, AccumulatedToolCall>();
      let finishReason: string | null = null;
      // assistant text content accumulated for the history entry
      let assistantText = '';

      const decoder = new TextDecoder();
      let buffer = '';

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
                  delta?: {
                    content?: string;
                    tool_calls?: Array<{
                      index: number;
                      id?: string;
                      type?: string;
                      function?: { name?: string; arguments?: string };
                    }>;
                  };
                  finish_reason?: string | null;
                }>;
                usage?: {
                  prompt_tokens?: number;
                  completion_tokens?: number;
                };
              };

              const choice = parsed.choices?.[0];
              if (choice?.delta?.content) {
                assistantText += choice.delta.content;
                yield { type: 'text', content: choice.delta.content };
              }

              // Accumulate streaming tool call chunks (OpenAI sends them in pieces).
              for (const tc of choice?.delta?.tool_calls ?? []) {
                let entry = pendingToolCalls.get(tc.index);
                if (!entry) {
                  entry = { index: tc.index, id: '', name: '', arguments: '' };
                  pendingToolCalls.set(tc.index, entry);
                }
                if (tc.id) entry.id = tc.id;
                if (tc.function?.name) entry.name += tc.function.name;
                if (tc.function?.arguments) entry.arguments += tc.function.arguments;
              }

              if (choice?.finish_reason) {
                finishReason = choice.finish_reason;
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
      }

      if (signal.aborted) {
        yield { type: 'done' };
        return;
      }

      // If there are no tool calls or we're done, exit the loop.
      if (finishReason !== 'tool_calls' || pendingToolCalls.size === 0) {
        break;
      }

      // Build the sorted list of completed tool calls.
      const toolCallList = Array.from(pendingToolCalls.values()).sort(
        (a, b) => a.index - b.index,
      );

      // Append the assistant message with tool_calls to message history.
      const assistantMsg: MimoAssistantMessage = {
        role: 'assistant',
        content: assistantText || null,
        tool_calls: toolCallList.map((tc): MimoToolCall => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
      messages.push(assistantMsg);

      // Execute each tool call and append tool result messages.
      for (const tc of toolCallList) {
        let input: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(tc.arguments || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            input = parsed as Record<string, unknown>;
          }
        } catch {
          // Use empty input if arguments are not valid JSON.
        }

        // Yield tool_use chunk so the UI can show the tool being called.
        yield { type: 'tool_use', id: tc.id, name: tc.name, input };

        const { content, isError } = await runner.callTool(tc.name, serverConfigs, input);

        // Yield tool_result chunk so the UI can show the result.
        yield { type: 'tool_result', id: tc.id, content, isError };

        const toolResultMsg: MimoToolResultMessage = {
          role: 'tool',
          tool_call_id: tc.id,
          content,
        };
        messages.push(toolResultMsg);
      }

      // Loop back: send the updated conversation with tool results to the model.
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
          model,
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
