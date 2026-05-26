"""
WebSocket server module for the Audio Streamer.

Handles WebSocket connections and audio broadcasting.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

import websockets

from .config import ServerConfig
from .audio_capture import AudioCapture
from .connection_manager import ConnectionManager


class AudioWebSocketServer:
    """Handles WebSocket connections and audio broadcasting."""
    
    def __init__(
        self,
        config: ServerConfig,
        audio_capture: AudioCapture,
        connection_manager: ConnectionManager,
        logger: logging.Logger
    ):
        """
        Initialize the WebSocket server.
        
        Args:
            config: Server configuration.
            audio_capture: Audio capture module.
            connection_manager: Connection manager.
            logger: Logger instance.
        """
        self.config = config
        self.audio_capture = audio_capture
        self.connection_manager = connection_manager
        self.logger = logger
        self.server: Optional[websockets.WebSocketServer] = None
        self.is_running: bool = False
        self._broadcast_task: Optional[asyncio.Task] = None
        self._timeout_task: Optional[asyncio.Task] = None
    
    async def handler(self, websocket: websockets.WebSocketServerProtocol) -> None:
        """
        Handle individual WebSocket connection.
        
        Args:
            websocket: The WebSocket connection.
        """
        client_id = self.connection_manager.add_client(websocket)

        try:
            await websocket.wait_closed()
        except Exception as e:
            self.logger.debug(f"Client handler error for {client_id}: {e}")
        finally:
            self.connection_manager.remove_client(client_id)
    
    async def broadcast_loop(self) -> None:
        """Main loop for capturing and broadcasting audio."""
        self.logger.info("Starting audio broadcast loop")

        loop = asyncio.get_event_loop()
        error_streak = 0

        while self.is_running:
            data = await loop.run_in_executor(None, self.audio_capture.read_block)

            if data:
                error_streak = 0
                if self.connection_manager.get_client_count() > 0:
                    await self.connection_manager.broadcast(data)
                await asyncio.sleep(0)
            else:
                error_streak += 1
                # Attempt reinitialize after 3 consecutive failures
                if error_streak >= 3 and self.is_running:
                    self.logger.warning(
                        f"Audio capture failing (streak: {error_streak}), "
                        "attempting reinitialize"
                    )
                    reinitialized = await loop.run_in_executor(
                        None, self.audio_capture.reinitialize
                    )
                    if reinitialized:
                        self.logger.info("Audio capture reinitialized successfully")
                        error_streak = 0
                        continue
                # Exponential backoff: 0.1s, 0.2s, 0.4s … capped at 30s
                delay = min(0.1 * (2 ** min(error_streak - 1, 8)), 30.0)
                await asyncio.sleep(delay)
    
    async def start(self, host: str = "0.0.0.0") -> None:
        """
        Start the WebSocket server.
        
        Args:
            host: Host address to bind to.
        """
        self.is_running = True
        
        self.server = await websockets.serve(
            self.handler,
            host,
            self.config.ws_port,
            max_size=None
        )
        
        self.logger.info(f"WebSocket server started on ws://{host}:{self.config.ws_port}")

        self._broadcast_task = asyncio.create_task(self.broadcast_loop())
        self._timeout_task = asyncio.create_task(self._idle_timeout_sweep())
    
    async def _idle_timeout_sweep(self) -> None:
        """Periodically close clients that have been idle past client_timeout_seconds."""
        timeout = self.config.client_timeout_seconds
        if timeout <= 0:
            return

        interval = max(timeout // 2, 15)
        while self.is_running:
            await asyncio.sleep(interval)
            if not self.is_running:
                break

            # Skip eviction while audio capture is down to avoid false positives
            if not self.audio_capture.is_running:
                continue

            cutoff = datetime.now() - timedelta(seconds=timeout)
            idle_clients = self.connection_manager.get_idle_clients(cutoff)

            for client_info in idle_clients:
                self.logger.info(f"Closing idle client: {client_info.address}")
                try:
                    await client_info.websocket.close(1001, "Idle timeout")
                except Exception:
                    pass

    async def stop(self) -> None:
        """Stop the server gracefully."""
        self.logger.info("Stopping WebSocket server")
        self.is_running = False

        # Stop accepting new connections before touching existing ones
        if self.server:
            self.server.close()
            await self.server.wait_closed()

        # Gracefully close all existing client connections
        await self.connection_manager.close_all()

        # Cancel background tasks
        for task in (self._broadcast_task, self._timeout_task):
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        self.logger.info("WebSocket server stopped")
