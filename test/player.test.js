import { describe, it, expect, beforeEach } from 'vitest'
import Player from '../src/player.js'
import { createMockElement } from './helpers.js'

describe('Player', () => {
  let element

  beforeEach(() => {
    element = createMockElement()
    element._setupTemplate()
  })

  it('creates an instance with default options', () => {
    const player = new Player(element)
    expect(player.state).toBeNull()
    expect(player.playing).toBe(false)
    expect(player.element).toBe(element)
  })

  it('throws if element is null', () => {
    expect(() => new Player(null)).toThrow('Player element not found')
  })

  it('throws if screen element is not found', () => {
    const badElement = {
      classList: { contains: () => false },
      innerHTML: '',
      querySelector: () => null,
      addEventListener: () => {}
    }
    expect(() => new Player(badElement)).toThrow('Player screen element not found')
  })

  describe('setState', () => {
    it('transitions to a new state and emits', () => {
      const player = new Player(element)
      const states = []
      player.on('state', (state) => states.push(state))

      player.setState('loading')
      expect(player.state).toBe('loading')
      expect(player.playing).toBe(false)
      expect(states).toEqual(['loading'])
    })

    it('sets playing=true when state is playing', () => {
      const player = new Player(element)
      player.setState('playing')
      expect(player.playing).toBe(true)
    })

    it('ignores duplicate state transitions', () => {
      const player = new Player(element)
      const states = []
      player.on('state', (state) => states.push(state))

      player.setState('loading')
      const result = player.setState('loading')
      expect(result).toBe(false)
      expect(states).toHaveLength(1)
    })

    it('passes message with state', () => {
      const player = new Player(element)
      const events = []
      player.on('state', (state, msg) => events.push({ state, msg }))

      player.setState('error', 'Something broke')
      expect(events[0]).toEqual({ state: 'error', msg: 'Something broke' })
    })
  })

  describe('setError', () => {
    it('sets state to error with message', () => {
      const player = new Player(element)
      const events = []
      player.on('state', (state, msg) => events.push({ state, msg }))

      player.setError('Connection failed')
      expect(player.state).toBe('error')
      expect(events[0]).toEqual({ state: 'error', msg: 'Connection failed' })
    })
  })

  describe('play / stop', () => {
    it('play sets state to playing', () => {
      const player = new Player(element)
      player.play()
      expect(player.state).toBe('playing')
      expect(player.playing).toBe(true)
    })

    it('stop sets state to stopped', () => {
      const player = new Player(element)
      player.play()
      player.stop()
      expect(player.state).toBe('stopped')
      expect(player.playing).toBe(false)
    })
  })

  describe('displayMessage', () => {
    it('shows message with type class', () => {
      const player = new Player(element)
      const msg = element.querySelector('.symple-player-message')
      player.displayMessage('error', 'Broken')
      expect(msg.innerHTML).toBe('<p class="error-message">Broken</p>')
      expect(msg.style.display).toBe('block')
    })

    it('hides message when called with null', () => {
      const player = new Player(element)
      const msg = element.querySelector('.symple-player-message')
      player.displayMessage('info', 'Hello')
      player.displayMessage(null)
      expect(msg.style.display).toBe('none')
    })
  })
})
