# MiMo for Obsidian

![License](https://img.shields.io/github/license/kxwu222/mimocode-obsidian)
![GitHub release](https://img.shields.io/github/v/release/kxwu222/mimocode-obsidian)

An Obsidian plugin that brings [Xiaomi MiMo](https://mimo.mi.com) into your vault sidebar as a chat assistant. Paste an API key and start talking — no CLI, no extra runtime.

## Features

**Chat sidebar**: Open a streaming chat panel from the ribbon or command palette. Ask questions, think through a note, or bounce ideas while you write. Threads are saved locally and come back when you reopen Obsidian.

**Inline edit**: Select text in a note and run **MiMo: Inline edit** (bind a hotkey in Settings → Hotkeys). MiMo rewrites the selection in place. Preview the change as a line-level diff before you commit.

**Multi-tab**: Run several chats side by side for separate threads.

**Image attachments**: Drop or paste jpeg, png, gif, or webp into the *current* message. Images stay with the chat on disk so you can reopen the thread after a restart.

**Editor and vault context**: The active note, `@`-mentioned notes, and any editor / canvas / browser selection are sent with the turn. MiMo can also list, search, read, write, and edit notes, and move them to Obsidian trash, using built-in vault tools (LS, Glob, Grep, Read, Write, Edit, Delete). You should see those tool names in the thread when it uses them. Obsidian Sync is not required.

## Requirements

- Obsidian desktop v1.7.2 or later
- A Xiaomi MiMo API key - either billing type works:


| Billing type                                                                     | Key format | Best for                            |
| -------------------------------------------------------------------------------- | ---------- | ----------------------------------- |
| [Token Plan](https://mimo.mi.com/docs/en-US/tokenplan/Token%20Plan/quick-access) | `tp-xxxxx` | Heavy use — flat monthly/yearly fee |
| [Pay as you go](https://platform.xiaomimimo.com)                                 | `sk-xxxxx` | Occasional use — pay per token      |




## Setup

1. Install from Obsidian Community Plugins — search **MiMo**.
2. Open **Settings → MiMo → Connect MiMo API** (not the General tab).
3. Set **Billing mode** to match your account type.
4. Paste your **API key** (`tp-xxxxx` for Token Plan, `sk-xxxxx` for pay as you go).
5. Token Plan users: select the **cluster** closest to you (Europe, Asia Pacific, or China).
6. Click **Test connection** to confirm everything works.
7. Open the sidebar from the ribbon icon or via **MiMo: Open chat** in the command palette.

MiMo is on by default. Turn **Enable MiMo** off only if you want to disable chat in this vault.

Chat commands (open chat, inline edit, new tab, new session, close tab) have no default keys. Bind them under **Settings → Hotkeys** (search **MiMo**).

## Models


| Model           | Description                                  |
| --------------- | -------------------------------------------- |
| `mimo-v2.5`     | Default. Chat plus image input.              |
| `mimo-v2.5-pro` | Flagship — 1T params, 42B active, 1M context |




## API Endpoints

**Pay as you go** — single global endpoint:

```
https://api.xiaomimimo.com/v1
```

**Token Plan** — pick the cluster closest to you:


| Region                   | Base URL                                   |
| ------------------------ | ------------------------------------------ |
| Europe (Amsterdam)       | `https://token-plan-ams.xiaomimimo.com/v1` |
| Asia Pacific (Singapore) | `https://token-plan-sgp.xiaomimimo.com/v1` |
| China                    | `https://token-plan-cn.xiaomimimo.com/v1`  |




## Privacy

Your messages, attached images, and any editor or vault context you send are transmitted to Xiaomi MiMo's API servers in accordance with their [Terms of Service](https://mimo.mi.com). When MiMo uses vault tools, it can read, create, edit, or move notes to Obsidian trash in this vault. This plugin collects no analytics of its own. Chat transcripts (including attached image bytes) are stored locally under the plugin folder in your vault config directory so History can restore them after a restart.

## Credits

MiMo is built on top of [Claudian](https://github.com/YishenTu/claudian) by [Yishen Tu](https://github.com/YishenTu). Thanks for the solid foundation.

## License

MIT — see [LICENSE](LICENSE).
