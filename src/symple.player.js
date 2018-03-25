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
