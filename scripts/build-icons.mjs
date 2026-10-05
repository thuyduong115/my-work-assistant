// Builds public/icons/ph.json: Phosphor icons in outline / fill / duotone weights,
// { [name]: { o?: body, f?: body, d?: body } } — loaded only by the icon picker.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const src = JSON.parse(readFileSync(require.resolve('@iconify-json/ph/icons.json'), 'utf8'))
const out = {}
for (const [name, { body }] of Object.entries(src.icons)) {
  const m = name.match(/^(.*?)(?:-(fill|duotone|bold|thin|light))?$/)
  const base = m[1]
  const w = m[2] === 'fill' ? 'f' : m[2] === 'duotone' ? 'd' : m[2] ? null : 'o'
  if (!w) continue
  ;(out[base] ??= {})[w] = body
}
mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/ph.json', JSON.stringify(out))
console.log(`icons: ${Object.keys(out).length} names`)
