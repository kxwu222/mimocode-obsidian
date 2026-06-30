import type { ProviderRegistration } from '../../core/providers/types';
import { MimoInlineEditService } from './auxiliary/MimoInlineEditService';
import { MimoInstructionRefineService } from './auxiliary/MimoInstructionRefineService';
import { MimoTaskResultInterpreter } from './auxiliary/MimoTaskResultInterpreter';
import { MimoTitleGenerationService } from './auxiliary/MimoTitleGenerationService';
import { MIMO_PROVIDER_CAPABILITIES } from './capabilities';
import { mimoSettingsReconciler } from './env/MimoSettingsReconciler';
import { MimoConversationHistoryService } from './history/MimoConversationHistoryService';
import { MimoChatRuntime } from './runtime/MimoChatRuntime';
import { getMimoProviderSettings } from './settings';
import { mimoChatUIConfig } from './ui/MimoChatUIConfig';

export const mimoProviderRegistration: ProviderRegistration = {
  blankTabOrder: 1,
  capabilities: MIMO_PROVIDER_CAPABILITIES,
  chatUIConfig: mimoChatUIConfig,
  createInlineEditService: (plugin) => new MimoInlineEditService(plugin),
  createInstructionRefineService: (plugin) => new MimoInstructionRefineService(plugin),
  createRuntime: ({ plugin }) => new MimoChatRuntime(plugin),
  createTitleGenerationService: (plugin) => new MimoTitleGenerationService(plugin),
  displayName: 'MiMo',
  historyService: new MimoConversationHistoryService(),
  isEnabled: (settings) => getMimoProviderSettings(settings).enabled,
  settingsReconciler: mimoSettingsReconciler,
  taskResultInterpreter: new MimoTaskResultInterpreter(),
};
