import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import {
  Users,
  Clock,
  Share2,
  Check,
  ShieldCheck,
  ArrowLeft,
  Lock,
  Sparkles,
  Wallet,
} from "lucide-react";import useCountdown from "../hooks/useCountdown";
import { usePools } from "../Utils/usePools";
import { formatMoney } from "../Utils/currencyFormatter";
import { showCopiedToast } from "../Utils/copiedToast";
import { poolSuccessSwal, poolErrorSwal } from "../Utils/poolSwal";
import { useUserStore } from "../store/useUserStore";
import { useSyncUser } from "../Utils/userSync";
import UserAvatar from "../components/UserAvatar";
import AuthOnboarding from "../components/AuthOnboarding";
import WalletRequiredNotice, {
  InsufficientBalanceNotice,
} from "../components/WalletRequiredNotice";
import { fundPoolMember } from "../Utils/poolEscrowClient";
import { productPath } from "../Utils/productUrl";

const ACCENT = "#F26722";

/**
 * PoolDetail
 * Página de detalle de un pool de compra grupal accesible por deep-link
 * (/pool/:id). Muestra el producto, la gente sumada, el countdown, la escala
 * de precios y el CTA para unirse.
 *
 * Datos reales vía `usePools` (backend `/api/pool/:id`).
 */
