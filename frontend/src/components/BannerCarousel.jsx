import React, { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Estructura de objetos para Desktop
const desktopBanners = [
  {
    image: '/src/assets/img/banner-desktop/D_NQ_613264-MLA105897706743_012026-OO.webp',
    title: "Mercado Nero v3",
    subtitle: "El marketplace Web3 definitivo. Transacciones blindadas con Smart Contracts.",
    button: "Explorar Protocolo",
    overlay: "bg-black/40" // Capa oscura intermedia
  },
  {
    image: '/src/assets/img/banner-desktop/D_NQ_697706-MLA107603493611_022026-OO.webp',
    title: "Garantía Colateralizada",
    subtitle: "Comprá con fiat, respaldado por la blockchain. Sin intermediarios abusivos.",
    button: "Ver Categorías",
    overlay: "bg-black/50" // Un poco más oscuro si la imagen brilla mucho
  },
  {
    image: '/src/assets/img/banner-desktop/D_NQ_841442-MLA107603905375_022026-OO.webp',
    title: "Liquidación en USDT",
    subtitle: "Tu dinero a salvo de la inflación. Conversión automática al vuelo.",
    button: "Empezar a Vender",
    overlay: "bg-gradient-to-r from-black/70 to-transparent" // Degradado estético de izquierda a derecha
  },
  {
    image: '/src/assets/img/banner-desktop/D_NQ_910600-MLA107452239907_022026-OO.webp',
    title: "Catálogo Sincronizado",
    subtitle: "Miles de productos disponibles con stock real verificado.",
    button: "Ver Ofertas",
    overlay: "none" // Sin capa extra
  }
]

// Estructura de objetos para Mobile (Mismos textos, adaptados a su imagen vertical/cuadrada)
const mobileBanners = [
  {
    image: '/src/assets/img/banner-mobile/D_NQ_600438-MLA106780989562_022026-F.webp',
    title: "Mercado Nero v3",
    subtitle: "Marketplace Web3 blindado.",
    button: "Explorar",
    overlay: "bg-black/50"
  },
  {
    image: '/src/assets/img/banner-mobile/D_NQ_693973-MLA105897885041_012026-F.webp',
    title: "Garantía P2P",
    subtitle: "Respaldado por la blockchain.",
    button: "Comprar",
    overlay: "bg-black/50"
  },
  {
    image: '/src/assets/img/banner-mobile/D_NQ_956371-MLA106921213930_022026-F.webp',
    title: "Fondeo Seguro",
    subtitle: "Liquidación directa en USDT.",
    button: "Vender",
    overlay: "bg-black/60"
  },
  {
    image: '/src/assets/img/banner-mobile/D_NQ_966194-MLA106921390268_022026-F.webp',
    title: "Comunidad Web3",
    subtitle: "Cero comisiones abusivas.",
    button: "Ver Más",
    overlay: "none"
  }
]

export default function BannerCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isMobile, setIsMobile] = useState(false)

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
          className="w-full h-full object-cover absolute inset-0 select-none"
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
              <button className="bg-[#F26722] hover:bg-[#d5561a] text-white px-5 md:px-7 py-2 md:py-3 rounded-xl font-black italic uppercase text-xs md:text-sm tracking-wide shadow-lg hover:scale-[1.03] transition-all duration-200 active:scale-95">
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