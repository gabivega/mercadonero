import React from 'react';
import { ShoppingBag, ShieldCheck, Cpu, HelpCircle, BookOpen, Twitter, Github } from 'lucide-react';

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
              {/* Logo placeholder - Reemplazalo por tu componente <Logo /> si tenés uno */}
              <div className="p-1.5 bg-orange-500 rounded-lg text-white">
                <ShoppingBag className="w-5 h-5 stroke-[2.5]" />
              </div>
              <span className="font-black text-xl tracking-tight text-gray-900 dark:text-white">
                MERCADO<span className="text-[#F26722]">NERO</span>
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-zinc-400 leading-relaxed max-w-xs">
              El primer marketplace multivendor Web3 de la región. Comercio descentralizado, transparente y asegurado por contratos inteligentes sin intermediarios.
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
              <li>
                <a href="/tokenomics" className="text-gray-600 dark:text-zinc-400 hover:text-[#F26722] dark:hover:text-[#F26722] transition-colors flex items-center gap-1.5">
                  Token $NERO <span className="text-[10px] bg-orange-100 dark:bg-orange-950/40 text-[#F26722] px-1 rounded font-bold">Utility</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Columna 3: Soporte y Guías */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-4">
              Soporte y Ayuda
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <a href="/ayuda/vender" className="text-gray-600 dark:text-zinc-400 hover:text-[#F26722] dark:hover:text-[#F26722] transition-colors flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5" /> Guía para Vendedores
                </a>
              </li>
              <li>
                <a href="/ayuda/disputas" className="text-gray-600 dark:text-zinc-400 hover:text-[#F26722] dark:hover:text-[#F26722] transition-colors flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> Sistema de Garantías
                </a>
              </li>
              <li>
                <a href="/docs" className="text-gray-600 dark:text-zinc-400 hover:text-[#F26722] dark:hover:text-[#F26722] transition-colors flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" /> Documentación (SAFT)
                </a>
              </li>
            </ul>
          </div>

          {/* Columna 4: Comunidad y Redes */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500 mb-4">
              Comunidad
            </h4>
            <p className="text-xs text-gray-500 dark:text-zinc-400 mb-3.5 leading-relaxed">
              Sumate al desarrollo del proyecto y enterate de las simulaciones de gobernanza.
            </p>
            <div className="flex items-center gap-3">
              <a 
                href="https://twitter.com" 
                target="_blank" 
                rel="noreferrer" 
                className="p-2 bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/60 rounded-xl text-gray-600 dark:text-zinc-400 hover:text-white hover:bg-[#F26722] dark:hover:bg-[#F26722] hover:border-[#F26722] transition-all"
                aria-label="Twitter X"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a 
                href="https://github.com" 
                target="_blank" 
                rel="noreferrer" 
                className="p-2 bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800/60 rounded-xl text-gray-600 dark:text-zinc-400 hover:text-white hover:bg-[#F26722] dark:hover:bg-[#F26722] hover:border-[#F26722] transition-all"
                aria-label="GitHub"
              >
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>

        </div>

        {/* Separador */}
        <div className="h-px w-full bg-gray-100 dark:bg-zinc-800/40 my-6" />

        {/* Barra de Derechos / Legal de Cierre */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500 dark:text-zinc-500">
          <div>
            © {currentYear} <strong>Nero Marketplace</strong>. Desarrollado exclusivamente para la fase de MVP y validación experimental.
          </div>
          <div className="flex items-center gap-4">
            <a href="/legal/terminos" className="hover:text-gray-800 dark:hover:text-zinc-300 transition-colors">Términos</a>
            <a href="/legal/privacidad" className="hover:text-gray-800 dark:hover:text-zinc-300 transition-colors">Privacidad</a>
            <span className="text-gray-300 dark:text-zinc-800">|</span>
            <span className="font-mono text-[10px] uppercase">v0.2.0-beta</span>
          </div>
        </div>

      </div>
    </footer>
  );
}