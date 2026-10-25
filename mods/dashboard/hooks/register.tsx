import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { EventRow, Feed, MailRow, Tab, Todo } from '../types'

const PANE = 'dashboard'
const REFRESH_MS = 10 * 60 * 1000
const STORE_TODOS = 'todos'

const todos = atom({ plugin: 'dashboard', key: 'todos' } as const, [] as Todo[], { shape: 'todos-1' })
const inbox = atom(
  { plugin: 'dashboard', key: 'inbox' } as const,
  { rows: [], status: 'loading', note: '', at: 0 } as Feed<MailRow>,
  { shape: 'inbox-1' },
)
const today = atom(
  { plugin: 'dashboard', key: 'today' } as const,
  { rows: [], status: 'loading', note: '', at: 0 } as Feed<EventRow>,
  { shape: 'today-1' },
)
const tab = atom({ plugin: 'dashboard', key: 'tab' } as const, 'todo' as Tab)

// ---------- helpers ----------

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function localStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function ago(at: number, now: number): string {
  const mins = Math.max(0, Math.round((now - at) / 60_000))
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`
}

function clock(ms: number): string {
  const d = new Date(ms)
  const h = d.getHours()
  const m = d.getMinutes()
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${pad(m)} ${suffix}`
}

/** Every JSON value in a tool result's text blocks, parsed where it parses. */
function payloads(content: readonly { type: string; text?: string }[]): unknown[] {
  const out: unknown[] = []
  for (const block of content) {
    if (block.type !== 'text' || typeof block.text !== 'string') continue
    try {
      out.push(JSON.parse(block.text))
    } catch {
      out.push(block.text)
    }
  }
  return out
}

/** Walks any JSON and yields the objects that pass `keep`. */
function collect(value: unknown, keep: (o: Record<string, unknown>) => boolean, found: Record<string, unknown>[] = [], depth = 0) {
  if (depth > 12 || value === null || typeof value !== 'object') return found
  if (Array.isArray(value)) {
    for (const v of value) collect(v, keep, found, depth + 1)
    return found
  }
  const o = value as Record<string, unknown>
  if (keep(o)) found.push(o)
  else for (const v of Object.values(o)) collect(v, keep, found, depth + 1)
  return found
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
}

function header(o: Record<string, unknown>, name: string): string {
  const direct = o[name] ?? o[name.toLowerCase()]
  if (typeof direct === 'string') return direct
  const headers = o.headers ?? (o.payload as Record<string, unknown> | undefined)?.headers
  if (Array.isArray(headers)) {
    const h = headers.find(x => str((x as Record<string, unknown>).name).toLowerCase() === name.toLowerCase())
    if (h) return str((h as Record<string, unknown>).value)
  }
  return ''
}

function parseWhen(v: unknown): number {
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000
  const s = str(v)
  if (/^\d{10,13}$/.test(s)) return Number(s) > 1e12 ? Number(s) : Number(s) * 1000
  const t = Date.parse(s)
  return Number.isNaN(t) ? 0 : t
}

function shortName(from: string): string {
  const m = /^\s*"?([^"<]+?)"?\s*<.*>\s*$/.exec(from)
  return (m?.[1] ?? from).trim().slice(0, 40)
}

export function mailRows(content: readonly { type: string; text?: string }[], myEmail: string): MailRow[] {
  const me = myEmail.trim().toLowerCase()
  const threads = payloads(content).flatMap(p =>
    collect(p, o => Array.isArray(o.messages) || (header(o, 'Subject') !== '' && header(o, 'From') !== '')),
  )
  const rows: MailRow[] = []
  for (const t of threads) {
    const messages = Array.isArray(t.messages) ? (t.messages as Record<string, unknown>[]) : [t]
    const last = messages[messages.length - 1]
    if (!last) continue
    const from = header(last, 'From') || header(t, 'From')
    if (me !== '' && from.toLowerCase().includes(me)) continue
    const subject = header(last, 'Subject') || header(t, 'Subject') || str(t.snippet).slice(0, 60) || '(no subject)'
    const at = parseWhen(last.internalDate ?? header(last, 'Date') ?? last.date ?? t.date)
    rows.push({ id: str(t.id) || str(last.id) || `${from}-${subject}`, from: shortName(from || 'unknown'), subject, at })
  }
  return rows.sort((a, b) => b.at - a.at).slice(0, 20)
}

export function eventRows(content: readonly { type: string; text?: string }[]): EventRow[] {
  const events = payloads(content).flatMap(p => collect(p, o => 'start' in o && ('summary' in o || 'title' in o)))
  return events
    .map(ev => {
      const start = ev.start as Record<string, unknown> | string
      const isAllDay = typeof start === 'object' && start !== null && 'date' in start && !('dateTime' in start)
      const when = typeof start === 'object' && start !== null ? start.dateTime ?? start.date : start
      return {
        id: str(ev.id) || `${str(ev.summary)}-${str(when)}`,
        title: str(ev.summary ?? ev.title) || '(no title)',
        start: parseWhen(when),
        isAllDay,
      }
    })
    .sort((a, b) => a.start - b.start)
}

