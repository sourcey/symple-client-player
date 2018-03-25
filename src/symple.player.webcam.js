//
// Symple.Webcam.js
// Webcam Engine for the Symple
//
// Copyright (c)2010 Sourcey
// http://sourcey.com
// Distributed under The MIT License.
//
(function (S) {
  window.URL = window.webkitURL || window.URL
  navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia

  S.Media.register({
    id: 'Webcam',
    name: 'Webcam Player',
    formats: 'JPEG, PNG',
    preference: 0,
    support: (function () {
      return typeof navigator.getUserMedia !== 'undefined'
    })()
  })

  S.Player.Webcam = S.Player.extend({
    init: function (element, options) {
      S.log('symple:webcam: Init')

      this._super(element, options)
    },

    setup: function () {
      S.log('symple:webcam: Setup')

      if (typeof (this.video) === 'undefined') {
        this.video = document.createElement('video')
        this.video.autoplay = true
        this.screen.appendChild(this.video)
      }
    },

    destroy: function () {
      S.log('symple:webcam: Destroy')

      if (this.video) {
        this.video.src = ''
        this.video = null
        // Anything else required for video cleanup?
      }

      if (this.localStream) {
        // localStream.stop() is deprecated in Chrome 45, removed in Chrome 47
        if (!this.localStream.stop && this.localStream.getTracks) {
          this.localStream.stop = function () {
            this.getTracks().forEach(function (track) {
              track.stop()
            })
          }
        }
        this.localStream.stop()
        this.localStream = null
      }
    },

    play: function (params) {
      S.log('symple:webcam: Play', params)

      var self = this
      navigator.getUserMedia({ audio: params.audio, video: params.video },
                    function (localStream) {
                      self.video.src = URL.createObjectURL(localStream)
                      self.localStream = localStream

                        // TODO: better handle errors
                      self.setState('playing')
                    },
                    function (err) {
                      self.setError('getUserMedia() Failed: ' + err)
                    })
    },

    stop: function () {
      if (this.video) {
        this.video.src = ''
        // Do not nullify
      }

      this.setState('stopped')
    },

    mute: function (flag) {
      if (this.video) {
        this.video.muted = flag
      }
    },

    capture: function (scaleFactor) {
      if (!scaleFactor) scaleFactor = 1
      var w = this.video.videoWidth * scaleFactor
      var h = this.video.videoHeight * scaleFactor
      var canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      var ctx = canvas.getContext('2d')
      ctx.drawImage(this.video, 0, 0, w, h)
      return canvas
    },

    toBlob: function (mimeType, quality, scaleFactor) {
      mimeType = mimeType || 'image/jpeg'
      quality = quality || 0.75
      var dataURL = this.capture(scaleFactor).toDataURL(mimeType, quality)
      return this._dataURItoBlob(dataURL, mimeType)
    },

    _dataURItoBlob: function (dataURI, mimeType) {
      var byteString = atob(dataURI.split(',')[1])
      var ab = new ArrayBuffer(byteString.length)
      var ia = new Uint8Array(ab)
      for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i)
      }
      return new Blob([ab], { type: mimeType })
    }
  })
})(window.Symple = window.Symple || {})
