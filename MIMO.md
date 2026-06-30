## Project Overview

MiMo Chat is a fork of [Claudian](https://github.com/YishenTu/claudian) that strips the plugin to a single provider: **Xiaomi MiMo**, accessed via the MiMo Token Plan API or Pay-as-you-go API (OpenAI-compatible HTTP). The only registered provider is `mimo` in `src/providers/mimo/`.

Other provider source directories (`claude/`, `codex/`, `opencode/`, `pi/`, `acp/`) are preserved unchanged to keep the test suite green, but they are not registered at runtime.

## Architecture Status

- Product: MiMo Code — single-provider, HTTP-only (no CLI subprocess). `MimoChatRuntime` uses `fetch` + SSE against `https://api.xiaomimimo.com/v1` (PAYG) or cluster-specific Token Plan URLs.
- App shell: `src/app/` owns shared settings defaults and plugin-level storage helpers. `src/core/` owns provider-neutral runtime, registry, tool, and type contracts.
- Provider boundary: `src/core/runtime/` and `src/core/providers/` define the chat-facing seam. Only `mimo` is registered in `src/providers/index.ts`.
- Mimo adaptor: `src/providers/mimo/` owns the HTTP runtime, settings (billing mode, API key, cluster, model), capabilities, no-op history service, settings reconciler, chat UI config, settings tab, and auxiliary services (title gen, inline edit, instruction refine via `MimoAuxQueryRunner`).
- Conversations: `Conversation` carries `providerId: 'mimo'`. Mimo is stateless — no `providerState` or `sessionId` is persisted.

## Commands

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
npm run lint:fix
npm run test
npm run test:watch
npm run test:coverage
```

## Architecture

| Layer | Purpose | Details |
|-------|---------|---------|
| **app** | Shared defaults and plugin-level storage helpers | `defaultSettings`, `ClaudianSettingsStorage`, `SharedStorageService` |
| **core** | Provider-neutral contracts and infrastructure | See [`src/core/CLAUDE.md`](src/core/CLAUDE.md) |
| **providers/claude** | Claude SDK adaptor | See [`src/providers/claude/CLAUDE.md`](src/providers/claude/CLAUDE.md) |
| **providers/codex** | Codex app-server adaptor | See [`src/providers/codex/CLAUDE.md`](src/providers/codex/CLAUDE.md) |
| **features/chat** | Main sidebar interface | See [`src/features/chat/CLAUDE.md`](src/features/chat/CLAUDE.md) |
| **features/inline-edit** | Inline edit modal and provider-backed edit services | `InlineEditModal` plus provider-owned inline edit services |
| **features/settings** | Shared settings shell with provider tabs | General tab plus provider-owned Claude and Codex tab renderers |
| **shared** | Reusable UI building blocks | Dropdowns, modals, mention UI, icons |
| **i18n** | Internationalization | 10 locales |
| **utils** | Cross-cutting utilities | env, path, markdown, diff, context, file-link, image, browser, canvas, session, subagent helpers |
| **style** | Modular CSS | See [`src/style/CLAUDE.md`](src/style/CLAUDE.md) |

## Tests

```bash
npm run test -- --selectProjects unit
npm run test -- --selectProjects integration
npm run test:coverage -- --selectProjects unit
```

Tests mirror the `src/` layout under `tests/unit/` and `tests/integration/`.

## Storage

| Path | Contents |
|------|----------|
| `.claude/settings.json` | Claude Code-compatible project settings, permissions, and plugin overrides |
| `.claudian/claudian-settings.json` | Shared Claudian app settings plus provider-specific configuration |
| `.claude/mcp.json` | Claudian-managed MCP servers for Claude |
| `.claude/commands/**/*.md` | Claude slash commands |
| `.claude/skills/*/SKILL.md` | Claude skills |
| `.claude/agents/*.md` | Claude vault agents |
| `.claudian/sessions/*.meta.json` | Provider-neutral session metadata |
| `.codex/skills/*/SKILL.md` | Codex vault skills |
| `.agents/skills/*/SKILL.md` | Alternate Codex vault skill root |
| `.codex/agents/*.toml` | Codex vault subagent definitions |
| `~/.claude/projects/{vault}/*.jsonl` | Claude-native transcripts |
| `~/.codex/sessions/**/*.jsonl` | Codex-native transcripts |

## Development Notes

- **Provider-native first**: Prefer the official Claude SDK and Codex app-server behavior over reimplementing provider features locally. When the provider already owns a capability, adapt to it instead of shadowing it.
- **Runtime exploration**: For provider integrations, inspect real runtime output first. Claude data lands under `~/.claude/` and Codex data under `~/.codex/`. Real transcripts beat guessed event shapes. Put throwaway local scripts in `.context/`; only promote durable tooling into `dev/`.
- **Comments**: Comment why, not what. Avoid narration and redundant JSDoc.
- **TDD workflow**: For new behavior or bug fixes, write the failing test first in the mirrored `tests/` path, make it pass, then refactor.
- Run `npm run typecheck && npm run lint && npm run test && npm run build` after editing.
- No `console.*` in production code.
- Put non-committed notes, handoff files, and throwaway scripts in `.context/`.
