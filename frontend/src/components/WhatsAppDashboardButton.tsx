"use client";

import { useState } from "react";
import { MessageSquare, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { WhatsAppAlertModal } from "./WhatsAppAlertModal";
import { SessionWhatsAppAlertMeta } from "@/lib/geofence";

interface WhatsAppDashboardButtonProps {
  sessionId: string;
  sessionName: string;
  topicName?: string;
  whatsappAlert?: SessionWhatsAppAlertMeta | null;
  onAlertStatusChange?: () => void;
  userRole?: string | null;
}

function formatAlertDate(dateStr?: string): string {
  if (!dateStr) return "recently";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function WhatsAppDashboardButton({
  sessionId,
  sessionName,
  topicName = "Lecture Topic",
  whatsappAlert = null,
  onAlertStatusChange,
  userRole,
}: WhatsAppDashboardButtonProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [currentAlertMeta, setCurrentAlertMeta] = useState<SessionWhatsAppAlertMeta | null>(whatsappAlert);

  const effectiveRole = user?.role || userRole;
  const canSendAlerts = effectiveRole === "Super Admin" || effectiveRole === "Admin";
  const isSent = Boolean(currentAlertMeta?.sent);

  const handleAlertSuccess = (meta: SessionWhatsAppAlertMeta) => {
    setCurrentAlertMeta(meta);
    if (onAlertStatusChange) {
      onAlertStatusChange();
    }
  };

  // Strictly block Faculty from seeing or interacting with the Send Alert trigger
  if (!canSendAlerts) {
    if (isSent) {
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-emerald-500/30 text-xs font-medium rounded-lg text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 select-none shadow-sm"
          title={`Admin dispatched WhatsApp absentee notices for this lecture (${currentAlertMeta?.sentCount || 0} sent).`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Notified ({currentAlertMeta?.sentCount ?? 0})</span>
        </span>
      );
    }
    return null;
  }

  return (
    <>
      {isSent ? (
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-emerald-500/40 text-xs font-semibold rounded-lg text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 cursor-pointer transition-all shadow-sm"
          title={`WhatsApp absentee notices already sent (${currentAlertMeta?.sentCount || 0} delivered on ${formatAlertDate(currentAlertMeta?.sentAt)}). Click to review details or resend.`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Alerts Sent ({currentAlertMeta?.sentCount ?? 0})</span>
        </button>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-amber-500/30 text-xs font-semibold rounded-lg text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-500/30 hover:bg-amber-100 dark:hover:bg-amber-900/60 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 cursor-pointer transition-all shadow-sm"
          title="WhatsApp absentee notices have not been dispatched yet. Click to send."
        >
          <MessageSquare className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>Send Alert</span>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
        </button>
      )}

      <WhatsAppAlertModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        sessionId={sessionId}
        sessionName={sessionName}
        topicName={topicName}
        initialAlertMeta={currentAlertMeta}
        onAlertSuccess={handleAlertSuccess}
      />
    </>
  );
}
