/**
 * Tests for StoryMap.jsx
 *
 * Verifies rendering, navigation button state, and close button behaviour.
 * The fetch of story text files is mocked so no network is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StoryMap from '../StoryMap';

// Prevent real network calls for textFile content
beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        text: () => Promise.resolve('Sample story text.'),
    }));
});

const stories = [
    { name: 'City A', coords: [-80, 25], zoom: 11, scenario: 'ssp245', year: 2100, percentile: 50, textFile: '/cities/city-a.txt' },
    { name: 'City B', coords: [-90, 30], zoom: 11, scenario: 'ssp585', year: 2100, percentile: 50, textFile: '/cities/city-b.txt' },
    { name: 'City C', coords: [139, 35], zoom: 11, scenario: 'ssp245', year: 2100, percentile: 50, textFile: '/cities/city-c.txt' },
];

describe('StoryMap', () => {
    it('renders the current story title', () => {
        render(
            <StoryMap
                stories={stories}
                currentIndex={0}
                onNavigate={vi.fn()}
                onClose={vi.fn()}
                scenario="ssp245"
                year={2100}
                percentile={50}
                resolvedSlr={null}
            />
        );
        expect(screen.getByText('City A')).toBeTruthy();
    });

    it('renders story counter', () => {
        render(
            <StoryMap
                stories={stories}
                currentIndex={1}
                onNavigate={vi.fn()}
                onClose={vi.fn()}
                scenario="ssp245"
                year={2100}
                percentile={50}
                resolvedSlr={null}
            />
        );
        expect(screen.getByText('2 / 3')).toBeTruthy();
    });

    it('disables Previous button on first story', () => {
        render(
            <StoryMap
                stories={stories}
                currentIndex={0}
                onNavigate={vi.fn()}
                onClose={vi.fn()}
                scenario="ssp245"
                year={2100}
                percentile={50}
                resolvedSlr={null}
            />
        );
        const prevBtn = screen.getByText('← Previous');
        expect(prevBtn).toBeDisabled();
    });

    it('disables Next button on last story', () => {
        render(
            <StoryMap
                stories={stories}
                currentIndex={stories.length - 1}
                onNavigate={vi.fn()}
                onClose={vi.fn()}
                scenario="ssp245"
                year={2100}
                percentile={50}
                resolvedSlr={null}
            />
        );
        const nextBtn = screen.getByText('Next →');
        expect(nextBtn).toBeDisabled();
    });

    it('enables both nav buttons in the middle of stories', () => {
        render(
            <StoryMap
                stories={stories}
                currentIndex={1}
                onNavigate={vi.fn()}
                onClose={vi.fn()}
                scenario="ssp245"
                year={2100}
                percentile={50}
                resolvedSlr={null}
            />
        );
        expect(screen.getByText('← Previous')).not.toBeDisabled();
        expect(screen.getByText('Next →')).not.toBeDisabled();
    });

    it('calls onNavigate with correct index when clicking Next', () => {
        const onNavigate = vi.fn();
        render(
            <StoryMap
                stories={stories}
                currentIndex={0}
                onNavigate={onNavigate}
                onClose={vi.fn()}
                scenario="ssp245"
                year={2100}
                percentile={50}
                resolvedSlr={null}
            />
        );
        fireEvent.click(screen.getByText('Next →'));
        expect(onNavigate).toHaveBeenCalledWith(1);
    });

    it('calls onNavigate with correct index when clicking Previous', () => {
        const onNavigate = vi.fn();
        render(
            <StoryMap
                stories={stories}
                currentIndex={2}
                onNavigate={onNavigate}
                onClose={vi.fn()}
                scenario="ssp245"
                year={2100}
                percentile={50}
                resolvedSlr={null}
            />
        );
        fireEvent.click(screen.getByText('← Previous'));
        expect(onNavigate).toHaveBeenCalledWith(1);
    });

    it('calls onClose when × button is clicked', () => {
        const onClose = vi.fn();
        render(
            <StoryMap
                stories={stories}
                currentIndex={0}
                onNavigate={vi.fn()}
                onClose={onClose}
                scenario="ssp245"
                year={2100}
                percentile={50}
                resolvedSlr={null}
            />
        );
        fireEvent.click(screen.getByText('×'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('displays resolved SLR info when provided', () => {
        render(
            <StoryMap
                stories={stories}
                currentIndex={0}
                onNavigate={vi.fn()}
                onClose={vi.fn()}
                scenario="ssp245"
                year={2100}
                percentile={50}
                resolvedSlr={{ slr_meters: 0.56, ipcc_slr_meters: 0.56, vlm_offset_meters: 0.0 }}
            />
        );
        expect(screen.getByText(/Effective SLR/i)).toBeTruthy();
    });

    it('returns null when stories array is empty', () => {
        const { container } = render(
            <StoryMap
                stories={[]}
                currentIndex={0}
                onNavigate={vi.fn()}
                onClose={vi.fn()}
                scenario="ssp245"
                year={2100}
                percentile={50}
                resolvedSlr={null}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('uses story description when no textFile', async () => {
        const storiesWithDesc = [
            { name: 'City D', coords: [0, 0], zoom: 9, scenario: 'ssp245', year: 2100, percentile: 50, description: 'Direct description text' }
        ];
        const { findByText } = render(
            <StoryMap
                stories={storiesWithDesc}
                currentIndex={0}
                onNavigate={vi.fn()}
                onClose={vi.fn()}
                scenario="ssp245"
                year={2100}
                percentile={50}
                resolvedSlr={null}
            />
        );
        expect(await findByText('Direct description text')).toBeTruthy();
    });
});
