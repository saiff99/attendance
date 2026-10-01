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
    if (!date) {
      setFormattedText("N/A");
      return;
    }

    try {
      const d = typeof date === "string" ? new Date(date) : date;
      if (isNaN(d.getTime())) {
        setFormattedText(String(date));
        return;
      }

      if (format === "time") {
        setFormattedText(
          d.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })
        );
      } else if (format === "date") {
        setFormattedText(
          d.toLocaleDateString([], {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        );
      } else {
        // "dateTime" - user's exact local date & time
        setFormattedText(
          d.toLocaleString([], {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })
        );
      }
    } catch {
      setFormattedText(String(date));
    }
  }, [date, format]);

  if (!formattedText) {
    if (!date) return <span className={className}>-</span>;
    try {
      const d = typeof date === "string" ? new Date(date) : date;
      return (
        <span suppressHydrationWarning className={className}>
          {d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
        </span>
      );
    } catch {
      return <span className={className}>{String(date)}</span>;
    }
  }

  return <span className={className}>{formattedText}</span>;
}
