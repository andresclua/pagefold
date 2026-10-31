/**
 * Match a URL path against a pattern. Supports `:name` parameters and `*` or `(.*)` wildcards.
 * The query string is ignored and a trailing slash is optional.
 * Returns the parameters, or null when the path does not match.
 */
export function matchPath(pattern: string, url: string): Record<string, string> | null {
  const names: string[] = []
  const source = pattern
    .split(/(:\w+|\(\.\*\)|\*)/)
    .map((part) => {
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
  const match = new RegExp(`^${source}/?$`).exec(path)
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
