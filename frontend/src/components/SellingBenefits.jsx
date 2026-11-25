import {
  ArrowRight,
  Wallet,
  Percent,
  BadgeCheck,
  Truck,
  TrendingUp,
  ShieldCheck,
  Coins,
  Timer,
  Smartphone,
  Lock,
} from "lucide-react";
// ─────────────────────────────────────────────────────────────────────────────
// SellingBenefits
//
// Sección informativa que aparece en /vender ANTES del formulario de solicitud
// (waiting list). Hoy el vendedor caía de frente en el pedido de datos sin ver
// POR QUÉ le conviene vender acá → fricción de conversión.
//
// Es un componente PRESENTACIONAL: no decide a dónde navega. Recibe
// `onWantToSell` resuelto por el padre (CreateProduct) según el estado del
// usuario (sin login / sin onboarding / en lista / aprobado).
// ─────────────────────────────────────────────────────────────────────────────

// Beneficios: íconos + título + una línea. Datos alineados con el código real
// (comisión fija 3%, gas cubierto por la plataforma, escrow + colateral).
const BENEFITS = [
  {
    icon: TrendingUp,
    title: "Cobrá tu venta por adelantado",
    detail: "Somos el único marketplace que permite recibir el pago por transferencia bancaria antes de despachar. Trabajá con el stock de tu proveedor.",
  },
  {
    icon: Percent,
    title: "Comisión fija del 3%",
    detail: "Una sola comisión por venta. Sin cargos ocultos ni costo por publicar. Conocé de antemano cuanto vas a recibir por tu venta",
  },
  {
    icon: BadgeCheck,
    title: "Sin costos fijos",
    detail: "Plan gratuito: no pagás mensualidad ni por mantener tu tienda abierta, solo pagas comision fija por cada venta.",
  },
  {
    icon: Coins,
    title: "Cobrás en USDC o USDT",
    detail: "Podes cobrar en dólares cripto, garantizado por contratos inteligentes. Podes retirarlo a otras billeteras virtuales o exchanges cuando quieras",
  },
  {
    icon: Wallet,
    title: "Billetera Web3 fácil y sin costo",
    detail: "Creas tu billetera gratis y nosotros cubrimos el gas de red. No hace falta saber sobre criptomonedas.",
  },
  {
    icon: Smartphone,
    title: "Transacciones protegidas",
    detail: "Todas las transacciones estan protegidas por contratos inteligentes. Protegemos a compradores y vendedores de la misma forma.",
  },
  {
    icon: Truck,
    title: "Cotizador de envíos incluido",
    detail: "Calculá el costo de envío al instante en cada publicación.",
  },
  {
    icon: ShieldCheck,
    title: "Herramientas de promoción",
    detail: "Sistema de referidos personalizable y con ganancias en dólares. También reintegros en usd en todas las ventas para incentivar el uso.",
  },
  {
    icon: Lock,
    title: "Registro fácil y rápido",
    detail: "No exigimos datos biométricos. Respetamos tu privacidad manteniendo la seguridad de las transacciones.",
  },
];

// Tabla "Qué incluye": todas las filas son beneficios de TU cuenta.
// (No es una comparación contra terceros, que se desactualiza y expone.)
const INCLUDED = [
  { label: "Publicar productos", value: "Gratis" },
  { label: "Costo mensual", value: "$0 · plan gratuito" },
  { label: "Comisión por venta", value: "3% fija" },
  { label: "Cobro", value: "Transferencia bancaria (por adelantado) o USDC/USDT" },
  { label: "Billetera y gas de red", value: "Incluido, sin costo" },
  { label: "Protección al comprador", value: "Incluido" },
  { label: "Cotizador de envíos", value: "Incluido" },
  // { label: "Clasificados (vehículos, inmuebles, servicios)", value: "Sin comisión" },
];

