import '@/providers';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';

describe('ProviderRegistry', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a runtime with the mimo provider id', () => {
    const runtime = ProviderRegistry.createChatRuntime({
      plugin: {} as any,
    });

    expect(runtime.providerId).toBe('mimo');
  });

  it('returns capabilities for the mimo provider', () => {
    const caps = ProviderRegistry.getCapabilities();
    expect(caps.providerId).toBe('mimo');
    expect(caps).toHaveProperty('supportsPlanMode');
    expect(caps).toHaveProperty('supportsFork');
  });

  it('returns boundary services for the mimo provider', () => {
    const historyService = ProviderRegistry.getConversationHistoryService();
    expect(historyService).toHaveProperty('hydrateConversationHistory');

    const taskInterpreter = ProviderRegistry.getTaskResultInterpreter();
    expect(taskInterpreter).toHaveProperty('resolveTerminalStatus');
  });

  it('returns a settings reconciler for the mimo provider', () => {
    const reconciler = ProviderRegistry.getSettingsReconciler();
    expect(reconciler).toHaveProperty('reconcileModelWithEnvironment');
    expect(reconciler).toHaveProperty('normalizeModelVariantSettings');
  });

  it('returns a chat UI config for the mimo provider', () => {
    const uiConfig = ProviderRegistry.getChatUIConfig();
    expect(uiConfig).toHaveProperty('getModelOptions');
    expect(uiConfig).toHaveProperty('getCustomModelIds');
  });

  it('throws when an unknown provider is requested', () => {
    expect(() => ProviderRegistry.getCapabilities(
      'nonexistent' as any,
    )).toThrow('Provider "nonexistent" is not registered.');
  });

  it('lists only mimo as a registered provider', () => {
    const ids = ProviderRegistry.getRegisteredProviderIds();
    expect(ids).toContain('mimo');
    expect(ids).toHaveLength(1);
  });

  it('returns mimo as the only enabled provider', () => {
    const ids = ProviderRegistry.getEnabledProviderIds({
      providerConfigs: {
        mimo: { enabled: true },
      },
    });
    expect(ids).toEqual(['mimo']);
  });

  it('returns the display name from provider registration metadata', () => {
    expect(ProviderRegistry.getProviderDisplayName('mimo')).toBe('Connect MiMo API');
  });
});
