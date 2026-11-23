import React, { useState, useEffect, useCallback } from "react";
import { X, Loader2 } from "lucide-react";
import axios from "axios";
import Swal from "sweetalert2";
import ProductForm from "./ProductForm"; // Importás tu formulario dual
import { usePrivy } from "../Utils/authClient";

// ════════════════════════════════════════════════════════════════════════════
// MODAL DE EDICIÓN de una publicación ya cargada.
//
// POR QUÉ PIDE EL PRODUCTO DE NUEVO AL BACKEND (no reusa el del listado):
//
//   `GET /api/product/my-products` proyecta "-description -specifications"
//   A PROPÓSITO, para que el listado del panel no traiga 100 descripciones
//   completas (payload gigante). Consecuencia: el objeto que llega por props
//   NO tiene `description`.
//
//   Como el textarea de descripción es `required`, el navegador bloqueaba el
//   submit con "campo vacío" aunque el producto SÍ tuviera descripción en la
//   base. El bug NO era del formulario: era del origen de los datos.
//
//   Solución: al abrir el modal pedimos `GET /api/product/my-products/:id`,
//   que devuelve el documento completo (solo al dueño). Mientras carga NO
//   montamos el formulario: si lo mostráramos vacío, el usuario podría
//   empezar a tipear y perder lo escrito al llegar los datos.
// ════════════════════════════════════════════════════════════════════════════
const ProductEditModal = ({ product, isOpen, onClose, onRefresh }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [fullProduct, setFullProduct] = useState(null);
  const { getAccessToken } = usePrivy();

  const productId = product?._id;

  // Traemos el detalle COMPLETO cada vez que se abre el modal con otro producto.
  const loadFullProduct = useCallback(async () => {
    if (!isOpen || !productId) return;
    setIsLoading(true);
    setFullProduct(null);
    try {
      const token = await getAccessToken();
      const { data } = await axios.get(
        `${import.meta.env.VITE_SERVER_URL}/api/product/my-products/${productId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (data.success && data.product) {
        setFullProduct(data.product);
      } else {
        throw new Error("Respuesta inválida del servidor");
      }
    } catch (error) {
      const msg =
        error.response?.data?.message ||
        "No se pudo cargar la publicación para editar.";
      Swal.fire("Error", msg, "error");
      onClose?.();
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, productId, getAccessToken, onClose]);

  useEffect(() => {
    loadFullProduct();
  }, [loadFullProduct]);

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
          {isLoading ? (
            // No montamos el formulario hasta tener los datos completos.
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-zinc-400">
              <Loader2 className="animate-spin text-[#F26722]" size={28} />
              <p className="text-sm font-medium">Cargando publicación...</p>
            </div>
          ) : fullProduct ? (
            // `key` fuerza remount si se edita otro producto seguido: evita que
            // ProductForm arrastre el estado del producto anterior.
            <ProductForm
              key={fullProduct._id}
              handleSubmit={handleUpdate}
              isSubmitting={isSubmitting}
              initialData={fullProduct}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ProductEditModal;
