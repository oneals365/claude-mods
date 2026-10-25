# Claude Code mods

Five ready-built mods for Claude Code. They're built and tested against v2.1.310, and install from this repo with one command each. The `prompts/` folder has the ONEALS FIIT sales-team prompts and more mod ideas.

| Mod | What it does | How you use it |
| --- | --- | --- |
| **team-room** | A Team pane listing every message between your Claude Code sessions, newest on top. `/standup` asks each teammate session for a one-line "done / next" update. | `/team`, `/standup`, or `/standup prospector outreach` |
| **saver** | Checks each prompt. Easy ones (typos, renames, formatting, short summaries, quick questions) go to Claude Haiku 5.5, and hard ones stay on your main model. A strip above the prompt shows the model that answered last and what you saved today at list prices. Below 100K context only. | `/saver on`, `/saver off`, `/saver` |
| **dashboard** | A pane with three tabs: **To-do** (kept between sessions), **Inbox** (Gmail threads from the last 24h not sent by you), and **Today** (Google Calendar). It refreshes every 10 minutes. A strip above the prompt reads like `3 to-dos · 2 to answer · next: 2 PM call`. | `/hq` (Claude Code now ships its own `/dashboard`), `/todo <task>` |
| **hud** | A line above the prompt with your git branch, a context-window bar that turns red past 80%, and your 5-hour and weekly limits as health bars. | Always on |
| **session-tools** | A desktop notification when a turn longer than 2 minutes finishes, and a row per turn in `claude-costs.csv` in the project folder. | Always on |

## Before you start

Mods need Claude Code **v2.1.287 or later** (Desktop app v2.1.286 or later). Check with `claude --version`, and run `claude update` if you're behind.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install team-room --marketplace oneals365/claude-mods
/plugin install saver --marketplace oneals365/claude-mods
/plugin install dashboard --marketplace oneals365/claude-mods
/plugin install hud --marketplace oneals365/claude-mods
/plugin install session-tools --marketplace oneals365/claude-mods
```

Answer `y` to add the marketplace, then press Enter to pick the user scope.

To install from a shell instead:

```
claude plugin install team-room --marketplace oneals365/claude-mods
```

In the desktop app (where `/plugin` doesn't run), click **+** next to the prompt box, then **Plugins**, then **Add marketplace** with `oneals365/claude-mods`, then **Add plugin**.

This repository is private, so it only installs on a machine where git can already read your GitHub. To set that up once, run `gh auth login`, then `gh auth setup-git`.

## Setup notes

- **Dashboard → Inbox / Today** need Gmail and Google Calendar connected in Claude Code. The mod finds them by themselves. If it can't, set the server names (as `/mcp` lists them) in `/config` under *dashboard*. Set **My email** there too, so threads where you sent the last message are left out.
- **Team Room**: set the default `/standup` names under `/config` → *team-room* → Team. The default is `prospector, outreach`. See `prompts/team-oneals-fiit.md` for the three-session ONEALS FIIT setup.
- **Saver** prices: Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20, Fable 5.1 $10/$50 per million tokens (Claude API list prices, October 2026). On a Pro or Max plan you don't pay per token, but Saver still stretches your limits.

## Stay safe

A mod runs as you, unsandboxed. Before installing anyone else's, read it and run `claude plugin validate ./some-mod`. To turn one off, open `/plugin` → Installed. `claude --safe-mode` skips all mods for one session, and `"disableAllHooks": true` in `~/.claude/settings.json` stops them all. No mod can change the permission prompt.

## Developing

Each mod has its own tests: `claude plugin test mods/saver`. To run one from this folder for a single session: `claude --plugin-dir mods/saver`.
