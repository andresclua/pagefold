import { getCollection } from 'astro:content'
import type { APIRoute } from 'astro'

const SECTIONS = ['start', 'concepts', 'guides', 'plugins', 'hooks', 'reference'] as const

// The docs as plain text. The demos are left out because they are made of live components.
// ponytail: the .mdx is cleaned with regexes (imports and component tags); a page that needs a real MDX render can be added later.
// Outside the code fences: drop the imports and the JSX components (self-closing or paired, on several lines)
const clean = (body = '') =>
  body
    .split(/(```[\s\S]*?```)/)
    .map((part) =>
      part.startsWith('```')
        ? part
        : part
            .replace(/^import .*$/gm, '')
            .replace(/<([A-Z]\w*)\b[^]*?<\/\1>/g, '')
            .replace(/<[A-Z]\w*\b[^]*?\/>/g, ''),
    )
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export const GET: APIRoute = async ({ site }) => {
  const docs = await getCollection('docs')
  const out = ['# Pagefold documentation', '', '> Page transitions for server-rendered websites.', '']
  for (const section of SECTIONS) {
    for (const d of docs.filter((x) => x.data.section === section).sort((a, b) => a.data.order - b.data.order)) {
      out.push(`# ${d.data.title}`, '', `Source: ${new URL(`/docs/${d.id}/`, site).href}`, '', d.data.description, '')
      if (d.data.whenToUse) out.push(`When to use it: ${d.data.whenToUse}`, '')
      if (d.data.options?.length) {
        out.push('Options:', '')
        for (const o of d.data.options) out.push(`- \`${o.name}\` (${o.type}, default ${o.default}): ${o.description}`)
        out.push('')
      }
      out.push(clean(d.body), '', '---', '')
    }
  }
  return new Response(out.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
