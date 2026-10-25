# One-liner mod prompts

Paste any of these into a Claude Code session (v2.1.287 or later) to have Claude write the mod for you. Approve the files, pick **Enable for this session**, and it loads when Claude finishes.

The ones marked ✅ are already built in this repo, so you can just install them instead.

```
Make a mod that shows my git branch above the prompt.                         ✅ hud
Make a mod that draws how full my context window is as a bar above the
prompt, and turns it red past 80%.                                            ✅ hud
Make a mod that shows my 5-hour and weekly usage limits as two bars above
the prompt, like a game's health bar.                                         ✅ hud
Make a mod that writes one row per turn to a file called claude-costs.csv:
the time, the tokens used, and what it cost.                                  ✅ session-tools
Make a mod that pops a notification when a turn that took longer than
2 minutes finishes.                                                           ✅ session-tools
Make a mod that adds a count of Claude's tool calls to the spinner, like
"Thinking · tool calls: 3".
Make a mod that adds my current git branch for Claude whenever a prompt
mentions a PR.
```

`/recap` and `/dashboard` are already built into Claude Code on current versions, so the mods here don't use those names: the dashboard opens with `/hq`.

## Mods for your app projects

```
Make a mod that adds /push: commit everything in this repo with a short
message Claude writes, push it to origin on GitHub (account oneals365), and
show the repo URL in a toast.

Make a mod that runs ./gradlew assembleDebug when I type /apk, shows
"building…" in the status line, and when it finishes shows the APK path and
size in a toast, or the first error line in red above the prompt.

Make a mod that keeps a "Clients" pane for ONEALS FIIT: a text field to add a
client name, a row per client with sessions left this month, and buttons
to add or use a session. Keep it between sessions.
```
