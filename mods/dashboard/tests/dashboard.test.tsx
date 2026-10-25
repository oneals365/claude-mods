import { expect, test } from 'claude-code/testing'

const NOW = new Date(2026, 9, 25, 10, 0, 0).getTime()

const PANE = {
  plugin: 'dashboard',
  component: 'Pane',
  requestId: 'dashboard',
  props: { title: 'Dashboard', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

const BAND = {
  plugin: 'dashboard',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const GMAIL = {
  threads: [
    {
      id: 'th1',
      messages: [
        { id: 'm1', internalDate: String(NOW - 2 * 3600_000), headers: [{ name: 'From', value: 'Kerry-Ann <kerry@example.com>' }, { name: 'Subject', value: 'Can I move Tuesday session?' }] },
      ],
    },
  ],
}
const CAL = {
  events: [
    { id: 'e1', summary: 'Client: PT session Sheraton', start: { dateTime: new Date(2026, 9, 25, 14, 0).toISOString() } },
    { id: 'e2', summary: 'Gym open', start: { date: '2026-10-25' } },
  ],
}

const TOOLS = [
  { name: 'mcp__claude_ai_Gmail__search_threads', description: '', mcp: true },
  { name: 'mcp__claude_ai_Google_Calendar__list_events', description: '', mcp: true },
]

function engine(on: Parameters<Parameters<typeof test>[1]>[1], tools: { name: string; description: string; mcp: boolean }[] = TOOLS) {
  const kept = new Map<string, unknown>()
  on('store.get', (_$, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_$, e) => (kept.set(e.key, e.value), { value: undefined }))
  on('clock.now', () => ({ value: NOW }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.after', () => ({ value: undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.list', () => ({ value: tools }))
  on('mcp.call', (_$, e) => ({
    value: { isError: false, content: [{ type: 'text', text: JSON.stringify(e.tool === 'search_threads' ? GMAIL : CAL) }] },
  }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}

test('the dashboard shows to-dos, inbox and today, and the strip sums them', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'todo', args: 'Send Shredded Academy invoices' })
  await $.command.run({ command: 'hq', args: '' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Button', key: 'todo-t' + NOW }))).toBeDefined()
  await ui.press({ key: 'tab-inbox' })
  expect((await ui.find({ type: 'Text', text: /Kerry-Ann/ }))?.text).toContain('Can I move Tuesday session?')
  await ui.press({ key: 'tab-today' })
  expect((await ui.find({ type: 'Text', text: /PT session/ }))?.text).toContain('2 PM')
  await ui.unmount()

  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Text', text: /to-do/ }))?.text).toBe('▣ 1 to-do · 1 to answer · next: 2 PM Client: PT session Sheraton')
  await band.unmount()
})

test('a missing connector says so in one line', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'hq', args: '' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-inbox' })
  expect((await ui.find({ type: 'Text', text: /Gmail/ }))?.text).toContain('No Gmail connector')
  await ui.unmount()
})

test('/hq inbox opens straight on the Inbox tab', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run({ command: 'hq', args: 'inbox' })
  expect(ran.text).toBe('Dashboard opened (Inbox).')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Kerry-Ann/ }))?.text).toContain('Can I move Tuesday session?')
  await ui.unmount()
})
