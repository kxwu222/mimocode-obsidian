import { getProviderConfig, setProviderConfig } from '../../core/providers/providerConfig';

export type MimoCluster = 'cn' | 'sgp' | 'ams';
export type MimoBillingMode = 'payg' | 'token-plan';

/** Pay-as-you-go: single global endpoint, sk-xxxxx key. */
export const MIMO_PAYG_BASE_URL = 'https://api.xiaomimimo.com/v1';

/** Token Plan: cluster-scoped endpoints, tp-xxxxx key. */
export const MIMO_CLUSTER_URLS: Record<MimoCluster, string> = {
  cn: 'https://token-plan-cn.xiaomimimo.com/v1',
  sgp: 'https://token-plan-sgp.xiaomimimo.com/v1',
  ams: 'https://token-plan-ams.xiaomimimo.com/v1',
};

/** Fallback when a selected model cannot accept image_url parts. */
export const MIMO_VISION_MODEL = 'mimo-v2.6-flash';

/** Exact legacy IDs rewritten to the V2.6 options shown in Settings. */
const MIMO_MODEL_MIGRATIONS: Record<string, string> = {
  'mimo-v2.5-pro': 'mimo-v2.6-pro',
  'mimo-v2.5': 'mimo-v2.6-flash',
};

/** Models that accept image input. V2.5 Pro is text-only and is not listed. */
const MIMO_IMAGE_MODELS = new Set([
  'mimo-v2.6-pro',
  'mimo-v2.6-flash',
  'mimo-v2.6-pro-ultraspeed',
  'mimo-v2.5',
]);

export const MIMO_MODELS = [
  { value: 'mimo-v2.6-pro', label: 'MiMo V2.6 Pro', description: 'Flagship · text, image, video, audio' },
  { value: MIMO_VISION_MODEL, label: 'MiMo V2.6 Flash', description: 'Default · text, image, video, audio' },
] as const;

export type MimoModelId = typeof MIMO_MODELS[number]['value'];

export interface PersistedMimoProviderSettings {
  enabled: boolean;
  billingMode: MimoBillingMode;
  apiKey: string;
  /** Only used when billingMode is 'token-plan'. */
  cluster: MimoCluster;
  model: string;
  /** Send MiMo's built-in web_search tool. Extra console plugin fees apply. */
  webSearch: boolean;
}

export const DEFAULT_MIMO_PROVIDER_SETTINGS: Readonly<PersistedMimoProviderSettings> = Object.freeze({
  enabled: true,
  billingMode: 'token-plan',
  apiKey: '',
  cluster: 'ams',
  model: 'mimo-v2.6-flash',
  webSearch: false,
});

export function getMimoProviderSettings(settings: Record<string, unknown>): PersistedMimoProviderSettings {
  const config = getProviderConfig(settings, 'mimo');
  return {
    enabled: (config.enabled as boolean | undefined) ?? DEFAULT_MIMO_PROVIDER_SETTINGS.enabled,
    billingMode: normalizeMimoBillingMode(config.billingMode),
    apiKey: (config.apiKey as string | undefined) ?? DEFAULT_MIMO_PROVIDER_SETTINGS.apiKey,
    cluster: normalizeMimoCluster(config.cluster),
    model: normalizeMimoModel(config.model),
    webSearch: typeof config.webSearch === 'boolean'
      ? config.webSearch
      : DEFAULT_MIMO_PROVIDER_SETTINGS.webSearch,
  };
}

export function updateMimoProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<PersistedMimoProviderSettings>,
): void {
  const current = getMimoProviderSettings(settings);
  setProviderConfig(settings, 'mimo', {
    enabled: updates.enabled ?? current.enabled,
    billingMode: updates.billingMode ?? current.billingMode,
    apiKey: updates.apiKey ?? current.apiKey,
    cluster: updates.cluster ?? current.cluster,
    model: updates.model ?? current.model,
    webSearch: updates.webSearch ?? current.webSearch,
  });
}

export function getMimoBaseUrl(
  settings: Pick<PersistedMimoProviderSettings, 'billingMode' | 'cluster'>,
): string {
  return settings.billingMode === 'payg'
    ? MIMO_PAYG_BASE_URL
    : MIMO_CLUSTER_URLS[settings.cluster];
}

export function isMimoModel(value: string): boolean {
  return value.startsWith('mimo-');
}

export function migrateMimoModelId(model: string): string {
  return MIMO_MODEL_MIGRATIONS[model] ?? model;
}

export function mimoModelSupportsImageInput(model: string): boolean {
  return MIMO_IMAGE_MODELS.has(model);
}

export function resolveMimoChatModel(selectedModel: string, hasImages: boolean): string {
  if (hasImages && !mimoModelSupportsImageInput(selectedModel)) {
    return MIMO_VISION_MODEL;
  }
  return selectedModel;
}

function normalizeMimoBillingMode(value: unknown): MimoBillingMode {
  if (value === 'payg' || value === 'token-plan') {
    return value;
  }
  return DEFAULT_MIMO_PROVIDER_SETTINGS.billingMode;
}

function normalizeMimoCluster(value: unknown): MimoCluster {
  if (value === 'cn' || value === 'sgp' || value === 'ams') {
    return value;
  }
  return DEFAULT_MIMO_PROVIDER_SETTINGS.cluster;
}

function normalizeMimoModel(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    return migrateMimoModelId(value.trim());
  }
  return DEFAULT_MIMO_PROVIDER_SETTINGS.model;
}
