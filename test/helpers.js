import { Emitter } from 'symple-client'

// Minimal mock of SympleClient for testing CallManager.
// Implements the same Emitter interface and send() method
// that CallManager relies on.
export class MockClient extends Emitter {
  constructor () {
    super()
    this.sent = [] // All messages sent via send()
    this.peer = { user: 'testuser', id: 'test-socket-id' }
  }

  get online () { return true }

  send (m, to) {
    if (typeof m !== 'object') throw new Error('Message must be an object')
    if (typeof m.type !== 'string') m.type = 'message'
    if (to) m.to = to
    m.from = this.peer.user + '|' + this.peer.id
    this.sent.push({ ...m })
  }

  // Simulate receiving a message from a remote peer.
  // This triggers the same dispatch that SympleClient does:
  // client.emit(m.type, m)
  receive (m) {
    if (!m.type) m.type = 'message'
    this.emit(m.type, m)
  }

  clearSent () {
    this.sent = []
  }

  lastSent () {
    return this.sent[this.sent.length - 1]
  }
}

// Minimal DOM element mock for Player tests.
export function createMockElement () {
  const children = {}

  return {
    classList: {
      contains: (cls) => false
    },
    innerHTML: '',
    querySelector: (sel) => {
      if (children[sel]) return children[sel]
      // Create a child mock
      children[sel] = {
        innerHTML: '',
        style: { display: '' },
        querySelector: () => null
      }
      return children[sel]
    },
    addEventListener: (event, handler) => {},
    style: { display: '' },
    // After innerHTML is set (template injection), querySelector should
    // find the player sub-elements
    _setupTemplate: function () {
      children['.symple-player-screen'] = {
        innerHTML: '',
        style: {},
        appendChild: () => {},
        querySelector: () => null
      }
      children['.symple-player-message'] = {
        innerHTML: '',
        style: { display: '' },
        querySelector: () => null
      }
      children['.symple-player-status'] = {
        innerHTML: '',
        style: {},
        querySelector: () => null
      }
    }
  }
}
