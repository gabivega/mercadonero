import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useVirtualPet
 * Lógica de la "mascota virtual" (Nerito). TODO con estado local.
 *
 * Persistencia: sessionStorage -> se borra al cerrar la pestaña/navegador.
 * (Si en el futuro querés que persista entre sesiones, cambiá SESSION a LOCAL.)
 *
 * Acciones con cooldown de 24hs EXACTAS (independientes):
 *  - feed()  -> dar comida (+10 pts)
 *  - water() -> dar agua  (+10 pts)
 *
 * addPoints(amount, reason?) queda listo para sumar puntos por
 * compras, publicar, reviews, etc. (todavía no enganchado en el site).
 */

const STORAGE_KEY = "nero_virtual_pet_v1";
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 horas
const ACTION_REWARD = 10;

// ---- helpers de persistencia (scope = session) --------------------------
const readStore = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeStore = (data) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* noop */
  }
};

const DEFAULT_STATE = {
  points: 0,
  lastFedAt: null,
  lastWateredAt: null,
  lastUpdated: null,
};

// ---- hook ---------------------------------------------------------------
export default function useVirtualPet() {
  const [state, setState] = useState(() => {
    const stored = readStore();
    return { ...DEFAULT_STATE, ...(stored || {}) };
  });

  // Persistimos cada cambio
  useEffect(() => {
    writeStore(state);
  }, [state]);

  // Tick para refrescar cooldowns en la UI (cada segundo)
  const [, setTick] = useState(0);
  const tickRef = useRef(null);
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  const now = Date.now();

  const isActionReady = (lastAt) => !lastAt || now - lastAt >= COOLDOWN_MS;

  const msUntil = (lastAt) =>
    lastAt ? Math.max(0, lastAt + COOLDOWN_MS - now) : 0;

  const canFeed = isActionReady(state.lastFedAt);
  const canWater = isActionReady(state.lastWateredAt);
  const feedMsLeft = msUntil(state.lastFedAt);
  const waterMsLeft = msUntil(state.lastWateredAt);

  // ---- acciones ---------------------------------------------------------
  const addPoints = useCallback((amount, reason = "manual") => {
    if (!Number.isFinite(amount) || amount === 0) return;
    setState((prev) => ({
      ...prev,
      points: prev.points + amount,
      lastUpdated: Date.now(),
      // último motivo, útil para debugging/analytics futuro
      lastReason: reason,
    }));
  }, []);

  const feed = useCallback(() => {
    let didFeed = false;
    setState((prev) => {
      const ready = !prev.lastFedAt || Date.now() - prev.lastFedAt >= COOLDOWN_MS;
      if (!ready) return prev;
      didFeed = true;
      return {
        ...prev,
        points: prev.points + ACTION_REWARD,
        lastFedAt: Date.now(),
        lastUpdated: Date.now(),
      };
    });
    return didFeed;
  }, []);

  const water = useCallback(() => {
    let didWater = false;
    setState((prev) => {
      const ready =
        !prev.lastWateredAt || Date.now() - prev.lastWateredAt >= COOLDOWN_MS;
      if (!ready) return prev;
      didWater = true;
      return {
        ...prev,
        points: prev.points + ACTION_REWARD,
        lastWateredAt: Date.now(),
        lastUpdated: Date.now(),
      };
    });
    return didWater;
  }, []);

  return {
    name: "Nerito",
    points: state.points,
    reward: ACTION_REWARD,
    canFeed,
    canWater,
    feedMsLeft,
    waterMsLeft,
    lastFedAt: state.lastFedAt,
    lastWateredAt: state.lastWateredAt,
    feed,
    water,
    addPoints, // <-- listo para compras, reviews, publicar, etc.
  };
}