async function findServer($: EngineInterface, configured: string, tool: string, hint: RegExp): Promise<string | undefined> {
  if (configured.trim() !== '') return configured.trim()
  const names = (await $.tool.list()).filter(t => t.mcp).map(t => t.name)
  const re = new RegExp(`^mcp__(.+)__${tool}$`)
  const hits = names.map(n => re.exec(n)?.[1]).filter((s): s is string => s !== undefined)
  return hits.find(s => hint.test(s)) ?? hits[0]
}

type Config = { gmailServer: string; calendarServer: string; myEmail: string }

async function saveTodos($: EngineInterface, next: (list: Todo[]) => Todo[]) {
  await update($, todos, next)
  await $.store.set(STORE_TODOS, await read($, todos))
}

async function refreshInbox($: EngineInterface, cfg: Config) {
  const now = await $.clock.now()
  const server = await findServer($, cfg.gmailServer, 'search_threads', /gmail/i)
  if (server === undefined) {
    await update($, inbox, () => ({ rows: [], status: 'missing' as const, note: 'No Gmail connector. Ask Claude to connect Gmail.', at: now }))
    return
  }
  try {
    const result = await $.mcp.call(server, 'search_threads', {
      query: 'in:inbox newer_than:1d -from:me -category:promotions -category:social -category:updates -category:forums',
      pageSize: 20,
    })
    if (result.isError) throw new Error('the Gmail call failed')
    const rows = mailRows(result.content as { type: string; text?: string }[], cfg.myEmail)
    await update($, inbox, () => ({ rows, status: 'ok' as const, note: '', at: now }))
  } catch (err) {
    await update($, inbox, f => ({ ...f, status: 'error' as const, note: `Gmail: ${String((err as Error).message ?? err).slice(0, 80)}`, at: now }))
  }
}

async function refreshToday($: EngineInterface, cfg: Config) {
  const now = await $.clock.now()
  const server = await findServer($, cfg.calendarServer, 'list_events', /calendar/i)
  if (server === undefined) {
    await update($, today, () => ({ rows: [], status: 'missing' as const, note: 'No Google Calendar connector. Ask Claude to connect it.', at: now }))
    return
  }
  const d = new Date(now)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0)
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)
  try {
    const result = await $.mcp.call(server, 'list_events', {
      startTime: localStamp(start),
      endTime: localStamp(end),
      orderBy: 'startTime',
      pageSize: 25,
    })
    if (result.isError) throw new Error('the Calendar call failed')
    const rows = eventRows(result.content as { type: string; text?: string }[])
    await update($, today, () => ({ rows, status: 'ok' as const, note: '', at: now }))
  } catch (err) {
    await update($, today, f => ({ ...f, status: 'error' as const, note: `Calendar: ${String((err as Error).message ?? err).slice(0, 80)}`, at: now }))
  }
}

async function refreshAll($: EngineInterface, cfg: Config) {
  await Promise.all([refreshInbox($, cfg), refreshToday($, cfg)])
}


// ---------- the mod ----------

