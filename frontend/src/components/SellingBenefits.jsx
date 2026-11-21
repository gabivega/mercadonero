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
    title: "Cobrás por adelantado",
    detail: "Recibís el pago antes de despachar. La plataforma se ocupa de proteger al comprador.",
  },
  {
    icon: Percent,
    title: "Comisión fija del 3%",
    detail: "Una sola comisión por venta. Sin cargos ocultos ni costo por publicar.",
  },
  {
    icon: BadgeCheck,
    title: "Sin costos fijos",
    detail: "Plan free: no pagás mensualidad ni por mantener tu tienda abierta.",
  },
  {
    icon: Coins,
    title: "Cobrás en USD (USDT)",
    detail: "Tu venta se liquida en dólares cripto, garantizada por contrato inteligente.",
  },
  {
    icon: Wallet,
    title: "Billetera Web3 sin costo",
    detail: "Creamos tu billetera y cubrimos el gas de red. Sin saber de cripto.",
  },
  {
    icon: Smartphone,
    title: "Clasificados sin comisión",
    detail: "Vehículos, inmuebles y servicios: publicás gratis, sin escrow.",
  },
  {
    icon: Truck,
    title: "Cotizador de envíos incluido",
    detail: "Calculá el costo de envío al instante (Zipnova) en cada publicación.",
  },
  {
    icon: ShieldCheck,
    title: "Herramientas de promoción",
    detail: "Sistema de referidos y reintegros para fomentar más ventas.",
  },
  {
    icon: Lock,
    title: "Sin requisitos fiscales para publicar",
    detail: "No exigimos CUIT ni datos de facturación para vender. Tus datos, privados.",
  },
];

// Tabla "Qué incluye": todas las filas son beneficios de TU cuenta.
// (No es una comparación contra terceros, que se desactualiza y expone.)
const INCLUDED = [
  { label: "Publicar productos", value: "Gratis" },
  { label: "Costo mensual", value: "$0 · plan free" },
  { label: "Comisión por venta", value: "3% fija" },
  { label: "Cobro", value: "Por adelantado (transferencia o USDT)" },
  { label: "Billetera y gas de red", value: "Incluido, sin costo" },
  { label: "Protección al comprador (escrow)", value: "Incluido" },
  { label: "Cotizador de envíos (Zipnova)", value: "Incluido" },
  { label: "Clasificados (vehículos, inmuebles, servicios)", value: "Sin comisión" },
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
          Creamos un marketplace donde todos ganan: comisiones fijas súper
          bajas, flexibilidad y privacidad. Protegemos a compradores y
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
            La comisión del <b>3%</b> se descuenta al <b>liberar el pago</b>, no al
            publicar.
          </li>
          <li>
            Para productos de pago se requiere una <b>garantía (colateral)</b> en tu
            billetera que cubre el <b>100% del importe del comprador</b> (incluido el
            envío).
          </li>
          <li>
            El <b>envío lo pagás vos a tu operador logístico</b>: el costo ya viene
            incluido en lo que paga el comprador a través de la plataforma. Zipnova
            hoy se usa como <b>cotizador de costos</b>.
          </li>
          <li>
            Publicás recién <b>después de la aprobación</b> de tu tienda (por eso la
            lista de espera).
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
