import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CacheStats, GitInfo } from '../types'

const title = atom({ plugin: 'session-band', key: 'title' } as const, null)
const cache = atom({ plugin: 'session-band', key: 'cache' } as const, { read: 0, total: 0, lastAt: 0 })
const git = atom({ plugin: 'session-band', key: 'git' } as const, null)
const tick = atom({ plugin: 'session-band', key: 'tick' } as const, 0)
const lastUsd = atom({ plugin: 'session-band', key: 'lastUsd' } as const, 0)

// Prompt-cache lifetime the "cache Nm" chip counts down from.
const CACHE_TTL_MIN = 60
// Context % at which the band turns red and suggests a fresh session.
const WARN_AT = 70

const QUOTES = [
  'Confusion is the sound of learning, so keep listening to it',
  'The printf debugger has seen more of my secrets than my therapist',
  'Make it work, make it right, make it fast. In that order.',
  'Every bug is a test you forgot to write',
  'Delete code with the confidence of someone who has backups',
  'The best refactor is the one you can explain in one sentence',
  'Ship small, ship often, sleep well',
  'Read the error message. No, the whole thing.',
]

type Day = { tokens: number; usd: number }
type Ledger = Record<string, Day>

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const fmtTokens = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`
  : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  : n >= 1e3 ? `${Math.round(n / 1e3)}K`
  : `${n}`
const fmtUsd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDur = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000))
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}
const bar = (pct: number, width = 8) => {
  const full = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return ['━'.repeat(full), '━'.repeat(width - full)] as const
}

async function refreshGit($: EngineInterface) {
  try {
    const b = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 5000 })
    if (b.exitCode !== 0) return update($, git, (): GitInfo => null)
    const s = await $.process.run(['git', 'status', '--porcelain'], { timeoutMs: 5000 })
    let added = 0
    let changed = 0
    for (const line of s.stdout.split('\n')) {
      if (!line.trim()) continue
      if (line.startsWith('??') || line[0] === 'A') added++
      else changed++
    }
    await update($, git, (): GitInfo => ({ branch: b.stdout.trim(), added, changed }))
  } catch {
    await update($, git, (): GitInfo => null)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refreshGit($)
    // Redraw the clock, cache countdown and quote twice a minute.
    $.clock.every(30_000, async () => {
      await update($, tick, n => n + 1)
    })
    $.clock.every(120_000, () => refreshGit($))
    $.command.register({ name: 'thread', description: 'Name this thread in the session band: /thread <title>' })
    return result
  })

  on('command.run', { command: 'thread' }, async ($, e) => {
    const text = e.args.trim()
    await update($, title, () => (text || null))
    return { text: text ? `Thread named "${text}".` : 'Thread name cleared.' }
  })

  on('prompt.submit', async ($, e, next) => {
    try {
      if ((await read($, title)) === null && e.text.trim()) {
        const first = e.text.trim().split('\n')[0]!
        await update($, title, () => (first.length > 80 ? `${first.slice(0, 77)}…` : first))
      }
    } catch {
      // Naming the thread must never hold up a prompt.
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result
    const now = await $.clock.now()
    const u = e.usage
    let tokens = 0
    if (u) {
      tokens = u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      const inTotal = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      await update($, cache, (c): CacheStats => ({
        read: c.read + u.cache_read_input_tokens,
        total: c.total + inTotal,
        lastAt: now,
      }))
    }
    // Spend ledger across sessions, one entry per day (UTC).
    const usage = await $.session.usage()
    const usd = usage.cost?.usd ?? 0
    const prev = await read($, lastUsd)
    const deltaUsd = Math.max(0, usd - prev)
    await update($, lastUsd, () => usd)
    const ledger = ((await $.store.get('ledger')) ?? {}) as Ledger
    const k = dayKey(now)
    const d = ledger[k] ?? { tokens: 0, usd: 0 }
    ledger[k] = { tokens: d.tokens + tokens, usd: d.usd + deltaUsd }
    for (const key of Object.keys(ledger)) if (now - Date.parse(key) > 45 * 864e5) delete ledger[key]
    await $.store.set('ledger', ledger)
    await refreshGit($)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const n = await read($, tick)
    const [name, c, g, usage, ledger, now] = await Promise.all([
      read($, title),
      read($, cache),
      read($, git),
      $.session.usage(),
      $.store.get('ledger') as Promise<Ledger | undefined>,
      $.clock.now(),
    ])

    const pct = usage.context.percent ?? 0
    const hot = pct >= WARN_AT
    const hit = c.total ? Math.round((c.read / c.total) * 100) : 0
    const cacheLeft = c.lastAt ? Math.max(0, CACHE_TTL_MIN - Math.floor((now - c.lastAt) / 60000)) : CACHE_TTL_MIN
    const cacheOk = c.lastAt === 0 || cacheLeft > 0

    const L = ledger ?? {}
    const today = L[dayKey(now)] ?? { tokens: 0, usd: 0 }
    const sum = (pred: (k: string) => boolean) =>
      Object.entries(L).filter(([k]) => pred(k)).reduce((a, [, v]) => ({ tokens: a.tokens + v.tokens, usd: a.usd + v.usd }), { tokens: 0, usd: 0 })
    const week = sum(k => now - Date.parse(k) < 7 * 864e5)
    const monthPrefix = dayKey(now).slice(0, 7)
    const month = sum(k => k.startsWith(monthPrefix))
    const monthName = MONTHS[new Date(now).getUTCMonth()]

    const clock = new Date(now).toISOString().slice(11, 16)
    const limitName = (kind: string) =>
      kind === 'five_hour' ? '5-hour' : kind === 'seven_day' ? 'weekly' : kind === 'spend_limit' ? 'spend' : kind.replace(/_/g, ' ')
    const resetIn = (iso?: string) => {
      if (!iso) return ''
      const ms = Date.parse(iso) - now
      if (!(ms > 0)) return ' · resets now'
      const h = Math.floor(ms / 3600000)
      return h >= 24 ? ` · resets in ${Math.floor(h / 24)}d ${h % 24}h` : ` · resets in ${fmtDur(ms)}`
    }
    const limits = usage.rateLimits
    const quote = QUOTES[Math.floor(now / (10 * 60000)) % QUOTES.length]
    void n
    const [ctxOn, ctxOff] = bar(pct)
    const [cOn, cOff] = bar(cacheOk ? hit : 0)

    const { Box, Text } = $.ui.resolve(e)
    const chip = (key: string, bg: string, fg: string, body: unknown) => (
      <Box key={key} backgroundColor={bg} paddingX={1} marginRight={1}>
        <Text color={fg}>{body as string}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column" borderStyle="round" borderColor="#3a3a3a" paddingX={1}>
        <Box justifyContent="space-between">
          <Box flexShrink={1}>
            <Text dimColor bold>THREAD </Text>
            <Text bold wrap="truncate-end">{name ?? 'Untitled thread'}</Text>
          </Box>
          {hot ? <Text color="#ff6b6b">Context {pct}% · time to prepare a new session</Text> : <Text dimColor>Context {pct}%</Text>}
        </Box>

        <Box justifyContent="space-between" marginTop={1}>
          <Box>
            <Box key="cache" backgroundColor="#16301f" paddingX={1} marginRight={1}>
              <Text color={cacheOk ? '#4ade80' : '#f87171'}>● cache {cacheLeft}m · {hit}% hit </Text>
              <Text color={cacheOk ? '#4ade80' : '#f87171'}>{cOn}</Text>
              <Text color="#2f4a38">{cOff}</Text>
            </Box>
            <Box key="ctx" backgroundColor={hot ? '#3a1d1d' : '#1d2a3a'} paddingX={1}>
              <Text color={hot ? '#f87171' : '#93c5fd'}>context {pct}% </Text>
              <Text color={hot ? '#f87171' : '#93c5fd'}>{ctxOn}</Text>
              <Text color="#4b4b4b">{ctxOff}</Text>
            </Box>
          </Box>
          {g ? (
            <Box>
              {chip('branch', '#4a3b00', '#facc15', g.branch)}
              {chip('diff', '#2a2a2a', '#d4d4d4', `+${g.added} ~${g.changed}`)}
            </Box>
          ) : null}
        </Box>

        <Box justifyContent="space-between" marginTop={1}>
          <Box>
            {chip('today', '#2e1f4a', '#c4b5fd', `● today ${fmtTokens(today.tokens)} · ${fmtUsd(today.usd)}`)}
            {chip('week', '#2e1f4a', '#c4b5fd', `7 days ${fmtTokens(week.tokens)} · ${fmtUsd(week.usd)}`)}
            {chip('month', '#2e1f4a', '#c4b5fd', `${monthName} ${fmtTokens(month.tokens)} · ${fmtUsd(month.usd)}`)}
          </Box>
          {chip('time', '#2a2a2a', '#d4d4d4', `${clock} · session ${fmtDur(now - usage.startedAt)}`)}
        </Box>

        <Box marginTop={1} flexWrap="wrap">
          {limits.length === 0 ? (
            <Text dimColor>limits: shown after the next reply (claude.ai plan logins only)</Text>
          ) : (
            limits.map(l => {
              const left = Math.max(0, Math.round((100 - l.percentUsed) * 10) / 10)
              const [lOn, lOff] = bar(left)
              const tone = left <= 10 ? '#f87171' : left <= 30 ? '#fbbf24' : '#4ade80'
              return (
                <Box key={l.kind} backgroundColor="#1f2937" paddingX={1} marginRight={1}>
                  <Text color={tone}>{limitName(l.kind)} limit {left}% left </Text>
                  <Text color={tone}>{lOn}</Text>
                  <Text color="#4b4b4b">{lOff}</Text>
                  <Text dimColor>{resetIn(l.resetsAt)}</Text>
                </Box>
              )
            })
          )}
        </Box>

        <Box marginTop={1}>
          <Text dimColor>│ </Text>
          <Text dimColor italic>{quote}</Text>
        </Box>
      </Box>
    )
  })
}
