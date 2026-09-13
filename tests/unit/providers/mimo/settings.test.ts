import {
  DEFAULT_MIMO_PROVIDER_SETTINGS,
  getMimoProviderSettings,
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
});

describe('resolveMimoChatModel', () => {
  it('keeps Pro for text-only turns', () => {
    expect(resolveMimoChatModel('mimo-v2.5-pro', false)).toBe('mimo-v2.5-pro');
  });

  it('switches Pro to the vision model when a turn includes images', () => {
    expect(resolveMimoChatModel('mimo-v2.5-pro', true)).toBe(MIMO_VISION_MODEL);
  });
});
