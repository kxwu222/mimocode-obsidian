import { requestUrl, TFile } from 'obsidian';

import type { StreamChunk } from '@/core/types';
import type ClaudianPlugin from '@/main';
import { MimoChatRuntime } from '@/providers/mimo/runtime/MimoChatRuntime';

const requestUrlMock = requestUrl as jest.Mock;

function sse(frames: unknown[]): string {
  return `${frames.map((frame) => `data: ${JSON.stringify(frame)}`).join('\n')}\ndata: [DONE]\n`;
}

function createTFile(path: string): TFile {
  return new (TFile as unknown as new (path: string) => TFile)(path);
}

function createPlugin(files: Record<string, string>): ClaudianPlugin {
  const markdownFiles = Object.keys(files)
    .filter((path) => path.endsWith('.md'))
    .map((path) => createTFile(path));

  return {
    settings: {
      model: 'mimo-v2.5',
      providerConfigs: {
        mimo: {
          enabled: true,
          billingMode: 'payg',
          apiKey: 'sk-test',
          cluster: 'ams',
          model: 'mimo-v2.5',
        },
      },
    },
    app: {
      vault: {
        configDir: '.obsidian',
        getMarkdownFiles: () => markdownFiles,
        getAbstractFileByPath: (path: string) => (
          Object.prototype.hasOwnProperty.call(files, path) ? createTFile(path) : null
        ),
        cachedRead: async (file: TFile) => files[file.path] ?? null,
      },
      workspace: {
        getLeavesOfType: () => [],
      },
    },
  } as unknown as ClaudianPlugin;
}

async function collect(runtime: MimoChatRuntime, text: string): Promise<StreamChunk[]> {
  const turn = runtime.prepareTurn({
    text,
    attachedFilePaths: [],
  });
  const chunks: StreamChunk[] = [];
  for await (const chunk of runtime.query(turn, [])) {
    chunks.push(chunk);
  }
  return chunks;
}

describe('MimoChatRuntime vault tools', () => {
  beforeEach(() => {
    requestUrlMock.mockReset();
  });

  it('sends vault tools and executes a Read call before answering', async () => {
    requestUrlMock
      .mockResolvedValueOnce({
        status: 200,
        text: sse([
          {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call_read',
                  type: 'function',
                  function: { name: 'Read', arguments: '{"file_path":"notes/hello.md"}' },
                }],
              },
              finish_reason: 'tool_calls',
            }],
          },
        ]),
      })
      .mockResolvedValueOnce({
        status: 200,
        text: sse([
          {
            choices: [{
              delta: { content: 'The note says hello.' },
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 20, completion_tokens: 6 },
          },
        ]),
      });

    const runtime = new MimoChatRuntime(createPlugin({
      'notes/hello.md': 'hello from the vault',
    }));
    const chunks = await collect(runtime, 'What does hello.md say?');

    expect(JSON.parse(requestUrlMock.mock.calls[0][0].body).tools.length).toBeGreaterThan(0);
    expect(chunks).toEqual(expect.arrayContaining([
      { type: 'tool_use', id: 'call_read', name: 'Read', input: { file_path: 'notes/hello.md' } },
      {
        type: 'tool_result',
        id: 'call_read',
        content: 'hello from the vault',
        isError: false,
      },
      { type: 'text', content: 'The note says hello.' },
      { type: 'done' },
    ]));

    const secondBody = JSON.parse(requestUrlMock.mock.calls[1][0].body);
    expect(secondBody.messages.some((message: { role: string }) => message.role === 'tool')).toBe(true);
  });
});
