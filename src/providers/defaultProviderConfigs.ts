import type { ProviderConfigMap } from '../core/types/settings';
import { DEFAULT_MIMO_PROVIDER_SETTINGS } from './mimo/settings';

export function getBuiltInProviderDefaultConfigs(): ProviderConfigMap {
  return {
    mimo: { ...DEFAULT_MIMO_PROVIDER_SETTINGS },
  };
}
