import { Package, Car, Home, Lock } from 'lucide-react';
import HowToSell from './HowToSell';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS DE PUBLICACIÓN HABILITADOS EN EL LANZAMIENTO
// ═══════════════════════════════════════════════════════════════════════════
// En esta etapa SOLO se pueden crear Productos (rubro computación/tecnología).
// Vehículos, Inmuebles y Servicios se muestran en gris con candado para que el
// usuario entienda que existen y van a llegar, en vez de que simplemente
// "desaparezcan" (lo que se lee como un bug o como que no ofrecemos eso).
//
// Se elige DESHABILITAR y no OCULTAR por dos motivos:
//  - Comunica el roadmap ("próximamente") sin prometer fechas.
//  - Si un usuario cae desde un link viejo a /vender?tipo=vehicle, ve por qué
//    no puede en vez de un selector vacío.
// Para reactivar un tipo: quitar `disabled: true` de su opción.
const options = [
  {
    id: 'product',
    title: 'Productos',
    description: 'Computación, tecnología y accesorios',
    icon: <Package className="w-8 h-8 text-blue-600" />,
  },
  {
    id: 'vehicle',
    title: 'Vehículos',
    description: 'Próximamente.',
    icon: <Car className="w-8 h-8 text-gray-400" />,
    disabled: true,
  },
  {
    id: 'property',
    title: 'Inmuebles',
    description: 'Próximamente.',
    icon: <Home className="w-8 h-8 text-gray-400" />,
    disabled: true,
  },
  {
    id: 'service',
    title: 'Servicios',
    description: 'Próximamente.',
    icon: <Home className="w-8 h-8 text-gray-400" />,
    disabled: true,
  },
];

export const ListingTypeSelector = ({ onSelect }) => {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold text-center mb-8 dark:text-white">
        ¿Qué vas a publicar hoy?
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {options.map((option) => (
          <button
            key={option.id}
            type="button"
            // Los tipos no habilitados no hacen nada al clickearse: además de
            // `disabled`, cortamos el handler como cinturón y tiradores (un
            // `disabled` mal heredado nunca debe abrir un formulario vacío).
            onClick={() => !option.disabled && onSelect(option.id)}
            disabled={option.disabled}
            aria-disabled={option.disabled}
            className={`relative flex items-center p-6 bg-white dark:bg-zinc-900 border-2 rounded-xl shadow-sm transition-all text-left ${
              option.disabled
                ? "border-transparent opacity-60 cursor-not-allowed"
                : "border-transparent hover:border-blue-500 group"
            }`}
          >
            {option.disabled && (
              <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-zinc-400">
                <Lock className="w-3 h-3" /> Próximamente
              </span>
            )}
            <div
              className={`p-4 rounded-lg transition-colors ${
                option.disabled
                  ? "bg-gray-50 dark:bg-zinc-800"
                  : "bg-gray-50 dark:bg-zinc-800 group-hover:bg-blue-50 dark:group-hover:bg-zinc-700"
              }`}
            >
              {option.icon}
            </div>
            <div className="ml-4">
              <h3
                className={`font-bold text-lg ${
                  option.disabled ? "text-gray-400 dark:text-zinc-500" : "dark:text-white"
                }`}
              >
                {option.title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-zinc-400">
                {option.description}
              </p>
            </div>
          </button>
        ))}
      </div>
      <HowToSell />
    </div>
  );
};