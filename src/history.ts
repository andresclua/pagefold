export interface HistoryState {
  url: string
  random: number
  source: 'pagefold'
  index?: number
  [key: string]: unknown
}

export const getCurrentUrl = ({ hash = false } = {}): string =>
  window.location.pathname + window.location.search + (hash ? window.location.hash : '')

const makeState = (url: string, data: object): HistoryState => ({
  ...data,
  url,
  random: Math.random(),
  source: 'pagefold',
})

/** Add a history entry. */
export function createHistoryRecord(url: string, data: object = {}): void {
  url = url || getCurrentUrl({ hash: true })
  window.history.pushState(makeState(url, data), '', url)
}

/** Replace the current history entry, keeping data that is already there. */
export function updateHistoryRecord(url?: string | null, data: object = {}): void {
  url = url || getCurrentUrl({ hash: true })
  const previous = (window.history.state ?? {}) as object
  window.history.replaceState(makeState(url, { ...previous, ...data }), '', url)
}
