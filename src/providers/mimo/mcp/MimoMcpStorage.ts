/**
 * MiMo MCP storage — reads MCP server definitions from the shared
 * `.claude/mcp.json` file so that users configure servers once for all providers.
 */
import type { McpStorageAdapter } from '../../../core/mcp/McpServerManager';
import type { VaultFileAdapter } from '../../../core/storage/VaultFileAdapter';
import {
  DEFAULT_MCP_SERVER,
  isValidMcpServerConfig,
  type ManagedMcpConfigFile,
  type ManagedMcpServer,
} from '../../../core/types';

const MCP_CONFIG_PATH = '.claude/mcp.json';

export class MimoMcpStorage implements McpStorageAdapter {
  constructor(private readonly adapter: VaultFileAdapter) {}

  async load(): Promise<ManagedMcpServer[]> {
    try {
      if (!(await this.adapter.exists(MCP_CONFIG_PATH))) {
        return [];
      }

      const content = await this.adapter.read(MCP_CONFIG_PATH);
      const file = JSON.parse(content) as ManagedMcpConfigFile;

      if (!file.mcpServers || typeof file.mcpServers !== 'object') {
        return [];
      }

      const claudianMeta = file._claudian?.servers ?? {};
      const servers: ManagedMcpServer[] = [];

      for (const [name, config] of Object.entries(file.mcpServers)) {
        if (!isValidMcpServerConfig(config)) {
          continue;
        }

        const meta = claudianMeta[name] ?? {};
        const disabledTools = Array.isArray(meta.disabledTools)
          ? meta.disabledTools.filter((tool) => typeof tool === 'string')
          : undefined;
        const normalizedDisabledTools =
          disabledTools && disabledTools.length > 0 ? disabledTools : undefined;

        servers.push({
          name,
          config,
          enabled: meta.enabled ?? DEFAULT_MCP_SERVER.enabled,
          contextSaving: meta.contextSaving ?? DEFAULT_MCP_SERVER.contextSaving,
          disabledTools: normalizedDisabledTools,
          description: meta.description,
        });
      }

      return servers;
    } catch {
      return [];
    }
  }
}
