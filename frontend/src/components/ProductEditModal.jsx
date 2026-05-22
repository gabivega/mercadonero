import React, { useState } from "react";
import { X } from "lucide-react";
import axios from "axios";
import Swal from "sweetalert2";
import ProductForm from "./ProductForm"; // Importás tu formulario dual
import { usePrivy } from "@privy-io/react-auth";

const ProductEditModal = ({ product, isOpen, onClose, onRefresh }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { getAccessToken } = usePrivy();
  if (!isOpen || !product) return null;

  // Esta función es la que va a ejecutar el formulario cuando le den al botón de guardar
  const handleUpdate = async (formData) => {
    setIsSubmitting(true);
    try {
      const token = await getAccessToken();
      const { data } = await axios.put(
        `${import.meta.env.VITE_SERVER_URL}/api/product/update/${product._id}`,
        formData, // Viaja el estado interno que modificó el vendedor dentro del formulario
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (data.success) {
        Swal.fire({
          title: "¡Actualizado!",
          text: "La publicación se modificó correctamente.",
          icon: "success",
          confirmButtonColor: "#F26722",
        });
        // onRefresh(); // Recarga la grilla del dashboard del vendedor
        onClose(); // Cierra el modal
      }
    } catch (error) {
      console.error(error);
      const errorMsg =
        error.response?.data?.message || "No se pudo actualizar el producto";
      Swal.fire("Error", errorMsg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-[2.5rem] shadow-2xl flex flex-col border border-zinc-200 dark:border-zinc-800">
        {/* HEADER */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-800/30">
          <div>
            <h2 className="text-xl font-black italic uppercase tracking-tighter">
              Editar Publicación
            </h2>
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mt-0.5">
              ID: {product._id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-zinc-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* SCROLLABLE FORM CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          {/* Renderizamos tu formulario pasándole la data inicial para que se precargue solo */}
          <ProductForm
            handleSubmit={handleUpdate}
            isSubmitting={isSubmitting}
            initialData={product}
          />
        </div>
      </div>
    </div>
  );
};

export default ProductEditModal;
