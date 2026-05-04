// Función para normalizar nombres de categorías a URLs
const normalizeCategoryName = (name) => {
  return name.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim('-')
}

// Categorías principales con URLs normalizadas
export const categories = [
  { name: 'Vehículos', url: '/c/vehiculos' },
  { name: 'Inmuebles', url: '/c/inmuebles' },
  { name: 'Supermercado', url: '/c/supermercado' },
  { name: 'Celulares y Smartphones', url: '/c/celulares-y-telefonos' },
  { name: 'Computación', url: '/c/computacion' },
  { name: 'Electrónica', url: '/c/electronica-audio-y-video' },
  { name: 'Televisores', url: '/c/televisores' },
  // { name: 'Tecnología', url: '/c/tecnologia' },
  // { name: 'Internacional', url: '/c/internacional' },
  { name: 'Hogar y Muebles', url: '/c/hogar-y-muebles' },
  { name: 'Electrodomésticos', url: '/c/electrodomesticos' },
  { name: 'Herramientas', url: '/c/herramientas' },
  { name: 'Construcción', url: '/c/construccion' },
  { name: 'Deportes y Fitness', url: '/c/deportes-y-fitness' },
  { name: 'Accesorios para Vehículos', url: '/c/accesorios-para-vehiculos' },
  { name: 'Para tu Negocio', url: '/c/para-tu-negocio' },
  { name: 'Mascotas', url: '/c/mascotas' },
  { name: 'Moda', url: '/c/moda' },
  { name: 'Juegos y Juguetes', url: '/c/juegos-y-juguetes' },
  { name: 'Bebés', url: '/c/bebes' },
  { name: 'Belleza y Cuidado Personal', url: '/c/belleza-y-cuidado-personal' },
  { name: 'Salud y Equipamiento Médico', url: '/c/salud-y-equipamiento-medico' },
  { name: 'Industrias y Oficinas', url: '/c/industrias-y-oficinas' },
  { name: 'Agro', url: '/c/agro' },
  { name: 'Productos Sustentables', url: '/c/productos-sustentables' },
  { name: 'Servicios', url: '/c/servicios' },
  { name: 'Más vendidos', url: '/c/mas-vendidos' },
  { name: 'Tiendas oficiales', url: '/c/tiendas-oficiales' },
]
