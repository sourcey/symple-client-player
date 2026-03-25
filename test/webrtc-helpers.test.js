import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import WebRTCPlayer, { iceCandidateType } from '../src/webrtc.js'
import { createMockElement } from './helpers.js'

describe('iceCandidateType', () => {
  it('identifies TURN relay candidates', () => {
    expect(iceCandidateType('candidate:1 1 udp 5000 1.2.3.4 12345 typ relay raddr 10.0.0.1 rport 54321')).toBe('turn')
  })

  it('identifies STUN server-reflexive candidates', () => {
    expect(iceCandidateType('candidate:2 1 udp 100 203.0.113.1 54321 typ srflx raddr 10.0.0.1 rport 12345')).toBe('stun')
  })

  it('identifies host candidates', () => {
    expect(iceCandidateType('candidate:3 1 udp 2130706431 192.168.1.1 12345 typ host')).toBe('host')
  })

  it('returns unknown for unrecognised candidate', () => {
    expect(iceCandidateType('')).toBe('unknown')
    expect(iceCandidateType('something random')).toBe('unknown')
  })

  it('handles candidates with typ relay taking priority', () => {
    // relay should match first even if other keywords are present
    expect(iceCandidateType('typ relay typ host')).toBe('turn')
  })
})

describe('WebRTCPlayer', () => {
  let savedDocument
  let savedNavigator
  let savedRTCPeerConnection

  beforeEach(() => {
    savedDocument = globalThis.document
    savedNavigator = globalThis.navigator
    savedRTCPeerConnection = globalThis.RTCPeerConnection

    globalThis.document = {
      createElement: () => ({
        autoplay: false,
        playsInline: false,
        muted: false,
        srcObject: null
      })
    }

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          getUserMedia: vi.fn(async () => ({
            getTracks: () => [
              {
                kind: 'audio',
                enabled: true,
                stop () {}
              }
            ]
          }))
        }
      }
    })

    globalThis.RTCPeerConnection = class {
      constructor () {
        this.tracks = []
        this.localDescription = null
        this.iceConnectionState = 'new'
        this.connectionState = 'new'
      }

      addTrack (track, stream) {
        this.tracks.push({ track, stream })
      }

      async createOffer () {
        return { type: 'offer', sdp: 'v=0\r\nmock-offer' }
      }

      async setLocalDescription (desc) {
        this.localDescription = desc
      }

      close () {}
    }
  })

  afterEach(() => {
    globalThis.document = savedDocument

    if (typeof savedNavigator === 'undefined') {
      delete globalThis.navigator
    } else {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: savedNavigator
      })
    }

    if (typeof savedRTCPeerConnection === 'undefined') {
      delete globalThis.RTCPeerConnection
    } else {
      globalThis.RTCPeerConnection = savedRTCPeerConnection
    }
  })

  it('retains the peer connection created during setup for outgoing play', async () => {
    const element = createMockElement()
    element._setupTemplate()

    const player = new WebRTCPlayer(element, {
      initiator: true,
      localMedia: true,
      mediaConstraints: {
        audio: true,
        video: false
      }
    })

    expect(player.pc).toBeTruthy()

    await player.play()

    expect(player.pc).toBeTruthy()
    expect(player.pc.tracks).toHaveLength(1)
    expect(player.pc.localDescription.type).toBe('offer')
  })
})