export const register: Register = (on, options) => {
  const gmailServer = typeof options.gmailServer === 'string' ? options.gmailServer : ''
  const calendarServer = typeof options.calendarServer === 'string' ? options.calendarServer : ''
  const myEmail = typeof options.myEmail === 'string' ? options.myEmail : ''
  const cfg: Config = { gmailServer, calendarServer, myEmail }
  let isTicking = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hq',
      description: 'Open your dashboard: to-dos, emails waiting on you, today',
      argumentHint: '[todo|inbox|today]',
    })
    await $.command.register({ name: 'todo', description: 'Add a to-do to the dashboard', argumentHint: '<task>' })
    const stored = await $.store.get(STORE_TODOS)
    if (Array.isArray(stored)) await update($, todos, () => stored as Todo[])
    if (!isTicking) {
      isTicking = true
      $.clock.every(REFRESH_MS, () => void refreshAll($, cfg))
      $.clock.after(1500, () => void refreshAll($, cfg))
    }
    return next(e)
  })

  on('command.run', { command: 'hq' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const pick: Tab | undefined =
      arg === '1' || arg.startsWith('todo') || arg.startsWith('to-do') ? 'todo'
        : arg === '2' || arg.startsWith('inbox') || arg.startsWith('mail') || arg.startsWith('email') ? 'inbox'
          : arg === '3' || arg.startsWith('today') || arg.startsWith('cal') ? 'today'
            : undefined
    if (pick) await update($, tab, () => pick)
    void refreshAll($, cfg)
    const { isPlaced } = await $.ui.open({ id: PANE, title: 'Dashboard' })
    const shown = pick ? ` (${pick === 'todo' ? 'To-do' : pick === 'inbox' ? 'Inbox' : 'Today'})` : ''
    return { text: isPlaced ? `Dashboard opened${shown}.` : 'Dashboard is ready; this surface does not dock panes.' }
  })

  on('command.run', { command: 'todo' }, async ($, e) => {
    const text = e.args.trim()
    if (text === '') return { text: 'Usage: /todo <task>' }
    const now = await $.clock.now()
    await saveTodos($, list => [...list, { id: `t${now}`, text, isDone: false }])
    return { text: `Added: ${text}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const current = await read($, tab)
    const now = await $.clock.now()
    const list = await read($, todos)
    const mail = await read($, inbox)
    const cal = await read($, today)
    const open = list.filter(t => !t.isDone)

    const tabButton = (id: Tab, label: string, hotkey: string) => (
      <Button
        key={`tab-${id}`}
        label={label}
        hotkey={hotkey}
        variant={current === id ? 'primary' : 'secondary'}
        onPress={() => update($, tab, () => id)}
      />
    )

    const feedNote = (f: Feed<unknown>) =>
      f.status === 'loading' ? <Text dimColor>Loading…</Text> : f.status !== 'ok' ? <Text color="yellow">{f.note}</Text> : null

    let body
    if (current === 'todo') {
      const input =
        'Input' in els && els.Input !== undefined ? (
          <els.Input
            key="new-todo"
            placeholder="Add a task and press Enter"
            submitLabel="add"
            value=""
            onSubmit={(value: string) => {
              const text = value.trim()
              if (text === '') return
              void $.clock.now().then(at => saveTodos($, l => [...l, { id: `t${at}`, text, isDone: false }]))
            }}
          />
        ) : (
          <Text dimColor>Add one with /todo &lt;task&gt;</Text>
        )
      body = (
        <Box flexDirection="column">
          {input}
          {list.length === 0 && <Text dimColor>Nothing on the list.</Text>}
          {list.map(t => (
            <Button key={`todo-${t.id}`} plain onPress={() => saveTodos($, l => l.map(x => (x.id === t.id ? { ...x, isDone: !x.isDone } : x)))}>
              {t.isDone ? '☑ ' : '☐ '}
              {t.isDone ? <Text dimColor strikethrough>{t.text}</Text> : t.text}
            </Button>
          ))}
          {list.some(t => t.isDone) && (
            <Button key="clear-done" label="Clear done" onPress={() => saveTodos($, l => l.filter(x => !x.isDone))} />
          )}
        </Box>
      )
    } else if (current === 'inbox') {
      body = (
        <Box flexDirection="column">
          {feedNote(mail)}
          {mail.status === 'ok' && mail.rows.length === 0 && <Text dimColor>Nothing waiting on you from the last 24 hours.</Text>}
          {mail.rows.map(m => (
            <Text wrap="truncate-end">
              <Text bold>{m.from}</Text>
              <Text> {m.subject}</Text>
              <Text dimColor> · {m.at > 0 ? ago(m.at, now) : ''}</Text>
            </Text>
          ))}
          <Button key="refresh-inbox" label="Refresh" onPress={() => refreshInbox($, cfg)} />
        </Box>
      )
    } else {
      body = (
        <Box flexDirection="column">
          {feedNote(cal)}
          {cal.status === 'ok' && cal.rows.length === 0 && <Text dimColor>Nothing on the calendar today.</Text>}
          {cal.rows.map(ev => (
            <Text wrap="truncate-end" dimColor={!ev.isAllDay && ev.start < now}>
              <Text color="cyan">{ev.isAllDay ? 'all day ' : `${clock(ev.start)} `}</Text>
              {ev.title}
            </Text>
          ))}
          <Button key="refresh-today" label="Refresh" onPress={() => refreshToday($, cfg)} />
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box>
          {tabButton('todo', `To-do (${open.length})`, '1')}
          {tabButton('inbox', `Inbox (${mail.rows.length})`, '2')}
          {tabButton('today', `Today (${cal.rows.length})`, '3')}
        </Box>
        {body}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const below = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const open = (await read($, todos)).filter(t => !t.isDone).length
    const mail = await read($, inbox)
    const cal = await read($, today)
    const upcoming = cal.rows.find(ev => !ev.isAllDay && ev.start >= now)
    const parts = [`${open} to-do${open === 1 ? '' : 's'}`]
    if (mail.status === 'ok') parts.push(`${mail.rows.length} to answer`)
    if (upcoming) parts.push(`next: ${clock(upcoming.start)} ${upcoming.title}`)
    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end" dimColor>
          ▣ {parts.join(' · ')}
        </Text>
        {below}
      </Box>
    )
  })
}
