//
// Symple.Media.js
// Media Player for the Symple Messaging Client
//
// Copyright (c)2010 Sourcey
// http://sourcey.com
// Distributed under The MIT License.
//
(function(S) {
    S.Media = {
        engines: {}, // Object containing references for candidate selection

        registerEngine: function(engine) {
            S.log('symple:media: register media engine: ', engine)
            if (!engine.name || typeof engine.preference == 'undefined' || typeof engine.support == 'undefined') {
                S.log('symple:media: cannot register invalid engine', engine)
                return false;
            }
            this.engines[engine.id] = engine;
            return true;
        },

        hasEngine: function(id) {
            return typeof this.engines[id] == 'object';
        },

        // Checks support for a given engine
        supportsEngine: function(id) {
            // Check support for engine
            return !!(this.hasEngine(id) && this.engines[id].support);
        },

        // Checks support for a given format
        supportsFormat: function(format) {
            // Check support for engine
            return !!preferredEngine(format);
        },

        // Returns a list of compatible engines sorted by preference
        // The optional format argument further filters by engines
        // which don't support the given media format.
        compatibleEngines: function(format) {
            var arr = [], engine;
            // Reject non supported or disabled
            for (var item in this.engines) {
                engine = this.engines[item];
                if (engine.preference == 0)
                    continue;
                S.log('symple:media: supported', engine.name, engine.support)
                if (engine.support == true)
                    arr.push(engine)
            }
            // Sort by preference
            arr.sort(function (a, b) {
                if (a.preference < b.preference) return 1;
                if (a.preference > b.preference) return -1;
            });
            return arr
        },

        // Returns the highest preference compatible engine
        // The optional format argument further filters by engines
        // which don't support the given media format.
        preferredCompatibleEngine: function(format) {
            var arr = this.compatibleEngines(format), engine;
            engine = arr.length ? arr[0] : null;
            S.log('symple:media: preferred engine', engine);
            return engine;
        },

        // Returns the optimal video resolution for the current device
        // TODO: Different aspect ratios
        getOptimalVideoResolution: function() {
            var w = $(window).width();
            var width = w > 800 ?
              800 : w > 640 ?
              640 : w > 480 ?
              400 : w > 320 ?
              320 : w > 240 ?
              240 : w > 160 ?
              160 : w > 128 ?
              128 : 96;
            var height = width * 0.75;
            return [width, height];
        },

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

        },

        // Rescales video dimensions maintaining perspective
        // TODO: Different aspect ratios
        rescaleVideo: function(srcW, srcH, maxW, maxH) {
            //S.log('S.Player: Rescale Video: ', srcW, srcH, maxW, maxH);
            var maxRatio = maxW / maxH;
            var srcRatio = 1.33; //srcW / srcH;
            if (srcRatio < maxRatio) {
                srcH = maxH;
                srcW = srcH * srcRatio;
            } else {
                srcW = maxW;
                srcH = srcW / srcRatio;
            }
            return [srcW, srcH];
        },

        // Basic checking for remote ICE style streaming candidates
        // TODO: Latency checks and best candidate switching
        checkCandidate: function(url, fn) {
            S.log('symple:media: checking candidate: ', url);

            var xhr;
            if (window.XMLHttpRequest) {
                xhr = new XMLHttpRequest();
            } else if (window.ActiveXObject) {
                xhr = new ActiveXObject("Microsoft.XMLHTTP");
            } else {
                fn(url, false);
                return;
            }

            xhr.onreadystatechange = function() {
                if (xhr.readyState == 2) {
                    if (fn) {
                        S.log('symple:media: candidate result: ', xhr.readyState, xhr.status);
                        fn(url, xhr.status == 200);
                        fn = null;

                        // Safari on windows crashes when abort is called from inside
                        // the onreadystatechange callback.
                        setTimeout(function() {
                            xhr.abort();
                        }, 0);
                    }
                }
                else if (xhr.readyState == 4/* && xhr.status != 0*/) {
                    if (fn) {
                        S.log('symple:media: candidate result: ', xhr.readyState, xhr.status);
                        fn(url, /*xhr.status == 200*/true);
                        fn = null;
                    }
                }
            };
            xhr.open('GET', url, true);
            xhr.send(null);
        }
    };

    // ----------------------------------------------------------------------------
    //  Symple.Player
    //
    //  Online video streaming for everyone
    //  Requires jQuery
    //
    S.Player = S.Class.extend({
        init: function(options) {
            this.options = S.extend({ // $.extend
                format:         'MJPEG',      // The media format to use (MJPEG, FLV, Speex, ...)
                engine:         undefined,    // Engine class name, can be specified or auto detected

                htmlRoot:       '/javascripts/symple',
                element:        '.symple-player:first',
                fullscreenElement: undefined,

                // Callbacks
                onCommand:       function(player, cmd) { },
                onStateChange:   function(player, state) { },

                // Markup
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

            }, options);

            this.element = $(this.options.element);
            if (!this.element.hasClass('symple-player')) {
                this.element.html(this.options.template);
                this.element = this.element.children('.symple-player:first');
            }
            if (!this.element.length)
                throw 'Player element not found';

            this.screen = this.element.find('.symple-player-screen');
            if (!this.screen.length)
                throw 'Player screen element not found';

            // Depreciated: Screen is always 100% unless speified otherwise via CSS
            // if (this.options.screenWidth)
            //    this.screen.width(this.options.screenWidth);
            // if (this.options.screenHeight)
            //    this.screen.height(this.options.screenHeight);

            this.message = this.element.find('.symple-player-message')
            if (!this.message.length)
                throw 'Player message element not found';

            // Try to choose the best engine if none was given
            if (typeof this.options.engine  == 'undefined') {
                var engine = S.Media.preferredCompatibleEngine(this.options.format);
                if (engine)
                    this.options.engine = engine.id;
            }

            this.bindEvents();
            this.playing = false;

            // this.setState('stopped');
            // var self = this;
            // $(window).resize(function() {
            //    self.refresh();
            // });
        },

        setup: function() {
            var id = this.options.engine;

            // Ensure the engine is configured
            if (!id)
                throw "Streaming engine not configured. Please set 'options.engine'";

            // Ensure the engine exists
            if (!S.Media.hasEngine(id))
                throw "Streaming engine not available: " + id;
            if (typeof S.Player.Engine[id] == 'undefined')
                throw "Streaming engine not found: " + id;

            // Ensure the engine is supported
            if (!S.Media.supportsEngine(id))
                throw "Streaming engine not supported: " + id;

            // Instantiate the engine
            this.engine = new S.Player.Engine[id](this);
            this.engine.setup();

            this.element.addClass('engine-' + id.toLowerCase())
        },

        //
        // Player Controls
        //
        play: function(params) {
            S.log('symple:player: play', params)
            try {
                if (!this.engine)
                    this.setup();

                if (this.state != 'playing' //&&
                    // The player may be set to loading state by the
                    // outside application before play is called.
                    //this.state != 'loading'
                    ) {
                    this.setState('loading');
                    this.engine.play(params); // engine updates state to playing
                }
            } catch (e) {
                this.setState('error');
                this.displayMessage('error', e)
                throw e;
            }
        },

        stop: function() {
            S.log('symple:player: stop')
            if (this.state != 'stopped') {
                if (this.engine)
                    this.engine.stop(); // engine updates state to stopped
            }
        },

        destroy: function() {
            if (this.engine)
                this.engine.destroy();
            this.element.remove();
        },

        mute: function(flag) {
            flag = !!flag;
            S.log('symple:player: mute', flag);

            if (this.engine &&
                this.engine.mute)
                this.engine.mute(flag);
            this.element[flag ? 'addClass' : 'removeClass']('muted');
        },

        setState: function(state, message) {
            S.log('symple:player: set state', this.state, '=>', state);
            if (this.state == state)
                return;

            this.state = state;
            this.displayStatus(null);
            this.playing = state == 'playing';
            if (message)
                this.displayMessage(state == 'error' ? 'error' : 'info', message);
            else
                this.displayMessage(null);
            this.element.removeClass('state-stopped state-loading state-playing state-paused state-error');
            this.element.addClass('state-' + state);
            this.options.onStateChange(this, state, message);
        },

        //
        // Helpers
        //

        displayStatus: function(data) {
            this.element.find('.symple-player-status').html(data ? data : '');
        },

        // Display an overlayed player message.
        // Type may be one of: error, warning, info
        displayMessage: function(type, message) {
            S.log('symple:player: display message', type, message)
            if (message) {
                this.message.html('<p class="' + type + '-message">' + message + '</p>').show();
            }
            else {
                this.message.html('').hide();
            }
        },

        bindEvents: function() {
            var self = this;
            this.element.find('.symple-player-controls a').unbind().bind('click tap', function() {
                self.sendCommand(this.rel, $(this));
                return false;
            })
        },

        sendCommand: function(cmd, e) {
            if (!this.options.onCommand ||
                !this.options.onCommand(this, cmd, e)) {

                // If there is no command callback function or the callback returns
                // false then we process these default behaviours.
                switch(cmd) {
                  case 'play':
                      this.play();
                      break;
                  case 'stop':
                      this.stop();
                      break;
                  case 'mute':
                      this.mute(true);
                      break;
                  case 'unmute':
                      this.mute(false);
                      break;
                  case 'fullscreen':
                      this.toggleFullScreen();
                      break;
                }
            }
        },

        getButton: function(cmd) {
            return this.element.find('.symple-player-controls [rel="' + cmd + '"]');
        },

        // TODO: Toggle actual player element
        toggleFullScreen: function() {
            // if (!document.fullscreenElement) {
            //     document.documentElement.requestFullscreen();
            // } else {
            //     if (document.exitFullscreen) {
            //         document.exitFullscreen();
            //     }
            // }
            var fullscreenElement = $(this.options.fullscreenElement)[0] || this.element[0];
            console.log(fullscreenElement)
            if (S.runVendorMethod(document, "FullScreen") ||
                S.runVendorMethod(document, "IsFullScreen")) {
                S.runVendorMethod(document, "CancelFullScreen");
            }
            else {
                S.runVendorMethod(fullscreenElement, "RequestFullScreen");
            }
        }
    });


    // -------------------------------------------------------------------------
    // Player Engine Interface
    //
    S.Player.Engine = S.Class.extend({
        init: function(player) {
            this.player = player;
            this.fps = 0;
            this.seq = 0;
        },

        support: function() { return true; },
        setup: function() {},
        destroy: function() {},
        play: function(params) {
            this.params = params || {};
            if (!this.params.url && typeof(params.address) == 'object')
                this.params.url = this.buildURL();
        },
        stop: function() {},
        pause: function(flag) {},
        mute: function(flag) {},
        // refresh: function() {},

        setState: function(state, message) {
            this.player.setState(state, message);
        },

        setError: function(error) {
            S.log('symple:player:engine: error', error);
            this.setState('error', error);
        },

        onRemoteCandidate: function(candidate) {
            S.log('symple:player:engine: remote candidates not supported.');
        },

        updateFPS: function() {
            if (typeof this.prevTime == 'undefined')
                this.prevTime = new Date().getTime();
            if (this.seq > 0) {
                var now = new Date().getTime();
                this.delta = this.prevTime ? now - this.prevTime : 0;
                this.fps = (1000.0 / this.delta).toFixed(3);
                this.prevTime  = now;
            }
            this.seq++;
        },

        displayFPS: function() {
            this.updateFPS();
            this.player.displayStatus(this.delta + " ms (" + this.fps + " fps)");
        },

        buildURL: function() {
            if (!this.params)
                throw 'Streaming parameters not set';
            if (!this.params.address)
                this.params.address = this.player.options.address;
            return S.Media.buildURL(this.params);
        }
    });

})(window.Symple = window.Symple || {});

