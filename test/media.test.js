import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Media from '../src/media.js'

// Media is a singleton, so we need to clean up between tests.
// Save original engines and restore after each test.
describe('Media', () => {
  let savedEngines

  beforeEach(() => {
    savedEngines = { ...Media.engines }
    // Clear all engines
    for (const id in Media.engines) {
      delete Media.engines[id]
    }
  })

  // Restore after each test so other test files aren't affected
  afterEach(() => {
    for (const id in Media.engines) {
      delete Media.engines[id]
    }
    Object.assign(Media.engines, savedEngines)
  })

  describe('register', () => {
    it('registers a valid engine', () => {
      const result = Media.register({
        id: 'test',
        name: 'Test Engine',
        formats: 'MP4',
        preference: 50,
        support: true
      })
      expect(result).toBe(true)
      expect(Media.engines.test).toBeDefined()
      expect(Media.engines.test.name).toBe('Test Engine')
    })

    it('rejects engine without id', () => {
      const result = Media.register({
        name: 'No ID',
        preference: 50,
        support: true
      })
      expect(result).toBe(false)
    })

    it('rejects engine without name', () => {
      const result = Media.register({
        id: 'noid',
        preference: 50,
        support: true
      })
      expect(result).toBe(false)
    })

    it('rejects engine without preference', () => {
      const result = Media.register({
        id: 'nopref',
        name: 'No Pref',
        support: true
      })
      expect(result).toBe(false)
    })

    it('rejects engine without support', () => {
      const result = Media.register({
        id: 'nosup',
        name: 'No Sup',
        preference: 50
      })
      expect(result).toBe(false)
    })

    it('accepts preference of 0', () => {
      const result = Media.register({
        id: 'zero',
        name: 'Zero Pref',
        preference: 0,
        support: true
      })
      expect(result).toBe(true)
    })

    it('accepts support of false', () => {
      const result = Media.register({
        id: 'unsupported',
        name: 'Unsupported',
        preference: 50,
        support: false
      })
      expect(result).toBe(true)
    })
  })

  describe('has', () => {
    it('returns true for registered engine', () => {
      Media.register({ id: 'x', name: 'X', preference: 1, support: true })
      expect(Media.has('x')).toBe(true)
    })

    it('returns false for unregistered engine', () => {
      expect(Media.has('nonexistent')).toBe(false)
    })
  })

  describe('supports', () => {
    it('returns true for supported engine', () => {
      Media.register({ id: 'sup', name: 'Sup', preference: 1, support: true })
      expect(Media.supports('sup')).toBe(true)
    })

    it('returns false for unsupported engine', () => {
      Media.register({ id: 'unsup', name: 'Unsup', preference: 1, support: false })
      expect(Media.supports('unsup')).toBe(false)
    })

    it('returns false for unregistered engine', () => {
      expect(Media.supports('nope')).toBe(false)
    })
  })

  describe('compatibleEngines', () => {
    it('returns only supported engines', () => {
      Media.register({ id: 'a', name: 'A', preference: 10, support: true })
      Media.register({ id: 'b', name: 'B', preference: 20, support: false })
      Media.register({ id: 'c', name: 'C', preference: 30, support: true })

      const engines = Media.compatibleEngines()
      expect(engines).toHaveLength(2)
      expect(engines.map(e => e.id)).toEqual(['c', 'a'])
    })

    it('sorts by preference descending', () => {
      Media.register({ id: 'low', name: 'Low', preference: 10, support: true })
      Media.register({ id: 'high', name: 'High', preference: 100, support: true })
      Media.register({ id: 'mid', name: 'Mid', preference: 50, support: true })

      const engines = Media.compatibleEngines()
      expect(engines[0].id).toBe('high')
      expect(engines[1].id).toBe('mid')
      expect(engines[2].id).toBe('low')
    })

    it('excludes engines with preference 0', () => {
      Media.register({ id: 'disabled', name: 'Disabled', preference: 0, support: true })
      Media.register({ id: 'active', name: 'Active', preference: 50, support: true })

      const engines = Media.compatibleEngines()
      expect(engines).toHaveLength(1)
      expect(engines[0].id).toBe('active')
    })

    it('returns empty array when nothing is compatible', () => {
      Media.register({ id: 'off', name: 'Off', preference: 50, support: false })
      expect(Media.compatibleEngines()).toEqual([])
    })
  })

  describe('preferredEngine', () => {
    it('returns highest-preference supported engine', () => {
      Media.register({ id: 'low', name: 'Low', preference: 10, support: true })
      Media.register({ id: 'high', name: 'High', preference: 100, support: true })

      const engine = Media.preferredEngine()
      expect(engine.id).toBe('high')
    })

    it('returns null when no engines are compatible', () => {
      expect(Media.preferredEngine()).toBeNull()
    })

    it('skips unsupported engines even if they have higher preference', () => {
      Media.register({ id: 'best', name: 'Best', preference: 100, support: false })
      Media.register({ id: 'ok', name: 'OK', preference: 10, support: true })

      const engine = Media.preferredEngine()
      expect(engine.id).toBe('ok')
    })
  })
})
