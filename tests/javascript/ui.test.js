/**
 * Tests for UIController — play/pause/stop state machine, status text,
 * and connection failure recovery.
 */

import { UIController } from '../../static/js/ui.js';
import { ConnectionStatus } from '../../static/js/connection.js';

// Suppress module-level DOMContentLoaded initialization in ui.js
// (it fires after the module is imported, but jsdom does not auto-fire it)

function makeElements() {
    return {
        playBtn: null,
        pauseBtn: null,
        stopBtn: null,
        muteBtn: { textContent: 'MUTE' },
        volumeSlider: null,
        status: { textContent: '' },
        statusDetails: null,
        visualizer: null,
        statsArea: null,
        statsDetails: null,
        packetsPerSecond: { textContent: '0' },
        latency: { textContent: '--' },
        quality: { textContent: 'NOMINAL', className: '' },
        totalPackets: { textContent: '0' },
        underruns: { textContent: '0' },
        errorContainer: { innerHTML: '', appendChild: jest.fn() }
    };
}

function makeUI() {
    const ui = new UIController(makeElements());

    // Stub sub-components so tests don't need a real WebSocket or AudioContext
    ui.audioEngine = {
        isMuted: false,
        isInitialized: false,
        initialize: jest.fn(() => true),
        resume: jest.fn(),
        pause: jest.fn(),
        stop: jest.fn(),
        setMuted: jest.fn(),
        setVolume: jest.fn(),
        processAudioData: jest.fn(),
        getVisualizationData: jest.fn(() => null)
    };

    ui.connectionHandler = {
        status: ConnectionStatus.DISCONNECTED,
        reconnectAttempts: 0,
        connect: jest.fn(),
        disconnect: jest.fn()
    };

    ui.statsCollector = {
        recordPacket: jest.fn(),
        recordUnderrun: jest.fn(),
        reset: jest.fn(),
        getStats: jest.fn(() => ({
            packetsReceived: 0,
            packetsPerSecond: 0,
            latencyMs: 0,
            bufferUnderruns: 0,
            quality: 'good'
        }))
    };

    ui.visualizer = { update: jest.fn(), clear: jest.fn() };

    return ui;
}

describe('UIController._handlePlay — fresh start', () => {
    test('initializes audio engine and connects on first play', () => {
        const ui = makeUI();
        ui.isPlaying = false;

        ui._handlePlay();

        expect(ui.audioEngine.initialize).toHaveBeenCalled();
        expect(ui.connectionHandler.connect).toHaveBeenCalled();
        expect(ui.isPlaying).toBe(true);
    });

    test('shows error when audio engine fails to initialize', () => {
        const ui = makeUI();
        ui.isPlaying = false;
        ui.audioEngine.initialize.mockReturnValue(false);

        ui._handlePlay();

        expect(ui.connectionHandler.connect).not.toHaveBeenCalled();
        expect(ui.isPlaying).toBe(false);
    });
});

describe('UIController._handlePlay — session active, connected', () => {
    test('calls resume and updates status when already streaming', () => {
        const ui = makeUI();
        ui.isPlaying = true;
        ui.connectionHandler.status = ConnectionStatus.CONNECTED;

        ui._handlePlay();

        expect(ui.audioEngine.resume).toHaveBeenCalled();
        expect(ui.audioEngine.initialize).not.toHaveBeenCalled();
        expect(ui.elements.status.textContent).toContain('Streaming');
    });
});

describe('UIController._handlePlay — session active, connection failed', () => {
    test('resets reconnect counter and reconnects without reinitializing audio', () => {
        const ui = makeUI();
        ui.isPlaying = true;
        ui.connectionHandler.status = ConnectionStatus.FAILED;
        ui.connectionHandler.reconnectAttempts = 10;

        ui._handlePlay();

        expect(ui.connectionHandler.reconnectAttempts).toBe(0);
        expect(ui.connectionHandler.connect).toHaveBeenCalled();
        expect(ui.audioEngine.initialize).not.toHaveBeenCalled();
    });

    test('same behavior when status is DISCONNECTED', () => {
        const ui = makeUI();
        ui.isPlaying = true;
        ui.connectionHandler.status = ConnectionStatus.DISCONNECTED;

        ui._handlePlay();

        expect(ui.connectionHandler.connect).toHaveBeenCalled();
    });
});

