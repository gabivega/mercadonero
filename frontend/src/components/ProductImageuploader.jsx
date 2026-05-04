import { useState, useRef } from 'react';
import { X, Upload, Star, Trash2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function ImageUploadModal({ isOpen, onClose, onUploadComplete }) {
  const [tempImages, setTempImages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
const [isFinished, setIsFinished] = useState(false); // Nuevo estado
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const MAX_FILES = 5;

  if (!isOpen) return null;

  const handleFileSelect = (e) => {
    setError(null);
    const files = Array.from(e.target.files);
    
    // Calculamos cuánto espacio queda
    const availableSlots = MAX_FILES - tempImages.length;
    
    if (availableSlots <= 0) {
      setError(`Ya alcanzaste el límite de ${MAX_FILES} imágenes.`);
      return;
    }

    // Tomamos solo los archivos que caben
    const allowedFiles = files.slice(0, availableSlots);
    
    if (files.length > availableSlots) {
      setError(`Solo se agregaron las primeras ${availableSlots} fotos para no exceder el límite.`);
    }

    const newImages = allowedFiles.map((file, index) => ({
      file,
      preview: URL.createObjectURL(file),
      // Solo es principal si NO había imágenes previas Y es la primera de este nuevo lote
      isMain: tempImages.length === 0 && index === 0 
    }));

    setTempImages(prev => [...prev, ...newImages]);
    // Limpiamos el input para que permita subir el mismo archivo si se borró
    e.target.value = null; 
  };

  const removeImage = (index) => {
    setTempImages(prev => {
      const filtered = prev.filter((_, i) => i !== index);
      // Si borramos la que era principal y quedan otras, hacemos principal a la primera de la lista
      if (prev[index].isMain && filtered.length > 0) {
        filtered[0].isMain = true;
      }
      return filtered;
    });
  };

  const setMainImage = (index) => {
    setTempImages(prev => prev.map((img, i) => ({
      ...img,
      isMain: i === index
    })));
  };

  // ... (aquí iría la función uploadToCloudinary que armaremos luego)
const uploadToCloudinary = async () => {
  if (tempImages.length === 0) return;
  setIsUploading(true);
  const uploadedResults = [];

  try {
    for (const img of tempImages) {
      const formData = new FormData();
      formData.append('file', img.file);
      formData.append('upload_preset', 'mercadonero');

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/davo0f82p/image/upload`,
        { method: 'POST', body: formData }
      );
      const data = await response.json();
      
      uploadedResults.push({
        url: data.secure_url,
        isMain: img.isMain
      });
    }

    // Guardamos los resultados pero NO cerramos todavía
    onUploadComplete(uploadedResults); 
    setIsFinished(true); // Activamos la vista de éxito
    
  } catch (err) {
    setError("Error al subir las imágenes.");
  } finally {
    setIsUploading(false);
  }
};
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
    <div className="bg-white dark:bg-[#1A1A1A] w-full max-w-2xl rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-2xl">
      
      <div className="p-8 text-center">
        {isFinished ? (
          // VISTA DE ÉXITO
          <div className="py-10 space-y-6 animate-in zoom-in duration-300">
            <div className="w-20 h-20 bg-green-100 dark:bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 size={48} />
            </div>
            <div>
              <h3 className="text-2xl font-bold dark:text-white">¡Carga completa!</h3>
              <p className="text-gray-500">Tus imágenes se optimizaron y guardaron correctamente.</p>
            </div>
            <button 
              onClick={onClose}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all"
            >
              Cerrar y continuar
            </button>
          </div>
        ) : (
          // VISTA DE CARGA (la que ya teníamos)
          <>
          {/* Grilla de Imágenes */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            {/* Espacio vacío o primer contenido */}
            {tempImages.length === 0 && <div className="hidden md:block"></div>}
            {tempImages.map((img, index) => (
              <div 
                key={img.preview} 
                className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all duration-300 ${
                  img.isMain ? 'border-blue-500 ring-4 ring-blue-500/10 scale-[0.98]' : 'border-transparent'
                }`}
              >
                <img src={img.preview} className="w-full h-full object-cover" alt="preview" />
                
                <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  <button 
                    type="button"
                    onClick={() => setMainImage(index)}
                    className={`p-2 rounded-full transition-transform active:scale-90 ${
                      img.isMain ? 'bg-blue-500 text-white' : 'bg-white text-gray-900'
                    }`}
                  >
                    <Star size={18} fill={img.isMain ? "currentColor" : "none"} />
                  </button>
                  <button 
                    type="button"
                    onClick={() => removeImage(index)}
                    className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-transform active:scale-90"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                {img.isMain && (
                  <div className="absolute top-3 left-3 bg-blue-500 text-[9px] text-white font-black px-2 py-1 rounded-lg uppercase shadow-lg">
                    Portada
                  </div>
                )}
              </div>
            ))}

            {tempImages.length < MAX_FILES && (
              <button 
                type="button"
                onClick={() => fileInputRef.current.click()}
                className="aspect-square rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-800 flex flex-col items-center justify-center text-gray-400 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50/50 transition-all group"
              >
                <Upload size={28} className="group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-black mt-2 uppercase tracking-tighter text-gray-500">Subir Fotos</span>
              </button>
            )}
          </div>

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            multiple 
            accept="image/png, image/jpeg, image/webp" 
            className="hidden" 
          />
<div className="flex gap-4 mt-8 justify-center w-full">
               <button onClick={onClose} className="w-1/3 bg-[#779ceb] py-4 rounded-2xl text-white font-bold shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-3">Cerrar</button>
               <button 
                 onClick={uploadToCloudinary}
                 disabled={isUploading}
                 className="w-1/3 bg-blue-600 py-4 rounded-2xl text-white font-bold shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-3"
               >
                 {isUploading ? <Loader2 className="animate-spin" /> : 'Subir'}
               </button>
            </div>
            </>
            )}
        </div>
      </div>
    </div>
  );
}

