import React from 'react'
import { Heart, MessageCircle, Share2 } from 'lucide-react'

export default function SocialVideoCard({ playbackId }) {
  // Construct Mux player URL from playback ID
  const videoUrl = `https://player.mux.com/${playbackId}`
  
  return (
    <div className="relative bg-black dark:bg-gray-950 rounded-lg overflow-hidden group" style={{ width: '180px', aspectRatio: '9/16' }}>
      {/* Video Container */}
      <iframe
        src={videoUrl}
        title={`Video ${playbackId}`}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          aspectRatio: '9/16',
        }}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />

      {/* Overlay Actions - visible on hover - pointer-events-none allows clicks to pass through to iframe */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-end justify-end p-3 gap-3 pointer-events-none">
        <button className="bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white p-2 rounded-full transition-colors pointer-events-auto" aria-label="like">
          <Heart className="w-5 h-5" />
        </button>
        <button className="bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white p-2 rounded-full transition-colors pointer-events-auto" aria-label="comment">
          <MessageCircle className="w-5 h-5" />
        </button>
        <button className="bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white p-2 rounded-full transition-colors pointer-events-auto" aria-label="share">
          <Share2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
