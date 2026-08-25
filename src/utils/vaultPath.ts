import type { App } from 'obsidian';
import * as path from 'path';

/** Vault adapter root when the host exposes it. Does not touch the Node fs/os APIs. */
export function getVaultPath(app: App): string | null {
  const basePath = (app.vault.adapter as { basePath?: unknown } | undefined)?.basePath;
  return typeof basePath === 'string' ? basePath : null;
}

/**
 * Map a path to a vault-relative path using string comparison only.
 * Does not call fs.realpath or os.homedir.
 */
export function normalizePathForVault(
  rawPath: string | undefined | null,
  vaultPath: string | null | undefined,
): string | null {
  if (!rawPath) {
    return null;
  }

  const normalizedRaw = rawPath.replace(/\\/g, '/').trim();
  if (!normalizedRaw) {
    return null;
  }

  if (vaultPath) {
    const vault = vaultPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const candidate = path.isAbsolute(normalizedRaw)
      ? normalizedRaw
      : path.posix.normalize(`${vault.replace(/\/+$/, '')}/${normalizedRaw.replace(/^\/+/, '')}`);
    const vaultKey = process.platform === 'win32' ? vault.toLowerCase() : vault;
    const candidateKey = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
    if (candidateKey === vaultKey) {
      return null;
    }
    if (candidateKey.startsWith(`${vaultKey}/`)) {
      const relative = candidate.slice(vault.length).replace(/^\/+/, '');
      return relative || null;
    }
  }

  if (path.isAbsolute(normalizedRaw) || /^[A-Za-z]:\//.test(normalizedRaw)) {
    return null;
  }

  return normalizedRaw.replace(/^\/+/, '');
}
