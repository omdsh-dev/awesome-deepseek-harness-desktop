import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const READY_LINE = /dsh web: (http:\/\/[^\s)]+)/

export function parseReadyUrl(output) {
  return READY_LINE.exec(output)?.[1]
}

export function runtimeNodePath({ isPackaged, resourcesPath, execPath, platform = process.platform }) {
  if (!isPackaged) return execPath
  return join(resourcesPath, 'runtime', platform === 'win32' ? 'node.exe' : 'node')
}

export function dshBinPath({ appPath }) {
  return join(appPath, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
}

export function assertRuntimeFiles(paths) {
  for (const [label, path] of Object.entries(paths)) {
    if (!existsSync(path)) throw new Error(`${label} not found: ${path}`)
  }
}

export function childEnvironment({ base = process.env, dshHome, isPackaged }) {
  const env = { ...base, DSH_HOME: dshHome, FORCE_COLOR: '0' }
  if (!isPackaged) env.ELECTRON_RUN_AS_NODE = '1'
  else delete env.ELECTRON_RUN_AS_NODE
  return env
}
