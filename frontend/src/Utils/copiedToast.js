import Swal from "sweetalert2";

/**
 * Muestra un toast de SweetAlert "Enlace copiado".
 * Reutilizable por cualquier acción de copiar (pools, links, etc.).
 *
 * @param {string} [text] mensaje secundario (opcional)
 */
export const showCopiedToast = (text = "Ya podés pegarlo donde quieras") => {
  const isDark = document.documentElement.classList.contains("dark");

  const Toast = Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 2000,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.addEventListener("mouseenter", Swal.stopTimer);
      toast.addEventListener("mouseleave", Swal.resumeTimer);
    },
  });

  Toast.fire({
    icon: "success",
    title: "Enlace copiado",
    text,
    background: isDark ? "#18181b" : "#ffffff",
    color: isDark ? "#f4f4f5" : "#3f3f46",
    iconColor: "#F26722",
    customClass: {
      popup:
        "border border-gray-100 dark:border-zinc-800 rounded-xl shadow-lg font-sans",
      title: "text-sm font-bold text-gray-800 dark:text-zinc-100",
      htmlContainer: "text-xs text-gray-500 dark:text-zinc-400",
    },
  });
};

export default showCopiedToast;
