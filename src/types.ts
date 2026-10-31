/** A fetched page, as stored in the cache. */
export interface PageData {
  /** Final URL of the page (after redirects) */
  url: string
  /** Complete HTML response */
  html: string
}

/** Options for fetching a page. */
export interface FetchOptions extends Omit<RequestInit, 'cache'> {
  method?: 'GET' | 'POST'
  body?: string | FormData | URLSearchParams
  /** Request timeout in milliseconds */
  timeout?: number
}
