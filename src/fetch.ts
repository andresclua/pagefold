import type { Pagefold } from './pagefold'
import type { FetchOptions, PageData } from './types'
import { Location } from './location'
import type { Visit } from './visit'

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

  const timeout = options.timeout ?? p.options.timeout
  const controller = new AbortController()
  const forward = () => controller.abort()
  if (visit.controller.signal.aborted) controller.abort()
  visit.controller.signal.addEventListener('abort', forward)

  let timedOut = false
  const timer =
    timeout > 0
      ? setTimeout(() => {
          timedOut = true
          controller.abort()
        }, timeout)
      : undefined

  const requestOptions: FetchOptions = {
    ...options,
    headers: { ...p.options.requestHeaders, ...options.headers },
    signal: controller.signal,
  }

  let response: Response
  try {
    response = await p.hooks.call(
      'fetch:request',
      visit,
      { url, options: requestOptions },
      (_visit, args) => fetch(args.url, args.options)
    )
  } catch (error) {
    if (timedOut) {
      await p.hooks.call('fetch:timeout', visit, { url })
      throw new FetchError(`Request timed out: ${url}`, { url, timedOut })
    }
    if (controller.signal.aborted || (error as Error)?.name === 'AbortError') {
      throw new FetchError(`Request aborted: ${url}`, { url, aborted: true })
    }
    throw error
  } finally {
    clearTimeout(timer)
    visit.controller.signal.removeEventListener('abort', forward)
  }

  const { status, url: responseUrl } = response
  const html = await response.text()

  if (p.options.failOnStatus(status)) {
    await p.hooks.call('fetch:error', visit, { status, response, url: responseUrl })
    throw new FetchError(`Server error: ${responseUrl}`, { status, url: responseUrl })
  }
  if (!html) {
    throw new FetchError(`Empty response: ${responseUrl}`, { status, url: responseUrl })
  }

  // Real URL after redirects
  const finalUrl = Location.fromUrl(responseUrl).url
  const page = { url: finalUrl, html }

  // Only cache safe requests that were not redirected
  if (visit.cache.write && (!options.method || options.method === 'GET') && url === finalUrl) {
    p.cache.set(page.url, page)
  }
  return page
}
