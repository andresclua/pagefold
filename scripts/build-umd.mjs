// Builds the <script> version of the core and of every module: one minified UMD file each.
// Vite can only make UMD files one entry at a time, so this runs it in a loop.
import { build } from 'vite'
import { readFileSync, writeFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const globals = {
  pagefold: 'Pagefold',
  head: 'PagefoldHead',
  scripts: 'PagefoldScripts',
  js: 'PagefoldJs',
  overlap: 'PagefoldOverlap',
  preload: 'PagefoldPreload',
  a11y: 'PagefoldA11y',
  scroll: 'PagefoldScroll',
  'body-class': 'PagefoldBodyClass',
  debug: 'PagefoldDebug',
  'route-name': 'PagefoldRouteName',
  progress: 'PagefoldProgress',
  forms: 'PagefoldForms',
  fragment: 'PagefoldFragment',
  analytics: 'PagefoldAnalytics',
}

for (const [file, name] of Object.entries(globals)) {
  await build({
    configFile: false,
    logLevel: 'warn',
    define: { __VERSION__: JSON.stringify(version) },
    build: {
      emptyOutDir: false,
      outDir: 'dist/umd',
      sourcemap: true,
      minify: true,
      target: 'es2020',
      lib: { entry: `src/umd/${file}.ts`, name, formats: ['umd'], fileName: () => `${file}.js` },
    },
  })
}
// The package is an ES module, so Node would read these .js files as ES modules and skip the
// CommonJS branch of the UMD wrapper. This marks the folder as CommonJS and keeps the .js name
// that CDNs and script tags expect.
writeFileSync('dist/umd/package.json', '{ "type": "commonjs" }\n')
console.log(`built ${Object.keys(globals).length} UMD files in dist/umd`)
