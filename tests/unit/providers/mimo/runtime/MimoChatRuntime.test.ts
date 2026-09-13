import { requestUrl, TFile } from 'obsidian';

import type { ChatMessage, StreamChunk } from '@/core/types';
import type ClaudianPlugin from '@/main';
import {
  formatMimoHttpError,
  formatMimoWebSearchFallbackNotice,
  isMimoWebSearchUnavailable,
  MimoChatRuntime,
} from '@/providers/mimo/runtime/MimoChatRuntime';
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
          webSearch: true,
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

async function collect(
  runtime: MimoChatRuntime,
  text: string,
  conversationHistory: ChatMessage[] = [],
): Promise<StreamChunk[]> {
  const turn = runtime.prepareTurn({
    text,
    attachedFilePaths: [],
  });
  const chunks: StreamChunk[] = [];
  for await (const chunk of runtime.query(turn, conversationHistory)) {
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

    const firstBody = JSON.parse(requestUrlMock.mock.calls[0][0].body);
    expect(firstBody.tools.length).toBeGreaterThan(0);
    expect(firstBody.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'web_search' }),
    ]));
    const systemPrompt = firstBody.messages[0].content as string;
    expect(systemPrompt).toContain(getLocalIsoDate());
    expect(systemPrompt).toContain('[[folder/note.md]]');
    expect(systemPrompt).toContain('public web');
    expect(systemPrompt).toContain('file tools');
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
      .filter((tool: { type: string }) => tool.type === 'function')
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

  it('routes image turns to mimo-v2.5 even when Pro is selected', async () => {
    requestUrlMock.mockResolvedValueOnce({
      status: 200,
      text: sse([
        {
          choices: [{
            delta: { content: 'A forest.' },
            finish_reason: 'stop',
          }],
        },
      ]),
    });

    const plugin = createPlugin({});
    plugin.settings.model = 'mimo-v2.5-pro';
    const mimoConfig = plugin.settings.providerConfigs?.mimo;
    if (mimoConfig) {
      mimoConfig.model = 'mimo-v2.5-pro';
    }

    const runtime = new MimoChatRuntime(plugin);
    const turn = runtime.prepareTurn({
      text: 'what is this',
      attachedFilePaths: [],
      images: [{
        id: 'img-1',
        name: 'shot.png',
        mediaType: 'image/png',
        data: 'iVBORw0KGgo',
        size: 12,
        source: 'paste',
      }],
    });

    const chunks: StreamChunk[] = [];
    for await (const chunk of runtime.query(turn, [])) {
      chunks.push(chunk);
    }

    const body = JSON.parse(requestUrlMock.mock.calls[0][0].body);
    expect(body.model).toBe('mimo-v2.5');
    expect(body.messages[1].content).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo' } },
      { type: 'text', text: 'what is this' },
    ]);
    expect(body.tools.some((tool: { type: string }) => tool.type === 'web_search')).toBe(false);
    expect(body.messages[0].content).not.toContain('public web');
    expect(chunks).toEqual(expect.arrayContaining([
      { type: 'text', content: 'A forest.' },
      { type: 'done' },
    ]));
  });

  it('allows web search on a text follow-up while retaining a historical image', async () => {
    requestUrlMock.mockResolvedValueOnce({
      status: 200,
      text: sse([
        {
          choices: [{
            delta: { content: 'Current product details.' },
            finish_reason: 'stop',
          }],
        },
      ]),
    });
    const history: ChatMessage[] = [{
      id: 'u-image',
      role: 'user',
      content: 'What is this?',
      timestamp: 1,
      images: [{
        id: 'img-history',
        name: 'product.png',
        mediaType: 'image/png',
        data: 'aGlzdG9yeQ==',
        size: 7,
        source: 'paste',
      }],
    }];

    const runtime = new MimoChatRuntime(createPlugin({}));
    await collect(runtime, 'Find its current price online', history);

    const body = JSON.parse(requestUrlMock.mock.calls[0][0].body);
    expect(body.model).toBe('mimo-v2.5');
    expect(body.tools.some((tool: { type: string }) => tool.type === 'web_search')).toBe(true);
    expect(body.messages[1].content[0]).toEqual({
      type: 'image_url',
      image_url: { url: 'data:image/png;base64,aGlzdG9yeQ==' },
    });
  });

  it('emits WebSearch citations from streamed annotations', async () => {
    requestUrlMock.mockResolvedValueOnce({
      status: 200,
      text: sse([
        {
          choices: [{
            delta: {
              annotations: [{
                type: 'url_citation',
                url: 'https://weather.example',
                title: 'London weather',
                summary: 'Rain tomorrow',
              }],
              content: 'Rain in London tomorrow.',
            },
            finish_reason: 'stop',
          }],
        },
      ]),
    });

    const runtime = new MimoChatRuntime(createPlugin({}));
    const chunks = await collect(runtime, 'Weather in London?');

    expect(chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'tool_use',
        name: 'WebSearch',
        input: { actionType: 'search', query: 'London weather' },
      }),
      expect.objectContaining({
        type: 'tool_result',
        content: expect.stringContaining('https://weather.example'),
        isError: false,
      }),
      { type: 'text', content: 'Rain in London tomorrow.' },
      { type: 'done' },
    ]));
  });

  it('omits web_search when the setting is off', async () => {
    requestUrlMock.mockResolvedValueOnce({
      status: 200,
      text: sse([
        {
          choices: [{
            delta: { content: 'Hello.' },
            finish_reason: 'stop',
          }],
        },
      ]),
    });

    const plugin = createPlugin({});
    const mimoConfig = plugin.settings.providerConfigs?.mimo;
    if (mimoConfig) {
      mimoConfig.webSearch = false;
    }

    const runtime = new MimoChatRuntime(plugin);
    await collect(runtime, 'Hello');

    const body = JSON.parse(requestUrlMock.mock.calls[0][0].body);
    expect(body.tools.some((tool: { type: string }) => tool.type === 'web_search')).toBe(false);
    expect(body.messages[0].content).not.toContain('public web');
  });

  it('retries without web_search when the console plugin is missing', async () => {
    requestUrlMock
      .mockResolvedValueOnce({
        status: 400,
        text: '{"error":{"message":"web search tool found in the request body, but webSearchEnabled is false"}}',
      })
      .mockResolvedValueOnce({
        status: 200,
        text: sse([
          {
            choices: [{
              delta: { content: 'Answering from memory.' },
              finish_reason: 'stop',
            }],
          },
        ]),
      });

    const runtime = new MimoChatRuntime(createPlugin({}));
    const chunks = await collect(runtime, 'Latest news');

    expect(requestUrlMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(requestUrlMock.mock.calls[1][0].body).tools.some(
      (tool: { type: string }) => tool.type === 'web_search',
    )).toBe(false);
    expect(chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'notice',
        content: expect.stringContaining('webSearchEnabled is false'),
      }),
      { type: 'text', content: 'Answering from memory.' },
      { type: 'done' },
    ]));
    expect(chunks.find((chunk) => chunk.type === 'notice')).not.toEqual(
      expect.objectContaining({ level: 'warning' }),
    );
  });

  it('does not send web_search again after a plugin failure in a later vault round', async () => {
    requestUrlMock
      .mockResolvedValueOnce({
        status: 400,
        text: '{"error":{"message":"Web Search Plugin is not enabled"}}',
      })
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
              delta: { content: 'Read after search fallback.' },
              finish_reason: 'stop',
            }],
          },
        ]),
      });

    const runtime = new MimoChatRuntime(createPlugin({
      'notes/hello.md': 'hello from the vault',
    }));
    const chunks = await collect(runtime, 'Read hello after search fails');

    expect(requestUrlMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(requestUrlMock.mock.calls[2][0].body).tools.some(
      (tool: { type: string }) => tool.type === 'web_search',
    )).toBe(false);
    expect(chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'notice' }),
      { type: 'tool_use', id: 'call_read', name: 'Read', input: { file_path: 'notes/hello.md' } },
      { type: 'text', content: 'Read after search fallback.' },
      { type: 'done' },
    ]));
  });

  it('does not start a second HTTP round for a native web_search tool call', async () => {
    requestUrlMock.mockResolvedValueOnce({
      status: 200,
      text: sse([
        {
          choices: [{
            delta: {
              annotations: [{ url: 'https://news.example', title: 'News' }],
              content: 'Here is the news.',
              tool_calls: [{ index: 0, id: 'ws_1', type: 'web_search' }],
            },
            finish_reason: 'tool_calls',
          }],
        },
      ]),
    });

    const runtime = new MimoChatRuntime(createPlugin({}));
    const chunks = await collect(runtime, 'News');

    expect(requestUrlMock).toHaveBeenCalledTimes(1);
    expect(chunks.filter((chunk) => chunk.type === 'text')).toEqual([
      { type: 'text', content: 'Here is the news.' },
    ]);
    expect(chunks.at(-1)).toEqual({ type: 'done' });
  });

  it('runs vault tools in the same turn as web citations', async () => {
    requestUrlMock
      .mockResolvedValueOnce({
        status: 200,
        text: sse([
          {
            choices: [{
              delta: {
                annotations: [{ url: 'https://ref.example', title: 'Ref' }],
                tool_calls: [{
                  index: 0,
                  id: 'call_grep',
                  type: 'function',
                  function: { name: 'Grep', arguments: '{"pattern":"hello"}' },
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
              delta: { content: 'Vault and web both used.' },
              finish_reason: 'stop',
            }],
          },
        ]),
      });

    const runtime = new MimoChatRuntime(createPlugin({
      'notes/hello.md': 'hello from the vault',
    }));
    const chunks = await collect(runtime, 'Search vault and web');

    expect(chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'tool_use', name: 'WebSearch' }),
      expect.objectContaining({ type: 'tool_use', name: 'Grep' }),
      { type: 'text', content: 'Vault and web both used.' },
      { type: 'done' },
    ]));
  });

  it('does not retry a 500 that happens to mention web_search', async () => {
    requestUrlMock.mockResolvedValueOnce({
      status: 500,
      text: '{"error":{"message":"web_search upstream timeout"}}',
    });

    const runtime = new MimoChatRuntime(createPlugin({}));
    const chunks = await collect(runtime, 'News');

    expect(requestUrlMock).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'error', content: expect.stringContaining('500') }),
      { type: 'done' },
    ]));
  });
});

