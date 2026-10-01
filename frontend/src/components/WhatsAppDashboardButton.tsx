"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { WhatsAppAlertModal } from "./WhatsAppAlertModal";

interface WhatsAppDashboardButtonProps {
  sessionId: string;
  sessionName: string;
  topicName?: string;
}

export function WhatsAppDashboardButton({
  sessionId,
  sessionName,
  topicName = "Lecture Topic",
}: WhatsAppDashboardButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center px-2.5 py-1.5 border border-emerald-600/30 text-xs font-semibold rounded-md text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 cursor-pointer transition-colors shadow-sm"
        title="Send WhatsApp Absent Alerts to Parents"
      >
        <MessageSquare className="w-3.5 h-3.5 mr-1 text-emerald-600 dark:text-emerald-400" />
        <span>Alert</span>
      </button>

      <WhatsAppAlertModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        sessionId={sessionId}
        sessionName={sessionName}
        topicName={topicName}
      />
    </>
  );
}
