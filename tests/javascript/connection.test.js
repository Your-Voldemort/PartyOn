/**
 * Tests for ConnectionHandler — reconnect logic, stale socket cleanup,
 * and config-driven maxReconnectAttempts.
 */

import { ConnectionHandler, ConnectionStatus } from '../../static/js/connection.js';

// Minimal WebSocket mock
class MockWebSocket {
    constructor(url) {
        this.url = url;
        this.readyState = WebSocket.CONNECTING;
        this.onopen = null;
        this.onclose = null;
        this.onerror = null;
        this.onmessage = null;
        this.close = jest.fn(() => { this.readyState = WebSocket.CLOSING; });
    }

    simulateOpen() {
        this.readyState = WebSocket.OPEN;
        this.onopen && this.onopen();
    }

    simulateClose(code = 1000) {
        this.readyState = WebSocket.CLOSED;
        this.onclose && this.onclose({ code });
    }
}

// Patch global WebSocket before each test
let MockWS;
beforeEach(() => {
    MockWS = jest.fn(url => new MockWebSocket(url));
    MockWS.CONNECTING = 0;
    MockWS.OPEN = 1;
    MockWS.CLOSING = 2;
    MockWS.CLOSED = 3;
    global.WebSocket = MockWS;
    jest.useFakeTimers();
});

afterEach(() => {
    jest.useRealTimers();
});

function makeHandler(overrides = {}) {
    return new ConnectionHandler({
        wsUrl: 'ws://localhost:8765',
        onData: jest.fn(),
        onStatusChange: jest.fn(),
        ...overrides
    });
}

describe('ConnectionHandler.getReconnectDelay', () => {
    test('returns baseDelay for attempt 0', () => {
        const h = makeHandler();
        expect(h.getReconnectDelay(0)).toBe(1000);
    });

    test('doubles with each attempt', () => {
        const h = makeHandler();
        expect(h.getReconnectDelay(1)).toBe(2000);
        expect(h.getReconnectDelay(2)).toBe(4000);
    });

    test('is capped at maxDelay', () => {
        const h = makeHandler();
        expect(h.getReconnectDelay(100)).toBe(h.maxDelay);
    });

    test('delay is always positive', () => {
        const h = makeHandler();
        for (let i = 0; i < 20; i++) {
            expect(h.getReconnectDelay(i)).toBeGreaterThan(0);
        }
    });
});

describe('ConnectionHandler.connect', () => {
    test('sets status to CONNECTING and creates WebSocket', () => {
        const h = makeHandler();
        h.connect();

        expect(h.status).toBe(ConnectionStatus.CONNECTING);
        expect(MockWS).toHaveBeenCalledWith('ws://localhost:8765');
        expect(h.ws).not.toBeNull();
    });

    test('is no-op when already OPEN', () => {
        const h = makeHandler();
        h.connect();
        h.ws.readyState = WebSocket.OPEN;

        MockWS.mockClear();
        h.connect(); // second call

        expect(MockWS).not.toHaveBeenCalled();
    });

    test('closes stale CONNECTING socket before creating new one', () => {
        const h = makeHandler();
        h.connect();
        const staleWs = h.ws;
        staleWs.readyState = WebSocket.CONNECTING;

        h.connect(); // reconnect attempt

        expect(staleWs.close).toHaveBeenCalled();
        expect(MockWS).toHaveBeenCalledTimes(2);
    });

    test('detaches handlers from stale socket to prevent duplicate reconnect', () => {
        const h = makeHandler();
        h.connect();
        const staleWs = h.ws;
        staleWs.readyState = WebSocket.CLOSING;

        h.connect();

        expect(staleWs.onclose).toBeNull();
        expect(staleWs.onerror).toBeNull();
    });
});

describe('ConnectionHandler.disconnect', () => {
    test('sets status to DISCONNECTED and closes socket', () => {
        const h = makeHandler();
        h.connect();
        h.ws.readyState = WebSocket.OPEN;

        h.disconnect();

        expect(h.status).toBe(ConnectionStatus.DISCONNECTED);
        expect(h.ws).toBeNull();
        expect(h.reconnectAttempts).toBe(0);
    });

    test('clears pending reconnect timer', () => {
        const h = makeHandler();
        h.reconnectTimer = setTimeout(() => {}, 10000);

        h.disconnect();

        // After disconnect, no reconnect should be scheduled
        expect(h.reconnectTimer).toBeNull();
    });
});

describe('ConnectionHandler.scheduleReconnect', () => {
    test('transitions to FAILED after maxReconnectAttempts', () => {
        const h = makeHandler({ maxReconnectAttempts: 3 });
        h.status = ConnectionStatus.CONNECTED;

        h.reconnectAttempts = 3;
        h.scheduleReconnect();

        expect(h.status).toBe(ConnectionStatus.FAILED);
    });

    test('transitions to RECONNECTING while under limit', () => {
        const h = makeHandler();
        h.status = ConnectionStatus.CONNECTED;
        h.reconnectAttempts = 0;

        h.scheduleReconnect();

        expect(h.status).toBe(ConnectionStatus.RECONNECTING);
    });

    test('does not reconnect when status is DISCONNECTED', () => {
        const h = makeHandler();
        h.status = ConnectionStatus.DISCONNECTED;

        h.scheduleReconnect();

        expect(h.status).toBe(ConnectionStatus.DISCONNECTED);
    });
});

describe('ConnectionHandler — maxReconnectAttempts from options', () => {
    test('respects custom maxReconnectAttempts from constructor', () => {
        const h = makeHandler({ maxReconnectAttempts: 5 });
        expect(h.maxReconnectAttempts).toBe(5);
    });

    test('defaults to 10 when not specified', () => {
        const h = makeHandler();
        expect(h.maxReconnectAttempts).toBe(10);
    });
});
