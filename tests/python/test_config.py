"""Tests for configuration loading and validation."""

import json
import os
import tempfile
from pathlib import Path

import pytest

from src.config import ServerConfig, load_config, validate_config


class TestLoadConfig:
    def test_creates_default_file_when_missing(self, tmp_path):
        config_path = tmp_path / "config.json"
        config = load_config(str(config_path))

        assert config_path.exists()
        assert isinstance(config, ServerConfig)
        assert config.http_port == 5000
        assert config.ws_port == 8765

    def test_loads_valid_config(self, tmp_path):
        config_path = tmp_path / "config.json"
        config_path.write_text(json.dumps({
            "http_port": 9000,
            "ws_port": 9001,
            "sample_rate": 48000,
            "channels": 2,
            "block_size": 2048,
            "log_level": "DEBUG"
        }))

        config = load_config(str(config_path))

        assert config.http_port == 9000
        assert config.ws_port == 9001
        assert config.sample_rate == 48000
        assert config.block_size == 2048
        assert config.log_level == "DEBUG"

    def test_unknown_keys_are_stripped(self, tmp_path):
        config_path = tmp_path / "config.json"
        config_path.write_text(json.dumps({
            "http_port": 5000,
            "totally_unknown_key": "value"
        }))

        config = load_config(str(config_path))

        assert not hasattr(config, "totally_unknown_key")
        assert config.http_port == 5000

    def test_falls_back_to_defaults_on_json_error(self, tmp_path):
        config_path = tmp_path / "config.json"
        config_path.write_text("{ not valid json }")

        config = load_config(str(config_path))

        assert isinstance(config, ServerConfig)
        assert config.http_port == 5000

    def test_falls_back_to_defaults_on_generic_error(self, tmp_path):
        config_path = tmp_path / "config.json"
        config_path.write_text(json.dumps({"http_port": "not_an_int"}))

        config = load_config(str(config_path))

        assert isinstance(config, ServerConfig)


class TestValidateConfig:
    def test_valid_config_passes_through(self):
        config = ServerConfig(
            sample_rate=44100,
            block_size=1024,
            log_level="INFO",
            http_port=5000,
            ws_port=8765
        )
        result = validate_config(config)
        assert result.sample_rate == 44100
        assert result.block_size == 1024
        assert result.log_level == "INFO"

    def test_invalid_sample_rate_uses_default(self):
        config = ServerConfig(sample_rate=99999)
        result = validate_config(config)
        assert result.sample_rate == ServerConfig().sample_rate

    def test_block_size_too_small_uses_default(self):
        config = ServerConfig(block_size=1)
        result = validate_config(config)
        assert result.block_size == ServerConfig().block_size

    def test_block_size_too_large_uses_default(self):
        config = ServerConfig(block_size=99999)
        result = validate_config(config)
        assert result.block_size == ServerConfig().block_size

    def test_block_size_boundary_values_accepted(self):
        config = ServerConfig(block_size=512)
        assert validate_config(config).block_size == 512

        config = ServerConfig(block_size=4096)
        assert validate_config(config).block_size == 4096

    def test_invalid_log_level_uses_default(self):
        config = ServerConfig(log_level="VERBOSE")
        result = validate_config(config)
        assert result.log_level == ServerConfig().log_level

    def test_log_level_normalised_to_uppercase(self):
        config = ServerConfig(log_level="debug")
        result = validate_config(config)
        assert result.log_level == "DEBUG"

    def test_invalid_http_port_uses_default(self):
        config = ServerConfig(http_port=0)
        result = validate_config(config)
        assert result.http_port == ServerConfig().http_port

        config = ServerConfig(http_port=99999)
        result = validate_config(config)
        assert result.http_port == ServerConfig().http_port

    def test_invalid_ws_port_uses_default(self):
        config = ServerConfig(ws_port=-1)
        result = validate_config(config)
        assert result.ws_port == ServerConfig().ws_port

    def test_all_valid_sample_rates_accepted(self):
        for rate in [22050, 44100, 48000]:
            config = ServerConfig(sample_rate=rate)
            assert validate_config(config).sample_rate == rate
