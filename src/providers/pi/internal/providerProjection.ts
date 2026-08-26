export function ensureProviderProjectionMap(
  settings: Record<string, unknown>,
  key:
  | 'savedProviderEffort'
  | 'savedProviderModel'
  | 'savedProviderPermissionMode'
  | 'savedProviderServiceTier'
  | 'savedProviderThinkingBudget',
): Partial<Record<string, string>> {
  const current = settings[key];
  if (isStringMap(current)) {
    return current;
  }

  const next: Partial<Record<string, string>> = {};
  settings[key] = next;
  return next;
}

function isStringMap(value: unknown): value is Partial<Record<string, string>> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
