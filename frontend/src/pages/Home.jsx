import React, { useEffect, useMemo, useState } from "react";
import ProductCarousel from "../components/ProductCarousel";
import BannerCarousel from "../components/BannerCarousel";
import productosRaw from "../data/mercadolibre_productos.json";
import HowToBuy from "../components/HowToBuy";
// Lista MANUAL de destacados (ids de Mongo). Ver el archivo para instrucciones.
// Si está vacía, el carousel se auto-oculta (no rompe el Home).
import { featuredProductIds, FEATURED_LIMIT } from "../config/featuredProducts";
// Transform raw ML data to product card format
const transformProduct = (product, index) => {
  // Price is now an integer string like "16452"
  let price = 0;
  if (product.price) {
    price = parseInt(product.price, 10) || 0;
  }

  // Get image - now a single string, not an array
  const mainImage =
    product.image || "https://via.placeholder.com/200x200?text=Sin+imagen";

  // Free shipping if price > 30000
  const freeShipping = price > 30000;

  // Calculate discount if not explicitly provided
  let discount = product.discount;
  if (
    !discount &&
    product.originalPrice &&
    product.price &&
    product.originalPrice !== product.price
  ) {
    const originalPriceNum = parseInt(product.originalPrice, 10);
    const priceNum = parseInt(product.price, 10);
    if (originalPriceNum > priceNum) {
      const discountPercentage = Math.round(
        ((originalPriceNum - priceNum) / originalPriceNum) * 100,
      );
      discount = `${discountPercentage}% OFF`;
    }
  }

  return {
    id: product.id,
    name: product.title,
    price: price,
    originalPrice: product.originalPrice
      ? parseInt(product.originalPrice, 10)
      : null,
    image: mainImage,
    discount,
    freeShipping,
    rating: product.seller?.rating ? parseFloat(product.seller.rating) : null,
    reviews: Math.floor(Math.random() * 500) + 10,
    condition: product.condition,
  };
};

// Filter products with valid prices and create enough for multiple carousels
const validProducts = productosRaw
  .filter((p) => p.price !== null && parseInt(p.price, 30) > 0)
  .map(transformProduct);

// Distribute products across categories (repeat if needed)
const createCategoryProducts = (count = 12) => {
  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(validProducts[i % validProducts.length]);
  }
  return result;
};

export default function Home() {
  // Memoize to avoid recalculating on every render
  const recommendedProducts = useMemo(() => createCategoryProducts(30), []);
  const recentlyAdded = useMemo(() => createCategoryProducts(30), []);
    const offersProducts = useMemo(() => createCategoryProducts(30), []);
  const fashionProducts = useMemo(() => createCategoryProducts(30), []);

    // Slice defensivo: el backend también lo acota, pero así no pedimos de más.
  const featuredIds = useMemo(
    () => featuredProductIds.slice(0, FEATURED_LIMIT),
    [],
  );

  return (
    <div className="space-y-8">
      {/* Banner Carousel */}
      <BannerCarousel />

      {/* ── DESTACADOS (curaduría manual) ──
          Va PRIMERO: es el espacio premium / monetizable. El orden sale de
          `config/featuredProducts.js`. Si no hay ids, o ninguno es visible, el
          componente se auto-oculta y el Home sigue de largo. */}
      <ProductCarousel
        title="Destacados"
        sectionId="featured"
        ids={featuredIds}
        exploreTo="/search"
      />

      {/* Recientemente Agregado: renombrado a "Novedades" para que no compita
          conceptualmente con Destacados. El orden aleatorio ayuda, pero el
          problema de fondo (todo de la misma categoría) se resuelve con los
          carousels temáticos de abajo. */}
      {validProducts.length > 0 && (
        <ProductCarousel
          title="Novedades"
          products={recentlyAdded}
          sectionId="recently-added"
          category="recently-added"
          exploreTo="/search?category=recently-added"
        />
      )}

      {/* ── CAROUSELS TEMÁTICOS ──
          Cada uno se auto-oculta si no tiene productos (ProductCarousel hace
          `return null` cuando la lista queda vacía). Así no aparecen títulos
          con carousels pelados mientras el catálogo no tiene stock del rubro.
          ⚠️ Los slugs están verificados contra `data/allCategories.js`. */}
      <ProductCarousel
        title="Monitores"
        category="computacion"
        subCategory="monitores-y-accesorios"
        sectionId="monitores"
        exploreTo="/c/computacion?subCategory=monitores-y-accesorios"
      />

      <ProductCarousel
        title="Notebooks"
        category="computacion"
        subCategory="notebooks-y-accesorios"
        sectionId="notebooks"
        exploreTo="/c/computacion?subCategory=notebooks-y-accesorios"
      />

      <ProductCarousel
        title="Parlantes y Auriculares"
        category="electronica-audio-y-video"
        subCategory="audio"
        sectionId="audio"
        exploreTo="/c/electronica-audio-y-video?subCategory=audio"
      />

      {/* Placares: el catálogo NO tiene subcategoría de placas de video ni de
          madre (se verificó contra allCategories). Se usan búsquedas por nombre,
          que es lo mejor disponible hoy. Si mañana se crean esas subcategorías,
          se cambia `exploreTo` y se agrega subCategory. */}
      <ProductCarousel
        title="Placas de Video y Motherboards"
        sectionId="placas"
        exploreTo="/search?q=placa%20de%20video"
      />

      {/* Offers Products Carousel */}
      {validProducts.length > 0 && (
        <ProductCarousel
        title="Ofertas Destacadas"
        products={offersProducts}
          sectionId="offers"
          category="offers" // 🔥 Flag para las ofertas
        />
      )}

            <HowToBuy />

      {/* ⚠️ Se quitó el carousel duplicado de "Notebooks y Accesorios" (ahora
          está arriba como "Notebooks", en el bloque temático). */}

      <ProductCarousel
        title="Consolas y Accesorios"
        category="consolas-y-videojuegos"
        sectionId="consolas-y-videojuegos"
      />


      <ProductCarousel
        title="Hogar muebles y Jardin"
        category="hogar-muebles-y-jardin" // El nombre exacto que pusimos en el Seed
        sectionId="tools-home"
        />
      <ProductCarousel
        title="Vehiculos"
        category="autos-motos-y-otros"
        sectionId="vehiculos"
        />
      <ProductCarousel
        title="Joyas y Relojes"
        category="joyas-y-relojes"
        sectionId="joyasyrelojes"
        />
        {/* Inmuebles Carousel */}
        {validProducts.length > 0 && (
          <ProductCarousel
            title="Inmuebles"
            category="inmuebles"
            sectionId="inmuebles"
          />
        )}

            {/* Sección de Red Social — DESHABILITADA hasta post-lanzamiento.
          Reels, posts y feed quedan fuera del Home por ahora.
          Para reactivar: descomentar los imports y los componentes. */}
      {/* <SocialVideoCarousel title="Reels" /> */}
      {/* <SocialPostCarousel posts={posts} /> */}
      {/* <div className="max-w-2xl mx-auto w-full">
        <SocialPostFeed posts={posts} />
      </div> */}

      {/* Debug info */}
      {validProducts.length === 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
          ⚠️ No se encontraron productos válidos en el JSON
        </div>
      )}
    </div>
  );
}

