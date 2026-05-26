"""Tests for AudioCapture — device discovery, stream lifecycle, and error cleanup."""

import logging
from unittest.mock import MagicMock, call, patch, PropertyMock

import pytest

from src.audio_capture import AudioCapture
from src.config import ServerConfig


def make_logger():
    logger = logging.getLogger("test_audio")
    logger.addHandler(logging.NullHandler())
    return logger


def make_capture():
    return AudioCapture(ServerConfig(), make_logger())


def make_stream(start_raises=False, read_raises=False):
    """Build a mock sd.InputStream."""
    stream = MagicMock()
    if start_raises:
        stream.start.side_effect = Exception("device busy")
    if read_raises:
        stream.read.side_effect = Exception("read error")
    stream.read.return_value = (MagicMock(tobytes=lambda: b"\x00" * 2048), False)
    return stream


class TestReadBlock:
    def test_returns_none_when_not_initialized(self):
        capture = make_capture()
        assert capture.read_block() is None

    def test_returns_bytes_when_running(self):
        capture = make_capture()
        stream = MagicMock()
        stream.read.return_value = (MagicMock(tobytes=lambda: b"audio"), False)
        capture.stream = stream
        capture.is_running = True

        result = capture.read_block()

        assert result == b"audio"

    def test_returns_none_on_read_exception(self):
        capture = make_capture()
        capture.stream = make_stream(read_raises=True)
        capture.is_running = True

        assert capture.read_block() is None

    def test_logs_warning_on_overflow(self, caplog):
        capture = make_capture()
        stream = MagicMock()
        stream.read.return_value = (MagicMock(tobytes=lambda: b"x"), True)  # overflowed=True
        capture.stream = stream
        capture.is_running = True

        with caplog.at_level(logging.WARNING):
            capture.read_block()

        assert "overflow" in caplog.text.lower()


class TestStop:
    def test_stop_closes_stream_and_resets_state(self):
        capture = make_capture()
        stream = MagicMock()
        capture.stream = stream
        capture.is_running = True

        capture.stop()

        stream.stop.assert_called_once()
        stream.close.assert_called_once()
        assert capture.stream is None
        assert not capture.is_running

    def test_stop_is_safe_when_no_stream(self):
        capture = make_capture()
        capture.stop()  # must not raise


class TestStreamLeakPrevention:
    def test_try_wasapi_does_not_leak_stream_on_start_failure(self):
        """A stream that fails to start must be cleaned up before returning False."""
        capture = make_capture()

        with patch("src.audio_capture.sd") as mock_sd:
            failing_stream = make_stream(start_raises=True)
            mock_sd.InputStream.return_value = failing_stream
            mock_sd.WasapiSettings.return_value = MagicMock()
            mock_sd.query_devices.return_value = [
                {"name": "Speakers", "max_output_channels": 2, "max_input_channels": 0}
            ]

            result = capture._try_wasapi(0)

        assert result is False
        failing_stream.stop.assert_called()
        failing_stream.close.assert_called()
        assert capture.stream is None

    def test_try_wasapi_only_assigns_stream_on_success(self):
        capture = make_capture()

        with patch("src.audio_capture.sd") as mock_sd:
            good_stream = MagicMock()
            mock_sd.InputStream.return_value = good_stream
            mock_sd.WasapiSettings.return_value = MagicMock()
            mock_sd.query_devices.return_value = {"name": "Speakers"}

            result = capture._try_wasapi(0)

        assert result is True
        assert capture.stream is good_stream

    def test_try_stereo_mix_does_not_leak_on_failure(self):
        capture = make_capture()

        with patch("src.audio_capture.sd") as mock_sd:
            failing_stream = make_stream(start_raises=True)
            mock_sd.InputStream.return_value = failing_stream
            mock_sd.query_devices.return_value = {"name": "Stereo Mix"}

            result = capture._try_stereo_mix([0])

        assert result is False
        failing_stream.stop.assert_called()
        failing_stream.close.assert_called()
        assert capture.stream is None


class TestStereoFallbackFilter:
    def test_monitor_devices_are_included(self):
        capture = make_capture()

        with patch("src.audio_capture.sd") as mock_sd:
            devices = [
                {"name": "Headphones", "max_output_channels": 2, "max_input_channels": 0},
                {"name": "Microphone", "max_output_channels": 0, "max_input_channels": 1},
                {"name": "Monitor of Built-in Audio", "max_output_channels": 0, "max_input_channels": 2},
                {"name": "Stereo Mix", "max_output_channels": 0, "max_input_channels": 2},
            ]
            mock_sd.query_devices.return_value = devices

            candidates = [
                i for i, d in enumerate(devices)
                if "stereo" in d["name"].lower() or "monitor" in d["name"].lower()
            ]

        # Only the monitor source and Stereo Mix should be candidates — NOT the plain mic
        assert 1 not in candidates  # Microphone excluded
        assert 2 in candidates      # Monitor included
        assert 3 in candidates      # Stereo Mix included

    def test_initialize_calls_stop_on_all_device_failure(self):
        """If no device works, initialize must call stop() to release any partial state."""
        capture = make_capture()

        with patch("src.audio_capture.sd") as mock_sd:
            mock_sd.query_devices.return_value = [
                {"name": "Broken Device", "max_output_channels": 2, "max_input_channels": 0}
            ]
            mock_sd.InputStream.side_effect = Exception("open failed")
            mock_sd.WasapiSettings.return_value = MagicMock()

            with patch.object(capture, "stop") as mock_stop:
                result = capture.initialize()

        assert result is False
        mock_stop.assert_called()


class TestReinitialize:
    def test_reinitialize_calls_stop_then_initialize(self):
        capture = make_capture()

        with patch.object(capture, "stop") as mock_stop, \
             patch.object(capture, "initialize", return_value=True) as mock_init:
            result = capture.reinitialize()

        mock_stop.assert_called_once()
        mock_init.assert_called_once()
        assert result is True
