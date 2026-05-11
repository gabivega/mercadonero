import React, { useEffect, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/navigation'
import ProductCard from './ProductCard'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import axios from 'axios'
import { useUserStore } from '../store/useUserStore'

export default function ProductCarousel({ title, category, subCategory, sectionId = 'carousel' }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { dbUser } = useUserStore()
  
  useEffect(() => {
const fetchProducts = async () => {
  try {
    setLoading(true);
    
    // Volvemos a la llamada simple (sin tokens ni headers por ahora)
    const response = await axios.get(`${import.meta.env.VITE_SERVER_URL}/api/product/products`, {
      params: {
        category,
        subCategory,
        limit: 20 // Pedimos un poco más porque vamos a filtrar algunos
      }
    });

    // --- EL FILTRO MÁGICO EN EL FRONT ---
    const allProducts = response.data.products;
    
    // Si hay usuario logueado, filtramos sus productos. Si no, mostramos todo.
    const filtered = dbUser?._id 
      ? allProducts.filter(p => p.seller !== dbUser._id)
      : allProducts;

    setProducts(filtered.slice(0, 12)); // Nos quedamos con los 12 finales

  } catch (error) {
    console.error("Error:", error);
  } finally {
    setLoading(false);
  }
};
   fetchProducts();
  }, [category, subCategory]); // Se dispara si cambia cualquiera de los dos

  if (!loading && products.length === 0) return null;

  return (
    <section className="mb-12 px-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col">
           <h2 className="text-2xl font-black italic uppercase tracking-tighter text-gray-900 dark:text-white leading-none">
            {title}
          </h2>
          <div className="h-1 w-12 bg-[#F26722] mt-1" />
        </div>
        <a href={`/search?category=${category}`} className="text-[#F26722] text-xs font-black uppercase tracking-widest hover:opacity-80 transition-opacity">
          Explorar todo →
        </a>
      </div>

      <div className="relative group">
        {loading ? (
          // Skeleton simple mientras carga
          <div className="flex gap-5 overflow-hidden">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="min-w-[160px] h-64 bg-gray-100 dark:bg-zinc-800 animate-pulse rounded-[32px]" />
            ))}
          </div>
        ) : (
          <>
          <div className="relative w-full overflow-x-clip px-4 -mx-4">
            <Swiper
              modules={[Navigation]}
              navigation={{
                prevEl: `.swiper-button-prev-${sectionId}`,
                nextEl: `.swiper-button-next-${sectionId}`,
              }}
              slidesPerView="auto"
              spaceBetween={20}
              className="w-full !overflow-visible"
            >
              {products.map((product) => (
                <SwiperSlide key={product._id} style={{ width: '180px' }}>
                  <ProductCard product={product} />
                </SwiperSlide>
              ))}
            </Swiper>
            </div>

            {/* Navigation Buttons */}
            <button
              className={`swiper-button-prev-${sectionId} absolute left-0 top-1/2 -translate-y-1/2 -translate-x-6 z-20 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-full p-3 shadow-xl hover:scale-110 transition-all hidden group-hover:flex items-center justify-center`}
            >
              <ChevronLeft className="w-6 h-6 text-gray-900 dark:text-white" />
            </button>
            <button
              className={`swiper-button-next-${sectionId} absolute right-0 top-1/2 -translate-y-1/2 translate-x-6 z-20 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-full p-3 shadow-xl hover:scale-110 transition-all hidden group-hover:flex items-center justify-center`}
            >
              <ChevronRight className="w-6 h-6 text-gray-900 dark:text-white" />
            </button>
          </>
        )}
      </div>
    </section>
  )
}