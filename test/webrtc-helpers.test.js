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
  let savedRTCIceCandidate
  let savedMediaStream

  beforeEach(() => {
    savedDocument = globalThis.document
    savedNavigator = globalThis.navigator
    savedRTCPeerConnection = globalThis.RTCPeerConnection
    savedRTCIceCandidate = globalThis.RTCIceCandidate
    savedMediaStream = globalThis.MediaStream

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
        this.candidates = []
        this.transceivers = []
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

      async addIceCandidate (candidate) {
        this.candidates.push(candidate)
      }

      addTransceiver (kind, options) {
        this.transceivers.push({ kind, options })
      }

      close () {}
    }

    globalThis.RTCIceCandidate = class {
      constructor (init) {
        Object.assign(this, init)
      }
    }

    globalThis.MediaStream = class {
      constructor () {
        this._tracks = []
      }

      addTrack (track) {
        this._tracks.push(track)
      }

      getTracks () {
        return this._tracks
      }
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

    if (typeof savedRTCIceCandidate === 'undefined') {
      delete globalThis.RTCIceCandidate
    } else {
      globalThis.RTCIceCandidate = savedRTCIceCandidate
    }

    if (typeof savedMediaStream === 'undefined') {
      delete globalThis.MediaStream
    } else {
      globalThis.MediaStream = savedMediaStream
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

  it('normalizes libdatachannel remote candidates before adding them', async () => {
    const element = createMockElement()
    element._setupTemplate()

    const player = new WebRTCPlayer(element, {
      initiator: false,
      localMedia: false
    })

    player._remoteDescriptionSet = true

    await player.recvRemoteCandidate({
      candidate: 'a=candidate:1 1 UDP 2114977791 10.0.2.15 39682 typ host',
      sdpMid: '0'
    })

    expect(player.pc.candidates).toHaveLength(1)
    expect(player.pc.candidates[0].candidate).toBe(
      'candidate:1 1 UDP 2114977791 10.0.2.15 39682 typ host'
    )
  })

  it('creates recvonly transceivers for initiator receive-only calls', async () => {
    const element = createMockElement()
    element._setupTemplate()

    const player = new WebRTCPlayer(element, {
      initiator: true,
      localMedia: false,
      mediaConstraints: {
        audio: true,
        video: true
      }
    })

    await player.play()

    expect(player.pc.tracks).toHaveLength(0)
    expect(player.pc.transceivers).toEqual([
      { kind: 'audio', options: { direction: 'recvonly' } },
      { kind: 'video', options: { direction: 'recvonly' } }
    ])
    expect(player.pc.localDescription.type).toBe('offer')
  })

  it('builds a remote stream from track-only ontrack events', () => {
    const element = createMockElement()
    element._setupTemplate()

    const player = new WebRTCPlayer(element, {
      initiator: false,
      localMedia: false
    })

    const remoteEvents = []
    player.on('remotestream', (stream) => remoteEvents.push(stream))

    const videoTrack = { id: 'video-1', kind: 'video' }
    const audioTrack = { id: 'audio-1', kind: 'audio' }

    player.pc.ontrack({ track: videoTrack, streams: [] })
    player.pc.ontrack({ track: audioTrack, streams: [] })

    expect(player.remoteStream).toBeTruthy()
    expect(player.video.srcObject).toBe(player.remoteStream)
    expect(player.remoteStream.getTracks()).toEqual([videoTrack, audioTrack])
    expect(remoteEvents).toHaveLength(1)
    expect(player.state).toBe('playing')
  })

  it('uses a direct video element as the playback target', () => {
    const videoElement = {
      tagName: 'VIDEO',
      parentElement: {
        appendChild () {}
      },
      classList: {
        contains: () => false
      },
      addEventListener () {},
      autoplay: false,
      playsInline: false,
      muted: false,
      srcObject: null
    }

    const player = new WebRTCPlayer(videoElement, {
      initiator: false,
      localMedia: false
    })

    expect(player.video).toBe(videoElement)
    expect(player.video.autoplay).toBe(true)
    expect(player.video.playsInline).toBe(true)
  })
})
