/**
 * Tests for MapView.jsx
 *
 * maplibre-gl is mocked (no WebGL in jsdom).
 * Tests verify that the container div renders, status overlays, and that the
 * shared escapeHtml utility (used by MapView for popup content) sanitises HTML
 * special characters correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React, { createRef } from 'react';

// Mock maplibre-gl before importing MapView
vi.mock('maplibre-gl', () => import('./__mocks__/maplibre-gl.js'));

// Also stub fetch so addCityMarkers() doesn't throw
global.fetch = vi.fn().mockResolvedValue({ text: () => Promise.resolve('City info text.') });

import MapView from '../MapView';
// Import the real escapeHtml used by MapView so tests verify the actual implementation.
import { escapeHtml } from '../utils';

describe('MapView', () => {
    it('renders without crashing', () => {
        const { container } = render(
            <MapView
                floodData={null}
                bbox={null}
                scenario="ssp245"
                year={2100}
                percentile={50}
                resolvedSlr={null}
                onBoundsChange={vi.fn()}
                pending={false}
                lastRequest={null}
                mapRef={createRef()}
            />
        );
        expect(container).toBeTruthy();
    });

    it('renders status overlay with "Ready" when not pending', () => {
        render(
            <MapView
                floodData={null}
                bbox={null}
                scenario="ssp245"
                year={2100}
                percentile={50}
                resolvedSlr={null}
                onBoundsChange={vi.fn()}
                pending={false}
                lastRequest={null}
                mapRef={createRef()}
            />
        );
        expect(screen.getByText(/Ready/)).toBeTruthy();
    });

    it('renders "Analyzing…" when pending', () => {
        render(
            <MapView
                floodData={null}
                bbox={null}
                scenario="ssp245"
                year={2100}
                percentile={50}
                resolvedSlr={null}
                onBoundsChange={vi.fn()}
                pending={true}
                lastRequest={null}
                mapRef={createRef()}
            />
        );
        expect(screen.getByText(/Analyzing/)).toBeTruthy();
    });

    it('shows last request duration when provided', () => {
        render(
            <MapView
                floodData={null}
                bbox={null}
                scenario="ssp245"
                year={2100}
                percentile={50}
                resolvedSlr={null}
                onBoundsChange={vi.fn()}
                pending={false}
                lastRequest={{ durationMs: 123, status: 200, ok: true }}
                mapRef={createRef()}
            />
        );
        expect(screen.getByText(/123ms/)).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// escapeHtml — imported from the shared utils module used by MapView
// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
    it('escapes ampersands', () => {
        expect(escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('escapes angle brackets', () => {
        expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('escapes double quotes', () => {
        expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    });

    it('escapes single quotes', () => {
        expect(escapeHtml("it's fine")).toBe("it&#39;s fine");
    });

    it('escapes all special chars in one string', () => {
        expect(escapeHtml('<a href="test" onclick=\'evil()\'>&</a>')).toBe(
            '&lt;a href=&quot;test&quot; onclick=&#39;evil()&#39;&gt;&amp;&lt;/a&gt;'
        );
    });

    it('leaves plain text unchanged', () => {
        expect(escapeHtml('plain text')).toBe('plain text');
    });

    it('handles empty string', () => {
        expect(escapeHtml('')).toBe('');
    });
});
