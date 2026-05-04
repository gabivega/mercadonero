import React from 'react'
import SocialPost from './SocialPost'

export default function SocialPostFeed({ posts = [] }) {
  return (
    <section className="mb-8">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Comunidad</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Interactúa, pregunta y comparte con otros usuarios del marketplace.</p>
      </div>
      <div>
        {posts.map(post => (
          <SocialPost key={post.id} post={post} />
        ))}
      </div>
    </section>
  )
}
