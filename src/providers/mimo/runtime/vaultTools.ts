import { TOOL_GLOB, TOOL_GREP, TOOL_LS, TOOL_READ } from '../../../core/tools/toolNames';
import type { OpenAIToolDef } from './McpToolRunner';
import {
  isBlockedVaultNotePath,
  isVaultNoteTextPath,
  MAX_CHARS_PER_VAULT_NOTE,
} from './vaultNoteContext';

export const MAX_VAULT_LIST_RESULTS = 200;
export const MAX_VAULT_GREP_MATCHES = 20;
export const MAX_VAULT_GREP_SCAN = 400;

export interface VaultToolFile {
  path: string;
}

export interface VaultToolContext {
  configDir: string;
  listMarkdownFiles: () => VaultToolFile[];
  readNote: (path: string) => Promise<string | null>;
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
];

export function isMimoVaultTool(name: string): boolean {
  return name === TOOL_LS || name === TOOL_GLOB || name === TOOL_READ || name === TOOL_GREP;
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
    hits.push(snippet ? `${path}: ${snippet}` : path);
  }

  if (hits.length === 0) {
    return { content: `No matches for ${pattern}.`, isError: false };
  }
  return { content: hits.join('\n'), isError: false };
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
  return `${heading} (${paths.length}):\n${paths.join('\n')}${truncated}`;
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
