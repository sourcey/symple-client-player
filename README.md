# Symple Client Player

Media player and WebRTC call signalling for the [Symple](https://github.com/sourcey/symple-client) messaging protocol.

## Features

- WebRTC video/audio calls with full call signalling (init, accept, reject, hangup)
- Modern WebRTC API (ontrack, getUserMedia promises, srcObject, trickle ICE)
- MJPEG streaming (native multipart and WebSocket)
- Webcam capture with snapshot support
- Pluggable media engine registry
- ES modules, no build step required

## Install

```bash
npm install symple-client-player symple-client
```

## Usage

### CallManager (recommended)

The `CallManager` handles the full call lifecycle over Symple messaging:

```javascript
import SympleClient from 'symple-client'
import { CallManager } from 'symple-client-player'

const client = new SympleClient({
  url: 'http://localhost:4500',
  peer: { user: 'alice', name: 'Alice' }
})

const calls = new CallManager(client, document.getElementById('video'), {
  rtcConfig: {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  },
  mediaConstraints: { audio: true, video: true }
})

// Make a call
calls.call('bob|socket-id')

// Handle incoming calls
calls.on('incoming', (peerId, message) => {
  if (confirm('Accept call?')) {
    calls.accept()
  } else {
    calls.reject('declined')
  }
})

// Call state events
calls.on('ringing', (peerId) => console.log('Ringing...'))
calls.on('accepted', (peerId) => console.log('Accepted'))
calls.on('active', (peerId) => console.log('Media flowing'))
calls.on('ended', (peerId, reason) => console.log('Ended:', reason))
calls.on('error', (err) => console.error(err))

// Media streams
calls.on('localstream', (stream) => { /* local preview */ })
calls.on('remotestream', (stream) => { /* remote video */ })

// End a call
calls.hangup()
```

### WebRTC Player (direct)

Use `WebRTCPlayer` directly if you want to handle signalling yourself:

```javascript
import { WebRTCPlayer } from 'symple-client-player'

const player = new WebRTCPlayer(element, { initiator: true })

// Wire SDP and ICE to your signalling channel
player.on('sdp', (desc) => sendToRemote('sdp', desc))
player.on('candidate', (candidate) => sendToRemote('candidate', candidate))

// Receive from remote
onRemoteMessage('sdp', (desc) => player.recvRemoteSDP(desc))
onRemoteMessage('candidate', (c) => player.recvRemoteCandidate(c))

await player.play()
```

### Webcam

```javascript
import { WebcamPlayer } from 'symple-client-player'

const webcam = new WebcamPlayer(element)
await webcam.play({ audio: false, video: true })

// Capture a frame
const blob = await webcam.toBlob('image/jpeg', 0.8)
```

## Call Signalling Protocol

CallManager uses Symple `type: 'message'` messages with a `subtype` field:

| Subtype | Direction | Purpose |
| ------- | --------- | ------- |
| `call:init` | Caller -> Callee | Initiate a call |
| `call:accept` | Callee -> Caller | Accept the call |
| `call:reject` | Callee -> Caller | Reject the call |
| `call:offer` | Caller -> Callee | SDP offer |
| `call:answer` | Callee -> Caller | SDP answer |
| `call:candidate` | Both | ICE candidate |
| `call:hangup` | Both | End the call |

## Exports

```javascript
import {
  Player,              // Abstract base player class
  Media,               // Engine registry
  WebRTCPlayer,        // WebRTC engine
  WebcamPlayer,        // Webcam capture engine
  MJPEGPlayer,         // Native MJPEG engine
  MJPEGWebSocketPlayer, // WebSocket MJPEG engine
  CallManager,         // Call signalling manager
  CallSubtype,         // Call message subtypes
  CallState,           // Call state machine states
  iceCandidateType     // ICE candidate type helper
} from 'symple-client-player'
```

## Testing

```bash
npm test
```

## Symple Ecosystem

- [symple-client](https://github.com/sourcey/symple-client) - JavaScript client
- [symple-server](https://github.com/sourcey/symple-server) - Node.js server
- [symple-client-ruby](https://github.com/sourcey/symple-client-ruby) - Ruby client

## More Information

For more details, visit [sourcey.com/code/symple](https://sourcey.com/code/symple).

## License

MIT
