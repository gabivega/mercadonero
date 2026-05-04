import React, { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const desktopBanners = [
  '/src/assets/img/banner-desktop/D_NQ_613264-MLA105897706743_012026-OO.webp',
  '/src/assets/img/banner-desktop/D_NQ_697706-MLA107603493611_022026-OO.webp',
  '/src/assets/img/banner-desktop/D_NQ_841442-MLA107603905375_022026-OO.webp',
  '/src/assets/img/banner-desktop/D_NQ_910600-MLA107452239907_022026-OO.webp'
]

const mobileBanners = [
  '/src/assets/img/banner-mobile/D_NQ_600438-MLA106780989562_022026-F.webp',
  '/src/assets/img/banner-mobile/D_NQ_693973-MLA105897885041_012026-F.webp',
  '/src/assets/img/banner-mobile/D_NQ_956371-MLA106921213930_022026-F.webp',
  '/src/assets/img/banner-mobile/D_NQ_966194-MLA106921390268_022026-F.webp'
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
    }, 5000)

    return () => clearInterval(interval)
  }, [isMobile])

  const banners = isMobile ? mobileBanners : desktopBanners

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
    <div className="relative w-full overflow-hidden rounded-lg">
      <div className="relative h-48 md:h-96">
        <img
          src={banners[currentIndex]}
          alt={`Banner ${currentIndex + 1}`}
          className="w-full h-full object-cover"
        />
        
        {/* Controles de navegación */}
        <button
          onClick={goToPrevious}
          className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors z-10"
          aria-label="Anterior"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        
        <button
          onClick={goToNext}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors z-10"
          aria-label="Siguiente"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Indicadores */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2 z-10">
        {banners.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-3 h-3 rounded-full transition-colors ${
              index === currentIndex
                ? 'bg-white'
                : 'bg-white/50 hover:bg-white/75'
            }`}
            aria-label={`Ir al banner ${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
