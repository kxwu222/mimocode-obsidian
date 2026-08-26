import { TOOL_GLOB, TOOL_GREP, TOOL_LS, TOOL_READ } from '@/core/tools/toolNames';
import {
  executeVaultTool,
  globToRegExp,
  type VaultToolContext,
} from '@/providers/mimo/runtime/vaultTools';

function createContext(files: Record<string, string>, configDir = '.obsidian'): VaultToolContext {
  return {
    configDir,
    listMarkdownFiles: () => Object.keys(files).map((path) => ({ path })),
    readNote: async (path) => files[path] ?? null,
  };
}

describe('executeVaultTool', () => {
  const ctx = createContext({
    'notes/daily.md': 'Today I wrote about cats.',
    'notes/projects/alpha.md': 'Alpha ships next week.',
    'inbox.md': 'TODO: review alpha',
    '.obsidian/workspace.json': 'secret',
  });

  it('lists notes and skips blocked config files', async () => {
    const result = await executeVaultTool(TOOL_LS, {}, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain('notes/daily.md');
    expect(result.content).toContain('inbox.md');
    expect(result.content).not.toContain('workspace.json');
  });

  it('lists a folder', async () => {
    const result = await executeVaultTool(TOOL_LS, { path: 'notes/projects' }, ctx);
    expect(result.content).toContain('notes/projects/alpha.md');
    expect(result.content).not.toContain('inbox.md');
  });

  it('globs note paths', async () => {
    expect(globToRegExp('notes/**/*.md').test('notes/projects/alpha.md')).toBe(true);
    const result = await executeVaultTool(TOOL_GLOB, { pattern: 'notes/**/*.md' }, ctx);
    expect(result.content).toContain('notes/daily.md');
    expect(result.content).toContain('notes/projects/alpha.md');
    expect(result.content).not.toContain('inbox.md');
  });

  it('reads a note and rejects blocked or missing paths', async () => {
    const ok = await executeVaultTool(TOOL_READ, { file_path: 'notes/daily.md' }, ctx);
    expect(ok).toEqual({ content: 'Today I wrote about cats.', isError: false });

    const blocked = await executeVaultTool(TOOL_READ, { file_path: '.obsidian/workspace.json' }, ctx);
    expect(blocked.isError).toBe(true);

    const missing = await executeVaultTool(TOOL_READ, { file_path: 'missing.md' }, ctx);
    expect(missing.isError).toBe(true);

    const traversal = await executeVaultTool(TOOL_READ, { file_path: '../secret.md' }, ctx);
    expect(traversal.isError).toBe(true);
  });

  it('searches note contents', async () => {
    const result = await executeVaultTool(TOOL_GREP, { pattern: 'alpha' }, ctx);
    expect(result.isError).toBe(false);
    expect(result.content).toContain('notes/projects/alpha.md');
    expect(result.content).toContain('inbox.md');
  });
});
