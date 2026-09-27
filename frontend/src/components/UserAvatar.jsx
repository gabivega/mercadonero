/**
 * UserAvatar
 * Muestra la foto de perfil del usuario o, si no tiene, un círculo con sus
 * iniciales (fallback). Evita el clásico ícono de "imagen rota".
 *
 * @param {object}  props
 * @param {string}  [props.avatar]    URL del avatar (puede venir vacía)
 * @param {string}  [props.name]      username o nombre para sacar iniciales
 * @param {number}  [props.size=32]   tamaño en px
 * @param {string}  [props.className] clases extra
 */
export default function UserAvatar({
  avatar,
  name = "",
  size = 32,
  className = "",
}) {
  const initials = getInitials(name);

  // Color de fondo estable a partir del nombre (para que cada user tenga el suyo).
  const bg = colorFromString(name || initials);

  const style = { width: size, height: size };

  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        title={name}
        style={style}
        className={`rounded-full object-cover bg-gray-200 shrink-0 ${className}`}
        onError={(e) => {
          // Si la imagen falla, se oculta y mostramos las iniciales.
          e.currentTarget.style.display = "none";
          const sib = e.currentTarget.nextSibling;
          if (sib) sib.style.display = "flex";
        }}
      />
    );
  }

  return (
    <span
      style={{ ...style, backgroundColor: bg, fontSize: size * 0.4 }}
      className={`rounded-full items-center justify-center font-black text-white select-none shrink-0 flex ${className}`}
    >
      {initials}
    </span>
  );
}

/** Devuelve hasta 2 iniciales a partir de un nombre/username. */
export function getInitials(name) {
  const clean = String(name || "")
    .trim()
    .replace(/[^A-Za-zÁáÉéÍíÓóÚúÑñ0-9\s._-]/g, "");
  if (!clean) return "?";
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deriva un color HSL estable a partir de un string. */
export function colorFromString(str) {
  const s = String(str || "x");
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = s.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 45%)`;
}
