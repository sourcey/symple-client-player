import { Emitter, Symple } from 'symple-client'
import WebRTCPlayer from './webrtc.js'

// Call signalling subtypes sent over symple messaging.
export const CallSubtype = {
  INIT: 'call:init',       // Caller wants to start a call
  ACCEPT: 'call:accept',   // Callee accepts the call
  REJECT: 'call:reject',   // Callee rejects the call
  OFFER: 'call:offer',     // SDP offer
  ANSWER: 'call:answer',   // SDP answer
  CANDIDATE: 'call:candidate', // ICE candidate
  HANGUP: 'call:hangup'    // Either side ends the call
}

// Call states.
export const CallState = {
  IDLE: 'idle',
  RINGING: 'ringing',      // Outgoing call initiated, waiting for accept
  INCOMING: 'incoming',    // Incoming call received, waiting for user action
  CONNECTING: 'connecting', // Call accepted, WebRTC negotiation in progress
  ACTIVE: 'active',        // Media flowing
  ENDED: 'ended'
}

// Manages call signalling over a SympleClient connection.
//
// Integrates WebRTCPlayer with SympleClient messaging to provide
// a complete call flow: init -> accept/reject -> offer/answer/candidate -> hangup.
//
// Usage:
//   const client = new SympleClient({ ... })
//   const calls = new CallManager(client, document.getElementById('video'))
//
//   // Make a call
//   calls.call('bob|socket-id')
//
//   // Handle incoming calls
//   calls.on('incoming', (peerId, message) => {
//     calls.accept()  // or calls.reject()
//   })
//
//   // End call
//   calls.hangup()
//
// Events:
//   'incoming' (peerId, message) - incoming call received
//   'ringing' (peerId) - outgoing call initiated
//   'accepted' (peerId) - call accepted by remote
//   'rejected' (peerId, reason) - call rejected by remote
//   'connecting' (peerId) - WebRTC negotiation started
//   'active' (peerId) - media flowing
//   'ended' (peerId, reason) - call ended
//   'error' (error) - call error
//   'localstream' (MediaStream) - local media acquired
//   'remotestream' (MediaStream) - remote media received
export default class CallManager extends Emitter {
  constructor (client, videoElement, options = {}) {
    super()

    if (!client) throw new Error('SympleClient instance required')
    if (!videoElement) throw new Error('Video element required')

    this.client = client
    this.videoElement = videoElement
    this.options = {
      rtcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      },
      mediaConstraints: {
        audio: true,
        video: true
      },
      ...options
    }

    this.player = null
    this.callState = CallState.IDLE
    this.remotePeerId = null
    this._callOptions = null

