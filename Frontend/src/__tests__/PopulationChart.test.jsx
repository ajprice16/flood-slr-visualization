/**
 * Tests for PopulationChart.jsx
 *
 * Regression coverage for the trend chart reading the wrong field off the
 * analyzeRegion response: it returns { dataset }, not { data }. Reading r.data
 * left every bar's population null, so the chart rendered all "—".
 *
 * analyzeRegion is mocked so no backend is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../api', () => ({
    analyzeRegion: vi.fn(),
}));

import { analyzeRegion } from '../api';
import PopulationChart from '../PopulationChart';

const bbox = { lon_min: -81, lon_max: -79, lat_min: 24, lat_max: 26 };

beforeEach(() => {
    analyzeRegion.mockReset();
});

describe('PopulationChart', () => {
    it('renders population values from the dataset field of the response', async () => {
        analyzeRegion.mockResolvedValue({
            dataset: { estimated_population_affected: 12345 },
            status: 200,
            ok: true,
            durationMs: 10,
        });

        render(<PopulationChart bbox={bbox} scenario="ssp245" percentile={50} currentYear={2100} />);

        // 500ms debounce then a Promise.all of per-decade requests.
        await waitFor(
            () => expect(screen.getAllByTitle(/12,345 people/).length).toBeGreaterThan(0),
            { timeout: 2000 }
        );
    });

    it('renders nothing without a bbox', () => {
        const { container } = render(
            <PopulationChart bbox={null} scenario="ssp245" percentile={50} currentYear={2100} />
        );
        expect(container.firstChild).toBeNull();
    });
});
