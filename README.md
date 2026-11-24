# session-band

A dashboard band above the prompt. It shows:

- **Thread title**: your first message, or set it with `/thread <title>`. Also the clock (UTC) and how long the session has run.
- **Memory**: how full Claude's memory of this chat (its context window) is. It turns red at 70%: start a new chat soon.
- **Cache**: minutes left before the saved copy of this chat expires (60-minute lifetime assumed), and how much of each reply reused it.
- **Limits**: your 5-hour and weekly plan limits left, with reset times (Claude plan logins only).
- A rotating quote.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install session-band --marketplace Ayordeji/session-band
```

Or from a shell:

```bash
claude plugin install session-band --marketplace Ayordeji/session-band
```

Answer `y` to add the marketplace and pick the **user** scope so the band shows in every session.

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `Ayordeji/session-band`, then Add plugin.

This repository is private, so your machine needs a GitHub credential first: `gh auth login`, then `gh auth setup-git`.
