import { TOOL_WEB_SEARCH } from '@/core/tools/toolNames';
import { buildMimoChatTools, emitMimoWebSearchChunks, MIMO_WEB_SEARCH_TOOL } from '@/providers/mimo/runtime/mimoChatTools';

describe('buildMimoChatTools', () => {
  it('appends the built-in web_search tool when enabled', () => {
    const tools = buildMimoChatTools(true);
    expect(tools).toContainEqual(MIMO_WEB_SEARCH_TOOL);
    expect(tools.some((tool) => tool.type === 'function' && tool.function.name === 'Grep')).toBe(true);
  });

  it('omits web_search when disabled', () => {
    expect(buildMimoChatTools(false)).not.toContainEqual(MIMO_WEB_SEARCH_TOOL);
  });
});

describe('emitMimoWebSearchChunks', () => {
  it('emits a WebSearch tool pair from citations', () => {
    expect([...emitMimoWebSearchChunks(
      [{ url: 'https://a.example', title: 'Weather' }],
      null,
      'mimo-web-search-0',
    )]).toEqual([
      {
        type: 'tool_use',
        id: 'mimo-web-search-0',
        name: TOOL_WEB_SEARCH,
        input: { actionType: 'search', query: 'Weather' },
      },
      {
        type: 'tool_result',
        id: 'mimo-web-search-0',
        content: 'Links: [{"title":"Weather","url":"https://a.example"}]',
        isError: false,
      },
    ]);
  });

  it('emits an error result when search failed with no citations', () => {
    expect([...emitMimoWebSearchChunks([], 'plugin off', 'mimo-web-search-1')]).toEqual([
      {
        type: 'tool_use',
        id: 'mimo-web-search-1',
        name: TOOL_WEB_SEARCH,
        input: { actionType: 'search', query: 'web' },
      },
      {
        type: 'tool_result',
        id: 'mimo-web-search-1',
        content: 'plugin off',
        isError: true,
      },
    ]);
  });
});
