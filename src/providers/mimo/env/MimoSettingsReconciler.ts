import type { ProviderSettingsReconciler } from '../../../core/providers/types';
import type { Conversation } from '../../../core/types';

// Mimo uses API-key auth with no env-var-driven model discovery,
// so reconciliation is a no-op.
export const mimoSettingsReconciler: ProviderSettingsReconciler = {
  reconcileModelWithEnvironment(
    _settings: Record<string, unknown>,
    _conversations: Conversation[],
  ): { changed: boolean; invalidatedConversations: Conversation[] } {
    return { changed: false, invalidatedConversations: [] };
  },

  normalizeModelVariantSettings(_settings: Record<string, unknown>): boolean {
    return false;
  },
};
