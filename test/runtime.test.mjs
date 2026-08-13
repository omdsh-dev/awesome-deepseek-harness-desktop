import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { childEnvironment, dshBinPath, isAllowedNavigation, parseReadyUrl, runtimeNodePath } from '../electron/runtime.mjs'

test('parses the official DSH readiness line across chunks', () => {
  assert.equal(parseReadyUrl('booting\ndsh web: http://127.0.0.1:43210\n'), 'http://127.0.0.1:43210')
})

test('does not mistake the LAN annotation for the local URL', () => {
  assert.equal(parseReadyUrl('dsh web: http://127.0.0.1:43210 (LAN: http://10.0.0.2:43210)'), 'http://127.0.0.1:43210')
})

test('keeps navigation on the active Harness origin', () => {
  const origin = 'http://127.0.0.1:4242'
  assert.equal(isAllowedNavigation(`${origin}/settings`, origin), true)
  assert.equal(isAllowedNavigation('file:///loading.html', origin), true)
  assert.equal(isAllowedNavigation('http://127.0.0.1:9999/', origin), false)
  assert.equal(isAllowedNavigation('https://example.com/', origin), false)
})

test('resolves development and packaged runtimes', () => {
  assert.equal(runtimeNodePath({ isPackaged: false, resourcesPath: '/r', execPath: '/electron', platform: 'linux' }), '/electron')
  assert.equal(runtimeNodePath({ isPackaged: true, resourcesPath: '/r', execPath: '/electron', platform: 'linux' }), join('/r', 'runtime', 'node'))
  assert.match(runtimeNodePath({ isPackaged: true, resourcesPath: 'C:\\r', execPath: 'electron.exe', platform: 'win32' }), /node\.exe$/)
})

test('resolves development and unpacked packaged DSH dependencies', () => {
  assert.equal(dshBinPath({ appPath: '/app' }), join('/app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'))
  assert.equal(
    dshBinPath({ appPath: '/ignored', isPackaged: true, resourcesPath: '/resources' }),
    join('/resources', 'app.asar.unpacked', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  )
})

test('only development children inherit Electron-as-Node mode', () => {
  const development = childEnvironment({ base: { KEEP: 'yes' }, dshHome: '/dsh', isPackaged: false })
  assert.deepEqual(development, { KEEP: 'yes', DSH_HOME: '/dsh', FORCE_COLOR: '0', ELECTRON_RUN_AS_NODE: '1' })
  const packaged = childEnvironment({ base: { ELECTRON_RUN_AS_NODE: '1' }, dshHome: '/dsh', isPackaged: true })
  assert.equal(packaged.ELECTRON_RUN_AS_NODE, undefined)
})
