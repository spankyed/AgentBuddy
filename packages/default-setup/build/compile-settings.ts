import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const OUTPUT_FILE = path.join(ROOT, 'src', 'settings.json')

export async function compileSettings(): Promise<void> {
  const mod = await import('../src/default-settings.ts')
  const settings = mod.default

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(settings, null, 2) + '\n')

  const sections = Object.keys(settings)
  console.log(`Wrote settings (${sections.join(', ')}) to ${path.relative(process.cwd(), OUTPUT_FILE)}`)
}
