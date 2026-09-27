import { X, ChevronRight, ArrowRight, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { formatMoney } from '../Utils/currencyFormatter';
import { useState } from 'react';

export default function FilterSidebar({ filters, onFilterChange, totalResults, categoryName, availableBrands = [], availableSubCategories = [] }) {
  
  // 📱 Estado para controlar si está expandido en Mobile (por defecto colapsado)
  const [isOpenMobile, setIsOpenMobile] = useState(false);

  const [tempPrice, setTempPrice] = useState({
    min: filters.minPrice || '',
    max: filters.maxPrice || ''
  });

  const handlePriceRange = (min, max) => {
    onFilterChange({ ...filters, minPrice: min, maxPrice: max });
  };

  const applyManualPrice = () => {
    if (tempPrice.min || tempPrice.max) {
      onFilterChange({ 
        ...filters, 
        minPrice: tempPrice.min, 
        maxPrice: tempPrice.max 
      });
    }
  };

  const isButtonActive = tempPrice.min !== '' || tempPrice.max !== '';

  const clearAllFilters = () => {
    onFilterChange({
      minPrice: '',
      maxPrice: '',
      sort: filters.sort,
      brand: '',
      condition: '',
      freeShipping: false,
      subCategory: ''
    });
  };

  const hasActiveFilters = filters.minPrice || filters.maxPrice || filters.brand || filters.condition || filters.freeShipping || filters.subCategory;

  return (
    <aside className="w-full md:w-72 flex-shrink-0 self-start bg-white dark:bg-[#1A1A1A] md:bg-transparent md:dark:bg-transparent p-4 md:p-0 rounded-2xl border border-zinc-100 dark:border-zinc-800 md:border-none shadow-sm md:shadow-none space-y-3 pb-4 md:pb-10 transition-all">
      
      {/* 🛠️ CABECERA: Visible siempre, funciona como botón toggle en Mobile */}
      <div 
        onClick={() => setIsOpenMobile(!isOpenMobile)}
        className="flex items-center justify-between cursor-pointer md:cursor-default md:pointer-events-none select-none"
      >
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-[#F26722] md:hidden" />
            <h2 className="text-sm font-black uppercase tracking-tighter dark:text-white">Filtros</h2>
          </div>
          <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">{totalResults} resultados</p>
        </div>

        {/* Controladores visuales a la derecha (Mobile únicamente) */}
        <div className="flex items-center gap-2 md:hidden">
          {hasActiveFilters && !isOpenMobile && (
            <span className="w-2 h-2 bg-[#F26722] rounded-full animate-pulse" />
          )}
          <button className="p-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl text-zinc-500 transition-transform duration-200">
            <ChevronDown 
              size={16} 
              className={`transform transition-transform ${isOpenMobile ? 'rotate-180 text-[#F26722]' : ''}`} 
            />
          </button>
        </div>
      </div>

      {/* 🏷️ PÍLDORAS DE FILTROS ACTIVOS (Visibles siempre en mobile para dar feedback rápido) */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-zinc-50 dark:border-zinc-800/50 md:border-none md:pt-0">
          {filters.brand && (
            <Badge label={filters.brand} onRemove={() => onFilterChange({...filters, brand: ''})} />
          )}
          {filters.subCategory && (
            <Badge label={filters.subCategory.replace(/-/g, ' ')} onRemove={() => onFilterChange({...filters, subCategory: ''})} />
          )}
          {filters.condition && (
            <Badge label={filters.condition === 'new' ? 'Nuevo' : 'Usado'} onRemove={() => onFilterChange({...filters, condition: ''})} />
          )}
          {(filters.minPrice || filters.maxPrice) && (
            <Badge 
              label={`$${filters.minPrice || 0} - ${filters.maxPrice ? '$' + filters.maxPrice : '∞'}`} 
              onRemove={() => onFilterChange({...filters, minPrice: '', maxPrice: ''})} 
            />
          )}
          {filters.freeShipping && (
            <Badge label="Envío Gratis" onRemove={() => onFilterChange({...filters, freeShipping: false})} />
          )}
          
          {/* Botón rápido de limpiar filtros en mobile */}
          <button 
            onClick={(e) => {
              e.stopPropagation(); // Evita que abra/cierre el acordeón al clickear
              clearAllFilters();
            }}
            className="text-[10px] font-bold text-red-500 uppercase hover:underline flex items-center gap-1 pl-1 ml-auto md:hidden"
          >
            Limpiar <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 📦 CONTENEDOR DESPLEGABLE: Oculto en Mobile por defecto, Siempre libre en Escritorio */}
      <div className={`${isOpenMobile ? 'block' : 'hidden'} md:block space-y-5 pt-3 border-t border-zinc-100 dark:border-zinc-800 md:border-none md:pt-0`}>
        
        {/* Botón limpiar filtros (Versión Desktop tradicional) */}
        {hasActiveFilters && (
          <div className="hidden md:flex justify-end">
            <button 
              onClick={clearAllFilters}
              className="text-[10px] font-bold text-red-500 uppercase hover:underline flex items-center gap-1"
            >
              Limpiar Todo <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Envío Gratis Toggle */}
        <div className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800 md:border-y">
          <span className="text-xs font-black uppercase dark:text-zinc-300">Envío gratis</span>
          <button 
            onClick={() => onFilterChange({...filters, freeShipping: !filters.freeShipping})}
            className={`w-10 h-5 rounded-full transition-all duration-300 ${filters.freeShipping ? 'bg-[#F26722]' : 'bg-zinc-300 dark:bg-zinc-700'}`}
          >
            <div className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-transform duration-300 transform ${filters.freeShipping ? 'translate-x-5' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Condición */}
        <section>
          <h3 className="text-xs font-black uppercase mb-2 dark:text-white tracking-widest">Condición</h3>
          <div className="flex flex-col gap-1">
            {['new', 'used'].map((cond) => (
              <button 
                key={cond}
                onClick={() => onFilterChange({...filters, condition: cond})}
                className={`text-xs text-left px-3 py-1.5 rounded-xl transition-all ${
                  filters.condition === cond 
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-black font-bold shadow-sm' 
                    : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {cond === 'new' ? 'Nuevo' : 'Usado'}
              </button>
            ))}
          </div>
        </section>

        {/* Precio */}
        <section>
          <h3 className="text-xs font-black uppercase mb-3 dark:text-white tracking-widest">Precio</h3>
          
          {/* Rangos Sugeridos */}
          <ul className="space-y-2 mb-4">
            {[
              { label: `Hasta ${formatMoney(65000)}`, min: 0, max: 65000 },
              { label: `${formatMoney(65000)} a ${formatMoney(150000)}`, min: 65000, max: 150000 },
              { label: `Más de ${formatMoney(150000)}`, min: 150000, max: '' }
            ].map((range, idx) => (
              <li key={idx}>
                <button 
                  onClick={() => handlePriceRange(range.min, range.max)}
                  className="group flex items-center justify-between w-full text-[11px] text-zinc-500 hover:text-black dark:hover:text-white transition-colors py-1 px-1 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
                >
                  {range.label}
                  <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-[#F26722]" />
                </button>
              </li>
            ))}
          </ul>
          
          {/* Inputs Manuales con Botón de Acción */}
          <div className="flex gap-2 items-center">
            <div className="flex gap-1 items-center flex-grow">
              <div className="relative w-full">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-zinc-400">$</span>
                <input 
                  type="number" 
                  placeholder="Mín" 
                  className="w-full pl-4 pr-1 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-[11px] outline-none focus:border-[#F26722] transition-colors dark:text-white"
                  value={tempPrice.min}
                  onChange={(e) => setTempPrice({ ...tempPrice, min: e.target.value })}
                />
              </div>
              <div className="relative w-full">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-zinc-400">$</span>
                <input 
                  type="number" 
                  placeholder="Máx" 
                  className="w-full pl-4 pr-1 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-[11px] outline-none focus:border-[#F26722] transition-colors dark:text-white"
                  value={tempPrice.max}
                  onChange={(e) => setTempPrice({ ...tempPrice, max: e.target.value })}
                />
              </div>
            </div>

            <button
              onClick={applyManualPrice}
              disabled={!isButtonActive}
              className={`p-2 rounded-lg border transition-all ${
                isButtonActive 
                  ? 'bg-[#F26722] border-[#F26722] text-white shadow-lg shadow-[#F26722]/20 hover:scale-105' 
                  : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-400 cursor-not-allowed opacity-50'
              }`}
            >
              <ArrowRight size={14} strokeWidth={3} />
            </button>
          </div>
        </section>

        {/* Marcas */}
        {availableBrands.length > 0 && (
          <section>
            <h3 className="text-xs font-black uppercase mb-3 dark:text-white tracking-widest">Marcas</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-2 custom-scrollbar flex flex-col">
              {availableBrands.map((brand) => (
                <button 
                  key={brand}
                  onClick={() => onFilterChange({ ...filters, brand: brand === filters.brand ? '' : brand })}
                  className={`w-full text-left px-3 py-1.5 rounded-xl text-xs transition-all ${
                    filters.brand === brand 
                      ? 'bg-[#F26722] text-white font-bold shadow-sm' 
                      : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {brand}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Subcategorías */}
        {availableSubCategories.length > 0 && (
          <section>
            <h3 className="text-xs font-black uppercase mb-3 dark:text-white tracking-widest">Subcategorías</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-2 custom-scrollbar flex flex-col">
              {availableSubCategories.map((subCategory) => (
                <button 
                  key={subCategory}
                  onClick={() => onFilterChange({ ...filters, subCategory: subCategory === filters.subCategory ? '' : subCategory })}
                  className={`w-full text-left px-3 py-1.5 rounded-xl text-xs transition-all capitalize ${
                    filters.subCategory === subCategory 
                      ? 'bg-[#F26722] text-white font-bold shadow-sm' 
                      : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {subCategory.replace(/-/g, ' ')}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}

// Sub-componente para las pildoras de filtros activos
function Badge({ label, onRemove }) {
  return (
    <span className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 text-[10px] font-black uppercase rounded-full border border-zinc-200 dark:border-zinc-700 dark:text-zinc-300 shadow-sm">
      {label}
      <button 
        onClick={(e) => {
          e.stopPropagation(); // Evita accionar el contenedor desplegable al remover
          onRemove();
        }} 
        className="hover:text-red-500 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}