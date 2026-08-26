import { requestUrl, TFile } from 'obsidian';

import type { StreamChunk } from '@/core/types';
import type ClaudianPlugin from '@/main';
import { MimoChatRuntime } from '@/providers/mimo/runtime/MimoChatRuntime';
import { getLocalIsoDate } from '@/utils/date';

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

  const vault = {
    configDir: '.obsidian',
    getMarkdownFiles: () => markdownFiles,
    getAbstractFileByPath: (path: string) => (
      Object.prototype.hasOwnProperty.call(files, path) ? createTFile(path) : null
    ),
    cachedRead: async (file: TFile) => files[file.path] ?? null,
    create: async (path: string, contents: string) => {
      files[path] = contents;
      const file = createTFile(path);
      markdownFiles.push(file);
      return file;
    },
    modify: async (file: TFile, contents: string) => {
      files[file.path] = contents;
    },
    createFolder: async () => undefined,
    trash: async (file: TFile) => {
      delete files[file.path];
      const index = markdownFiles.findIndex((entry) => entry.path === file.path);
      if (index >= 0) {
        markdownFiles.splice(index, 1);
      }
    },
  };

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
      vault,
      fileManager: {
        trashFile: async (file: TFile) => {
          await vault.trash(file);
        },
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
    const systemPrompt = JSON.parse(requestUrlMock.mock.calls[0][0].body).messages[0].content as string;
    expect(systemPrompt).toContain(getLocalIsoDate());
    expect(systemPrompt).toContain('[[folder/note.md]]');
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

  it('executes a Write call and persists the note', async () => {
    requestUrlMock
      .mockResolvedValueOnce({
        status: 200,
        text: sse([
          {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call_write',
                  type: 'function',
                  function: {
                    name: 'Write',
                    arguments: '{"file_path":"notes/new.md","contents":"created by mimo"}',
                  },
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
              delta: { content: 'Created the note.' },
              finish_reason: 'stop',
            }],
          },
        ]),
      });

    const files: Record<string, string> = {};
    const runtime = new MimoChatRuntime(createPlugin(files));
    const chunks = await collect(runtime, 'Create notes/new.md');

    expect(files['notes/new.md']).toBe('created by mimo');
    expect(chunks).toEqual(expect.arrayContaining([
      {
        type: 'tool_use',
        id: 'call_write',
        name: 'Write',
        input: { file_path: 'notes/new.md', contents: 'created by mimo' },
      },
      {
        type: 'tool_result',
        id: 'call_write',
        content: 'Created [[notes/new.md]]',
        isError: false,
      },
      { type: 'text', content: 'Created the note.' },
      { type: 'done' },
    ]));

    const toolNames = JSON.parse(requestUrlMock.mock.calls[0][0].body).tools
      .map((tool: { function: { name: string } }) => tool.function.name);
    expect(toolNames).toEqual(expect.arrayContaining(['Read', 'Write', 'Edit', 'Delete']));
  });

  it('executes a Delete call by trashing the note', async () => {
    requestUrlMock
      .mockResolvedValueOnce({
        status: 200,
        text: sse([
          {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call_delete',
                  type: 'function',
                  function: {
                    name: 'Delete',
                    arguments: '{"file_path":"notes/hello.md"}',
                  },
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
              delta: { content: 'Trashed the note.' },
              finish_reason: 'stop',
            }],
          },
        ]),
      });

    const files: Record<string, string> = { 'notes/hello.md': 'hello from the vault' };
    const runtime = new MimoChatRuntime(createPlugin(files));
    const chunks = await collect(runtime, 'Trash notes/hello.md');

    expect(files).toEqual({});
    expect(chunks).toEqual(expect.arrayContaining([
      {
        type: 'tool_result',
        id: 'call_delete',
        content: 'Moved [[notes/hello.md]] to trash.',
        isError: false,
      },
      { type: 'text', content: 'Trashed the note.' },
      { type: 'done' },
    ]));
  });
});