export default function PoolDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dbUser = useUserStore((s) => s.dbUser);
  const setDbUser = useUserStore((s) => s.setDbUser);
  const currentUserId = dbUser?._id;
  const { syncUser } = useSyncUser(setDbUser);
  const { login, authenticated } = usePrivy();
  const { wallets } = useWallets();

  const {
    fetchPoolById,
    joinPool,
    leavePool,
    preparePoolFunding,
    confirmPoolFunding,
  } = usePools();

  const [pool, setPool] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [walletNoticeOpen, setWalletNoticeOpen] = useState(false);
  const [balanceNotice, setBalanceNotice] = useState(null); // { required, balance }
  const [fundingStatus, setFundingStatus] = useState("");

  // ¿Ya completó los datos básicos obligatorios?
  const hasProfileData = Boolean(
    dbUser?.profileCompleted ||
      (dbUser?.firstName && dbUser?.lastName && dbUser?.dni && dbUser?.phone),
  );

  // ¿Tiene billetera Web3? Sin ella no se puede fondear el escrow (USDT).
  const hasWallet = Boolean(dbUser?.walletAddress || wallets?.[0]?.address);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setNotFound(false);
    fetchPoolById(id).then((res) => {
      if (!alive) return;
      if (res?.pool) {
        // Mezclamos productData poblado dentro del pool para el render.
        setPool({ ...res.pool, productData: res.productData });
      } else {
        setNotFound(true);
      }
      setIsLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [id, fetchPoolById]);

  const { label, isExpired } = useCountdown(pool?.expiresAt);

  const product = pool?.productData;
  const ss = product?.socialSelling;

  const filled = pool?.members?.length || 0;
  const target = pool?.targetBuyers || 5;
  const isFull = filled >= target || pool?.status === "filled";
  const isMember = pool?.members?.some((m) => m._id === currentUserId);

  // ¿El usuario logueado es el VENDEDOR del producto? El vendedor puede ver el
  // grupo (para monitorear) pero NO puede unirse ni fondear. Tampoco debe ver
  // los avisos de USDT/escrow (no le corresponden).
  const sellerId = pool?.seller?._id || pool?.seller || product?.seller?._id || product?.seller;
  const isSeller =
    Boolean(currentUserId) &&
    Boolean(sellerId) &&
    String(sellerId) === String(currentUserId);

  // El creador del grupo también es miembro; lo distinguimos para el copy.
  const creatorId = pool?.creator?._id || pool?.creator;
  const isCreator =
    Boolean(currentUserId) &&
    Boolean(creatorId) &&
    String(creatorId) === String(currentUserId);

  const saving = useMemo(() => {
    if (!product?.price || !pool?.targetUnitPrice) return 0;
    return Math.round((1 - pool.targetUnitPrice / product.price) * 100);
  }, [product, pool]);

  // ── Handlers (backend) ────────────────────────────────────────────
  const handleJoin = () => {
    if (!authenticated) return login();
    if (!hasProfileData) {
      setOnboardingOpen(true);
      return;
    }
    if (!hasWallet) {
      setWalletNoticeOpen(true);
      return;
    }
    doJoin();
  };

  const doJoin = async () => {
    const prevPrice = pool?.currentUnitPrice;
    setIsJoining(true);
    // Marca para revertir mi membresía si no completo el fondeo.
    let joinedOk = false;
    try {
      // 1. Sumarme en el backend (aún sin fondear).
      const joined = await joinPool(pool._id);
      joinedOk = true;

      // 2. Fondear on-chain mi porción.
      const wallet = wallets?.[0];
      if (!wallet) {
        throw new Error(
          "No encontramos una wallet. Iniciá sesión con tu billetera para fondear el grupo.",
        );
      }
      let prep;
      try {
        prep = await preparePoolFunding(pool._id);
      } catch (err) {
        // Saldo USDT insuficiente → aviso de recarga (no es error).
        if (err?.insufficientUsdt) {
          await leavePool(pool._id).catch(() => {});
          joinedOk = false;
          setFundingStatus("");
          setBalanceNotice({
            required: err.required ?? 0,
            balance: err.balance ?? 0,
          });
          return;
        }
        throw err;
      }
      if (!prep?.success || !prep?.funding) {
        throw new Error("No se pudo preparar el fondeo del grupo.");
      }
      const { pool: funded } = await fundPoolMember({
        wallet,
        funding: prep.funding,
        onStatus: setFundingStatus,
        confirmOnChain: (hash) => confirmPoolFunding(pool._id, hash),
      });
      joinedOk = false; // fondeo OK → nada que revertir

      // Refrescamos el pool con el estado actualizado del backend.
      const res = await fetchPoolById(id, { silent: true });
      if (res?.pool) setPool({ ...res.pool, productData: res.productData });

      const newPrice = funded?.currentUnitPrice ?? joined?.currentUnitPrice;
      const lower = prevPrice && newPrice && newPrice < prevPrice;
      const link = window.location.href;

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
    } catch (e) {
      // Si me uní pero no completé el fondeo → me salgo del grupo.
      if (joinedOk) {
        await leavePool(pool._id).catch(() => {});
      }
      if (e?.needsWallet) {
        setWalletNoticeOpen(true);
      } else {
        poolErrorSwal({
          title: "No te pudiste unir",
          text: e?.message || "",
        });
      }
    } finally {
      setFundingStatus("");
      setIsJoining(false);
    }
  };

  const handleOnboardingComplete = async () => {
    setOnboardingOpen(false);
    await syncUser();
    // Tras el onboarding puede faltar la wallet: re-evaluamos.
    if (hasWallet) {
      doJoin();
    } else {
      setWalletNoticeOpen(true);
    }
  };

  const handleWalletCreated = async () => {
    setWalletNoticeOpen(false);
    // Esperamos a que useWallets refleje la billetera recién creada (hasta ~3s).
    for (let i = 0; i < 6; i++) {
      if (wallets?.[0]?.address) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    // Re-sincronizamos para traer walletAddress al store antes de reintentar.
    await syncUser();
    doJoin();
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showCopiedToast("Compartí el enlace para sumar compradores");
    } catch {
      /* noop */
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center dark:text-white">
        <p className="text-sm text-gray-500">Cargando grupo...</p>
      </div>
    );
  }

  if (notFound || !pool) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 dark:text-white">
        <p className="text-lg font-bold">Grupo no encontrado</p>
        <p className="text-sm text-gray-500">
          El enlace puede haber expirado o ser inválido.
        </p>
        <button
          onClick={() => navigate("/compras-grupales")}
          className="px-4 py-2 rounded-xl text-sm font-bold text-white"
          style={{ backgroundColor: ACCENT }}
        >
          Ver compras grupales
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#f5f5f5] dark:bg-[#0a0a0a] min-h-screen pb-12">
      <div className="max-w-[900px] mx-auto px-4 pt-4">
        {/* Volver */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 dark:hover:text-white transition-colors mb-3"
        >
          <ArrowLeft size={15} /> Volver
        </button>

        <div className="bg-white dark:bg-[#121212] rounded-3xl border border-gray-200 dark:border-gray-800 p-6 md:p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <span
              className="p-3 rounded-2xl shrink-0"
              style={{ backgroundColor: `${ACCENT}1a` }}
            >
              <Users size={22} style={{ color: ACCENT }} />
            </span>
            <div className="flex-1">
              <h1 className="text-xl font-black dark:text-white leading-tight flex items-center gap-2">
                Grupo de compra
                <Sparkles size={16} style={{ color: ACCENT }} />
              </h1>
              <p className="text-xs text-gray-500">
                Creado por @
                {[
                  pool.creator?.firstName,
                  pool.creator?.lastName,
                ]
                  .map((v) => (typeof v === "string" ? v.trim() : ""))
                  .filter(Boolean)
                  .join(" ") ||
                  pool.creator?.username ||
                  "vendedor"}
              </p>
            </div>
            <button
              onClick={handleShare}
              className="w-10 h-10 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-[#1f1f1f] transition-colors"
              title="Copiar enlace"
            >
              {copied ? (
                <Check size={18} className="text-green-500" />
              ) : (
                <Share2 size={18} className="text-gray-500" />
              )}
            </button>
          </div>

          {/* Producto asociado */}
          {product && (
            <div
              className="flex items-center gap-4 rounded-2xl border border-gray-100 dark:border-gray-800 p-3 mb-6 cursor-pointer hover:shadow-sm transition-all"
              onClick={() => navigate(productPath(product))}
            >
              <div className="w-16 h-16 rounded-xl bg-gray-50 dark:bg-[#1a1a1a] flex items-center justify-center overflow-hidden shrink-0">
                {product.images?.[0]?.url ? (
                  <img
                    src={product.images[0].url}
                    alt={product.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Users size={22} className="text-gray-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold dark:text-white truncate">
                  {product.name}
                </p>
                <p className="text-xs text-gray-400">
                  Ver publicación original
                </p>
              </div>
              {saving > 0 && (
                <span className="shrink-0 text-xs font-black text-green-500">
                  {saving}% OFF
                </span>
              )}
            </div>
          )}

          {/* Métricas */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 text-center">
              <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest mb-1">
                Compradores
              </p>
              <p className="text-2xl font-black dark:text-white">
                {filled}/{target}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 text-center">
              <p className="text-[10px] uppercase font-black text-gray-400 tracking-widest mb-1 flex items-center justify-center gap-1">
                <Clock size={11} /> Cierra en
              </p>
              <p
                className="text-2xl font-black"
                style={{ color: isExpired ? "#9ca3af" : ACCENT }}
              >
                {label}
              </p>
            </div>
          </div>

          {/* Miembros */}
          <div className="mb-6">
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-2">
              Integrantes
            </p>
            <div className="flex flex-wrap gap-2">
              {pool.members?.map((m, i) => (
                <div
                  key={m._id || i}
                  className="flex items-center gap-2 rounded-full bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 pl-1 pr-3 py-1"
                >
                  <UserAvatar avatar={m.avatar} name={m.username} size={24} />
                  <span className="text-xs font-medium dark:text-gray-200">
                    @{m.username}
                  </span>
                </div>
              ))}
              {Array.from({ length: Math.max(0, target - filled) }).map(
                (_, i) => (
                  <span
                    key={`empty-${i}`}
                    className="flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 dark:border-gray-700 px-3 py-1 text-xs text-gray-400"
                  >
                    <Users size={12} /> Libre
                  </span>
                ),
              )}
            </div>
          </div>

          {/* Escala de precios */}
          {ss?.tiers && (
            <div className="mb-6">
              <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-2">
                Precio según cuántos se sumen
              </p>
              <div className="grid grid-cols-4 gap-2">
                {[2, 3, 4, 5].map((n) => {
                  const reached = filled >= n;
                  return (
                    <div
                      key={n}
                      className="text-center rounded-xl border py-2.5 transition-all"
                      style={{
                        borderColor: reached ? `${ACCENT}66` : undefined,
                        backgroundColor: reached
                          ? `${ACCENT}0d`
                          : "transparent",
                      }}
                    >
                      <p className="text-[10px] text-gray-400 font-bold">
                        {n} pers.
                      </p>
                      <p
                        className="text-sm font-black"
                        style={{ color: reached ? ACCENT : undefined }}
                      >
                        {ss.tiers[n] ? formatMoney(ss.tiers[n]) : "—"}
                      </p>
                      {reached && (
                        <p className="text-[9px] font-black text-green-500">
                          ✓ alcanzado
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="space-y-3">
            {/* ── VISTA VENDEDOR: no puede unirse; solo monitorea ── */}
            {isSeller ? (
              <>
                <div
                  className="rounded-xl border p-3 flex items-start gap-2 text-[11px]"
                  style={{ borderColor: `${ACCENT}33`, backgroundColor: `${ACCENT}0d` }}
                >
                  <Sparkles size={14} className="shrink-0 mt-0.5" style={{ color: ACCENT }} />
                  <p className="text-gray-600 dark:text-gray-300">
                    Estás viendo este grupo como <b>vendedor</b>. Podés seguir
                    cómo se suman compradores y a qué precio. Cuando el grupo
                    cierre, las órdenes se generan automáticamente.
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  className="w-full py-3.5 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 opacity-60 cursor-not-allowed"
                  style={{ backgroundColor: "#9ca3af" }}
                >
                  Sos el vendedor de este producto
                </button>
              </>
            ) : isMember ? (
              /* ── VISTA MIEMBRO: ya está dentro; no ve avisos ni botón ── */
              <>
                <div
                  className="rounded-xl border p-3 flex items-start gap-2 text-[11px]"
                  style={{ borderColor: "#22c55e33", backgroundColor: "#22c55e0d" }}
                >
                  <ShieldCheck size={14} className="shrink-0 mt-0.5 text-green-500" />
                  <p className="text-gray-600 dark:text-gray-300">
                    Ya estás dentro de este grupo{isCreator ? " y sos su creador" : ""}.
                    Tu pago quedó en garantía hasta que el grupo cierre.
                    {!isFull && " Compartí el enlace para sumar más compradores y bajar el precio."}
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  className="w-full py-3.5 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 opacity-70 cursor-not-allowed"
                  style={{ backgroundColor: "#9ca3af" }}
                >
                  Ya estás en este grupo
                </button>
              </>
            ) : (
              /* ── VISTA VISITANTE: CTA para unirse + avisos de escrow USDT ── */
              <>
                {/* Aviso destacado: se abona en USDT con billetera Web3. */}
                <div
                  className="rounded-xl border p-3 flex items-start gap-2 text-[11px]"
                  style={{ borderColor: `${ACCENT}33`, backgroundColor: `${ACCENT}0d` }}
                >
                  <Wallet size={14} className="shrink-0 mt-0.5" style={{ color: ACCENT }} />
                  <p className="text-gray-600 dark:text-gray-300">
                    Las compras grupales se abonan <b>en USDT</b> desde tu
                    billetera Web3. Tu saldo queda en garantía hasta que el
                    grupo cierre.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isExpired || isFull || isJoining}
                  onClick={handleJoin}
                  className="w-full py-3.5 rounded-2xl text-sm font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: isExpired || isFull ? "#9ca3af" : ACCENT,
                  }}
                >
                  <Lock size={16} />
                  {isJoining
                    ? "Procesando..."
                    : isFull
                      ? "Grupo completo"
                      : isExpired
                        ? "Grupo expirado"
                        : "Unirme"}
                </button>

                <div className="flex items-start gap-2 text-[11px] text-gray-500">
                  <ShieldCheck
                    size={14}
                    className="shrink-0 mt-0.5"
                    style={{ color: ACCENT }}
                  />
                  <p>
                    Al unirte se congela tu saldo en USDT en un contrato
                    inteligente (escrow). No podés cancelar; si el grupo no se
                    completa se cobra el precio del tier alcanzado y, si quedás
                    solo, se liberan los fondos al expirar.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Onboarding (datos básicos) antes de unirse */}
      {onboardingOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm overflow-y-auto">
          <AuthOnboarding
            onComplete={handleOnboardingComplete}
            onClose={() => setOnboardingOpen(false)}
          />
        </div>
      )}

      {/* Aviso + CTA: crear billetera (obligatoria para el escrow en USDT) */}
      {walletNoticeOpen && (
        <div className="fixed inset-0 z-[65] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161616] rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <WalletRequiredNotice onCreated={handleWalletCreated} />
            <button
              onClick={() => setWalletNoticeOpen(false)}
              className="mt-3 w-full text-center text-xs font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Aviso: saldo USDT insuficiente (ya tiene wallet) */}
      {balanceNotice && (
        <div className="fixed inset-0 z-[65] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161616] rounded-3xl p-5 max-w-md w-full shadow-2xl">
            <InsufficientBalanceNotice
              required={balanceNotice.required}
              balance={balanceNotice.balance}
              onRefresh={() => {
                setBalanceNotice(null);
                doJoin();
              }}
            />
            <button
              onClick={() => setBalanceNotice(null)}
              className="mt-3 w-full text-center text-xs font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Overlay de fondeo on-chain (firma + confirmación) */}
      {fundingStatus && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#161616] rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div
              className="mx-auto mb-4 w-12 h-12 rounded-full border-4 border-t-transparent animate-spin"
              style={{ borderColor: `${ACCENT}`, borderTopColor: "transparent" }}
            />
            <p className="font-bold dark:text-white">Fondeando tu grupo</p>
            <p className="text-sm text-gray-500 mt-1">{fundingStatus}</p>
            <p className="text-[11px] text-gray-400 mt-3">
              No cierres esta ventana. Tu saldo queda en garantía hasta que el
              grupo cierre.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
