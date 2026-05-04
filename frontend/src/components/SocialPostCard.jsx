import React, { useState } from 'react'
import { MessageCircle, Repeat2, Heart, Bookmark, BadgeCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function SocialPostCard({ post }) {
  const navigate = useNavigate()
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(post.likes || 0)
  const [saved, setSaved] = useState(false)

  const handleLike = () => {
    setLiked(l => !l)
    setLikeCount(c => liked ? c - 1 : c + 1)
  }
  const handleSave = () => setSaved(s => !s)

  return (
    <div
      className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 flex flex-col gap-2 min-h-[180px] h-full w-full cursor-pointer hover:shadow-lg transition-shadow"
      onClick={() => navigate(`/post/${post.id}`)}
    >
      {/* User Row */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-zinc-700 flex items-center justify-center font-bold text-lg text-[#F26722]">
          {post.author?.[0] || 'U'}
        </div>
        <div className="flex items-center">
          <span className="font-semibold text-gray-900 dark:text-white text-sm">{post.author}</span>
          {post.isVerified && <BadgeCheck className="w-4 h-4 text-blue-500 ml-1" />}
        </div>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{new Date(post.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      {/* Content */}
      <div className="text-gray-900 dark:text-gray-100 text-sm mb-2 line-clamp-5 whitespace-pre-line">{post.content}</div>
      {/* Actions Row */}
      <div className="flex items-center gap-6 mt-auto text-gray-500 dark:text-gray-400 text-xs">
        <div className="flex items-center gap-1 cursor-pointer hover:text-[#F26722]">
          <MessageCircle className="w-4 h-4" />
          {post.replies ? post.replies.length : 0}
        </div>
        <div className="flex items-center gap-1 cursor-pointer hover:text-[#F26722]">
          <Repeat2 className="w-4 h-4" />
          {post.reposts || 0}
        </div>
        <button className={`flex items-center gap-1 cursor-pointer hover:text-[#F26722] ${liked ? 'text-[#F26722]' : ''}`} onClick={handleLike}>
          <Heart className="w-4 h-4" fill={liked ? '#F26722' : 'none'} />
          {likeCount}
        </button>
        <button className={`ml-auto flex items-center gap-1 cursor-pointer hover:text-[#F26722] ${saved ? 'text-[#F26722]' : ''}`} onClick={handleSave}>
          <Bookmark className="w-4 h-4" fill={saved ? '#F26722' : 'none'} />
        </button>
      </div>
    </div>
  )
}
