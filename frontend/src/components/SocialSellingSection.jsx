import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePrivy, useWallets } from "../Utils/authClient";
import { Users, Clock } from "lucide-react";
import SocialPoolCard from "./SocialPoolCard";
import CreatePoolModal from "./CreatePoolModal";
import AuthOnboarding from "./AuthOnboarding";
import { usePools } from "../Utils/usePools";
import { useUserStore } from "../store/useUserStore";
import { useSyncUser } from "../Utils/userSync";
import { formatMoney } from "../Utils/currencyFormatter";
import { showCopiedToast } from "../Utils/copiedToast";
import { poolSuccessSwal, poolErrorSwal } from "../Utils/poolSwal";
import CryptoPaymentModal from "./CryptoPaymentModal";
import WalletRequiredNotice from "./WalletRequiredNotice";
import { polygonAmoy } from "viem/chains";
import { SOCIAL_SELLING_ENABLED } from "../Utils/featureFlags";

// Redes firmables con la smart wallet Crossmint (BSC no está soportada aún).
// El pago del escrow del grupo se hace en la primera red sendable disponible.
const SIGNING_CHAIN_ID = polygonAmoy.id; // default; Base Sepolia también sirve

const ACCENT = "#F26722";

/**
 * SocialSellingSection
 * Bloque de Compra en Grupo para el ProductDetail (ancho completo).
 * Muestra: escala de precios, CTA para crear grupo y listado de pools activos.
 *
 * Datos reales vía `usePools` (backend `/api/pool`).
 *
 * @param {object} product           producto completo
 * @param {string} [currentUserId]   id del user logueado (para "mi pool")
 */
