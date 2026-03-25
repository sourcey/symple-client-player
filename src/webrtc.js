import { Symple } from 'symple-client'
import Player from './player.js'
import Media from './media.js'

// Register the WebRTC engine.
Media.register({
  id: 'WebRTC',
  name: 'WebRTC Player',
  formats: 'VP8, VP9, H.264, H.265, AV1, Opus',
  preference: 100,
  support: typeof RTCPeerConnection !== 'undefined'
})

// WebRTC player engine.
//
// Uses the modern WebRTC API:
//  - navigator.mediaDevices.getUserMedia (promise-based)
//  - RTCPeerConnection with addTrack/ontrack (not addStream/onaddstream)
//  - video.srcObject (not URL.createObjectURL)
//  - Unified Plan SDP semantics
//  - Trickle ICE with candidate buffering
//
// Emits:
//  - 'sdp' (RTCSessionDescription) - local SDP ready to send to peer
//  - 'candidate' (RTCIceCandidate) - local ICE candidate ready to send
//  - 'state' (string, message?) - player state change
//  - 'localstream' (MediaStream) - local media stream acquired
//  - 'remotestream' (MediaStream) - remote media stream received
//  - 'icestate' (RTCIceConnectionState) - ICE connection state change
export default class WebRTCPlayer extends Player {
  constructor (element, options = {}) {
    // The active local or remote media stream
    const defaults = {
      // Whether this peer initiates the call (sends SDP offer).
      initiator: true,

      // RTCConfiguration for the RTCPeerConnection.
      rtcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      },

      // MediaStreamConstraints for getUserMedia.
      mediaConstraints: {
        audio: true,
        video: true
      },

      // Whether to acquire local media automatically on play().
      // Set false for receive-only mode.
      localMedia: true
    }

    super(element, { ...defaults, ...options })

    this.localStream = null
    this.remoteStream = null
    this.pc ??= null