describe('UIController._handlePlay — session active, connecting/reconnecting', () => {
    test.each([ConnectionStatus.CONNECTING, ConnectionStatus.RECONNECTING])(
        'ignores play click when status is %s',
        (status) => {
            const ui = makeUI();
            ui.isPlaying = true;
            ui.connectionHandler.status = status;

            ui._handlePlay();

            expect(ui.audioEngine.initialize).not.toHaveBeenCalled();
            expect(ui.connectionHandler.connect).not.toHaveBeenCalled();
        }
    );
});

describe('UIController._handleStop', () => {
    test('disconnects, stops audio, resets stats, and clears isPlaying', () => {
        const ui = makeUI();
        ui.isPlaying = true;

        ui._handleStop();

        expect(ui.connectionHandler.disconnect).toHaveBeenCalled();
        expect(ui.audioEngine.stop).toHaveBeenCalled();
        expect(ui.statsCollector.reset).toHaveBeenCalled();
        expect(ui.isPlaying).toBe(false);
        expect(ui.elements.status.textContent).toBe('Idle');
    });
});

describe('UIController._handlePause', () => {
    test('pauses audio engine and updates status', () => {
        const ui = makeUI();

        ui._handlePause();

        expect(ui.audioEngine.pause).toHaveBeenCalled();
        expect(ui.elements.status.textContent).toBe('Paused');
    });
});

describe('UIController._handleMute', () => {
    test('mutes and updates button label to UNMUTE', () => {
        const ui = makeUI();
        ui.audioEngine.isMuted = false;

        ui._handleMute();

        expect(ui.audioEngine.setMuted).toHaveBeenCalledWith(true);
        expect(ui.elements.muteBtn.textContent).toBe('UNMUTE');
    });

    test('unmutes and updates button label to MUTE', () => {
        const ui = makeUI();
        ui.audioEngine.isMuted = true;

        ui._handleMute();

        expect(ui.audioEngine.setMuted).toHaveBeenCalledWith(false);
        expect(ui.elements.muteBtn.textContent).toBe('MUTE');
    });
});

describe('UIController.updateStats', () => {
    test('updates all stats DOM elements', () => {
        const ui = makeUI();

        ui.updateStats({
            packetsReceived: 1234,
            packetsPerSecond: 44,
            latencyMs: 0,
            bufferUnderruns: 3,
            quality: 'degraded'
        });

        expect(ui.elements.packetsPerSecond.textContent).toBe(44);
        expect(ui.elements.latency.textContent).toBe('--'); // 0 ms shows placeholder
        expect(ui.elements.quality.textContent).toBe('DEGRADED');
        expect(ui.elements.quality.className).toBe('quality-degraded');
        expect(ui.elements.totalPackets.textContent).toBe(1234);
        expect(ui.elements.underruns.textContent).toBe(3);
    });

    test('shows latency value when non-zero', () => {
        const ui = makeUI();

        ui.updateStats({
            packetsReceived: 0,
            packetsPerSecond: 0,
            latencyMs: 42,
            bufferUnderruns: 0,
            quality: 'good'
        });

        expect(ui.elements.latency.textContent).toBe('42ms');
    });
});

describe('UIController._handleStatusChange', () => {
    test('sets status to Streaming on CONNECTED', () => {
        const ui = makeUI();
        ui._handleStatusChange(ConnectionStatus.CONNECTED, {});
        expect(ui.elements.status.textContent).toContain('Streaming');
    });

    test('shows reconnect count during RECONNECTING', () => {
        const ui = makeUI();
        ui._handleStatusChange(ConnectionStatus.RECONNECTING, { attempts: 3, maxAttempts: 10 });
        expect(ui.elements.status.textContent).toContain('3');
        expect(ui.elements.status.textContent).toContain('10');
    });

    test('shows error with suggestions on FAILED', () => {
        const ui = makeUI();
        ui._handleStatusChange(ConnectionStatus.FAILED, {});
        // The error text should indicate failure
        expect(ui.elements.status.textContent).toMatch(/fail|error/i);
    });
});
