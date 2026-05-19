import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';

const BankAccountsSection = ({ bankAccounts, getAccessToken, profile, setProfile, handleSaveProfile }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    bankName: '',
    accountType: 'Caja de Ahorros',
    holderName: '',
    cuitCuil: '',
    cbuCvu: '',
    alias: '',
    isDefault: false
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const validateBankData = () => {
    const errors = [];
    
    if (!formData.bankName.trim()) {
      errors.push('El nombre del banco es requerido');
    }
    if (!formData.holderName.trim()) {
      errors.push('El nombre del titular es requerido');
    }
    if (!formData.cuitCuil.trim()) {
      errors.push('El CUIT/CUIL es requerido');
    } else if (formData.cuitCuil.length < 10) {
      errors.push('CUIT/CUIL inválido (mínimo 10 caracteres)');
    }
    if (!formData.cbuCvu.trim()) {
      errors.push('El CBU/CVU es requerido');
    } else if (formData.cbuCvu.length !== 22) {
      errors.push('El CBU/CVU debe tener exactamente 22 dígitos');
    }
    if (!formData.alias.trim()) {
      errors.push('El alias es requerido');
    }
    
    if (errors.length > 0) {
      Swal.fire({
        icon: 'error',
        title: 'Error de validación',
        text: errors.join('\n'),
        confirmButtonColor: '#3b82f6',
      });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateBankData()) return;

    setLoading(true);
    try {
      const updatedAccounts = [...bankAccounts, formData];
      
      // Llamar a la función del padre para guardar en el backend con las cuentas actualizadas
      await handleSaveProfile({ bankAccounts: updatedAccounts });
      
      // Actualizar el estado local después de guardar exitosamente
      setProfile({ ...profile, bankAccounts: updatedAccounts });
      setIsAdding(false);
      setFormData({ bankName: '', accountType: 'Caja de Ahorros', holderName: '', cuitCuil: '', cbuCvu: '', alias: '', isDefault: false });
    } catch (error) {
      console.error("Error updating bank accounts:", error);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Error al guardar la cuenta bancaria',
        confirmButtonColor: '#3b82f6',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (index) => {
    const updatedAccounts = bankAccounts.filter((_, i) => i !== index);
    // Aquí llamarías a tu lógica de updateProfile similar al submit...
    setProfile({ ...profile, bankAccounts: updatedAccounts });
    // Fetch al back para persistir...
  };

  return (
    <div className="mt-8 bg-white dark:bg-[#1A1A1A] p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
      <div className="flex justify-between items-center mb-6 flex-col">
        <h3 className="text-xl font-bold dark:text-white">Cuentas Bancarias</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">Administra tus cuentas, donde recibirás tus pagos</p>
        {bankAccounts.length < 3 && !isAdding && (
          <button 
            onClick={() => setIsAdding(true)}
            className="px-4 py-2 bg-[#F26722] text-white rounded-xl font-bold uppercase text-xs tracking-widest hover:bg-[#e55a1d] transition-colors"
          >
            + Agregar Cuenta
          </button>
        )}
      </div>

      {/* Lista de Cuentas */}
      <div className="grid gap-4 mb-6">
        {bankAccounts.map((acc, index) => (
          <div key={index} className="flex justify-between items-center p-4 bg-gray-50 dark:bg-[#252525] rounded-2xl border border-gray-100 dark:border-gray-800">
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm dark:text-white truncate">{acc.bankName} - {acc.alias}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{acc.holderName} | {acc.cbuCvu}</p>
            </div>
            <button 
              onClick={() => handleDelete(index)} 
              className="ml-4 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              title="Eliminar cuenta"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {/* Formulario para agregar */}
      {isAdding && (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Banco</label>
            <input 
              name="bankName" 
              required 
              value={formData.bankName} 
              onChange={handleChange} 
              placeholder="Ej: Mercado Pago, Galicia..." 
              className="input-nero w-full" 
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Titular</label>
            <input 
              name="holderName" 
              required 
              value={formData.holderName} 
              onChange={handleChange} 
              placeholder="Nombre completo" 
              className="input-nero w-full" 
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">CUIT / CUIL</label>
            <input 
              name="cuitCuil" 
              required 
              value={formData.cuitCuil} 
              onChange={handleChange} 
              placeholder="Sin guiones" 
              className="input-nero w-full" 
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo de Cuenta</label>
            <select 
              name="accountType" 
              value={formData.accountType} 
              onChange={handleChange} 
              className="input-nero w-full"
            >
              <option value="Caja de Ahorros">Caja de Ahorros</option>
              <option value="Cuenta Corriente">Cuenta Corriente</option>
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">CBU / CVU (22 dígitos)</label>
            <input 
              name="cbuCvu" 
              required 
              value={formData.cbuCvu} 
              onChange={handleChange} 
              maxLength={22} 
              placeholder="00000031000..." 
              className="input-nero w-full" 
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Alias</label>
            <input 
              name="alias" 
              required 
              value={formData.alias} 
              onChange={handleChange} 
              placeholder="Ej: nero.vende.mp" 
              className="input-nero w-full" 
            />
          </div>

          <div className="flex gap-3 md:col-span-2 mt-4">
            <button 
              type="submit" 
              disabled={loading} 
              className="flex-1 bg-[#F26722] text-white font-bold py-4 rounded-2xl uppercase text-xs tracking-widest hover:bg-[#e55a1d] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Guardando...' : 'Guardar Cuenta'}
            </button>
            <button 
              type="button" 
              onClick={() => setIsAdding(false)} 
              className="flex-1 bg-gray-100 dark:bg-[#252525] text-gray-700 dark:text-gray-300 font-bold py-4 rounded-2xl uppercase text-xs tracking-widest hover:bg-gray-200 dark:hover:bg-[#333] transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default BankAccountsSection;