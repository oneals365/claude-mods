import { expect, test } from 'claude-code/testing'

test('a long turn notifies and every turn logs a cost row', async ($, on) => {
  const files = new Map<string, string>()
  const notes: string[] = []
  on('clock.now', () => ({ value: Date.UTC(2026, 9, 25, 14, 0) }))
  on('session.cwd', () => ({ value: '/work' }))
  on('fs.exists', (_$, e) => ({ value: files.has(e.path) }))
  on('fs.read', (_$, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_$, e) => (files.set(e.path, e.text), { value: undefined }))
  on('ui.notify', (_$, e) => (notes.push(e.text), { value: { isSent: true, channel: 'auto' } }))
  on('turn.complete', () => ({ text: 'ok' }))

  const usage = { model: 'claude-opus-5-5', input_tokens: 10_000, output_tokens: 1_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  await $.turn.complete({ answer: 'Built the app.', durationMs: 180_000, isAborted: false, turnId: 't1', reason: 'answer', usage })
  await $.turn.complete({ answer: 'Fixed a typo.', durationMs: 5_000, isAborted: false, turnId: 't2', reason: 'answer', usage })

  expect(notes.length).toBe(1)
  expect(notes[0]).toContain('Built the app.')
  const csv = files.get('/work/claude-costs.csv') ?? ''
  expect(csv.split('\n').filter(l => l !== '').length).toBe(3)
  expect(csv).toContain('claude-opus-5-5,10000,1000,0,0,180,0.06000')
})
