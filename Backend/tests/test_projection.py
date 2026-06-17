"""Unit tests for the projection.py module.

Tests cover the embedded global-mean fallback path (no regional dataset file
required) and the public API used by the FastAPI endpoints.
"""

import sys
import os
import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import projection


# ---------------------------------------------------------------------------
# _interpolate_years
# ---------------------------------------------------------------------------

class TestInterpolateYears:
    years = [2030, 2040, 2050]
    values = [0.1, 0.2, 0.3]

    def test_exact_first(self):
        assert projection._interpolate_years(self.values, self.years, 2030) == pytest.approx(0.1)

    def test_exact_last(self):
        assert projection._interpolate_years(self.values, self.years, 2050) == pytest.approx(0.3)

    def test_midpoint(self):
        assert projection._interpolate_years(self.values, self.years, 2035) == pytest.approx(0.15)

    def test_before_range_clamps_to_first(self):
        assert projection._interpolate_years(self.values, self.years, 2000) == pytest.approx(0.1)

    def test_after_range_clamps_to_last(self):
        assert projection._interpolate_years(self.values, self.years, 2200) == pytest.approx(0.3)

    def test_three_quarter(self):
        # 2043 is 3/10 of the way through [2040, 2050]: 0.2 + 0.3*(0.3-0.2) = 0.23
        assert projection._interpolate_years(self.values, self.years, 2043) == pytest.approx(0.23)


# ---------------------------------------------------------------------------
# _resolve_global_mean
# ---------------------------------------------------------------------------

class TestResolveGlobalMean:
    def test_known_value_ssp245_50th_2100(self):
        value = projection._resolve_global_mean("ssp245", 2100, 50)
        assert value == pytest.approx(0.56, abs=0.01)

    def test_all_scenarios_return_positive(self):
        for scenario in projection.SCENARIOS:
            for pct in projection.PERCENTILES:
                value = projection._resolve_global_mean(scenario, 2100, pct)
                assert value is not None
                assert value > 0

    def test_higher_scenario_higher_slr_at_2100(self):
        ssp126 = projection._resolve_global_mean("ssp126", 2100, 50)
        ssp585 = projection._resolve_global_mean("ssp585", 2100, 50)
        assert ssp585 > ssp126

    def test_higher_percentile_higher_slr(self):
        p5 = projection._resolve_global_mean("ssp245", 2100, 5)
        p95 = projection._resolve_global_mean("ssp245", 2100, 95)
        assert p95 > p5

    def test_invalid_scenario_returns_none(self):
        value = projection._resolve_global_mean("invalid_scenario", 2100, 50)
        assert value is None

    def test_invalid_percentile_returns_none(self):
        value = projection._resolve_global_mean("ssp245", 2100, 99)
        assert value is None


# ---------------------------------------------------------------------------
# resolve_slr (global mean fallback — no regional dataset)
# ---------------------------------------------------------------------------

class TestResolveSlr:
    # When no regional dataset is loaded, resolve_slr fa...

    def setup_method(self):
        # Clear the lru_cache so previous tests don't pollute results
        projection.resolve_slr.cache_clear()
        # Ensure no regional dataset is loaded
        projection._projection_data = None
        projection._kdtree = None

    def test_returns_float(self):
        value = projection.resolve_slr(25.0, -80.0, "ssp245", 2100, 50)
        assert isinstance(value, float)

    def test_invalid_scenario_returns_none(self):
        value = projection.resolve_slr(25.0, -80.0, "invalid", 2100, 50)
        assert value is None

    def test_invalid_percentile_returns_none(self):
        value = projection.resolve_slr(25.0, -80.0, "ssp245", 2100, 33)
        assert value is None

    def test_monotone_in_year(self):
        # SLR should generally increase over time for a give...
        y2050 = projection.resolve_slr(0.0, 0.0, "ssp585", 2050, 50)
        y2100 = projection.resolve_slr(0.0, 0.0, "ssp585", 2100, 50)
        assert y2100 > y2050

    def test_all_scenarios_all_percentiles(self):
        for scenario in projection.SCENARIOS:
            for pct in projection.PERCENTILES:
                value = projection.resolve_slr(35.0, 139.0, scenario, 2100, pct)
                assert value is not None and value > 0


# ---------------------------------------------------------------------------
# get_available_info
# ---------------------------------------------------------------------------

class TestGetAvailableInfo:
    def setup_method(self):
        projection._projection_data = None
        projection._kdtree = None

    def test_structure(self):
        info = projection.get_available_info()
        assert "regional_loaded" in info
        assert "scenarios" in info
        assert "years" in info
        assert "percentiles" in info

    def test_global_mean_not_loaded(self):
        info = projection.get_available_info()
        assert info["regional_loaded"] is False
        assert info["grid_point_count"] == 0

    def test_scenarios_list(self):
        info = projection.get_available_info()
        assert set(info["scenarios"]) == {"ssp126", "ssp245", "ssp370", "ssp585"}


# ---------------------------------------------------------------------------
# get_projection_at
# ---------------------------------------------------------------------------

class TestGetProjectionAt:
    def setup_method(self):
        projection._projection_data = None
        projection._kdtree = None
        projection.resolve_slr.cache_clear()

    def test_structure(self):
        output = projection.get_projection_at(25.0, -80.0)
        assert output["source"] == "global_mean"
        assert "scenarios" in output
        assert "ssp245" in output["scenarios"]
        assert "50" in output["scenarios"]["ssp245"]

    def test_values_positive(self):
        output = projection.get_projection_at(25.0, -80.0)
        for scenario in projection.SCENARIOS:
            vals = output["scenarios"][scenario]["50"]
            assert all(v is not None and v > 0 for v in vals)
