# session-band

A dashboard band above the prompt. It shows the thread title (your first prompt, or set it with `/thread <title>`),
a warning once context passes 70%, a prompt-cache chip (minutes left of a 60-minute TTL and cache hit rate),
a context meter, the clock (UTC) with session length, your 5-hour and weekly usage limits left with reset times,
and a rotating quote.

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
