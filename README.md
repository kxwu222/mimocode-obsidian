# MiMo for Obsidian

![License](https://img.shields.io/github/license/kxwu222/mimocode-obsidian)
![GitHub release](https://img.shields.io/github/v/release/kxwu222/mimocode-obsidian)

An Obsidian plugin that brings [Xiaomi MiMo](https://mimo.mi.com) into your vault sidebar as an AI assistant.

## Features

**Chat sidebar** — Open a persistent chat panel from the ribbon or command palette. MiMo can answer questions, help you think through problems, and work with your vault content step by step.

**MCP tool use** — MCP servers connected to let MiMo read and write vault files, search the web, and run multi-step agentic tasks autonomously.

**Inline-Edit** — Select any text in a note and invoke the inline-edit hotkey. MiMo rewrites it in place, with a word-level diff preview before you commit.

**Prompt Tuning** — Type `#` in an empty chat input to describe a behavior in plain language. MiMo rewrites it into a clean system instruction and saves it to your settings after confirmation.

**Conversation History** — Sessions are saved locally in your vault. Resume, browse, or delete past conversations at any time.

**Multi-Tab** — Run multiple chat tabs in parallel for separate contexts or tasks.

**Image Attachments** — Drop images directly into messages.

## Requirements

- Obsidian desktop v1.7.2 or later
- A Xiaomi MiMo API key — either billing type works:

| Billing type | Key format | Best for |
|---|---|---|
| [Token Plan](https://mimo.mi.com/docs/en-US/tokenplan/Token%20Plan/quick-access) | `tp-xxxxx` | Heavy use — flat monthly/yearly fee |
| [Pay as you go](https://platform.xiaomimimo.com) | `sk-xxxxx` | Occasional use — pay per token |

## Setup

1. Install from Obsidian Community Plugins — search **MiMo**.
2. Open **Settings → MiMo**.
3. Toggle **Enable MiMo** on.
4. Set **Billing mode** to match your account type.
5. Paste your **API key** (`tp-xxxxx` for Token Plan, `sk-xxxxx` for pay as you go).
6. Token Plan users: select the **cluster** closest to you (Europe, Asia Pacific, or China).
7. Click **Test connection** to confirm everything works.
8. Open the sidebar from the ribbon icon or via **MiMo: Open chat** in the command palette.

## Models

| Model | Description |
|-------|-------------|
| `mimo-v2.5-pro` | Flagship — 1T params, 42B active, 1M context, native MCP tool calling (default) |
| `mimo-v2.5` | Multimodal — image, video, and audio input support |

## API Endpoints

**Pay as you go** — single global endpoint:
```
https://api.xiaomimimo.com/v1
```

**Token Plan** — pick the cluster closest to you:

| Region | Base URL |
|--------|----------|
| Europe (Amsterdam) | `https://token-plan-ams.xiaomimimo.com/v1` |
| Asia Pacific (Singapore) | `https://token-plan-sgp.xiaomimimo.com/v1` |
| China | `https://token-plan-cn.xiaomimimo.com/v1` |

## Privacy

Your messages and vault context are sent to Xiaomi MiMo's API servers in accordance with their [Terms of Service](https://mimo.mi.com). Conversation history is stored locally in your vault. This plugin collects no data.

## Credits

MiMo is built on top of [Claudian](https://github.com/YishenTu/claudian) by [Yishen Tu](https://github.com/YishenTu). Thanks for the solid foundation.

## License

MIT — see [LICENSE](LICENSE).
