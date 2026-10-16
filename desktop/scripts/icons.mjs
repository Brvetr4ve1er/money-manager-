// Generates the desktop app icons from public/icon.svg:
//   desktop/build/icon.png  (1024x1024, Linux + runtime window icon)
//   desktop/build/icon.ico  (Windows, multi-size)
//   desktop/build/icon.icns (macOS)
// Generated files are git-ignored; this runs as part of every desktop build.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import png2icons from 'png2icons'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = path.join(root, 'desktop', 'build')
await mkdir(out, { recursive: true })

const svg = await readFile(path.join(root, 'public', 'icon.svg'))
const png = await sharp(svg, { density: 1200 }).resize(1024, 1024).png().toBuffer()
await writeFile(path.join(out, 'icon.png'), png)

const ico = png2icons.createICO(png, png2icons.BICUBIC2, 0, false, true)
const icns = png2icons.createICNS(png, png2icons.BICUBIC2, 0)
if (!ico || !icns) throw new Error('png2icons failed to convert icon.png')
await writeFile(path.join(out, 'icon.ico'), ico)
await writeFile(path.join(out, 'icon.icns'), icns)
console.log('[icons] wrote desktop/build/icon.{png,ico,icns}')
