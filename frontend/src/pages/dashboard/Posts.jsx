import React from 'react';
import { Image, Video, Send, MoreHorizontal } from 'lucide-react';

export default function Posts() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h2 className="text-2xl font-bold">Mis Posts y Reels</h2>

      {/* Creador de Post rápido */}
      <div className="bg-white dark:bg-[#252525] p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
        <textarea 
          placeholder="¿Qué estás pensando? (Comparte algo con la comunidad)"
          className="w-full bg-transparent border-none focus:ring-0 text-lg resize-none"
          rows="3"
        />
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
          <div className="flex gap-4 text-gray-500">
            <button className="hover:text-blue-500 flex items-center gap-1"><Image size={20}/> Foto</button>
            <button className="hover:text-purple-500 flex items-center gap-1"><Video size={20}/> Reel</button>
          </div>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full font-bold transition-colors flex items-center gap-2">
            Postear <Send size={16}/>
          </button>
        </div>
      </div>

      {/* Feed de mis posts anteriores */}
      <div className="space-y-4">
        <h3 className="font-semibold text-gray-500">Publicaciones anteriores</h3>
        <div className="bg-white dark:bg-[#252525] p-6 rounded-xl border border-gray-200 dark:border-gray-800">
          <div className="flex justify-between mb-4">
            <span className="text-sm text-gray-400">Publicado hace 2 días</span>
            <MoreHorizontal size={20} className="text-gray-400 cursor-pointer"/>
          </div>
          <p className="text-gray-800 dark:text-gray-200 leading-relaxed">
            Acabo de subir nuevos productos al marketplace. ¡Echen un vistazo al token $NERO! 🚀
          </p>
        </div>
      </div>
    </div>
  );
}