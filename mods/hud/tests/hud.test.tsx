import { expect, test } from 'claude-code/testing'

test('the HUD shows branch, a red context bar past 80% and health bars', async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 0, stdout: 'main\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 170_000, window: 200_000, percent: 85 }, rateLimits: [{ kind: 'five_hour', percentUsed: 30 }, { kind: 'seven_day', percentUsed: 90 }] } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({
    plugin: 'hud',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  } as never)
  const line = await ui.find({ type: 'Text', text: /ctx/ })
  expect(line?.text).toContain('main')
  expect(line?.text).toContain('85%')
  expect(line?.text).toContain('♥ 5h ███████░░░')
  expect(line?.text).toContain('♦ wk █░░░░░░░░░')
  await ui.unmount()
})
