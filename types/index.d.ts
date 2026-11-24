export type CacheStats = { read: number; total: number; lastAt: number }
export type GitInfo = { branch: string; added: number; changed: number } | null

declare module 'claude-code' {
  interface PluginState {
    'session-band': {
      title: string | null
      cache: CacheStats
      git: GitInfo
      tick: number
      lastUsd: number
    }
  }
}
