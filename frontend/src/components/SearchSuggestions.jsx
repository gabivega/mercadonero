import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import productosRaw from '../data/mercadolibre_productos.json'

// Transform raw ML data to product card format (same as Home.jsx)
const transformProduct = (product) => {
  let price = 0
  if (product.price) {
    price = parseInt(product.price, 10) || 0
  }

  const mainImage = product.image || 'https://via.placeholder.com/200x200?text=Sin+imagen'
  const freeShipping = price > 30000

  return {
    id: product.id,
    name: product.title,
    price: price,
    originalPrice: product.originalPrice ? parseInt(product.originalPrice, 10) : null,
    image: mainImage,
    discount: product.discount,
    freeShipping,
    rating: product.rating ? parseFloat(product.rating) : null,
    reviews: Math.floor(Math.random() * 500) + 10,
    condition: product.condition,
  }
}

// Filter and transform products
const transformedProducts = productosRaw
  .filter(p => p.price !== null && parseInt(p.price, 10) > 0)
  .map(transformProduct)

export default function SearchSuggestions({ onCloseMobileMenu = null }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()
  const searchRef = useRef(null)

  // Extract unique words from product titles for suggestions
  const allWords = transformedProducts.flatMap(product => 
    product.name.toLowerCase().split(/\s+/)
  ).filter((word, index, self) => 
    word.length > 2 && self.indexOf(word) === index
  ).sort()

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([])
      return
    }

    const filtered = allWords.filter(word => 
      word.includes(query.toLowerCase())
    ).slice(0, 8)

    setSuggestions(filtered)
  }, [query])

  const handleInputChange = (e) => {
    setQuery(e.target.value)
    setIsOpen(true)
  }

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion)
    setIsOpen(false)
    navigate(`/search?q=${encodeURIComponent(suggestion)}`)
    // Close mobile menu if prop is provided
    if (onCloseMobileMenu) {
      onCloseMobileMenu()
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (query.trim()) {
      setIsOpen(false)
      navigate(`/search?q=${encodeURIComponent(query.trim())}`)
      // Close mobile menu if prop is provided
      if (onCloseMobileMenu) {
        onCloseMobileMenu()
      }
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div ref={searchRef} className="relative w-full max-w-2xl">
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsOpen(true)}
            placeholder="Buscar productos..."
            className="w-full px-4 py-2 pl-4 pr-4 mt-2 text-gray-900 dark:text-gray-100 bg-white dark:bg-[#2a2a2a] border border-gray-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F26722] focus:border-transparent transition-all duration-200"
          />
          {/* <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" /> */}
          <Search className="absolute right-4 top-1/2 transform -translate-y-1 w-5 h-5 text-gray-400 cursor-pointer" 
            onClick={() => handleSuggestionClick(query)} />
        </div>
      </form>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#2a2a2a] border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => handleSuggestionClick(suggestion)}
              className="w-full px-4 py-3 text-left text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-[#333333] transition-colors duration-150 flex items-center gap-3 first:rounded-t-lg last:rounded-b-lg"
            >
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="truncate">{suggestion}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
