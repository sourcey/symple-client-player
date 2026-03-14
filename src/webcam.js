import { Symple } from 'symple-client'
import Player from './player.js'
import Media from './media.js'

// Register the Webcam engine.
Media.register({
  id: 'Webcam',
  name: 'Webcam Player',
  formats: 'JPEG, PNG',
  preference: 0,
  support: typeof navigator !== 'undefined' &&
           typeof navigator.mediaDevices !== 'undefined' &&
           typeof navigator.mediaDevices.getUserMedia === 'function'
})

// Simple webcam capture engine.
// Provides local camera preview and frame capture (snapshot to canvas/blob).
export default class WebcamPlayer extends Player {
  constructor (element, options = {}) {
    super(element, options)
    this.localStream = null
  }

  setup () {
    Symple.log('symple:webcam: setup')
    if (!this.video) {
      this.video = document.createElement('video')
      this.video.autoplay = true
      this.video.playsInline = true
      this.video.muted = true
      this.screen.appendChild(this.video)
    }
  }

  destroy () {
    Symple.log('symple:webcam: destroy')

    if (this.video) {
      this.video.srcObject = null
      this.video = null
    }

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop()
      }
      this.localStream = null
    }

    this.setState('stopped')
  }

  async play (params = {}) {
    Symple.log('symple:webcam: play', params)

    const constraints = {
      audio: params.audio !== undefined ? params.audio : true,
      video: params.video !== undefined ? params.video : true
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      this.localStream = stream
      this.video.srcObject = stream
      this.setState('playing')
    } catch (err) {
      this.setError('getUserMedia failed: ' + err.message)
    }
  }

  stop () {
    if (this.video) {
      this.video.srcObject = null
    }
    this.setState('stopped')
  }

  mute (flag) {
    if (this.video) this.video.muted = flag !== false
  }

  // Capture a video frame to a canvas element.
  capture (scaleFactor = 1) {
    const w = this.video.videoWidth * scaleFactor
    const h = this.video.videoHeight * scaleFactor
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(this.video, 0, 0, w, h)
    return canvas
  }

  // Capture a video frame as a Blob.
  toBlob (mimeType = 'image/jpeg', quality = 0.75, scaleFactor = 1) {
    const canvas = this.capture(scaleFactor)
    return new Promise((resolve) => {
      canvas.toBlob(resolve, mimeType, quality)
    })
  }
}
