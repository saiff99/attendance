"use client";

import React from "react";

interface AppLogoProps {
  className?: string;
  size?: number;
  variant?: "badge" | "glyph";
}

export function AppLogo({
  className = "w-8 h-8",
  size = 36,
  variant = "badge",
}: AppLogoProps) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="MedAttend Student Attendance Logo"
    >
      <defs>
        <!-- Vibrant Royal Indigo-Violet Badge Gradient -->
        <linearGradient id="medAttendBadgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="45%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>

        <!-- Specular Highlight Rim -->
        <linearGradient id="medAttendRim" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E0E7FF" stopOpacity="0.95" />
          <stop offset="40%" stopColor="#A5B4FC" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#818CF8" stopOpacity="0.2" />
        </linearGradient>

        <!-- Inner Ambient Center Glow -->
        <radialGradient id="medAttendCenterLight" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#A5B4FC" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
        </radialGradient>

        <!-- Mortarboard Diamond Gradients -->
        <linearGradient id="medAttendCapLight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#F8FAFC" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </linearGradient>

        <linearGradient id="medAttendCapShade" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F1F5F9" />
          <stop offset="100%" stopColor="#CBD5E1" />
        </linearGradient>

        <!-- Skull Cap Under-Band -->
        <linearGradient id="medAttendCapBand" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#312E81" />
          <stop offset="100%" stopColor="#1E1B4B" />
        </linearGradient>

        <!-- Verified Checkmark Gradient -->
        <linearGradient id="medAttendCheckGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="35%" stopColor="#10B981" />
          <stop offset="75%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>

        <!-- Tassel Gradient -->
        <linearGradient id="medAttendTassel" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="50%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>

        <!-- Realistic Soft Drop Shadows -->
        <filter id="medAttendCapShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#0F172A" floodOpacity="0.55" />
        </filter>

        <filter id="medAttendCheckShadow" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#090D1A" floodOpacity="0.5" />
        </filter>
      </defs>

      {variant === "badge" && (
        <>
          {/* 1. Squircle Badge Base */}
          <rect x="20" y="20" width="472" height="472" rx="116" fill="url(#medAttendBadgeGrad)" />
          <rect x="20" y="20" width="472" height="472" rx="116" stroke="url(#medAttendRim)" strokeWidth="6" />

          {/* 2. Ambient Light Core */}
          <circle cx="256" cy="240" r="180" fill="url(#medAttendCenterLight)" />
        </>
      )}

      {/* 3. Academic Mortarboard Cap (Student Symbol) */}
      <g filter="url(#medAttendCapShadow)">
        {/* Skull Cap Under-Band */}
        <path d="M 166 196 Q 256 244 346 196 L 346 238 Q 346 290 256 314 Q 166 290 166 238 Z" fill="url(#medAttendCapBand)" />
        <path d="M 178 236 Q 256 268 334 236" fill="none" stroke="#A5B4FC" strokeWidth="3.5" opacity="0.8" strokeLinecap="round" />

        {/* Mortarboard Diamond (Perspective) */}
        <polygon points="256,86 78,166 256,244" fill="url(#medAttendCapShade)" />
        <polygon points="256,86 434,166 256,244" fill="url(#medAttendCapLight)" />

        {/* Crisp White Bevel Lines */}
        <line x1="78" y1="166" x2="256" y2="86" stroke="#FFFFFF" strokeWidth="3" opacity="0.9" strokeLinecap="round" />
        <line x1="256" y1="86" x2="434" y2="166" stroke="#FFFFFF" strokeWidth="3" opacity="0.95" strokeLinecap="round" />

        {/* Center Button */}
        <ellipse cx="256" cy="165" rx="10" ry="6.5" fill="#1E1B4B" />
        <ellipse cx="256" cy="164" rx="8" ry="5" fill="#C7D2FE" />

        {/* Academic Tassel (Drapes Gracefully to Left) */}
        <path d="M 256 165 Q 186 174 148 212 Q 128 238 124 280" fill="none" stroke="url(#medAttendTassel)" strokeWidth="6" strokeLinecap="round" />
        <circle cx="124" cy="282" r="6" fill="#F59E0B" />
        <path d="M 115 286 L 133 286 L 138 330 L 110 330 Z" fill="url(#medAttendTassel)" />
        <line x1="124" y1="288" x2="124" y2="328" stroke="#78350F" strokeWidth="2" opacity="0.4" />
      </g>

      {/* 4. Hero Verified Attendance Checkmark (Presence Verified) */}
      <g filter="url(#medAttendCheckShadow)">
        {/* High-Contrast White Halo for 100% separation & clarity */}
        <path
          d="M 172 328 L 238 394 L 372 254"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="54"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Vibrant Emerald-Cyan Checkmark Body */}
        <path
          d="M 172 328 L 238 394 L 372 254"
          fill="none"
          stroke="url(#medAttendCheckGrad)"
          strokeWidth="36"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Specular Gloss Core */}
        <path
          d="M 172 328 L 238 394 L 372 254"
          fill="none"
          stroke="#F0FDFA"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        />
      </g>
    </svg>
  );
}
