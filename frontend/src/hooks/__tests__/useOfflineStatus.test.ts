import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOfflineStatus } from '../useOfflineStatus';

describe('useOfflineStatus hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with online status based on navigator.onLine', () => {
    const { result } = renderHook(() => useOfflineStatus());
    expect(result.current.isOnline).toBe(true);
  });

  it('updates isOnline to false when window offline event is dispatched', () => {
    const { result } = renderHook(() => useOfflineStatus());
    expect(result.current.isOnline).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it('updates isOnline back to true when window online event is dispatched', () => {
    const { result } = renderHook(() => useOfflineStatus());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isOnline).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.isOnline).toBe(true);
  });

  it('provides requestNotificationAccess function', () => {
    const { result } = renderHook(() => useOfflineStatus());
    expect(typeof result.current.requestNotificationAccess).toBe('function');
  });
});

