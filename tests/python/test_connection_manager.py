"""Tests for ConnectionManager — client lifecycle, stats, and thread safety."""

import asyncio
import threading
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.connection_manager import ClientInfo, ConnectionManager


def make_logger():
    import logging
    logger = logging.getLogger("test")
    logger.addHandler(logging.NullHandler())
    return logger


def make_websocket(address=("127.0.0.1", 12345)):
    ws = MagicMock()
    ws.remote_address = address
    ws.send = AsyncMock()
    ws.close = AsyncMock()
    return ws


class TestAddRemoveClient:
    def test_add_client_stores_info(self):
        manager = ConnectionManager(make_logger())
        ws = make_websocket()

        client_id = manager.add_client(ws)

        assert client_id == "127.0.0.1:12345"
        assert client_id in manager.clients
        assert manager.clients[client_id].websocket is ws

    def test_add_client_increments_total_served(self):
        manager = ConnectionManager(make_logger())

        manager.add_client(make_websocket(("1.2.3.4", 100)))
        manager.add_client(make_websocket(("1.2.3.4", 101)))

        assert manager.total_served == 2

    def test_add_client_with_none_remote_address(self):
        manager = ConnectionManager(make_logger())
        ws = make_websocket(address=None)

        client_id = manager.add_client(ws)

        assert "unknown:" in client_id
        assert client_id in manager.clients

    def test_remove_client_deletes_entry(self):
        manager = ConnectionManager(make_logger())
        ws = make_websocket()
        client_id = manager.add_client(ws)

        manager.remove_client(client_id)

        assert client_id not in manager.clients

    def test_remove_nonexistent_client_is_safe(self):
        manager = ConnectionManager(make_logger())
        manager.remove_client("nonexistent:9999")  # must not raise


class TestGetStats:
    def test_empty_stats(self):
        manager = ConnectionManager(make_logger())
        stats = manager.get_stats()

        assert stats["connected"] == 0
        assert stats["total_served"] == 0
        assert stats["clients"] == []

    def test_stats_reflect_connected_clients(self):
        manager = ConnectionManager(make_logger())
        manager.add_client(make_websocket(("10.0.0.1", 1000)))
        manager.add_client(make_websocket(("10.0.0.2", 1001)))

        stats = manager.get_stats()

        assert stats["connected"] == 2
        assert stats["total_served"] == 2
        assert len(stats["clients"]) == 2

    def test_get_client_count(self):
        manager = ConnectionManager(make_logger())
        assert manager.get_client_count() == 0

        manager.add_client(make_websocket())
        assert manager.get_client_count() == 1


class TestGetIdleClients:
    def test_finds_clients_past_cutoff(self):
        manager = ConnectionManager(make_logger())
        ws = make_websocket()
        cid = manager.add_client(ws)

        # Backdate the last_activity
        manager.clients[cid].last_activity = datetime.now() - timedelta(minutes=5)

        cutoff = datetime.now() - timedelta(seconds=30)
        idle = manager.get_idle_clients(cutoff)

        assert len(idle) == 1
        assert idle[0].websocket is ws

    def test_ignores_recently_active_clients(self):
        manager = ConnectionManager(make_logger())
        manager.add_client(make_websocket())

        cutoff = datetime.now() - timedelta(minutes=10)
        idle = manager.get_idle_clients(cutoff)

        assert idle == []


class TestBroadcast:
    def test_broadcast_sends_to_all_clients(self):
        manager = ConnectionManager(make_logger())
        ws1 = make_websocket(("1.0.0.1", 1))
        ws2 = make_websocket(("1.0.0.2", 2))
        manager.add_client(ws1)
        manager.add_client(ws2)

        asyncio.run(manager.broadcast(b"audio_data"))

        ws1.send.assert_awaited_once_with(b"audio_data")
        ws2.send.assert_awaited_once_with(b"audio_data")

    def test_broadcast_removes_failed_client(self):
        manager = ConnectionManager(make_logger())
        ws_ok = make_websocket(("1.0.0.1", 1))
        ws_bad = make_websocket(("1.0.0.2", 2))
        ws_bad.send = AsyncMock(side_effect=Exception("connection lost"))

        manager.add_client(ws_ok)
        cid_bad = manager.add_client(ws_bad)

        asyncio.run(manager.broadcast(b"data"))

        assert cid_bad not in manager.clients
        assert manager.get_client_count() == 1

    def test_broadcast_increments_packets_sent(self):
        manager = ConnectionManager(make_logger())
        ws = make_websocket()
        cid = manager.add_client(ws)

        asyncio.run(manager.broadcast(b"chunk"))

        assert manager.clients[cid].packets_sent == 1


class TestCloseAll:
    def test_close_all_sends_close_frame_and_clears_dict(self):
        manager = ConnectionManager(make_logger())
        ws = make_websocket()
        manager.add_client(ws)

        asyncio.run(manager.close_all("shutdown"))

        ws.close.assert_awaited_once_with(1001, "shutdown")
        assert manager.get_client_count() == 0

    def test_close_all_tolerates_close_failure(self):
        manager = ConnectionManager(make_logger())
        ws = make_websocket()
        ws.close = AsyncMock(side_effect=Exception("already closed"))
        manager.add_client(ws)

        asyncio.run(manager.close_all())  # must not raise


class TestThreadSafety:
    def test_concurrent_add_and_get_stats_do_not_raise(self):
        """Hammer add_client from multiple threads while get_stats runs."""
        manager = ConnectionManager(make_logger())
        errors = []

        def adder(port):
            try:
                for i in range(50):
                    ws = make_websocket(("127.0.0.1", port * 100 + i))
                    manager.add_client(ws)
            except Exception as exc:
                errors.append(exc)

        def reader():
            try:
                for _ in range(200):
                    manager.get_stats()
                    manager.get_client_count()
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=adder, args=(p,)) for p in range(5)]
        threads.append(threading.Thread(target=reader))

        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert errors == [], f"Thread safety errors: {errors}"
