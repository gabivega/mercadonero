import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import ProductCard from '../components/ProductCard';
import FilterSidebar from '../components/FilterSidebar'; // Importamos tu componente unificado
import { SlidersHorizontal } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';

const SearchResults = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ 
    products: [], 
    filters: { categories: [], subCategories: [], brands: [] } 
  });
  
  // Estado de filtros sincronizado con la URL
  const [filters, setFilters] = useState({
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    sort: searchParams.get('sort') || 'newest',
    brand: searchParams.get('brand') || '',
    subCategory: searchParams.get('subCategory') || '',
  });

  const query = searchParams.get('q');

  useEffect(() => {
    const fetchResults = async () => {
      setLoading(true);
      
      // Capturamos todos los params actuales de la URL
      const params = Object.fromEntries(searchParams.entries());
      
      const backendParams = {
        ...params,
        search: params.q || '', 
      };

      try {
        const response = await axios.get(`${import.meta.env.VITE_SERVER_URL}/api/product/products`, { 
          params: backendParams 
        });
        setData(response.data);
      } catch (err) {
        console.error("Error en fetch:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchResults();
  }, [searchParams]);

  // Esta función se pasa al FilterSidebar para que actualice la URL
  const handleFilterChange = (newFilters) => {
    const newParams = new URLSearchParams(searchParams);
    
    // Actualizamos los params en la URL basados en el objeto que viene del Sidebar
    Object.keys(newFilters).forEach(key => {
      if (newFilters[key]) {
        newParams.set(key, newFilters[key]);
      } else {
        newParams.delete(key);
      }
    });

    setSearchParams(newParams);
    setFilters(newFilters); // Sincronizamos estado local
  };

  return (
    <div className="max-w-[1300px] mx-auto px-4 py-6 flex flex-col md:flex-row gap-8 bg-white dark:bg-[#121212] transition-colors min-h-screen">
      
      {/* SIDEBAR REUTILIZABLE */}
      <div className="w-full md:w-72 shrink-0">
        <FilterSidebar 
          filters={filters} 
          onFilterChange={handleFilterChange} 
          totalResults={data.products?.length || 0}
          // Pasamos los filtros que vienen del backend para que el sidebar sepa qué mostrar
          availableBrands={data.filters?.brands || []}
          availableSubCategories={data.filters?.subCategories || []}
          categoryName={query ? `Búsqueda: ${query}` : "Resultados"}
        />
      </div>

      {/* RESULTADOS */}
      <main className="flex-1">
        <div className="mb-6">
          <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter">
            {query ? `"${query}"` : 'Explorar productos'}
          </h1>
          <p className="text-gray-500 dark:text-zinc-500 text-sm font-medium">
            {data.products?.length || 0} artículos encontrados
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <LoadingSpinner size="lg" text="Buscando productos..." />
            <p className="mt-4 text-zinc-500 font-bold uppercase text-xs tracking-widest">Cargando Nero...</p>
          </div>
        ) : (
          <>
            {Array.isArray(data.products) && data.products.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 flex-1 w-full">
                {data.products.map((p) => (
                  <ProductCard key={p._id} product={p} />
                ))}
              </div>
            ) : (
              /* Pantalla de No Results */
              <div className="text-center py-20 bg-gray-50 dark:bg-zinc-900/30 rounded-[2rem] border-2 border-dashed border-gray-100 dark:border-zinc-800">
                <div className="mb-4 flex justify-center">
                  <SlidersHorizontal className="w-12 h-12 text-zinc-700" />
                </div>
                <h3 className="text-xl font-black dark:text-white uppercase">Sin resultados</h3>
                <p className="text-gray-500 dark:text-zinc-500 max-w-xs mx-auto mt-2 text-sm">
                  No hay coincidencias. Probá ajustando los filtros o cambiando la búsqueda.
                </p>
                <button 
                  onClick={() => setSearchParams(query ? { q: query } : {})} 
                  className="mt-6 px-6 py-2 bg-zinc-900 dark:bg-white dark:text-black text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:scale-105 transition-transform"
                >
                  Limpiar filtros
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default SearchResults;