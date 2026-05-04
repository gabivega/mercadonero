import React, { useState } from "react";
import ProductImageUploadModal from "./ProductImageuploader";
import { deformatMoney, formatMoney } from "../Utils/currencyFormatter";
import { ImageIcon } from "lucide-react";

const VehicleForm = ({ handleSubmit, isSubmitting }) => {
  // Estado inicial siguiendo tu estructura de Producto base
  const [vehicle, setVehicle] = useState({
    name: "",
    description: "",
    price: "",
    currency: "ARS",
    category: "autos-motos-y-otros",
    subCategory: "autos-y-camionetas",
    listingType: "classified", // Para diferenciarlo de productos de carrito
    brand: "",
    location: { city: "", province: "" },
    images: [],
    // Campos temporales para el formulario que luego convertiremos a specifications
    tempSpecs: {
      year: "",
      km: "",
      fuel: "",
      model: "",
      transmission: "",
    },
  });
  const [isImgModalOpen, setIsImgModalOpen] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Manejo de campos anidados (location)
    if (name.includes(".")) {
      const [parent, child] = name.split(".");
      setVehicle((prev) => ({
        ...prev,
        [parent]: { ...prev[parent], [child]: value },
      }));
    }
    // Manejo de especificaciones temporales
    else if (name in vehicle.tempSpecs) {
      setVehicle((prev) => ({
        ...prev,
        tempSpecs: { ...prev.tempSpecs, [name]: value },
      }));
    }
    // Campos raíz
    else {
      setVehicle((prev) => ({ ...prev, [name]: value }));
    }
  };

  const internalSubmit = (e) => {
    e.preventDefault();
    console.log(vehicle)

    // Convertimos el objeto tempSpecs a tu array de [{ key, value }]
    const specifications = Object.entries(vehicle.tempSpecs).map(
      ([key, value]) => ({
        key: key.charAt(0).toUpperCase() + key.slice(1), // Formateamos label (ej: "km" -> "Km")
        value: value,
      }),
    );

    // Construimos el payload final
    const finalData = {
      ...vehicle,
      price: deformatMoney(vehicle.price),
      specifications, // Array de key-value para la BD
    };

    // Quitamos el campo temporal antes de enviar
    delete finalData.tempSpecs;

    handleSubmit(finalData);
  };

  return (
    <form onSubmit={internalSubmit} className="space-y-6">
      {/* DETALLES VEHÍCULO */}
      <section className="bg-white dark:bg-[#1A1A1A] p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-6">
        <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter">
          Carga de Vehiculo
        </h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Tipo de Vehículo
            </label>
            <select
              name="subCategory"
              required
              className="input-nero"
              value={vehicle.subCategory}
              onChange={handleInputChange}
            >
              <option value="">Seleccionar tipo</option>
              <option value="autos-y-camionetas">Autos y Camionetas</option>
              <option value="motos">Motos</option>
              <option value="camiones">Camiones</option>
              <option value="colectivos">Colectivos</option>
              <option value="maquinaria-agricola">Maquinaria Agrícola</option>
              <option value="nautica">Nautica</option>
              <option value="motorhomes">Motor Homes</option>
              <option value="autos-de-coleccion">Autos de coleccion</option>
              <option value="autos-chocados-y-averiados">Autos chocados y averiados</option>
              <option value="otros">Otros</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-400 uppercase">
            Título
          </label>
          <input
            name="name"
            type="text"
            required
            className="input-nero"
            value={vehicle.name}
            onChange={handleInputChange}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Marca
            </label>
            <input
              name="brand"
              type="text"
              required
              className="input-nero"
              value={vehicle.brand}
              onChange={handleInputChange}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Modelo
            </label>
            <input
              name="model"
              type="text"
              required
              className="input-nero"
              value={vehicle.tempSpecs.model}
              onChange={handleInputChange}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Año
            </label>
            <input
              name="Año"
              type="number"
              required
              className="input-nero"
              value={vehicle.tempSpecs.Año}
              onChange={handleInputChange}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Kilómetros
            </label>
            <input
              name="Kilómetros"
              type="number"
              required
              className="input-nero"
              value={vehicle.tempSpecs.Kilómetros + "km"} 
              onChange={handleInputChange}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Combustible
            </label>
            <select
              name="combustible"
              required
              className="input-nero"
              value={vehicle.tempSpecs.combustible}
              onChange={handleInputChange}
            >
              <option value="">Seleccionar</option>
              <option value="Nafta">Nafta</option>
              <option value="Diesel">Diesel</option>
              <option value="GNC">GNC</option>
              <option value="Híbrido/Eléctrico">Híbrido/Eléctrico</option>
            </select>
          </div>
          {/* Agregué el campo Transmisión que suele ser clave en vehículos */}
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Transmisión
            </label>
            <select
              name="transmision"
              className="input-nero"
              value={vehicle.tempSpecs.transmision}
              onChange={handleInputChange}
            >
              <option value="">Seleccionar</option>
              <option value="Manual">Manual</option>
              <option value="Automática">Automática</option>
            </select>
          </div>
        </div>
      </section>

      {/* PRECIO Y UBICACIÓN */}
      <section className="bg-white dark:bg-[#1A1A1A] p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Precio
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold dark:text-white">
                {vehicle.currency === "ARS" ? "$" : "USD"}
              </span>
              <input
                name="price"
                type="text"
                className="input-nero pl-14"
                value={formatMoney(vehicle.price)}
                onChange={(e) => {
                  // 1. Limpiamos el valor que viene del input (quitamos puntos, símbolos, etc.)
                  const cleanValue = deformatMoney(e.target.value);

                  // 2. Solo actualizamos si es un número válido o está vacío
                  setVehicle((prev) => ({
                    ...prev,
                    price: cleanValue,
                  }));
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Moneda
            </label>
            <select
              name="currency"
              className="input-nero"
              value={vehicle.currency}
              onChange={handleInputChange}
            >
              <option value="ARS">Pesos (ARS)</option>
              <option value="USD">Dólares (USD)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Ciudad
            </label>
            <input
              name="location.city"
              type="text"
              required
              className="input-nero"
              value={vehicle.location.city}
              onChange={handleInputChange}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Provincia
            </label>
            <input
              name="location.province"
              type="text"
              required
              className="input-nero"
              value={vehicle.location.province}
              onChange={handleInputChange}
            />
          </div>
        </div>
      </section>
      <div className="space-y-2">
        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
          Descripción Detallada
        </label>
        <textarea
          name="description"
          required
          rows="5"
          className="w-full bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-gray-800 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-blue-500 dark:text-white resize-none"
          value={vehicle.description}
          onChange={handleInputChange}
          placeholder="Describí las características principales, estado general y cualquier detalle relevante..."
        />
      </div>

      <section className="bg-white dark:bg-[#1A1A1A] p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-4">
        <h1 className="text-2xl font-black dark:text-white uppercase tracking-tighter">
          Fotos
        </h1>
        <div className="bg-white dark:bg-[#1A1A1A] p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col items-center">
          <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-6 text-center">
            Fotos del producto ({vehicle.images.length}/5)
          </label>
          {/* CARGA DE IMAGENES */}
          <div
            onClick={() => setIsImgModalOpen(true)}
            className="w-full max-w-md aspect-video md:aspect-[21/9] rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/10 hover:border-blue-500 transition-all group overflow-hidden relative"
          >
            {vehicle.images.length > 0 ? (
              <>
                <img
                  src={
                    vehicle.images.find((img) => img.isMain)?.url ||
                    vehicle.images[0].url
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
          {vehicle.images.length > 0 && (
            <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
              {vehicle.images.map((img, i) => (
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
            setVehicle((prev) => ({ ...prev, images }));
            // 'images' ahora es un array de objetos {url, isMain}
          }}
        />
      </section>
      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-[#F26722] hover:bg-[#d4561a] text-white py-4 rounded-2xl font-black uppercase tracking-widest transition-all disabled:opacity-50"
      >
        {isSubmitting ? "Publicando..." : "Publicar Vehículo"}
      </button>
    </form>
  );
};

export default VehicleForm;
