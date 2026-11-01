// Checks every showcase entry: the files are there, the cover has the right shape and is light.
// (The site build checks the fields themselves and the names of the plugins.)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

const MAX_KB = 400
const MIN_WIDTH = 1200
const RATIO = [1.5, 1.7] // 16:10 is 1.6

/** Width and height of a JPG, PNG or WebP, read from the file header. Undefined if not one of those. */
export function imageSize(b) {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { format: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20) }

  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue }
      const marker = b[o + 1]
      if (marker === 0xff) { o++; continue }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: 'jpg', height: b.readUInt16BE(o + 5), width: b.readUInt16BE(o + 7) }
      }
      o += 2 + b.readUInt16BE(o + 2)
    }
    return undefined
  }

  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16)
    if (kind === 'VP8 ') return { format: 'webp', width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
    if (kind === 'VP8L') {
      return {
        format: 'webp',
        width: 1 + (((b[22] & 0x3f) << 8) | b[21]),
        height: 1 + (((b[24] & 0xf) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)),
      }
    }
    if (kind === 'VP8X') return { format: 'webp', width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }
  }
  return undefined
}

export function checkCover(file) {
  const problems = []
  const kb = statSync(file).size / 1024
  if (kb > MAX_KB) problems.push(`${kb.toFixed(0)} KB, the limit is ${MAX_KB} KB. Compress it at squoosh.app`)

  const size = imageSize(readFileSync(file))
  if (!size) return [...problems, 'it is not a JPG, PNG or WebP image (renaming a file does not convert it)']
  const ratio = size.width / size.height
  if (size.width < MIN_WIDTH) problems.push(`${size.width} px wide, at least ${MIN_WIDTH} are needed. 1600 x 1000 is ideal`)
  if (ratio < RATIO[0] || ratio > RATIO[1]) problems.push(`${size.width} x ${size.height} is the wrong shape (${ratio.toFixed(2)}), it must be about 16:10, such as 1600 x 1000`)
  return problems
}

// Run as a script
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = 'showcase'
  const problems = []
  for (const name of readdirSync(root).filter((n) => !n.startsWith('_') && statSync(join(root, n)).isDirectory())) {
    const dir = join(root, name)
    const index = join(dir, 'index.md')
    if (!existsSync(index)) { problems.push(`${dir}: there is no index.md`); continue }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) problems.push(`${dir}: the folder name must be lowercase words joined by hyphens`)

    const cover = /^cover:\s*(.+?)\s*(#.*)?$/m.exec(readFileSync(index, 'utf8'))?.[1]?.replace(/^['"]|['"]$/g, '')
    if (!cover) { problems.push(`${index}: the cover field is missing`); continue }
    const file = join(dir, cover)
    if (!existsSync(file)) { problems.push(`${index}: the cover ${cover} is not in that folder`); continue }
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(extname(file).toLowerCase())) problems.push(`${file}: the cover must be a .jpg, .png or .webp file`)
    checkCover(file).forEach((p) => problems.push(`${file}: ${p}`))
  }
  if (problems.length) {
    console.error('Showcase problems:\n- ' + problems.join('\n- '))
    process.exit(1)
  }
  console.log('showcase ok')
}
