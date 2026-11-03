export interface MatchOptions {
  /** Capital letters have to match too. Default: false */
  ignoreCase?: boolean
  /** A trailing slash has to match: `/about` does not match `/about/`. Default: false */
  strict?: boolean
  /** The whole path has to match. With `false`, a pattern also matches the paths below it: `/blog` matches `/blog/post`. Default: true */
  end?: boolean
}

/**
 * Match a URL path against a pattern. Supports `:name` parameters, optional ones (`/:lang?`) and
 * `*` or `(.*)` wildcards.
 * The query string is ignored and a trailing slash is optional.
 * Returns the parameters, or null when the path does not match.
 */
export function matchPath(
  pattern: string,
  url: string,
  { ignoreCase = false, strict = false, end = true }: MatchOptions = {}
): Record<string, string> | null {
  const names: string[] = []
  const source = pattern
    .split(/(\/:\w+\?|:\w+|\(\.\*\)|\*)/)
    .map((part) => {
      if (part.startsWith('/:') && part.endsWith('?')) {
        names.push(part.slice(2, -1))
        return '(?:/([^/]+))?'
      }
      if (part.startsWith(':')) {
        names.push(part.slice(1))
        return '([^/]+)'
      }
      if (part === '(.*)' || part === '*') {
        names.push(String(names.length))
        return '(.*)'
      }
      return part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('')

  const path = url.split('?')[0] ?? ''
  const tail = end ? `${strict ? '' : '/?'}$` : '(?=/|$)'
  const match = new RegExp(`^${source}${tail}`, ignoreCase ? 'i' : '').exec(path)
  if (!match) return null

  const params: Record<string, string> = {}
  names.forEach((name, i) => {
    const raw = match[i + 1] ?? ''
    try {
      params[name] = decodeURIComponent(raw)
    } catch {
      params[name] = raw
    }
  })
  return params
}
