import Swal from "sweetalert2";

const ACCENT = "#F26722";

/**
 * Detecta si el sitio está en modo oscuro (clase `dark` en <html>).
 */
const isDark = () =>
  typeof document !== "undefined" &&
  document.documentElement.classList.contains("dark");

/**
 * Estilos base del Swal adaptados a light/dark.
 * Evita el fondo blanco con texto claro ilegible.
 */
const baseTheme = () => {
  const dark = isDark();
  return {
    background: dark ? "#18181b" : "#ffffff",
    color: dark ? "#f4f4f5" : "#3f3f46",
    confirmButtonColor: ACCENT,
    customClass: {
      popup:
        "border rounded-2xl shadow-2xl font-sans " +
        (dark ? "border-zinc-800" : "border-gray-100"),
      title: "font-black " + (dark ? "text-white" : "text-gray-900"),
      htmlContainer: dark ? "text-zinc-300" : "text-gray-600",
      confirmButton: "swal2-confirm !font-bold",
      cancelButton: "swal2-cancel !font-bold",
    },
  };
};

/**
 * Swal de "felicitación" para pools (crear / unirse).
 * Botón principal copia el enlace del grupo.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.html        HTML del cuerpo (usar colores inline)
 * @param {string} [opts.confirmText]
 * @param {string} [opts.linkToCopy]
 */
export const poolSuccessSwal = ({
  title,
  html,
  confirmText = "Copiar enlace",
  linkToCopy,
}) => {
  return Swal.fire({
    icon: "success",
    iconColor: ACCENT,
    title,
    html,
    confirmButtonText: confirmText,
    showCancelButton: true,
    cancelButtonText: "Cerrar",
    reverseButtons: true,
    ...baseTheme(),
  }).then((res) => {
    if (res.isConfirmed && linkToCopy) {
      return navigator.clipboard
        ?.writeText(linkToCopy)
        .then(() => true)
        .catch(() => false);
    }
    return false;
  });
};

/**
 * Swal de error con tema correcto.
 */
export const poolErrorSwal = ({ title, text = "" }) => {
  return Swal.fire({
    icon: "error",
    title,
    text,
    ...baseTheme(),
  });
};

export default poolSuccessSwal;
