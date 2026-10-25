import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { TeamMessage } from '../types'

const PANE = 'team'
const STANDUP_WINDOW_MS = 30 * 60 * 1000
const KEEP = 300

// Change the shape tag when TeamMessage's fields change, so old values are declined.
const messages = atom({ plugin: 'team-room', key: 'messages' } as const, [], {
  shape: 'messages-1',
})
const standupAt = atom({ plugin: 'team-room', key: 'standupAt' } as const, 0)

const STANDUP_TEXT =
  'Standup from @manager: reply to me with ONE line, "done: ... | next: ...". Nothing else.'

function firstLine(text: string): string {
  const plain = text
    .replace(/<[^>]+>/g, ' ')
    .split('\n')
    .map(s => s.trim())
    .find(s => s.length > 0)
  return (plain ?? '').slice(0, 160)
}

function senderOf(origin: unknown, text: string): string {
  const o = origin as { teammate?: unknown; plugin?: unknown } | null
  if (o && typeof o.teammate === 'string' && o.teammate.length > 0) return o.teammate
  const m = /\bfrom[=:]\s*["']?([\w.@:-]+)/i.exec(text)
  if (m?.[1]) return m[1]
  return 'peer'
}

function clockTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  } catch {
    const d = new Date(ms)
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }
}

function teamFrom(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map(s => s.replace(/^@/, '').trim())
    .filter(s => s.length > 0)
}

export const register: Register = (on, options) => {
  const configured = typeof options.team === 'string' ? options.team : 'prospector, outreach'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'team',
      description: 'Open the Team pane: every message between this session and your others',
    })
    await $.command.register({
      name: 'standup',
      description: 'Ask each teammate session for a one-line update',
      argumentHint: '[names...]',
    })
    return next(e)
  })

  on('command.run', { command: 'team' }, async $ => {
    const { isPlaced } = await $.ui.open({ id: PANE, title: 'Team' })
    return { text: isPlaced ? 'Team pane opened.' : 'Team pane is ready; this surface does not dock panes.' }
  })

  on('command.run', { command: 'standup' }, async ($, e) => {
    const names = teamFrom(e.args.trim().length > 0 ? e.args : configured)
    if (names.length === 0) {
      return { text: 'No teammates to ask. Run /standup prospector outreach, or set Team in /config.' }
    }
    const now = await $.clock.now()
    await update($, standupAt, () => now)
    void $.ui.open({ id: PANE, title: 'Team' })

    const results: string[] = []
    for (const name of names) {
      const sent = await $.session.send({ to: name, text: STANDUP_TEXT })
      results.push(sent.isDelivered ? `asked ${name}` : `${name}: ${sent.reason}`)
    }
    return {
      text: `Standup: ${results.join(' · ')}. Replies land in the Team pane.`,
      context: [
        "The person ran /standup. When the replies arrive, summarise them in three lines: done, blocked, next.",
      ],
    }
  })

  // Outgoing: the model's SendMessage, or a plugin's $.session.send (our /standup).
  on('session.send', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && result.isDelivered) {
      const at = await $.clock.now()
      const msg: TeamMessage = {
        id: `out-${at}-${e.to}`,
        direction: 'out',
        who: e.to,
        line: firstLine(e.text),
        at,
        isStandup: e.text === STANDUP_TEXT,
      }
      await update($, messages, list => [...list, msg].slice(-KEEP))
    }
    return result
  }).catch(($, e, next) => next(e))

  // Incoming: another session's or teammate's message.
  on('session.receive', async ($, e, next) => {
    const kind = (e.origin as { kind: string }).kind
    const isPeer = kind === 'peer' || kind === 'coordinator' || kind === 'peer-send-message'
    if (isPeer && e.agentId === undefined) {
      const at = await $.clock.now()
      const since = await read($, standupAt)
      const msg: TeamMessage = {
        id: `in-${at}-${Math.random().toString(36).slice(2, 8)}`,
        direction: 'in',
        who: senderOf(e.origin, e.text),
        line: firstLine(e.text),
        at,
        isStandup: since > 0 && at - since < STANDUP_WINDOW_MS,
      }
      await update($, messages, list => [...list, msg].slice(-KEEP))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, messages)
    const room = Math.max(3, e.props.scroll.bodyRows - 2)
    const newestFirst = [...list].reverse().slice(0, room)
    const width = Math.max(20, e.props.bodyColumns)

    return (
      <Box flexDirection="column" width={width}>
        <Box>
          <Button key="standup" label="Standup" hotkey="s" onPress={() => $.command.run({ command: 'standup', args: '' })} />
          <Text> </Text>
          <Button key="clear" label="Clear" onPress={() => update($, messages, () => [])} />
        </Box>
        {newestFirst.length === 0 && (
          <Text dimColor>No messages yet. Mention a session with @name, or press Standup.</Text>
        )}
        {newestFirst.map(m => (
          <Text wrap="truncate-end">
            <Text color={m.direction === 'in' ? 'green' : 'cyan'}>
              {m.direction === 'in' ? '← ' : '→ '}
              {m.who}
            </Text>
            {m.isStandup ? <Text color="yellow"> [standup]</Text> : null}
            <Text dimColor> {clockTime(m.at)} </Text>
            {m.line}
          </Text>
        ))}
      </Box>
    )
  })
}
