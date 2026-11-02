/** A URL split into the parts Pagefold cares about. */
export class Location {
  readonly origin: string
  /** Path and query, without hash */
  readonly url: string
  readonly hash: string
  /** `http:`, `https:`, `mailto:`... */
  readonly protocol: string
  /** The URL as given, for links without an origin (`mailto:`, `tel:`, `javascript:`) */
  private readonly full: string

  private constructor(href: string) {
    const u = new URL(href, window.location.href)
    this.origin = u.origin
    this.protocol = u.protocol
    this.full = u.href
    this.url = u.pathname + u.search
    this.hash = u.hash
  }

  get href(): string {
    // Rebuilding from origin and path would turn `mailto:a@b.c` into `nulla@b.c`
    return this.origin === 'null' ? this.full : this.origin + this.url + this.hash
  }

  /** Is this a page of a website? Not a mail, phone, script or data link. */
  get isWeb(): boolean {
    return this.protocol === 'http:' || this.protocol === 'https:'
  }

  static fromUrl(url: string | URL): Location {
    return new Location(url.toString())
  }

  static fromElement(el: HTMLAnchorElement): Location {
    return new Location(el.getAttribute('href') ?? '')
  }
}
