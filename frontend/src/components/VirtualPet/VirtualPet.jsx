import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PartyPopper, Drumstick, Droplets, X } from "lucide-react";
import PetDog from "./PetDog";
import useVirtualPet from "../../hooks/useVirtualPet";

/**
 * VirtualPet
 * Widget de la mascota virtual "Nerito".
 * - Aparece arriba de todo el site.
 * - Se puede cerrar (por sesión).
 * - Botones "Dar comida" / "Dar agua" (1 vez cada 24hs c/u).
 * - Varias animaciones: flotantes +10, burst de partículas,
 *   pop del botón y modal de celebración que se cierra solo.
 *
 * Nota: los íconos de marcas (Github, Twitter, etc.) ya no vienen en
 * lucide-react. Acá usamos solo íconos core (Drumstick, Droplets, X, PartyPopper).
 */

const formatMs = (ms) => {
  if (ms <= 0) return "Listo";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const CLOSED_KEY = "nero_virtual_pet_closed";

// Partículas que salen del botón al hacer click (emoji que "explotan")
const BURST_EMOJI = {
  feed: ["🍖", "🦴", "❤️"],
  water: ["💧", "💦", "🫧"],
};

export default function VirtualPet() {
  const pet = useVirtualPet();
  const [closed, setClosed] = useState(
    () => sessionStorage.getItem(CLOSED_KEY) === "1",
  );
  const [mood, setMood] = useState("idle"); // idle | eating | drinking
  const [floaters, setFloaters] = useState([]); // {id, text, x}
  const [bursts, setBursts] = useState([]); // {id, type} -> partículas
  const [celebration, setCelebration] = useState(null); // {id, type, points}

  const handleClose = () => {
    sessionStorage.setItem(CLOSED_KEY, "1");
    setClosed(true);
  };

  // Dispara TODAS las animaciones al realizar una acción
  const triggerReward = (type) => {
    const id = Date.now() + Math.random();
    const x = type === "feed" ? "35%" : "65%";

    // 1) Flotante +10 sobre el perro
    setFloaters((f) => [...f, { id, text: `+${pet.reward}`, x }]);
    // 2) Burst de partículas desde el botón
    setBursts((b) => [...b, { id, type }]);
    // 3) Modal de celebración (se cierra solo)
    setCelebration({ id, type, points: pet.reward });

    // Estado del perro
    setMood(type === "feed" ? "eating" : "drinking");

    // Limpiezas programadas
    setTimeout(() => setFloaters((f) => f.filter((i) => i.id !== id)), 1300);
    setTimeout(() => setBursts((b) => b.filter((i) => i.id !== id)), 1200);
    setTimeout(() => setMood("idle"), 1800);
    setTimeout(
      () => setCelebration((c) => (c && c.id === id ? null : c)),
      2000,
    );
  };

  const handleFeed = () => {
    if (pet.feed()) triggerReward("feed");
  };

  const handleWater = () => {
    if (pet.water()) triggerReward("water");
  };

  // Si cerramos la barra, dejamos un botón flotante chico para reabrir
  if (closed) {
    return (
      <button
        onClick={() => {
          sessionStorage.removeItem(CLOSED_KEY);
          setClosed(false);
        }}
        className="fixed bottom-4 left-4 z-40 flex items-center gap-2 px-3 py-2 rounded-full
                   bg-[#FB6002] text-white shadow-lg hover:bg-[#e05500] transition-colors"
        title="Abrir a Nerito"
      >
        <span className="text-base">🐶</span>
        <span className="text-sm font-semibold">Nerito</span>
        <span className="text-xs bg-white/25 rounded-full px-2 py-0.5">
          {pet.points} pts
        </span>
      </button>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -24, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, y: -24, height: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative z-40 w-full overflow-hidden bg-gradient-to-r from-[#FFF4E6] to-[#FFE9CC]
                   dark:from-zinc-900 dark:to-zinc-800 border-b border-[#FB6002]/20 dark:border-zinc-700"
      >
        <div className="container mx-auto px-4 md:px-8 py-3">
          <div className="flex items-center gap-4">
            {/* Perro animado */}
            <div className="relative shrink-0">
              <div className="w-16 h-16 sm:w-20 sm:h-20">
                <PetDog mood={mood} />
              </div>

              {/* Flotantes +10 sobre el perro */}
              <AnimatePresence>
                {floaters.map((f) => (
                  <motion.span
                    key={f.id}
                    initial={{ opacity: 0, y: 0, scale: 0.7 }}
                    animate={{ opacity: 1, y: -46, scale: 1.2 }}
                    exit={{ opacity: 0, y: -70, scale: 0.9 }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    style={{ left: f.x }}
                    className="absolute top-2 -translate-x-1/2 pointer-events-none text-[#FB6002]
                               font-extrabold text-lg drop-shadow"
                  >
                    {f.text}
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>

            {/* Mensaje + puntos */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm sm:text-base text-gray-800 dark:text-gray-100 leading-snug">
                  ¡Hola! Soy{" "}
                  <span className="font-bold text-[#FB6002]">Nerito</span>{" "}
                  <PartyPopper className="inline w-4 h-4 text-[#FB6002] -mt-0.5" />{" "}
                  y soy tu compañero. Si me cuidas todos los días, sumás
                  importantes puntos.
                </p>
                <PointCounter value={pet.points} />
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex items-center gap-2 shrink-0">
              <ActionButton
                icon={Drumstick}
                label="Dar comida"
                availableLabel={formatMs(pet.feedMsLeft)}
                disabled={!pet.canFeed}
                onClick={handleFeed}
                color="bg-[#FB6002] hover:bg-[#e05500]"
                bursts={bursts}
                type="feed"
              />
              <ActionButton
                icon={Droplets}
                label="Dar agua"
                availableLabel={formatMs(pet.waterMsLeft)}
                disabled={!pet.canWater}
                onClick={handleWater}
                color="bg-sky-500 hover:bg-sky-600"
                bursts={bursts}
                type="water"
              />

              {/* Cerrar */}
              <button
                onClick={handleClose}
                className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors
                           text-gray-500 dark:text-gray-300"
                title="Cerrar por ahora"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Modal de celebración (auto-cierre a los 2s) */}
        <CelebrationModal celebration={celebration} />
      </motion.div>
    </AnimatePresence>
  );
}

/* ---------- Contador con "pop" cuando cambia ---------- */
function PointCounter({ value }) {
  return (
    <motion.span
      key={value}
      initial={{ scale: 1.4 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
      className="inline-flex items-center gap-1 rounded-full bg-[#FB6002] text-white
                 text-xs sm:text-sm font-bold px-3 py-1 shadow-sm"
    >
      🏆 {value} pts
    </motion.span>
  );
}

/* ---------- Botón de acción con pop + partículas ---------- */
function ActionButton({
  icon: Icon,
  label,
  availableLabel,
  disabled,
  onClick,
  color,
  bursts,
  type,
}) {
  const myBursts = bursts.filter((b) => b.type === type);

  return (
    <div className="relative">
      <motion.button
        onClick={onClick}
        disabled={disabled}
        whileTap={{ scale: 0.88 }}
        animate={myBursts.length ? { scale: [1, 1.12, 1] } : { scale: 1 }}
        transition={{ duration: 0.4 }}
        className={`flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-2 text-white
                    transition-colors min-w-[92px] shadow-sm
                    ${disabled ? "opacity-50 cursor-not-allowed bg-gray-400 dark:bg-zinc-600" : color}`}
        title={disabled ? `Disponible en ${availableLabel}` : label}
      >
        <span className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold">
          <Icon className="w-4 h-4" />
          {label}
        </span>
        <span className="text-[10px] font-medium opacity-90">
          {disabled ? `⏳ ${availableLabel}` : "+10 pts"}
        </span>
      </motion.button>

      {/* Burst de partículas que sale del botón */}
      <AnimatePresence>
        {myBursts.map((b) => (
          <ParticleBurst key={b.id} type={type} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ParticleBurst({ type }) {
  const emojis = BURST_EMOJI[type] || BURST_EMOJI.feed;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {emojis.map((emoji, i) => {
        const angle = (-90 + (i - 1) * 45) * (Math.PI / 180);
        const dist = 34 + i * 8;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;
        return (
          <motion.span
            key={i}
            initial={{ opacity: 1, scale: 0.6, x: 0, y: 0 }}
            animate={{ opacity: 0, scale: 1.3, x: dx, y: dy }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className="absolute text-lg"
          >
            {emoji}
          </motion.span>
        );
      })}
    </div>
  );
}

/* ---------- Modal de celebración ---------- */
function CelebrationModal({ celebration }) {
  return (
    <AnimatePresence>
      {celebration && (
        <motion.div
          key={celebration.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center
                     bg-black/20 backdrop-blur-[1px]"
        >
          <motion.div
            initial={{ scale: 0.5, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, y: -20, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className="flex items-center gap-3 rounded-2xl bg-white dark:bg-zinc-900 shadow-2xl
                       px-6 py-4 border border-[#FB6002]/30"
          >
            <motion.span
              animate={{ rotate: [0, -12, 12, 0], scale: [1, 1.2, 1] }}
              transition={{ duration: 0.6, repeat: 1 }}
              className="text-4xl"
            >
              {celebration.type === "feed" ? "🍖" : "💧"}
            </motion.span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {celebration.type === "feed"
                  ? "¡Nerito devoró su comida!"
                  : "¡Nerito bebió su agua!"}
              </span>
              <span className="text-2xl font-extrabold text-[#FB6002] leading-none">
                +{celebration.points} pts
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
