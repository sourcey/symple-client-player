import { Symple } from 'symple-client'
import Player from './player.js'
import Media from './media.js'

// Register the native MJPEG engine.
Media.register({
  id: 'mjpeg:native',
  name: 'MJPEG Native',
  formats: 'MJPEG',
  preference: 60,
  support: (function () {
    if (typeof navigator === 'undefined') return false
    return /Firefox|Chrome|Safari/.test(navigator.userAgent)
  })()
})

// Native MJPEG engine using multipart/x-mixed-replace via <img>.
export class MJPEGPlayer extends Player {
  constructor (element, options = {}) {
    super(element, options)
    this.img = null
  }

  play (params = {}) {
    Symple.log('symple:mjpeg: play', params)
    if (this.img) throw new Error('Streaming already initialized')
    if (!params.url) throw new Error('MJPEG stream URL required')

    super.play(params)

    let init = true
    this.img = new Image()
    this.img.style.display = 'none'

    this.img.onload = () => {
      if (init) {
        if (this.img) this.img.style.display = 'inline'
        this.setState('playing')
        init = false
      }
    }

    this.img.onerror = () => {
      this.setError('MJPEG streaming connection failed')
    }

    this.img.src = params.url
    this.screen.appendChild(this.img)
  }

  stop () {
    Symple.log('symple:mjpeg: stop')
    this._cleanup()
    this.setState('stopped')
  }

  destroy () {
    this._cleanup()
  }

  _cleanup () {
    if (this.img) {
      this.img.style.display = 'none'
      this.img.src = ''
      this.img.onload = null
      this.img.onerror = null
      if (this.img.parentNode) this.img.parentNode.removeChild(this.img)
      this.img = null
    }
  }
}

// Register the WebSocket MJPEG engine.
Media.register({
  id: 'mjpeg:ws',
  name: 'MJPEG WebSocket',
  formats: 'MJPEG',
  preference: 50,
  support: typeof WebSocket !== 'undefined'
})

// MJPEG engine using WebSocket binary frames.
export class MJPEGWebSocketPlayer extends Player {
  constructor (element, options = {}) {
    super(element, options)
    this.socket = null
    this.img = null
  }

  play (params = {}) {
    Symple.log('symple:mjpeg:ws: play', params)
    if (this.socket) throw new Error('Streaming already active')
    if (!params.url) throw new Error('MJPEG WebSocket URL required')

    super.play(params)

    this._createImage()

    const url = params.url.replace(/^http/, 'ws')
    Symple.log('symple:mjpeg:ws: connecting', url)

    let init = true
    this.socket = new WebSocket(url)

    this.socket.onopen = () => {
      Symple.log('symple:mjpeg:ws: connected')
    }

    this.socket.onmessage = (e) => {
      if (!this.img || !this.socket) {
        this.setError('Streaming failed')
        return
      }

      if (init) {
        this.setState('playing')
        init = false
      }

      const blob = URL.createObjectURL(e.data)
      this.img.onload = () => URL.revokeObjectURL(blob)
      this.img.src = blob
    }

    this.socket.onerror = (error) => {
      Symple.log('symple:mjpeg:ws: error', error)
      this.setError('Invalid MJPEG stream')
    }

    this.socket.onclose = () => {
      Symple.log('symple:mjpeg:ws: closed')
    }
  }

  stop () {
    Symple.log('symple:mjpeg:ws: stop')
    this._cleanup()
    this.setState('stopped')
  }

  destroy () {
    this._cleanup()
  }

  _createImage () {
    if (!this.img) {
      this.img = new Image()
      this.img.style.width = '100%'
      this.img.style.height = '100%'
      this.img.onerror = () => this.setError('Invalid MJPEG stream')
      this.screen.appendChild(this.img)
    }
  }

  _cleanup () {
    if (this.img) {
      this.img.style.display = 'none'
      this.img.src = ''
      this.img.onload = null
      this.img.onerror = null
      if (this.img.parentNode) this.img.parentNode.removeChild(this.img)
      this.img = null
    }
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
  }
}
