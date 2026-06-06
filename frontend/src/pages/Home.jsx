import React, { useMemo } from "react";
import ProductCarousel from "../components/ProductCarousel";
import SocialVideoCarousel from "../components/SocialVideoCarousel";
import SocialPostFeed from "../components/SocialPostFeed";
import SocialPostCarousel from "../components/SocialPostCarousel";
import BannerCarousel from "../components/BannerCarousel";
import productosRaw from "../data/mercadolibre_productos.json";
import posts from "../data/posts";
import HowToBuy from "../components/HowToBuy";

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
  
  return (
    <div className="space-y-8">
      {/* Banner Carousel */}
      <BannerCarousel />
      {/* Recently Added Carousel */}
      {validProducts.length > 0 && (
        <ProductCarousel
          title="Recientemente Agregado"
          products={recentlyAdded}
          sectionId="recently-added"
          category="recently-added" // 🔥 Le pasamos un flag claro en lugar de dejarlo undefined
        />
      )}
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

      <ProductCarousel
        title="Celulares y Teléfonos"
        category="celulares-y-telefonos"
        sectionId="celularesytelefonos"
      />

      <ProductCarousel
        title="Ropa y accesorios"
        category="ropa-y-accesorios"
        sectionId="ropa-y-accesorios"
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

      {/* Social Videos Section */}
      <SocialVideoCarousel title="Reels" />

      {/* Social Posts Carousel */}
      <SocialPostCarousel posts={posts} />

      {/* Social Posts Section */}
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