    this._bindClientMessages()
  }

  // Start an outgoing call to a peer.
  call (peerId, options = {}) {
    if (this.callState !== CallState.IDLE) {
      throw new Error('Cannot start call: already in state ' + this.callState)
    }

    Symple.log('symple:call: initiating call to', peerId)
    this.remotePeerId = peerId
    this._callOptions = options
    this._setCallState(CallState.RINGING)

    this._send(CallSubtype.INIT, peerId)
    this.emit('ringing', peerId)
  }

  // Accept an incoming call.
  async accept () {
    if (this.callState !== CallState.INCOMING) {
      throw new Error('Cannot accept: no incoming call')
    }

    Symple.log('symple:call: accepting call from', this.remotePeerId)
    this._setCallState(CallState.CONNECTING)

    // Tell the caller we accept.
    this._send(CallSubtype.ACCEPT, this.remotePeerId)

    // Create the player as non-initiator (we will receive an offer).
    this._createPlayer(false)

    this.emit('connecting', this.remotePeerId)
  }

  // Reject an incoming call.
  reject (reason) {
    if (this.callState !== CallState.INCOMING) {
      throw new Error('Cannot reject: no incoming call')
    }

    Symple.log('symple:call: rejecting call from', this.remotePeerId)
    this._send(CallSubtype.REJECT, this.remotePeerId, { reason: reason || 'declined' })
    this._endCall('rejected')
  }

  // End the current call.
  hangup (reason) {
    if (this.callState === CallState.IDLE || this.callState === CallState.ENDED) return

    Symple.log('symple:call: hanging up', this.remotePeerId)
    if (this.remotePeerId) {
      this._send(CallSubtype.HANGUP, this.remotePeerId, { reason: reason || 'hangup' })
    }
    this._endCall(reason || 'hangup')
  }

  // Mute/unmute outgoing audio.
  muteAudio (flag) {
    if (this.player) this.player.muteAudio(flag)
  }

  // Mute/unmute outgoing video.
  muteVideo (flag) {
    if (this.player) this.player.muteVideo(flag)
  }

  // Mute/unmute incoming audio.
  mute (flag) {
    if (this.player) this.player.mute(flag)
  }

  destroy () {
    this.hangup('destroyed')
    this._unbindClientMessages()
  }

  // --- Private ---

  _bindClientMessages () {
    // Listen for symple messages with call subtypes.
    this._messageHandler = (m) => this._onMessage(m)
    this.client.on('message', this._messageHandler)
  }

  _unbindClientMessages () {
    if (this._messageHandler) {
      this.client.off('message', this._messageHandler)
      this._messageHandler = null
    }
  }

  _onMessage (m) {
    if (!m.subtype || !m.subtype.startsWith('call:')) return

    // Resolve peerId from the message sender.
    // m.from may be a peer object (resolved by symple-client) or an address string.
    const peerId = typeof m.from === 'object'
      ? Symple.buildAddress(m.from)
      : m.from

    Symple.log('symple:call: received', m.subtype, 'from', peerId)

    switch (m.subtype) {
      case CallSubtype.INIT:
        this._onCallInit(peerId, m)
        break
      case CallSubtype.ACCEPT:
        this._onCallAccept(peerId, m)
        break
      case CallSubtype.REJECT:
        this._onCallReject(peerId, m)
        break
      case CallSubtype.OFFER:
        this._onOffer(peerId, m)
        break
      case CallSubtype.ANSWER:
        this._onAnswer(peerId, m)
        break
      case CallSubtype.CANDIDATE:
        this._onCandidate(peerId, m)
        break
      case CallSubtype.HANGUP:
        this._onHangup(peerId, m)
        break
    }
  }

  _onCallInit (peerId, m) {
    if (this.callState !== CallState.IDLE) {
      // Already in a call - auto-reject.
      this._send(CallSubtype.REJECT, peerId, { reason: 'busy' })
      return
    }

    this.remotePeerId = peerId
    this._setCallState(CallState.INCOMING)
    this.emit('incoming', peerId, m)
  }

  async _onCallAccept (peerId, m) {
    if (this.callState !== CallState.RINGING || peerId !== this.remotePeerId) return

    Symple.log('symple:call: remote accepted')
    this._setCallState(CallState.CONNECTING)
    this.emit('accepted', peerId)

    // We are the initiator - create player and start WebRTC negotiation.
    this._createPlayer(true)

    try {
      await this.player.play()
    } catch (err) {
      Symple.log('symple:call: play error', err)
      this.emit('error', err)
      this.hangup('error')
    }
  }

  _onCallReject (peerId, m) {
    if (this.callState !== CallState.RINGING || peerId !== this.remotePeerId) return

    Symple.log('symple:call: remote rejected', m.data?.reason)
    this.emit('rejected', peerId, m.data?.reason)
    this._endCall('rejected')
  }

  async _onOffer (peerId, m) {
    if (peerId !== this.remotePeerId) return
    if (!this.player) return

    try {
      await this.player.recvRemoteSDP(m.data)
    } catch (err) {
      Symple.log('symple:call: offer error', err)
      this.emit('error', err)
    }
  }

  async _onAnswer (peerId, m) {
    if (peerId !== this.remotePeerId) return
    if (!this.player) return

    try {
      await this.player.recvRemoteSDP(m.data)
    } catch (err) {
      Symple.log('symple:call: answer error', err)
      this.emit('error', err)
    }
  }

  async _onCandidate (peerId, m) {
    if (peerId !== this.remotePeerId) return
    if (!this.player) return

    try {
      await this.player.recvRemoteCandidate(m.data)
    } catch (err) {
      Symple.log('symple:call: candidate error', err)
    }
  }

  _onHangup (peerId, m) {
    if (peerId !== this.remotePeerId) return

    Symple.log('symple:call: remote hung up', m.data?.reason)
    this._endCall(m.data?.reason || 'remote hangup')
  }

  _createPlayer (initiator) {
    if (this.player) {
      this.player.destroy()
    }

    this.player = new WebRTCPlayer(this.videoElement, {
      initiator,
      rtcConfig: this.options.rtcConfig,
      mediaConstraints: this._callOptions?.mediaConstraints || this.options.mediaConstraints,
      localMedia: this._callOptions?.localMedia ?? (this.options.localMedia !== false)
    })

    // Wire player events to symple messaging.
    this.player.on('sdp', (desc) => {
      const subtype = desc.type === 'offer' ? CallSubtype.OFFER : CallSubtype.ANSWER
      this._send(subtype, this.remotePeerId, {
        type: desc.type,
        sdp: desc.sdp
      })
    })

    this.player.on('candidate', (candidate) => {
      this._send(CallSubtype.CANDIDATE, this.remotePeerId, {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex
      })
    })

    this.player.on('state', (state) => {
      if (state === 'playing' && this.callState !== CallState.ACTIVE) {
        this._setCallState(CallState.ACTIVE)
        this.emit('active', this.remotePeerId)
      }
    })

    this.player.on('localstream', (stream) => {
      this.emit('localstream', stream)
    })

    this.player.on('remotestream', (stream) => {
      this.emit('remotestream', stream)
    })

    this.player.on('state', (state, message) => {
      if (state === 'error') {
        this.emit('error', new Error(message))
      }
    })
  }

  _endCall (reason) {
    const peerId = this.remotePeerId

    if (this.player) {
      this.player.destroy()
      this.player = null
    }

    this.remotePeerId = null
    this._callOptions = null
    this._setCallState(CallState.ENDED)
    this.emit('ended', peerId, reason)

    // Reset to idle so a new call can happen.
    this.callState = CallState.IDLE
  }

  _setCallState (state) {
    Symple.log('symple:call: state', this.callState, '=>', state)
    this.callState = state
  }

  // Send a call signalling message via the symple client.
  _send (subtype, to, data) {
    this.client.send({
      type: 'message',
      subtype,
      data: data || {}
    }, to)
  }
}
