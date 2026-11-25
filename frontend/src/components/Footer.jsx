import React from 'react';
import { HelpCircle, Mail, ShieldAlert } from 'lucide-react';
import logoWhite from '../assets/img/logo-white.png';
// Logo negro reservado para cuando se reactive el light theme.
// import logoBlack from '../assets/img/logo-black.png';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-100 dark:border-zinc-800/60 bg-white dark:bg-zinc-950 mt-20 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 pt-16 pb-8">

        {/* Grilla Principal */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">

          {/* Columna 1: Branding / Filosofía */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {/* Solo existe dark: logo blanco. Para reactivar el light, volver
                  a usar: src={theme === 'dark' ? logoWhite : logoBlack} */}
              <img
                src={logoWhite}
                alt="Mercado Nero"
                className="h-8 w-auto object-contain"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed max-w-xs">
              El primer marketplace multivendor Web3 de la región. Conectamos compradores y vendedores de forma segura y transparente con las comisiones mas bajas del mercado.
            </p>
            {/* Status de Red Escencial para Web3 */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 text-[11px] font-medium font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              BSC Testnet Connected
            </div>
          </div>

          {/* Columna 2: Navegación del Ecosistema */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-4">
              Marketplace
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="/productos" className="text-gray-600 dark:text-zinc-400 hover:text-[#F26722] dark:hover:text-[#F26722] transition-colors">
                  Explorar Productos
                </a>
              </li>
              <li>
                <a href="/vender" className="text-gray-600 dark:text-zinc-400 hover:text-[#F26722] dark:hover:text-[#F26722] transition-colors">
                  Publicar un Artículo
                </a>
              </li>
              {/* <li>
                <a href="/compras-grupales" className="text-gray-600 dark:text-zinc-400 hover:text-[#F26722] dark:hover:text-[#F26722] transition-colors">
                  Compras Grupales
                </a>
              </li> */}
            </ul>
          </div>

                    {/* Columna 3: Soporte y Guías */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-4">
              Soporte y Ayuda
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="/ayuda/comprar" className="text-gray-600 dark:text-zinc-400 hover:text-[#F26722] dark:hover:text-[#F26722] transition-colors flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" /> Ayuda para Compradores
                </a>
              </li>
              <li>
                <a href="/ayuda/vender" className="text-gray-600 dark:text-zinc-400 hover:text-[#F26722] dark:hover:text-[#F26722] transition-colors flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" /> Guía para Vendedores
                </a>
              </li>
              <li>
                <a href="/ayuda" className="text-gray-600 dark:text-zinc-400 hover:text-[#F26722] dark:hover:text-[#F26722] transition-colors flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" /> Preguntas Frecuentes
                </a>
              </li>
              <li>
                <a href="/contacto" className="text-gray-600 dark:text-zinc-400 hover:text-[#F26722] dark:hover:text-[#F26722] transition-colors flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> Ayuda y contacto
                </a>
              </li>
            </ul>
          </div>

          {/* Columna 4: Comunidad y Redes */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-4">
              Redes Sociales
            </h4>
            {/* <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3.5 leading-relaxed">
             Participá de la comunidad de Mercado Nero generando reels, posts y reviews de tus productos y experiencias.
            </p> */}
            <div className="flex items-center gap-3">
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noreferrer"
                className="p-2 bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/60 rounded-xl text-gray-600 dark:text-zinc-400 hover:text-white hover:bg-[#F26722] dark:hover:bg-[#F26722] hover:border-[#F26722] transition-all"
                aria-label="Twitter X"
              >
                {/* <Twitter className="w-4 h-4" /> */}
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                className="p-2 bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/60 rounded-xl text-gray-600 dark:text-zinc-400 hover:text-white hover:bg-[#F26722] dark:hover:bg-[#F26722] hover:border-[#F26722] transition-all"
                aria-label="Instagram"
              >
                {/* <Instagram className="w-4 h-4" /> */}
              </a>
            </div>

            {/* Botón de Arrepentimiento.
                Es OBLIGATORIO en Argentina (Ley 24.240 de Defensa del Consumidor):
                el consumidor puede revocar una compra dentro de los 10 días
                corridos de recibir el producto. Debe ser visible y accesible
                permanentemente, por eso vive en el footer y no en un menú interno.
                Lleva a /contacto?motivo=refund, que dispara el formulario
                específico y el mail/Telegram al admin. */}
            <a
              href="/contacto?motivo=refund"
              className="mt-5 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[#F26722]/40 text-[11px] font-bold text-[#F26722] hover:bg-[#F26722] hover:text-white transition-colors"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Botón de Arrepentimiento
            </a>
          </div>

        </div>

        {/* Separador */}
        <div className="h-px w-full bg-gray-100 dark:bg-zinc-800/40 my-6" />

                {/* Barra de Derechos / Legal de Cierre */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500 dark:text-zinc-500">
          <div>
            © {currentYear} <strong>Mercado Nero</strong> — Todos los derechos reservados.
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <a href="/terminos-y-condiciones" className="hover:text-gray-800 dark:hover:text-zinc-300 transition-colors">Términos</a>
            <a href="/politica-de-privacidad" className="hover:text-gray-800 dark:hover:text-zinc-300 transition-colors">Privacidad</a>
            <a href="/contacto" className="hover:text-gray-800 dark:hover:text-zinc-300 transition-colors">Contacto</a>
            <a href="/contacto?motivo=refund" className="hover:text-gray-800 dark:hover:text-zinc-300 transition-colors">Arrepentimiento</a>
            <span className="text-gray-300 dark:text-zinc-800">|</span>
            <span className="font-mono text-[10px] uppercase">v0.2.0-beta</span>
          </div>
        </div>

      </div>
    </footer>
  );
}
