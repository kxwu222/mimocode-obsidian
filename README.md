# MiMo Code

![License](https://img.shields.io/github/license/kxwu222/mimocode-obsidian)
![GitHub release](https://img.shields.io/github/v/release/kxwu222/mimocode-obsidian)

An Obsidian plugin that embeds [Xiaomi MiMo](https://mimo.mi.com) as an AI coding assistant in your vault sidebar. Powered by the **MiMo Token Plan API** — subscribe once, chat as much as you want.

## Features

**Chat sidebar** — Open a persistent chat panel from the ribbon icon or command palette. MiMo reads and writes files in your vault, answers coding questions, and helps you think through problems.

**Inline Edit** — Select text in a note and use the inline-edit hotkey to have MiMo rewrite it in place, with a word-level diff preview before applying.

**Instruction Refinement** — Type `#` in the chat input to refine a custom system instruction interactively.

**Conversation History** — All conversations are stored locally in your vault (`.claudian/sessions/`). Resume, browse, and delete past sessions.

**Multi-Tab** — Open multiple chat tabs for parallel conversations.

**Image Attachments** — Attach images to your messages (supported by `mimo-v2.5` multimodal model).

## Requirements

- Obsidian desktop (v1.7.2 or later)
- A [MiMo Token Plan](https://mimo.mi.com/docs/en-US/tokenplan/Token%20Plan/quick-access) subscription (`tp-xxxxx` API key)

## Setup

1. Install the plugin from Obsidian's Community Plugins (search **MiMo Code**).
2. Go to **Settings → MiMo Code**.
3. Toggle **Enable MiMo** on.
4. Paste your **Token Plan API key** (`tp-xxxxx`).
5. Choose the **cluster** closest to you (Europe, Asia Pacific, or China).
6. Click **Test connection** to verify everything works.
7. Open the chat sidebar from the ribbon or via the command palette (`MiMo Code: Open chat`).

## Models

| Model | Description |
|-------|-------------|
| `mimo-v2.5-pro` | Flagship — 1T params, 42B active, 1M context (default) |
| `mimo-v2.5-pro-ultraspeed` | High-throughput variant, faster responses |
| `mimo-v2.5` | Multimodal — supports image / video / audio inputs |

## Cluster URLs

| Region | Base URL |
|--------|----------|
| Europe (Amsterdam) | `https://token-plan-ams.xiaomimimo.com/v1` |
| Asia Pacific (Singapore) | `https://token-plan-sgp.xiaomimimo.com/v1` |
| China | `https://token-plan-cn.xiaomimimo.com/v1` |

## Privacy

Your messages and vault context are sent to Xiaomi MiMo's API servers according to their [Terms of Service](https://mimo.mi.com). Conversation history is stored locally in your vault under `.claudian/sessions/`. No data is collected by this plugin.

## License

MIT — see [LICENSE](LICENSE).
