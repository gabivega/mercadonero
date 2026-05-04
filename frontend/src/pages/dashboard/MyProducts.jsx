
export default function MyProducts() {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Mis Publicaciones</h2>
      <p className="text-gray-500">Gestiona los productos que tienes a la venta.</p>
      <table className="w-full text-left bg-white dark:bg-[#252525] rounded-xl overflow-hidden">
        <thead className="bg-gray-50 dark:bg-[#333] text-sm">
          <tr>
            <th className="p-4">Producto</th>
            <th className="p-4">Precio</th>
            <th className="p-4">Stock</th>
            <th className="p-4">Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="p-4 text-gray-400 italic" colSpan="4">No hay productos publicados.</td></tr>
        </tbody>
      </table>
    </div>
  );
}