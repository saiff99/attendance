"use client";

import { useEffect, useState } from "react";

interface FormattedDateProps {
  date: string | Date | null | undefined;
  format?: "dateTime" | "time" | "date";
  className?: string;
}

export function FormattedDate({ date, format = "dateTime", className }: FormattedDateProps) {
  const [formattedText, setFormattedText] = useState<string>("");

  useEffect(() => {
    let isMounted = true;
    const formatString = () => {
      if (!date) return "N/A";
      try {
        const d = typeof date === "string" ? new Date(date) : date;
        if (isNaN(d.getTime())) return String(date);

        if (format === "time") {
          return d.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
        } else if (format === "date") {
          return d.toLocaleDateString([], {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
        } else {
          return d.toLocaleString([], {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
        }
      } catch {
        return String(date);
      }
    };

    const text = formatString();
    queueMicrotask(() => {
      if (isMounted) {
        setFormattedText(text);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [date, format]);

  if (!formattedText) {
    if (!date) return <span className={className}>-</span>;
    let fallback = String(date);
    try {
      const d = typeof date === "string" ? new Date(date) : date;
      if (!isNaN(d.getTime())) {
        fallback = d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
      }
    } catch {
      // fallback to String(date)
    }

    return (
      <span suppressHydrationWarning className={className}>
        {fallback}
      </span>
    );
  }

  return <span className={className}>{formattedText}</span>;
}
