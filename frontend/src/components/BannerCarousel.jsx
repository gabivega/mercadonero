import React, { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

// Estructura de objetos para Desktop
const desktopBanners = [
  {
    image: '/assets/img/banner-desktop/cash.jpg',
    title: "Vendé y cobrá por adelantado",
    subtitle: "Mercado Nero es el único Marketplace del mundo donde podés cobrar por adelantado mientras protegemos a compradores y vendedores, gracias al poder de los contratos inteligentes.",
    button: "Empezar a vender",
    url: "/vender",
    overlay: "bg-black/40" // Capa oscura intermedia
  },
  {
    image: '/assets/img/banner-desktop/seller.jpg',
    title: "Comisiones mas bajas del Mercado",
    subtitle: "Comision fija FINAL del 3%, sin sorpresas. Aumentá tu rentabilidad vendiendo en Mercado Nero",
    button: "Empezar a vender",
    url: "/vender",
    overlay: "bg-black/50" // Un poco más oscuro si la imagen brilla mucho
  },
  {
    image: '/assets/img/banner-desktop/package-delivery.jpg',
    title: "Envíos en el día",
    subtitle: "Envios flexibles y rápidos, al mejor precio. Llegamos a todo el país",
    button: "",
    overlay: "bg-gradient-to-r from-black/70 to-transparent" // Degradado estético de izquierda a derecha
  },
  {
    image: '/assets/img/banner-desktop/cellphone.jpg',
    title: "Mejores Precios en celulares",
    subtitle: "Encontrá los mejores precios del país en telefonía. Compra protegida y envíos a todo el pais.",
    button: "Ver Ofertas",
    url: "/ofertas",
    overlay: "bg-black/60" // Sin capa extra
  },
    {
    image: '/assets/img/banner-desktop/supermarket.jpg',
    title: "Al Super, sin salir de casa",
    subtitle: "Miles de productos de supermercado disponibles con envío en el día. Comprá desde la comodidad de tu casa ahorrando tiempo y dinero.",
    button: "Ver Productos",
    overlay: "bg-black/60", // Sin capa extra
    url: "/c/supermercado",
  },
]

// Estructura de objetos para Mobile (Mismos textos, adaptados a su imagen vertical/cuadrada)
const mobileBanners = [
 {
    image: '/assets/img/banner-desktop/cash.jpg',
    title: "Vendé y cobrá por adelantado",
    subtitle: "Mercado Nero es el único Marketplace del mundo donde podés cobrar por adelantado mientras protegemos a compradores y vendedores, gracias al poder de los contratos inteligentes.",
    button: "Empezar a vender",
    url: "/vender",
    overlay: "bg-black/40" // Capa oscura intermedia
  },
  {
    image: '/assets/img/banner-desktop/seller.jpg',
    title: "Comisiones mas bajas del Mercado",
    subtitle: "Comision fija FINAL del 3%, sin sorpresas. Aumentá tu rentabilidad vendiendo en Mercado Nero. Como comprador vas a encontrar los mejores precios del mercado.",
    button: "Empezar a vender",
    overlay: "bg-black/50" // Un poco más oscuro si la imagen brilla mucho
  },
  {
    image: '/assets/img/banner-desktop/package-delivery.jpg',
    title: "Envíos en el día",
    subtitle: "Envios flexibles y rápidos, al mejor precio. Llegamos a todo el país",
    button: "",
    overlay: "bg-gradient-to-r from-black/70 to-transparent" // Degradado estético de izquierda a derecha
  },
  {
    image: '/assets/img/banner-desktop/cellphone.jpg',
    title: "Mejores Precios en celulares",
    subtitle: "Encontrá los mejores precios del país en telefonía. Compra protegida y envíos a todo el pais.",
    button: "Ver Ofertas",
    overlay: "bg-black/60" // Sin capa extra
  },
  {
    image: '/assets/img/banner-desktop/supermarket.jpg',
    title: "Al Super, sin salir de casa",
    subtitle: "Miles de productos de supermercado disponibles con envío en el día. Comprá desde la comodidad de tu casa ahorrando tiempo y dinero.",
    button: "Ver Productos",
    overlay: "bg-black/60", // Sin capa extra
    url: "/c/supermercado",
  },
]

export default function BannerCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => {
        const banners = isMobile ? mobileBanners : desktopBanners
        return (prevIndex + 1) % banners.length
      })
    }, 6000) // Lo subí a 6 segundos para dar tiempo a leer el texto

    return () => clearInterval(interval)
  }, [isMobile])

  const banners = isMobile ? mobileBanners : desktopBanners
  const currentBanner = banners[currentIndex]

  const goToPrevious = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + banners.length) % banners.length)
  }

  const goToNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % banners.length)
  }

  const goToSlide = (index) => {
    setCurrentIndex(index)
  }

  return (
    <div className="relative w-full overflow-hidden rounded-[2rem] border border-zinc-200 dark:border-zinc-800 shadow-lg group">
      {/* CONTENEDOR PRINCIPAL */}
      <div className="relative h-64 md:h-[400px] w-full transition-all duration-500 ease-in-out">
        
        {/* IMAGEN DE FONDO */}
        <img
          src={currentBanner.image}
          alt={currentBanner.title || "Banner Nero"}
          className="w-full h-full object-cover absolute inset-0 select-none object-[center_20%] "
        />
        
        {/* CAPA DE OVERLAY DINÁMICA */}
        {currentBanner.overlay && currentBanner.overlay !== 'none' && (
          <div className={`absolute inset-0 transition-all duration-500 ${currentBanner.overlay}`} />
        )}

        {/* CONTENIDO TEXTUAL (CENTRADO A LA IZQUIERDA CON ESTRETEGIA DE LECTURA) */}
        <div className="absolute inset-0 flex flex-col justify-center px-8 md:px-16 max-w-xl md:max-w-2xl z-10 text-white space-y-2 md:space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
          {currentBanner.title && (
            <h2 className="text-2xl md:text-5xl font-black italic uppercase tracking-tighter drop-shadow-md">
              {currentBanner.title}
            </h2>
          )}
          
          {currentBanner.subtitle && (
            <p className="text-xs md:text-sm font-medium opacity-90 leading-relaxed drop-shadow">
              {currentBanner.subtitle}
            </p>
          )}

          {currentBanner.button && (
            <div className="pt-2">
              <button className="bg-[#F26722] hover:bg-[#d5561a] text-white px-5 md:px-7 py-2 md:py-3 rounded-xl font-black italic uppercase text-xs md:text-sm tracking-wide shadow-lg hover:scale-[1.03] transition-all duration-200 active:scale-95"
              onClick={() => navigate(currentBanner.url)}>
                {currentBanner.button}
              </button>
            </div>
          )}
        </div>
        
        {/* CONTROLES DE NAVEGACIÓN (Aparecen fluidos con hover sobre el componente) */}
        <button
          onClick={goToPrevious}
          className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/40 hover:bg-[#F26722] text-white p-2.5 rounded-full transition-all z-20 opacity-0 group-hover:opacity-100 backdrop-blur-xs"
          aria-label="Anterior"
        >
          <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
        </button>
        
        <button
          onClick={goToNext}
          className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/40 hover:bg-[#F26722] text-white p-2.5 rounded-full transition-all z-20 opacity-0 group-hover:opacity-100 backdrop-blur-xs"
          aria-label="Siguiente"
        >
          <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </div>

      {/* INDICADORES (PUNTITOS INFERIORES) */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2 z-20 bg-black/20 px-3 py-1.5 rounded-full backdrop-blur-xs">
        {banners.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full transition-all duration-300 ${
              index === currentIndex
                ? 'bg-[#F26722] w-5 md:w-6' // Se estira el puntito activo estilo moderno
                : 'bg-white/60 hover:bg-white'
            }`}
            aria-label={`Ir al banner ${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}