//
// Symple.MJPEG.js
// WebRTC Engine for the Symple Messaging Client
//
// Copyright (c)2010 Sourcey
// http://sourcey.com
// Distributed under The MIT License.
//
(function(S) {
    window.RTCPeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
    window.RTCSessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;
    window.RTCIceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
    window.URL = window.webkitURL || window.URL;
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;

    S.Media.registerEngine({
        id: 'WebRTC',
        name: 'WebRTC Player',
        formats: 'VP9, VP4, H.264, Opus',
        preference: 100,
        support: (function() {
            return typeof RTCPeerConnection != 'undefined';
        })()
    });

    S.Player.Engine.WebRTC = S.Player.Engine.extend({
        init: function(player) {
            S.log('symple:webrtc: init');
            this._super(player);

            this.rtcConfig = player.options.rtcConfig || {
              iceServers: [
                { url: 'stun:stun.l.google.com:19302' }
              ]
            }

            this.rtcOptions = player.options.rtcOptions || {
                optional: [
                    { DtlsSrtpKeyAgreement: true } // required for FF <=> Chrome interop
                ]
            }

            // Specifies that this client will be the ICE initiator,
            // and will be sending the initial SDP Offer.
            this.initiator = player.options.initiator;

            // The `MediaStreamConstraints` object to pass to `getUserMedia`
            this.userMediaConstraints = player.options.userMediaConstraints || {
                audio: true,
                video: true
            }

            // Reference to the active local or remote media stream
            this.activeStream = null;
        },

        setup: function() {
            S.log('symple:webrtc: setup');

            this._createPeerConnection();

            if (typeof(this.video) == 'undefined') {
                this.video = document.createElement('video');
                this.video.autoplay = true;
                this.player.screen.prepend(this.video);
            }
        },

        destroy: function() {
            S.log('symple:webrtc: destroy');

            this.sendLocalSDP = null;
            this.sendLocalCandidate = null;
            this.activeStream = null; // TODO: Needs explicit close?

            if (this.video) {
                this.video.src = '';
                this.video = null;
                // Anything else required for video cleanup?
            }

            if (this.pc) {
                this.pc.close();
                this.pc = null;
                // Anything else required for peer connection cleanup?
            }
        },

        play: function(params) {
            S.log('symple:webrtc: play', params);

            // If there is an active stream then play it now.
            if (this.activeStream) {
                this.video.src = URL.createObjectURL(this.activeStream);
                this.video.play();
                this.setState('playing');
            }

            // Otherwise wait until ICE to complete before setting the 'playing' state.
            else {

                // If we are the ICE `initiator` then attempt to open the local video
                // device and send the SDP Offer to the peer.
                if (this.initiator) {
                    S.log('symple:webrtc: initiating', this.userMediaConstraints);
                    var self = this;

                    // TODO: Support device enumeration.
                    navigator.getUserMedia(this.userMediaConstraints,
                        function (localStream) { // success

                            // Play the local video stream and create the SDP offer.
                            self.video.src = URL.createObjectURL(localStream);
                            self.pc.addStream(localStream);
                            self.pc.createOffer(
                                function(desc) { // success
                                    S.log('symple:webrtc: offer', desc);
                                    self._onLocalSDP(desc);
                                },
                                function(err) { // error
                                    S.log('symple:webrtc: offer failed', err);
                                });

                            // Store the active local stream
                            self.activeStream = localStream;
                        },
                        function(err) { // error
                            self.setError('getUserMedia() failed: ' + err);
                        });
                }
            }
        },

        stop: function() {
            // NOTE: Stopping the player does not close the peer connection,
            // only `destroy` does that. This enables us to resume playback
            // quickly and with minimal delay.


            if (this.video) {
                this.video.src = '';
                // Do not nullify
            }

            // Close peer connection
            // if (this.pc) {
            //     this.pc.close();
            //     this.pc = null;
            // }

            this.setState('stopped');
        },

        mute: function(flag) {
            // Mute unless explicit false given
            flag = flag === false ? false : true;

            S.log('symple:webrtc: mute', flag);

            if (this.video)
                this.video.prop('muted', flag);
        },

        // Called when local SDP is ready to be sent to the peer.
        sendLocalSDP: null, // new Function,

        // Called when a local candidate is ready to be sent to the peer.
        sendLocalCandidate: null, // new Function,

        // Called when remote SDP is received from the peer.
        recvRemoteSDP: function(desc) {
            S.log('symple:webrtc: recv remote sdp', desc)
            if (!desc || !desc.type || !desc.sdp)
                throw 'Invalid remote SDP';

            var self = this;
            this.pc.setRemoteDescription(new RTCSessionDescription(desc),
                function() {
                    S.log('symple:webrtc: sdp success');
                },
                function(message) {
                    console.error('symple:webrtc: sdp error', message);
                    self.setError('Cannot parse remote SDP offer');
                }
            );

            if (desc.type == 'offer') {
                self.pc.createAnswer(
                    function(answer) { // success
                        self._onLocalSDP(answer);
                    },
                    function() { // error
                        self.setError('Cannot create local SDP answer');
                    },
                    null // this.mediaConstraints
                );
            }
        },

        // Called when remote candidate is received from the peer.
        recvRemoteCandidate: function(candidate) {
            S.log('symple:webrtc: recv remote candiate', candidate);
            if (!this.pc)
                throw 'The peer connection is not initialized'; // call recvRemoteSDP first

            this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        },

        //
        // Private methods
        //

        // Called when local SDP is ready to be sent to the peer.
        _onLocalSDP: function(desc) {
            try {
                this.pc.setLocalDescription(desc);
                this.sendLocalSDP(desc);
            }
            catch (e) {
                S.log('symple:webrtc: failed to send local SDP', e);
            }
        },

        // Create the RTCPeerConnection object.
        _createPeerConnection: function() {
            if (this.pc)
                throw 'The peer connection is already initialized';

            S.log('symple:webrtc: create peer connnection', this.rtcConfig, this.rtcOptions);

            var self = this;
            this.pc = new RTCPeerConnection(this.rtcConfig, this.rtcOptions);
            this.pc.onicecandidate = function(event) {
                if (event.candidate) {
                    S.log('symple:webrtc: candidate gathered', event.candidate);
                    self.sendLocalCandidate(event.candidate);
                }
                else {
                    S.log('symple:webrtc: candidate gathering complete');
                }
            };
            this.pc.onaddstream = function(event) {
                S.log('symple:webrtc: remote stream added', URL.createObjectURL(event.stream));

                // Set the state to playing once candidates have completed gathering.
                // This is the best we can do until ICE onstatechange is implemented.
                self.setState('playing');

                self.video.src = URL.createObjectURL(event.stream);
                self.video.play();

                // Store the active stream
                self.activeStream = event.stream;
            };
            this.pc.onremovestream = function(event) {
                S.log('symple:webrtc: remote stream removed', event);
                self.video.stop();
                self.video.src = '';
            };

            // NOTE: The following state events are still very unreliable.
            // Hopefully when the spec is complete this will change, but until then
            // we need to 'guess' the state.
            // this.pc.onconnecting = function(event) { S.log('symple:webrtc: onconnecting:', event); };
            // this.pc.onopen = function(event) { S.log('symple:webrtc: onopen:', event); };
            // this.pc.onicechange = function(event) { S.log('symple:webrtc: onicechange :', event); };
            // this.pc.onstatechange = function(event) { S.log('symple:webrtc: onstatechange :', event); };
        }
    });


    //
    // Helpers

    S.Media.iceCandidateType = function(candidateSDP) {
        if (candidateSDP.indexOf('typ relay') != -1)
            return 'turn';
        if (candidateSDP.indexOf('typ srflx') != -1)
            return 'stun';
        if (candidateSDP.indexOf('typ host') != -1)
            return 'host';
        return 'unknown';
    }

})(window.Symple = window.Symple || {});
