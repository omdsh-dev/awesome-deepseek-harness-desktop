import { createHash } from 'node:crypto'
import { chmod, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { spawnSync } from 'node:child_process'

const NODE_VERSION = process.env.ADHD_NODE_VERSION || 'v24.19.0'
const platform = process.env.ADHD_TARGET_PLATFORM || process.platform
const arch = process.env.ADHD_TARGET_ARCH || process.arch
const platformNames = { win32: 'win', darwin: 'darwin', linux: 'linux' }
const builderNames = { win32: 'win', darwin: 'mac', linux: 'linux' }
const archiveExtensions = { win32: 'zip', darwin: 'tar.gz', linux: 'tar.xz' }

if (!platformNames[platform] || !archiveExtensions[platform]) throw new Error(`Unsupported platform: ${platform}`)
if (!['x64', 'arm64'].includes(arch)) throw new Error(`Unsupported architecture: ${arch}`)

const releasePlatform = platformNames[platform]
const archive = `node-${NODE_VERSION}-${releasePlatform}-${arch}.${archiveExtensions[platform]}`
const baseUrl = `https://nodejs.org/dist/${NODE_VERSION}`
const cacheDirectory = join('build', 'cache')
const archivePath = join(cacheDirectory, archive)
const extractDirectory = join(cacheDirectory, `${archive}.unpacked`)
const runtimeDirectory = join('build', 'runtime', `${builderNames[platform]}-${arch}`)
const executable = platform === 'win32' ? 'node.exe' : 'bin/node'

await mkdir(cacheDirectory, { recursive: true })
if (!(await exists(archivePath))) await download(`${baseUrl}/${archive}`, archivePath)

const sums = await fetchText(`${baseUrl}/SHASUMS256.txt`)
const expected = sums.split('\n').find(line => line.endsWith(`  ${archive}`))?.split(/\s+/)[0]
if (!expected) throw new Error(`No checksum published for ${archive}`)
const actual = createHash('sha256').update(await readFile(archivePath)).digest('hex')
if (actual !== expected) throw new Error(`Checksum mismatch for ${archive}`)

await rm(extractDirectory, { recursive: true, force: true })
await mkdir(extractDirectory, { recursive: true })
const extracted = spawnSync('tar', ['-xf', archivePath, '-C', extractDirectory], { stdio: 'inherit' })
if (extracted.status !== 0) throw new Error(`Unable to extract ${archive}; a tar-compatible extractor is required`)

const root = join(extractDirectory, basename(archive).replace(/\.(tar\.xz|tar\.gz|zip)$/, ''))
await rm(runtimeDirectory, { recursive: true, force: true })
await mkdir(runtimeDirectory, { recursive: true })
const targetNode = join(runtimeDirectory, platform === 'win32' ? 'node.exe' : 'node')
await copyFile(join(root, executable), targetNode)
await copyFile(join(root, 'LICENSE'), join(runtimeDirectory, 'NODE-LICENSE'))
if (platform !== 'win32') await chmod(targetNode, 0o755)
console.log(`Prepared Node ${NODE_VERSION} at ${targetNode}`)

async function exists(path) {
  try { await readFile(path); return true } catch { return false }
}

async function download(url, path) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`)
  await writeFile(path, Buffer.from(await response.arrayBuffer()))
}

async function fetchText(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`)
  return response.text()
}
