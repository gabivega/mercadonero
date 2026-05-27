import React, { useEffect, useState } from 'react';
import axios from 'axios';
import ProductCard from '../components/ProductCard';
import FilterSidebar from '../components/FilterSidebar';
import { Tag, Flame } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';

const Offers = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ 
    products: [], 
    filters: { categories: [], subCategories: [], brands: [] } 
  });
  
  // Estado de filtros
  const [filters, setFilters] = useState({
    minPrice: '',
    maxPrice: '',
    sort: 'newest',
    brand: '',
    subCategory: '',
    condition: '',
    freeShipping: false,
  });

  useEffect(() => {
    const fetchOffers = async () => {
      setLoading(true);
      
      const backendParams = {
        ...filters,
        category: 'offers', // Param para filtrar solo ofertas
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
    
    fetchOffers();
  }, [filters]);

  // Esta función se pasa al FilterSidebar para que actualice los filtros
  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  return (
    <div className="max-w-[1300px] mx-auto px-4 py-6 flex flex-col md:flex-row gap-8 bg-white dark:bg-[#121212] transition-colors min-h-screen">
      
      {/* SIDEBAR DE FILTROS */}
      <div className="w-full md:w-72 shrink-0">
        <FilterSidebar 
          filters={filters} 
          onFilterChange={handleFilterChange} 
          totalResults={data.products?.length || 0}
          availableBrands={data.filters?.brands || []}
          availableSubCategories={data.filters?.subCategories || []}
          categoryName="Ofertas"
        />
      </div>

      {/* RESULTADOS DE OFERTAS */}
      <main className="flex-1">
        {/* Header de Ofertas */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-gradient-to-r from-[#F26722] to-[#ff8c42] p-3 rounded-2xl shadow-lg shadow-[#F26722]/30">
              <Flame size={24} className="text-white" />
            </div>
            <h1 className="text-3xl md:text-4xl font-black dark:text-white uppercase tracking-tighter">
              Ofertas
            </h1>
          </div>
          <p className="text-gray-500 dark:text-zinc-500 text-sm font-medium">
            {data.products?.length || 0} productos en oferta
          </p>
        </div>

        {/* Banner Promocional */}
        <div className="bg-gradient-to-r from-[#F26722] to-[#ff8c42] rounded-3xl p-6 md:p-8 mb-8 shadow-lg shadow-[#F26722]/20">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-white">
              <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter mb-2">
                ¡Super Ofertas!
              </h2>
              <p className="text-sm md:text-base font-medium opacity-90">
                Descuentos exclusivos en productos seleccionados
              </p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-2xl px-6 py-3">
              <span className="text-white font-black text-lg md:text-xl">
                HASTA 50% OFF
              </span>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <LoadingSpinner size="lg" text="Cargando ofertas..." />
          </div>
        ) : (
          <>
            {/* Grid de Productos */}
            {Array.isArray(data.products) && data.products.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {data.products.map((p) => (
                  <ProductCard key={p._id} product={p} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="bg-gray-100 dark:bg-zinc-800 rounded-full p-6 mb-4">
                  <Tag size={48} className="text-gray-400 dark:text-zinc-600" />
                </div>
                <h3 className="text-xl font-bold dark:text-white mb-2">
                  No hay ofertas disponibles
                </h3>
                <p className="text-gray-500 dark:text-zinc-500 text-sm font-medium">
                  Vuelve más tarde para ver nuevas promociones
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Offers;
