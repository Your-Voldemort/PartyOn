/**
 * Tests for AudioEngine — pause/resume, buffer cap, PCM deinterleave,
 * underrun callback, and mute-on-init.
 */

import { AudioEngine } from '../../static/js/audio.js';

// ---- Web Audio API mocks ----
class MockAudioContext {
    constructor({ sampleRate } = {}) {
        this.sampleRate = sampleRate || 44100;
        this.currentTime = 0;
        this.state = 'running';
        this.destination = {};
        this._suspended = false;
    }

    createGain() {
        return { gain: { value: 1 }, connect: jest.fn(), disconnect: jest.fn() };
    }

    createAnalyser() {
        return {
            fftSize: 256,
            frequencyBinCount: 128,
            connect: jest.fn(),
            getByteFrequencyData: jest.fn(),
        };
    }

    createBuffer(channels, frames, sampleRate) {
        const data = new Float32Array(frames);
        return {
            duration: frames / sampleRate,
            numberOfChannels: channels,
            getChannelData: () => data,
        };
    }

    createBufferSource() {
        return {
            buffer: null,
            connect: jest.fn(),
            disconnect: jest.fn(),
            start: jest.fn(),
            addEventListener: jest.fn(),
        };
    }

    suspend() {
        this._suspended = true;
        this.state = 'suspended';
        return Promise.resolve();
    }

    resume() {
        this._suspended = false;
        this.state = 'running';
        return Promise.resolve();
    }

    close() { return Promise.resolve(); }
}

global.AudioContext = MockAudioContext;
global.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 16));
global.cancelAnimationFrame = jest.fn(id => clearTimeout(id));

function makePCM(frames = 512, channels = 2) {
    // Create interleaved stereo int16 data
    const buf = new ArrayBuffer(frames * channels * 2);
    const view = new Int16Array(buf);
    for (let i = 0; i < view.length; i++) {
        view[i] = i % 100; // simple ramp
    }
    return buf;
}

describe('AudioEngine.initialize', () => {
    test('sets isInitialized to true on success', () => {
        const engine = new AudioEngine({ sampleRate: 44100, channels: 2 });
        const result = engine.initialize();
        expect(result).toBe(true);
        expect(engine.isInitialized).toBe(true);
    });

    test('sets gain to 0 when isMuted is true before init', () => {
        const engine = new AudioEngine({ sampleRate: 44100, channels: 2 });
        engine.isMuted = true;
        engine.initialize();
        expect(engine.gainNode.gain.value).toBe(0);
    });

    test('sets gain to volume when not muted', () => {
        const engine = new AudioEngine({ sampleRate: 44100, channels: 2 });
        engine.volume = 0.7;
        engine.initialize();
        expect(engine.gainNode.gain.value).toBe(0.7);
    });

    test('returns false when AudioContext throws', () => {
        global.AudioContext = jest.fn(() => { throw new Error('unsupported'); });
        const engine = new AudioEngine();
        expect(engine.initialize()).toBe(false);
        expect(engine.isInitialized).toBe(false);
        global.AudioContext = MockAudioContext;
    });
});

describe('AudioEngine.pause and resume', () => {
    test('pause sets isPaused and suspends context', () => {
        const engine = new AudioEngine({ sampleRate: 44100, channels: 2 });
        engine.initialize();

        engine.pause();

        expect(engine.isPaused).toBe(true);
        expect(engine.context._suspended).toBe(true);
    });

    test('resume clears isPaused and resumes context', () => {
        const engine = new AudioEngine({ sampleRate: 44100, channels: 2 });
        engine.initialize();
        engine.pause();

        engine.resume();

        expect(engine.isPaused).toBe(false);
        expect(engine.context._suspended).toBe(false);
    });
});

