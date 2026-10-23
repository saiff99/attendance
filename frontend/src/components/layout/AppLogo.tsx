"use client";

import React from "react";

interface AppLogoProps {
  className?: string;
  size?: number;
}

export function AppLogo({ className = "w-8 h-8", size = 32 }: AppLogoProps) {
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
        <linearGradient id="appLogoBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0F172A" />
          <stop offset="50%" stopColor="#1E1B4B" />
          <stop offset="100%" stopColor="#312E81" />
        </linearGradient>

        <linearGradient id="appLogoRim" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A5B4FC" stopOpacity="0.7" />
          <stop offset="50%" stopColor="#6366F1" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.6" />
        </linearGradient>

        <radialGradient id="appLogoGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6366F1" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#0F172A" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="appLogoCapLight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#CBD5E1" />
        </linearGradient>

        <linearGradient id="appLogoCapShade" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E2E8F0" />
          <stop offset="100%" stopColor="#94A3B8" />
        </linearGradient>

        <linearGradient id="appLogoCheck" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#059669" />
          <stop offset="35%" stopColor="#10B981" />
          <stop offset="70%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>

        <linearGradient id="appLogoTassel" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="60%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
      </defs>

      {/* Squircle container */}
      <rect x="20" y="20" width="472" height="472" rx="112" fill="url(#appLogoBg)" />
      <rect x="20" y="20" width="472" height="472" rx="112" fill="none" stroke="url(#appLogoRim)" strokeWidth="6" />

      {/* Ambient center glow */}
      <circle cx="256" cy="256" r="180" fill="url(#appLogoGlow)" />

      {/* Radar scanning arcs */}
      <g opacity="0.35" stroke="#38BDF8" strokeWidth="3.5" strokeLinecap="round">
        <path d="M 92 195 A 180 180 0 0 1 140 125" strokeDasharray="10 12" />
        <path d="M 420 195 A 180 180 0 0 0 372 125" strokeDasharray="10 12" />
      </g>

      {/* Graduation Cap */}
      <g>
        {/* Skull band */}
        <path d="M 172 188 Q 256 236 340 188 L 340 226 Q 340 274 256 296 Q 172 274 172 226 Z" fill="#4338CA" />
        <path d="M 184 224 Q 256 256 328 224" fill="none" stroke="#A5B4FC" strokeWidth="3" opacity="0.6" strokeLinecap="round" />

        {/* Diamond top */}
        <polygon points="256,96 86,168 256,238" fill="url(#appLogoCapShade)" />
        <polygon points="256,96 426,168 256,238" fill="url(#appLogoCapLight)" />

        {/* Center button */}
        <ellipse cx="256" cy="167" rx="8" ry="5.5" fill="#1E1B4B" />
        <ellipse cx="256" cy="166" rx="6" ry="4" fill="#818CF8" />

        {/* Tassel */}
        <path d="M 256 167 Q 192 174 158 208 Q 140 232 136 270" fill="none" stroke="url(#appLogoTassel)" strokeWidth="5.5" strokeLinecap="round" />
        <circle cx="136" cy="272" r="5" fill="#F59E0B" />
        <path d="M 129 275 L 143 275 L 148 312 L 124 312 Z" fill="url(#appLogoTassel)" rx="2.5" />
      </g>

      {/* Hero Attendance Verified Checkmark */}
      <g>
        <path
          d="M 180 326 L 238 384 L 356 256"
          fill="none"
          stroke="url(#appLogoCheck)"
          strokeWidth="38"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M 180 326 L 238 384 L 356 256"
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
