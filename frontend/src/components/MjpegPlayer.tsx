"use client";

import { useEffect, useState, useRef } from 'react';
import { Camera, RefreshCw } from 'lucide-react';

interface MjpegPlayerProps {
  url: string;
  className?: string;
  fallbackText?: string;
  paused?: boolean;
}

export function MjpegPlayer({
  url,
  className = "",
  fallbackText = "Connecting...",
  paused = false
}: MjpegPlayerProps) {
  const [frameSrc, setFrameSrc] = useState<string>('');
  const [error, setError] = useState<boolean>(false);
  const [reconnectKey, setReconnectKey] = useState<number>(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (paused) return;

    let isCancelled = false;
    const abortController = new AbortController();

    const fetchStream = async () => {
      try {
        setError(false);
        const response = await fetch(url, {
          signal: abortController.signal
        });

        if (!response.ok || !response.body) {
          throw new Error(`Failed to connect to stream: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        let buffer = new Uint8Array();

        while (!isCancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;

          // Append new data to buffer
          const newBuffer = new Uint8Array(buffer.length + value.length);
          newBuffer.set(buffer);
          newBuffer.set(value, buffer.length);
          buffer = newBuffer;

          // FAST-FORWARD TO LATEST FRAME: Find all complete JPEGs and pick the newest one
          let latestStart = -1;
          let latestEnd = -1;
          let pos = 0;

          while (pos < buffer.length - 1) {
            let s = -1;
            for (let i = pos; i < buffer.length - 1; i++) {
              if (buffer[i] === 0xFF && buffer[i + 1] === 0xD8) {
                s = i;
                break;
              }
            }
            if (s === -1) break;

            let e = -1;
            for (let i = s + 2; i < buffer.length - 1; i++) {
              if (buffer[i] === 0xFF && buffer[i + 1] === 0xD9) {
                e = i + 2;
                break;
              }
            }
            if (e === -1) break;

            latestStart = s;
            latestEnd = e;
            pos = e;
          }

          if (latestStart !== -1 && latestEnd !== -1) {
            // Render only the absolute latest frame, dropping any stale queued frames
            const frameData = buffer.slice(latestStart, latestEnd);
            const blob = new Blob([frameData], { type: 'image/jpeg' });
            const objectUrl = URL.createObjectURL(blob);

            setFrameSrc(prev => {
              if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
              return objectUrl;
            });
            setError(false);

            // Discard everything up to the latest complete frame
            buffer = buffer.slice(latestEnd);
          } else if (buffer.length > 500000) {
            // Safety cap: If buffer grows too large without complete frame, flush it
            buffer = new Uint8Array();
          }
        }
      } catch (err: unknown) {
        const errorObj = err as Error;
        if (errorObj?.name !== 'AbortError' && !isCancelled) {
          setError(true);
          // Quiet auto-reconnect backoff (15s instead of aggressive 2.5s spam) to protect browser resources
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            if (!isCancelled) {
              setReconnectKey(prev => prev + 1);
            }
          }, 15000);
        }
      }
    };

    const onNavigate = () => {
      isCancelled = true;
      abortController.abort();
    };

    window.addEventListener('medattend-navigate', onNavigate);
    window.addEventListener('beforeunload', onNavigate);

    fetchStream();

    return () => {
      isCancelled = true;
      abortController.abort();
      window.removeEventListener('medattend-navigate', onNavigate);
      window.removeEventListener('beforeunload', onNavigate);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [url, paused, reconnectKey]);

  if (error && !frameSrc) {
    return (
      <div className={`flex flex-col items-center justify-center bg-slate-950 text-slate-400 p-4 select-none ${className}`}>
        <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-2">
          <Camera className="w-5 h-5 text-slate-500 opacity-60" />
        </div>
        <span className="text-xs font-semibold text-slate-300">Camera Offline (Dormant)</span>
        <div className="flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          Standby Mode
        </div>
        <button
          onClick={() => setReconnectKey(prev => prev + 1)}
          className="mt-2 text-[10px] text-slate-500 hover:text-indigo-400 flex items-center gap-1 transition-colors"
          title="Retry camera connection"
        >
          <RefreshCw className="w-2.5 h-2.5" /> Re-check Feed
        </button>
      </div>
    );
  }

  if (!frameSrc) {
    return (
      <div className={`flex flex-col items-center justify-center bg-black text-gray-400 ${className}`}>
        <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
        <span className="text-sm font-medium animate-pulse">{fallbackText}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={frameSrc}
      className={className}
      alt="CCTV Live Tracking Stream"
    />
  );
}