export default function SocialSellingSection({ product, currentUserId }) {
  const navigate = useNavigate();
  const ss = product?.socialSelling;

  const { login, authenticated, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const { fetchPoolsByProduct, createGroupOrder } = usePools();

  const { dbUser, setDbUser } = useUserStore();
  const { syncUser } = useSyncUser(setDbUser);

  const [pools, setPools] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  // Orden crypto PROVISIONAL del member tras create/join, que se fondea con
  // el MISMO CryptoPaymentModal de las compras individuales (escrow NeroEscrow).
  const [pendingOrder, setPendingOrder] = useState(null);
  // Acción a ejecutar tras fondear OK (refresh + mensaje de éxito).
  const [afterFund, setAfterFund] = useState(null);
  const [poolIdBeingFunded, setPoolIdBeingFunded] = useState(null);

  // Onboarding (datos básicos) exigido antes de crear/unirse a un grupo.
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  // Aviso + CTA de "crear billetera" (obligatoria para el escrow).
  const [walletNoticeOpen, setWalletNoticeOpen] = useState(false);
  // Acción pendiente a ejecutar después del onboarding/wallet.
  const pendingAction = useRef(null);

  // ¿Ya completó los datos básicos obligatorios?
  const hasProfileData = Boolean(
    dbUser?.profileCompleted ||
      (dbUser?.firstName &&
        dbUser?.lastName &&
        dbUser?.dni &&
        dbUser?.phone),
  );

  // ¿Tiene billetera Web3? Sin ella no se puede fondear el escrow (USDT).
  const hasWallet = Boolean(dbUser?.walletAddress || wallets?.[0]?.address);

  // Ejecuta (o encola, si falta onboarding/wallet) una acción que requiere sesión.
  const requireAuthAndProfile = (action) => {
    if (!authenticated) {
      login();
      return;
    }
    if (!hasProfileData) {
      pendingAction.current = action;
      setOnboardingOpen(true);
      return;
    }
    if (!hasWallet) {
      // La acción quedará pendiente hasta que cree la wallet.
      pendingAction.current = action;
      setWalletNoticeOpen(true);
      return;
    }
    action();
  };

  const runPendingAction = () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action) action();
  };

  /**
   * Espera a que la wallet recién creada aparezca en el objeto de Privy
   * (linkedAccounts / wallets), re-sincronizando el usuario. Hasta ~3s.
   */
  const waitForWalletThenSync = async () => {
    // Esperamos a que useWallets refleje la billetera recién creada (hasta ~3s).
    for (let i = 0; i < 6; i++) {
      if (wallets?.[0]?.address) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    await syncUser();
  };

  const handleOnboardingComplete = async () => {
    setOnboardingOpen(false);
    // Re-sincronizamos el usuario (trae profileCompleted=true al store).
    await syncUser();
    // Tras el onboarding puede faltar la wallet: re-evaluamos.
    if (hasWallet) {
      runPendingAction();
    } else {
      setWalletNoticeOpen(true);
    }
  };

  const handleWalletCreated = async () => {
    setWalletNoticeOpen(false);
    // Privy puede tardar unos ms en reflejar la wallet recién creada.
    // Reintentamos el sync unas cuantas veces antes de seguir.
    await waitForWalletThenSync();
    runPendingAction();
  };

  // ── Carga inicial / al cambiar de producto ────────────────────────
  useEffect(() => {
    let alive = true;
    if (!product?._id) return;
    setIsLoading(true);
    fetchPoolsByProduct(product._id).then((list) => {
      if (alive) {
        setPools(list);
        setIsLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [product?._id, fetchPoolsByProduct]);

  // Refresca el listado desde el backend (fuente de verdad).
  const refresh = async () => {
    const list = await fetchPoolsByProduct(product._id);
    setPools(list);
    return list;
  };

  const openPools = useMemo(
    () => pools.filter((p) => p.status === "open"),
    [pools],
  );

  const myPool = useMemo(
    () =>
      pools.find(
        (p) =>
          p.status === "open" &&
          p.members?.some((m) => m._id === currentUserId),
      ),
    [pools, currentUserId],
  );

  const otherPools = useMemo(
    () =>
      // Ordenamos de MÁS LLENO a MÁS VACÍO: los que están por completarse
      // primero, para generar más urgencia. Desempate: los que expiran antes.
      [...openPools]
        .filter((p) => p._id !== myPool?._id)
        .sort((a, b) => {
          const filledA = a.members?.length || 0;
          const filledB = b.members?.length || 0;
          if (filledB !== filledA) return filledB - filledA;
          return new Date(a.expiresAt) - new Date(b.expiresAt);
        }),
    [openPools, myPool],
  );

  const duration = ss?.durationHours || 24;

  // ── Handlers (backend) ────────────────────────────────────────────
  const openCreateModal = () => requireAuthAndProfile(() => setIsModalOpen(true));

  /**
   * Abre el CryptoPaymentModal para fondear la orden provisional del member.
   * El modal (Crossmint) hace approve + fundOrder sobre el NeroEscrow común y,
   * al confirmar, avisa al backend (/api/order/:id/escrow/fund). Si se cierra
   * sin fondear, el propio modal hace rollback de la orden (autoRollbackOnClose).
   */
  const openFundingModal = ({ order, onFunded }) => {
    if (!order?._id) {
      poolErrorSwal({
        title: "No se pudo iniciar el pago",
        text: "No se generó la orden de pago del grupo. Reintentá.",
      });
      return;
    }
    setPendingOrder({ order });
    setAfterFund(() => onFunded);
  };

  // El usuario cerró el modal SIN fondear. El CryptoPaymentModal ya revierte
  // la orden provisional (autoRollbackOnClose). Como el Pool todavía NO existe
  // (se crea recién al fondear), no hay nada más que limpiar.
  const closeFundingModal = () => {
    setPendingOrder(null);
    setAfterFund(null);
  };

  const handleFundingSuccess = async () => {
    const cb = afterFund;
    closeFundingModal();
    try {
      await refresh();
    } catch {
      /* noop */
    }
    if (cb) await cb();
  };

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      // 1. Crear SOLO la orden crypto del grupo (el Pool nace al fondear).
      const { order } = await createGroupOrder({
        createPool: { productId: product._id, units: 1 },
        units: 1,
        sellerId: product.seller?._id || product.seller,
        chainId: SIGNING_CHAIN_ID,
        shippingAddress: {},
      });
      setIsModalOpen(false);

      // 2. Fondear con el modal multichain normal (selector de token).
      openFundingModal({
        order,
        onFunded: async () => {
          // Tras fondear, refrescamos la lista; el grupo ya existe.
          await refresh().catch(() => {});
          const createdPool = (await fetchPoolsByProduct(product._id)).find(
            (p) => p.members?.some((m) => m._id === currentUserId),
          );
          const poolIdForLink = createdPool?._id;
          const link = poolIdForLink
            ? `${window.location.origin}/pool/${poolIdForLink}`
            : window.location.origin;
          const copied = await poolSuccessSwal({
            title: "¡Felicitaciones!",
            html: `
              <p>Creaste tu grupo de compra y <b>tu pago quedó en garantía</b>.</p>
              <p style="margin-top:8px">
                <b>Invitá más gente</b> para desbloquear descuentos. Si el grupo no
                se completa, se te reintegra.
              </p>
            `,
            confirmText: "Compartir enlace",
            linkToCopy: link,
          });
          if (copied) showCopiedToast("Enlace del grupo copiado");
        },
      });
    } catch (e) {
      // No hay pool que revertir: sólo existía la orden provisional, que el
      // CryptoPaymentModal descarta al cerrarse sin fondear.
      if (e?.needsWallet) {
        pendingAction.current = () => handleCreate();
        setWalletNoticeOpen(true);
      } else {
        poolErrorSwal({
          title: "No se pudo crear el grupo",
          text: e?.message || "",
        });
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = (pool) => requireAuthAndProfile(() => doJoin(pool));

  const doJoin = async (pool) => {
    const prevPrice = pool.currentUnitPrice;
    setJoiningId(pool._id);
    try {
      // 1. Crear SOLO mi orden crypto de grupo (me sumo recién al fondear).
      const { order } = await createGroupOrder({
        joinPoolId: pool._id,
        units: 1,
        sellerId: pool.seller?._id || pool.seller,
        chainId: SIGNING_CHAIN_ID,
        shippingAddress: {},
      });

      // 2. Fondear mi orden con el modal multichain (Crossmint).
      openFundingModal({
        order,
        onFunded: async () => {
          await refresh().catch(() => {});
          const joined = (await fetchPoolsByProduct(product._id)).find(
            (p) => p._id === pool._id,
          );
          const newPrice = joined?.currentUnitPrice ?? pool.currentUnitPrice;
          const lower = prevPrice && newPrice && newPrice < prevPrice;
          const link = `${window.location.origin}/pool/${pool._id}`;
          const copied = await poolSuccessSwal({
            title: "¡Felicitaciones!",
            html: `
              <p>Te uniste al grupo y <b>tu pago quedó en garantía</b>.</p>
              ${
                lower
                  ? `<p style="margin-top:8px">
                       Bajaste el precio de <b>${formatMoney(prevPrice)}</b> a
                       <b style="color:${ACCENT}">${formatMoney(newPrice)}</b>.
                     </p>`
                  : newPrice
                    ? `<p style="margin-top:8px">
                         El precio actual del grupo es
                         <b style="color:${ACCENT}">${formatMoney(newPrice)}</b>.
                       </p>`
                    : ""
              }
              <p style="margin-top:12px">
                <b>Comparte con tus amigos</b> para bajar aún más el precio.
              </p>
            `,
            confirmText: "Copiar enlace",
            linkToCopy: link,
          });
          if (copied) showCopiedToast("Enlace del grupo copiado");
        },
      });
    } catch (e) {
      // No hay join que revertir: el member se agrega recién al fondear, y si
      // se cierra el modal sin pagar, el CryptoPaymentModal revierte la orden.
      if (e?.needsWallet) {
        pendingAction.current = () => doJoin(pool);
        setWalletNoticeOpen(true);
      } else {
        poolErrorSwal({
          title: "No te pudiste unir",
          text: e?.message || "",
        });
      }
    } finally {
      setJoiningId(null);
    }
  };

  const handleShare = (pool) => {
    const link = `${window.location.origin}/pool/${pool._id}`;
    navigator.clipboard
      ?.writeText(link)
      .then(() => showCopiedToast("Compartí el enlace para sumar compradores"))
      .catch(() => {});
  };

  const handleOpen = (pool) => {
    navigate(`/pool/${pool._id}`);
  };

  // Feature flag: Social Selling apagado para el lanzamiento.
  if (!SOCIAL_SELLING_ENABLED) return null;
  if (!ss?.enabled) return null;

  return (
    <section
      id="social-selling"
      className="rounded-3xl border p-6 md:p-8 scroll-mt-24"
      style={{ borderColor: `${ACCENT}33`, backgroundColor: `${ACCENT}08` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <span
            className="p-3 rounded-2xl shrink-0 hidden md:block"
            style={{ backgroundColor: `${ACCENT}1a` }}
          >
            <Users size={22} style={{ color: ACCENT }} />
          </span>
          <div>
            <h2 className="text-xl font-black dark:text-white leading-tight flex items-center gap-2">
              Comprá en Grupo y ahorrá hasta <span style={{ color: ACCENT }}>${formatMoney(product.price - (ss?.tiers?.[5] || 0))}</span>
              {/* <Sparkles size={16} style={{ color: ACCENT }} /> */}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Sumá compradores para bajar el precio entre todos. Hasta 5 personas
              · {duration} hs para completarse.
            </p>
          </div>
        </div>
        
      </div>
        {/* ── Escala de precios + CTA crear grupo ── */}
        {ss?.tiers && (
          <div className="rounded-2xl bg-white dark:bg-[#161616] border border-gray-100 dark:border-gray-800 p-4 md:p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              {/* Escala: en desktop todo en una fila; en mobile grid 2x2 */}
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest mb-2">
                  Escala de precios por cantidad
                </p>
                <div className="grid grid-cols-2 md:flex md:items-center gap-2">
                  {[2, 3, 4, 5].map((n) => (
                    <div
                      key={n}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-1.5"
                    >
                      <Users size={12} className="text-gray-400 shrink-0" />
                      <span className="text-xs text-gray-500 font-bold">
                        {n}
                      </span>
                      <span className="text-sm font-black dark:text-white">
                        {ss.tiers[n] ? formatMoney(ss.tiers[n]) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
            </div>

              {/* CTA crear grupo / estado "ya estás en un grupo" */}
              <div className="md:w-auto shrink-0">
                {!myPool && (
                  <button
                    onClick={openCreateModal}
                    className="w-full md:w-auto flex items-center justify-center px-6 py-3 rounded-2xl text-sm font-black text-white transition-all hover:brightness-95 shadow-lg whitespace-nowrap"
                    style={{
                      backgroundColor: ACCENT,
                      boxShadow: `${ACCENT}33 0 8px 20px`,
                    }}
                  >
                    Crear grupo
                  </button>
                )}
              </div>
            </div>

            {/* Nota de escrow */}
            {/* <div className="flex items-start gap-2 text-[11px] text-gray-500 mt-4">
              <ShieldCheck
                size={14}
                className="shrink-0 mt-0.5"
                style={{ color: ACCENT }}
              />
              <p>
                Tu pago se congela en un contrato inteligente hasta que el
                grupo cierre.
              </p>
            </div> */}
          </div>
        )}

      {/* Layout en una sola columna: listado primero, luego escala + CTA */}
      <div className="space-y-6">
        {/* ── Listado de pools PRIMERO (para no crear uno si ya hay activos) ── */}
        {(myPool || otherPools.length > 0 || isLoading) && (
          <div>
            {/* Mi pool */}
            {myPool && (
              <div className="my-2">
                <p
                  className="text-[11px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5"
                  style={{ color: ACCENT }}
                >
                  <Clock size={13} /> Tu grupo
                </p>
                <SocialPoolCard
                  pool={myPool}
                  onJoin={handleJoin}
                  onShare={handleShare}
                  isJoining={joiningId === myPool._id}
                  currentUserId={currentUserId}
                />
              </div>
            )}

            {isLoading ? (
              <div className="text-center py-10 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
                <p className="text-sm text-gray-500">Cargando grupos...</p>
              </div>
            ) : otherPools.length > 0 ? (
              <>
                {/* Título: si tengo mi propio grupo, los demás son "otros" */}
                <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 my-2">
                  {myPool
                    ? `Otros grupos activos (${otherPools.length})`
                    : `Grupos activos (${otherPools.length})`}
                </p>
                <div className="space-y-3">
                  {otherPools.map((pool) => (
                    <SocialPoolCard
                      key={pool._id}
                      pool={pool}
                      onJoin={handleJoin}
                      onOpen={handleOpen}
                      onShare={handleShare}
                      isJoining={joiningId === pool._id}
                      currentUserId={currentUserId}
                    />
                  ))}
                </div>
              </>
            ) : myPool ? (
              // Tengo mi grupo y no hay otros: no mostramos un listado vacío.
              <div className="text-center py-6 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
                <p className="text-sm text-gray-500">
                  Tu grupo es el único activo por ahora.
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Compartí el enlace para que más gente se sume y baje el
                  precio.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Modal */}
      <CreatePoolModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleCreate}
        isCreating={isCreating}
        product={product}
        socialSelling={ss}
      />

      {/* Onboarding (datos básicos) para crear/unirse a un grupo */}
      {onboardingOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm overflow-y-auto">
          <AuthOnboarding
            onComplete={handleOnboardingComplete}
            onClose={() => {
              setOnboardingOpen(false);
              pendingAction.current = null;
            }}
          />
        </div>
      )}

      {/* Aviso + CTA: crear billetera (obligatoria para el escrow en USDT) */}
      {walletNoticeOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161616] rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <WalletRequiredNotice onCreated={handleWalletCreated} />
            <button
              onClick={() => {
                setWalletNoticeOpen(false);
                pendingAction.current = null;
              }}
              className="mt-3 w-full text-center text-xs font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Modal de pago multichain (Crossmint + NeroEscrow) del member */}
      {pendingOrder && (
        <CryptoPaymentModal
          order={pendingOrder.order}
          getAccessToken={getAccessToken}
          onClose={closeFundingModal}
          onSuccess={handleFundingSuccess}
          autoRollbackOnClose
        />
      )}
    </section>
  );
}
