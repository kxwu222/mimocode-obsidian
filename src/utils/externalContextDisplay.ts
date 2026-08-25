export interface ExternalContextDisplayEntry {
  contextRoot: string;
  displayName: string;
  displayNameLower: string;
}

function normalizeDisplayPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function getFolderName(p: string): string {
  const normalized = normalizeDisplayPath(p);
  const segments = normalized.split('/');
  return segments[segments.length - 1] || normalized;
}

function getContextDisplayName(
  normalizedPath: string,
  folderName: string,
  needsDisambiguation: boolean,
): string {
  if (!needsDisambiguation) {
    return folderName;
  }

  const segments = normalizedPath.split('/').filter(Boolean);
  if (segments.length < 2) {
    return folderName;
  }

  const parent = segments[segments.length - 2];
  if (!parent) {
    return folderName;
  }

  return `${parent}/${folderName}`;
}

export function buildExternalContextDisplayEntries(
  externalContexts: string[],
): ExternalContextDisplayEntry[] {
  const counts = new Map<string, number>();
  const normalizedPaths = new Map<string, string>();

  for (const contextPath of externalContexts) {
    const normalized = normalizeDisplayPath(contextPath);
    normalizedPaths.set(contextPath, normalized);
    const folderName = getFolderName(normalized);
    counts.set(folderName, (counts.get(folderName) ?? 0) + 1);
  }

  return externalContexts.map((contextRoot) => {
    const normalized = normalizedPaths.get(contextRoot) ?? normalizeDisplayPath(contextRoot);
    const folderName = getFolderName(contextRoot);
    const needsDisambiguation = (counts.get(folderName) ?? 0) > 1;
    const displayName = getContextDisplayName(normalized, folderName, needsDisambiguation);

    return {
      contextRoot,
      displayName,
      displayNameLower: displayName.toLowerCase(),
    };
  });
}
