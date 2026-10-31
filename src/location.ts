/** A URL split into the parts Pagefold cares about. */
export class Location {
  readonly origin: string
  /** Path and query, without hash */
  readonly url: string
  readonly hash: string

  private constructor(href: string) {
    const u = new URL(href, window.location.href)
    this.origin = u.origin
    this.url = u.pathname + u.search
    this.hash = u.hash
  }

  get href(): string {
    return this.origin + this.url + this.hash
  }

  static fromUrl(url: string | URL): Location {
    return new Location(url.toString())
  }

  static fromElement(el: HTMLAnchorElement): Location {
    return new Location(el.getAttribute('href') ?? '')
  }
}
