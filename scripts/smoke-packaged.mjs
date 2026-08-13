import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const timeoutMs = 120_000
const userData = await mkdtemp(join(tmpdir(), 'adhd-packaged-smoke-'))
const executable = packagedExecutable()

console.log(`Launching packaged ADHD: ${executable}`)
const child = spawn(executable, [], {
  env: {
    ...process.env,
    ADHD_SMOKE_TEST: '1',
    ADHD_USER_DATA_DIR: userData,
    ADHD_WORKSPACE: process.cwd(),
  },
  stdio: 'inherit',
  windowsHide: true,
})

try {
  const exitCode = await waitForExit(child, timeoutMs)
  const failurePath = join(userData, 'smoke-failure.json')
  if (existsSync(failurePath)) throw new Error(`Packaged app reported failure: ${await readFile(failurePath, 'utf8')}`)
  if (exitCode !== 0) throw new Error(`Packaged app exited with code ${exitCode}`)

  const marker = JSON.parse(await readFile(join(userData, 'smoke-ready.json'), 'utf8'))
  if (!String(marker.readyUrl).startsWith('http://127.0.0.1:')) throw new Error(`Unexpected ready URL: ${marker.readyUrl}`)
  if (marker.pluginCount < 20 || marker.rootChildren < 1) throw new Error(`Harness UI was incomplete: ${JSON.stringify(marker)}`)
  console.log(`Packaged smoke passed: ${marker.title}, ${marker.pluginCount} plugins, ${marker.readyUrl}`)
} finally {
  if (child.exitCode === null) child.kill('SIGKILL')
  if (process.env.ADHD_KEEP_SMOKE_DATA !== '1') await rm(userData, { recursive: true, force: true })
}

function packagedExecutable() {
  const candidates = process.platform === 'win32'
    ? [join('dist', 'win-unpacked', 'ADHD.exe')]
    : process.platform === 'darwin'
      ? [
          join('dist', `mac-${process.arch}`, 'ADHD.app', 'Contents', 'MacOS', 'ADHD'),
          join('dist', 'mac', 'ADHD.app', 'Contents', 'MacOS', 'ADHD'),
        ]
      : [join('dist', 'linux-unpacked', 'ADHD')]
  const executable = candidates.find(existsSync)
  if (!executable) throw new Error(`Packaged executable not found; checked: ${candidates.map(basename).join(', ')}`)
  return executable
}

function waitForExit(process, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Packaged app did not finish smoke within ${timeout / 1000} seconds`)), timeout)
    process.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    process.once('exit', code => {
      clearTimeout(timer)
      resolve(code)
    })
  })
}
