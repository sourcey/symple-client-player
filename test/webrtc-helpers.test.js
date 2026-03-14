import { describe, it, expect } from 'vitest'
import { iceCandidateType } from '../src/webrtc.js'

describe('iceCandidateType', () => {
  it('identifies TURN relay candidates', () => {
    expect(iceCandidateType('candidate:1 1 udp 5000 1.2.3.4 12345 typ relay raddr 10.0.0.1 rport 54321')).toBe('turn')
  })

  it('identifies STUN server-reflexive candidates', () => {
    expect(iceCandidateType('candidate:2 1 udp 100 203.0.113.1 54321 typ srflx raddr 10.0.0.1 rport 12345')).toBe('stun')
  })

  it('identifies host candidates', () => {
    expect(iceCandidateType('candidate:3 1 udp 2130706431 192.168.1.1 12345 typ host')).toBe('host')
  })

  it('returns unknown for unrecognised candidate', () => {
    expect(iceCandidateType('')).toBe('unknown')
    expect(iceCandidateType('something random')).toBe('unknown')
  })

  it('handles candidates with typ relay taking priority', () => {
    // relay should match first even if other keywords are present
    expect(iceCandidateType('typ relay typ host')).toBe('turn')
  })
})