export default function SellingBenefits({ onWantToSell, showCta = true }) {
  return (
    <section className="w-full max-w-5xl mx-auto px-4 py-10 space-y-10 text-gray-900 dark:text-white">
      {/* ── Copy de apertura ───────────────────────────────────────────── */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-tight">
          Vendé en Mercado Nero y ganá más por cada venta
        </h1>
        <p className="text-sm md:text-base text-gray-600 dark:text-zinc-400 leading-relaxed">
          Somos el único marketplace construido sobre blockchain, que permite pagos seguros mediante transferencia bancaria o criptomonedas. <br/>
          En Mercado Nero todos ganan: comisiones fijas súper
          bajas, seguridad y privacidad. Protegemos a compradores y
          vendedores con el poder de los contratos inteligentes.
        </p>
        <p className="text-sm md:text-base text-gray-600 dark:text-zinc-400 leading-relaxed">
          No necesitás conocimientos técnicos: cualquiera puede comprar o
          vender en Mercado Nero.
        </p>
        {showCta && onWantToSell && (
          <div className="pt-2">
            <button
              onClick={onWantToSell}
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#F26722] text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg shadow-[#F26722]/20 hover:scale-105 active:scale-95 transition-all"
            >
              Quiero vender
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Grid de beneficios ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {BENEFITS.map(({ icon: Icon, title, detail }) => (
          <div
            key={title}
            className="flex items-start gap-3 p-5 rounded-2xl border border-gray-100 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/60 shadow-sm"
          >
            <div className="p-2.5 rounded-xl bg-[#F26722]/10 text-[#F26722] flex-shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">{title}</h3>
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1 leading-relaxed">
                {detail}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabla "Qué incluye" ────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto">
        <h2 className="text-lg md:text-xl font-black text-center mb-4">
          Qué incluye tu cuenta
        </h2>
        <div className="rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {INCLUDED.map((row, i) => (
                <tr
                  key={row.label}
                  className={
                    i % 2 === 0
                      ? "bg-gray-50 dark:bg-zinc-900/40"
                      : "bg-white dark:bg-transparent"
                  }
                >
                  <td className="px-4 py-3 font-medium text-gray-700 dark:text-zinc-300">
                    {row.label}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-[#F26722] whitespace-nowrap">
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Condiciones claras ─────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto rounded-2xl border border-amber-300/50 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-5 space-y-2">
        <h2 className="text-sm font-black flex items-center gap-2 text-amber-800 dark:text-amber-300">
          <Timer className="w-4 h-4" /> Condiciones claras
        </h2>
        <ul className="text-xs text-amber-800 dark:text-amber-200 space-y-1.5 leading-relaxed list-disc list-inside">
          <li>
            Para cobrar por adelantado se requiere una <b>garantía (colateral)</b> en tu
            billetera que cubre el <b>100% del importe del comprador</b> (incluido el
            envío).
          </li>
          <li>
            La comisión del <b>3%</b> se descuenta al <b>liberar el pago</b>, tras las confirmación del comprador.
          </li>
          {/* <li>
            El <b>envío lo pagás vos a tu operador logístico</b>: el costo ya viene
            incluido en lo que paga el comprador a través de la plataforma. El cotizador incorporado</b>.
          </li> */}
          <li>
            Cupos limitados: El marketplace está en etapa de lanzamiento y la aprobación de tu tienda puede demorar unos días (sujeto a cupos disponibles).
          </li>
          <li>
            Solicitamos datos fiscales solo para validar la cuenta bancaria utilizada para cobrar mediante transferencia bancaria por adelantado. No compartimos tus movimientos con nadie.
          </li>          
        </ul>
      </div>

      {/* ── CTA final ──────────────────────────────────────────────────── */}
      {showCta && onWantToSell && (
        <div className="text-center pb-4">
          <button
            onClick={onWantToSell}
            className="inline-flex items-center gap-2 px-8 py-4 bg-[#F26722] text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg shadow-[#F26722]/20 hover:scale-105 active:scale-95 transition-all"
          >
            Quiero vender
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </section>
  );
}
