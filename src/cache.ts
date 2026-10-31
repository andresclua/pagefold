import type { PageData } from './types'

export interface CacheOptions {
  /** Keep at most this many pages, dropping the least recently used. Default: unlimited */
  max?: number
  /** Drop pages older than this many milliseconds. Default: never */
  ttl?: number
}

interface Entry {
  page: PageData
  time: number
}

/** In-memory page cache. Unbounded unless `max` or `ttl` are set. */
export class Cache {
  private pages = new Map<string, Entry>()

  constructor(
    private options: CacheOptions = {},
    /** Normalizes URLs before they are used as keys */
    private resolve: (url: string) => string = (url) => url,
    private onChange: (event: 'set' | 'clear', page?: PageData) => void = () => {}
  ) {}

  get size(): number {
    return this.pages.size
  }

  has(url: string): boolean {
    return this.get(url) !== undefined
  }

  get(url: string): PageData | undefined {
    const key = this.resolve(url)
    const entry = this.pages.get(key)
    if (!entry) return undefined
    const { ttl } = this.options
    if (ttl !== undefined && Date.now() - entry.time > ttl) {
      this.pages.delete(key)
      return undefined
    }
    // Re-insert so the Map order tracks recency
    this.pages.delete(key)
    this.pages.set(key, entry)
    return { ...entry.page }
  }

  set(url: string, page: PageData): void {
    const key = this.resolve(url)
    const stored = { ...page, url: key }
    this.pages.delete(key)
    this.pages.set(key, { page: stored, time: Date.now() })
    const { max } = this.options
    if (max !== undefined) {
      while (this.pages.size > max) this.pages.delete(this.pages.keys().next().value as string)
    }
    this.onChange('set', stored)
  }

  /** Merge extra data into an existing record. */
  update(url: string, payload: object): void {
    const page = this.get(url)
    if (page) this.set(url, { ...page, ...payload })
  }

  delete(url: string): void {
    this.pages.delete(this.resolve(url))
  }

  clear(): void {
    this.pages.clear()
    this.onChange('clear')
  }

  /** Remove every entry for which the predicate returns true. */
  prune(predicate: (url: string, page: PageData) => boolean): void {
    for (const [url, { page }] of [...this.pages]) {
      if (predicate(url, page)) this.pages.delete(url)
    }
  }
}
