// The CSS themes are plain files: copy them next to the build.
import { cpSync } from 'node:fs'

cpSync('src/css', 'dist/css', { recursive: true })
