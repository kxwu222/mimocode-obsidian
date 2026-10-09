import type { ProviderSettingsReconciler } from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';
import { migrateMimoModelId } from '../settings';

function migrateStoredModel(holder: Record<string, unknown>, key: string): boolean {
  const current = holder[key];
  if (typeof current !== 'string') {
    return false;
  }
  const next = migrateMimoModelId(current);
  if (next === current) {
    return false;
  }
  holder[key] = next;
  return true;
}

export const mimoSettingsReconciler: ProviderSettingsReconciler = {
  reconcileModelWithEnvironment(
    _settings: Record<string, unknown>,
    _conversations: Conversation[],
  ): { changed: boolean; invalidatedConversations: Conversation[] } {
    return { changed: false, invalidatedConversations: [] };
  },

  normalizeModelVariantSettings(settings: Record<string, unknown>): boolean {
    let changed = migrateStoredModel(settings, 'model');
    changed = migrateStoredModel(settings, 'titleGenerationModel') || changed;

    const savedProviderModel = settings.savedProviderModel;
    if (savedProviderModel && typeof savedProviderModel === 'object' && !Array.isArray(savedProviderModel)) {
      changed = migrateStoredModel(savedProviderModel as Record<string, unknown>, 'mimo') || changed;
    }

    const providerConfigs = settings.providerConfigs;
    if (providerConfigs && typeof providerConfigs === 'object' && !Array.isArray(providerConfigs)) {
      const mimo = (providerConfigs as Record<string, unknown>).mimo;
      if (mimo && typeof mimo === 'object' && !Array.isArray(mimo)) {
        changed = migrateStoredModel(mimo as Record<string, unknown>, 'model') || changed;
      }
    }

    return changed;
  },
};
