import { useEffect, useRef, useState } from "react";

/**
 * useCountdown
 * Devuelve el tiempo restante hasta `expiresAt` (Date | string | timestamp)
 * formateado como "23h 45m 10s" o "Expirado".
 *
 * @param {Date|string|number} expiresAt
 * @returns {{ label: string, isExpired: boolean, msLeft: number }}
 */
export default function useCountdown(expiresAt) {
  const targetRef = useRef(null);
  targetRef.current = expiresAt ? new Date(expiresAt).getTime() : null;

  const compute = () => {
    const target = targetRef.current;
    if (!target) return { msLeft: 0, isExpired: true };
    const msLeft = target - Date.now();
    return { msLeft, isExpired: msLeft <= 0 };
  };

  const [state, setState] = useState(compute);

  useEffect(() => {
    setState(compute());
    const target = targetRef.current;
    if (!target) return;
    if (target - Date.now() <= 0) return;

    const interval = setInterval(() => {
      const next = compute();
      setState(next);
      if (next.isExpired) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const format = (ms) => {
    if (ms <= 0) return "Expirado";
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  return {
    label: state.isExpired ? "Expirado" : format(state.msLeft),
    isExpired: state.isExpired,
    msLeft: state.msLeft,
  };
}
