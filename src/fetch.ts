import type { Pagefold } from './pagefold.js'
import type { FetchOptions, PageData } from './types.js'
import { Location } from './location.js'
import type { Visit } from './visit.js'

export class FetchError extends Error {
  url: string
  status: number | undefined
  aborted: boolean
  timedOut: boolean

  constructor(
    message: string,
    details: { url: string; status?: number; aborted?: boolean; timedOut?: boolean }
  ) {
    super(message)
    this.name = 'FetchError'
    this.url = details.url
    this.status = details.status
    this.aborted = details.aborted ?? false
    this.timedOut = details.timedOut ?? false
  }
}

/**
 * One signal for a request. It fires when the visit is aborted, when the signal the caller passed
 * fires, or when the timeout runs out; `expired` tells the last case apart.
 */
function guardRequest(visit: Visit, caller: AbortSignal | null | undefined, timeout: number) {
  const controller = new AbortController()
  const stop = () => controller.abort()
  const sources = [visit.controller.signal, caller].filter((s): s is AbortSignal => !!s)
  let expired = false

  for (const source of sources) {
    if (source.aborted) stop()
    else source.addEventListener('abort', stop)
  }
  const timer =
    timeout > 0
      ? setTimeout(() => {
          expired = true
          stop()
        }, timeout)
      : undefined

  return {
    signal: controller.signal,
    expired: () => expired,
    release: () => {
      clearTimeout(timer)
      for (const source of sources) source.removeEventListener('abort', stop)
    },
  }
}

/**
 * Fetch a page. Aborting the visit cancels the request. Writes to the cache when
 * the visit allows it.
 */
export async function fetchPage(
  p: Pagefold,
  url: string,
  options: FetchOptions = {},
  visit: Visit = p.visit
): Promise<PageData> {
  url = Location.fromUrl(url).url
  const guard = guardRequest(visit, options.signal, options.timeout ?? p.options.timeout)
  const request: FetchOptions = {
    ...options,
    headers: { ...p.options.requestHeaders, ...options.headers },
    signal: guard.signal,
  }

  let response: Response
  try {
    response = await p.hooks.call('fetch:request', visit, { url, options: request }, (_v, args) =>
      fetch(args.url, args.options)
    )
  } catch (error) {
    if (guard.expired()) {
      await p.hooks.call('fetch:timeout', visit, { url })
      throw new FetchError(`Request timed out: ${url}`, { url, timedOut: true })
    }
    if (guard.signal.aborted || (error as Error)?.name === 'AbortError') {
      throw new FetchError(`Request aborted: ${url}`, { url, aborted: true })
    }
    throw error
  } finally {
    guard.release()
  }

  const { status, url: answeredUrl } = response
  const html = await response.text()

  if (p.options.failOnStatus(status)) {
    await p.hooks.call('fetch:error', visit, { status, response, url: answeredUrl })
    throw new FetchError(`Server error: ${answeredUrl}`, { status, url: answeredUrl })
  }
  if (!html) throw new FetchError(`Empty response: ${answeredUrl}`, { status, url: answeredUrl })

  // The URL after redirects is the page's identity
  const page: PageData = { url: Location.fromUrl(answeredUrl).url, html }

  // Only safe requests that were not redirected are worth keeping
  const plainGet = !options.method || options.method === 'GET'
  if (visit.cache.write && plainGet && url === page.url) p.cache.set(page.url, page)
  return page
}
