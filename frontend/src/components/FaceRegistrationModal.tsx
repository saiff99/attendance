"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { X, CheckCircle2, AlertCircle, Camera, Loader2 } from 'lucide-react';

interface FaceRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  onSuccess: () => void;
}

type ScanStatus = 'idle' | 'scanning' | 'processing' | 'success' | 'error';

const INSTRUCTIONS = [
  "Look straight at the camera",
  "Turn your head slightly to the right",
  "Turn your head slightly to the left",
  "Tilt your head slightly up",
  "Tilt your head slightly down",
];

export function FaceRegistrationModal({ isOpen, onClose, studentId, studentName, onSuccess }: FaceRegistrationModalProps) {
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [instructionIndex, setInstructionIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  
  const webcamRef = useRef<Webcam>(null);
  const framesRef = useRef<string[]>([]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStatus('idle');
      setInstructionIndex(0);
      setProgress(0);
      setErrorMessage("");
      setCountdown(null);
      framesRef.current = [];
    }
  }, [isOpen]);

  const startScanning = () => {
    setStatus('scanning');
    setInstructionIndex(0);
    setProgress(0);
    framesRef.current = [];
    setCountdown(3);
  };

  useEffect(() => {
    if (status !== 'scanning' || countdown === null) return;

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0) {
      // Time to capture!
      if (webcamRef.current) {
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
          framesRef.current.push(imageSrc);
        }
      }
      
      const currentFrame = framesRef.current.length;
      const totalFrames = 5;
      
      setProgress((currentFrame / totalFrames) * 100);
      
      if (currentFrame < totalFrames) {
        // Move to next instruction and reset countdown
        // We use a tiny timeout so the user sees "Capturing..." or the flash effect momentarily
        const flashTimer = setTimeout(() => {
          setInstructionIndex(currentFrame);
          setCountdown(3);
        }, 500);
        return () => clearTimeout(flashTimer);
      } else {
        // Done capturing all frames
        setStatus('processing');
        setCountdown(null);
        processFrames();
      }
    }
  }, [countdown, status]);

  // Convert base64 data URL to Blob
  const dataURLtoBlob = (dataurl: string) => {
    const arr = dataurl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  const processFrames = async () => {
    setStatus('processing');
    
    try {
      const formData = new FormData();
      
      framesRef.current.forEach((frameBase64, index) => {
        const blob = dataURLtoBlob(frameBase64);
        // Append multiple files with the same field name 'files'
        formData.append('files', blob, `frame_${index}.jpg`);
      });

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/enroll-face-burst/${studentId}`, {
        method: 'POST',
        body: formData,
        headers: {
          "ngrok-skip-browser-warning": "69420"
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to process facial data');
      }

      setStatus('success');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
      
    } catch (error: any) {
      console.error('Error processing frames:', error);
      setStatus('error');
      setErrorMessage(error.message || "Failed to process face. Please try again in better lighting.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-gray-900 rounded-3xl w-full max-w-md overflow-hidden border border-gray-800 shadow-2xl relative">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-2 border-b border-transparent">
          <h2 className="text-xl font-bold text-white">Face ID Setup</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors bg-gray-800 hover:bg-gray-700 p-2 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col items-center">
          
          <div className="text-center mb-8">
            <p className="text-gray-400 text-sm">
              Registering 3D facial profile for <span className="text-white font-semibold">{studentName}</span>
            </p>
          </div>

          {/* Camera Viewfinder */}
          <div className="relative w-64 h-64 mb-8">
            {/* The circular animated ring */}
            <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
              {/* Background ring */}
              <circle cx="50" cy="50" r="48" fill="none" stroke="#1f2937" strokeWidth="2" />
              
              {/* Progress ring */}
              <circle 
                cx="50" 
                cy="50" 
                r="48" 
                fill="none" 
                stroke={status === 'success' ? '#10b981' : status === 'error' ? '#ef4444' : '#6366f1'} 
                strokeWidth="4" 
                strokeDasharray={`${progress * 3}, 300`} 
                strokeLinecap="round"
                className="transition-all duration-1000 ease-in-out"
              />
              
              {/* Tick marks resembling Face ID */}
              <g className="opacity-30">
                {Array.from({ length: 60 }).map((_, i) => (
                  <line 
                    key={i}
                    x1="50" y1="5" x2="50" y2="9"
                    stroke={i < (progress / 100) * 60 ? '#6366f1' : '#4b5563'} 
                    strokeWidth="1.5"
                    transform={`rotate(${i * 6} 50 50)`}
                    className="transition-colors duration-500"
                  />
                ))}
              </g>
            </svg>

            {/* Webcam Container */}
            <div className="absolute inset-2 rounded-full overflow-hidden bg-gray-950 shadow-inner flex items-center justify-center">
              {status === 'success' ? (
                <div className="flex flex-col items-center justify-center text-emerald-500 animate-in zoom-in duration-500">
                  <CheckCircle2 className="w-20 h-20" />
                </div>
              ) : status === 'processing' ? (
                <div className="flex flex-col items-center justify-center text-indigo-500">
                  <Loader2 className="w-12 h-12 animate-spin mb-2" />
                  <span className="text-sm font-medium animate-pulse">Analyzing...</span>
                </div>
              ) : (
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ facingMode: "user" }}
                  className="w-full h-full object-cover transform scale-x-[-1]" // Mirror effect
                />
              )}
            </div>
            
            {/* Overlay Grid lines for Face ID aesthetic */}
            {status === 'scanning' && (
              <div className="absolute inset-0 pointer-events-none rounded-full overflow-hidden opacity-30">
                <div className="absolute top-1/2 w-full h-[1px] bg-indigo-500/50 shadow-[0_0_8px_2px_rgba(99,102,241,0.5)]"></div>
                <div className="absolute left-1/2 w-[1px] h-full bg-indigo-500/50 shadow-[0_0_8px_2px_rgba(99,102,241,0.5)]"></div>
              </div>
            )}
            
            {/* Center Countdown Overlay */}
            {status === 'scanning' && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                {countdown !== null && countdown > 0 && (
                  <span className="text-7xl font-bold text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] animate-pulse">
                    {countdown}
                  </span>
                )}
                {countdown === 0 && (
                  <span className="text-4xl font-bold text-emerald-400 drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]">
                    Capturing...
                  </span>
                )}
              </div>
            )}

            {/* Directional Prompts */}
            {status === 'scanning' && (
              <>
                {instructionIndex === 1 && (
                  <div className="absolute top-1/2 left-full ml-2 -translate-y-1/2 text-emerald-400 font-bold text-xl animate-pulse drop-shadow-md whitespace-nowrap">
                    Right →
                  </div>
                )}
                {instructionIndex === 2 && (
                  <div className="absolute top-1/2 right-full mr-2 -translate-y-1/2 text-emerald-400 font-bold text-xl animate-pulse drop-shadow-md whitespace-nowrap">
                    ← Left
                  </div>
                )}
                {instructionIndex === 3 && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 text-emerald-400 font-bold text-xl animate-pulse drop-shadow-md whitespace-nowrap">
                    ↑ Up
                  </div>
                )}
                {instructionIndex === 4 && (
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 text-emerald-400 font-bold text-xl animate-pulse drop-shadow-md whitespace-nowrap">
                    ↓ Down
                  </div>
                )}
              </>
            )}
          </div>

          {/* Instructions / Actions */}
          <div className="h-20 flex items-center justify-center text-center w-full">
            {status === 'idle' && (
              <div className="flex flex-col items-center space-y-4 w-full">
                <p className="text-gray-300 font-medium">Position your face in the frame.</p>
                <button 
                  onClick={startScanning}
                  className="w-full max-w-[200px] py-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors flex items-center justify-center"
                >
                  <Camera className="w-5 h-5 mr-2" />
                  Get Started
                </button>
              </div>
            )}

            {status === 'scanning' && (
              <div className="flex flex-col items-center">
                <p className="text-xl font-medium text-white mb-1">
                  {INSTRUCTIONS[instructionIndex]}
                </p>
              </div>
            )}

            {status === 'processing' && (
              <p className="text-gray-400 font-medium">
                Building 3D composite profile...
              </p>
            )}

            {status === 'success' && (
              <p className="text-emerald-400 font-medium text-lg">
                Face ID is Now Set Up
              </p>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center w-full">
                <div className="flex items-center text-red-400 mb-4">
                  <AlertCircle className="w-5 h-5 mr-2" />
                  <p className="text-sm font-medium">{errorMessage}</p>
                </div>
                <button 
                  onClick={() => setStatus('idle')}
                  className="px-6 py-2 rounded-full bg-gray-800 hover:bg-gray-700 text-white font-medium transition-colors text-sm"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
