import { McpServerManager } from '../../../core/mcp/McpServerManager';
import type {
  ProviderWorkspaceInitContext,
  ProviderWorkspaceRegistration,
  ProviderWorkspaceServices,
} from '../../../core/providers/types';
import { mimoHistoryService } from '../history/mimoHistoryService';
import { MimoMcpStorage } from '../mcp/MimoMcpStorage';
import { mimoSettingsTabRenderer } from '../ui/MimoSettingsTab';

export interface MimoWorkspaceServices extends ProviderWorkspaceServices {
  mcpServerManager: McpServerManager;
}

export const mimoWorkspaceRegistration: ProviderWorkspaceRegistration<MimoWorkspaceServices> = {
  async initialize({ vaultAdapter, plugin }: ProviderWorkspaceInitContext) {
    mimoHistoryService.attachWorkspaceStorage({
      adapter: vaultAdapter,
      configDir: plugin.app.vault.configDir,
      pluginId: plugin.manifest.id,
    });

    const mcpStorage = new MimoMcpStorage(vaultAdapter);
    const mcpServerManager = new McpServerManager(mcpStorage);
    await mcpServerManager.loadServers();

    return {
      mcpServerManager,
      settingsTabRenderer: mimoSettingsTabRenderer,
    };
  },
};
