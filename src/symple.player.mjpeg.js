//
// Symple.MJPEG.js
// MJPEG Engine for the Symple
//
// Copyright (c)2010 Sourcey
// http://sourcey.com
// Distributed under The MIT License.
//
(function (S) {

  // Native MJPEG Engine
  //
  // - Works in Firefox, Chrome and Safari except iOS >= 6.
  //
  S.Media.register({
    id: 'mjpeg:native',
    name: 'MJPEG Native',
    formats: 'MJPEG',
    preference: 60,
    defaults: {
      framing: 'multipart'
    },
    support: (function () {
      var ua = navigator.userAgent
      var iOS = S.iOSVersion()
      return !!(ua.match(/(Firefox|Chrome)/) ||
                // iOS < 6 or desktop safari
                (iOS ? iOS < 6 : ua.match(/(Safari)/)))
    })()
  })

  S.Player.BrowserCompatabilityMsg = '\
        <br>Download the latest version <a href="www.google.com/chrome/">Chrome</a> or \
        <a href="http://www.apple.com/safari/">Safari</a> to view this video stream.'

  S.Player.MJPEG = S.Player.extend({
    init: function (player) {
      this._super(player)
      this.img = null
    },

    play: function (params) {
      params = params || {};
      params.framing = 'multipart'; // using multipart/x-mixed-replace
      S.log('symple:mjpeg:native: Play', params)

      if (this.img) { throw 'Streaming already initialized' }

      this._super(params)

      // TODO: Some kind of connection timeout

      // this.params = params;
      // this.params.url = this.buildURL();
      // if (!this.params.url)
      //  throw 'Invalid streaming URL'

      var self = this
      var init = true
      this.img = new Image()
      // this.img.style.width = '100%';  // constraints set on screen element
      // this.img.style.height = '100%';
      this.img.style.display = 'none'
      this.img.onload = function () {
        S.log('symple:mjpeg:native: Success')

        // Most browsers inclusing WebKit just call onload once.
        if (init) {
          if (self.img) { self.img.style.display = 'inline' }
          self.setState('playing')
          init = false
        }

        // Some browsers, like Firefox calls onload on each
        // multipart segment, so we can display status.
        else { self.displayFPS() }
      }

      // NOTE: This never fires in latest chrome
      // when the remote side disconnects stream.
      this.img.onerror = function () {
        self.setError('Streaming connection failed.' + S.Player.BrowserCompatabilityMsg)
      }
      this.img.src = params.url // + "&rand=" + Math.random();
      this.screen.appendChild(this.img)
    },

    stop: function () {
      S.log('symple:mjpeg:native: Stop')
      this.cleanup()
      this.setState('stopped')
    },

    cleanup: function () {
      if (this.img) {
        this.img.style.display = 'none'
        this.img.src = '#' // closes the socket in ff, but not webkit
        this.img.onload = new Function()
        this.img.onerror = new Function()
        this.screen.removeChild(this.img)
        this.img = null
      }
    },

    setError: function (error) {
      S.log('Symple MJPEG Engine: Error:', error)
      this.cleanup()
      this.setState('error', error)
    }
  })

  // MJPEG WebSocket Engine
  //
  // Requires HyBi binary WebSocket support.
  // Available in all the latest browsers:
  // http://en.wikipedia.org/wiki/WebSocket
  //
  window.WebSocket = window.WebSocket || window.MozWebSocket
  window.URL = window.URL || window.webkitURL || window.mozURL || window.msURL

  S.Media.register({
    id: 'mjpeg:ws',
    name: 'MJPEG WebSocket',
    formats: 'MJPEG',
    preference: 50,
    support: (function () {
      return !!(window.WebSocket && window.WebSocket.CLOSING === 2 && window.URL)
    })()
  })

  S.Player.MJPEGWebSocket = S.Player.extend({
    init: function (player) {
      this._super(player)
      this.socket = null
      this.img = null
    },

    play: function (params) {
      if (this.active()) { throw 'Streaming already active' }

      params = params || {};
      params.framing = 'multipart'; // using multipart/x-mixed-replace
      this._super(params)
      this.createImage()

      var self = this,
        init = true,
        url = this.normalizeURL(params.url)
      S.log('symple:mjpeg:ws: play:', url)
      this.socket = new WebSocket(url)

      this.socket.onopen = function () {
        S.log('symple:mjpeg:ws: open')
        // self.socket.send('ping');
      }
      this.socket.onmessage = function (e) {
        S.log('symple:mjpeg:ws: message: ', e)

        // http://www.adobe.com/devnet/html5/articles/real-time-data-exchange-in-html5-with-websockets.html
        // http://stackoverflow.com/questions/15040126/receiving-websocket-arraybuffer-data-in-the-browser-receiving-string-instead
        // http://stackoverflow.com/questions/9546437/how-send-arraybuffer-as-binary-via-websocket/11426037#11426037
        if (!self.active()) {
          self.setError('Streaming failed')
        }

        if (init) {
          self.setState('playing')
          init = false
        }

        // TODO: Image content type
        S.log('symple:mjpeg:ws: frame', self, e.data)
        var blob = window.URL.createObjectURL(e.data)
        self.img.onload = function () {
          window.URL.revokeObjectURL(blob)
        }
        self.img.src = blob
        // self.displayFPS()
      }
      this.socket.onerror = function (error) {
        // Invalid MJPEG streams will end up here
        S.log('symple:mjpeg:ws: onerror', error)
        self.setError('Invalid MJPEG stream: ' + error + '.')
      }
    },

    stop: function () {
      S.log('symple:mjpeg:ws: stop')
      this.cleanup()
      this.setState('stopped')
    },

    active: function (params) {
      return this.img !== null && this.socket !== null
    },

    cleanup: function () {
      S.log('symple:mjpeg:ws: cleanup')
      if (this.img) {
        this.img.style.display = 'none'
        this.img.src = '#' // XXX: Closes socket in ff, but not safari
        this.img.onload = null
        this.img.onerror = null
        this.screen.removeChild(this.img)
        this.img = null
      }
      if (this.socket) {
        S.log('symple:mjpeg:ws: cleanup: socket: ', this.socket)

        // BUG: Not closing in latest chrome,
        this.socket.close()
        this.socket = null
      }
    },

    createImage: function () {
      if (!this.img) {
        this.img = new Image()
        this.img.style.width = '100%'
        this.img.style.height = '100%'

        // We will end up here if the MJPEG stream is invalid.
        // NOTE: This never fires in latest chrome when the
        // remote side disconnects stream.
        var self = this
        this.img.onerror = function (e) {
          S.log('symple:mjpeg:ws: image load error: ', e)
          self.setError('Invalid MJPEG stream');
        }
        this.screen.appendChild(this.img)
      }
    },

    normalizeURL: function (url) {
      return url.replace(/^http/, 'ws')
    },

    setError: function (error) {
      S.log('symple:mjpeg:ws: error:', error)
      this.cleanup()
      this.setState('error', error)
    }
  })
})(window.Symple = window.Symple || {})
