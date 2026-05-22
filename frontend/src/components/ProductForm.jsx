import { useState, useEffect } from "react";
import { allCategories } from "../data/allCategories.js";
import {
  Package,
  Image as ImageIcon,
  Plus,
  X,
  ArrowRight,
  Truck,
} from "lucide-react";
import ProductImageUploadModal from "../components/ProductImageuploader";
import { deformatMoney, formatMoney } from "../Utils/currencyFormatter";

const ProductForm = ({ handleSubmit, isSubmitting, initialData }) => {
  const [product, setProduct] = useState({
    name: "",
    brand: "",
    description: "",
    price: "",
    currency: "ARS",
    sale: {
      price: "",
    },
    category: "",
    subCategory: "",
    stock: 1,
    condition: "new",
    shipping: {
      isDigital: false,
      free: false,
      digitalUrl: "",
      dimensions: {
        weight: "",
        length: "",
        width: "",
        height: "",
      },
      shippingTime: "24h",
    },
    images: [],
    listingType: "product",
  });
  const [isImgModalOpen, setIsImgModalOpen] = useState(false);

  useEffect(() => {
    if (initialData) {
      setProduct({
        ...product, // Mantiene la estructura base por las dudas
        ...initialData,
        // Nos aseguramos de que los objetos anidados no se rompan si no venían completos
        sale: { ...product.sale, ...initialData.sale },
        shipping: { 
          ...product.shipping, 
          ...initialData.shipping,
          dimensions: { ...product.shipping.dimensions, ...initialData.shipping?.dimensions }
        }
      });
    }
  }, [initialData]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === "checkbox" ? checked : value;
    setProduct((prev) => {
      // Si el nombre no tiene puntos, es un campo simple (name, brand, etc.)
      if (!name.includes(".")) {
        const newState = { ...prev, [name]: val };
        if (name === "category") newState.subCategory = "";
        return newState;
      }

      // Si tiene puntos (ej: "shipping.dimensions.weight"), navegamos el objeto
      const keys = name.split(".");
      const newState = { ...prev };
      let current = newState;

      // Recorremos hasta el penúltimo nivel
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] }; // Clonamos para mantener inmutabilidad
        current = current[keys[i]];
      }

      // Seteamos el valor en el último nivel
      current[keys[keys.length - 1]] = val;

      return newState;
    });
  };
  //Formato de moneda
  const handlePriceChange = (e) => {
    const { name, value } = e.target;

    // 1. Limpiamos el valor: dejamos solo números
    const numericValue = value.replace(/\D/g, "");

    // 2. Si no hay valor, seteamos 0 o vacío
    const finalValue = numericValue === "" ? "" : Number(numericValue);

    setProduct((prev) => {
      // Si es un campo simple (como priceARS)
      if (!name.includes(".")) {
        return { ...prev, [name]: finalValue };
      }

      // Si es anidado (como sale.price)
      const [parent, child] = name.split(".");
      return {
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: finalValue,
          // Si estamos tocando el precio de oferta, activamos el flag de 'active'
          ...(parent === "sale" ? { active: finalValue > 0 } : {}),
        },
      };
    });
  };
  const internalSubmit = (e) => {
    e.preventDefault(); // Evitamos que recargue la página
    handleSubmit(product); // Ejecutamos la función del padre pasando los datos del hijo
  };

  return (
    <form onSubmit={internalSubmit} className="space-y-2">
      {/* SECCIÓN 2: DETALLES DEL PRODUCTO (Flex-col y ancho completo) */}
      <section className="bg-white dark:bg-[#1A1A1A] p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-2">
        <h1 className="text-2xl font-black dark:text-white">
          Detalles del Producto
        </h1>
        {/* Nombre ocupa todo el ancho */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-400 uppercase">
            Título
          </label>
          <input
            name="name"
            type="text"
            required
            className="input-nero"
            value={product.name}
            onChange={handleInputChange}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-400 uppercase">
            Marca
          </label>
          <input
            name="brand"
            type="text"
            required
            className="input-nero"
            value={product.brand}
            onChange={handleInputChange}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Select de Categoría Principal */}
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Categoría
            </label>
            <select
              name="category"
              required
              className="input-nero"
              value={product.category}
              onChange={handleInputChange}
            >
              <option value="">Seleccionar Categoría...</option>
              {allCategories
                .filter(
                  (cat) =>
                    !["Vehículos", "Inmuebles", "Servicios"].includes(cat.name),
                )
                .map((cat) => (
                  <option key={cat.id} value={cat.slug}>
                    {cat.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Select de Sub-Categoría */}
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Sub-Categoría
            </label>
            <select
              name="subCategory"
              required
              disabled={!product.category}
              className="input-nero"
              value={product.subCategory}
              onChange={handleInputChange}
            >
              <option value="">Seleccionar Sub-categoría...</option>
              {/* Buscamos las subcategorías de la categoría elegida */}
              {allCategories
                .find((c) => c.slug === product.category)
                ?.subcategories?.map((sub) => (
                  <option key={sub.id} value={sub.slug}>
                    {sub.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Moneda
            </label>
            <select
              name="currency"
              className="input-nero"
              value={product.currency}
              onChange={handleInputChange}
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Precio
            </label>
            <input
              name="price"
              type="text"
              required
              className="input-nero"
              value={product.price}
              onChange={handlePriceChange}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Precio de Oferta (Opcional)
            </label>
            <input
              name="sale.price"
              type="text"
              className="input-nero"
              value={product.sale.price ? formatMoney(product.sale.price) : ""}
              onChange={handlePriceChange}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Estado
            </label>
            <select
              name="condition"
              className="input-nero"
              value={product.condition}
              onChange={handleInputChange}
            >
              <option value="new">Nuevo</option>
              <option value="used">Usado</option>
              <option value="refurbished">Reacondicionado</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Stock
            </label>
            <input
              name="stock"
              type="number"
              className="input-nero"
              value={product.stock}
              onChange={handleInputChange}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Descripción Detallada
          </label>
          <textarea
            name="description"
            required
            rows="5"
            className="w-full bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-gray-800 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-blue-500 dark:text-white resize-none"
            value={product.description}
            onChange={handleInputChange}
            placeholder="Describí las características principales, fallas (si tiene) o accesorios incluidos..."
          />
        </div>

        {/* SECCIÓN LOGÍSTICA */}
        <section className="bg-white dark:bg-[#1A1A1A] p-8 rounded-[32px] border border-gray-100 dark:border-gray-800 space-y-6">
          <h2 className="text-xl font-black dark:text-white tracking-tighter uppercase italic text-blue-500">
            Logística
          </h2>

          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-blue-500/5 rounded-2xl border border-blue-500/20">
              <input
                type="checkbox"
                id="isDigital"
                name="shipping.isDigital" // Usamos la ruta completa
                className="w-5 h-5 accent-blue-600"
                checked={product.shipping.isDigital}
                onChange={handleInputChange} // Usamos la función universal que ya maneja puntos
              />
              <label
                htmlFor="isDigital"
                className="text-sm font-bold dark:text-white cursor-pointer"
              >
                ¿Es un producto digital / servicio? (Sin envío físico)
              </label>
            </div>

            {/* URL Digital */}
            {product.shipping.isDigital && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase ml-1">
                  Link de descarga / Acceso
                </label>
                <input
                  type="url"
                  name="shipping.digitalUrl"
                  placeholder="https://ejemplo.com/archivo-o-acceso"
                  className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-xl p-3 text-sm outline-none focus:border-blue-500 transition-all"
                  value={product.shipping.digitalUrl || ""}
                  onChange={handleInputChange}
                />
              </div>
            )}
          </div>

          {!product.shipping.isDigital && (
            <div className="animate-in duration-500 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Checkbox Envío Gratis */}
                <label
                  className={`flex items-center gap-4 p-4 border rounded-2xl cursor-pointer transition-all ${
                    product.shipping.freeShipping // Cambié .free por .freeShipping para ser consistente
                      ? "bg-green-50 dark:bg-green-500/10 border-green-500"
                      : "bg-gray-50 dark:bg-[#252525] border-gray-200 dark:border-gray-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="shipping.freeShipping" // Corregido: sin punto al final
                    className="w-5 h-5 rounded-md border-gray-300 text-green-600 focus:ring-green-500"
                    checked={product.shipping.freeShipping}
                    onChange={handleInputChange}
                  />
                  <div className="flex items-center gap-2 font-bold text-gray-700 dark:text-gray-300 uppercase text-xs">
                    <Truck
                      size={18}
                      className={
                        product.shipping.freeShipping
                          ? "text-green-500"
                          : "text-gray-400"
                      }
                    />
                    Envío Gratis
                  </div>
                </label>

                {/* Costo Manual */}
                {!product.shipping.freeShipping && (
                  <div className="animate-in zoom-in-95 duration-200">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                        $
                      </span>
                      <input
                        type="number"
                        name="shipping.cost" // Corregido el nombre para que coincida con el estado
                        className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 pl-8 text-sm outline-none focus:border-blue-500 transition-all"
                        value={product.shipping.cost || ""}
                        onChange={handleInputChange}
                        placeholder="Precio del envio"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Dimensiones */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase">
                    Peso (kg)
                  </label>
                  <input
                    name="shipping.dimensions.weight"
                    type="number"
                    step="0.1"
                    className="input-nero"
                    value={product.shipping.dimensions.weight || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase">
                    Largo (cm)
                  </label>
                  <input
                    name="shipping.dimensions.length"
                    type="number"
                    className="input-nero"
                    value={product.shipping.dimensions.length || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase">
                    Ancho (cm)
                  </label>
                  <input
                    name="shipping.dimensions.width" // Corregido: shippping -> shipping
                    type="number"
                    className="input-nero"
                    value={product.shipping.dimensions.width || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase">
                    Alto (cm)
                  </label>
                  <input
                    name="shipping.dimensions.height"
                    type="number"
                    className="input-nero"
                    value={product.shipping.dimensions.height || ""}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium dark:text-gray-200">
                  Tiempo de despacho
                </label>
                <select
                  value={product.shipping.shippingTime}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      shipping: {
                        ...product.shipping,
                        shippingTime: e.target.value,
                      },
                    })
                  }
                  className="w-full p-2.5 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm"
                >
                  <option value="24h">🚀 Despacho en 24 hs</option>
                  <option value="48h">⚡ Despacho en 48 hs</option>
                  <option value="72h">🐢 Despacho en 72 hs</option>
                  <option value="more">📦 Más de 72 hs</option>
                </select>
              </div>
            </div>
          )}
        </section>

        <div className="bg-white dark:bg-[#1A1A1A] p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col items-center">
          <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-6 text-center">
            Fotos del producto ({product.images.length}/5)
          </label>
          {/* CARGA DE IMAGENES */}
          <div
            onClick={() => setIsImgModalOpen(true)}
            className="w-full max-w-md aspect-video md:aspect-[21/9] rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/10 hover:border-blue-500 transition-all group overflow-hidden relative"
          >
            {product.images.length > 0 ? (
              <>
                <img
                  src={
                    product.images.find((img) => img.isMain)?.url ||
                    product.images[0].url
                  }
                  className="w-full h-full object-cover"
                  alt="Preview"
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 flex items-center justify-center transition-all">
                  <span className="bg-white/90 dark:bg-black/60 px-4 py-2 rounded-xl text-xs font-bold dark:text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    Editar Galería
                  </span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center">
                <div className="p-4 bg-gray-50 dark:bg-[#252525] rounded-full mb-3 group-hover:scale-110 transition-transform">
                  <ImageIcon
                    className="text-gray-400 group-hover:text-blue-500"
                    size={32}
                  />
                </div>
                <span className="text-sm font-bold text-gray-500">
                  Cargar imágenes
                </span>
              </div>
            )}
          </div>

          {/* Miniaturas horizontales para no ocupar espacio vertical extra */}
          {product.images.length > 0 && (
            <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
              {product.images.map((img, i) => (
                <div
                  key={i}
                  className={`w-14 h-14 rounded-lg border-2 overflow-hidden flex-shrink-0 ${img.isMain ? "border-blue-500" : "border-transparent"}`}
                >
                  <img src={img.url} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Modal de Imágenes (Placeholder) */}
        <ProductImageUploadModal
          isOpen={isImgModalOpen}
          onClose={() => setIsImgModalOpen(false)}
          onUploadComplete={(images) => {
            setProduct((prev) => ({ ...prev, images }));
            // 'images' ahora es un array de objetos {url, isMain}
          }}
        />

        {/* BOTÓN FINAL */}
        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-blue-500/20 flex items-center justify-center gap-3 uppercase tracking-widest text-sm"
        >
          {isSubmitting ? "Procesando..." : "Publicar"}
        </button>
      </section>
    </form>
  );
};

export default ProductForm;
