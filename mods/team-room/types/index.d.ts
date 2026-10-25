export type TeamMessage = {
  id: string
  direction: 'out' | 'in'
  who: string
  line: string
  at: number
  isStandup: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'team-room': { messages: Shaped<TeamMessage[]>; standupAt: number }
  }
}