describe('formatMimoHttpError', () => {
  it('explains the image-input 404 instead of dumping the gateway JSON', () => {
    expect(formatMimoHttpError(404, '{"error":{"message":"No endpoints found that support image input"}}'))
      .toContain('Only mimo-v2.5 accepts images');
  });

  it('explains a missing Web Search Plugin instead of dumping the gateway JSON', () => {
    expect(formatMimoHttpError(400, '{"error":{"message":"Web Search Plugin is not enabled"}}'))
      .toContain('Web Search Plugin');
  });
});

describe('formatMimoWebSearchFallbackNotice', () => {
  it('explains that the Obsidian toggle is not Xiaomi webSearchEnabled', () => {
    expect(formatMimoWebSearchFallbackNotice(
      'web search tool found in the request body, but webSearchEnabled is false',
    )).toContain('Token Plan');
  });
});

describe('isMimoWebSearchUnavailable', () => {
  it('retries only client plugin errors, not outages or auth failures', () => {
    expect(isMimoWebSearchUnavailable(400, 'Web Search Plugin is not enabled')).toBe(true);
    expect(isMimoWebSearchUnavailable(403, '联网服务未开通')).toBe(true);
    expect(isMimoWebSearchUnavailable(422, 'tools: web_search is not supported')).toBe(true);
    expect(isMimoWebSearchUnavailable(500, 'web_search upstream timeout')).toBe(false);
    expect(isMimoWebSearchUnavailable(401, 'invalid api key')).toBe(false);
    expect(isMimoWebSearchUnavailable(400, 'bad request')).toBe(false);
  });
});
