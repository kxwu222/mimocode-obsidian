import { TOOL_WEB_SEARCH } from '../../../core/tools/toolNames';
import type { StreamChunk } from '../../../core/types';
import type { OpenAIToolDef } from './McpToolRunner';
import {
  formatMimoWebSearchResult,
  type MimoUrlCitation,
} from './parseMimoCompletion';
import { MIMO_VAULT_TOOLS } from './vaultTools';

export const MIMO_WEB_SEARCH_TOOL = {
  type: 'web_search',
  max_keyword: 3,
  force_search: false,
  limit: 5,
} as const;

export type MimoChatTool = OpenAIToolDef | typeof MIMO_WEB_SEARCH_TOOL;

const SERVER_WEB_SEARCH_NAMES = new Set(['web_search', TOOL_WEB_SEARCH]);

export function buildMimoChatTools(webSearch: boolean): MimoChatTool[] {
  return webSearch ? [...MIMO_VAULT_TOOLS, MIMO_WEB_SEARCH_TOOL] : [...MIMO_VAULT_TOOLS];
}

export function hasMimoWebSearchTool(tools: readonly MimoChatTool[]): boolean {
  return tools.some((tool) => tool.type === 'web_search');
}

export function isMimoServerSearchTool(name: string): boolean {
  return SERVER_WEB_SEARCH_NAMES.has(name);
}

export function* emitMimoWebSearchChunks(
  citations: MimoUrlCitation[],
  errorMessage: string | null,
  callId: string,
  queryHint?: string,
): Generator<StreamChunk> {
  if (citations.length === 0 && !errorMessage && !queryHint) {
    return;
  }

  const query = citations[0]?.title || citations[0]?.site_name || queryHint || 'web';
  yield {
    type: 'tool_use',
    id: callId,
    name: TOOL_WEB_SEARCH,
    input: { actionType: 'search', query },
  };

  if (errorMessage && citations.length === 0) {
    yield { type: 'tool_result', id: callId, content: errorMessage, isError: true };
    return;
  }

  yield {
    type: 'tool_result',
    id: callId,
    content: citations.length > 0 ? formatMimoWebSearchResult(citations) : 'Search complete.',
    isError: false,
  };
}
