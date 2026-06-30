import { getProviderConfig, setProviderConfig } from '../../core/providers/providerConfig';

export type MimoCluster = 'cn' | 'sgp' | 'ams';

export const MIMO_CLUSTER_URLS: Record<MimoCluster, string> = {
  cn: 'https://token-plan-cn.xiaomimimo.com/v1',
  sgp: 'https://token-plan-sgp.xiaomimimo.com/v1',
  ams: 'https://token-plan-ams.xiaomimimo.com/v1',
};

export const MIMO_MODELS = [
  { value: 'mimo-v2.5-pro', label: 'MiMo V2.5 Pro', description: '1T params · 42B active · 1M context' },
  { value: 'mimo-v2.5-pro-ultraspeed', label: 'MiMo V2.5 Pro UltraSpeed', description: 'High-throughput variant' },
  { value: 'mimo-v2.5', label: 'MiMo V2.5', description: 'Multimodal · image / video / audio' },
] as const;

export type MimoModelId = typeof MIMO_MODELS[number]['value'];

export interface PersistedMimoProviderSettings {
  enabled: boolean;
  apiKey: string;
  cluster: MimoCluster;
  model: string;
}

export const DEFAULT_MIMO_PROVIDER_SETTINGS: Readonly<PersistedMimoProviderSettings> = Object.freeze({
  enabled: false,
  apiKey: '',
  cluster: 'ams',
  model: 'mimo-v2.5-pro',
});

export function getMimoProviderSettings(settings: Record<string, unknown>): PersistedMimoProviderSettings {
  const config = getProviderConfig(settings, 'mimo');
  return {
    enabled: (config.enabled as boolean | undefined) ?? DEFAULT_MIMO_PROVIDER_SETTINGS.enabled,
    apiKey: (config.apiKey as string | undefined) ?? DEFAULT_MIMO_PROVIDER_SETTINGS.apiKey,
    cluster: normalizeMimoCluster(config.cluster),
    model: normalizeMimoModel(config.model),
  };
}

export function updateMimoProviderSettings(
  settings: Record<string, unknown>,
  updates: Partial<PersistedMimoProviderSettings>,
): void {
  const current = getMimoProviderSettings(settings);
  setProviderConfig(settings, 'mimo', {
    enabled: updates.enabled ?? current.enabled,
    apiKey: updates.apiKey ?? current.apiKey,
    cluster: updates.cluster ?? current.cluster,
    model: updates.model ?? current.model,
  });
}

export function getMimoBaseUrl(settings: PersistedMimoProviderSettings): string {
  return MIMO_CLUSTER_URLS[settings.cluster];
}

export function isMimoModel(value: string): boolean {
  return value.startsWith('mimo-');
}

function normalizeMimoCluster(value: unknown): MimoCluster {
  if (value === 'cn' || value === 'sgp' || value === 'ams') {
    return value;
  }
  return DEFAULT_MIMO_PROVIDER_SETTINGS.cluster;
}

function normalizeMimoModel(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return DEFAULT_MIMO_PROVIDER_SETTINGS.model;
}