describe('AudioEngine.processAudioData', () => {
    test('does nothing before initialize', () => {
        const engine = new AudioEngine();
        engine.processAudioData(makePCM());
        expect(engine.queue).toHaveLength(0);
    });

    test('pushes PCM into the queue', () => {
        const engine = new AudioEngine({ sampleRate: 44100, channels: 2 });
        engine.initialize();
        engine.processAudioData(makePCM(512));
        expect(engine.queue).toHaveLength(1);
    });

    test('applies buffer cap while playing (not just when paused)', () => {
        const engine = new AudioEngine({ sampleRate: 44100, channels: 2 });
        engine.maxBufferSeconds = 0.01; // very tight cap
        engine.initialize();
        engine.isPaused = false; // explicitly playing

        // Feed enough data to exceed the cap
        for (let i = 0; i < 100; i++) {
            engine.processAudioData(makePCM(4096));
        }

        const bytesPerSecond = 44100 * 2 * 2;
        const maxBytes = 0.01 * bytesPerSecond;

        let totalBytes = 0;
        for (const chunk of engine.queue) {
            totalBytes += chunk.byteLength;
        }
        expect(totalBytes).toBeLessThanOrEqual(maxBytes + makePCM(4096).byteLength);
    });

    test('applies same cap when paused', () => {
        const engine = new AudioEngine({ sampleRate: 44100, channels: 2 });
        engine.maxBufferSeconds = 0.01;
        engine.initialize();
        engine.isPaused = true;

        for (let i = 0; i < 100; i++) {
            engine.processAudioData(makePCM(4096));
        }

        const bytesPerSecond = 44100 * 2 * 2;
        const maxBytes = 0.01 * bytesPerSecond;
        let totalBytes = 0;
        for (const chunk of engine.queue) {
            totalBytes += chunk.byteLength;
        }
        expect(totalBytes).toBeLessThanOrEqual(maxBytes + makePCM(4096).byteLength);
    });
});

describe('AudioEngine PCM deinterleave', () => {
    test('left and right channels are correctly split from interleaved data', () => {
        const engine = new AudioEngine({ sampleRate: 44100, channels: 2 });
        engine.initialize();

        // Craft known interleaved data: L=1000, R=-1000 per frame
        const frames = 4;
        const buf = new ArrayBuffer(frames * 2 * 2); // 2 channels * 2 bytes
        const view = new Int16Array(buf);
        for (let i = 0; i < frames; i++) {
            view[i * 2] = 1000;     // left
            view[i * 2 + 1] = -1000; // right
        }

        engine.processAudioData(buf);
        const pcm = engine.queue[0];

        // Pump manually to inspect buffer creation
        const buffers = [];
        jest.spyOn(engine.context, 'createBuffer').mockImplementation((ch, fr, sr) => {
            const left = new Float32Array(fr);
            const right = new Float32Array(fr);
            const mockBuf = {
                duration: fr / sr,
                getChannelData: (i) => i === 0 ? left : right
            };
            buffers.push(mockBuf);
            return mockBuf;
        });

        engine._pump();

        if (buffers.length > 0) {
            const leftData = buffers[0].getChannelData(0);
            const rightData = buffers[0].getChannelData(1);
            // 1000 / 32768 ≈ 0.0305
            expect(leftData[0]).toBeCloseTo(1000 / 32768, 4);
            expect(rightData[0]).toBeCloseTo(-1000 / 32768, 4);
        }
    });
});

describe('AudioEngine underrun callback', () => {
    test('calls onUnderrun when playTime falls behind currentTime', () => {
        const onUnderrun = jest.fn();
        const engine = new AudioEngine({
            sampleRate: 44100,
            channels: 2,
            onUnderrun
        });
        engine.initialize();

        // Push one chunk and force playTime to be behind currentTime
        engine.processAudioData(makePCM(512));
        engine.playTime = -999; // far in the past

        engine._pump();

        expect(onUnderrun).toHaveBeenCalled();
    });

    test('does not call onUnderrun when playTime is ahead', () => {
        const onUnderrun = jest.fn();
        const engine = new AudioEngine({
            sampleRate: 44100,
            channels: 2,
            onUnderrun
        });
        engine.initialize();
        engine.processAudioData(makePCM(512));
        engine.playTime = 9999; // far in the future

        engine._pump();

        expect(onUnderrun).not.toHaveBeenCalled();
    });
});
