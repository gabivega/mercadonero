import React, { useState, useMemo } from "react";
import {
  Building2,
  Maximize,
  BedDouble,
  Bath,
  Car,
  MapPin,
  Info,
  ImageIcon,
} from "lucide-react";
import ProductImageUploadModal from "./ProductImageuploader";
import {allCategories} from "../data/allCategories";

const PropertyForm = ({ handleSubmit, isSubmitting }) => {
  const propertySubcategories = useMemo(() => {
      const mainCat = allCategories.find(cat => cat.name === "Inmuebles");
      return mainCat ? mainCat.subcategories : [];
    }, []);
  const [property, setProperty] = useState({
    name: "",
    price: "",
    currency: "USD", // Por defecto en inmuebles suele ser USD
    stock: 1,
    condition: "used",
    listingType: "classified",
    category: "inmuebles",
    subCategory: "",
    operation: "sale",
    description: "",
    location: {
      address: "",
      city: "",
      state: "",
    },
    images: [],
    // Estas son las llaves técnicas para tu base de datos
    tempSpecs: {
      "Superficie total": "",
      Ambientes: "",
      Dormitorios: "",
      Baños: "",
      Cocheras: "",
      Antigüedad: "",
      Expensas: "0",
    },
  });

  const [isImgModalOpen, setIsImgModalOpen] = useState(false);

  const subCategories = [
    "Casas",
    "Departamentos",
    "Terrenos",
    "Locales",
    "Oficinas",
    "Quintas",
    "Cocheras",
    "Campos",
    "Galpones",
    "Otros"
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.includes(".")) {
      const [parent, child] = name.split(".");
      setProperty((prev) => ({
        ...prev,
        [parent]: { ...prev[parent], [child]: value },
      }));
    } else {
      setProperty((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSpecChange = (key, value) => {
    setProperty((prev) => ({
      ...prev,
      tempSpecs: { ...prev.tempSpecs, [key]: value },
    }));
  };

  const internalSubmit = (e) => {
    e.preventDefault();

    // Convertimos tempSpecs al formato [{ key, value }] que espera tu Schema
    const specifications = Object.entries(property.tempSpecs)
      .filter(([_, value]) => value !== "")
      .map(([key, value]) => ({
        key: key,
        value: value.toString(),
      }));

    const finalData = {
      ...property,
      specifications,
    };

    delete finalData.tempSpecs;
    handleSubmit(finalData);
  };

  return (
    <form
      onSubmit={internalSubmit}
      className="space-y-8 animate-in fade-in duration-500"
    >
      {/* Sección 1: Información Básica */}
      <section className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
        <div className="flex items-center gap-2 mb-2 text-[#F26722]">
          <Building2 size={20} />
          <h3 className="font-black uppercase text-sm tracking-widest">
            Información de la Propiedad
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1 col-span-3">
            <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">
              Título de la publicación
            </label>
            <input
              required
              name="name"
              placeholder="Ej: Departamento 2 Ambientes con Balcón - Centro"
              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:border-[#F26722] transition-colors dark:text-white"
              onChange={handleChange}
            />
          </div>

          <div className="space-y-1 col-span-1">
            <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">
              Tipo de Inmueble
            </label>
            <select
              required
              name="subCategory"
              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:border-[#F26722] dark:text-white"
              onChange={handleChange}
            >
              <option value="">Seleccionar tipo</option>
              {propertySubcategories.map((sub) => (
                <option key={sub.id} value={sub.slug.toLowerCase()}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>
        <div className="space-y-1 col-span-1">
          <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">
            Tipo de Operación
          </label>
          <select
            required
            name="operation"
            value={property.operation}
            className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:border-[#F26722] dark:text-white font-bold"
            onChange={handleChange}
          >
            <option value="sale">Venta</option>
            <option value="rent">Alquiler</option>
            <option value="temporary_rent">Alquiler Temporario</option>
          </select>
        </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">
              Precio
            </label>
            <input
              required
              type="number"
              name="price"
              placeholder="0.00"
              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:border-[#F26722] dark:text-white"
              onChange={handleChange}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">
              Moneda
            </label>
            <select
              name="currency"
              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:border-[#F26722] dark:text-white"
              onChange={handleChange}
              value={property.currency}
            >
              <option value="USD">Dólares (USD)</option>
              <option value="ARS">Pesos (ARS)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">
              Estado
            </label>
            <select
              name="condition"
              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:border-[#F26722] dark:text-white"
              onChange={handleChange}
            >
              <option value="used">Usado / Reventa</option>
              <option value="new">A Estrenar / Pozo</option>
            </select>
          </div>
        </div>
      </section>

      {/* Sección 2: Especificaciones Técnicas */}
      <section className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-6">
        <div className="flex items-center gap-2 mb-2 text-[#F26722]">
          <Info size={20} />
          <h3 className="font-black uppercase text-sm tracking-widest">
            Características principales
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <SpecInput
            icon={<Maximize size={16} />}
            label="Sup. Total (m²)"
            value={property.tempSpecs["Superficie total"]}
            onChange={(v) => handleSpecChange("Superficie total", v)}
          />
          <SpecInput
            icon={<BedDouble size={16} />}
            label="Dormitorios"
            value={property.tempSpecs["Dormitorios"]}
            onChange={(v) => handleSpecChange("Dormitorios", v)}
          />
          <SpecInput
            icon={<Bath size={16} />}
            label="Baños"
            value={property.tempSpecs["Baños"]}
            onChange={(v) => handleSpecChange("Baños", v)}
          />
          <SpecInput
            icon={<Car size={16} />}
            label="Cocheras"
            value={property.tempSpecs["Cocheras"]}
            onChange={(v) => handleSpecChange("Cocheras", v)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">
              Ambientes
            </label>
            <input
              type="number"
              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm dark:text-white"
              onChange={(e) => handleSpecChange("Ambientes", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">
              Antigüedad (Años)
            </label>
            <input
              type="number"
              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm dark:text-white"
              onChange={(e) => handleSpecChange("Antigüedad", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">
              Expensas (ARS)
            </label>
            <input
              type="number"
              placeholder="0"
              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm dark:text-white"
              onChange={(e) => handleSpecChange("Expensas", e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Sección 3: Ubicación Exacta */}
      <section className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
        <div className="flex items-center gap-2 mb-2 text-[#F26722]">
          <MapPin size={20} />
          <h3 className="font-black uppercase text-sm tracking-widest">
            Ubicación
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            required
            name="location.address"
            placeholder="Calle y Número"
            className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm dark:text-white"
            onChange={handleChange}
          />
          <input
            required
            name="location.city"
            placeholder="Ciudad / Barrio"
            className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm dark:text-white"
            onChange={handleChange}
          />
          <input
            required
            name="location.state"
            placeholder="Provincia"
            className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm dark:text-white"
            onChange={handleChange}
          />
        </div>
      </section>

      {/* Sección 4: Descripción */}
      <section className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
        <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">
          Descripción detallada
        </label>
        <textarea
          name="description"
          rows="6"
          placeholder="Describe las comodidades, orientación, cercanía a transportes, etc..."
          className="w-full p-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-sm outline-none focus:border-[#F26722] dark:text-white resize-none"
          onChange={handleChange}
        />
      </section>

      <section className="bg-white dark:bg-[#1A1A1A] p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
        <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter">
          Fotos
        </h1>
        <div className="bg-white dark:bg-[#1A1A1A] p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col items-center">
          <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-6 text-center">
            Fotos del producto ({property.images?.length}/5)
          </label>
          {/* CARGA DE IMAGENES */}
          <div
            onClick={() => setIsImgModalOpen(true)}
            className="w-full max-w-md aspect-video md:aspect-[21/9] rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/10 hover:border-blue-500 transition-all group overflow-hidden relative"
          >
            {property.images?.length > 0 ? (
              <>
                <img
                  src={
                    property.images.find((img) => img.isMain)?.url ||
                    property.images[0].url
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
          {property.images.length > 0 && (
            <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
              {property.images.map((img, i) => (
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
        <ProductImageUploadModal
          isOpen={isImgModalOpen}
          onClose={() => setIsImgModalOpen(false)}
          onUploadComplete={(images) => {
            setProperty((prev) => ({ ...prev, images }));
            // 'images' ahora es un array de objetos {url, isMain}
          }}
        />
      </section>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-4 bg-[#F26722] text-white rounded-2xl font-black uppercase tracking-[0.2em] text-sm hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
      >
        {isSubmitting ? "Publicando..." : "Publicar Inmueble"}
      </button>
    </form>
  );
};

// Componente auxiliar para inputs de características con ícono
const SpecInput = ({ icon, label, value, onChange }) => (
  <div className="space-y-2 flex flex-col items-center">
    <div className="text-zinc-400 dark:text-zinc-600">{icon}</div>
    <label className="text-[9px] font-black uppercase text-zinc-500 text-center">
      {label}
    </label>
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-20 p-2 text-center bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs dark:text-white outline-none focus:border-[#F26722]"
    />
  </div>
);

export default PropertyForm;
