import { Users, Award, ArrowUpRight, Share2, Wallet, Coins, Lightbulb } from 'lucide-react';

export default function Referrals() {
  return (
    <div className="w-full bg-white dark:bg-zinc-950 rounded-2xl border border-gray-100 dark:border-zinc-800/60 overflow-hidden shadow-sm">
      
      {/* 🖼️ BANNER FIJO HORIZONTAL */}
      <div className="w-full h-48 md:h-64 relative bg-zinc-900 overflow-hidden">
        {/* Reemplazá el src de abajo por la imagen que elijas de tu banco de imágenes */}
        <img 
          src="https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=1200&auto=format&fit=crop" 
          alt="Mercado Nero Network" 
          className="w-full h-full object-cover opacity-45 dark:opacity-30 select-none pointer-events-none"
        />
        {/* Degradado e información sobre el banner */}
        <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-zinc-950 via-transparent to-transparent" />
        <div className="absolute bottom-6 left-6 md:left-10 z-10">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/40 text-[#F26722] text-[11px] font-bold uppercase tracking-wider mb-2">
            Próximamente
          </span>
          <h2 className="text-2xl md:text-4xl font-black tracking-tight text-gray-900 dark:text-white">
            Programa de Referidos de Mercado Nero
          </h2>
          <p className="text-xs md:text-sm text-gray-500 dark:text-zinc-400 mt-1 max-w-xl">
            Invitá a comerciantes y compradores a Mercado Nero y generá ingresos pasivos directo en tu wallet por cada operación que realicen.
          </p>
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <div className="p-6 md:p-10 space-y-10">
        
        {/* 📊 PANEL SIMULADO DE ESTADÍSTICAS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border border-gray-100 dark:border-zinc-800/40 opacity-75 select-none relative">
          
          {/* Badge Flotante de Prototipo */}
          <div className="absolute -top-3 right-4 bg-zinc-800 text-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-widest font-bold border border-zinc-700 dark:border-zinc-300">
            Simulación MVP
          </div>

          <div className="space-y-1">
            <span className="text-xs text-gray-400 dark:text-zinc-500 font-medium uppercase tracking-wider">Invitados Totales</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-gray-800 dark:text-zinc-200">24</span>
              <span className="text-xs text-gray-400 dark:text-zinc-500">usuarios</span>
            </div>
          </div>
          
          <div className="space-y-1 border-t sm:border-t-0 sm:border-x border-gray-200/60 dark:border-zinc-800/60 pt-3 sm:pt-0 sm:px-6">
            <span className="text-xs text-gray-400 dark:text-zinc-500 font-medium uppercase tracking-wider">Volumen Compartido</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-gray-800 dark:text-zinc-200">2800.00</span>
              <span className="text-xs text-gray-400 dark:text-zinc-500">USDT</span>
            </div>
          </div>

          <div className="space-y-1 pt-3 sm:pt-0 sm:pl-6">
            <span className="text-xs text-[#F26722] font-bold uppercase tracking-wider flex items-center gap-1">
              <Coins className="w-3.5 h-3.5" /> Recompensas Acumuladas
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-[#F26722]">384.48</span>
              <span className="text-xs text-orange-400 font-medium">USDT</span>
            </div>
          </div>
        </div>

        {/* ⚙️ ¿CÓMO VA A FUNCIONAR EL FLUJO? */}
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
            <Award className="w-5 h-5 text-[#F26722]" /> Mecánica del Sistema de Reintegros
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Paso 1 */}
            <div className="p-5 bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800/80 space-y-3">
              <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/20 text-[#F26722] flex items-center justify-center font-bold text-sm">
                1
              </div>
              <h4 className="font-bold text-gray-800 dark:text-zinc-100 text-sm md:text-base">Recompensa única por producto</h4>
              <p className="text-xs md:text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">
                Cada vendedor decide que % de recompensa (reintegro) ofrece por producto. Los vas a poder seleccionar del panel de referidos, una vez lo tengas habilitado
              </p>
            </div>

            {/* Paso 2 */}
            <div className="p-5 bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800/80 space-y-3">
              <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/20 text-[#F26722] flex items-center justify-center font-bold text-sm">
                2
              </div>
              <h4 className="font-bold text-gray-800 dark:text-zinc-100 text-sm md:text-base">Compartís el enlace del producto</h4>
              <p className="text-xs md:text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">
                Comparte el enlace del producto con tus contactos y ellos podrán adquirirlo con un reintegro automático.
              </p>
            </div>

            {/* Paso 3 */}
            <div className="p-5 bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800/80 space-y-3">
              <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/20 text-[#F26722] flex items-center justify-center font-bold text-sm">
                3
              </div>
              <h4 className="font-bold text-gray-800 dark:text-zinc-100 text-sm md:text-base">Ganancia Pasiva Real</h4>
              <p className="text-xs md:text-sm text-gray-500 dark:text-zinc-400 leading-relaxed">
                 De cada venta concretada vas a recibir en tu wallet el porcentaje ofrecido por el vendedor, el comprador recibe el mismo monto como reintegro. Todo esto ejecutado Automáticamente por un smart contract
              </p>
            </div>

          </div>
        </div>

        {/* 💡 FOOTER EXPLICATIVO PRE-SEED */}
        <div className="p-4 bg-orange-50/40 dark:bg-orange-950/10 rounded-xl border border-orange-100/40 dark:border-orange-900/20 flex flex-col sm:flex-row items-center gap-3.5 text-center sm:text-left">
          <div className="p-2 bg-orange-100 dark:bg-orange-950/40 text-[#F26722] rounded-lg flex-shrink-0">
            <Lightbulb className="w-4 h-4" />
          </div>
          <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed">
            <strong>Nota para inversores:</strong> Este sistema de referidos on-chain aprovecha la inmutabilidad de la blockchain para garantizar transparencia absoluta. Está diseñado para automatizar el marketing de afiliación de manera orgánica, acelerando el volumen de transacciones (GMV) sin costos hundidos fijos para la startup.
          </p>
        </div>

      </div>
    </div>
  );
}