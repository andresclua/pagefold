import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import remarkGfm from 'remark-gfm'

export default defineConfig({
  site: 'https://pagefold.js.org',
  // Tables, task lists and strikethrough in the .mdx pages
  integrations: [mdx({ remarkPlugins: [remarkGfm] })],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    },
  },
})
