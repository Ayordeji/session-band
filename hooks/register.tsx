import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { CacheStats } from '../types'

const title = atom({ plugin: 'session-band', key: 'title' } as const, null)
const cache = atom({ plugin: 'session-band', key: 'cache' } as const, { read: 0, total: 0, lastAt: 0 })
const tick = atom({ plugin: 'session-band', key: 'tick' } as const, 0)

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

const fmtDur = (ms: number) => {
  const m = Math.max(0, Math.floor(ms / 60000))
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}
const bar = (pct: number, width = 8) => {
  const full = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return ['━'.repeat(full), '━'.repeat(width - full)] as const
}
// Each limit gets its own colour so the pills are easy to tell apart.
const LIMIT_STYLE: Record<string, { bg: string; fg: string; track: string }> = {
  five_hour: { bg: '#0f2f2e', fg: '#5eead4', track: '#1f4d4a' },
  seven_day: { bg: '#2e1f4a', fg: '#c4b5fd', track: '#4c3a6e' },
  other: { bg: '#3a2a12', fg: '#fdba74', track: '#5c4320' },
}
const limitName = (kind: string) =>
  kind === 'five_hour' ? '5-hour' : kind === 'seven_day' ? 'weekly' : kind === 'spend_limit' ? 'spend' : kind.replace(/_/g, ' ')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // Redraw the clock, cache countdown and quote twice a minute.
    $.clock.every(30_000, async () => {
      await update($, tick, n => n + 1)
    })
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
      const current = await read($, title)
      // A system notice (<task-notification> and the like) is not a title.
      if (current?.startsWith('<')) await update($, title, () => null)
      const text = e.text.replace(/<[^>]*>[\s\S]*?<\/[^>]*>/g, '').trim()
      const isPerson = !e.isMeta && !e.command && text && !text.startsWith('<') && !text.startsWith('/')
      if ((current === null || current.startsWith('<')) && isPerson) {
        const first = text.split('\n')[0]!
        await update($, title, () => (first.length > 80 ? `${first.slice(0, 77)}…` : first))
      }
    } catch {
      // Naming the thread must never hold up a prompt.
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || !e.usage) return result
    const u = e.usage
    const now = await $.clock.now()
    const inTotal = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
    await update($, cache, (c): CacheStats => ({
      read: c.read + u.cache_read_input_tokens,
      total: c.total + inTotal,
      lastAt: now,
    }))
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    await read($, tick)
    const [name, c, usage, now] = await Promise.all([
      read($, title),
      read($, cache),
      $.session.usage(),
      $.clock.now(),
    ])

    const pct = usage.context.percent ?? 0
    const hot = pct >= WARN_AT
    const hit = c.total ? Math.round((c.read / c.total) * 100) : 0
    const cacheLeft = c.lastAt ? Math.max(0, CACHE_TTL_MIN - Math.floor((now - c.lastAt) / 60000)) : CACHE_TTL_MIN
    const cacheOk = c.lastAt === 0 || cacheLeft > 0
    const clock = new Date(now).toISOString().slice(11, 16)
    const resetIn = (iso?: string) => {
      if (!iso) return ''
      const ms = Date.parse(iso) - now
      if (!(ms > 0)) return '· resets now'
      const h = Math.floor(ms / 3600000)
      return h >= 24 ? `· resets in ${Math.floor(h / 24)}d ${h % 24}h` : `· resets in ${fmtDur(ms)}`
    }
    const limits = usage.rateLimits
    const quote = QUOTES[Math.floor(now / (10 * 60000)) % QUOTES.length]

    const { Box, Text } = $.ui.resolve(e)

    // A rounded-looking pill: tinted background, coloured text, an optional mini bar.
    const pill = (key: string, bg: string, fg: string, text: string, fill?: number, track = '#3f3f46') => {
      const [filled, empty] = fill === undefined ? ['', ''] : bar(fill, 8)
      return (
        <Box key={key} backgroundColor={bg} paddingX={1} marginRight={2} flexShrink={0}>
          <Text color={fg} wrap="truncate-end">{text}</Text>
          {fill === undefined ? null : <Text color={fg}> {filled}</Text>}
          {fill === undefined ? null : <Text color={track}>{empty}</Text>}
        </Box>
      )
    }
    const memFg = hot ? '#f87171' : pct >= 50 ? '#fbbf24' : '#93c5fd'
    const memBg = hot ? '#3a1d1d' : '#1d2a3a'

    return (
      <Box flexDirection="column" borderStyle="round" borderColor="#3a3a3a" paddingX={1}>
        <Box justifyContent="space-between">
          <Box flexShrink={1}>
            <Text dimColor bold>THREAD </Text>
            <Text bold wrap="truncate-end">{name ?? 'Untitled thread'}</Text>
          </Box>
          {hot ? <Text color="#ff6b6b">time to prepare a new session</Text> : null}
        </Box>

        <Box justifyContent="space-between" marginTop={1}>
          <Box flexWrap="wrap">
            {pill('cache', cacheOk ? '#16301f' : '#3a1d1d', cacheOk ? '#4ade80' : '#f87171',
              cacheOk ? `● cache ${cacheLeft}m · ${hit}% hit` : '● cache expired', cacheOk ? hit : 0, cacheOk ? '#2f4a38' : '#4b2a2a')}
            {pill('mem', memBg, memFg, `memory ${pct}%`, pct)}
          </Box>
          {pill('time', '#2a2a2a', '#d4d4d4', `${clock} UTC · session ${fmtDur(now - usage.startedAt)}`)}
        </Box>

        <Box marginTop={1} flexDirection="column" gap={1}>
          {limits.length === 0
            ? <Box>{pill('nolimits', '#2a2a2a', '#a1a1aa', 'limits appear after the next reply')}</Box>
            : limits.map(l => {
                const left = Math.max(0, Math.round(100 - l.percentUsed))
                const style = LIMIT_STYLE[l.kind] ?? LIMIT_STYLE.other!
                const label = l.kind === 'five_hour' ? '5h limit' : l.kind === 'seven_day' ? 'weekly limit' : `${limitName(l.kind)} limit`
                const fg = left <= 10 ? '#f87171' : left <= 30 ? '#fbbf24' : style.fg
                return (
                  <Box key={l.kind}>
                    {pill(l.kind, style.bg, fg, `● ${label} ${left}% left ${resetIn(l.resetsAt)}`, left, style.track)}
                  </Box>
                )
              })}
        </Box>

        <Box marginTop={1}>
          <Text dimColor>│ </Text>
          <Text dimColor italic>{quote}</Text>
        </Box>
      </Box>
    )
  })
}
