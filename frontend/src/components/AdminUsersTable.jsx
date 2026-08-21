import React, { useEffect, useState, useCallback } from 'react';
import {
  User as UserIcon,
  Eye,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from 'lucide-react';
import axios from 'axios';
import { usePrivy } from '@privy-io/react-auth';
import LoadingSpinner from './LoadingSpinner';
import AdminUserModal from './AdminUserModal';

/**
 * Panel de administración de usuarios.
 * Búsqueda server-side, ordenamiento por ventas/compras/registro y paginación.
 */
const AdminUsersTable = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { getAccessToken } = usePrivy();
  const LIMIT = 25;

  // Debounce del término de búsqueda (declarado antes de fetchUsers que lo usa)
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1); // volver a la primera página al buscar
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      const res = await axios.get(`${import.meta.env.VITE_SERVER_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { search: debouncedSearch, sort, order, page, limit: LIMIT },
      });
      const d = res.data;
      setUsers(d?.users || []);
      setTotal(d?.pagination?.total || 0);
      setTotalPages(d?.pagination?.totalPages || 1);
    } catch (err) {
      console.error(err);
      setError('No se pudieron cargar los usuarios.');
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, debouncedSearch, sort, order, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const toggleSort = (field) => {
    if (sort === field) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setOrder('desc');
    }
    setPage(1);
  };

  const SortHeader = ({ field, children }) => {
    const active = sort === field;
    return (
      <th className="p-6">
        <button
          onClick={() => toggleSort(field)}
          className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-zinc-400 hover:text-[#F26722] transition-colors"
        >
          {children}
          {active ? (
            order === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
          ) : (
            <ArrowUpDown size={12} className="opacity-40" />
          )}
        </button>
      </th>
    );
  };

  const handleOpenModal = (user) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
      {/* Header con búsqueda y contador */}
      <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black italic uppercase tracking-tighter">Usuarios</h2>
          <p className="text-sm text-zinc-500">Total: {total}</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por email, ID, nombre..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-[#F26722] dark:text-zinc-100"
          />
        </div>
      </div>

      {error && <p className="p-6 text-sm text-rose-500">{error}</p>}

      {loading ? (
        <div className="p-12">
          <LoadingSpinner size="lg" text="Cargando usuarios..." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/50">
                  <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">
                    Usuario
                  </th>
                  <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">
                    Email
                  </th>
                  <SortHeader field="sales">Ventas</SortHeader>
                  <SortHeader field="purchases">Compras</SortHeader>
                  <SortHeader field="username">Username</SortHeader>
                  <SortHeader field="createdAt">Registro</SortHeader>
                  <th className="p-6 text-[11px] font-black uppercase tracking-widest text-zinc-400">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-sm text-zinc-400">
                      No se encontraron usuarios.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user._id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    >
                      <td className="p-6">
                        <button
                          onClick={() => handleOpenModal(user)}
                          className="flex items-center gap-3 text-left group"
                        >
                          <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {user.avatar ? (
                              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <UserIcon size={18} className="text-zinc-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 group-hover:text-[#F26722] transition-colors">
                              {user.fullName || user.username || 'Sin nombre'}
                            </p>
                            <p className="text-xs text-zinc-500 font-mono">@{user.username || '—'}</p>
                          </div>
                        </button>
                      </td>
                      <td className="p-6 text-sm text-zinc-600 dark:text-zinc-400">{user.email}</td>
                      <td className="p-6 text-sm font-bold text-zinc-800 dark:text-zinc-200">
                        {user.totalSales ?? 0}
                      </td>
                      <td className="p-6 text-sm font-bold text-zinc-800 dark:text-zinc-200">
                        {user.totalPurchases ?? 0}
                      </td>
                      <td className="p-6 text-sm text-zinc-500">{user.username}</td>
                      <td className="p-6 text-sm text-zinc-500">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-6">
                        <button
                          onClick={() => handleOpenModal(user)}
                          className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-[#F26722] transition-colors"
                          title="Ver detalle"
                        >
                          <Eye size={18} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Paginación */}
      {!loading && totalPages > 1 && (
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            Página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-[#F26722] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-[#F26722] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      <AdminUserModal
        user={selectedUser}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
};

export default AdminUsersTable;
