/**
 * Tests for StatsCollector — PPS window, underrun tracking, quality tiers,
 * and counter reset.
 */

import { StatsCollector } from '../../static/js/stats.js';

describe('StatsCollector.recordPacket', () => {
    test('increments packetsReceived on each call', () => {
        const sc = new StatsCollector();
        sc.recordPacket();
        sc.recordPacket();
        sc.recordPacket();
        expect(sc.packetsReceived).toBe(3);
    });

    test('calculates packetsPerSecond within a 1-second window', () => {
        const sc = new StatsCollector();
        const now = Date.now();

        // Simulate 10 packets all within the last second
        for (let i = 0; i < 10; i++) {
            sc.recordPacket(now - 500 + i * 10);
        }

        expect(sc.packetsPerSecond).toBe(10);
    });

    test('excludes packets older than 1 second from PPS', () => {
        const sc = new StatsCollector();
        const now = Date.now();

        // Five stale packets
        for (let i = 0; i < 5; i++) {
            sc.recordPacket(now - 2000 + i);
        }
        // Three recent packets
        for (let i = 0; i < 3; i++) {
            sc.recordPacket(now - 100 + i);
        }
        // Record one more to trigger window cleanup
        sc.recordPacket(now);

        expect(sc.packetsPerSecond).toBe(4); // 3 + the last one = 4
    });
});

describe('StatsCollector.recordUnderrun', () => {
    test('increments bufferUnderruns', () => {
        const sc = new StatsCollector();
        sc.recordUnderrun();
        sc.recordUnderrun();
        expect(sc.bufferUnderruns).toBe(2);
    });
});

describe('StatsCollector.getStats', () => {
    test('returns all expected fields', () => {
        const sc = new StatsCollector();
        const stats = sc.getStats();

        expect(stats).toHaveProperty('packetsReceived');
        expect(stats).toHaveProperty('packetsPerSecond');
        expect(stats).toHaveProperty('latencyMs');
        expect(stats).toHaveProperty('bufferUnderruns');
        expect(stats).toHaveProperty('quality');
    });

    test('quality is good at normal packet rate', () => {
        const sc = new StatsCollector();
        const now = Date.now();
        for (let i = 0; i < 50; i++) {
            sc.recordPacket(now - (49 - i) * 10);
        }

        expect(sc.getStats().quality).toBe('good');
    });

    test('quality is degraded at low packet rate', () => {
        const sc = new StatsCollector();
        const now = Date.now();
        // 25 pps — between 20 and 35, so degraded
        for (let i = 0; i < 25; i++) {
            sc.recordPacket(now - (24 - i) * 30);
        }

        expect(sc.getStats().quality).toBe('degraded');
    });

    test('quality is poor when pps is very low', () => {
        const sc = new StatsCollector();
        const now = Date.now();
        // 10 pps — below 20 threshold
        for (let i = 0; i < 10; i++) {
            sc.recordPacket(now - (9 - i) * 50);
        }

        expect(sc.getStats().quality).toBe('poor');
    });

    test('quality is poor with many underruns', () => {
        const sc = new StatsCollector();
        const now = Date.now();
        // High packet rate but many underruns
        for (let i = 0; i < 50; i++) {
            sc.recordPacket(now - (49 - i) * 10);
        }
        for (let i = 0; i < 11; i++) {
            sc.recordUnderrun();
        }

        expect(sc.getStats().quality).toBe('poor');
    });

    test('quality is degraded with moderate underruns', () => {
        const sc = new StatsCollector();
        const now = Date.now();
        for (let i = 0; i < 50; i++) {
            sc.recordPacket(now - (49 - i) * 10);
        }
        for (let i = 0; i < 5; i++) {
            sc.recordUnderrun();
        }

        expect(sc.getStats().quality).toBe('degraded');
    });
});

describe('StatsCollector.reset', () => {
    test('clears all counters and timestamps', () => {
        const sc = new StatsCollector();
        sc.recordPacket();
        sc.recordPacket();
        sc.recordUnderrun();

        sc.reset();

        const stats = sc.getStats();
        expect(stats.packetsReceived).toBe(0);
        expect(stats.packetsPerSecond).toBe(0);
        expect(stats.bufferUnderruns).toBe(0);
    });
});
