import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';
import { SelfieAttendContent, ActiveSession } from '../SelfieAttendClient';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
  }),
}));

// Mock Auth
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
  }),
}));

describe('SelfieAttendClient Offline & Connectivity Indicator', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ enabled: true, lat: 28.5, lng: 77.2, radius: 250 }),
      })
    ) as unknown as typeof global.fetch;
  });

  const dummySession: ActiveSession = {
    id: 'test-session-1',
    class_name: 'Anatomy Lecture',
    date: '2026-11-05',
    start_time: new Date().toISOString(),
    end_time: new Date(Date.now() + 3600000).toISOString(),
    instructor_name: 'Dr. Smith',
    created_at: new Date().toISOString(),
    remaining_seconds: 300,
    is_expired: false,
    window_duration_seconds: 300,
  };

  it('renders online badge when navigator is online', async () => {
    render(<SelfieAttendContent initialSessions={[dummySession]} />);
    await waitFor(() => {
      expect(screen.getByText('Online')).toBeInTheDocument();
    });
  });

  it('switches to offline badge when window offline event is dispatched', async () => {
    render(<SelfieAttendContent initialSessions={[dummySession]} />);
    await waitFor(() => {
      expect(screen.getByText('Online')).toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    await waitFor(() => {
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });
  });
});
