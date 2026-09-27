/*
 * DATOS SIMULADOS DE POOLS (Compras Grupales)
 * Por ahora no hay backend: los pools viven en este archivo.
 * El campo `expiresAt` (fecha de expiración) es simulado.
 */
import img1 from "../assets/img/pool/1.jpg";
import img2 from "../assets/img/pool/2.webp";
import img3 from "../assets/img/pool/3.webp";
import img4 from "../assets/img/pool/4.webp";
import img5 from "../assets/img/pool/5.webp";
import img6 from "../assets/img/pool/6.webp";
import img7 from "../assets/img/pool/7.webp";
import img8 from "../assets/img/pool/8.webp";
import img9 from "../assets/img/pool/9.webp";
import img10 from "../assets/img/pool/10.webp";
import img11 from "../assets/img/pool/11.webp";
import img12 from "../assets/img/pool/12.webp";
import img13 from "../assets/img/pool/13.webp";
import img14 from "../assets/img/pool/14.webp";
import img15 from "../assets/img/pool/15.webp";
import img16 from "../assets/img/pool/16.webp";
import img17 from "../assets/img/pool/17.webp";
import img18 from "../assets/img/pool/18.webp";
import img19 from "../assets/img/pool/19.webp";
import img20 from "../assets/img/pool/20.webp";
import img21 from "../assets/img/pool/21.webp";

export const POOL_IMG_PLACEHOLDER =
  "https://placehold.co/400x300/f3f4f6/9ca3af?text=Pool";

// Fechas relativas a hoy para la simulación (días desde ahora)
const daysFromNow = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // formato YYYY-MM-DD
};

