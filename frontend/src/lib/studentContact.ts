import { Student } from "@/types/database";

export function cleanPhoneNumber(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  // If 10 digits (Standard Indian Mobile), prepend 91
  if (digits.length === 10 && ["6", "7", "8", "9"].includes(digits[0])) {
    return `91${digits}`;
  }
  return digits;
}

export function formatPhoneDisplay(phone: string): string {
  if (!phone) return "-";
  const cleaned = cleanPhoneNumber(phone);
  if (cleaned.startsWith("91") && cleaned.length === 12) {
    return `+91 ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return `+${cleaned}`;
}

export function getParentPhone(student: Partial<Student> | null | undefined): string {
  if (!student) return "";
  
  // 1. Direct parent_phone field
  if (student.parent_phone) {
    return cleanPhoneNumber(student.parent_phone);
  }

  // 2. Extracted from email pattern: {roll}__p{phone}@student.local
  const email = student.email || "";
  if (email.includes("__p")) {
    const match = email.match(/__p([0-9]+)@/);
    if (match && match[1]) {
      return cleanPhoneNumber(match[1]);
    }
  }

  // 3. Face encoding metadata dictionary if present
  const fe = student.face_encoding as any;
  if (fe && typeof fe === "object" && !Array.isArray(fe) && fe.parent_phone) {
    return cleanPhoneNumber(fe.parent_phone);
  }

  return "";
}

export function encodeStudentEmail(roll: string, parentPhone?: string): string {
  const cleanRoll = roll.toLowerCase().replace(/\s+/g, "");
  const cleanPhone = parentPhone ? cleanPhoneNumber(parentPhone) : "";
  
  if (cleanPhone) {
    return `${cleanRoll}__p${cleanPhone}@student.local`;
  }
  return `${cleanRoll}@student.local`;
}
