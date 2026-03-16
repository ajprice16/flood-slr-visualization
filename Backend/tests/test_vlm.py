"""Unit tests for the vlm.py module.

Tests the no-data fallback (returns 0 VLM offset), the public API used
by the FastAPI endpoints, and the resolve_vlm_offset helper.
"""

import sys
import os
import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import vlm


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _reset_vlm():
    """Clear all loaded VLM state."""
    vlm._gia_grid = None
    vlm._gps_stations = None
    vlm._gps_tree = None
    vlm.get_vlm_rate.cache_clear()


# ---------------------------------------------------------------------------
# is_loaded
# ---------------------------------------------------------------------------

class TestIsLoaded:
    def setup_method(self):
        _reset_vlm()

    def test_not_loaded_initially(self):
        assert vlm.is_loaded() is False


# ---------------------------------------------------------------------------
# get_vlm_info — no-data fallback
# ---------------------------------------------------------------------------

class TestGetVlmInfoNoData:
    def setup_method(self):
        _reset_vlm()

    def test_returns_dict(self):
        info = vlm.get_vlm_info(25.0, -80.0)
        assert isinstance(info, dict)

    def test_zero_rate_when_no_data(self):
        info = vlm.get_vlm_info(25.0, -80.0)
        assert info["vlm_mm_yr"] == pytest.approx(0.0)

    def test_source_none_when_no_data(self):
        info = vlm.get_vlm_info(25.0, -80.0)
        assert info["source"] == "none"


# ---------------------------------------------------------------------------
# get_vlm_rate — no-data fallback
# ---------------------------------------------------------------------------

class TestGetVlmRateNoData:
    def setup_method(self):
        _reset_vlm()

    def test_returns_zero_when_no_data(self):
        rate = vlm.get_vlm_rate(35.0, 139.0)
        assert rate == pytest.approx(0.0)

    def test_different_locations_all_zero_when_no_data(self):
        locations = [(0, 0), (90, 0), (-90, 0), (0, 180), (45, -100)]
        for lat, lon in locations:
            assert vlm.get_vlm_rate(lat, lon) == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# resolve_vlm_offset
# ---------------------------------------------------------------------------

class TestResolveVlmOffset:
    def setup_method(self):
        _reset_vlm()

    def test_returns_zero_when_no_data(self):
        offset = vlm.resolve_vlm_offset(25.0, -80.0, 2100)
        assert offset == pytest.approx(0.0)

    def test_sign_convention_with_synthetic_rate(self, monkeypatch):
        """A subsidence rate of -2 mm/yr over 95 years (2100-2005) → offset ≈ +0.19 m.

        resolve_vlm_offset formula: (-rate_mm_yr * years_elapsed) / 1000
        Negative VLM rate (subsidence) produces positive offset (increases effective SLR).
        """
        monkeypatch.setattr(vlm, "get_vlm_rate", lambda lat, lon: -2.0)
        offset = vlm.resolve_vlm_offset(0.0, 0.0, 2100)
        # -(-2.0) * (2100 - 2005) / 1000 = 2.0 * 95 / 1000 = 0.19
        assert offset == pytest.approx(0.19, abs=0.001)

    def test_positive_uplift_reduces_offset(self, monkeypatch):
        """Uplift rate +1 mm/yr → negative offset (land rises, reduces effective SLR)."""
        monkeypatch.setattr(vlm, "get_vlm_rate", lambda lat, lon: 1.0)
        offset = vlm.resolve_vlm_offset(0.0, 0.0, 2100)
        assert offset < 0

    def test_zero_rate_gives_zero_offset(self, monkeypatch):
        monkeypatch.setattr(vlm, "get_vlm_rate", lambda lat, lon: 0.0)
        offset = vlm.resolve_vlm_offset(0.0, 0.0, 2100)
        assert offset == pytest.approx(0.0)
