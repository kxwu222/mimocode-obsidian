export function parseEnvironmentVariables(input: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const normalized = trimmed.startsWith('export ') ? trimmed.slice(7) : trimmed;
    const eqIndex = normalized.indexOf('=');
    if (eqIndex > 0) {
      const key = normalized.substring(0, eqIndex).trim();
      let value = normalized.substring(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key) {
        result[key] = value;
      }
    }
  }
  return result;
}

export const MIN_CONTEXT_LIMIT = 1_000;
export const MAX_CONTEXT_LIMIT = 10_000_000;

export function parseContextLimit(input: string): number | null {
  const trimmed = input.trim().toLowerCase().replace(/,/g, '');
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(k|m)?$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const suffix = match[2];

  if (isNaN(value) || value <= 0) return null;

  const MULTIPLIERS: Record<string, number> = { k: 1_000, m: 1_000_000 };
  const multiplier = suffix ? MULTIPLIERS[suffix] ?? 1 : 1;
  const result = Math.round(value * multiplier);

  if (result < MIN_CONTEXT_LIMIT || result > MAX_CONTEXT_LIMIT) return null;

  return result;
}

export function formatContextLimit(tokens: number): string {
  if (tokens >= 1_000_000 && tokens % 1_000_000 === 0) {
    return `${tokens / 1_000_000}m`;
  }
  if (tokens >= 1000 && tokens % 1000 === 0) {
    return `${tokens / 1000}k`;
  }
  return tokens.toLocaleString();
}
