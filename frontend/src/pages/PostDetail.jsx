import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import posts from '../data/posts'
import { ArrowLeft, Heart, MessageCircle, BadgeCheck } from 'lucide-react'

export default function PostDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const post = posts.find(p => p.id === id)
  const [reply, setReply] = useState('')
  const [replies, setReplies] = useState(post?.replies || [])
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(post?.likes || 0)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  if (!post) return <div className="text-center py-12">Post no encontrado.</div>

  const handleLike = () => {
    setLiked(l => !l)
    setLikeCount(c => liked ? c - 1 : c + 1)
  }
  const handleReply = () => {
    if (reply.trim()) {
      setReplies([...replies, { user: 'Tú', content: reply }])
      setReply('')
    }
  }

  return (
    <div className="max-w-xl mx-auto bg-white dark:bg-zinc-800 rounded-xl shadow p-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-[#F26722] mb-4">
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-zinc-700 flex items-center justify-center font-bold text-lg text-[#F26722]">
          {post.author?.[0] || 'U'}
        </div>
        <div className="flex items-center">
          <span className="font-semibold text-gray-900 dark:text-white text-base">{post.author}</span>
          {post.isVerified && <BadgeCheck className="w-4 h-4 text-blue-500 ml-1" />}
        </div>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{new Date(post.timestamp).toLocaleString()}</span>
      </div>
      <div className="text-gray-900 dark:text-gray-100 text-lg mb-4 whitespace-pre-line">{post.content}</div>
      <div className="flex items-center gap-6 mb-4 text-gray-500 dark:text-gray-400 text-sm">
        <button className={`flex items-center gap-1 hover:text-[#F26722] ${liked ? 'text-[#F26722]' : ''}`} onClick={handleLike}>
          <Heart className="w-5 h-5" fill={liked ? '#F26722' : 'none'} /> {likeCount}
        </button>
        <span className="flex items-center gap-1">
          <MessageCircle className="w-5 h-5" /> {replies.length}
        </span>
      </div>
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Respuestas</h3>
        <div className="space-y-3">
          {replies.length === 0 && <div className="text-gray-400 text-sm">Aún no hay respuestas.</div>}
          {replies.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="font-semibold text-xs text-[#F26722] flex items-center">@{r.author}{r.isVerified && <BadgeCheck className="w-3 h-3 text-blue-500 ml-1" />}</span>
              <span className="text-sm text-gray-800 dark:text-gray-200">{r.comment}</span>
            </div>
          ))}
        </div>
      </div>
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
