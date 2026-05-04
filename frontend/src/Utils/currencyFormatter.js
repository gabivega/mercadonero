// Transforma "1.000" en 1000 (para la lógica)
export const deformatMoney = (value) => value.replace(/\D/g, '');

// Transforma 1000 en "1.000" (para la vista)
export const formatMoney = (value) => {
  if (!value) return '';
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 0
  }).format(value);
};