    // Buffer ICE candidates that arrive before remote description is set.
    this._pendingCandidates = []
    this._remoteDescriptionSet = false
  }

  setup () {
    Symple.log('symple:webrtc: setup')
    this._createPeerConnection()

    if (!this.video) {
      this.video = document.createElement('video')
      this.video.autoplay = true
      this.video.playsInline = true
      this.video.muted = false
      this.screen.appendChild(this.video)
    }
  }

  destroy () {
    Symple.log('symple:webrtc: destroy')

    this._stopStream(this.localStream)
    this.localStream = null

    this._stopStream(this.remoteStream)
    this.remoteStream = null

    if (this.video) {
      this.video.srcObject = null
      this.video = null
    }

    if (this.pc) {
      this.pc.close()
      this.pc = null
    }

    this._pendingCandidates = []
    this._remoteDescriptionSet = false

    this.setState('stopped')
  }

  async play (params) {
    Symple.log('symple:webrtc: play', params)

    // If we already have a remote stream, just re-attach it.
    if (this.remoteStream) {
      this.video.srcObject = this.remoteStream
      this.setState('playing')
      return
    }

    this.setState('loading')

    if (this.options.initiator && this.options.localMedia) {
      try {
        await this._acquireLocalMedia()
        await this._createOffer()
      } catch (err) {
        this.setError('Failed to start call: ' + err.message)
      }
    }
  }

  stop () {
    Symple.log('symple:webrtc: stop')

    // Stop does not close the peer connection (allows quick resume).
    if (this.video) {
      this.video.srcObject = null
    }

    this.setState('stopped')
  }

  mute (flag) {
    flag = flag !== false
    Symple.log('symple:webrtc: mute', flag)
    if (this.video) this.video.muted = flag
  }

  // Mute/unmute outgoing audio track.
  muteAudio (flag) {
    flag = flag !== false
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !flag
      }
    }
  }

  // Mute/unmute outgoing video track.
  muteVideo (flag) {
    flag = flag !== false
    if (this.localStream) {
      for (const track of this.localStream.getVideoTracks()) {
        track.enabled = !flag
      }
    }
  }

  // Called when remote SDP is received from the peer.
  async recvRemoteSDP (desc) {
    Symple.log('symple:webrtc: recv remote sdp', desc)
    if (!desc || !desc.type || !desc.sdp) throw new Error('Invalid remote SDP')
    if (!this.pc) throw new Error('Peer connection not initialized')

    try {
      await this.pc.setRemoteDescription(new RTCSessionDescription(desc))
      this._remoteDescriptionSet = true

      // Flush any ICE candidates that arrived before the remote description.
      await this._flushPendingCandidates()

      if (desc.type === 'offer') {
        // Non-initiator: acquire local media if needed, then create answer.
        if (this.options.localMedia && !this.localStream) {
          await this._acquireLocalMedia()
        }
        await this._createAnswer()
      }
    } catch (err) {
      Symple.log('symple:webrtc: remote sdp error', err)
      this.setError('Cannot process remote SDP: ' + err.message)
    }
  }

  // Called when a remote ICE candidate is received from the peer.
  async recvRemoteCandidate (candidate) {
    Symple.log('symple:webrtc: recv remote candidate', candidate)
    if (!this.pc) throw new Error('Peer connection not initialized')

    if (!this._remoteDescriptionSet) {
      // Buffer candidates until remote description is set.
      Symple.log('symple:webrtc: buffering candidate (no remote description yet)')
      this._pendingCandidates.push(candidate)
      return
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (err) {
      Symple.log('symple:webrtc: failed to add ice candidate', err)
    }
  }

  // --- Private ---

  async _acquireLocalMedia () {
    Symple.log('symple:webrtc: acquiring local media', this.options.mediaConstraints)

    const stream = await navigator.mediaDevices.getUserMedia(this.options.mediaConstraints)
    this.localStream = stream

    // Add each track to the peer connection.
    for (const track of stream.getTracks()) {
      this.pc.addTrack(track, stream)
    }

    // Show local preview (muted to prevent echo).
    if (this.options.initiator) {
      this.video.srcObject = stream
      this.video.muted = true
    }

    this.emit('localstream', stream)
  }

  async _createOffer () {
    Symple.log('symple:webrtc: creating offer')
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    Symple.log('symple:webrtc: offer created', offer)
    this.emit('sdp', this.pc.localDescription)
  }

  async _createAnswer () {
    Symple.log('symple:webrtc: creating answer')
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)
    Symple.log('symple:webrtc: answer created', answer)
    this.emit('sdp', this.pc.localDescription)
  }

  async _flushPendingCandidates () {
    while (this._pendingCandidates.length > 0) {
      const candidate = this._pendingCandidates.shift()
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (err) {
        Symple.log('symple:webrtc: failed to add buffered candidate', err)
      }
    }
  }

  _createPeerConnection () {
    if (this.pc) throw new Error('Peer connection already initialized')
    Symple.log('symple:webrtc: creating peer connection', this.options.rtcConfig)

    this.pc = new RTCPeerConnection(this.options.rtcConfig)

    // ICE candidate gathering.
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        Symple.log('symple:webrtc: ice candidate gathered', event.candidate)
        this.emit('candidate', event.candidate)
      } else {
        Symple.log('symple:webrtc: ice candidate gathering complete')
      }
    }

    // Remote track received (modern replacement for onaddstream).
    this.pc.ontrack = (event) => {
      Symple.log('symple:webrtc: remote track received', event.track.kind)

      // Use the first stream associated with the track.
      const stream = event.streams[0]
      if (stream && stream !== this.remoteStream) {
        this.remoteStream = stream
        this.video.srcObject = stream
        this.video.muted = false
        this.setState('playing')
        this.emit('remotestream', stream)
      }
    }

    // ICE connection state changes.
    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc.iceConnectionState
      Symple.log('symple:webrtc: ice connection state:', state)
      this.emit('icestate', state)

      switch (state) {
        case 'connected':
        case 'completed':
          if (!this.playing) this.setState('playing')
          break
        case 'disconnected':
          this.setState('stopped', 'Peer disconnected')
          break
        case 'failed':
          this.setError('ICE connection failed')
          break
        case 'closed':
          this.setState('stopped')
          break
      }
    }

    // Connection state changes (broader than ICE).
    this.pc.onconnectionstatechange = () => {
      Symple.log('symple:webrtc: connection state:', this.pc.connectionState)
      if (this.pc.connectionState === 'failed') {
        this.setError('Peer connection failed')
      }
    }
  }

  _stopStream (stream) {
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop()
      }
    }
  }
}

// Helper to determine ICE candidate type from SDP.
export function iceCandidateType (candidateSDP) {
  if (candidateSDP.indexOf('typ relay') !== -1) return 'turn'
  if (candidateSDP.indexOf('typ srflx') !== -1) return 'stun'
  if (candidateSDP.indexOf('typ host') !== -1) return 'host'
  return 'unknown'
}
