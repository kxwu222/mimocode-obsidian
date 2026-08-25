import { appendAttachedNote, appendCurrentNote } from '../../../utils/context';

export const MAX_VAULT_NOTE_FILES = 10;
export const MAX_CHARS_PER_VAULT_NOTE = 80_000;
export const MAX_TOTAL_VAULT_NOTE_CHARS = 240_000;

const TEXT_NOTE_EXTENSIONS = new Set([
  'md',
  'markdown',
  'txt',
  'csv',
  'json',
  'canvas',
]);

const BLOCKED_PATH_SEGMENTS = new Set([
  '.claudian',
  '.claude',
  '.codex',
  '.mimo',
  '.agents',
]);

export interface VaultNoteSnippet {
  path: string;
  body: string;
  truncated: boolean;
  role: 'current' | 'attached';
}

export function isVaultNoteTextPath(path: string): boolean {
  const dot = path.lastIndexOf('.');
  if (dot < 0 || dot === path.length - 1) {
    return false;
  }
  const extension = path.slice(dot + 1).toLowerCase();
  return TEXT_NOTE_EXTENSIONS.has(extension);
}

export function isBlockedVaultNotePath(path: string, extraSegments: string[] = []): boolean {
  const blocked = extraSegments.length > 0
    ? new Set([...BLOCKED_PATH_SEGMENTS, ...extraSegments])
    : BLOCKED_PATH_SEGMENTS;
  return path.replace(/\\/g, '/').split('/').some((segment) => blocked.has(segment));
}

export async function loadVaultNoteSnippets(options: {
  paths: string[];
  currentNotePath?: string;
  readNote: (path: string) => Promise<string | null>;
  maxFiles?: number;
  maxCharsPerFile?: number;
  maxTotalChars?: number;
  blockedSegments?: string[];
}): Promise<VaultNoteSnippet[]> {
  const maxFiles = options.maxFiles ?? MAX_VAULT_NOTE_FILES;
  const maxCharsPerFile = options.maxCharsPerFile ?? MAX_CHARS_PER_VAULT_NOTE;
  const maxTotalChars = options.maxTotalChars ?? MAX_TOTAL_VAULT_NOTE_CHARS;
  const currentNotePath = options.currentNotePath;
  const blockedSegments = options.blockedSegments ?? [];

  const uniquePaths: string[] = [];
  const seen = new Set<string>();
  const ordered = [
    ...(currentNotePath ? [currentNotePath] : []),
    ...options.paths,
  ];
  for (const rawPath of ordered) {
    const path = rawPath.trim();
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);
    uniquePaths.push(path);
  }

  const snippets: VaultNoteSnippet[] = [];
  let totalChars = 0;

  for (const path of uniquePaths) {
    if (snippets.length >= maxFiles || totalChars >= maxTotalChars) {
      break;
    }
    if (!isVaultNoteTextPath(path) || isBlockedVaultNotePath(path, blockedSegments)) {
      continue;
    }

    const raw = await options.readNote(path);
    if (raw === null) {
      continue;
    }

    const remainingTotal = maxTotalChars - totalChars;
    const budget = Math.min(maxCharsPerFile, remainingTotal);
    if (budget <= 0) {
      break;
    }

    const truncated = raw.length > budget;
    const body = truncated ? `${raw.slice(0, budget)}\n\n[truncated]` : raw;
    snippets.push({
      path,
      body,
      truncated,
      role: path === currentNotePath ? 'current' : 'attached',
    });
    totalChars += body.length;
  }

  return snippets;
}

export function applyVaultNoteSnippets(prompt: string, snippets: VaultNoteSnippet[]): string {
  let result = prompt;
  for (const snippet of snippets) {
    result = snippet.role === 'current'
      ? appendCurrentNote(result, snippet.path, snippet.body)
      : appendAttachedNote(result, snippet.path, snippet.body);
  }
  return result;
}
