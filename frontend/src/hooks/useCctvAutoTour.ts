import { useState, useEffect } from "react";

interface UseCctvAutoTourOptions {
  activeTab: string;
  cameraCount: number;
  initialIntervalSeconds?: number;
  onRotateCamera: (updateFn: (currIndex: number) => number) => void;
}

export function useCctvAutoTour({
  activeTab,
  cameraCount,
  initialIntervalSeconds = 8,
  onRotateCamera,
}: UseCctvAutoTourOptions) {
  const [isAutoTourActive, setIsAutoTourActive] = useState(false);
  const [tourIntervalSeconds, setTourIntervalSeconds] = useState(initialIntervalSeconds);
  const [tourCountdown, setTourCountdown] = useState(initialIntervalSeconds);

  useEffect(() => {
    if (!isAutoTourActive || activeTab !== "cctv" || cameraCount <= 0) {
      queueMicrotask(() => setTourCountdown(tourIntervalSeconds));
      return;
    }

    const timer = setInterval(() => {
      setTourCountdown((prev) => {
        if (prev <= 1) {
          onRotateCamera((curr) => (curr + 1) % cameraCount);
          return tourIntervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoTourActive, activeTab, tourIntervalSeconds, cameraCount, onRotateCamera]);

  return {
    isAutoTourActive,
    setIsAutoTourActive,
    tourIntervalSeconds,
    setTourIntervalSeconds,
    tourCountdown,
    setTourCountdown,
  };
}
