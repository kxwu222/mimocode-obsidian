import { TOOL_EDIT, TOOL_GLOB, TOOL_GREP, TOOL_LS, TOOL_READ, TOOL_WRITE } from '@/core/tools/toolNames';
import { MAX_CHARS_PER_VAULT_NOTE } from '@/providers/mimo/runtime/vaultNoteContext';
import {
  executeVaultTool,
  globToRegExp,
  TOOL_DELETE,
  type VaultToolContext,
} from '@/providers/mimo/runtime/vaultTools';

function createContext(files: Record<string, string>, configDir = '.obsidian'): VaultToolContext {
  return {
    configDir,
    listMarkdownFiles: () => Object.keys(files).map((path) => ({ path })),
    readNote: async (path) => files[path] ?? null,
    writeNote: async (path, contents) => {
      const existed = Object.prototype.hasOwnProperty.call(files, path);
      files[path] = contents;
      return existed ? 'updated' : 'created';
    },
    trashNote: async (path) => {
      if (!Object.prototype.hasOwnProperty.call(files, path)) {
        return false;
      }
      delete files[path];
      return true;
    },
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
    expect(result.content).toContain('[[notes/daily.md]]');
    expect(result.content).toContain('[[inbox.md]]');
    expect(result.content).not.toContain('workspace.json');
  });

  it('lists a folder', async () => {
    const result = await executeVaultTool(TOOL_LS, { path: 'notes/projects' }, ctx);
    expect(result.content).toContain('[[notes/projects/alpha.md]]');
    expect(result.content).not.toContain('inbox.md');
  });

  it('globs note paths', async () => {
    expect(globToRegExp('notes/**/*.md').test('notes/projects/alpha.md')).toBe(true);
    const result = await executeVaultTool(TOOL_GLOB, { pattern: 'notes/**/*.md' }, ctx);
    expect(result.content).toContain('[[notes/daily.md]]');
    expect(result.content).toContain('[[notes/projects/alpha.md]]');
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
    expect(result.content).toContain('[[notes/projects/alpha.md]]');
    expect(result.content).toContain('[[inbox.md]]');
  });

  it('creates and overwrites notes', async () => {
    const files: Record<string, string> = { 'notes/daily.md': 'old' };
    const writable = createContext(files);

    const created = await executeVaultTool(TOOL_WRITE, {
      file_path: 'notes/new.md',
      contents: 'hello',
    }, writable);
    expect(created).toEqual({ content: 'Created [[notes/new.md]]', isError: false });
    expect(files['notes/new.md']).toBe('hello');

    const updated = await executeVaultTool(TOOL_WRITE, {
      file_path: 'notes/daily.md',
      content: 'new body',
    }, writable);
    expect(updated).toEqual({ content: 'Updated [[notes/daily.md]]', isError: false });
    expect(files['notes/daily.md']).toBe('new body');
  });

  it('rejects unsafe writes', async () => {
    const files: Record<string, string> = {};
    const writable = createContext(files);

    const blocked = await executeVaultTool(TOOL_WRITE, {
      file_path: '.obsidian/app.json',
      contents: '{}',
    }, writable);
    expect(blocked.isError).toBe(true);
    expect(files).toEqual({});

    const traversal = await executeVaultTool(TOOL_WRITE, {
      file_path: '../secret.md',
      contents: 'nope',
    }, writable);
    expect(traversal.isError).toBe(true);

    const binary = await executeVaultTool(TOOL_WRITE, {
      file_path: 'photo.png',
      contents: 'nope',
    }, writable);
    expect(binary.isError).toBe(true);

    const tooLarge = await executeVaultTool(TOOL_WRITE, {
      file_path: 'notes/huge.md',
      contents: 'x'.repeat(MAX_CHARS_PER_VAULT_NOTE + 1),
    }, writable);
    expect(tooLarge.isError).toBe(true);
    expect(tooLarge.content).toContain('character limit');
  });

  it('edits a unique snippet and supports replace_all', async () => {
    const files: Record<string, string> = {
      'notes/daily.md': 'alpha beta alpha',
    };
    const editable = createContext(files);

    const unique = await executeVaultTool(TOOL_EDIT, {
      file_path: 'notes/daily.md',
      old_string: 'beta',
      new_string: 'gamma',
    }, editable);
    expect(unique.isError).toBe(false);
    expect(files['notes/daily.md']).toBe('alpha gamma alpha');

    const notUnique = await executeVaultTool(TOOL_EDIT, {
      file_path: 'notes/daily.md',
      old_string: 'alpha',
      new_string: 'x',
    }, editable);
    expect(notUnique.isError).toBe(true);
    expect(files['notes/daily.md']).toBe('alpha gamma alpha');

    const replaced = await executeVaultTool(TOOL_EDIT, {
      file_path: 'notes/daily.md',
      old_string: 'alpha',
      new_string: 'x',
      replace_all: true,
    }, editable);
    expect(replaced).toEqual({
      content: 'Updated [[notes/daily.md]] (2 replacements).',
      isError: false,
    });
    expect(files['notes/daily.md']).toBe('x gamma x');
  });

  it('rejects edits of missing or blocked notes', async () => {
    const missing = await executeVaultTool(TOOL_EDIT, {
      file_path: 'missing.md',
      old_string: 'a',
      new_string: 'b',
    }, ctx);
    expect(missing.isError).toBe(true);

    const blocked = await executeVaultTool(TOOL_EDIT, {
      file_path: '.obsidian/workspace.json',
      old_string: 'secret',
      new_string: 'leaked',
    }, ctx);
    expect(blocked.isError).toBe(true);
  });

  it('moves notes to trash and rejects blocked deletes', async () => {
    const files: Record<string, string> = { 'inbox.md': 'TODO' };
    const deletable = createContext(files);

    const trashed = await executeVaultTool(TOOL_DELETE, { file_path: 'inbox.md' }, deletable);
    expect(trashed).toEqual({ content: 'Moved [[inbox.md]] to trash.', isError: false });
    expect(files).toEqual({});

    const missing = await executeVaultTool(TOOL_DELETE, { file_path: 'inbox.md' }, deletable);
    expect(missing.isError).toBe(true);

    const blocked = await executeVaultTool(TOOL_DELETE, {
      file_path: '.obsidian/workspace.json',
    }, ctx);
    expect(blocked.isError).toBe(true);
  });
});
