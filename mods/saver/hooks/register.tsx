import { atom, read, update } from 'claude-code'
import type { Register, TurnUsage } from 'claude-code'

import type { SaverDay } from '../types'

// Claude API list prices per million tokens, October 2026.
const PRICES: { match: RegExp; input: number; output: number; label: string }[] = [
  { match: /haiku/i, input: 0.1, output: 0.5, label: 'Haiku 5.5' },
  { match: /sonnet/i, input: 2, output: 10, label: 'Sonnet 5.5' },
  { match: /opus/i, input: 4, output: 20, label: 'Opus 5.5' },
  { match: /fable|mythos/i, input: 10, output: 50, label: 'Fable 5.1' },
]
const DEFAULT_PRICE = { input: 4, output: 20, label: 'main model' }
const CHEAP_MODEL = 'haiku'
// Haiku 5.5 doubles its price past 100K input tokens, so the mod stays off there.
const CONTEXT_CEILING = 100_000

const EASY = /\b(typo|typos|spelling|rename|re-?name|reformat|format(ting)?|indent|tl;?dr|summari[sz]e|summary|translate|convert|capitali[sz]e|sort (this|the) list|quick question|what('s| is| does)|define|lookup|look up)\b/i
const HARD = /\b(plan|planning|debug|bug|broken|error|stack ?trace|crash|fails?|failing|implement|build|create|write (a|the|new)|refactor|architect|design|migrate|investigate|why|optimi[sz]e|test(s|ing)?|deploy|feature|app)\b/i

const isOn = atom({ plugin: 'saver', key: 'isOn' } as const, true)
const lastModel = atom({ plugin: 'saver', key: 'lastModel' } as const, '')
const today = atom(
  { plugin: 'saver', key: 'today' } as const,
  { day: '', usd: 0, easyTurns: 0 } as SaverDay,
  { shape: 'today-1' },
)

function priceOf(model: string) {
  return PRICES.find(p => p.match.test(model)) ?? DEFAULT_PRICE
}

function costOf(usage: TurnUsage, price: { input: number; output: number }): number {
  const input =
    usage.input_tokens + usage.cache_read_input_tokens * 0.1 + usage.cache_creation_input_tokens * 1.25
  return (input * price.input + usage.output_tokens * price.output) / 1_000_000
}

function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function money(usd: number): string {
  return usd < 0.01 ? `${(usd * 100).toFixed(2)}¢` : `$${usd.toFixed(2)}`
}

export function judge(text: string): 'easy' | 'hard' | 'unclear' {
  const t = text.trim()
  if (t.length === 0) return 'hard'
  if (t.length > 600 || t.split('\n').length > 12) return 'hard'
  const easy = EASY.test(t)
  const hard = HARD.test(t)
  if (easy && !hard) return 'easy'
  if (hard && !easy) return 'hard'
  return 'unclear'
}

export const register: Register = on => {
  // turnId -> whether this main-loop turn goes to Haiku. Lost on reload: the next turn decides again.
  const route = new Map<string, boolean>()

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'saver',
      description: 'Send easy prompts to Claude Haiku 5.5: /saver on, /saver off, /saver',
      argumentHint: '[on|off]',
    })
    const stored = await $.store.get('isOn')
    if (typeof stored === 'boolean') await update($, isOn, () => stored)
    return next(e)
  })

  on('command.run', { command: 'saver' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      const value = arg === 'on'
      await update($, isOn, () => value)
      await $.store.set('isOn', value)
      return { text: value ? 'Saver is on: easy prompts go to Haiku 5.5.' : 'Saver is off: every prompt stays on your main model.' }
    }
    const day = await read($, today)
    const main = priceOf(await $.session.model())
    const on_ = await read($, isOn)
    return {
      text: `Saver is ${on_ ? 'on' : 'off'}. Main model: ${main.label}. Today: ${day.easyTurns} easy turns on Haiku, ${money(day.usd)} saved at list prices.`,
    }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    let goesCheap = false
    if (await read($, isOn)) {
      const verdict = judge(e.text)
      if (verdict === 'easy') goesCheap = true
      else if (verdict === 'unclear') {
        const label = await $.model.classify(
          `Is this request to a coding assistant easy (typo, rename, formatting, short summary, quick factual question) or hard (planning, debugging, new code, many steps)?\n\n${e.text.slice(0, 2000)}`,
          ['easy', 'hard'],
          { model: CHEAP_MODEL },
        )
        goesCheap = label === 'easy'
      }
    }
    const started = await next(e)
    route.set(started.turnId, goesCheap)
    if (route.size > 50) route.delete(route.keys().next().value as string)
    return started
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    const isMain = e.agentId === undefined
    let wantsCheap = isMain && route.get(e.turnId) === true
    if (wantsCheap) {
      const usage = await $.session.usage()
      if ((usage.context.tokens ?? 0) >= CONTEXT_CEILING) wantsCheap = false
    }
    const mainModel = e.model
    const result = yield* next(wantsCheap ? { ...e, model: CHEAP_MODEL } : e)

    if (isMain && result.usage) {
      const answered = result.usage.model
      await update($, lastModel, () => answered)
      if (wantsCheap && !/haiku/i.test(mainModel)) {
        const saved = costOf(result.usage, priceOf(mainModel)) - costOf(result.usage, priceOf(answered))
        const now = dayKey(await $.clock.now())
        await update($, today, d => {
          const base = d.day === now ? d : { day: now, usd: 0, easyTurns: 0 }
          return {
            day: now,
            usd: base.usd + Math.max(0, saved),
            easyTurns: base.easyTurns + (e.index === 0 ? 1 : 0),
          }
        })
      }
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const below = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    const on_ = await read($, isOn)
    const model = await read($, lastModel)
    const day = await read($, today)
    const isToday = day.day === dayKey(await $.clock.now())
    const saved = isToday ? day.usd : 0
    const label = model === '' ? '—' : priceOf(model) === DEFAULT_PRICE ? model : priceOf(model).label

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text color={on_ ? 'green' : 'gray'}>{on_ ? '⚡ Saver' : '⚡ Saver off'}</Text>
          <Text dimColor> · last answer: </Text>
          <Text>{label}</Text>
          <Text dimColor> · saved today: </Text>
          <Text color="green">{money(saved)}</Text>
        </Text>
        {below}
      </Box>
    )
  })
}
