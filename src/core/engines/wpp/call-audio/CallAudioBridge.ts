import { EventEmitter } from 'events';
import { Logger } from 'pino';
import { Page } from 'puppeteer';

/**
 * Manages the WebRTC audio bridge for a single call.
 *
 * Architecture:
 * - Browser injection hooks RTCPeerConnection (capture remote audio)
 *   and overrides getUserMedia (inject synthetic audio input).
 * - Node↔Browser communication via Puppeteer exposeFunction/evaluate.
 *
 * Incoming audio:  RTCPeerConnection → MediaRecorder → base64 → __wahaCallAudioIn → 'chunk' event
 * Outgoing audio:  feedAudio(base64) → evaluate → AudioContext → getUserMedia → RTCPeerConnection
 *
 * Events:
 *   'chunk' — (callId: string, base64Chunk: string) emitted for each incoming audio chunk
 */
export class CallAudioBridge extends EventEmitter {
  private activeCallId: string | null = null;
  private injected = false;

  constructor(
    private readonly page: Page,
    private readonly logger: Logger,
  ) {
    super();
  }

  async inject(): Promise<void> {
    if (this.injected) {
      return;
    }
    try {
      await this.page.exposeFunction(
        '__wahaCallAudioIn',
        (callId: string, base64Chunk: string) => {
          this.emit('chunk', callId, base64Chunk);
        },
      );
    } catch (error) {
      this.logger.debug(
        { error: error },
        '__wahaCallAudioIn already exposed or failed',
      );
    }
    await this.page.evaluate(BROWSER_INJECT_SCRIPT);
    this.injected = true;
    this.logger.debug('Audio bridge browser script injected');
  }

  async start(callId: string): Promise<void> {
    if (!this.injected) {
      await this.inject();
    }
    await this.page.evaluate(
      (id: string) => (window as any).__wahaAudioBridgeStart(id),
      callId,
    );
    this.activeCallId = callId;
    this.logger.info({ callId: callId }, 'Audio bridge started');
  }

  /** Feed outgoing audio — base64-encoded PCM signed 16-bit LE, 16kHz mono. */
  async feedAudio(base64Data: string): Promise<void> {
    if (!this.activeCallId) {
      return;
    }
    await this.page.evaluate(
      (data: string) => (window as any).__wahaAudioBridgeFeed(data),
      base64Data,
    );
  }

  async stop(): Promise<void> {
    if (!this.activeCallId) {
      return;
    }
    try {
      await this.page.evaluate(() => (window as any).__wahaAudioBridgeStop());
    } catch (error) {
      this.logger.debug(
        { error: error },
        'Audio bridge stop failed (page may be closed)',
      );
    }
    this.logger.info({ callId: this.activeCallId }, 'Audio bridge stopped');
    this.activeCallId = null;
  }

  async getState(): Promise<AudioBridgeState | null> {
    if (!this.injected) {
      return null;
    }
    try {
      return await this.page.evaluate(() =>
        (window as any).__wahaAudioBridgeGetState(),
      );
    } catch {
      return null;
    }
  }

  getActiveCallId(): string | null {
    return this.activeCallId;
  }
}

export interface AudioBridgeState {
  activeCallId: string | null;
  hasAudioContext: boolean;
  hasInputStream: boolean;
  hasRemoteStream: boolean;
  isRecording: boolean;
}

//
// Browser-side WebRTC hook script — mirrors browser-inject.ts (keep in sync).
// Evaluated as a string in the Puppeteer page context.
//
const BROWSER_INJECT_SCRIPT = `
const __wahaState = {
  activeCallId: null,
  audioContext: null,
  inputStream: null,
  remoteStream: null,
  recorder: null,
  originalGetUserMedia: navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices),
};

function __wahaCreateInputStream() {
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const dest = audioContext.createMediaStreamDestination();
  __wahaState.audioContext = audioContext;
  __wahaState.inputStream = dest.stream;
  return dest.stream;
}

function __wahaFeedAudio(base64Data) {
  if (!__wahaState.audioContext) return;
  try {
    const raw = atob(base64Data);
    const buffer = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) buffer[i] = raw.charCodeAt(i);
    const pcm = new Int16Array(buffer.buffer);
    const float32 = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) float32[i] = pcm[i] / 32768.0;
    const audioBuffer = __wahaState.audioContext.createBuffer(1, float32.length, 16000);
    audioBuffer.getChannelData(0).set(float32);
    const source = __wahaState.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(__wahaState.audioContext.destination);
    source.start();
  } catch (e) {
    // Invalid base64 or audio data — drop silently
  }
}

function __wahaStartRecording(stream, callId) {
  if (__wahaState.recorder) __wahaState.recorder.stop();
  __wahaState.remoteStream = stream;
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';
  const recorder = new MediaRecorder(stream, { mimeType: mimeType, audioBitsPerSecond: 16000 });
  recorder.ondataavailable = (event) => {
    if (event.data.size === 0) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      if (base64 && typeof __wahaCallAudioIn === 'function') {
        __wahaCallAudioIn(callId, base64);
      }
    };
    reader.readAsDataURL(event.data);
  };
  recorder.start(100);
  __wahaState.recorder = recorder;
}

function __wahaStopRecording() {
  if (__wahaState.recorder) { __wahaState.recorder.stop(); __wahaState.recorder = null; }
  __wahaState.remoteStream = null;
}

navigator.mediaDevices.getUserMedia = async function (constraints) {
  if (constraints.audio && __wahaState.inputStream) {
    const tracks = __wahaState.inputStream.getAudioTracks();
    if (tracks.length > 0) return new MediaStream(tracks);
  }
  return __wahaState.originalGetUserMedia(constraints);
};

const OriginalRTCPeerConnection = window.RTCPeerConnection;
window.RTCPeerConnection = function (configuration, ...rest) {
  const pc = new OriginalRTCPeerConnection(configuration, ...rest);
  pc.addEventListener('track', (event) => {
    if (event.track.kind === 'audio' && __wahaState.activeCallId) {
      __wahaStartRecording(new MediaStream([event.track]), __wahaState.activeCallId);
    }
  });
  return pc;
};
Object.assign(window.RTCPeerConnection, OriginalRTCPeerConnection);
window.RTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;

window.__wahaAudioBridgeStart = function (callId) {
  __wahaState.activeCallId = callId;
  __wahaCreateInputStream();
};

window.__wahaAudioBridgeStop = function () {
  __wahaStopRecording();
  __wahaState.activeCallId = null;
  __wahaState.inputStream = null;
  if (__wahaState.audioContext) { __wahaState.audioContext.close(); __wahaState.audioContext = null; }
};

window.__wahaAudioBridgeFeed = function (base64Data) {
  __wahaFeedAudio(base64Data);
};

window.__wahaAudioBridgeGetState = function () {
  return {
    activeCallId: __wahaState.activeCallId,
    hasAudioContext: __wahaState.audioContext !== null,
    hasInputStream: __wahaState.inputStream !== null,
    hasRemoteStream: __wahaState.remoteStream !== null,
    isRecording: __wahaState.recorder !== null,
  };
};
`;
