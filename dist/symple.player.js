//
// Symple.Player.js
// Media Player for the Symple Messaging Client
//
// Copyright (c)2010 Sourcey
// http://sourcey.com
// Distributed under The MIT License.
//
(function (S) {

  // Symple Player
  //
  // The abstract base class for all player implementations
  S.Player = S.Emitter.extend({
    init: function (element, options) {
      this._super()
      this.options = S.extend({

        // Default HTML template
        template: '\
                <div class="symple-player">\
                    <div class="symple-player-message"></div>\
                    <div class="symple-player-status"></div>\
                    <div class="symple-player-loading"></div>\
                    <div class="symple-player-screen"></div>\
                    <div class="symple-player-controls">\
                        <a class="play-btn" rel="play" href="#">Play</a>\
                        <a class="stop-btn" rel="stop" href="#">Stop</a>\
                        <a class="fullscreen-btn" rel="fullscreen" href="#">Fullscreen</a>\
                    </div>\
                </div>'
      }, options)

      this.element = element
      if (!S.hasClass(this.element, 'symple-player')) {
        this.element.innerHTML = this.options.template
      }
      if (!this.element) { throw 'Player element not found' }

      this.screen = this.element.getElementsByClassName('symple-player-screen')[0]
      if (!this.screen) { throw 'Player screen element not found' }

      this.message = this.element.getElementsByClassName('symple-player-message')[0]
      if (!this.message) { throw 'Player message element not found' }

      this.setup()
      this.bind()
    },

    setup: function () {
      // virtual
    },

    //
    // Player Controls
    //

    play: function (params) {
      // virtual
      this.setState('playing')
    },

    stop: function () {
      // virtual
      this.setState('stopped')
    },

    destroy: function () {
      // virtual
    },

    mute: function (flag) {
      // virtual
    },

    setError: function (state, message) {
      this.setState('error', message)
    },

    setState: function (state, message) {
      S.log('symple:player: set state', this.state, '<=>', state)
      if (this.state === state) { return false }

      this.state = state
      this.displayStatus(null)
      this.playing = state === 'playing'
      if (message) {
        this.displayMessage(state === 'error' ? 'error' : 'info', message)
      } else {
        this.displayMessage(null)
      }

      // this.element.removeClass('state-stopped state-loading state-playing state-paused state-error')
      // this.element.addClass('state-' + state)
      this.emit('state', state, message)
    },

    //
    // Helpers

    displayStatus: function (data) {
      var status = this.element.getElementsByClassName('symple-player-status')[0]
      if (status) {
        status.innerHTML = data || ''
      }
    },

    // Display an overlayed player message.
    // Type may be one of: error, warning, info
    displayMessage: function (type, message) {
      S.log('symple:player: display message', type, message)
      if (message) {
        this.message.innerHTML = '<p class="' + type + '-message">' + message + '</p>'
        this.message.style.display = 'block'
      } else {
        this.message.style.display = 'none'
      }
    },

    bind: function () {
      var self = this
      this.element.addEventListener('loaded', function () {
        self.onAction(this.rel, this)
        return false
      })
    },

    onAction: function (action, element) {
      switch (action) {
        case 'play':
          this.play()
          break
        case 'stop':
          this.stop()
          break
        case 'mute':
          this.mute(true)
          break
        case 'unmute':
          this.mute(false)
          break
        case 'fullscreen':
          this.toggleFullScreen()
          break
        default:
          this.emit('action', action, element)
          break
      }
    },

    // Toggle actual player element
    toggleFullScreen: function () {
      var fullscreenElement = this.options.fullscreenElement || this.element
      if (S.runVendorMethod(document, 'FullScreen') || S.runVendorMethod(document, 'IsFullScreen')) {
        S.runVendorMethod(document, 'CancelFullScreen')
      } else {
        S.runVendorMethod(fullscreenElement, 'RequestFullScreen')
      }
    }
  })

  // Player Engine Factory
  //
  // This factory is used to select and instantiate the best engine for the
  // current platform depending on supported formats and availability.
  S.Media = {
    engines: {}, // Object containing references for candidate selection

    register: function (engine) {
      S.log('symple:media: register media engine: ', engine)
      if (!engine.name || typeof engine.preference === 'undefined' || typeof engine.support === 'undefined') {
        S.log('symple:media: cannot register invalid engine', engine)
        return false
      }
      this.engines[engine.id] = engine
      return true
    },

    has: function (id) {
      return typeof this.engines[id] === 'object'
    },

    // Checks support for a given engine
    supports: function (id) {
      // Check support for engine
      return !!(this.has(id) && this.engines[id].support)
    },

    // Checks support for a given format
    supportsFormat: function (format) {
      // Check support for engine
      return !!preferredEngine(format)
    },

    // Returns a list of compatible engines sorted by preference
    // The optional format argument further filters by engines
    // which don't support the given media format.
    compatibleEngines: function (format) {
      var arr = [], engine
      // Reject non supported or disabled
      for (var item in this.engines) {
        engine = this.engines[item]
        if (engine.preference === 0) { continue }
        S.log('symple:media: supported', engine.name, engine.support)
        if (engine.support === true) { arr.push(engine) }
      }
      // Sort by preference
      arr.sort(function (a, b) {
        if (a.preference < b.preference) return 1
        if (a.preference > b.preference) return -1
      })
      return arr
    },

    // Returns the highest preference compatible engine
    // The optional format argument further filters by engines
    // which don't support the given media format.
    preferredEngine: function (format) {
      var arr = this.compatibleEngines(format)
      var engine = arr.length ? arr[0] : null
      S.log('symple:media: preferred engine', engine)
      return engine
    },

    // Build URLs for the Player
    buildURL: function(params) {
        var query = [], url, addr = params.address;
        url = addr.scheme + '://' + addr.host + ':' + addr.port + (addr.uri ? addr.uri : '/');
        for (var p in params) {
            if (p == 'address')
                continue;
            query.push(encodeURIComponent(p) + "=" + encodeURIComponent(params[p]));
        }
        query.push('rand=' + Math.random());
        url += '?';
        url += query.join("&");
        return url;
    }
  }
})(window.Symple = window.Symple || {})
;
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
