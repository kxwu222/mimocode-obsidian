import '@/providers';

import { ProviderSettingsCoordinator } from '@/core/providers/ProviderSettingsCoordinator';
import type { Conversation } from '@/core/types';
const DEFAULT_MIMO_MODEL = 'mimo-v2.5';

describe('ProviderSettingsCoordinator', () => {
  describe('normalizeProviderSelection', () => {
    it('keeps mimo when it is the active provider', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'mimo',
        providerConfigs: {
          mimo: { enabled: true },
        },
      };

      const changed = ProviderSettingsCoordinator.normalizeProviderSelection(settings);

      expect(changed).toBe(false);
      expect(settings.settingsProvider).toBe('mimo');
    });

    it('falls back to mimo for unknown providers', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'mystery-provider',
        providerConfigs: {},
      };

      const changed = ProviderSettingsCoordinator.normalizeProviderSelection(settings);

      expect(changed).toBe(true);
      expect(settings.settingsProvider).toBe('mimo');
    });
  });

  describe('reconcileAllProviders', () => {
    it('delegates to each registered provider reconciler with its own conversations', () => {
      const settings: Record<string, unknown> = { model: DEFAULT_MIMO_MODEL };
      const mimoConv = { providerId: 'mimo', messages: [] } as unknown as Conversation;
      const conversations = [mimoConv];

      const result = ProviderSettingsCoordinator.reconcileAllProviders(settings, conversations);

      expect(result).toHaveProperty('changed');
      expect(result).toHaveProperty('invalidatedConversations');
      expect(Array.isArray(result.invalidatedConversations)).toBe(true);
    });
  });

  describe('normalizeAllModelVariants', () => {
    it('delegates to registered providers', () => {
      const settings: Record<string, unknown> = { model: DEFAULT_MIMO_MODEL };
      const result = ProviderSettingsCoordinator.normalizeAllModelVariants(settings);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('projectActiveProviderState', () => {
    it('defaults to mimo when settingsProvider is not set', () => {
      const settings: Record<string, unknown> = {
        model: 'old-model',
        effortLevel: 'low',
        serviceTier: 'default',
        thinkingBudget: '500',
        savedProviderModel: { mimo: DEFAULT_MIMO_MODEL },
        savedProviderEffort: { mimo: 'high' },
        savedProviderServiceTier: { mimo: 'default' },
        savedProviderThinkingBudget: { mimo: 'off' },
      };

      ProviderSettingsCoordinator.projectActiveProviderState(settings);

      expect(settings.model).toBe(DEFAULT_MIMO_MODEL);
    });

    it('does not overwrite when no saved values exist', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'mimo',
        model: DEFAULT_MIMO_MODEL,
        effortLevel: 'high',
        serviceTier: 'default',
        thinkingBudget: 'off',
        savedProviderModel: {},
        savedProviderEffort: {},
        savedProviderServiceTier: {},
        savedProviderThinkingBudget: {},
      };

      ProviderSettingsCoordinator.projectActiveProviderState(settings);

      expect(settings.model).toBe(DEFAULT_MIMO_MODEL);
      expect(settings.effortLevel).toBe('high');
    });

    it('handles missing saved maps gracefully', () => {
      const settings: Record<string, unknown> = {
        settingsProvider: 'mimo',
        model: DEFAULT_MIMO_MODEL,
        effortLevel: 'high',
        serviceTier: 'default',
        thinkingBudget: 'off',
      };

      expect(() => ProviderSettingsCoordinator.projectActiveProviderState(settings)).not.toThrow();
      expect(settings.model).toBe(DEFAULT_MIMO_MODEL);
    });
  });
});
