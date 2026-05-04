import React from 'react'

export default function Footer() {
  return (
    <footer className="border-t dark:border-gray-700 bg-white dark:bg-gray-900 mt-12">
      <div className="container mx-auto px-4 py-6 text-center text-sm text-gray-600 dark:text-gray-400">
        © {new Date().getFullYear()} Nero Marketplace — Built for the MVP
      </div>
    </footer>
  )
}
