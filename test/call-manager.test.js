import { describe, it, expect, beforeEach, vi } from 'vitest'
import CallManager, { CallSubtype, CallState } from '../src/call-manager.js'
import { MockClient, createMockElement } from './helpers.js'

// Mock WebRTCPlayer since it needs browser APIs (RTCPeerConnection, etc.)
vi.mock('../src/webrtc.js', () => {
  const { Emitter } = require('symple-client')

  class MockWebRTCPlayer extends Emitter {
    constructor (element, options) {
      super()
      this.element = element
      this.options = options
      this.destroyed = false
      this._localStream = null
    }

    async play () {
      // Simulate the initiator flow: optionally acquire media, create offer, emit sdp
      if (this.options.localMedia !== false) {
        this._localStream = { id: 'mock-local-stream' }
        this.emit('localstream', this._localStream)
      }
      // Simulate offer creation
      const offer = { type: 'offer', sdp: 'v=0\r\nmock-offer-sdp' }
      this.emit('sdp', offer)
    }

    async recvRemoteSDP (desc) {
      if (desc.type === 'offer') {
        // Simulate answer creation
        const answer = { type: 'answer', sdp: 'v=0\r\nmock-answer-sdp' }
        this.emit('sdp', answer)
      }
      // If it's an answer, just accept it (initiator side)
    }

    async recvRemoteCandidate (candidate) {
      // Accept silently
    }

    destroy () {
      this.destroyed = true
    }

    mute (flag) {}
    muteAudio (flag) {}
    muteVideo (flag) {}
  }

  return {
    default: MockWebRTCPlayer,
    iceCandidateType: (sdp) => 'unknown'
  }
})

