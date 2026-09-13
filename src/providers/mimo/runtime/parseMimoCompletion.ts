import type { MimoToolCall } from './buildMimoMessages';

export const MAX_MIMO_WEB_SEARCH_CITATIONS = 20;

export interface MimoCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
}

export interface MimoUrlCitation {
  type?: string;
  url: string;
  title?: string;
  summary?: string;
  site_name?: string;
  publish_time?: string;
  logo_url?: string;
}

export interface MimoCompletion {
  annotations: MimoUrlCitation[];
  finishReason: string | null;
  text: string;
  toolCalls: MimoToolCall[];
  usage: MimoCompletionUsage;
  webSearchError: string | null;
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
    annotations?: unknown;
    content?: string;
    error_message?: string;
    tool_calls?: ToolCallDelta[];
  };
  error_message?: string;
  finish_reason?: string | null;
  message?: {
    annotations?: unknown;
    content?: string | null;
    error_message?: string;
    tool_calls?: unknown[];
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
  const annotations = new Map<string, MimoUrlCitation>();
  const toolCalls = new Map<number, { arguments: string; id: string; name: string }>();
  let text = '';
  let finishReason: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  let webSearchError: string | null = null;

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
    if (typeof choice?.delta?.content === 'string' && choice.delta.content) {
      text += choice.delta.content;
    }
    if (typeof choice?.message?.content === 'string' && choice.message.content) {
      text = choice.message.content;
    }

    for (const citation of [
      ...normalizeMimoAnnotations(choice?.delta?.annotations),
      ...normalizeMimoAnnotations(choice?.message?.annotations),
    ]) {
      annotations.set(citation.url, mergeMimoCitation(annotations.get(citation.url), citation));
    }

    const searchError = choice?.error_message
      ?? choice?.delta?.error_message
      ?? choice?.message?.error_message;
    if (searchError) {
      webSearchError = searchError;
    }

    for (const delta of choice?.delta?.tool_calls ?? []) {
      mergeToolCallDelta(toolCalls, delta);
    }
    if (choice?.message?.tool_calls) {
      choice.message.tool_calls.forEach((call, index) => {
        const normalized = normalizePersistedToolCall(call, index);
        if (normalized) {
          toolCalls.set(index, normalized);
        }
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
    annotations: [...annotations.values()].slice(0, MAX_MIMO_WEB_SEARCH_CITATIONS),
    webSearchError,
    finishReason,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
    },
  };
}

function mergeMimoCitation(
  existing: MimoUrlCitation | undefined,
  next: MimoUrlCitation,
): MimoUrlCitation {
  return {
    type: next.type ?? existing?.type,
    url: next.url,
    title: next.title ?? existing?.title,
    summary: next.summary ?? existing?.summary,
    site_name: next.site_name ?? existing?.site_name,
    publish_time: next.publish_time ?? existing?.publish_time,
    logo_url: next.logo_url ?? existing?.logo_url,
  };
}

export function formatMimoWebSearchResult(citations: MimoUrlCitation[]): string {
  const links = citations
    .filter((citation) => citation.url)
    .map((citation) => ({
      title: citation.title || citation.site_name || citation.url,
      url: citation.url,
    }));
  const summary = citations.find((citation) => citation.summary)?.summary;
  return summary
    ? `Links: ${JSON.stringify(links)}\n${summary}`
    : `Links: ${JSON.stringify(links)}`;
}

function normalizeMimoAnnotations(raw: unknown): MimoUrlCitation[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const citations: MimoUrlCitation[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.url !== 'string' || !isSafeHttpUrl(record.url)) {
      continue;
    }
    citations.push({
      type: typeof record.type === 'string' ? record.type : undefined,
      url: record.url.trim(),
      title: typeof record.title === 'string' ? record.title : undefined,
      summary: typeof record.summary === 'string' ? record.summary : undefined,
      site_name: typeof record.site_name === 'string' ? record.site_name : undefined,
      publish_time: typeof record.publish_time === 'string' ? record.publish_time : undefined,
      logo_url: typeof record.logo_url === 'string' ? record.logo_url : undefined,
    });
  }
  return citations;
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

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizePersistedToolCall(
  call: unknown,
  index: number,
): { arguments: string; id: string; name: string } | null {
  if (!call || typeof call !== 'object') {
    return null;
  }
  const record = call as Record<string, unknown>;
  const fn = record.function && typeof record.function === 'object'
    ? record.function as Record<string, unknown>
    : null;
  const name = typeof fn?.name === 'string' && fn.name
    ? fn.name
    : record.type === 'web_search'
      ? 'web_search'
      : '';
  if (!name) {
    return null;
  }
  return {
    id: typeof record.id === 'string' && record.id ? record.id : `call_${index}`,
    name,
    arguments: typeof fn?.arguments === 'string' ? fn.arguments : '',
  };
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
  } else if (!current.name && delta.type === 'web_search') {
    current.name = 'web_search';
  }
  const argChunk = delta.function?.arguments ?? delta.arguments;
  if (argChunk) {
    current.arguments += argChunk;
  }
  toolCalls.set(index, current);
}
