import { TOOL_EDIT, TOOL_GLOB, TOOL_GREP, TOOL_LS, TOOL_READ, TOOL_WRITE } from '../../../core/tools/toolNames';
import type { OpenAIToolDef } from './McpToolRunner';
import {
  isBlockedVaultNotePath,
  isVaultNoteTextPath,
  MAX_CHARS_PER_VAULT_NOTE,
} from './vaultNoteContext';

export const TOOL_DELETE = 'Delete' as const;

export const MAX_VAULT_LIST_RESULTS = 200;
export const MAX_VAULT_GREP_MATCHES = 20;
export const MAX_VAULT_GREP_SCAN = 400;

const MIMO_VAULT_TOOL_NAMES = new Set<string>([
  TOOL_LS,
  TOOL_GLOB,
  TOOL_READ,
  TOOL_GREP,
  TOOL_WRITE,
  TOOL_EDIT,
  TOOL_DELETE,
]);

export interface VaultToolFile {
  path: string;
}

export interface VaultToolContext {
  configDir: string;
  listMarkdownFiles: () => VaultToolFile[];
  readNote: (path: string) => Promise<string | null>;
  writeNote: (path: string, contents: string) => Promise<'created' | 'updated'>;
  trashNote: (path: string) => Promise<boolean>;
}

export const MIMO_VAULT_TOOLS: OpenAIToolDef[] = [
  {
    type: 'function',
    function: {
      name: TOOL_LS,
      description: 'List markdown notes in the Obsidian vault. Optionally limit to a folder.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Folder path relative to the vault root. Empty lists the whole vault.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_GLOB,
      description: 'Find vault note paths matching a glob pattern such as **/*.md or notes/**/*.md.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern matched against vault-relative paths.',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_READ,
      description: 'Read the text of one vault note. Use LS or Glob first if you do not know the path.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Vault-relative path, for example notes/daily.md.',
          },
        },
        required: ['file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_GREP,
      description: 'Search note contents for a string or regular expression and return matching paths with snippets.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Case-insensitive search string, or a JavaScript regular expression.',
          },
          path: {
            type: 'string',
            description: 'Optional folder to search under.',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_WRITE,
      description: 'Create or overwrite a vault note. Use this for new files or full file replacement.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Vault-relative path, for example notes/daily.md.',
          },
          contents: {
            type: 'string',
            description: 'Full note text to write.',
          },
        },
        required: ['file_path', 'contents'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_EDIT,
      description: 'Replace text inside an existing vault note. Fails if old_string is missing or not unique unless replace_all is true.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Vault-relative path of the note to edit.',
          },
          old_string: {
            type: 'string',
            description: 'Exact text to find.',
          },
          new_string: {
            type: 'string',
            description: 'Replacement text.',
          },
          replace_all: {
            type: 'boolean',
            description: 'Replace every occurrence. Defaults to false.',
          },
        },
        required: ['file_path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL_DELETE,
      description: 'Move a vault note to Obsidian trash. This is not a permanent delete.',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'Vault-relative path of the note to trash.',
          },
        },
        required: ['file_path'],
      },
    },
  },
];

export function isMimoVaultTool(name: string): boolean {
  return MIMO_VAULT_TOOL_NAMES.has(name);
}

