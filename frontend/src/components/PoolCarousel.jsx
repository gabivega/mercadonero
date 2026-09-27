import React from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import PoolCard from "./PoolCard";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PoolCarousel({
  title = "Compras Grupales",
  pools = [],
  sectionId = "pools",
}) {
  const navigate = useNavigate();

  if (!pools || pools.length === 0) return null;

  return (
    <section className="mb-12 px-0">
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col">
          <h2 className="text-2xl font-black italic uppercase tracking-tighter text-gray-900 dark:text-white leading-none">
            {title}
          </h2>
          <div className="h-1 w-12 bg-[#3483fa] mt-1" />
        </div>
        <button
          onClick={() => navigate("/compras-grupales")}
          className="text-[#3483fa] text-xs font-black uppercase tracking-widest hover:opacity-80 transition-opacity bg-transparent border-none p-0 cursor-pointer inline-flex items-center"
        >
          Ver todos →
        </button>
      </div>

      <div className="relative group">
        <div className="relative w-full overflow-x-clip px-0 -mx-0">
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
            {pools.map((pool) => (
              <SwiperSlide key={pool.id || pool._id} style={{ width: "280px" }}>
                <PoolCard pool={pool} />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        {/* Navigation Buttons */}
        <button
          className={`swiper-button-prev-${sectionId} absolute left-0 top-1/2 -translate-y-1/2 -translate-x-6 z-20 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-full p-3 shadow-xl hover:scale-110 transition-all hidden group-hover:flex items-center justify-center`}
          aria-label="Anterior"
        >
          <ChevronLeft className="w-6 h-6 text-gray-900 dark:text-white" />
        </button>
        <button
          className={`swiper-button-next-${sectionId} absolute right-0 top-1/2 -translate-y-1/2 translate-x-6 z-20 bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-full p-3 shadow-xl hover:scale-110 transition-all hidden group-hover:flex items-center justify-center`}
          aria-label="Siguiente"
        >
          <ChevronRight className="w-6 h-6 text-gray-900 dark:text-white" />
        </button>
      </div>
    </section>
  );
}
