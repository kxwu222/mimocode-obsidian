import { requestUrl } from 'obsidian';

import type { AuxQueryConfig, AuxQueryRunner } from '../../../core/auxiliary/AuxQueryRunner';
import type ClaudianPlugin from '../../../main';
import { getMimoBaseUrl, getMimoProviderSettings } from '../settings';

/**
 * HTTP-backed AuxQueryRunner for MiMo.
 *
 * Uses the non-streaming chat completions endpoint so callers receive the full
 * text at once. Calls `onTextChunk` once with the complete response when done.
 */
export class MimoAuxQueryRunner implements AuxQueryRunner {
  private abortController: AbortController | null = null;

  constructor(private readonly plugin: ClaudianPlugin) {}

  async query(config: AuxQueryConfig, prompt: string): Promise<string> {
    const settings = this.plugin.settings as unknown as Record<string, unknown>;
    const mimoSettings = getMimoProviderSettings(settings);

    if (!mimoSettings.apiKey) {
      throw new Error('MiMo API key is not configured.');
    }

    this.abortController = config.abortController ?? new AbortController();

    const model = config.model ?? mimoSettings.model;
    const baseUrl = getMimoBaseUrl(mimoSettings);

    const response = await requestUrl({
      url: `${baseUrl}/chat/completions`,
      method: 'POST',
      headers: {
        'api-key': mimoSettings.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: config.systemPrompt },
          { role: 'user', content: prompt },
        ],
        stream: false,
        max_completion_tokens: 4096,
      }),
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`MiMo API error ${response.status}: ${response.text}`);
    }

    const data = response.json as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const text = data.choices?.[0]?.message?.content ?? '';
    config.onTextChunk?.(text);
    return text;
  }

  reset(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}
