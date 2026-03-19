// audio-processor.ts
// AudioWorkletProcessor — runs in the audio rendering thread.
// Must be compiled separately and loaded via AudioWorklet.addModule().
// The AudioWorklet global scope provides AudioWorkletProcessor and registerProcessor.
// TypeScript needs "lib": ["WebWorker"] or a triple-slash reference to type these.

/// <reference no-default-lib="true" />
/// <reference lib="ES2020" />

// Minimal ambient declarations for AudioWorklet global scope
// (DOM lib does not include these — AudioWorklet runs in its own global)
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor
): void

// ─── Pitchly Audio Processor ──────────────────────────────────────────────
class PitchlyProcessor extends AudioWorkletProcessor {
  // Accumulate ~256ms of audio at 16kHz before sending (4096 samples)
  private readonly CHUNK_SIZE = 4096
  private buffer: Float32Array = new Float32Array(this.CHUNK_SIZE)
  private cursor = 0

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0] // first input, mono channel
    if (!input) return true

    for (let i = 0; i < input.length; i++) {
      this.buffer[this.cursor++] = input[i]!

      if (this.cursor >= this.CHUNK_SIZE) {
        // Clone before posting — the buffer is reused each frame
        this.port.postMessage({ pcm: this.buffer.slice(0) })
        this.cursor = 0
      }
    }

    return true // returning false would stop the processor
  }
}

registerProcessor('pitchly-processor', PitchlyProcessor)
