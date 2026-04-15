import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const COMPILED_DIR = path.join(ROOT, 'dist')
const OUTPUT_FILE = path.join(COMPILED_DIR, 'compiled-settings.json')

export async function compileSettings(): Promise<void> {
  const mod = await import('../src/default-settings.ts')
  const settings = mod.default

  fs.mkdirSync(COMPILED_DIR, { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(settings, null, 2) + '\n')

  const sections = Object.keys(settings)
  console.log(`Wrote settings (${sections.join(', ')}) to ${path.relative(process.cwd(), OUTPUT_FILE)}`)
}
