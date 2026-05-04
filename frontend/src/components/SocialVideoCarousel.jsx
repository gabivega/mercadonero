import React from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/navigation'
import SocialVideoCard from './SocialVideoCard'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function SocialVideoCarousel({ title = 'Comunidad', videos = [] }) {
  // Default videos using Mux URLs
  const defaultVideos = [
    
    "002fpRf3rNRKhfn9jmsngnzM7v22D6VT8Z1Kd5AnAySY",
    "q02tyOIA015DMEdgm6As2HdHJ9AH8u2mf2QbjxoyZy4LI",
    "kFFDCs01vHRidZxfEW1K8qnDdJgUaE9g9WDSBm00Umo02U",
    "e0202leJUBU9004vfwcJvapEWadBJKnc1JXiIzcsp1xt4Q",
    "u00MQ3kR8Mxo9C4mxQe8QrK6Qx4z018CscWtirRCU6Qvg",
    "XPMP601f9BfOaNF3WWTvHH1liCTlnCCYHAF87zjAwAH4",
    "5r001ZZgG02Ask5ENqwx8EW8RyUaQO5QZ1dKMtTc0100KK8",
    "NSAA7kW3Q01sl7PEXED9j8CeMupUoSSV01BsMf9Rfb5kw",
    "TO004hIQLClYKFBrKO7VXIvMhW6ny8rlfzLxTSIHhbyQ"

  ]

  const videoList = videos.length > 0 ? videos : defaultVideos
  const sectionId = 'social-videos'

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {title}
        </h2>
        <a href={`#${sectionId}`} className="text-[#F26722] text-sm font-medium hover:underline">
          Ver todo →
        </a>
      </div>

      {/* Carousel Container */}
      <div className="relative group">
        <Swiper
          modules={[Navigation]}
          navigation={{
            prevEl: `.swiper-button-prev-${sectionId}`,
            nextEl: `.swiper-button-next-${sectionId}`,
          }}
          slidesPerView="auto"
          spaceBetween={20}
          className="w-full"
        >
          {videoList.map((playbackId) => (
            <SwiperSlide key={playbackId} style={{ width: '180px' }}>
              <SocialVideoCard playbackId={playbackId} />
            </SwiperSlide>
          ))}
        </Swiper>

        {/* Navigation Buttons */}
        <button
          className={`swiper-button-prev-${sectionId} absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 bg-white dark:bg-zinc-800 rounded-full p-2 shadow-md hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors hidden group-hover:flex items-center justify-center`}
          aria-label="Previous videos"
        >
          <ChevronLeft className="w-5 h-5 text-gray-900 dark:text-white" />
        </button>
        <button
          className={`swiper-button-next-${sectionId} absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 bg-white dark:bg-zinc-800 rounded-full p-2 shadow-md hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors hidden group-hover:flex items-center justify-center`}
          aria-label="Next videos"
        >
          <ChevronRight className="w-5 h-5 text-gray-900 dark:text-white" />
        </button>
      </div>
    </section>
  )
}
