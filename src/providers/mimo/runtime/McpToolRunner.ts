/**
 * McpToolRunner — opens MCP client connections per server, lists their tools,
 * and executes tool calls for the MiMo agent loop.
 *
 * One runner instance is created per query turn and closed when the turn ends.
 */
import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport';

import { createNodeFetch } from '../../../core/mcp/McpTester';
import type { McpServerConfig } from '../../../core/types';
import { getMcpServerType } from '../../../core/types';
import { getEnhancedPath } from '../../../utils/env';
import { parseCommand } from '../../../utils/mcp';

/** OpenAI-format tool definition. */
export interface OpenAIToolDef {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

interface McpClientEntry {
  client: Client;
  transport: Transport;
}

type LegacySseTransportConstructor = new (
  url: URL,
  options?: unknown,
) => Transport;

function createLegacySseTransport(url: URL, options: unknown): Transport {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- SSE transport is loaded lazily to avoid bundling it when unused
  const module = require('@modelcontextprotocol/sdk/client/sse') as {
    SSEClientTransport: LegacySseTransportConstructor;
  };
  return new module.SSEClientTransport(url, options);
}

function createTransport(name: string, config: McpServerConfig): Transport {
  const type = getMcpServerType(config);

  if (type === 'stdio') {
    const cfg = config as { command: string; args?: string[]; env?: Record<string, string> };
    const { cmd, args } = parseCommand(cfg.command, cfg.args);
    if (!cmd) {
      throw new Error(`MCP server "${name}": missing command`);
    }
    return new StdioClientTransport({
      command: cmd,
      args,
      env: { ...process.env, ...cfg.env, PATH: getEnhancedPath(cfg.env?.PATH) },
      stderr: 'ignore',
    });
  }

  const cfg = config as { url: string; headers?: Record<string, string> };
  const url = new URL(cfg.url);
  const nodeFetch = createNodeFetch();
  const options = {
    fetch: nodeFetch,
    requestInit: cfg.headers ? { headers: cfg.headers } : undefined,
  };
  return type === 'sse'
    ? createLegacySseTransport(url, options)
    : new StreamableHTTPClientTransport(url, options);
}

export class McpToolRunner {
  /** Lazily opened connections, keyed by server name. */
  private entries = new Map<string, McpClientEntry>();

  private async getClient(serverName: string, config: McpServerConfig): Promise<Client> {
    const existing = this.entries.get(serverName);
    if (existing) {
      return existing.client;
    }

    const transport = createTransport(serverName, config);
    const client = new Client({ name: 'mimo', version: '1.0.0' });
    await client.connect(transport);
    this.entries.set(serverName, { client, transport });
    return client;
  }

  /**
   * List all tools from the given servers as OpenAI tool definitions.
   * Tool names follow the `mcp__serverName__toolName` convention.
   */
  async listTools(
    servers: Record<string, McpServerConfig>,
  ): Promise<OpenAIToolDef[]> {
    const tools: OpenAIToolDef[] = [];

    for (const [serverName, config] of Object.entries(servers)) {
      try {
        const client = await this.getClient(serverName, config);
        const result = await client.listTools();
        for (const tool of result.tools) {
          tools.push({
            type: 'function',
            function: {
              name: `mcp__${serverName}__${tool.name}`,
              description: tool.description,
              parameters: tool.inputSchema as Record<string, unknown> | undefined,
            },
          });
        }
      } catch {
        // Skip servers that fail to connect or list tools.
      }
    }

    return tools;
  }

  /**
   * Execute a single tool call identified by its OpenAI-format compound name
   * (`mcp__serverName__toolName`) and return the text content of the result.
   */
  async callTool(
    compoundName: string,
    serverConfigs: Record<string, McpServerConfig>,
    input: Record<string, unknown>,
  ): Promise<{ content: string; isError: boolean }> {
    // Parse mcp__serverName__toolName
    const parts = compoundName.split('__');
    if (parts.length < 3 || parts[0] !== 'mcp') {
      return { content: `Unknown tool format: ${compoundName}`, isError: true };
    }
    const serverName = parts[1];
    const toolName = parts.slice(2).join('__');
    const config = serverConfigs[serverName];
    if (!config) {
      return { content: `No server config for "${serverName}"`, isError: true };
    }

    try {
      const client = await this.getClient(serverName, config);
      const result = await client.callTool({ name: toolName, arguments: input });

      const isError = result.isError === true;
      const rawContent = result.content;
      const contentArray = Array.isArray(rawContent) ? rawContent : [];
      const textContent = contentArray
        .filter((block): block is { type: 'text'; text: string } =>
          typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text',
        )
        .map((block) => block.text)
        .join('\n');

      return { content: textContent || JSON.stringify(rawContent), isError };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: `Tool call failed: ${message}`, isError: true };
    }
  }

  async close(): Promise<void> {
    const entries = Array.from(this.entries.values());
    this.entries.clear();

    await Promise.allSettled(
      entries.map(({ client }) => client.close()),
    );
  }
}
