# Unit tests for parse_dem_filename, build_tile_inde...

import math
import sys
import os
import pytest
from collections import defaultdict

BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import main as m


# ---------------------------------------------------------------------------
# parse_dem_filename
# ---------------------------------------------------------------------------

class TestParseDemFilename:
    def test_northern_eastern(self):
        output = m.parse_dem_filename("DiluviumDEM_N34_00_E118_00.tif")
        assert output["lat_min"] == pytest.approx(34.0)
        assert output["lat_max"] == pytest.approx(35.0)
        assert output["lon_min"] == pytest.approx(118.0)
        assert output["lon_max"] == pytest.approx(119.0)

    def test_southern_western(self):
        output = m.parse_dem_filename("DiluviumDEM_S10_30_W075_00.tif")
        # lat = -(10 + 30/60) = -10.5; lon = -(75 + 0/60) = -75.0
        assert output["lat_min"] == pytest.approx(-10.5)
        assert output["lat_max"] == pytest.approx(-9.5)
        assert output["lon_min"] == pytest.approx(-75.0)
        assert output["lon_max"] == pytest.approx(-74.0)

    def test_bounds_tuple_matches_individual_values(self):
        output = m.parse_dem_filename("DiluviumDEM_N25_00_W080_00.tif")
        lon_min, lat_min, lon_max, lat_max = output["bounds"]
        assert lon_min == output["lon_min"]
        assert lat_min == output["lat_min"]
        assert lon_max == output["lon_max"]
        assert lat_max == output["lat_max"]

    def test_tile_is_one_degree(self):
        output = m.parse_dem_filename("DiluviumDEM_N45_00_E010_00.tif")
        assert output["lat_max"] - output["lat_min"] == pytest.approx(1.0)
        assert output["lon_max"] - output["lon_min"] == pytest.approx(1.0)

    def test_minutes_conversion(self):
        # lat = 34 + 30/60 = 34.5
        output = m.parse_dem_filename("DiluviumDEM_N34_30_E020_00.tif")
        assert output["lat_min"] == pytest.approx(34.5)

    def test_invalid_filename_returns_empty(self):
        output = m.parse_dem_filename("random_file.tif")
        assert output == {}

    def test_empty_string(self):
        output = m.parse_dem_filename("")
        assert output == {}

    def test_partial_match_embedded_in_path(self):
        # parse_dem_filename uses re.search, so it finds the pattern even inside a path
        output = m.parse_dem_filename("/dataset/dem/DiluviumDEM_N01_00_E001_00.tif")
        assert output["lat_min"] == pytest.approx(1.0)
        assert output["lon_min"] == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# build_tile_index / find_tiles_in_bbox (using patched filesystem)
# ---------------------------------------------------------------------------

class TestBuildAndFindTiles:
    # Test the spatial index by directly populating TILE...

    def setup_method(self):
        # Reset module-level state before each test.
        m.TILE_INDEX = {}
        m.TILE_GRID = defaultdict(list)

    def _add_tile(self, name, lon_min, lat_min, lon_max, lat_max):
        m.TILE_INDEX[name] = {
            "bounds": (lon_min, lat_min, lon_max, lat_max),
            "lat_min": lat_min, "lat_max": lat_max,
            "lon_min": lon_min, "lon_max": lon_max,
            "path": f"/fake/{name}.tif",
        }
        for lat_cell in range(math.floor(lat_min), math.ceil(lat_max)):
            for lon_cell in range(math.floor(lon_min), math.ceil(lon_max)):
                m.TILE_GRID[(lat_cell, lon_cell)].append(name)

    def test_exact_hit(self):
        self._add_tile("T1", 118.0, 34.0, 119.0, 35.0)
        output = m.find_tiles_in_bbox(118.1, 34.1, 118.9, 34.9)
        assert "T1" in output

    def test_no_intersection(self):
        self._add_tile("T1", 118.0, 34.0, 119.0, 35.0)
        output = m.find_tiles_in_bbox(120.0, 34.0, 121.0, 35.0)
        assert output == []

    def test_adjacent_tiles_both_returned(self):
        self._add_tile("T1", 118.0, 34.0, 119.0, 35.0)
        self._add_tile("T2", 119.0, 34.0, 120.0, 35.0)
        output = m.find_tiles_in_bbox(118.5, 34.0, 119.5, 35.0)
        assert "T1" in output
        assert "T2" in output

    def test_empty_index_returns_empty(self):
        output = m.find_tiles_in_bbox(0.0, 0.0, 1.0, 1.0)
        assert output == []

    def test_no_duplicate_tiles(self):
        # A tile that spans multiple grid cells should only ...
        self._add_tile("Wide", -180.0, -90.0, 180.0, 90.0)
        output = m.find_tiles_in_bbox(-10.0, -10.0, 10.0, 10.0)
        assert output.count("Wide") == 1

    def test_single_point_bbox(self):
        self._add_tile("T1", 118.0, 34.0, 119.0, 35.0)
        output = m.find_tiles_in_bbox(118.5, 34.5, 118.5, 34.5)
        # lon_min == lon_max is technically an empty box; the function may or may not
        # return the tile depending on exact inequality; we only assert no crash.
        assert isinstance(output, list)

    def test_padding_expands_search_area(self):
        self._add_tile("T1", 120.0, 35.0, 121.0, 36.0)
        output = m.find_tiles_in_bbox(118.5, 34.5, 119.5, 35.5, padding_deg=1.0)
        assert "T1" in output
