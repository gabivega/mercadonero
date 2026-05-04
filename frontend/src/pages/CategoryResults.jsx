import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ProductCard from '../components/ProductCard'
import axios from 'axios'
import FilterSidebar from '../components/FIlterSidebar'



export default function CategoryResults() {
  const { categorySlug } = useParams()
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
const [filters, setFilters] = useState({
  condition: '',
  freeShipping: false,
  minPrice: '',
  maxPrice: '',
  brand: ''
});
const availableBrands = [...new Set(products.map(p => p.brand).filter(Boolean))];
const availableSubcategories = [...new Set(products.map(p => p.subCategory).filter(Boolean))];


useEffect(() => {
  const loadProducts = async () => {
    try {
      setLoading(true);
      // Llamada directa a tu API
      const response = await axios.get(`${import.meta.env.VITE_SERVER_URL}/api/product/products?category=${categorySlug}`);
      setProducts(response.data.products);
      setError(null);
    } catch (err) {
      setError('Error al cargar productos de esta categoría');
      // Aquí podrías usar el Swal que armamos antes
    } finally {
      setLoading(false);
    }
  }
  if (categorySlug) loadProducts();
}, [categorySlug]);

// Función para traer productos con filtros
  const fetchFilteredProducts = async () => {
    setLoading(true);
    try {
      // Construimos la URL con la categoría base
      let url = `${import.meta.env.VITE_SERVER_URL}/api/product/products?category=${categorySlug}`;

      // Agregamos dinámicamente los filtros si tienen valor
      if (filters.minPrice) url += `&minPrice=${filters.minPrice}`;
      if (filters.maxPrice) url += `&maxPrice=${filters.maxPrice}`;
      if (filters.condition) url += `&condition=${filters.condition}`;
      if (filters.brand) url += `&brand=${filters.brand}`;
      if (filters.subCategory) url += `&subCategory=${filters.subCategory}`;

      const response = await fetch(url);
      const data = await response.json();
      console.log(data.products)
      
      // Ajustamos según la estructura de tu respuesta del back
      setProducts(data.products || data); 
    } catch (error) {
      console.error("Error filtrando productos:", error);
    } finally {
      setLoading(false);
    }
  };

  // Cada vez que 'filters' o 'categorySlug' cambien, ejecutamos la búsqueda
  useEffect(() => {
    fetchFilteredProducts();
  }, [filters, categorySlug]);

  const formatCategoryName = (slug) => {
    return slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="bg-gray-200 dark:bg-gray-700 rounded-lg h-80"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-8 text-center">
          <h2 className="text-xl font-semibold text-red-700 dark:text-red-300 mb-2">
            {error}
          </h2>
          <button 
            onClick={() => navigate('/')}
            className="mt-4 px-6 py-2 bg-[#F26722] text-white rounded-lg hover:bg-[#E55A1F] transition-colors"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto px-4 py-8 flex flex-col md:flex-row gap-8 items-start">
      <FilterSidebar 
      filters={filters} 
      onFilterChange={setFilters} 
      totalResults={products.length}
      categoryName={categorySlug}
      availableBrands={availableBrands}
      availableSubcategories={availableSubcategories}
    />
    <div className="w-full">
      <div className="mb-8 w-full">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 text-center">
          {formatCategoryName(categorySlug)}
        </h1>
        {/* <p className="text-gray-600 dark:text-gray-400">
          {products.length} producto{products.length !== 1 ? 's' : ''} encontrado{products.length !== 1 ? 's' : ''}
        </p> */}
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 w-full mx-auto">
          <div className="text-gray-400 dark:text-gray-500 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No hay productos en esta categoría
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Prueba con otra categoría o vuelve más tarde
          </p>
          <button 
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-[#F26722] text-white rounded-lg hover:bg-[#E55A1F] transition-colors"
          >
            Explorar más productos
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 flex-1 w-full">
          {products.map((product) => (
            <ProductCard key={product._id} product={product} />
          ))}
        </div>
      )}
    </div>
    </div>
  )
}
