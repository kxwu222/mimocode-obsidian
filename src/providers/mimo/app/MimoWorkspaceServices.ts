import type {
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import { mimoSettingsTabRenderer } from '../ui/MimoSettingsTab';

export const mimoWorkspaceRegistration: ProviderWorkspaceRegistration<ProviderWorkspaceServices> = {
  async initialize() {
    return {
      settingsTabRenderer: mimoSettingsTabRenderer,
    };
  },
};