describe('CallManager', () => {
  let client, element, cm

  beforeEach(() => {
    client = new MockClient()
    element = createMockElement()
    element._setupTemplate()
    cm = new CallManager(client, element)
  })

  describe('constructor', () => {
    it('starts in IDLE state', () => {
      expect(cm.callState).toBe(CallState.IDLE)
    })

    it('has no remote peer', () => {
      expect(cm.remotePeerId).toBeNull()
    })

    it('throws without client', () => {
      expect(() => new CallManager(null, element)).toThrow('SympleClient instance required')
    })

    it('throws without video element', () => {
      expect(() => new CallManager(client, null)).toThrow('Video element required')
    })
  })

  describe('outgoing call flow', () => {
    const remotePeer = 'bob|remote-socket-id'

    it('call() sends INIT and transitions to RINGING', () => {
      cm.call(remotePeer)

      expect(cm.callState).toBe(CallState.RINGING)
      expect(cm.remotePeerId).toBe(remotePeer)
      expect(client.lastSent().subtype).toBe(CallSubtype.INIT)
      expect(client.lastSent().to).toBe(remotePeer)
    })

    it('emits ringing event on call()', () => {
      const events = []
      cm.on('ringing', (peer) => events.push(peer))

      cm.call(remotePeer)

      expect(events).toEqual([remotePeer])
    })

    it('throws if calling when not idle', () => {
      cm.call(remotePeer)
      expect(() => cm.call('other|peer')).toThrow('Cannot start call')
    })

    it('handles ACCEPT from remote: transitions to CONNECTING, creates player, plays', async () => {
      const events = []
      cm.on('accepted', (peer) => events.push({ type: 'accepted', peer }))
      cm.on('connecting', (peer) => events.push({ type: 'connecting', peer }))

      cm.call(remotePeer)
      client.clearSent()

      // Simulate remote sending accept
      client.receive({
        type: 'message',
        subtype: CallSubtype.ACCEPT,
        from: remotePeer,
        data: {}
      })

      // Wait for async play()
      await vi.waitFor(() => {
        expect(cm.callState).toBe(CallState.CONNECTING)
      })

      expect(events[0]).toEqual({ type: 'accepted', peer: remotePeer })
      expect(cm.player).toBeDefined()

      // Player.play() should have triggered sdp emission, which sends OFFER
      const offerMsg = client.sent.find(m => m.subtype === CallSubtype.OFFER)
      expect(offerMsg).toBeDefined()
      expect(offerMsg.data.type).toBe('offer')
      expect(offerMsg.data.sdp).toContain('mock-offer-sdp')
      expect(offerMsg.to).toBe(remotePeer)
    })

    it('passes explicit outgoing call options to the player', async () => {
      cm.call(remotePeer, {
        localMedia: false,
        receiveMedia: true,
        mediaConstraints: { audio: false, video: true }
      })

      client.receive({
        type: 'message',
        subtype: CallSubtype.ACCEPT,
        from: remotePeer,
        data: {}
      })

      await vi.waitFor(() => expect(cm.player).toBeDefined())

      expect(cm.player.options.localMedia).toBe(false)
      expect(cm.player.options.receiveMedia).toBe(true)
      expect(cm.player.options.mediaConstraints).toEqual({ audio: false, video: true })
    })

    it('passes publish-only outgoing call options to the player', async () => {
      cm.call(remotePeer, {
        localMedia: true,
        receiveMedia: false,
        mediaConstraints: { audio: true, video: true }
      })

      client.receive({
        type: 'message',
        subtype: CallSubtype.ACCEPT,
        from: remotePeer,
        data: {}
      })

      await vi.waitFor(() => expect(cm.player).toBeDefined())

      expect(cm.player.options.localMedia).toBe(true)
      expect(cm.player.options.receiveMedia).toBe(false)
      expect(cm.player.options.mediaConstraints).toEqual({ audio: true, video: true })
    })

    it('handles REJECT from remote: emits rejected, ends call', () => {
      const events = []
      cm.on('rejected', (peer, reason) => events.push({ peer, reason }))
      cm.on('ended', (peer) => events.push({ type: 'ended', peer }))

      cm.call(remotePeer)

      client.receive({
        type: 'message',
        subtype: CallSubtype.REJECT,
        from: remotePeer,
        data: { reason: 'busy' }
      })

      expect(events[0]).toEqual({ peer: remotePeer, reason: 'busy' })
      expect(cm.callState).toBe(CallState.IDLE)
      expect(cm.remotePeerId).toBeNull()
    })

    it('ignores ACCEPT from wrong peer', () => {
      cm.call(remotePeer)

      client.receive({
        type: 'message',
        subtype: CallSubtype.ACCEPT,
        from: 'stranger|other-id',
        data: {}
      })

      // Should still be ringing, not connecting
      expect(cm.callState).toBe(CallState.RINGING)
    })
  })

  describe('incoming call flow', () => {
    const callerPeer = 'alice|caller-socket-id'

    function receiveIncomingCall () {
      client.receive({
        type: 'message',
        subtype: CallSubtype.INIT,
        from: callerPeer,
        data: {}
      })
    }

    it('INIT from remote transitions to INCOMING', () => {
      const events = []
      cm.on('incoming', (peer) => events.push(peer))

      receiveIncomingCall()

      expect(cm.callState).toBe(CallState.INCOMING)
      expect(cm.remotePeerId).toBe(callerPeer)
      expect(events).toEqual([callerPeer])
    })

    it('accept() sends ACCEPT and transitions to CONNECTING', () => {
      receiveIncomingCall()
      cm.accept()

      expect(cm.callState).toBe(CallState.CONNECTING)
      const acceptMsg = client.sent.find(m => m.subtype === CallSubtype.ACCEPT)
      expect(acceptMsg).toBeDefined()
      expect(acceptMsg.to).toBe(callerPeer)
    })

    it('reject() sends REJECT and returns to IDLE', () => {
      const events = []
      cm.on('ended', (peer, reason) => events.push({ peer, reason }))

      receiveIncomingCall()
      cm.reject('not now')

      expect(cm.callState).toBe(CallState.IDLE)
      const rejectMsg = client.sent.find(m => m.subtype === CallSubtype.REJECT)
      expect(rejectMsg).toBeDefined()
      expect(rejectMsg.data.reason).toBe('not now')
    })

    it('accept() rejects if not in INCOMING state', async () => {
      await expect(cm.accept()).rejects.toThrow('Cannot accept: no incoming call')
    })

    it('reject() throws if not in INCOMING state', () => {
      expect(() => cm.reject()).toThrow('Cannot reject: no incoming call')
    })

    it('after accept, receives OFFER and sends ANSWER', async () => {
      receiveIncomingCall()
      cm.accept()

      // Simulate receiving the SDP offer from the initiator
      client.receive({
        type: 'message',
        subtype: CallSubtype.OFFER,
        from: callerPeer,
        data: { type: 'offer', sdp: 'v=0\r\nremote-offer-sdp' }
      })

      // Wait for async recvRemoteSDP
      await vi.waitFor(() => {
        const answerMsg = client.sent.find(m => m.subtype === CallSubtype.ANSWER)
        expect(answerMsg).toBeDefined()
      })

      const answerMsg = client.sent.find(m => m.subtype === CallSubtype.ANSWER)
      expect(answerMsg.data.type).toBe('answer')
      expect(answerMsg.data.sdp).toContain('mock-answer-sdp')
      expect(answerMsg.to).toBe(callerPeer)
    })

    it('forwards ICE candidates to remote peer', async () => {
      receiveIncomingCall()
      cm.accept()

      // Simulate receiving a candidate
      client.receive({
        type: 'message',
        subtype: CallSubtype.CANDIDATE,
        from: callerPeer,
        data: { candidate: 'candidate:1 typ host', sdpMid: '0', sdpMLineIndex: 0 }
      })

      // Should not crash - the mock player accepts candidates silently
    })

    it('auto-rejects if already in a call', () => {
      receiveIncomingCall()
      cm.accept()

      // Second incoming call while connected
      client.clearSent()
      client.receive({
        type: 'message',
        subtype: CallSubtype.INIT,
        from: 'charlie|other-id',
        data: {}
      })

      const rejectMsg = client.sent.find(m => m.subtype === CallSubtype.REJECT)
      expect(rejectMsg).toBeDefined()
      expect(rejectMsg.to).toBe('charlie|other-id')
      expect(rejectMsg.data.reason).toBe('busy')
    })
  })

  describe('hangup', () => {
    const remotePeer = 'bob|remote-socket-id'

    it('sends HANGUP and returns to IDLE', () => {
      cm.call(remotePeer)
      cm.hangup('done')

      const hangupMsg = client.sent.find(m => m.subtype === CallSubtype.HANGUP)
      expect(hangupMsg).toBeDefined()
      expect(hangupMsg.to).toBe(remotePeer)
      expect(hangupMsg.data.reason).toBe('done')
      expect(cm.callState).toBe(CallState.IDLE)
      expect(cm.remotePeerId).toBeNull()
    })

    it('emits ended event', () => {
      const events = []
      cm.on('ended', (peer, reason) => events.push({ peer, reason }))

      cm.call(remotePeer)
      cm.hangup('user')

      expect(events[0]).toEqual({ peer: remotePeer, reason: 'user' })
    })

    it('destroys the player on hangup', async () => {
      cm.call(remotePeer)

      // Accept the call to create a player
      client.receive({
        type: 'message',
        subtype: CallSubtype.ACCEPT,
        from: remotePeer,
        data: {}
      })

      await vi.waitFor(() => expect(cm.player).toBeDefined())

      const player = cm.player
      cm.hangup()

      expect(player.destroyed).toBe(true)
      expect(cm.player).toBeNull()
    })

    it('is a no-op when already idle', () => {
      cm.hangup()
      expect(client.sent).toHaveLength(0)
    })

    it('handles remote hangup', () => {
      const events = []
      cm.on('ended', (peer, reason) => events.push({ peer, reason }))

      cm.call(remotePeer)

      client.receive({
        type: 'message',
        subtype: CallSubtype.HANGUP,
        from: remotePeer,
        data: { reason: 'cancelled' }
      })

      expect(cm.callState).toBe(CallState.IDLE)
      expect(events[0]).toEqual({ peer: remotePeer, reason: 'cancelled' })
    })
  })

  describe('message filtering', () => {
    it('ignores messages without call subtype', () => {
      client.receive({
        type: 'message',
        from: 'bob|123',
        body: 'just a chat message'
      })

      expect(cm.callState).toBe(CallState.IDLE)
    })

    it('ignores messages with non-call subtypes', () => {
      client.receive({
        type: 'message',
        subtype: 'custom:thing',
        from: 'bob|123',
        data: {}
      })

      expect(cm.callState).toBe(CallState.IDLE)
    })
  })

  describe('destroy', () => {
    it('hangs up and unbinds from client', () => {
      const remotePeer = 'bob|123'
      cm.call(remotePeer)
      cm.destroy()

      expect(cm.callState).toBe(CallState.IDLE)

      // Should no longer react to messages
      client.receive({
        type: 'message',
        subtype: CallSubtype.INIT,
        from: 'alice|456',
        data: {}
      })

      expect(cm.callState).toBe(CallState.IDLE)
    })
  })
})

describe('CallSubtype', () => {
  it('has all required subtypes', () => {
    expect(CallSubtype.INIT).toBe('call:init')
    expect(CallSubtype.ACCEPT).toBe('call:accept')
    expect(CallSubtype.REJECT).toBe('call:reject')
    expect(CallSubtype.OFFER).toBe('call:offer')
    expect(CallSubtype.ANSWER).toBe('call:answer')
    expect(CallSubtype.CANDIDATE).toBe('call:candidate')
    expect(CallSubtype.HANGUP).toBe('call:hangup')
  })
})

describe('CallState', () => {
  it('has all required states', () => {
    expect(CallState.IDLE).toBe('idle')
    expect(CallState.RINGING).toBe('ringing')
    expect(CallState.INCOMING).toBe('incoming')
    expect(CallState.CONNECTING).toBe('connecting')
    expect(CallState.ACTIVE).toBe('active')
    expect(CallState.ENDED).toBe('ended')
  })
})
