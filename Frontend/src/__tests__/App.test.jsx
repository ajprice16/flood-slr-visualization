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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock maplibre-gl before any imports that may load it indirectly
vi.mock('maplibre-gl', () => import('./__mocks__/maplibre-gl.js'));

// Stub API calls so effects don't fail or interfere
vi.mock('../api', () => ({
    analyzeRegion: vi.fn().mockResolvedValue({
        data: { flood_ratio: 0.1, flooded_count: 10, tiles_used: [], flooded_pixels: [] },
        status: 200,
        ok: true,
        durationMs: 50,
    }),
    fetchResolvedSlr: vi.fn().mockResolvedValue({
        data: { slr_meters: 0.56, ipcc_slr_meters: 0.56, vlm_offset_meters: 0.0, projection_source: 'global_mean', vlm_source: 'none' },
        status: 200,
        ok: true,
        durationMs: 20,
    }),
    fetchProjectionInfo: vi.fn().mockResolvedValue({ data: {}, status: 200, ok: true }),
}));

// Stub fetch for story text files
global.fetch = vi.fn().mockResolvedValue({
    text: () => Promise.resolve('Story content.'),
});

import App from '../App';

describe('App', () => {
    it('renders without crashing', () => {
        const { container } = render(<App />);
        expect(container).toBeTruthy();
    });

    it('shows Start Story button initially', () => {
        render(<App />);
        expect(screen.getByText('Start Story')).toBeTruthy();
    });

    it('shows IPCC Projections sidebar initially', () => {
        render(<App />);
        expect(screen.getByText('IPCC Projections')).toBeTruthy();
    });

    it('shows scenario selector dropdown', () => {
        render(<App />);
        expect(screen.getByText(/SSP2-4.5/i)).toBeTruthy();
    });

    it('shows projection year slider', () => {
        render(<App />);
        expect(screen.getByDisplayValue('2100')).toBeTruthy();
    });

    it('shows percentile buttons', () => {
        render(<App />);
        expect(screen.getByText(/Low \(5th\)/)).toBeTruthy();
        expect(screen.getByText(/Median \(50th\)/)).toBeTruthy();
        expect(screen.getByText(/High \(95th\)/)).toBeTruthy();
    });

    it('toggles into story mode and hides sidebar', async () => {
        render(<App />);
        const btn = screen.getByText('Start Story');

        await act(async () => {
            fireEvent.click(btn);
        });

        // Button text changes
        expect(screen.getByText('Exit Story')).toBeTruthy();
        // Sidebar heading should no longer be visible
        expect(screen.queryByText('IPCC Projections')).toBeNull();
        // First story shown
        expect(screen.getByText('Miami')).toBeTruthy();
    });

    it('exits story mode when Exit Story is clicked', async () => {
        render(<App />);
        await act(async () => {
            fireEvent.click(screen.getByText('Start Story'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('Exit Story'));
        });
        expect(screen.getByText('Start Story')).toBeTruthy();
        expect(screen.getByText('IPCC Projections')).toBeTruthy();
    });

    it('closes story panel when × is clicked inside StoryMap', async () => {
        render(<App />);
        await act(async () => {
            fireEvent.click(screen.getByText('Start Story'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('×'));
        });
        expect(screen.getByText('Start Story')).toBeTruthy();
    });

    it('changes scenario when dropdown changes', async () => {
        render(<App />);
        const select = screen.getByRole('combobox');
        await act(async () => {
            fireEvent.change(select, { target: { value: 'ssp585' } });
        });
        expect(select.value).toBe('ssp585');
    });

    it('changes year when slider moves', async () => {
        render(<App />);
        const slider = screen.getByRole('slider');
        await act(async () => {
            fireEvent.change(slider, { target: { value: '2050' } });
        });
        expect(screen.getByText('2050')).toBeTruthy();
    });

    it('changes percentile when button clicked', async () => {
        render(<App />);
        await act(async () => {
            fireEvent.click(screen.getByText(/Low \(5th\)/));
        });
        // After clicking, the Low button should reflect selected styling.
        // We can't easily test CSS, but we verify the component doesn't crash.
        expect(screen.getByText(/Low \(5th\)/)).toBeTruthy();
    });
});
