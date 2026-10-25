export type SaverDay = { day: string; usd: number; easyTurns: number }

declare module 'claude-code' {
  interface PluginState {
    saver: { isOn: boolean; lastModel: string; today: Shaped<SaverDay> }
  }
}
