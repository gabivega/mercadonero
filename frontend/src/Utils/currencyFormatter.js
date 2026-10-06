// Transforma "1.000" en 1000 (para la lógica)
export const deformatMoney = (value) => String(value).replace(/\D/g, '');

// Transforma 1000 en "1.000" (para la vista). Formato es-AR sin decimales.
// Acepta números o strings numéricos. Devuelve "" si no hay valor válido.
export const formatMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(n);
};

// Export default = formatMoney, para poder importarlo como:
//   import currencyFormatter from "../Utils/currencyFormatter";
//   currencyFormatter(16254) -> "16.254"
export default formatMoney;

