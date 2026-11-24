export type CacheStats = { read: number; total: number; lastAt: number }

declare module 'claude-code' {
  interface PluginState {
    'session-band': {
      title: string | null
      cache: CacheStats
      tick: number
    }
  }
}
