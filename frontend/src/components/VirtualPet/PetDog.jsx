import React from "react";

/**
 * PetDog
 * Cachorro "Nerito" dibujado como SVG inline (sin assets externos).
 * Animaciones 100% por CSS (keyframes inyectados una sola vez), para no
 * depender de GIFs ni librerías pesadas.
 *
 * Props:
 *  - mood: "idle" | "eating" | "drinking"  -> estado de la animación
 *  - className: clases extra para el contenedor
 */
const ANIMATIONS = `
@keyframes nero-tail-wag {
  0%, 100% { transform: rotate(-14deg); }
  50%      { transform: rotate(16deg); }
}
@keyframes nero-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95%           { transform: scaleY(0.1); }
}
@keyframes nero-bob {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-4px); }
}
@keyframes nero-eat {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25%      { transform: translateY(2px) rotate(-3deg); }
  50%      { transform: translateY(4px) rotate(0deg); }
  75%      { transform: translateY(2px) rotate(3deg); }
}
@keyframes nero-ear-flap {
  0%, 100% { transform: rotate(0deg); }
  50%      { transform: rotate(10deg); }
}
.nero-pet-root { transform-origin: 50% 90%; animation: nero-bob 2.6s ease-in-out infinite; }
.nero-pet-root.nero-eating { animation: nero-eat 0.35s ease-in-out 4; }
.nero-pet-root.nero-drinking { animation: nero-eat 0.3s ease-in-out 5; }
.nero-tail { transform-origin: 18px 60px; animation: nero-tail-wag 0.7s ease-in-out infinite; }
.nero-eye { transform-origin: center; animation: nero-blink 4s infinite; }
.nero-ear { transform-origin: top center; animation: nero-ear-flap 2s ease-in-out infinite; }
`;

export default function PetDog({ mood = "idle", className = "" }) {
  const moodClass =
    mood === "eating"
      ? "nero-eating"
      : mood === "drinking"
        ? "nero-drinking"
        : "";

  return (
    <div className={`relative ${className}`}>
      {/* Keyframes inyectados una sola vez */}
      <style>{ANIMATIONS}</style>

      <svg
        viewBox="0 0 120 110"
        className={`nero-pet-root ${moodClass} w-full h-full drop-shadow-sm`}
        role="img"
        aria-label="Nerito, tu perro cachorro"
      >
        {/* Sombra en el piso */}
        <ellipse cx="60" cy="104" rx="26" ry="5" fill="rgba(0,0,0,0.12)" />

        {/* Cola */}
        <g className="nero-tail">
          <path
            d="M26 78 C10 74 8 58 18 54 C14 64 20 72 30 72 Z"
            fill="#E9A23B"
            stroke="#B87A22"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>

        {/* Patas traseras */}
        <rect x="40" y="86" width="12" height="16" rx="5" fill="#F4C77C" stroke="#B87A22" strokeWidth="2" />
        <rect x="66" y="86" width="12" height="16" rx="5" fill="#F4C77C" stroke="#B87A22" strokeWidth="2" />

        {/* Cuerpo */}
        <ellipse cx="60" cy="74" rx="30" ry="22" fill="#F4C77C" stroke="#B87A22" strokeWidth="2.5" />
        <ellipse cx="60" cy="80" rx="17" ry="13" fill="#FDECC8" />

        {/* Patas delanteras */}
        <rect x="30" y="82" width="12" height="20" rx="5" fill="#F4C77C" stroke="#B87A22" strokeWidth="2" />
        <rect x="78" y="82" width="12" height="20" rx="5" fill="#F4C77C" stroke="#B87A22" strokeWidth="2" />

        {/* Orejas */}
        <g className="nero-ear" style={{ transformOrigin: "46px 34px" }}>
          <path d="M46 30 C40 12 26 12 30 34 C34 40 44 42 46 34 Z" fill="#E9A23B" stroke="#B87A22" strokeWidth="2" strokeLinejoin="round" />
        </g>
        <g className="nero-ear" style={{ transformOrigin: "74px 34px" }}>
          <path d="M74 30 C80 12 94 12 90 34 C86 40 76 42 74 34 Z" fill="#E9A23B" stroke="#B87A22" strokeWidth="2" strokeLinejoin="round" />
        </g>

        {/* Cabeza */}
        <circle cx="60" cy="46" r="28" fill="#F7D9A0" stroke="#B87A22" strokeWidth="2.5" />

        {/* Mancha del ojo */}
        <path d="M44 34 C52 28 64 30 68 40 C60 44 46 42 44 34 Z" fill="#E9A23B" opacity="0.9" />

        {/* Ojos */}
        <ellipse className="nero-eye" cx="49" cy="46" rx="3.6" ry="4.4" fill="#3B2A15" />
        <ellipse className="nero-eye" cx="71" cy="46" rx="3.6" ry="4.4" fill="#3B2A15" />
        <circle cx="50.2" cy="44.5" r="1.3" fill="#fff" />
        <circle cx="72.2" cy="44.5" r="1.3" fill="#fff" />

        {/* Hocico */}
        <ellipse cx="60" cy="58" rx="9" ry="7" fill="#FDECC8" />
        <ellipse cx="60" cy="53" rx="4.5" ry="3.4" fill="#3B2A15" />
        <path d="M60 56 L60 60 M60 60 C56 63 54 60 53 58 M60 60 C64 63 66 60 67 58"
          fill="none" stroke="#3B2A15" strokeWidth="1.8" strokeLinecap="round" />

        {/* Lengua (aparece al comer/beber) */}
        {(mood === "eating" || mood === "drinking") && (
          <path d="M57 62 C57 67 63 67 63 62 Z" fill="#F47C7C" stroke="#D15B5B" strokeWidth="1.2" />
        )}

        {/* Collar con chapita */}
        <path d="M36 60 C46 70 74 70 84 60" fill="none" stroke="#7C4A1E" strokeWidth="4" strokeLinecap="round" />
        <circle cx="60" cy="70" r="5" fill="#FB6002" stroke="#B87A22" strokeWidth="1.5" />
        <text x="60" y="73" textAnchor="middle" fontSize="6" fontWeight="700" fill="#fff">N</text>
      </svg>
    </div>
  );
}
