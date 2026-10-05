/** Ambient noise generator (no audio files needed) */
let ctx: AudioContext | null = null
let src: AudioBufferSourceNode | null = null
let gain: GainNode | null = null

export type NoiseKind = 'rain' | 'brown' | 'white'

export function playNoise(kind: NoiseKind, volume = 0.25) {
  stopNoise()
  ctx = ctx ?? new AudioContext()
  const len = ctx.sampleRate * 4
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    let last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (kind === 'white') data[i] = w * 0.3
      else {
        last = (last + 0.02 * w) / 1.02
        data[i] = last * 3.5
        if (kind === 'rain' && Math.random() < 0.0008) data[i] += (Math.random() - 0.5) * 0.6
      }
    }
  }
  src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  gain = ctx.createGain()
  gain.gain.value = volume
  let node: AudioNode = src
  if (kind === 'rain') {
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 400
    node.connect(f)
    node = f
  }
  node.connect(gain).connect(ctx.destination)
  src.start()
}

export function setNoiseVolume(v: number) {
  if (gain) gain.gain.value = v
}

export function stopNoise() {
  try {
    src?.stop()
  } catch {
    /* already stopped */
  }
  src = null
}
