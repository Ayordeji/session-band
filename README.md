# session-band

A dashboard band above the prompt. It shows the thread title (your first prompt, or set it with `/thread <title>`),
a warning once context passes 70%, a prompt-cache chip (minutes left of a 60-minute TTL and cache hit rate),
a context meter, the git branch with added/changed file counts, token and estimated-cost totals for today,
the last 7 days and this month (kept across sessions), the clock with session length, and a rotating quote.
Cost figures are client-side estimates, not your bill.

## Install

Replace `YOUR-GITHUB-USERNAME` with the account that holds this repository. At the prompt of a Claude Code terminal session:

```
/plugin install session-band --marketplace YOUR-GITHUB-USERNAME/session-band
```

Or from a shell:

```bash
claude plugin install session-band --marketplace YOUR-GITHUB-USERNAME/session-band
```

Answer `y` to add the marketplace and pick the **user** scope so the band shows in every session.

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `YOUR-GITHUB-USERNAME/session-band`, then Add plugin.

This repository is private, so your machine needs a GitHub credential first: `gh auth login`, then `gh auth setup-git`.
