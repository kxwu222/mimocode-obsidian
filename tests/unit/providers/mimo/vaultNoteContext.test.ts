import {
  applyVaultNoteSnippets,
  isBlockedVaultNotePath,
  isVaultNoteTextPath,
  loadVaultNoteSnippets,
} from '@/providers/mimo/runtime/vaultNoteContext';
import { appendCurrentNote } from '@/utils/context';

describe('isVaultNoteTextPath', () => {
  it('accepts markdown and other text notes', () => {
    expect(isVaultNoteTextPath('notes/idea.md')).toBe(true);
    expect(isVaultNoteTextPath('data.json')).toBe(true);
    expect(isVaultNoteTextPath('board.canvas')).toBe(true);
  });

  it('rejects images and extensionless paths', () => {
    expect(isVaultNoteTextPath('img.png')).toBe(false);
    expect(isVaultNoteTextPath('notes/folder')).toBe(false);
  });
});

describe('isBlockedVaultNotePath', () => {
  it('blocks plugin and config folders', () => {
    expect(isBlockedVaultNotePath('.claudian/claudian-settings.json')).toBe(true);
    expect(isBlockedVaultNotePath('notes/.claude/mcp.json')).toBe(true);
    expect(isBlockedVaultNotePath('.obsidian/workspace.json', ['.obsidian'])).toBe(true);
  });

  it('allows normal notes', () => {
    expect(isBlockedVaultNotePath('notes/daily.md')).toBe(false);
  });
});

describe('loadVaultNoteSnippets', () => {
  it('loads the current note first and marks @ mentions as attached', async () => {
    const files = new Map([
      ['notes/current.md', 'Current body'],
      ['notes/other.md', 'Other body'],
    ]);

    const snippets = await loadVaultNoteSnippets({
      paths: ['notes/other.md', 'notes/current.md'],
      currentNotePath: 'notes/current.md',
      readNote: async (path) => files.get(path) ?? null,
    });

    expect(snippets.map((s) => ({ path: s.path, role: s.role, body: s.body }))).toEqual([
      { path: 'notes/current.md', role: 'current', body: 'Current body' },
      { path: 'notes/other.md', role: 'attached', body: 'Other body' },
    ]);
  });

  it('skips missing, binary, and blocked paths', async () => {
    const snippets = await loadVaultNoteSnippets({
      paths: ['missing.md', 'pic.png', '.obsidian/app.json', 'ok.md'],
      blockedSegments: ['.obsidian'],
      readNote: async (path) => (path === 'ok.md' ? 'Hello' : null),
    });

    expect(snippets).toEqual([
      { path: 'ok.md', body: 'Hello', truncated: false, role: 'attached' },
    ]);
  });

  it('truncates oversized notes and caps file count', async () => {
    const snippets = await loadVaultNoteSnippets({
      paths: ['a.md', 'b.md', 'c.md'],
      readNote: async (path) => `${path}:${'x'.repeat(50)}`,
      maxFiles: 2,
      maxCharsPerFile: 10,
      maxTotalChars: 100,
    });

    expect(snippets).toHaveLength(2);
    expect(snippets[0].truncated).toBe(true);
    expect(snippets[0].body).toContain('[truncated]');
    expect(snippets[0].body.startsWith('a.md:')).toBe(true);
  });
});

describe('applyVaultNoteSnippets', () => {
  it('appends linked_note and attached_note bodies after the user query', () => {
    const prompt = applyVaultNoteSnippets('Summarize this', [
      { path: 'notes/a.md', body: 'Alpha', truncated: false, role: 'current' },
      { path: 'notes/b.md', body: 'Beta', truncated: false, role: 'attached' },
    ]);

    expect(prompt).toBe(
      'Summarize this'
      + '\n\n<linked_note>\nnotes/a.md\n\nAlpha\n</linked_note>'
      + '\n\n<attached_note>\nnotes/b.md\n\nBeta\n</attached_note>',
    );
  });

  it('keeps path-only linked_note when no body was loaded', () => {
    expect(appendCurrentNote('Hello', 'notes/a.md')).toBe(
      'Hello\n\n<linked_note>\nnotes/a.md\n</linked_note>',
    );
  });
});
