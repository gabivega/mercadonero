import { useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import axios from "axios";

const BASE = `${import.meta.env.VITE_SERVER_URL}/api/pool`;

/**
 * usePools
 * ──────────────────────────────────────────────────────────────────────
 * Hook que encapsula las operaciones de Compra en Grupo (Social Selling)
 * contra el backend (`/api/pool`).
 *
 * Endpoints cubiertos:
 *   - GET    /api/pool/product/:productId   → pools de un producto (público)
 *   - GET    /api/pool/:id                  → detalle del pool (público)
 *   - GET    /api/pool?limit=n              → pools activos (Home, público)
 *   - POST   /api/pool/create               → crear pool (auth)
 *   - POST   /api/pool/:id/join             → unirse (auth)
 *   - DELETE /api/pool/:id/leave            → salir (auth)
 *   - PATCH  /api/pool/:id/cancel           → cancelar (auth)
 *
 * Convención (igual que useChat/useNotifications): getAccessToken() de Privy
 * + header `Authorization: Bearer <token>`.
 *
 * NOTA: las lecturas son PÚBLICAS (no requieren sesión) para que compartir
 * el link por WhatsApp funcione sin login. Las mutaciones sí requieren token.
 * ──────────────────────────────────────────────────────────────────────
 */
export const usePools = () => {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /** Headers con token (sólo cuando hay sesión). */
  const getAuthHeaders = useCallback(async () => {
    const token = await getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }, [getAccessToken]);

  /**
   * Pools de un producto. Público.
   * @param {string} productId
   * @param {{ all?: boolean, silent?: boolean }} [opts]
   */
  const fetchPoolsByProduct = useCallback(
    async (productId, { all = false, silent = false } = {}) => {
      if (!silent) setLoading(true);
      setError("");
      try {
        const { data } = await axios.get(`${BASE}/product/${productId}`, {
          params: all ? { all: 1 } : {},
        });
        return data.pools || [];
      } catch (e) {
        const msg =
          e?.response?.data?.message || "Error al cargar los grupos";
        setError(msg);
        return [];
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [],
  );

  /**
   * Detalle de un pool por id + productData poblado. Público.
   * Devuelve `{ pool, productData }` o null si no existe.
   */
  const fetchPoolById = useCallback(async (poolId, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const { data } = await axios.get(`${BASE}/${poolId}`);
      return { pool: data.pool, productData: data.productData };
    } catch (e) {
      const msg = e?.response?.data?.message || "Grupo no encontrado";
      setError(msg);
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  /**
   * Pools globales (Home / carousel / ComprasGrupales). Público.
   * @param {{ limit?: number, status?: string }} [opts]
   *   status: "open" (default) | "filled" | "expired" | "cancelled" | "all"
   */
  const fetchActivePools = useCallback(
    async ({ limit = 10, status = "open" } = {}) => {
      setError("");
      try {
        const { data } = await axios.get(BASE, {
          params: { limit, ...(status ? { status } : {}) },
        });
        return data.pools || [];
      } catch (e) {
        setError(e?.response?.data?.message || "Error al cargar los grupos");
        return [];
      }
    },
    [],
  );

  /**
   * Crea un pool para un producto. Requiere sesión.
   * @param {string} productId
   * @param {number} [units]  cantidad de unidades que pide el creador
   * @returns {Promise<object>} el pool creado (lanza si falla).
   */
  const createPool = useCallback(
    async (productId, units = 1) => {
      if (!ready || !authenticated) {
        throw new Error("Necesitás iniciar sesión para crear un grupo.");
      }
      const headers = await getAuthHeaders();
      try {
        const { data } = await axios.post(
          `${BASE}/create`,
          { productId, units },
          { headers },
        );
        return data.pool;
      } catch (e) {
        const msg = e?.response?.data?.message || "No se pudo crear el grupo";
        setError(msg);
        const err = new Error(msg);
        err.needsWallet = !!e?.response?.data?.needsWallet;
        // Saldo insuficiente: el backend NO creó nada (validación previa).
        err.insufficientUsdt = !!e?.response?.data?.insufficientUsdt;
        err.required = e?.response?.data?.required;
        err.balance = e?.response?.data?.balance;
        throw err;
      }
    },
    [ready, authenticated, getAuthHeaders],
  );

  /**
   * Une al usuario logueado a un pool. Requiere sesión.
   * @param {string} poolId
   * @param {number} [units]  cantidad de unidades a sumar
   * @returns {Promise<object>} el pool actualizado.
   */
  const joinPool = useCallback(
    async (poolId, units = 1) => {
      if (!ready || !authenticated) {
        throw new Error("Necesitás iniciar sesión para unirte a un grupo.");
      }
      const headers = await getAuthHeaders();
      try {
        const { data } = await axios.post(
          `${BASE}/${poolId}/join`,
          { units },
          { headers },
        );
        return data.pool;
      } catch (e) {
        const msg = e?.response?.data?.message || "No se pudo unir al grupo";
        setError(msg);
        const err = new Error(msg);
        err.needsWallet = !!e?.response?.data?.needsWallet;
        throw err;
      }
    },
    [ready, authenticated, getAuthHeaders],
  );

  /**
   * Prepara el fondeo on-chain del usuario en un pool: devuelve los datos
   * (groupId, contrato, token, monto a congelar, priceArs, rateAtLock) y
   * dispara el gas drip. El front luego firma createGroup/joinGroup.
   * @returns {Promise<object>} { funding, gas }
   */
  const preparePoolFunding = useCallback(
    async (poolId) => {
      const headers = await getAuthHeaders();
      try {
        const { data } = await axios.post(
          `${BASE}/${poolId}/prepare-funding`,
          {},
          { headers },
        );
        return data; // { success, funding, gas }
      } catch (e) {
        const msg =
          e?.response?.data?.message || "No se pudo preparar el fondeo";
        setError(msg);
        const err = new Error(msg);
        // Saldo insuficiente de USDT: adjuntamos datos para el aviso de recarga.
        err.insufficientUsdt = !!e?.response?.data?.insufficientUsdt;
        err.required = e?.response?.data?.required;
        err.balance = e?.response?.data?.balance;
        throw err;
      }
    },
    [getAuthHeaders],
  );

  /**
   * Confirma el fondeo on-chain tras la firma del comprador (verifica la tx
   * y reserva el stock en el backend).
   * @param {string} poolId
   * @param {string} txHash
   * @returns {Promise<object>} el pool actualizado
   */
  const confirmPoolFunding = useCallback(
    async (poolId, txHash) => {
      const headers = await getAuthHeaders();
      try {
        const { data } = await axios.post(
          `${BASE}/${poolId}/escrow/fund`,
          { txHash },
          { headers },
        );
        return data.pool;
      } catch (e) {
        const msg =
          e?.response?.data?.message || "No se pudo confirmar el fondeo";
        setError(msg);
        throw new Error(msg);
      }
    },
    [getAuthHeaders],
  );

  /**
   * Cierra el grupo on-chain y crea las órdenes (SOLO ADMIN).
   * @param {string} poolId
   */
  const closePool = useCallback(
    async (poolId) => {
      const headers = await getAuthHeaders();
      try {
        const { data } = await axios.post(
          `${BASE}/${poolId}/close`,
          {},
          { headers },
        );
        return data;
      } catch (e) {
        const msg = e?.response?.data?.message || "No se pudo cerrar el grupo";
        setError(msg);
        throw new Error(msg);
      }
    },
    [getAuthHeaders],
  );

  /**
   * Libera la porción del comprador logueado (confirmó la recepción).
   * @param {string} poolId
   */
  const releasePoolMember = useCallback(
    async (poolId) => {
      const headers = await getAuthHeaders();
      try {
        const { data } = await axios.post(
          `${BASE}/${poolId}/release-member`,
          {},
          { headers },
        );
        return data.pool;
      } catch (e) {
        const msg =
          e?.response?.data?.message || "No se pudo liberar tu porción";
        setError(msg);
        throw new Error(msg);
      }
    },
    [getAuthHeaders],
  );

  /** Sale de un pool (mientras esté abierto). Requiere sesión. */
  const leavePool = useCallback(
    async (poolId) => {
      const headers = await getAuthHeaders();
      try {
        const { data } = await axios.delete(`${BASE}/${poolId}/leave`, {
          headers,
        });
        return data.pool;
      } catch (e) {
        const msg = e?.response?.data?.message || "No se pudo salir del grupo";
        setError(msg);
        throw new Error(msg);
      }
    },
    [getAuthHeaders],
  );

  /**
   * ROLLBACK de un pool PROVISIONAL (creación sin fondeo completado).
   * El backend lo borra si el creador está solo y no hay fondeo on-chain;
   * si ya hay otros miembros o fondeo, lo marca "cancelled".
   * Best-effort: no lanza (se usa en el cleanup).
   */
  const rollbackPool = useCallback(
    async (poolId) => {
      try {
        const headers = await getAuthHeaders();
        const { data } = await axios.delete(`${BASE}/${poolId}/rollback`, {
          headers,
        });
        return data;
      } catch (e) {
        console.error("No se pudo hacer rollback del grupo:", e?.message);
        return null;
      }
    },
    [getAuthHeaders],
  );

  /** Cancela un pool (sólo el creador). Requiere sesión. */
  const cancelPool = useCallback(
    async (poolId) => {
      const headers = await getAuthHeaders();
      try {
        const { data } = await axios.patch(
          `${BASE}/${poolId}/cancel`,
          {},
          { headers },
        );
        return data.pool;
      } catch (e) {
        const msg = e?.response?.data?.message || "No se pudo cancelar el grupo";
        setError(msg);
        throw new Error(msg);
      }
    },
    [getAuthHeaders],
  );

  /**
   * Grupos de los productos del VENDEDOR logueado. Requiere sesión.
   * @param {{ status?: "open"|"filled"|"all", silent?: boolean }} [opts]
   */
  const fetchSellerPools = useCallback(
    async ({ status = "open", silent = false } = {}) => {
      if (!silent) setLoading(true);
      setError("");
      try {
        const headers = await getAuthHeaders();
        const { data } = await axios.get(`${BASE}/seller`, {
          params: { status },
          headers,
        });
        return data.pools || [];
      } catch (e) {
        setError(e?.response?.data?.message || "Error al cargar tus grupos");
        return [];
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [getAuthHeaders],
  );

  /**
   * Grupos en los que PARTICIPA el COMPRADOR logueado (creador o miembro).
   * Requiere sesión.
   * @param {{ status?: "open"|"filled"|"all", silent?: boolean }} [opts]
   */
  const fetchMyPools = useCallback(
    async ({ status = "open", silent = false } = {}) => {
      if (!silent) setLoading(true);
      setError("");
      try {
        const headers = await getAuthHeaders();
        const { data } = await axios.get(`${BASE}/mine`, {
          params: { status },
          headers,
        });
        return data.pools || [];
      } catch (e) {
        setError(e?.response?.data?.message || "Error al cargar tus grupos");
        return [];
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [getAuthHeaders],
  );

  return {
    loading,
    error,
    setError,
    fetchPoolsByProduct,
    fetchPoolById,
    fetchActivePools,
    fetchSellerPools,
    fetchMyPools,
    createPool,
    joinPool,
    leavePool,
    cancelPool,
    rollbackPool,
    preparePoolFunding,
    confirmPoolFunding,
    closePool,
    releasePoolMember,
  };
};

export default usePools;
