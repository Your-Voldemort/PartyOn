"""Tests for AudioWebSocketServer — broadcast loop, shutdown ordering, idle sweep."""

import asyncio
import logging
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

from src.audio_capture import AudioCapture
from src.config import ServerConfig
from src.connection_manager import ConnectionManager
from src.ws_server import AudioWebSocketServer


def make_logger():
    logger = logging.getLogger("test_ws")
    logger.addHandler(logging.NullHandler())
    return logger


def make_server():
    config = ServerConfig(client_timeout_seconds=30)
    audio_capture = MagicMock(spec=AudioCapture)
    audio_capture.read_block.return_value = b"\x00" * 2048
    audio_capture.is_running = True
    audio_capture.reinitialize.return_value = True
    connection_manager = MagicMock(spec=ConnectionManager)
    connection_manager.get_client_count.return_value = 1
    connection_manager.broadcast = AsyncMock()
    connection_manager.close_all = AsyncMock()
    connection_manager.get_idle_clients.return_value = []

    return AudioWebSocketServer(config, audio_capture, connection_manager, make_logger())


class TestBroadcastLoop:
    def test_broadcasts_data_when_clients_connected(self):
        server = make_server()
        server.is_running = True

        async def run_one_iteration():
            server.audio_capture.read_block.return_value = b"audio"
            # Run one iteration by patching is_running to stop after one loop
            call_count = 0
            original = server.connection_manager.broadcast

            async def counting_broadcast(data):
                nonlocal call_count
                call_count += 1
                server.is_running = False
                await original(data)

            server.connection_manager.broadcast = counting_broadcast
            await server.broadcast_loop()
            return call_count

        count = asyncio.run(run_one_iteration())
        assert count == 1

    def test_skips_broadcast_when_no_clients(self):
        server = make_server()
        server.connection_manager.get_client_count.return_value = 0
        server.is_running = True

        async def run():
            server.audio_capture.read_block.return_value = b"data"
            # Stop after one pass
            original_count = server.connection_manager.get_client_count

            call_count = 0

            def count_and_stop():
                nonlocal call_count
                call_count += 1
                server.is_running = False
                return 0

            server.connection_manager.get_client_count = count_and_stop
            await server.broadcast_loop()

        asyncio.run(run())
        server.connection_manager.broadcast.assert_not_awaited()

    def test_backoff_on_read_failure(self):
        """None reads must not spin; a delay must be observed."""
        server = make_server()
        server.audio_capture.read_block.return_value = None
        server.is_running = True

        sleep_calls = []

        async def mock_sleep(delay):
            sleep_calls.append(delay)
            server.is_running = False

        async def run():
            with patch("src.ws_server.asyncio.sleep", side_effect=mock_sleep):
                await server.broadcast_loop()

        asyncio.run(run())

        assert sleep_calls, "broadcast_loop must sleep on None read"
        assert sleep_calls[0] > 0, "delay must be positive"

    def test_attempts_reinitialize_after_three_consecutive_failures(self):
        server = make_server()
        fail_count = 0

        def read_then_stop():
            nonlocal fail_count
            fail_count += 1
            if fail_count >= 3:
                server.is_running = False
            return None

        server.audio_capture.read_block.side_effect = read_then_stop

        async def run():
            with patch("src.ws_server.asyncio.sleep"):
                await server.broadcast_loop()

        asyncio.run(run())

        # reinitialize should have been called in the executor
        server.audio_capture.reinitialize.assert_called()


class TestStopOrdering:
    def test_server_closed_before_close_all(self):
        """server.close() must be called before connection_manager.close_all()."""
        server = make_server()
        call_order = []

        mock_ws_server = MagicMock()
        mock_ws_server.close = MagicMock(side_effect=lambda: call_order.append("server_close"))
        mock_ws_server.wait_closed = AsyncMock(side_effect=lambda: call_order.append("wait_closed"))
        server.server = mock_ws_server

        async def close_all(reason="Server shutting down"):
            call_order.append("close_all")

        server.connection_manager.close_all = close_all
        server._broadcast_task = None
        server._timeout_task = None

        asyncio.run(server.stop())

        assert call_order.index("server_close") < call_order.index("close_all"), \
            "server.close() must precede close_all()"


class TestIdleTimeoutSweep:
    def test_does_not_evict_during_capture_outage(self):
        server = make_server()
        server.audio_capture.is_running = False  # capture is down

        idle_ws = MagicMock()
        idle_ws.close = AsyncMock()
        idle_client = MagicMock()
        idle_client.websocket = idle_ws
        server.connection_manager.get_idle_clients.return_value = [idle_client]

        async def run():
            server.is_running = True
            with patch("src.ws_server.asyncio.sleep") as mock_sleep:
                async def sleep_then_stop(n):
                    server.is_running = False
                mock_sleep.side_effect = sleep_then_stop
                await server._idle_timeout_sweep()

        asyncio.run(run())
        idle_ws.close.assert_not_awaited()

    def test_evicts_idle_clients_when_audio_running(self):
        server = make_server()
        server.audio_capture.is_running = True

        idle_ws = MagicMock()
        idle_ws.close = AsyncMock()
        idle_client = MagicMock()
        idle_client.websocket = idle_ws
        idle_client.address = "1.2.3.4:999"
        server.connection_manager.get_idle_clients.return_value = [idle_client]

        async def run():
            server.is_running = True
            with patch("src.ws_server.asyncio.sleep") as mock_sleep:
                call_count = 0

                async def sleep_then_stop(n):
                    nonlocal call_count
                    call_count += 1
                    if call_count >= 2:
                        server.is_running = False

                mock_sleep.side_effect = sleep_then_stop
                await server._idle_timeout_sweep()

        asyncio.run(run())
        idle_ws.close.assert_awaited()

    def test_no_sweep_when_timeout_zero(self):
        config = ServerConfig(client_timeout_seconds=0)
        server = AudioWebSocketServer(
            config, MagicMock(), MagicMock(), make_logger()
        )

        async def run():
            # Should return immediately without looping
            await server._idle_timeout_sweep()

        asyncio.run(run())
        # If we reach here without hanging, the early-return works
