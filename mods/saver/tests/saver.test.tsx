import { expect, test } from 'claude-code/testing'

const USAGE = {
  input_tokens: 9000,
  output_tokens: 1000,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

function engine(on: Parameters<Parameters<typeof test>[1]>[1], seen: string[]) {
  on('clock.now', () => ({ value: 1_761_400_000_000 }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 20_000, window: 200_000 }, rateLimits: [] } }))
  on('model.classify', () => ({ value: 'hard' }))
  on('turn.start', () => ({ turnId: 't1' }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('turn.step', async function* (_$, e) {
    seen.push(e.model)
    return {
      turnId: e.turnId,
      index: e.index,
      answer: 'ok',
      toolUses: [],
      stopReason: 'end_turn',
      usage: { ...USAGE, model: e.model === 'haiku' ? 'claude-haiku-5-5' : 'claude-opus-5-5' },
    }
  })
}

test('an easy prompt goes to Haiku and the band shows the saving', async ($, on) => {
  const seen: string[] = []
  engine(on, seen)
  await $.turn.start({ turnId: 't1', text: 'fix the typo in README' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 3 })) {
  }
  expect(seen).toEqual(['haiku'])

  const ui = await $.ui.mount({
    plugin: 'saver',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  } as never)
  const line = await ui.find({ type: 'Text', text: /Saver/ })
  expect(line?.text).toContain('Haiku 5.5')
  expect(line?.text).toContain('$0.05')
  await ui.unmount()
})

test('a hard prompt stays on the main model', async ($, on) => {
  const seen: string[] = []
  engine(on, seen)
  await $.turn.start({ turnId: 't1', text: 'debug why the login page crashes' } as never)
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 3 })) {
  }
  expect(seen).toEqual(['claude-opus-5-5'])
})
