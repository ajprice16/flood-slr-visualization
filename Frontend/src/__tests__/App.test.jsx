/**
 * Tests for App.jsx
 *
 * Verifies the main App shell renders correctly, the story mode toggle button
 * is present and functional, scenario/year/percentile controls are visible,
 * and the sidebar is hidden in story mode.
 *
 * Heavy API calls (analyzeRegion, fetchResolvedSlr) are mocked so tests run
 * without a backend.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock maplibre-gl before any imports that may load it indirectly
vi.mock('maplibre-gl', () => import('./__mocks__/maplibre-gl.js'));

// Stub API calls so effects don't fail or interfere
vi.mock('../api', () => ({
    analyzeRegion: vi.fn().mockResolvedValue({
        dataset: { flood_ratio: 0.1, flooded_count: 10, tiles_used: [], flooded_pixels: [] },
        status: 200,
        ok: true,
        durationMs: 50,
    }),
    fetchResolvedSlr: vi.fn().mockResolvedValue({
        dataset: { slr_meters: 0.56, projection_source: 'global_mean' },
        status: 200,
        ok: true,
        durationMs: 20,
    }),
    fetchProjectionInfo: vi.fn().mockResolvedValue({ dataset: {}, status: 200, ok: true }),
}));

// Stub fetch for story text files
global.fetch = vi.fn().mockResolvedValue({
    text: () => Promise.resolve('Story content.'),
});

import App from '../App';

async function enterMap() {
    render(<App />);
    await act(async () => {
        fireEvent.click(screen.getByLabelText('I acknowledge and accept the disclaimer'));
        fireEvent.click(screen.getByRole('button', { name: /Proceed to Interactive Map/i }));
    });
}

describe('App', () => {
    it('renders without crashing', () => {
        const { container } = render(<App />);
        expect(container).toBeTruthy();
    });

    it('shows the landing page initially', () => {
        render(<App />);
        expect(screen.getByRole('heading', { name: 'Sea Level Rise Explorer' })).toBeTruthy();
        expect(screen.getByRole('button', { name: /Proceed to Interactive Map/i })).toBeDisabled();
    });

    it('shows the control panel initially', async () => {
        await enterMap();
        expect(screen.getByText('Projection Year')).toBeTruthy();
    });

    it('shows scenario cards', async () => {
        await enterMap();
        expect(screen.getByRole('button', { name: /SSP2-4.5/i })).toBeTruthy();
    });

    it('shows projection year slider', async () => {
        await enterMap();
        expect(screen.getByDisplayValue('2100')).toBeTruthy();
    });

    it('shows percentile buttons', async () => {
        await enterMap();
        expect(screen.getByText(/Low \(5th\)/)).toBeTruthy();
        expect(screen.getByText(/Median \(50th\)/)).toBeTruthy();
        expect(screen.getByText(/High \(95th\)/)).toBeTruthy();
    });

    it('shows connectivity and water mask controls under Advanced', async () => {
        await enterMap();
        // These controls live behind the collapsed "Advanced" disclosure.
        await act(async () => {
            fireEvent.click(screen.getByText(/Advanced/));
        });
        expect(screen.getByText('Flood Spread Mode')).toBeTruthy();
        expect(screen.getByText('Water Mask')).toBeTruthy();
        expect(screen.getByText('3x3 Mosaic')).toBeTruthy();
        expect(screen.getByText('Raster (if configured)')).toBeTruthy();
    });

    it('toggles into story mode and hides the control panel', async () => {
        await enterMap();
        const btn = screen.getByText('Start Story');

        await act(async () => {
            fireEvent.click(btn);
        });

        // Button text changes
        expect(screen.getByText('Exit Story')).toBeTruthy();
        // Control panel should no longer be visible
        expect(screen.queryByText('Projection Year')).toBeNull();
        // First story shown
        expect(screen.getByText('Miami')).toBeTruthy();
    });

    it('exits story mode when Exit Story is clicked', async () => {
        await enterMap();
        await act(async () => {
            fireEvent.click(screen.getByText('Start Story'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('Exit Story'));
        });
        expect(screen.getByText('Start Story')).toBeTruthy();
        expect(screen.getByText('Projection Year')).toBeTruthy();
    });

    it('closes story panel when × is clicked inside StoryMap', async () => {
        await enterMap();
        await act(async () => {
            fireEvent.click(screen.getByText('Start Story'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('×'));
        });
        expect(screen.getByText('Start Story')).toBeTruthy();
    });

    it('changes scenario when a scenario card is clicked', async () => {
        await enterMap();
        const card = screen.getByRole('button', { name: /SSP5-8.5/i });
        await act(async () => {
            fireEvent.click(card);
        });
        expect(card.getAttribute('aria-pressed')).toBe('true');
    });

    it('changes year when slider moves', async () => {
        await enterMap();
        const slider = screen.getByRole('slider');
        await act(async () => {
            fireEvent.change(slider, { target: { value: '2050' } });
        });
        expect(screen.getByText('2050')).toBeTruthy();
    });

    it('changes percentile when button clicked', async () => {
        await enterMap();
        await act(async () => {
            fireEvent.click(screen.getByText(/Low \(5th\)/));
        });
        // After clicking, the Low button should reflect selected styling.
        // We can't easily test CSS, but we verify the component doesn't crash.
        expect(screen.getByText(/Low \(5th\)/)).toBeTruthy();
    });
});