export async function executeVaultTool(
  name: string,
  input: Record<string, unknown>,
  ctx: VaultToolContext,
): Promise<{ content: string; isError: boolean }> {
  try {
    switch (name) {
      case TOOL_LS:
        return { content: listVaultFiles(readString(input.path), ctx), isError: false };
      case TOOL_GLOB:
        return { content: globVaultFiles(readString(input.pattern), ctx), isError: false };
      case TOOL_READ:
        return await readVaultFile(readString(input.file_path), ctx);
      case TOOL_GREP:
        return await grepVaultFiles(readString(input.pattern), readString(input.path), ctx);
      case TOOL_WRITE:
        return await writeVaultFile(input, ctx);
      case TOOL_EDIT:
        return await editVaultFile(input, ctx);
      case TOOL_DELETE:
        return await deleteVaultFile(readString(input.file_path), ctx);
      default:
        return { content: `Unknown vault tool: ${name}`, isError: true };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool failed';
    return { content: message, isError: true };
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function listVaultFiles(folder: string, ctx: VaultToolContext): string {
  const prefix = normalizeFolderPrefix(folder);
  if (prefix === null) {
    return 'Invalid folder path.';
  }

  const matches = filterVaultFiles(ctx, (path) => isUnderFolder(path, prefix));
  return formatPathList(matches, prefix ? `Notes under ${prefix}` : 'Vault notes');
}

function globVaultFiles(pattern: string, ctx: VaultToolContext): string {
  if (!pattern) {
    return 'Glob pattern is required.';
  }

  const matcher = globToRegExp(pattern);
  const matches = filterVaultFiles(ctx, (path) => matcher.test(path));
  return formatPathList(matches, `Matches for ${pattern}`);
}

async function readVaultFile(
  filePath: string,
  ctx: VaultToolContext,
): Promise<{ content: string; isError: boolean }> {
  const path = normalizeVaultRelPath(filePath);
  if (!path) {
    return { content: 'A vault-relative file_path is required.', isError: true };
  }
  if (!isVaultNoteTextPath(path) || isBlockedVaultNotePath(path, [ctx.configDir])) {
    return { content: `Cannot read ${path}.`, isError: true };
  }

  const raw = await ctx.readNote(path);
  if (raw === null) {
    return { content: `File not found: ${path}`, isError: true };
  }

  if (raw.length > MAX_CHARS_PER_VAULT_NOTE) {
    return {
      content: `${raw.slice(0, MAX_CHARS_PER_VAULT_NOTE)}\n\n[truncated]`,
      isError: false,
    };
  }
  return { content: raw, isError: false };
}

async function grepVaultFiles(
  pattern: string,
  folder: string,
  ctx: VaultToolContext,
): Promise<{ content: string; isError: boolean }> {
  if (!pattern) {
    return { content: 'Search pattern is required.', isError: true };
  }

  const prefix = normalizeFolderPrefix(folder);
  if (prefix === null) {
    return { content: 'Invalid folder path.', isError: true };
  }

  const matcher = compileSearch(pattern);
  const files = filterVaultFiles(ctx, (path) => isUnderFolder(path, prefix), MAX_VAULT_GREP_SCAN);
  const hits: string[] = [];

  for (const path of files) {
    if (hits.length >= MAX_VAULT_GREP_MATCHES) {
      break;
    }
    const raw = await ctx.readNote(path);
    if (raw === null || !matcher(raw)) {
      continue;
    }
    const snippet = firstMatchingLine(raw, matcher);
    hits.push(snippet ? `${formatVaultWikilink(path)}: ${snippet}` : formatVaultWikilink(path));
  }

  if (hits.length === 0) {
    return { content: `No matches for ${pattern}.`, isError: false };
  }
  return { content: hits.join('\n'), isError: false };
}

async function writeVaultFile(
  input: Record<string, unknown>,
  ctx: VaultToolContext,
): Promise<{ content: string; isError: boolean }> {
  const resolved = resolveMutableNotePath(readString(input.file_path), ctx, 'write');
  if ('error' in resolved) {
    return { content: resolved.error, isError: true };
  }

  const contents = readContents(input);
  if (contents === null) {
    return { content: 'contents is required.', isError: true };
  }
  if (contents.length > MAX_CHARS_PER_VAULT_NOTE) {
    return {
      content: `Contents exceed the ${MAX_CHARS_PER_VAULT_NOTE} character limit.`,
      isError: true,
    };
  }

  const outcome = await ctx.writeNote(resolved.path, contents);
  return {
    content: outcome === 'created'
      ? `Created ${formatVaultWikilink(resolved.path)}`
      : `Updated ${formatVaultWikilink(resolved.path)}`,
    isError: false,
  };
}

async function editVaultFile(
  input: Record<string, unknown>,
  ctx: VaultToolContext,
): Promise<{ content: string; isError: boolean }> {
  const resolved = resolveMutableNotePath(readString(input.file_path), ctx, 'edit');
  if ('error' in resolved) {
    return { content: resolved.error, isError: true };
  }

  const oldString = typeof input.old_string === 'string' ? input.old_string : null;
  const newString = typeof input.new_string === 'string' ? input.new_string : null;
  if (oldString === null || oldString.length === 0) {
    return { content: 'old_string is required.', isError: true };
  }
  if (newString === null) {
    return { content: 'new_string is required.', isError: true };
  }

  const raw = await ctx.readNote(resolved.path);
  if (raw === null) {
    return { content: `File not found: ${resolved.path}`, isError: true };
  }

  const replaceAll = input.replace_all === true;
  const first = raw.indexOf(oldString);
  if (first < 0) {
    return { content: `old_string not found in ${resolved.path}`, isError: true };
  }

  let updated: string;
  let replacements = 1;
  if (replaceAll) {
    replacements = countOccurrences(raw, oldString);
    updated = raw.split(oldString).join(newString);
  } else {
    const second = raw.indexOf(oldString, first + oldString.length);
    if (second >= 0) {
      return {
        content: 'old_string is not unique. Use replace_all or a larger unique snippet.',
        isError: true,
      };
    }
    updated = raw.slice(0, first) + newString + raw.slice(first + oldString.length);
  }

  if (updated.length > MAX_CHARS_PER_VAULT_NOTE) {
    return {
      content: `Contents exceed the ${MAX_CHARS_PER_VAULT_NOTE} character limit.`,
      isError: true,
    };
  }

  await ctx.writeNote(resolved.path, updated);
  return {
    content: `Updated ${formatVaultWikilink(resolved.path)} (${replacements} replacement${replacements === 1 ? '' : 's'}).`,
    isError: false,
  };
}

async function deleteVaultFile(
  filePath: string,
  ctx: VaultToolContext,
): Promise<{ content: string; isError: boolean }> {
  const resolved = resolveMutableNotePath(filePath, ctx, 'delete');
  if ('error' in resolved) {
    return { content: resolved.error, isError: true };
  }

  const trashed = await ctx.trashNote(resolved.path);
  if (!trashed) {
    return { content: `File not found: ${resolved.path}`, isError: true };
  }
  return { content: `Moved ${formatVaultWikilink(resolved.path)} to trash.`, isError: false };
}

function readContents(input: Record<string, unknown>): string | null {
  if (typeof input.contents === 'string') {
    return input.contents;
  }
  if (typeof input.content === 'string') {
    return input.content;
  }
  return null;
}

function resolveMutableNotePath(
  filePath: string,
  ctx: VaultToolContext,
  verb: 'write' | 'edit' | 'delete',
): { path: string } | { error: string } {
  const path = normalizeVaultRelPath(filePath);
  if (!path) {
    return { error: 'A vault-relative file_path is required.' };
  }
  if (!isVaultNoteTextPath(path) || isBlockedVaultNotePath(path, [ctx.configDir])) {
    return { error: `Cannot ${verb} ${path}.` };
  }
  return { path };
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let index = 0;
  while (index <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, index);
    if (found < 0) {
      break;
    }
    count += 1;
    index = found + needle.length;
  }
  return count;
}

function filterVaultFiles(
  ctx: VaultToolContext,
  predicate: (path: string) => boolean,
  limit = MAX_VAULT_LIST_RESULTS,
): string[] {
  const matches: string[] = [];
  for (const file of ctx.listMarkdownFiles()) {
    const path = file.path.replace(/\\/g, '/');
    if (!isVaultNoteTextPath(path) || isBlockedVaultNotePath(path, [ctx.configDir])) {
      continue;
    }
    if (!predicate(path)) {
      continue;
    }
    matches.push(path);
    if (matches.length >= limit) {
      break;
    }
  }
  return matches;
}

function formatPathList(paths: string[], heading: string): string {
  if (paths.length === 0) {
    return `${heading}: none`;
  }
  const truncated = paths.length >= MAX_VAULT_LIST_RESULTS
    ? `\n[truncated to ${MAX_VAULT_LIST_RESULTS}]`
    : '';
  return `${heading} (${paths.length}):\n${paths.map(formatVaultWikilink).join('\n')}${truncated}`;
}

export function formatVaultWikilink(path: string): string {
  return `[[${path}]]`;
}

export function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/\\/g, '/')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '::DS_SLASH::')
    .replace(/\*\*/g, '::DS::')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/::DS_SLASH::/g, '(?:.*/)?')
    .replace(/::DS::/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function compileSearch(pattern: string): (text: string) => boolean {
  try {
    const regex = new RegExp(pattern, 'i');
    return (text) => regex.test(text);
  } catch {
    const needle = pattern.toLowerCase();
    return (text) => text.toLowerCase().includes(needle);
  }
}

function firstMatchingLine(text: string, matcher: (line: string) => boolean): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && matcher(trimmed)) {
      return trimmed.length > 160 ? `${trimmed.slice(0, 160)}…` : trimmed;
    }
  }
  return '';
}

function isUnderFolder(path: string, folder: string): boolean {
  if (!folder) {
    return true;
  }
  return path === folder || path.startsWith(`${folder}/`);
}

export function normalizeVaultRelPath(raw: string): string | null {
  const path = raw.replace(/\\/g, '/').replace(/^\.\//, '').trim();
  if (!path) {
    return '';
  }
  if (path.startsWith('/') || path.includes('..') || /^[a-zA-Z]:/.test(path)) {
    return null;
  }
  return path;
}

function normalizeFolderPrefix(raw: string): string | null {
  if (!raw) {
    return '';
  }
  const path = normalizeVaultRelPath(raw.replace(/\/+$/, ''));
  return path;
}
