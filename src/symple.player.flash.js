//
// Symple.Flash.js
// Flash Player for the Symple Messaging Client
//
// Copyright (c)2010 Sourcey
// http://sourcey.com
// Distributed under The MIT License.
//
(function(S) {

    // -------------------------------------------------------------------------
    // Flash => JavaScript Object Bridge
    //
    var JFlashBridge = {
        items: {},

        bind: function(id, klass) {
            S.log('symple:flash:bridge: Bind: ', id, klass);
            this.items[id] = klass;
        },

        unbind: function(id) {
           delete this.items[id]
        },

        call: function() {
            //S.log('symple:flash:bridge: Call: ', arguments);
            var klass = this.items[arguments[0]];
            if (klass) {
                var method = klass[arguments[1]];
                if (method)
                    method.apply(klass, Array.prototype.slice.call(arguments, 2));
                else
                    S.log('symple:flash:bridge: No method: ', arguments[1]);
            }
            else
                S.log('symple:flash:bridge: No binding: ', arguments);
        },

        getSWF: function(movieName) {
            if (navigator.appName.indexOf("Microsoft") != -1)
                return window[movieName];
            return document[movieName];
        }
    };


    // -------------------------------------------------------------------------
    // Flash Engine
    //
    S.Media.registerEngine({
        id: 'Flash',
        name: 'Flash Player',
        // FLV-Speex is also an option, but currently omitted because of
        // different flash player versions with inconsistent playback.
        formats: 'MJPEG, FLV, Speex',
        preference: 40,
        support: (function() {
            return true;
        })()
    });

    S.Player.Engine.Flash = S.Player.Engine.extend({
        init: function(player) {
            S.log("symple:flash: Init");
            this._super(player);
            this.initialized = false;
            this.streamOnInit = false;
            this.id = "symple-player-" + S.randomString(6);
        },

        setup: function() {
            S.log("symple:flash: Create");
            this.initialized = false;
            this.player.screen.prepend('<div id="' + this.id + '">Flash version 10.0.0 or newer is required.</div>');

            JFlashBridge.bind(this.id, this);

            //S.log("symple:flash: SWF:", this.id, this.player.options.htmlRoot + '/symple.player.swf');
            swfobject.embedSWF(
                this.player.options.swf ?
                    this.player.options.swf :
                    this.player.options.htmlRoot + '/symple.player.swf',
                this.id, '100%', '100%', '10.0.0',
                this.player.options.htmlRoot + '/playerProductInstall.swf', {
                    //debug: true, // enable for debug output
                }, {
                    quality: 'high',
                    wmode: 'transparent',
                    allowScriptAccess: 'sameDomain',
                    allowFullScreen: 'true'
                }, {
                    name: this.id
                });


            // Flash swallows click events, so catch mousedown
            // events and trigger click on screen element.
            var self = this;
            this.player.screen.mousedown(function() {
                self.player.screen.trigger('click')
            });
        },

        play: function(params) {
            S.log("symple:flash: Play", params);
            this.params = params;
            if (this.initialized) {
                S.log("symple:flash: Opening", params);
                this.swf().open(params);

                // Push through any pending candiates
                if (this.candidates) {
                    for (var i = 0; i < this.candidates.length; i++) {
                        S.log("symple:flash: Add stored candidate", this.candidates[i]);
                        this.swf().addCandidate(this.candidates[i]);
                    }
                }
            }
            else {
                S.log("symple:flash: Waiting for SWF");
                this.streamOnInit = true;
            }
        },

        stop: function() {
            S.log("symple:flash: Stop");
            if (this.initialized) {
                this.swf().close();
                this.setState('stopped'); // No need to wait for callback
            }
        },

        swf: function() {
            return JFlashBridge.getSWF(this.id);
        },

        isJSReady: function() {
            S.log("symple:flash: JavaScript Ready: " + $.isReady);
            return $.isReady;
        },

        refresh: function() {
            S.log("symple:flash: Refresh");
            try {
              if (this.initialized)
                this.swf().refresh();
            } catch (e) {}
        },

        onRemoteCandidate: function(candidate) {
            if (this.params && this.params.url)
                throw "Cannot add candiate after explicit URL was provided."

            if (this.initialized) {
                S.log("symple:flash: Adding remote candiate ", candidate);
                this.swf().addCandiate(candidate);
            }
            else {
                S.log("symple:flash: Storing remote candiate ", candidate);

                // Store candidates while waiting for flash to load
                if (!this.candidates)
                    this.candidates = [];
                this.candidates.push(candidate);
            }
        },

        onSWFLoaded: function() {
            S.log("symple:flash: Loaded");
            this.initialized = true;
            if (this.streamOnInit)
                this.play(this.params);
        },

        onPlayerState: function(state, error) {
            // None, Loading, Playing, Paused, Stopped, Error
            state = state.toLowerCase();
            if (state == 'error' && (!error || error.length == 0))
                error = "Streaming connection to the host was lost."
            S.log("symple:flash: On state: ", state, error, this.player.state);
            if (state != 'none')
                this.setState(state, error);
        },

        onMetadata: function(data) {
            //S.log("symple:flash: Metadata: ", data);
            if (data && data.length) {
                var status = '';
                for (var i = 0; i < data.length; ++i) {
                    status += data[i][0];
                    status += ': ';
                    status += data[i][1];
                    status += '<br>';
                }
                this.player.displayStatus(status);
            }
        },

        onLogMessage: function(type, text) {
            S.log('symple:flash: ' + type + ': ' + text);
        }
    });

})(window.Symple = window.Symple || {});
