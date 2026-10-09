import { mimoSettingsReconciler } from '@/providers/mimo/env/MimoSettingsReconciler';
import {
  DEFAULT_MIMO_PROVIDER_SETTINGS,
  getMimoProviderSettings,
  MIMO_MODELS,
  MIMO_VISION_MODEL,
  resolveMimoChatModel,
  updateMimoProviderSettings,
} from '@/providers/mimo/settings';

describe('DEFAULT_MIMO_PROVIDER_SETTINGS', () => {
  it('enables MiMo by default so a new vault has a provider', () => {
    expect(DEFAULT_MIMO_PROVIDER_SETTINGS.enabled).toBe(true);
    expect(DEFAULT_MIMO_PROVIDER_SETTINGS.webSearch).toBe(false);
  });
});

describe('getMimoProviderSettings', () => {
  it('treats a missing enabled flag as on', () => {
    expect(getMimoProviderSettings({ providerConfigs: { mimo: { apiKey: 'tp-x' } } }).enabled).toBe(true);
  });

  it('preserves an explicit off', () => {
    expect(getMimoProviderSettings({
      providerConfigs: { mimo: { enabled: false, apiKey: 'tp-x' } },
    }).enabled).toBe(false);
  });

  it('treats a missing webSearch flag as off', () => {
    expect(getMimoProviderSettings({ providerConfigs: { mimo: { apiKey: 'tp-x' } } }).webSearch).toBe(false);
  });

  it('preserves an explicit webSearch off', () => {
    expect(getMimoProviderSettings({
      providerConfigs: { mimo: { apiKey: 'tp-x', webSearch: false } },
    }).webSearch).toBe(false);
  });

  it('keeps webSearch when another field is updated', () => {
    const settings: Record<string, unknown> = {
      providerConfigs: { mimo: { apiKey: 'tp-old', webSearch: false } },
    };
    updateMimoProviderSettings(settings, { apiKey: 'tp-new' });
    expect(getMimoProviderSettings(settings)).toEqual(expect.objectContaining({
      apiKey: 'tp-new',
      webSearch: false,
    }));
  });

  it('rewrites saved V2.5 model ids to the V2.6 options', () => {
    expect(getMimoProviderSettings({
      providerConfigs: { mimo: { model: 'mimo-v2.5-pro' } },
    }).model).toBe('mimo-v2.6-pro');
    expect(getMimoProviderSettings({
      providerConfigs: { mimo: { model: 'mimo-v2.5' } },
    }).model).toBe('mimo-v2.6-flash');
  });
});

describe('MIMO_MODELS', () => {
  it('offers V2.6 Pro and Flash', () => {
    expect(MIMO_MODELS.map((model) => model.value)).toEqual([
      'mimo-v2.6-pro',
      'mimo-v2.6-flash',
    ]);
    expect(DEFAULT_MIMO_PROVIDER_SETTINGS.model).toBe('mimo-v2.6-flash');
  });
});

describe('resolveMimoChatModel', () => {
  it('keeps V2.6 Pro for text and image turns', () => {
    expect(resolveMimoChatModel('mimo-v2.6-pro', false)).toBe('mimo-v2.6-pro');
    expect(resolveMimoChatModel('mimo-v2.6-pro', true)).toBe('mimo-v2.6-pro');
  });

  it('switches text-only V2.5 Pro to Flash when a turn includes images', () => {
    expect(resolveMimoChatModel('mimo-v2.5-pro', false)).toBe('mimo-v2.5-pro');
    expect(resolveMimoChatModel('mimo-v2.5-pro', true)).toBe(MIMO_VISION_MODEL);
  });
});

describe('mimoSettingsReconciler', () => {
  it('persists the V2.5 to V2.6 model migration', () => {
    const settings: Record<string, unknown> = {
      model: 'mimo-v2.5-pro',
      titleGenerationModel: 'mimo-v2.5',
      savedProviderModel: { mimo: 'mimo-v2.5' },
      providerConfigs: { mimo: { model: 'mimo-v2.5-pro' } },
    };

    expect(mimoSettingsReconciler.normalizeModelVariantSettings(settings)).toBe(true);
    expect(settings.model).toBe('mimo-v2.6-pro');
    expect(settings.titleGenerationModel).toBe('mimo-v2.6-flash');
    expect(settings.savedProviderModel).toEqual({ mimo: 'mimo-v2.6-flash' });
    expect(settings.providerConfigs).toEqual({ mimo: { model: 'mimo-v2.6-pro' } });
    expect(mimoSettingsReconciler.normalizeModelVariantSettings(settings)).toBe(false);
  });
});
