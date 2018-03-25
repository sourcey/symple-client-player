//
// Symple.WebRTC.js
// WebRTC Player Engine for Symple
//
// Copyright (c)2010 Sourcey
// http://sourcey.com
// Distributed under The MIT License.
//
(function (S) {
  window.RTCPeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection
  window.RTCSessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription
  window.RTCIceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate
  window.URL = window.webkitURL || window.URL
  navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia

  S.Media.register({
    id: 'WebRTC',
    name: 'WebRTC Player',
    formats: 'VP9, VP4, H.264, Opus',
    preference: 100,
    support: (function () {
      return typeof RTCPeerConnection !== 'undefined'
    })()
  })

  S.Player.WebRTC = S.Player.extend({
    init: function (element, options) {
      S.log('symple:webrtc: init')

      // Reference to the active local or remote media stream
      this.stream = null

      this._super(element, S.extend({

        // Specifies that this client will be the ICE initiator,
        // and will be sending the initial SDP Offer.
        initiator: true,

        // The `RTCConfiguration` dictionary for the `RTCPeerConnection`
        rtcConfig: {
          iceServers: [
            { url: 'stun:stun.l.google.com:19302' }
          ]
        },

        // The `MediaStreamConstraints` object to pass to `getUserMedia`
        userMediaConstraints: {
          audio: true,
          video: true
        },

        // The `RTCAnswerOptions` dictionary for creating the SDP offer/answer
        sdpConstraints: {
          'mandatory': {
            'OfferToReceiveAudio': true,
            'OfferToReceiveVideo': true
          }
        }
      }, options))
    },

    setup: function () {
      S.log('symple:webrtc: setup')

      this._createPeerConnection()

      if (typeof (this.video) === 'undefined') {
        this.video = document.createElement('video')
        this.video.autoplay = true
        this.screen.appendChild(this.video)
      }
    },

    destroy: function () {
      S.log('symple:webrtc: destroy')

      if (this.stream) {
        // localStream.stop() is deprecated in Chrome 45, removed in Chrome 47
        if (!this.stream.stop && this.stream.getTracks) {
          this.stream.stop = function () {
            this.getTracks().forEach(function (track) {
              track.stop()
            })
          }
        }
        this.stream.stop()
        this.stream = null
      }

      if (this.video) {
        this.video.src = ''
        this.video = null
        // Anything else required for video cleanup?
      }

      if (this.pc) {
        this.pc.close()
        this.pc = null
        // Anything else required for peer connection cleanup?
      }
    },

    play: function (params) {
      S.log('symple:webrtc: play', params)

      // If there is an active stream then play it now.
      if (this.stream) {
        this.video.src = URL.createObjectURL(this.stream)
        this.video.play()
        this.setState('playing')
        return
      }

      // Otherwise wait until ICE to complete before setting the 'playing' state.
      this.setState('loading')

      // If we are the ICE `initiator` then attempt to open the local video
      // device and send the SDP Offer to the peer.
      if (this.options.initiator) {
        var self = this

        // TODO: Support device enumeration.
        S.log('symple:webrtc: initiating', this.options.userMediaConstraints)
        navigator.getUserMedia(this.options.userMediaConstraints,
                      function (localStream) { // success
                        // Play the local video stream and create the SDP offer.
                        self.video.src = URL.createObjectURL(localStream)
                        self.pc.addStream(localStream)
                        self.pc.createOffer(
                              function (desc) { // success
                                S.log('symple:webrtc: offer', desc)
                                self._onLocalSDP(desc)
                              },
                              function (error) { // failure
                                S.log('symple:webrtc: offer failed', error)
                              })

                        // Store the active local stream
                        self.stream = localStream
                      },
                      function (error) { // failure
                        self.setError('getUserMedia() failed: ' + error)
                      })
      }
    },

    stop: function () {
      // NOTE: Stopping the player does not close the peer connection,
      // only `destroy` does that. This enables us to resume playback
      // quickly and with minimal delay.

      if (this.video) {
        this.video.src = ''
        // Do not nullify
      }

      // Close peer connection
      // if (this.pc) {
      //     this.pc.close();
      //     this.pc = null;
      // }

      this.setState('stopped')
    },

    mute: function (flag) {
      // Mute unless explicit false given
      flag = flag !== false
      S.log('symple:webrtc: mute', flag)

      if (this.video) {
        this.video.muted = flag
      }
    },

    // Called when remote SDP is received from the peer.
    recvRemoteSDP: function (desc) {
      S.log('symple:webrtc: recv remote sdp', desc)
      if (!desc || !desc.type || !desc.sdp) { throw 'Invalid remote SDP' }

      var self = this
      this.pc.setRemoteDescription(new RTCSessionDescription(desc),
                  function () {
                    S.log('symple:webrtc: sdp success')
                  },
                  function (error) {
                    console.error('symple:webrtc: sdp error', error)
                    self.setError('Cannot parse remote SDP offer: ' + error)
                  })

      if (desc.type === 'offer') {
        self.pc.createAnswer(
                    function (answer) { // success
                      self._onLocalSDP(answer)
                    },
                    function (error) { // failure
                      console.error('symple:webrtc: answer error', error)
                      self.setError('Cannot create local SDP answer: ' + error)
                    },
                    self.options.sdpConstraints)
      }
    },

    // Called when remote candidate is received from the peer.
    recvRemoteCandidate: function (candidate) {
      S.log('symple:webrtc: recv remote candiate', candidate)
      if (!this.pc) { throw 'The peer connection is not initialized' } // call recvRemoteSDP first

      this.pc.addIceCandidate(new RTCIceCandidate(candidate))
    },

    //
    // Private methods
    //

    // Called when local SDP is ready to be sent to the peer.
    _onLocalSDP: function (desc) {
      try {
        this.pc.setLocalDescription(desc)
        this.emit('sdp', desc)
      } catch (e) {
        S.log('symple:webrtc: failed to send local SDP', e)
      }
    },

    // Create the RTCPeerConnection object.
    _createPeerConnection: function () {
      if (this.pc) { throw 'The peer connection is already initialized' }
      S.log('symple:webrtc: create peer connnection', this.rtcConfig)

      var self = this
      this.pc = new RTCPeerConnection(this.rtcConfig)
      this.pc.onicecandidate = function (event) {
        if (event.candidate) {
          S.log('symple:webrtc: candidate gathered', event.candidate)
          self.emit('candidate', event.candidate)
        } else {
          S.log('symple:webrtc: candidate gathering complete')
        }
      }
      this.pc.onaddstream = function (event) {
        S.log('symple:webrtc: remote stream added', URL.createObjectURL(event.stream))

        // Set the state to playing once candidates have completed gathering.
        // This is the best we can do until ICE onstatechange is implemented.
        self.setState('playing')

        self.video.src = URL.createObjectURL(event.stream)
        self.video.play()

        // Store the active stream
        self.stream = event.stream
      }
      this.pc.onremovestream = function (event) {
        S.log('symple:webrtc: remote stream removed', event)
        self.video.stop()
        self.video.src = ''
      }

      // NOTE: The following state events are still very unreliable.
      // Hopefully when the spec is complete this will change, but until then
      // we need to 'guess' the state.
      // this.pc.onconnecting = function(event) { S.log('symple:webrtc: onconnecting:', event); };
      // this.pc.onopen = function(event) { S.log('symple:webrtc: onopen:', event); };
      // this.pc.onicechange = function(event) { S.log('symple:webrtc: onicechange :', event); };
      // this.pc.onstatechange = function(event) { S.log('symple:webrtc: onstatechange :', event); };
    }
  })

  //
  // Helpers
  //

  S.iceCandidateType = function (candidateSDP) {
    if (candidateSDP.indexOf('typ relay') !== -1) { return 'turn' }
    if (candidateSDP.indexOf('typ srflx') !== -1) { return 'stun' }
    if (candidateSDP.indexOf('typ host') !== -1) { return 'host' }
    return 'unknown'
  }
})(window.Symple = window.Symple || {})
