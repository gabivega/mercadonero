import React, { useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import axios from "axios";
import Swal from "sweetalert2";
import LoadingSpinner from "./LoadingSpinner";

export const AddressSection = ({ 
  addresses = [], 
  getAccessToken, 
  setAddresses, // 👈 Ahora recibe la acción de Zustand
  handleSelectAddress, 
  selectedAddress 
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [newAddress, setNewAddress] = useState({
    addressType: "home",
    street: "",
    streetNumber: "",
    apartment: "",
    floor: "",
    city: "",
    province: "",
    zipCode: "",
    isDefault: false,
  });

  const PROVINCIAS_AR = [
    "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba",
    "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja",
    "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan",
    "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero",
    "Tierra del Fuego", "Tucumán"
  ];

  const saveAddress = async () => {
    const errors = [];
    if (!newAddress.addressType) errors.push("Tipo de dirección");
    if (!newAddress.street) errors.push("Calle");
    if (!newAddress.city) errors.push("Ciudad");
    if (!newAddress.province) errors.push("Provincia");
    if (!newAddress.zipCode) errors.push("Código postal");
    
    if (errors.length > 0) {
      return Swal.fire({
        title: 'Campos incompletos',
        text: `Por favor, completá los siguientes campos: ${errors.join(', ')}.`,
        icon: 'warning',
        background: '#1A1A1A',
        color: '#fff',
        confirmButtonColor: '#2563eb',
        borderRadius: '24px'
      });
    }

    setIsLoading(true);
    try {
      const token = await getAccessToken();
      const response = await axios.post(
        `${import.meta.env.VITE_SERVER_URL}/api/user/new-address`,
        newAddress,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log("response: ", response);
      console.log("response.data: ", response.data);
      if (response.data.success || response.data.addresses) {
        Swal.fire({
          title: '¡Dirección Guardada!',
          text: 'Tu nueva ubicación se añadió correctamente.',
          icon: 'success',
          background: '#1A1A1A',
          color: '#fff',
          confirmButtonColor: '#2563eb',
          timer: 2000,
          timerProgressBar: true
        });

        // 💡 Actualizamos el Store Global
        setAddresses(response.data.addresses);

        setNewAddress({
          addressType: "home",
          street: "",
          streetNumber: "",
          apartment: "",
          floor: "",
          city: "",
          province: "",
          zipCode: "",
          isDefault: false,
        });
        setIsAdding(false);
      }
    } catch (error) {
      Swal.fire('Error', 'No se pudo guardar la dirección', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (addressId) => {
    const result = await Swal.fire({
      title: '¿Eliminar dirección?',
      text: "Esta acción no se puede deshacer.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#374151',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      background: '#1A1A1A',
      color: '#fff',
      borderRadius: '20px'
    });

    if (result.isConfirmed) {
      setIsLoading(true);
      try {
        const token = await getAccessToken();
        const response = await axios.delete(
          `${import.meta.env.VITE_SERVER_URL}/api/user/address/${addressId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data.success || response.data.addresses) {
          // 💡 Actualizamos el Store Global
          setAddresses(response.data.addresses);
          if (selectedAddress?._id === addressId) {
          handleSelectAddress?.(null);
        }
          Swal.fire({
            title: 'Dirección Eliminada',
            icon: 'success',
            timer: 1500,
            showConfirmButton: false,
            background: '#1A1A1A',
            color: '#fff'
          });
        }
      } catch (error) {
        Swal.fire('Error', 'No se pudo eliminar la dirección', 'error');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="mt-10 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-black text-[11px] uppercase tracking-widest text-gray-400 flex items-center gap-2">
          <MapPin size={16} /> Mis Direcciones de Envío
        </h4>
        <button
          onClick={() => {
            if (addresses.length >= 3) {
              return Swal.fire({
                title: 'Límite alcanzado',
                text: 'Solo podés tener hasta 3 direcciones guardadas.',
                icon: 'info',
                background: '#1A1A1A',
                color: '#fff',
                confirmButtonColor: '#2563eb'
              });
            }
            setIsAdding(!isAdding);
          }}
          className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700 transition-colors"
        >
          {isAdding ? "CANCELAR" : <><Plus size={14} /> AGREGAR NUEVA</>}
        </button>
      </div>

      {/* FORMULARIO EXPANDIBLE */}
      <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isAdding ? "max-h-[1200px] md:max-h-[700px] opacity-100 mb-6" : "max-h-0 opacity-0 pointer-events-none"}`}>
        <div className="p-4 sm:p-6 bg-blue-50/50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 rounded-[24px] space-y-4">
          <div className="space-y-2 w-full">
            <span className="text-[13px] sm:text-[14px] font-bold text-gray-400">Tipo de Dirección *</span>
            <select
              className="input-nero w-full"
              value={newAddress.addressType}
              onChange={(e) => setNewAddress({ ...newAddress, addressType: e.target.value })}
            >
              <option value="home">Casa</option>
              <option value="work">Trabajo</option>
              <option value="other">Otro</option>
            </select>
          </div>

          <div className="grid grid-cols-12 gap-3 sm:gap-4">
            <div className="col-span-12 md:col-span-8">
              <input
                placeholder="Calle *"
                className="input-nero w-full"
                value={newAddress.street}
                onChange={(e) => setNewAddress({ ...newAddress, street: e.target.value })}
              />
            </div>

                        <div className="col-span-6 md:col-span-4">
              <input
                placeholder="Número"
                inputMode="numeric"
                maxLength={6}
                className="input-nero w-full"
                value={newAddress.streetNumber}
                onChange={(e) => setNewAddress({ ...newAddress, streetNumber: e.target.value.replace(/\D/g, "").slice(0, 6) })}
              />
            </div>

            <div className="col-span-6 md:col-span-4">
              <input
                placeholder="Piso"
                inputMode="numeric"
                maxLength={3}
                className="input-nero w-full"
                value={newAddress.floor}
                onChange={(e) => setNewAddress({ ...newAddress, floor: e.target.value.replace(/\D/g, "").slice(0, 3) })}
              />
            </div>

            <div className="col-span-6 md:col-span-4">
              <input
                placeholder="Dpto"
                maxLength={6}
                className="input-nero w-full"
                value={newAddress.apartment}
                onChange={(e) => setNewAddress({ ...newAddress, apartment: e.target.value.replace(/[^a-zA-Z0-9\-]/, "").slice(0, 6) })}
              />
            </div>

            <div className="col-span-6 md:col-span-4">
              <input
                placeholder="Código Postal *"
                inputMode="numeric"
                maxLength={4}
                className="input-nero w-full"
                value={newAddress.zipCode}
                onChange={(e) => setNewAddress({ ...newAddress, zipCode: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              />
            </div>

            <div className="col-span-12 md:col-span-6">
              <select
                className="input-nero w-full"
                value={newAddress.province}
                onChange={(e) => setNewAddress({ ...newAddress, province: e.target.value })}
              >
                <option value="">Provincia *</option>
                {PROVINCIAS_AR.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div className="col-span-12 md:col-span-6">
              <input
                placeholder="Ciudad/Partido *"
                className="input-nero w-full"
                value={newAddress.city}
                onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
              />
            </div>
          </div>

          <label className="flex items-center gap-3 px-1 py-1 cursor-pointer group select-none">
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={newAddress.isDefault}
              onChange={(e) => setNewAddress({ ...newAddress, isDefault: e.target.checked })}
            />
            <span className="text-[10px] font-black uppercase text-gray-500 group-hover:text-blue-600">
              Establecer como dirección principal
            </span>
          </label>

          <button
            onClick={saveAddress}
            disabled={isLoading}
            className="w-full py-3.5 sm:py-4 bg-blue-600 text-white font-black text-xs rounded-2xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
          >
            {isLoading ? <LoadingSpinner size="sm" /> : "GUARDAR DIRECCIÓN"}
          </button>
        </div>
      </div>

      {/* LISTADO DE DIRECCIONES */}
      <div className="space-y-3">
        {addresses.map((addr) => {
          const isSelected = selectedAddress?._id === addr._id;
          return (
            <div
              key={addr._id}
              className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white dark:bg-[#1A1A1A] border-2 rounded-2xl group cursor-pointer transition-all ${
                isSelected ? 'border-blue-500 shadow-md shadow-blue-500/20' : 'border-gray-100 dark:border-gray-800'
              }`}
              onClick={() => handleSelectAddress?.(addr)}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg text-gray-400">
                  <MapPin size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold dark:text-white truncate">
                    {addr.street} {addr.streetNumber ? `N° ${addr.streetNumber}` : ''}
                  </p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {addr.city}, {addr.province} (CP {addr.zipCode})
                  </p>
                </div>
              </div>
              
              <div className="flex items-center justify-end gap-2 mt-2 sm:mt-0">
                {addr.isDefault && (
                  <span className="text-[10px] font-black uppercase text-blue-600">
                    Principal
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(addr._id);
                  }}
                  className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};