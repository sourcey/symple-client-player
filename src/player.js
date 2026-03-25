import { Emitter, Symple } from 'symple-client'

// Abstract base class for all player engines.
// Manages DOM structure, state machine, and control actions.
export default class Player extends Emitter {
  constructor (element, options = {}) {
    super()

    this.options = {
      template: `
        <div class="symple-player">
          <div class="symple-player-message"></div>
          <div class="symple-player-status"></div>
          <div class="symple-player-loading"></div>
          <div class="symple-player-screen"></div>
          <div class="symple-player-controls">
            <a class="play-btn" rel="play" href="#">Play</a>
            <a class="stop-btn" rel="stop" href="#">Stop</a>
            <a class="fullscreen-btn" rel="fullscreen" href="#">Fullscreen</a>
          </div>
        </div>`,
      ...options
    }

    this.element = element
    if (!this.element) throw new Error('Player element not found')

    const tagName = this.element.tagName?.toLowerCase()
    this._directMediaElement = tagName === 'video' || tagName === 'audio'

    if (this._directMediaElement) {
      this.screen = this.element.parentElement || this.element
      this.message = null
    } else {
      if (!this.element.classList.contains('symple-player')) {
        this.element.innerHTML = this.options.template
      }

      this.screen = this.element.querySelector('.symple-player-screen')
      if (!this.screen) throw new Error('Player screen element not found')

      this.message = this.element.querySelector('.symple-player-message')
    }

    this.state = null
    this.playing = false

    this.setup()
    this._bindControls()
  }

  // Override in subclasses for engine-specific setup.
  setup () {}

  play (params) {
    this.setState('playing')
  }

  stop () {
    this.setState('stopped')
  }

  destroy () {}

  mute (flag) {}

  setError (message) {
    this.setState('error', message)
  }

  setState (state, message) {
    Symple.log('symple:player: set state', this.state, '<=>', state)
    if (this.state === state) return false

    this.state = state
    this.playing = state === 'playing'
    this.displayStatus(null)

    if (message) {
      this.displayMessage(state === 'error' ? 'error' : 'info', message)
    } else {
      this.displayMessage(null)
    }

    this.emit('state', state, message)
    return true
  }

  displayStatus (data) {
    const status = this.element.querySelector('.symple-player-status')
    if (status) status.innerHTML = data || ''
  }

  displayMessage (type, message) {
    Symple.log('symple:player: display message', type, message)
    if (!this.message) return
    if (message) {
      this.message.innerHTML = `<p class="${type}-message">${message}</p>`
      this.message.style.display = 'block'
    } else {
      this.message.style.display = 'none'
    }
  }

  toggleFullScreen () {
    const el = this.options.fullscreenElement || this.element
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      el.requestFullscreen()
    }
  }

  _bindControls () {
    this.element.addEventListener('click', (e) => {
      const target = e.target.closest('[rel]')
      if (!target) return
      e.preventDefault()
      const action = target.getAttribute('rel')
      this._onAction(action, target)
    })
  }

  _onAction (action, element) {
    switch (action) {
      case 'play': this.play(); break
      case 'stop': this.stop(); break
      case 'mute': this.mute(true); break
      case 'unmute': this.mute(false); break
      case 'fullscreen': this.toggleFullScreen(); break
      default: this.emit('action', action, element); break
    }
  }
}
