import {
  formatMimoWebSearchResult,
  parseMimoCompletion,
  parseToolArguments,
} from '@/providers/mimo/runtime/parseMimoCompletion';

describe('parseMimoCompletion', () => {
  it('accumulates streamed text and usage', () => {
    const parsed = parseMimoCompletion([
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      'data: {"choices":[{"delta":{"content":" world"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2}}',
      'data: [DONE]',
    ].join('\n'));

    expect(parsed).toEqual({
      text: 'Hello world',
      toolCalls: [],
      annotations: [],
      webSearchError: null,
      finishReason: 'stop',
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    });
  });

  it('collects unique web search annotations from delta and message frames', () => {
    const parsed = parseMimoCompletion([
      'data: {"choices":[{"delta":{"annotations":[{"type":"url_citation","url":"https://a.example","title":"A","summary":"First"}]}}]}',
      'data: {"choices":[{"delta":{"annotations":[{"type":"url_citation","url":"https://a.example","title":"A"}]},"message":{"annotations":[{"url":"https://b.example","title":"B","site_name":"B site"}]}}]}',
    ].join('\n'));

    expect(parsed.annotations).toEqual([
      { type: 'url_citation', url: 'https://a.example', title: 'A', summary: 'First' },
      { url: 'https://b.example', title: 'B', site_name: 'B site' },
    ]);
  });

  it('keeps a web search error_message from the choice', () => {
    const parsed = parseMimoCompletion(
      'data: {"choices":[{"delta":{"content":"ok"},"error_message":"Web Search Plugin is not enabled"}]}\n',
    );
    expect(parsed.webSearchError).toBe('Web Search Plugin is not enabled');
  });

  it('does not throw on native web_search tool calls without a function body', () => {
    expect(() => parseMimoCompletion(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"ws_1","type":"web_search"}]},"message":{"tool_calls":[{"id":"ws_1","type":"web_search"}]}}]}\n',
    )).not.toThrow();

    const parsed = parseMimoCompletion(
      'data: {"choices":[{"message":{"tool_calls":[{"id":"ws_1","type":"web_search"}]},"finish_reason":"stop"}]}\n',
    );
    expect(parsed.toolCalls).toEqual([
      { id: 'ws_1', type: 'function', function: { name: 'web_search', arguments: '' } },
    ]);
  });

  it('drops unsafe and incomplete annotations and keeps later delta text', () => {
    const parsed = parseMimoCompletion([
      'data: not-json',
      'data: {"choices":[{"delta":{"annotations":[null,{"title":"No url"},{"url":"javascript:alert(1)"},{"url":"https://ok.example","title":"Ok"}]}}]}',
      'data: {"choices":[{"message":{"content":["array","parts"]},"delta":{"content":"Kept"}}]}',
    ].join('\n'));

    expect(parsed.annotations).toEqual([
      { url: 'https://ok.example', title: 'Ok' },
    ]);
    expect(parsed.text).toBe('Kept');
  });

  it('caps a flood of citations', () => {
    const annotations = Array.from({ length: 40 }, (_, index) => ({
      url: `https://n${index}.example`,
      title: `N${index}`,
    }));
    const parsed = parseMimoCompletion(
      `data: ${JSON.stringify({ choices: [{ delta: { annotations } }] })}\n`,
    );
    expect(parsed.annotations).toHaveLength(20);
    expect(parsed.annotations[0]?.url).toBe('https://n0.example');
    expect(parsed.annotations[19]?.url).toBe('https://n19.example');
  });

  it('merges streamed tool call deltas by index', () => {
    const parsed = parseMimoCompletion([
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"Read","arguments":""}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"file_path\\":\\"notes/a.md\\"}"}}]},"finish_reason":"tool_calls"}]}',
    ].join('\n'));

    expect(parsed.finishReason).toBe('tool_calls');
    expect(parsed.toolCalls).toEqual([
      {
        id: 'call_1',
        type: 'function',
        function: { name: 'Read', arguments: '{"file_path":"notes/a.md"}' },
      },
    ]);
  });
});

describe('formatMimoWebSearchResult', () => {
  it('formats citations for the existing WebSearch renderer', () => {
    expect(formatMimoWebSearchResult([
      { url: 'https://a.example', title: 'A', summary: 'First hit' },
      { url: 'https://b.example', site_name: 'B site' },
    ])).toBe('Links: [{"title":"A","url":"https://a.example"},{"title":"B site","url":"https://b.example"}]\nFirst hit');
  });
});

describe('parseToolArguments', () => {
  it('parses object arguments and ignores invalid JSON', () => {
    expect(parseToolArguments('{"file_path":"a.md"}')).toEqual({ file_path: 'a.md' });
    expect(parseToolArguments('not-json')).toEqual({});
    expect(parseToolArguments('')).toEqual({});
  });
});
