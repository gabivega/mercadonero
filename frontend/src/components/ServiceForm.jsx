import { useState, useMemo } from 'react';
import { Briefcase, MapPin, Clock, CheckCircle2, Image as ImageIcon, MessageSquare } from 'lucide-react';
import ProductImageUploadModal from "./ProductImageuploader";
import {allCategories} from "../data/allCategories";

const ServiceForm = ({ handleSubmit, isSubmitting }) => {
  const [isImgModalOpen, setIsImgModalOpen] = useState(false);
  const serviceSubcategories = useMemo(() => {
    const mainCat = allCategories.find(cat => cat.slug === "servicios");
    return mainCat ? mainCat.subcategories : [];
  }, []);
  const [service, setService] = useState({
    name: '',
    price: '',
    currency: 'ARS',
    stock: 1, // Valor técnico para el backend
    condition: 'new', 
    listingType: 'classified',
    category: 'servicios',
    subCategory: '',
    description: '',
    images: [],
    location: {
      city: '',
      province: '',
      address: '' // Aquí puede ir la zona de cobertura
    },
    tempSpecs: {
      "Experiencia": '',
      "Presupuesto sin cargo": 'No',
      "Atención a domicilio": 'No',
      "Horarios": ''
    }
  });


  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setService(prev => ({
        ...prev,
        [parent]: { ...prev[parent], [child]: value }
      }));
    } else {
      setService(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSpecChange = (key, value) => {
    setService(prev => ({
      ...prev,
      tempSpecs: { ...prev.tempSpecs, [key]: value }
    }));
  };

  const internalSubmit = (e) => {
    e.preventDefault();
    
    const specifications = Object.entries(service.tempSpecs)
      .filter(([_, value]) => value !== '')
      .map(([key, value]) => ({ key, value: value.toString() }));

    const finalData = { ...service, specifications };
    delete finalData.tempSpecs;
    handleSubmit(finalData);
  };

  return (
    <form onSubmit={internalSubmit} className="space-y-6 animate-in fade-in duration-500">
      
      {/* Sección 1: Datos del Servicio */}
      <section className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 grid grid-cols-12 gap-4">
        <div className="col-span-12 flex items-center gap-2 mb-2 text-[#F26722]">
          <Briefcase size={20} />
          <h3 className="font-black uppercase text-sm tracking-widest">Detalles del Servicio</h3>
        </div>

        <div className="col-span-12 md:col-span-8 space-y-1">
          <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">¿Qué servicio ofreces?</label>
          <input
            required
            name="name"
            placeholder="Ej: Plomero Matriculado - Urgencias 24hs"
            className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:border-[#F26722] dark:text-white"
            onChange={handleChange}
          />
        </div>

        <div className="col-span-12 md:col-span-4 space-y-1">
          <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">Rubro</label>
          <select
            required
            name="subCategory"
            value={service.subCategory}
            className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:border-[#F26722] dark:text-white"
            onChange={handleChange}
          >
            <option value="">Seleccionar rubro</option>
            {serviceSubcategories.map(sub => (
              <option key={sub.id} value={sub.slug}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>

        <div className="col-span-12 md:col-span-4 space-y-1">
          <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">Precio (Desde)</label>
          <input
            required
            type="number"
            name="price"
            placeholder="0.00"
            className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm outline-none focus:border-[#F26722] dark:text-white"
            onChange={handleChange}
          />
        </div>

        <div className="col-span-12 md:col-span-8 space-y-1">
          <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">Imágenes del Trabajo</label>
          <button
            type="button"
            onClick={() => setIsImgModalOpen(true)}
            className="w-full p-3 flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl text-zinc-500 hover:border-[#F26722] transition-all"
          >
            <ImageIcon size={18} />
            <span className="text-sm font-bold uppercase tracking-tight">
              {service.images.length > 0 ? `${service.images.length} fotos cargadas` : 'Cargar fotos de trabajos previos'}
            </span>
          </button>
        </div>
      </section>

      {/* Sección 2: Especificaciones del Servicio */}
      <section className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-6">
        <div className="flex items-center gap-2 mb-2 text-[#F26722]">
          <CheckCircle2 size={20} />
          <h3 className="font-black uppercase text-sm tracking-widest">Información adicional</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">Experiencia (Años)</label>
            <input 
              type="text" 
              placeholder="Ej: 10 años"
              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm dark:text-white"
              onChange={(e) => handleSpecChange("Experiencia", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">¿Presupuesto sin cargo?</label>
            <select 
              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm dark:text-white"
              onChange={(e) => handleSpecChange("Presupuesto sin cargo", e.target.value)}
            >
              <option value="No">No</option>
              <option value="Sí">Sí</option>
              <option value="Depende la zona">Depende la zona</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">¿A domicilio?</label>
            <select 
              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm dark:text-white"
              onChange={(e) => handleSpecChange("Atención a domicilio", e.target.value)}
            >
              <option value="No">No (Taller propio)</option>
              <option value="Sí">Sí</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-zinc-500 ml-1">Horarios</label>
            <input 
              type="text" 
              placeholder="Ej: Lun a Vie 9-18hs"
              className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm dark:text-white"
              onChange={(e) => handleSpecChange("Horarios", e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* Sección 3: Ubicación y Cobertura */}
      <section className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
        <div className="flex items-center gap-2 mb-2 text-[#F26722]">
          <MapPin size={20} />
          <h3 className="font-black uppercase text-sm tracking-widest">Zona de cobertura</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            required
            name="location.city"
            placeholder="Ciudad / Localidad"
            className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm dark:text-white"
            onChange={handleChange}
          />
          <input
            required
            name="location.province"
            placeholder="Provincia"
            className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm dark:text-white"
            onChange={handleChange}
          />
          <input
            name="location.address"
            placeholder="Barrio o zona específica (opcional)"
            className="w-full p-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm dark:text-white"
            onChange={handleChange}
          />
        </div>
      </section>

      {/* Sección 4: Descripción del servicio */}
      <section className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-4">
        <div className="flex items-center gap-2 text-zinc-500">
           <MessageSquare size={16}/>
           <label className="text-[10px] font-black uppercase ml-1">Detalla tu propuesta</label>
        </div>
        <textarea
          required
          name="description"
          rows="5"
          placeholder="Explicá en detalle qué incluye tu servicio, materiales con los que trabajás, si das garantía escrita, etc..."
          className="w-full p-4 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-sm outline-none focus:border-[#F26722] dark:text-white resize-none"
          onChange={handleChange}
        />
      </section>

      <button
        type="submit"
        disabled={isSubmitting || service.images.length === 0}
        className="w-full py-4 bg-[#F26722] text-white rounded-2xl font-black uppercase tracking-[0.2em] text-sm hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
      >
        {isSubmitting ? 'Publicando...' : 'Publicar Servicio'}
      </button>

      {/* Modal de Imágenes */}
      <ProductImageUploadModal
        isOpen={isImgModalOpen}
        onClose={() => setIsImgModalOpen(false)}
        onUploadComplete={(images) => {
          setService((prev) => ({ ...prev, images }));
        }}
      />
    </form>
  );
};

export default ServiceForm;