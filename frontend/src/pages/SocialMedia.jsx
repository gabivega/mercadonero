import React, { useState, useEffect } from 'react'
import { Search, TrendingUp, Users, MessageCircle, Heart, Share2, MoreHorizontal } from 'lucide-react'
import SocialVideoCarousel from '../components/SocialVideoCarousel'
import SocialPostCard from '../components/SocialPostCard'
import postsData from '../data/posts.json'

export default function SocialMedia() {
  const [searchQuery, setSearchQuery] = useState('')
  const [posts, setPosts] = useState([])

  useEffect(() => {
    window.scrollTo(0, 0)
    setPosts(postsData)
  }, [])

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value)
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    // TODO: Implement search functionality
    // console.log('Searching for:', searchQuery)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#725c5c]">
      {/* Header with Search */}
      <div className="bg-white dark:bg-[#2a2a2a] border-b border-gray-200 dark:border-zinc-800 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[#F26722]">
              <TrendingUp className="w-6 h-6" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Social</h1>
            </div>
            
            {/* Search Bar */}
            <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Buscar posts, usuarios, temas..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 rounded-full text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#F26722] focus:border-transparent"
                />
              </div>
            </form>

            {/* Stats */}
            <div className="hidden md:flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Users className="w-4 h-4" />
                <span>2.3k usuarios</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <MessageCircle className="w-4 h-4" />
                <span>{posts.length} posts</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Video Carousel Section */}
      <div className="bg-white dark:bg-[#2a2a2a] border-b border-gray-200 dark:border-zinc-800">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#F26722]" />
             Tendencias
            </h2>
            <button className="text-sm text-[#F26722] hover:text-[#d9531e] transition-colors">
              Ver todos
            </button>
          </div>
          <SocialVideoCarousel />
        </div>
      </div>

      {/* Posts Section */}
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-2xl mx-auto">
          {/* Posts Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Posts Recientes
            </h2>
            <div className="flex items-center gap-2">
              <button className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                Más recientes
              </button>
              <button className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                Más populares
              </button>
            </div>
          </div>

          {/* Posts Feed - Vertical Layout like X */}
          <div className="space-y-4">
            {posts.map((post) => (
              <div 
                key={post.id} 
                className="bg-white dark:bg-[#2a2a2a] rounded-xl border border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 transition-all duration-200 overflow-hidden"
              >
                {/* Post Header */}
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <img 
                        src={post.author.avatar} 
                        alt={post.author.name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {post.author.name}
                          </h3>
                          {post.author.isVerified && (
                            <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                          <span className="text-sm text-gray-500 dark:text-gray-400">
                            @{post.author.username}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {post.timestamp}
                        </p>
                      </div>
                    </div>
                    
                    <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Post Content */}
                <div className="px-4 pb-3">
                  <p className="text-gray-900 dark:text-gray-100 leading-relaxed">
                    {post.content}
                  </p>
                </div>

                {/* Post Image (if exists) */}
                {post.image && (
                  <div className="px-4 pb-3">
                    <img 
                      src={post.image} 
                      alt="Post image"
                      className="w-full rounded-lg object-cover max-h-96"
                    />
                  </div>
                )}

                {/* Post Actions */}
                <div className="px-4 py-3 border-t border-gray-100 dark:border-zinc-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <button className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-blue-500 transition-colors">
                        <MessageCircle className="w-4 h-4" />
                        <span className="text-sm">{post.replies ? post.replies.length : 0}</span>
                      </button>
                      
                      <button className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-green-500 transition-colors">
                        <Share2 className="w-4 h-4" />
                        <span className="text-sm">{post.reposts || 0}</span>
                      </button>
                      
                      <button className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-red-500 transition-colors">
                        <Heart className="w-4 h-4" />
                        <span className="text-sm">{post.likes || 0}</span>
                      </button>
                    </div>
                    
                    <button className="text-gray-600 dark:text-gray-400 hover:text-blue-500 transition-colors">
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Load More Indicator */}
          <div className="mt-8 text-center">
            <div className="inline-flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-75"></div>
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-150"></div>
              <span className="text-sm ml-2">Cargar más posts</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
