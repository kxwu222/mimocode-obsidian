import { parseMimoCompletion, parseToolArguments } from '@/providers/mimo/runtime/parseMimoCompletion';

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
      finishReason: 'stop',
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    });
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

describe('parseToolArguments', () => {
  it('parses object arguments and ignores invalid JSON', () => {
    expect(parseToolArguments('{"file_path":"a.md"}')).toEqual({ file_path: 'a.md' });
    expect(parseToolArguments('not-json')).toEqual({});
    expect(parseToolArguments('')).toEqual({});
  });
});
