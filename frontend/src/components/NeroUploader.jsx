import { useState, useRef } from 'react';
import { X, Upload, Star, Trash2, Loader2, CheckCircle2, Image as ImageIcon } from 'lucide-react';

export default function NeroUploader({ 
  isOpen, 
  onClose, 
  onUploadComplete, 
  maxFiles = 5, 
  title = "Subir Imágenes",
  showMainSelection = true 
}) {
  const [tempImages, setTempImages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileSelect = (e) => {
    setError(null);
    const files = Array.from(e.target.files);
    const availableSlots = maxFiles - tempImages.length;
    
    if (availableSlots <= 0) {
      setError(`Límite alcanzado (${maxFiles} fotos).`);
      return;
    }

    const allowedFiles = files.slice(0, availableSlots);
    const newImages = allowedFiles.map((file, index) => ({
      file,
      preview: URL.createObjectURL(file),
      // Si maxFiles es 1, no hace falta lógica de main, pero por defecto la primera lo es
      isMain: tempImages.length === 0 && index === 0 
    }));

    setTempImages(prev => [...prev, ...newImages]);
    e.target.value = null; 
  };

  const removeImage = (index) => {
    setTempImages(prev => {
      const filtered = prev.filter((_, i) => i !== index);
      if (prev[index].isMain && filtered.length > 0) {
        filtered[0].isMain = true;
      }
      return filtered;
    });
  };

  const setMainImage = (index) => {
    if (!showMainSelection) return;
    setTempImages(prev => prev.map((img, i) => ({ ...img, isMain: i === index })));
  };

  const uploadToCloudinary = async () => {
    if (tempImages.length === 0) return;
    setIsUploading(true);
    const uploadedResults = [];

    try {
      for (const img of tempImages) {
        const formData = new FormData();
        formData.append('file', img.file);
        formData.append('upload_preset', 'mercadonero'); // Tu preset de Cloudinary

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/davo0f82p/image/upload`,
          { method: 'POST', body: formData }
        );
        const data = await response.json();
        // console.log("data de cloudniary", data)
        uploadedResults.push({
          url: data.secure_url,
          isMain: img.isMain
        });
      }

      onUploadComplete(maxFiles === 1 ? uploadedResults[0].url : uploadedResults); 
      setIsFinished(true);
      
    } catch (err) {
      setError("Error al conectar con el servidor de imágenes.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1A1A1A] w-full max-w-xl rounded-[32px] overflow-hidden border border-gray-200 dark:border-gray-800 shadow-2xl">
        
        <div className="p-8">
          {isFinished ? (
            <div className="py-6 text-center animate-in zoom-in duration-300">
              <div className="w-20 h-20 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={40} />
              </div>
              <h3 className="text-2xl font-black dark:text-white mb-2">¡Listo!</h3>
              <p className="text-gray-500 mb-8">La imagen se procesó correctamente.</p>
              <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-all">
                Continuar
              </button>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black dark:text-white uppercase text-centertracking-tight mx-auto">{title}</h3>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors text-gray-500">
                  <X size={20} />
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-bold flex items-center gap-2">
                  <X size={14} /> {error}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
                {tempImages.map((img, index) => (
                  <div key={img.preview} className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all ${img.isMain && maxFiles > 1 ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-transparent dark:border-gray-800'}`}>
                    <img src={img.preview} className="w-full h-full object-cover" alt="preview" />
                    
                    <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                      {maxFiles > 1 && showMainSelection && (
                        <button onClick={() => setMainImage(index)} className={`p-2 rounded-full ${img.isMain ? 'bg-blue-500' : 'bg-white text-gray-900'}`}>
                          <Star size={16} fill={img.isMain ? "white" : "none"} />
                        </button>
                      )}
                      <button onClick={() => removeImage(index)} className="p-2 bg-red-500 text-white rounded-full">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                {tempImages.length < maxFiles && (
                  <button 
                    onClick={() => fileInputRef.current.click()}
                    className="aspect-square col-start-2 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center text-gray-400 hover:border-blue-500 hover:bg-blue-500/5 transition-all"
                  >
                    <Upload size={24} />
                    <span className="text-[9px] font-black mt-2 uppercase">Añadir</span>
                  </button>
                )}
              </div>

              <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple={maxFiles > 1} accept="image/*" className="hidden" />

              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 py-4 rounded-2xl font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 transition-all">
                  Cancelar
                </button>
                <button 
                  onClick={uploadToCloudinary}
                  disabled={isUploading || tempImages.length === 0}
                  className="flex-[2] bg-blue-600 py-4 rounded-2xl text-white font-black shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUploading ? <Loader2 className="animate-spin" /> : 'CONFIRMAR CARGA'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}