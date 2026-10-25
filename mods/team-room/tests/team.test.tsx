import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'team-room',
  component: 'Pane',
  requestId: 'team',
  props: {
    title: 'Team',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('a sent and a received message show in the Team pane', async ($, on) => {
  on('clock.now', () => ({ value: 1_761_400_000_000 }))
  on('session.send', () => ({ isDelivered: true }))
  on('session.receive', (_, e) => ({ text: e.text }))

  await $.session.send({ to: 'outreach', text: 'Leads are ready: 40 in leads.csv' })
  await $.session.receive({ origin: { kind: 'peer' }, text: 'done: 40 drafts | next: follow-ups' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const out = await ui.find({ type: 'Text', text: /outreach/ })
    expect(out?.text).toContain('Leads are ready')
    const back = await ui.find({ type: 'Text', text: /40 drafts/ })
    expect(back?.text).toContain('peer')
    await ui.unmount()
  }
})
