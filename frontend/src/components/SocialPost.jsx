import React, { useState } from 'react'
import { Heart, MessageCircle } from 'lucide-react'

export default function SocialPost({ post }) {
  const [reply, setReply] = useState('')
  const [liked, setLiked] = useState(false)
  const [replies, setReplies] = useState(post.replies || [])

  const handleLike = () => setLiked(l => !l)
  const handleReply = () => {
    if (reply.trim()) {
      setReplies([...replies, { user: 'Tú', content: reply }])
      setReply('')
    }
  }

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl shadow p-4 mb-6">
      {/* User + Badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="font-bold text-[#F26722]">@{post.user.username}</span>
        {post.user.badge && (
          <span className="ml-2 px-2 py-0.5 text-xs rounded bg-[#F26722]/10 text-[#F26722] font-semibold">{post.user.badge}</span>
        )}
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{new Date(post.timestamp).toLocaleString()}</span>
      </div>
      {/* Content */}
      <div className="mb-3 text-gray-900 dark:text-gray-100 whitespace-pre-line">{post.content}</div>
      {/* Actions */}
      <div className="flex items-center gap-4 mb-2">
        <button onClick={handleLike} className={`flex items-center gap-1 text-sm ${liked ? 'text-[#F26722]' : 'text-gray-500 dark:text-gray-400'} hover:text-[#F26722]`}>
          <Heart className="w-4 h-4" fill={liked ? '#F26722' : 'none'} /> Like
        </button>
        <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
          <MessageCircle className="w-4 h-4" /> {replies.length}
        </span>
      </div>
      {/* Replies */}
      <div className="space-y-2 ml-4">
        {replies.map((r, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="font-semibold text-xs text-[#F26722]">@{r.user}</span>
            <span className="text-sm text-gray-800 dark:text-gray-200">{r.content}</span>
          </div>
        ))}
      </div>
      {/* Add Reply */}
      <div className="flex items-center gap-2 mt-3">
        <input
          type="text"
          value={reply}
          onChange={e => setReply(e.target.value)}
          placeholder="Escribe una respuesta..."
          className="flex-1 px-3 py-1.5 rounded border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#F26722]"
        />
        <button onClick={handleReply} className="px-3 py-1.5 rounded bg-[#F26722] text-white text-sm font-semibold hover:bg-[#d9531e] transition-colors">Responder</button>
      </div>
    </div>
  )
}
