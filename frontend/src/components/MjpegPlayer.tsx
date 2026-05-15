"use client";

import { useEffect, useState, useRef } from 'react';
import { Camera } from 'lucide-react';

interface MjpegPlayerProps {
  url: string;
  className?: string;
  fallbackText?: string;
}

export function MjpegPlayer({ url, className = "", fallbackText = "Connecting to camera..." }: MjpegPlayerProps) {
  const [frameSrc, setFrameSrc] = useState<string>('');
  const [error, setError] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let abortController = new AbortController();
    setError(false);
    
    const fetchStream = async () => {
      try {
        const response = await fetch(url, {
          headers: {
            'ngrok-skip-browser-warning': 'true' // Bypass ngrok warning page
          },
          signal: abortController.signal
        });
        
        if (!response.ok || !response.body) {
          throw new Error(`Failed to connect to stream: ${response.statusText}`);
        }
        
        const reader = response.body.getReader();
        let buffer = new Uint8Array();
        
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          
          // Append new data to buffer
          const newBuffer = new Uint8Array(buffer.length + value.length);
          newBuffer.set(buffer);
          newBuffer.set(value, buffer.length);
          buffer = newBuffer;
          
          // Look for JPEG start (FF D8) and end (FF D9)
          let startIdx = -1;
          let endIdx = -1;
          
          for (let i = 0; i < buffer.length - 1; i++) {
            if (buffer[i] === 0xFF && buffer[i+1] === 0xD8) {
              startIdx = i;
            }
            if (buffer[i] === 0xFF && buffer[i+1] === 0xD9 && startIdx !== -1) {
              endIdx = i + 2;
              break;
            }
          }
          
          if (startIdx !== -1 && endIdx !== -1) {
            // We have a full frame!
            const frameData = buffer.slice(startIdx, endIdx);
            const blob = new Blob([frameData], { type: 'image/jpeg' });
            const objectUrl = URL.createObjectURL(blob);
            
            setFrameSrc(prev => {
              if (prev) URL.revokeObjectURL(prev); // Clean up old memory
              return objectUrl;
            });
            
            // Keep the rest of the buffer for the next frame
            buffer = buffer.slice(endIdx);
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error("MJPEG Stream error:", err);
          setError(true);
        }
      }
    };
    
    fetchStream();
    
    return () => {
      abortController.abort();
      setFrameSrc(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
    };
  }, [url]);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center bg-gray-900 text-gray-400 ${className}`}>
        <Camera className="w-12 h-12 mb-2 opacity-50" />
        <span className="text-sm font-medium">Camera Feed Disconnected</span>
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
    <img 
      src={frameSrc} 
      className={className}
      alt="CCTV Live Tracking Stream" 
    />
  );
}
