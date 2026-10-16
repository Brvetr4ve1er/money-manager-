/**
 * Ember desktop preload. Runs sandboxed with context isolation; exposes a
 * single frozen, read-only marker object and no Node or IPC APIs.
 */

import { contextBridge } from 'electron'

const flag = process.argv.find((a) => a.startsWith('--ember-version='))
const version = flag ? flag.slice('--ember-version='.length) : ''

contextBridge.exposeInMainWorld('emberDesktop', Object.freeze({ isDesktop: true as const, version }))
