import React from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/navigation'
import SocialPostCard from './SocialPostCard'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function SocialPostCarousel({ title = 'Comunidad', posts = [] }) {
  const sectionId = 'social-posts'
  const showPosts = posts.slice(0, 8) // Mostrar solo los primeros 8

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
      <div className="relative group">
        <Swiper
          modules={[Navigation]}
          navigation={{
            prevEl: `.swiper-button-prev-${sectionId}`,
            nextEl: `.swiper-button-next-${sectionId}`,
          }}
          slidesPerView="auto"
          spaceBetween={20}
          className="w-full h-[240px]"
        >
          {showPosts.map((post) => (
            <SwiperSlide key={post.id} style={{ width: '320px', maxWidth: '90vw', height: '100%' }} className="h-full">
              <SocialPostCard post={post} />
            </SwiperSlide>
          ))}
        </Swiper>
        {/* Navigation Buttons */}
        <button
          className={`swiper-button-prev-${sectionId} absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 bg-white dark:bg-zinc-800 rounded-full p-2 shadow-md hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors hidden group-hover:flex items-center justify-center`}
          aria-label="Previous posts"
        >
          <ChevronLeft className="w-5 h-5 text-gray-900 dark:text-white" />
        </button>
        <button
          className={`swiper-button-next-${sectionId} absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 bg-white dark:bg-zinc-800 rounded-full p-2 shadow-md hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors hidden group-hover:flex items-center justify-center`}
          aria-label="Next posts"
        >
          <ChevronRight className="w-5 h-5 text-gray-900 dark:text-white" />
        </button>
      </div>
    </section>
  )
}
