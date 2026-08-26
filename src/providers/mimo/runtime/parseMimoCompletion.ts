import type { MimoToolCall } from './buildMimoMessages';

export interface MimoCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

export interface MimoCompletion {
  finishReason: string | null;
  text: string;
  toolCalls: MimoToolCall[];
  usage: MimoCompletionUsage;
}

interface ToolCallDelta {
  arguments?: string;
  id?: string;
  index?: number;
  type?: string;
  function?: {
    arguments?: string;
    name?: string;
  };
}

interface CompletionChoice {
  delta?: {
    content?: string;
    tool_calls?: ToolCallDelta[];
  };
  finish_reason?: string | null;
  message?: {
    content?: string | null;
    tool_calls?: MimoToolCall[];
  };
}

interface CompletionFrame {
  choices?: CompletionChoice[];
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
  };
}

export function parseMimoCompletion(sseText: string): MimoCompletion {
  const toolCalls = new Map<number, { arguments: string; id: string; name: string }>();
  let text = '';
  let finishReason: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;

  for (const rawLine of sseText.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed || !trimmed.startsWith('data:')) {
      continue;
    }

    const data = trimmed.slice(5).trim();
    if (data === '[DONE]') {
      break;
    }

    let frame: CompletionFrame;
    try {
      frame = JSON.parse(data) as CompletionFrame;
    } catch {
      continue;
    }

    const choice = frame.choices?.[0];
    if (choice?.delta?.content) {
      text += choice.delta.content;
    }
    if (choice?.message?.content) {
      text = choice.message.content;
    }

    for (const delta of choice?.delta?.tool_calls ?? []) {
      mergeToolCallDelta(toolCalls, delta);
    }
    if (choice?.message?.tool_calls) {
      choice.message.tool_calls.forEach((call, index) => {
        toolCalls.set(index, {
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        });
      });
    }

    if (choice?.finish_reason) {
      finishReason = choice.finish_reason;
    }
    if (frame.usage) {
      promptTokens = frame.usage.prompt_tokens ?? promptTokens;
      completionTokens = frame.usage.completion_tokens ?? completionTokens;
    }
  }

  return {
    text,
    toolCalls: [...toolCalls.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, call]) => ({
        id: call.id,
        type: 'function' as const,
        function: {
          name: call.name,
          arguments: call.arguments,
        },
      })),
    finishReason,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
    },
  };
}

export function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw.trim()) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function mergeToolCallDelta(
  toolCalls: Map<number, { arguments: string; id: string; name: string }>,
  delta: ToolCallDelta,
): void {
  const index = delta.index ?? 0;
  const current = toolCalls.get(index) ?? {
    id: `call_${index}`,
    name: '',
    arguments: '',
  };
  if (delta.id) {
    current.id = delta.id;
  }
  if (delta.function?.name) {
    current.name = delta.function.name;
  }
  const argChunk = delta.function?.arguments ?? delta.arguments;
  if (argChunk) {
    current.arguments += argChunk;
  }
  toolCalls.set(index, current);
}
