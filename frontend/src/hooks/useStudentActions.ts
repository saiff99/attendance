import { useState, useCallback } from "react";

export interface StudentActionTarget {
  id: string;
  name: string;
  roll: string;
}

export function useStudentActions(onActionCompleted?: () => void) {
  // PIN Reset states
  const [resetPinTarget, setResetPinTarget] = useState<StudentActionTarget | null>(null);
  const [isResettingPin, setIsResettingPin] = useState(false);
  const [resetPinSuccess, setResetPinSuccess] = useState<string | null>(null);
  const [resetPinError, setResetPinError] = useState<string | null>(null);
  const [resetPinTempPin, setResetPinTempPin] = useState<string | null>(null);
  const [pinCopied, setPinCopied] = useState(false);

  // Biometric Revocation states
  const [revokeBiometricTarget, setRevokeBiometricTarget] = useState<StudentActionTarget | null>(null);
  const [isRevokingBiometric, setIsRevokingBiometric] = useState(false);
  const [revokeBiometricSuccess, setRevokeBiometricSuccess] = useState<string | null>(null);
  const [revokeBiometricError, setRevokeBiometricError] = useState<string | null>(null);

  const confirmResetPin = useCallback(async () => {
    if (!resetPinTarget) return;
    setIsResettingPin(true);
    setResetPinSuccess(null);
    setResetPinError(null);
    setResetPinTempPin(null);
    setPinCopied(false);

    try {
      const res = await fetch(`/api/students/${resetPinTarget.id}/reset-pin`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to reset PIN.");
      }
      setResetPinTempPin(data.tempPin || null);
      setResetPinSuccess(data.message || "Temporary activation PIN generated successfully.");
      if (onActionCompleted) onActionCompleted();
    } catch (err: unknown) {
      console.error("Error resetting student PIN:", err);
      const msg = err instanceof Error ? err.message : "Failed to reset PIN.";
      setResetPinError(msg);
    } finally {
      setIsResettingPin(false);
    }
  }, [resetPinTarget, onActionCompleted]);

  const confirmRevokeBiometric = useCallback(async () => {
    if (!revokeBiometricTarget) return;
    setIsRevokingBiometric(true);
    setRevokeBiometricSuccess(null);
    setRevokeBiometricError(null);

    try {
      const res = await fetch(`/api/students/${revokeBiometricTarget.id}/revoke-biometrics`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to revoke biometrics.");
      }
      setRevokeBiometricSuccess("Facial biometric template erased and consent revoked.");
      if (onActionCompleted) onActionCompleted();
      setTimeout(() => {
        setRevokeBiometricTarget(null);
        setRevokeBiometricSuccess(null);
        setRevokeBiometricError(null);
      }, 1500);
    } catch (err: unknown) {
      console.error("Error revoking biometrics:", err);
      const msg = err instanceof Error ? err.message : "Failed to revoke biometrics.";
      setRevokeBiometricError(msg);
    } finally {
      setIsRevokingBiometric(false);
    }
  }, [revokeBiometricTarget, onActionCompleted]);

  return {
    resetPinTarget,
    setResetPinTarget,
    isResettingPin,
    setIsResettingPin,
    resetPinSuccess,
    setResetPinSuccess,
    resetPinError,
    setResetPinError,
    resetPinTempPin,
    setResetPinTempPin,
    pinCopied,
    setPinCopied,
    confirmResetPin,

    revokeBiometricTarget,
    setRevokeBiometricTarget,
    isRevokingBiometric,
    setIsRevokingBiometric,
    revokeBiometricSuccess,
    setRevokeBiometricSuccess,
    revokeBiometricError,
    setRevokeBiometricError,
    confirmRevokeBiometric,
  };
}
