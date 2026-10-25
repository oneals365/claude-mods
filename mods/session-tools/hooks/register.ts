import type { EngineInterface, Register, TurnUsage } from 'claude-code'

const LONG_TURN_MS = 2 * 60 * 1000
const CSV = 'claude-costs.csv'
const CSV_HEADER = 'time,model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,seconds,usd\n'

// Claude API list prices per million tokens, October 2026.
const PRICES: { match: RegExp; input: number; output: number }[] = [
  { match: /haiku/i, input: 0.1, output: 0.5 },
  { match: /sonnet/i, input: 2, output: 10 },
  { match: /opus/i, input: 4, output: 20 },
  { match: /fable|mythos/i, input: 10, output: 50 },
]

export function costOf(usage: TurnUsage): number {
  const price = PRICES.find(p => p.match.test(usage.model)) ?? { input: 4, output: 20 }
  const input = usage.input_tokens + usage.cache_read_input_tokens * 0.1 + usage.cache_creation_input_tokens * 1.25
  return (input * price.input + usage.output_tokens * price.output) / 1_000_000
}

async function logCost($: EngineInterface, usage: TurnUsage, durationMs: number) {
  const path = `${await $.session.cwd()}/${CSV}`
  const time = new Date(await $.clock.now()).toISOString()
  const row = [
    time,
    usage.model,
    usage.input_tokens,
    usage.output_tokens,
    usage.cache_read_input_tokens,
    usage.cache_creation_input_tokens,
    Math.round(durationMs / 1000),
    costOf(usage).toFixed(5),
  ].join(',')
  const before = (await $.fs.exists(path)) ? String(await $.fs.read(path)) : CSV_HEADER
  await $.fs.write(path, `${before}${before.endsWith('\n') ? '' : '\n'}${row}\n`)
}

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    if (e.durationMs > LONG_TURN_MS && !e.isAborted) {
      const mins = Math.round(e.durationMs / 6000) / 10
      void $.ui.notify(`Done after ${mins} min: ${e.answer.split('\n')[0]?.slice(0, 100) ?? ''}`, { title: 'Claude finished' })
    }
    if (e.usage) {
      try {
        await logCost($, e.usage, e.durationMs)
      } catch {
        // A read-only folder: skip the log, never the turn.
      }
    }
    return result
  }).catch(($, e, next) => next(e))
}
