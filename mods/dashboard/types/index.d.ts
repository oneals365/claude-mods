export type Todo = { id: string; text: string; isDone: boolean }
export type MailRow = { id: string; from: string; subject: string; at: number }
export type EventRow = { id: string; title: string; start: number; isAllDay: boolean }
export type Feed<T> = { rows: T[]; status: 'ok' | 'missing' | 'error' | 'loading'; note: string; at: number }
export type Tab = 'todo' | 'inbox' | 'today'

declare module 'claude-code' {
  interface PluginState {
    dashboard: {
      todos: Shaped<Todo[]>
      inbox: Shaped<Feed<MailRow>>
      today: Shaped<Feed<EventRow>>
      tab: Tab
    }
  }
}
