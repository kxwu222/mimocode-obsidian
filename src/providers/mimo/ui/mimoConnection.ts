import { requestUrl } from 'obsidian';

import {
  getMimoBaseUrl,
  type MimoBillingMode,
  type PersistedMimoProviderSettings,
} from '../settings';

export type MimoApiKeyIssue = 'empty' | 'token-plan-prefix' | 'payg-prefix';

export type MimoProbeResult =
  | { ok: true }
  | { ok: false; reason: MimoApiKeyIssue | 'auth' | 'not-found' | 'http' | 'network'; status?: number; detail?: string };

type MimoProbeSettings = Pick<PersistedMimoProviderSettings, 'apiKey' | 'billingMode' | 'cluster' | 'model'>;

export function getMimoApiKeyIssue(
  apiKey: string,
  billingMode: MimoBillingMode,
): MimoApiKeyIssue | null {
  const key = apiKey.trim();
  if (!key) {
    return 'empty';
  }
  const lower = key.toLowerCase();
  if (billingMode === 'token-plan' && !lower.startsWith('tp-')) {
    return 'token-plan-prefix';
  }
  if (billingMode === 'payg' && !lower.startsWith('sk-')) {
    return 'payg-prefix';
  }
  return null;
}

/** Prefix mismatch only — empty key is not a live warning. */
export function getMimoApiKeyWarning(
  apiKey: string,
  billingMode: MimoBillingMode,
): Exclude<MimoApiKeyIssue, 'empty'> | null {
  const issue = getMimoApiKeyIssue(apiKey, billingMode);
  return issue === 'empty' ? null : issue;
}

export async function probeMimoConnection(
  settings: MimoProbeSettings,
  request = requestUrl,
): Promise<MimoProbeResult> {
  const issue = getMimoApiKeyIssue(settings.apiKey, settings.billingMode);
  if (issue) {
    return { ok: false, reason: issue };
  }

  try {
    const response = await request({
      url: `${getMimoBaseUrl(settings)}/chat/completions`,
      method: 'POST',
      headers: {
        'api-key': settings.apiKey.trim(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_completion_tokens: 5,
      }),
      throw: false,
    });

    if (response.status >= 200 && response.status < 300) {
      return { ok: true };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: 'auth', status: response.status, detail: snippet(response.text) };
    }
    if (response.status === 404) {
      return { ok: false, reason: 'not-found', status: response.status, detail: snippet(response.text) };
    }
    return { ok: false, reason: 'http', status: response.status, detail: snippet(response.text) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, reason: 'network', detail: message };
  }
}

function snippet(text: string | undefined): string | undefined {
  const trimmed = text?.replace(/\s+/g, ' ').trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, 120);
}
