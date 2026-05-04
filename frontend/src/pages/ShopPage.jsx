import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
const ShopPage = () => {
  const { username } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchShopData = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/shop/${username}`);
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Error cargando tienda:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShopData();
  }, [username]);
  
  const SkeletonShop = () => (
  <div className="max-w-7xl mx-auto px-4 animate-pulse">
    {/* Banner Skeleton */}
    <div className="h-48 bg-gray-200 dark:bg-zinc-800 rounded-b-[40px] mb-10" />
    
    <div className="flex items-end gap-6 mb-10 -mt-20 px-10">
      {/* Logo Skeleton */}
      <div className="w-32 h-32 bg-gray-300 dark:bg-zinc-700 rounded-3xl border-4 border-white dark:border-zinc-900" />
      <div className="space-y-3 pb-4">
        <div className="h-8 w-48 bg-gray-300 dark:bg-zinc-700 rounded-lg" />
        <div className="h-4 w-24 bg-gray-200 dark:bg-zinc-800 rounded-lg" />
      </div>
    </div>

    {/* Stats Skeleton */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10 p-6">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-20 bg-gray-200 dark:bg-zinc-800 rounded-3xl" />
      ))}
    </div>

    {/* Grid Skeleton */}
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
      {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
        <div key={i} className="aspect-[3/4] bg-gray-200 dark:bg-zinc-800 rounded-[32px]" />
      ))}
    </div>
  </div>
);
  if (loading) return <SkeletonShop />;
  
  if (!data || !data.vendor) return <div className="py-20 text-center font-black italic uppercase min-h-[60vh]">Tienda no encontrada</div>;

  const { shop } = data.vendor;

const StatCard = ({ label, value, icon }) => (
  <div className="flex flex-col items-center justify-center p-4 bg-white dark:bg-[#252525] rounded-[24px] border border-gray-100 dark:border-gray-800 shadow-sm">
    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">
      {label}
    </span>
    <span className="text-xl font-black italic dark:text-white uppercase tracking-tighter">
      {value}
    </span>
  </div>
);
  return (
    <div className="min-h-screen pb-20 dark:bg-[#0D0D0D]">
      {/* HEADER / BANNER */}
      <header className="relative mb-16">
        <div className="h-56 w-full overflow-hidden rounded-b-[50px] bg-zinc-100 dark:bg-zinc-900">
          {shop.banner ? (
            <img src={shop.banner} alt="Banner" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-blue-600 to-indigo-900 opacity-80" />
          )}
        </div>

        {/* INFO FLOTANTE */}
        <div className="absolute -bottom-12 left-0 right-0 max-w-7xl mx-auto px-10 flex flex-col md:flex-row items-center md:items-end gap-6 text-center md:text-left">
          <div className="relative">
            <img 
              src={shop.logo || `https://ui-avatars.com/api/?name=${shop.name}&background=random`} 
              alt={shop.name} 
              className="w-36 h-36 rounded-[40px] border-8 border-white dark:border-[#0D0D0D] shadow-2xl object-cover bg-white"
            />
            {shop.rating >= 4.5 && (
              <span className="absolute -top-2 -right-2 bg-yellow-400 text-black text-[10px] font-black px-3 py-1 rounded-full shadow-lg uppercase tracking-tighter">
                Elite
              </span>
            )}
          </div>
          <div className="pb-4 flex-1">
            <h1 className="text-4xl font-black italic uppercase tracking-tighter text-gray-900 dark:text-white leading-none mb-1">
              {shop.name || 'Sin Nombre'}
            </h1>
            <p className="text-blue-500 font-black text-sm uppercase tracking-widest">
              @{data.vendor.username}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-20">
        {/* DESCRIPCIÓN Y STATS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mb-16">
          <div className="lg:col-span-1 space-y-4">
            <h3 className="text-xs font-black uppercase text-gray-400 tracking-[0.2em]">Sobre nosotros</h3>
            <p className="text-gray-600 dark:text-gray-400 font-medium leading-relaxed">
              {shop.description || "Este vendedor aún no ha añadido una descripción a su tienda."}
            </p>
          </div>

          <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Ventas" value={shop.totalSales || 0} />
            <StatCard label="Rating" value={shop.rating ? `${shop.rating} ★` : 'N/A'} />
            <StatCard label="Ubicación" value={shop.location?.city || 'Arg'} />
            <StatCard label="Productos" value={data.totalProducts || 0} />
          </div>
        </div>

        {/* LISTADO DE PRODUCTOS */}
        <div className="space-y-8">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-black italic uppercase tracking-tighter dark:text-white">Productos destacados</h2>
            <div className="h-[2px] flex-1 bg-gray-100 dark:bg-zinc-800" />
          </div>

          {data.products.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {data.products.map(p => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>
          ) : (
            <div className="py-20 text-center bg-gray-50 dark:bg-zinc-900/50 rounded-[40px] border-2 border-dashed border-gray-200 dark:border-zinc-800">
              <p className="text-gray-400 font-bold italic">No hay productos activos en este momento.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ShopPage;