import type {
  ProviderChatUIConfig,
  ProviderIconSvg,
  ProviderReasoningOption,
  ProviderUIOption,
} from '../../../core/providers/types';
import { isMimoModel, MIMO_MODELS } from '../settings';

const MIMO_CONTEXT_WINDOW = 1_000_000;

const MIMO_MODEL_OPTIONS: ProviderUIOption[] = MIMO_MODELS.map((m) => ({
  value: m.value,
  label: m.label,
  description: m.description,
}));

// Simple "M" lettermark icon for MiMo branding in the model selector.
const MIMO_PROVIDER_ICON: ProviderIconSvg = {
  kind: 'path',
  viewBox: '0 0 24 24',
  path: 'M3 3h3l3 9 3-9h3l2 18h-3l-1-11-3 8h-2l-3-8-1 11H3L3 3zm15 0h3v18h-3V3z',
};

export const mimoChatUIConfig: ProviderChatUIConfig = {
  getModelOptions(_settings: Record<string, unknown>): ProviderUIOption[] {
    return MIMO_MODEL_OPTIONS;
  },

  ownsModel(model: string): boolean {
    return isMimoModel(model);
  },

  isAdaptiveReasoningModel(_model: string, _settings: Record<string, unknown>): boolean {
    return false;
  },

  getReasoningOptions(_model: string, _settings: Record<string, unknown>): ProviderReasoningOption[] {
    return [];
  },

  getDefaultReasoningValue(_model: string, _settings: Record<string, unknown>): string {
    return 'none';
  },

  getContextWindowSize(
    model: string,
    customLimits?: Record<string, number>,
    _settings?: Record<string, unknown>,
  ): number {
    return customLimits?.[model] ?? MIMO_CONTEXT_WINDOW;
  },

  isDefaultModel(model: string): boolean {
    return MIMO_MODELS.some((m) => m.value === model);
  },

  applyModelDefaults(model: string, settings: unknown): void {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return;
    }
    (settings as Record<string, unknown>).model = model;
  },

  normalizeModelVariant(model: string): string {
    return model;
  },

  getCustomModelIds(): Set<string> {
    return new Set<string>();
  },

  getPermissionModeToggle(): null {
    return null;
  },

  getServiceTierToggle(): null {
    return null;
  },

  getModeSelector(): null {
    return null;
  },

  getProviderIcon(): ProviderIconSvg {
    return MIMO_PROVIDER_ICON;
  },
};
