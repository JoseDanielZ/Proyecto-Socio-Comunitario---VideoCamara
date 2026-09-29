from pathlib import Path

import pytest

from lpr.config import ConfigError, load_config


def test_load_config_valid(tmp_path: Path):
    config_yaml = tmp_path / "config.yaml"
    config_yaml.write_text(
        """
source:
  type: "file"
  path_or_url: "data/videos/sample.mp4"

line_zones:
  - name: "linea_principal"
    start: [0, 480]
    end: [1280, 480]
"""
    )

    config = load_config(config_yaml)

    assert config.source.type == "file"
    assert config.source.path_or_url == "data/videos/sample.mp4"
    assert len(config.line_zones) == 1
    assert config.line_zones[0].start == (0, 480)


def test_load_config_missing_file(tmp_path: Path):
    with pytest.raises(ConfigError):
        load_config(tmp_path / "does_not_exist.yaml")


def test_load_config_invalid_source_type(tmp_path: Path):
    config_yaml = tmp_path / "config.yaml"
    config_yaml.write_text(
        """
source:
  type: "webcam"
  path_or_url: "0"

line_zones:
  - name: "linea_principal"
    start: [0, 480]
    end: [1280, 480]
"""
    )

    with pytest.raises(ConfigError):
        load_config(config_yaml)


def test_load_config_empty_line_zones(tmp_path: Path):
    config_yaml = tmp_path / "config.yaml"
    config_yaml.write_text(
        """
source:
  type: "file"
  path_or_url: "data/videos/sample.mp4"

line_zones: []
"""
    )

    with pytest.raises(ConfigError):
        load_config(config_yaml)