export const POOLS = [
  {
    id: 1,
    title:
      "Taladro S12 20nm 0.8-10mm 0-750rpm 1x1.5ah Tipo C +punta Color Turquesa Frecuencia 50 Hz 60 Hz",
    brand: "Total",
    seller: "EG import",
    location: "Bahía Blanca, Bs As",
    price: 45000,
    image: img1,
    current: 80,
    goal: 100,
    status: "activo",
    expiresAt: daysFromNow(3),
    freeShipping: true,
  },
  {
    id: 2,
    title: "Amoladora Angular 750W 115mm Disco Corte Incluido",
    brand: "Black+Decker",
    seller: "FerreTotal",
    location: "CABA, Bs As",
    price: 52500,
    image: img2,
    current: 42,
    goal: 60,
    status: "activo",
    expiresAt: daysFromNow(12),
    freeShipping: true,
  },
  {
    id: 3,
    title: "Juego de Llaves Combinadas 20 Piezas Acero Cromo Vanadio",
    brand: "Stanley",
    seller: "Herramientas Sur",
    location: "Rosario, Santa Fe",
    price: 38900,
    image: img3,
    current: 60,
    goal: 60,
    status: "completado",
    expiresAt: daysFromNow(-2),
    freeShipping: true,
  },
  {
    id: 4,
    title: "Soldadora Inverter 200A MMA Portátil 220V",
    brand: "Lusqtoff",
    seller: "SoldarTech",
    location: "Córdoba Capital, Córdoba",
    price: 118000,
    image: img4,
    current: 75,
    goal: 100,
    status: "activo",
    expiresAt: daysFromNow(1),
    freeShipping: true,
  },
  {
    id: 5,
    title: "Kit Destornilladores Precisión 32 en 1 Magnéticos",
    brand: "Hamilton",
    seller: "GadgetStore",
    location: "La Plata, Bs As",
    price: 15900,
    image: img5,
    current: 30,
    goal: 50,
    status: "activo",
    expiresAt: daysFromNow(20),
    freeShipping: false,
  },
  {
    id: 6,
    title: "Compresor de Aire 50L 2HP 8 Bar Lubricado",
    brand: "Gamma",
    seller: "AirePro",
    location: "Mendoza Capital, Mendoza",
    price: 285000,
    image: img6,
    current: 45,
    goal: 50,
    status: "activo",
    expiresAt: daysFromNow(6),
    freeShipping: true,
  },
  {
    id: 7,
    title: "Hidrolavadora Eléctrica 1400W 110 Bar",
    brand: "Karcher",
    seller: "LimpiaMax",
    location: "Mar del Plata, Bs As",
    price: 162000,
    image: img7,
    current: 100,
    goal: 100,
    status: "completado",
    expiresAt: daysFromNow(-5),
    freeShipping: true,
  },
  {
    id: 8,
    title: "Caja de Herramientas 20 Pulgadas con Bandeja Organizadora",
    brand: "Total",
    seller: "EG import",
    location: "Bahía Blanca, Bs As",
    price: 28900,
    image: img8,
    current: 18,
    goal: 40,
    status: "expirado",
    expiresAt: daysFromNow(-1),
    freeShipping: false,
  },
  {
    id: 9,
    title: "Sierra Circular 1400W 185mm Disco 24Dientes",
    brand: "Makita",
    seller: "MaderaSur",
    location: "Neuquén Capital, Neuquén",
    price: 210000,
    image: img9,
    current: 22,
    goal: 30,
    status: "activo",
    expiresAt: daysFromNow(9),
    freeShipping: true,
  },
  {
    id: 10,
    title: "Batería 18V 4.0Ah Litio Ion Compatible Bosch",
    brand: "Bosch",
    seller: "EnergíaTool",
    location: "Salta Capital, Salta",
    price: 54000,
    image: img10,
    current: 12,
    goal: 25,
    status: "cancelado",
    expiresAt: daysFromNow(-3),
    freeShipping: false,
  },
  {
    id: 11,
    title: "Multímetro Digital Profesional Autorango 600V",
    brand: "Fluke",
    seller: "ElectroMedición",
    location: "San Miguel de Tucumán, Tucumán",
    price: 89000,
    image: img11,
    current: 38,
    goal: 50,
    status: "activo",
    expiresAt: daysFromNow(15),
    freeShipping: true,
  },
  {
    id: 12,
    title: "Escalera de Aluminio 6 Peldaños Plegable Antideslizante",
    brand: "Sheffield",
    seller: "HogarSeguro",
    location: "Santa Fe Capital, Santa Fe",
    price: 72000,
    image: img12,
    current: 27,
    goal: 40,
    status: "activo",
    expiresAt: daysFromNow(4),
    freeShipping: true,
  },
  {
    id: 13,
    title: "Pintura Látex Interior/Exterior 20L Blanco Mate",
    brand: "Alba",
    seller: "Pinturería Central",
    location: "Quilmes, Bs As",
    price: 98000,
    image: img13,
    current: 55,
    goal: 80,
    status: "activo",
    expiresAt: daysFromNow(18),
    freeShipping: true,
  },
  {
    id: 14,
    title: "Motosierra a Explosión 52cc Espada 20 Pulgadas",
    brand: "Hyundai",
    seller: "BosqueTool",
    location: "Bariloche, Río Negro",
    price: 245000,
    image: img14,
    current: 9,
    goal: 20,
    status: "expirado",
    expiresAt: daysFromNow(-7),
    freeShipping: true,
  },
  {
    id: 15,
    title: "Amoladora de Banco 6 Pulgadas 350W Doble Piedra",
    brand: "Gladiator",
    seller: "TallerPro",
    location: "Avellaneda, Bs As",
    price: 134000,
    image: img15,
    current: 41,
    goal: 50,
    status: "activo",
    expiresAt: daysFromNow(8),
    freeShipping: true,
  },
  {
    id: 16,
    title: "Bomba Sumergible para Pozo 1HP 220V Acero Inoxidable",
    brand: "Rowa",
    seller: "AguaSur",
    location: "Tandil, Bs As",
    price: 176000,
    image: img16,
    current: 24,
    goal: 30,
    status: "activo",
    expiresAt: daysFromNow(2),
    freeShipping: true,
  },
  {
    id: 17,
    title: "Termotanque Eléctrico 80L Alta Recuperación",
    brand: "Rheem",
    seller: "ClimaHome",
    location: "Corrientes Capital, Corrientes",
    price: 312000,
    image: img17,
    current: 50,
    goal: 50,
    status: "completado",
    expiresAt: daysFromNow(-10),
    freeShipping: true,
  },
  {
    id: 18,
    title: "Robots Cortacésped Automático 600m² App WiFi",
    brand: "Worx",
    seller: "JardínSmart",
    location: "Pilar, Bs As",
    price: 890000,
    image: img18,
    current: 6,
    goal: 15,
    status: "activo",
    expiresAt: daysFromNow(25),
    freeShipping: true,
  },
  {
    id: 19,
    title: "Set 40 Brocas HSS Titanio para Metal Madera Hormigón",
    brand: "Dormer",
    seller: "Herramientas Sur",
    location: "Rosario, Santa Fe",
    price: 27400,
    image: img19,
    current: 33,
    goal: 60,
    status: "activo",
    expiresAt: daysFromNow(11),
    freeShipping: false,
  },
  {
    id: 20,
    title: "Lustradora Orbital 700W 6 Velocidades con Kit",
    brand: "Dewalt",
    seller: "Autodetailing ARG",
    location: "San Isidro, Bs As",
    price: 198000,
    image: img20,
    current: 14,
    goal: 25,
    status: "cancelado",
    expiresAt: daysFromNow(-4),
    freeShipping: true,
  },
  {
    id: 21,
    title: "Generador Eléctrico Nafta 3KW Arranque Manual 220V",
    brand: "Honda",
    seller: "EnergíaCampo",
    location: "Olavarría, Bs As",
    price: 540000,
    image: img21,
    current: 19,
    goal: 30,
    status: "activo",
    expiresAt: daysFromNow(5),
    freeShipping: true,
  },
];

// Helper: porcentaje de completitud de un pool
export const getPoolPercent = (pool) =>
  Math.min(100, Math.round((pool.current / pool.goal) * 100));

// Helper: días restantes hasta que expira (negativo si ya venció)
export const getDaysLeft = (pool) => {
  if (!pool.expiresAt) return null;
  const now = new Date();
  const end = new Date(`${pool.expiresAt}T23:59:59`);
  const diffMs = end.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

// Helper: pools activos ordenados por % (de mayor a menor)
export const getActivePoolsByPercent = (limit) => {
  const sorted = POOLS.filter((p) => p.status === "activo").sort(
    (a, b) => getPoolPercent(b) - getPoolPercent(a),
  );
  return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
};
