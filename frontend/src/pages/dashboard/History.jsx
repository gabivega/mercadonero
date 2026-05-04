import React from 'react';
import { CircleDollarSign, Clock, CheckCircle2 } from 'lucide-react';

export default function History() {
  // Datos de ejemplo para visualizar la tabla
  const sales = [
    { id: '1', product: 'Termo Stanley', price: 50, date: '2024-03-01', status: 'Completed' },
    { id: '2', product: 'Mate Imperial', price: 35, date: '2024-03-05', status: 'Pending' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Historial de Ventas</h2>
        <div className="bg-green-100 dark:bg-green-900/20 text-green-600 px-4 py-2 rounded-lg flex items-center gap-2">
          <CircleDollarSign size={20} />
          <span className="font-semibold text-green-600">Total Vendido: $85.00</span>
        </div>
      </div>

      <div className="bg-white dark:bg-[#252525] rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden text-gray-900 dark:text-white">
        <table className="w-full text-left border-collapse text-gray-900 dark:text-white">
          <thead className="bg-gray-50 dark:bg-[#333] border-b border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white">
            <tr className="text-gray-900 dark:text-white">
              <th className="p-4 font-semibold text-gray-900 dark:text-white">Producto</th>
              <th className="p-4 font-semibold text-gray-900 dark:text-white">Fecha</th>
              <th className="p-4 font-semibold text-gray-900 dark:text-white">Monto</th>
              <th className="p-4 font-semibold text-gray-900 dark:text-white">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-900 dark:text-white">
            {sales.map((sale) => (
              <tr key={sale.id} className="hover:bg-gray-50 dark:hover:bg-[#2a2a2a] transition-colors text-gray-900 dark:text-white">
                <td className="p-4 font-medium text-gray-900 dark:text-white">{sale.sale}</td>
                <td className="p-4 text-gray-500 dark:text-gray-400 text-gray-900 dark:text-white">{sale.date}</td>
                <td className="p-4 font-bold text-gray-900 dark:text-white">${sale.price}</td>
                <td className="p-4 text-gray-900 dark:text-white">
                  <span className={`flex items-center gap-1 text-sm ${sale.status === 'Completed' ? 'text-green-500' : 'text-amber-500'}`}>
                    {sale.status === 'Completed' ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                    {sale.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}