import { Symple } from 'symple-client'

// Media engine registry.
// Engines register with an id, name, preference score, and support flag.
// The registry selects the best available engine for the current platform.
const Media = {
  engines: {},

  register (engine) {
    Symple.log('symple:media: register engine:', engine)
    if (!engine.id || !engine.name || typeof engine.preference === 'undefined' || typeof engine.support === 'undefined') {
      Symple.log('symple:media: cannot register invalid engine', engine)
      return false
    }
    this.engines[engine.id] = engine
    return true
  },

  has (id) {
    return typeof this.engines[id] === 'object'
  },

  supports (id) {
    return !!(this.has(id) && this.engines[id].support)
  },

  // Returns compatible engines sorted by preference (highest first).
  compatibleEngines () {
    const arr = []
    for (const id in this.engines) {
      const engine = this.engines[id]
      if (engine.preference === 0) continue
      if (engine.support === true) arr.push(engine)
    }
    arr.sort((a, b) => b.preference - a.preference)
    return arr
  },

  // Returns the highest-preference compatible engine.
  preferredEngine () {
    const arr = this.compatibleEngines()
    return arr.length ? arr[0] : null
  }
}

export default Media
