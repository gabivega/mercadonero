import { Package, Car, Home,  } from 'lucide-react';
import HowToSell from './HowToSell';
const options = [
  {
    id: 'product',
    title: 'Productos',
    description: 'Electrónica, Indumentaria, Herramientas',
    icon: <Package className="w-8 h-8 text-blue-600" />,
  },
  {
    id: 'vehicle',
    title: 'Vehículos',
    description: 'Autos, camionetas, motos y otros.',
    icon: <Car className="w-8 h-8 text-green-600" />,
  },
  {
    id: 'property',
    title: 'Inmuebles',
    description: 'Casas, departamentos o locales.',
    icon: <Home className="w-8 h-8 text-purple-600" />,
  },
  {
    id: 'service',
    title: 'Servicios',
    description: 'Oficios, reparaciones y consultoría.',
    icon: <Home className="w-8 h-8 text-orange-600" />,
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
            onClick={() => onSelect(option.id)}
            className="flex items-center p-6 bg-white dark:bg-zinc-900 border-2 border-transparent hover:border-blue-500 rounded-xl shadow-sm transition-all text-left group"
          >
            <div className="p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg group-hover:bg-blue-50 dark:group-hover:bg-zinc-700 transition-colors">
              {option.icon}
            </div>
            <div className="ml-4">
              <h3 className="font-bold text-lg dark:text-white">{option.title}</h3>
              <p className="text-sm text-gray-500 dark:text-zinc-400">{option.description}</p>
            </div>
          </button>
        ))}
      </div>
      <HowToSell />
    </div>
  );
};