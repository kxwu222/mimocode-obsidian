import { DEFAULT_MIMO_PROVIDER_SETTINGS, getMimoProviderSettings } from '@/providers/mimo/settings';

describe('DEFAULT_MIMO_PROVIDER_SETTINGS', () => {
  it('enables MiMo by default so a new vault has a provider', () => {
    expect(DEFAULT_MIMO_PROVIDER_SETTINGS.enabled).toBe(true);
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
});
