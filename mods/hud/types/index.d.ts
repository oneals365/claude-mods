export type HudLimits = { fiveHour: number | null; weekly: number | null }

declare module 'claude-code' {
  interface PluginState {
    hud: { branch: string; contextPercent: number; limits: Shaped<HudLimits> }
  }
}
