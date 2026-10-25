import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { HudLimits } from '../types'

const branch = atom({ plugin: 'hud', key: 'branch' } as const, '')
const contextPercent = atom({ plugin: 'hud', key: 'contextPercent' } as const, 0)
const limits = atom({ plugin: 'hud', key: 'limits' } as const, { fiveHour: null, weekly: null } as HudLimits, {
  shape: 'limits-1',
})

export function bar(percent: number, width: number): string {
  const p = Math.max(0, Math.min(100, percent))
  const filled = Math.round((p / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

function limitOf(list: readonly SessionRateLimit[], kind: string): number | null {
  return list.find(l => l.kind === kind)?.percentUsed ?? null
}

async function readBranch($: EngineInterface) {
  try {
    const out = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
    const name = out.exitCode === 0 ? out.stdout.trim() : ''
    await update($, branch, () => name)
  } catch {
    await update($, branch, () => '')
  }
}

async function readUsage($: EngineInterface, context: SessionContextUsage, rateLimits: readonly SessionRateLimit[]) {
  await update($, contextPercent, () => context.percent ?? 0)
  await update($, limits, () => ({ fiveHour: limitOf(rateLimits, 'five_hour'), weekly: limitOf(rateLimits, 'seven_day') }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await readBranch($)
    const usage = await $.session.usage()
    await readUsage($, usage.context, usage.rateLimits)
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await readUsage($, e.context, e.rateLimits)
    return next(e)
  })

  // A turn may switch branches: read it again when one ends.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await readBranch($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const below = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    const name = await read($, branch)
    const ctx = await read($, contextPercent)
    const lim = await read($, limits)
    const width = e.props.bodyColumns >= 90 ? 10 : 6

    // Health bars count down: what is left of each window.
    const health = (used: number | null) => (used === null ? null : 100 - used)
    const five = health(lim.fiveHour)
    const week = health(lim.weekly)
    const colorFor = (left: number) => (left <= 15 ? 'red' : left <= 40 ? 'yellow' : 'green')

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          {name !== '' ? <Text color="magenta"> {name}  </Text> : null}
          <Text dimColor>ctx </Text>
          <Text color={ctx > 80 ? 'red' : ctx > 60 ? 'yellow' : 'cyan'}>{bar(ctx, width)}</Text>
          <Text dimColor> {Math.round(ctx)}%</Text>
          {five !== null ? (
            <Text>
              <Text dimColor>  ♥ 5h </Text>
              <Text color={colorFor(five)}>{bar(five, width)}</Text>
            </Text>
          ) : null}
          {week !== null ? (
            <Text>
              <Text dimColor>  ♦ wk </Text>
              <Text color={colorFor(week)}>{bar(week, width)}</Text>
            </Text>
          ) : null}
        </Text>
        {below}
      </Box>
    )
  })
}
