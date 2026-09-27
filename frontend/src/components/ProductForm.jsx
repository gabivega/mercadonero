import { useState, useEffect } from "react";
import { allCategories } from "../data/allCategories.js";
import axios from "axios";
import { usePrivy } from "@privy-io/react-auth";
import {
  Package,
  Image as ImageIcon,
  Plus,
  X,
  ArrowRight,
  Truck,
  Store,
  Home,
} from "lucide-react";
import ProductImageUploadModal from "../components/ProductImageuploader";
import { deformatMoney, formatMoney } from "../Utils/currencyFormatter";

const ProductForm = ({ handleSubmit, isSubmitting, initialData }) => {
    const [product, setProduct] = useState({
    name: "",
    brand: "",
    sku: "",
    description: "",
    price: "",
    currency: "ARS",
        sale: {
      price: "",
    },
    category: "",
    subCategory: "",
    stock: 1,
    condition: "new",
    // ── SOCIAL SELLING (Compra en grupo / Pools) ──────────────────────
    // El vendedor lo habilita. Los tiers son EXCLUYENTES con sale.price.
    // `tiers` se indexa por cantidad de compradores (2..5) y guarda el precio.
    socialSelling: {
      enabled: false,
      durationHours: 48, // 24 | 48 | 72
      tiers: {
        2: "",
        3: "",
        4: "",
        5: "",
      },
    },
        shipping: {
      isDigital: false,
      free: false,
      digitalUrl: "",
      dimensions: {
        weight: "",
        length: "",
        width: "",
        height: "",
      },
      shippingTime: "24h",
      // ── MÉTODOS DE ENTREGA HABILITADOS ──
      // homeDelivery: envío a domicilio (Zipnova). ON por defecto.
      // pickup: retiro en local del vendedor ($0). OFF por defecto.
      // pickupLocationIds: sucursales elegidas (solo si pickup=true).
      delivery: {
        homeDelivery: true,
        pickup: false,
        pickupLocationIds: [],
      },
    },
        images: [],
    listingType: "product",
    // Características clave-valor (ej: EAN, Garantía). Se precargan al importar
    // de un proveedor. Sin UI especial: viajan tal cual al backend.
    specifications: [],
    warranty: {
      type: "none",
      duration: "",
    },
  });
  const [isImgModalOpen, setIsImgModalOpen] = useState(false);

  // ── PUNTOS DE RETIRO DEL VENDEDOR ──
  // Se traen del perfil del vendedor logueado para que pueda elegir cuáles
  // ofrece en ESTE producto. Si no tiene ninguno cargado, se muestra un aviso
  // con link al panel de configuración.
  const { getAccessToken } = usePrivy();
  const [sellerPickupLocations, setSellerPickupLocations] = useState([]);
  const [loadingPickups, setLoadingPickups] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchPickups = async () => {
      try {
        setLoadingPickups(true);
        const token = await getAccessToken();
        if (!token) return;
        const { data } = await axios.get(
          `${import.meta.env.VITE_SERVER_URL}/api/user/pickup-locations`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!cancelled && data?.success) {
          setSellerPickupLocations(data.pickupLocations || []);
        }
      } catch (err) {
        console.error("Error cargando puntos de retiro:", err);
      } finally {
        if (!cancelled) setLoadingPickups(false);
      }
    };
    fetchPickups();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle de un método de entrega (homeDelivery / pickup).
  const toggleDelivery = (method) => {
    setProduct((prev) => ({
      ...prev,
      shipping: {
        ...prev.shipping,
        delivery: {
          ...prev.shipping.delivery,
          [method]: !prev.shipping.delivery?.[method],
        },
      },
    }));
  };

  // Marca/desmarca una sucursal para el retiro de este producto.
  const togglePickupLocation = (id) => {
    setProduct((prev) => {
      const current = prev.shipping.delivery?.pickupLocationIds || [];
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      return {
        ...prev,
        shipping: {
          ...prev.shipping,
          delivery: { ...prev.shipping.delivery, pickupLocationIds: next },
        },
      };
    });
  };

  useEffect(() => {
    if (initialData) {
      setProduct({
        ...product, // Mantiene la estructura base por las dudas
        ...initialData,
        // Nos aseguramos de que los objetos anidados no se rompan si no venían completos
                sale: { ...product.sale, ...initialData.sale },
        socialSelling: {
          ...product.socialSelling,
          ...initialData.socialSelling,
          tiers: {
            ...product.socialSelling.tiers,
            ...initialData.socialSelling?.tiers,
          },
        },
                shipping: { 
          ...product.shipping, 
          ...initialData.shipping,
          dimensions: { ...product.shipping.dimensions, ...initialData.shipping?.dimensions },
          delivery: {
            ...product.shipping.delivery,
            ...initialData.shipping?.delivery,
            pickupLocationIds: initialData.shipping?.delivery?.pickupLocationIds
              || product.shipping.delivery.pickupLocationIds,
          },
        }
      });
    }
  }, [initialData]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === "checkbox" ? checked : value;
    setProduct((prev) => {
      // Si el nombre no tiene puntos, es un campo simple (name, brand, etc.)
      if (!name.includes(".")) {
        const newState = { ...prev, [name]: val };
        if (name === "category") newState.subCategory = "";
        return newState;
      }

      // Si tiene puntos (ej: "shipping.dimensions.weight"), navegamos el objeto
      const keys = name.split(".");
      const newState = { ...prev };
      let current = newState;

      // Recorremos hasta el penúltimo nivel
      for (let i = 0; i < keys.length - 1; i++) {
        current[keys[i]] = { ...current[keys[i]] }; // Clonamos para mantener inmutabilidad
        current = current[keys[i]];
      }

      // Seteamos el valor en el último nivel
      current[keys[keys.length - 1]] = val;

      return newState;
    });
  };
  //Formato de moneda
  const handlePriceChange = (e) => {
    const { name, value } = e.target;

    // 1. Limpiamos el valor: dejamos solo números
    const numericValue = value.replace(/\D/g, "");

    // 2. Si no hay valor, seteamos 0 o vacío
    const finalValue = numericValue === "" ? "" : Number(numericValue);

    setProduct((prev) => {
      // Si es un campo simple (como priceARS)
      if (!name.includes(".")) {
        return { ...prev, [name]: finalValue };
      }

      // Si es anidado (como sale.price)
      const [parent, child] = name.split(".");
      return {
        ...prev,
        [parent]: {
          ...prev[parent],
          [child]: finalValue,
          // Si estamos tocando el precio de oferta, activamos el flag de 'active'
          ...(parent === "sale" ? { active: finalValue > 0 } : {}),
        },
      };
    });
  };
    // ── SOCIAL SELLING ────────────────────────────────────────────────
  // Toggle de habilitación. Al activarlo limpia el sale.price (son excluyentes).
  const handleSocialSellingToggle = (enabled) => {
    setProduct((prev) => ({
      ...prev,
      socialSelling: { ...prev.socialSelling, enabled },
      // Excluyentes: si activo pools, reseteo la oferta.
      ...(enabled ? { sale: { price: "", active: false } } : {}),
    }));
  };

  // Cambio de precio para un tier (cantidad de compradores: 2..5)
  const handleTierPriceChange = (buyers, rawValue) => {
    const numericValue = String(rawValue).replace(/\D/g, "");
    const finalValue = numericValue === "" ? "" : Number(numericValue);
    setProduct((prev) => ({
      ...prev,
      socialSelling: {
        ...prev.socialSelling,
        tiers: { ...prev.socialSelling.tiers, [buyers]: finalValue },
      },
    }));
  };

  // Cambio de duración del pool (24/48/72)
  const handleDurationChange = (value) => {
    setProduct((prev) => ({
      ...prev,
      socialSelling: {
        ...prev.socialSelling,
        durationHours: Number(value),
      },
    }));
  };

  // Validaciones de negocio para el bloque de social selling.
  const socialSellingErrors = (() => {
    const ss = product.socialSelling;
    if (!ss?.enabled) return {};
    const errors = {};
    const base = Number(product.price || 0);
    const t = ss.tiers;
    const prices = [t[2], t[3], t[4], t[5]].map((p) =>
      p === "" ? null : Number(p),
    );

    // Todos los tiers son obligatorios
    if (prices.some((p) => p === null || p <= 0)) {
      errors.tiers = "Completá los 4 precios (2, 3, 4 y 5 compradores).";
      return errors;
    }
    // Deben ser decrecientes: precio(2) > precio(3) > precio(4) > precio(5)
    for (let i = 0; i < prices.length - 1; i++) {
      if (prices[i] <= prices[i + 1]) {
        errors.tiers =
          "Los precios deben disminuir a medida que se suman compradores.";
        break;
      }
    }
    // Deben ser menores al precio base
    if (!errors.tiers && base > 0 && prices[0] >= base) {
      errors.tiers =
        "El precio para 2 compradores debe ser menor al precio base del producto.";
    }
    return errors;
  })();

  const socialSellingHasErrors = Object.keys(socialSellingErrors).length > 0;

  const internalSubmit = (e) => {
    e.preventDefault(); // Evitamos que recargue la página
    if (socialSellingHasErrors) {
      setProduct((prev) => prev); // fuerza re-render sin cambios
      return; // bloqueamos el submit si hay errores de social selling
    }
    handleSubmit(product); // Ejecutamos la función del padre pasando los datos del hijo
  };

  return (
    <form onSubmit={internalSubmit} className="space-y-2">
      {/* SECCIÓN 2: DETALLES DEL PRODUCTO (Flex-col y ancho completo) */}
      <section className="bg-white dark:bg-[#1A1A1A] p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm space-y-2">
        <h1 className="text-2xl font-black dark:text-white">
          Detalles del Producto
        </h1>
        {/* Nombre ocupa todo el ancho */}
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-400 uppercase">
            Título
          </label>
          <input
            name="name"
            type="text"
            required
            className="input-nero"
            value={product.name}
            onChange={handleInputChange}
          />
        </div>
                <div className="space-y-2">
          <label className="text-xs font-black text-gray-400 uppercase">
            Marca
          </label>
          <input
            name="brand"
            type="text"
            required
            className="input-nero"
            value={product.brand}
            onChange={handleInputChange}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-black text-gray-400 uppercase">
            SKU <span className="text-gray-300 normal-case font-medium">(opcional)</span>
          </label>
          <input
            name="sku"
            type="text"
            className="input-nero"
            value={product.sku}
            onChange={handleInputChange}
            placeholder="Código interno / código de proveedor"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Select de Categoría Principal */}
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Categoría
            </label>
            <select
              name="category"
              required
              className="input-nero"
              value={product.category}
              onChange={handleInputChange}
            >
              <option value="">Seleccionar Categoría...</option>
              {allCategories
                .filter(
                  (cat) =>
                    !["Vehículos", "Inmuebles", "Servicios"].includes(cat.name),
                )
                .map((cat) => (
                  <option key={cat.id} value={cat.slug}>
                    {cat.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Select de Sub-Categoría */}
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Sub-Categoría
            </label>
            <select
              name="subCategory"
              required
              disabled={!product.category}
              className="input-nero"
              value={product.subCategory}
              onChange={handleInputChange}
            >
              <option value="">Seleccionar Sub-categoría...</option>
              {/* Buscamos las subcategorías de la categoría elegida */}
              {allCategories
                .find((c) => c.slug === product.category)
                ?.subcategories?.map((sub) => (
                  <option key={sub.id} value={sub.slug}>
                    {sub.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Moneda
            </label>
            <select
              name="currency"
              className="input-nero"
              value={product.currency}
              onChange={handleInputChange}
            >
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Precio
            </label>
            <input
              name="price"
              type="text"
              required
              className="input-nero"
              value={product.price}
              onChange={handlePriceChange}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Precio de Oferta (Opcional)
            </label>
            <input
              name="sale.price"
              type="text"
              className="input-nero"
              value={product.sale.price ? formatMoney(product.sale.price) : ""}
              onChange={handlePriceChange}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Estado
            </label>
            <select
              name="condition"
              className="input-nero"
              value={product.condition}
              onChange={handleInputChange}
            >
              <option value="new">Nuevo</option>
              <option value="used">Usado</option>
              <option value="refurbished">Reacondicionado</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase">
              Stock
            </label>
            <input
              name="stock"
              type="number"
              className="input-nero"
              value={product.stock}
              onChange={handleInputChange}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Descripción Detallada
          </label>
          <textarea
            name="description"
            required
            rows="5"
            className="w-full bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-gray-800 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-blue-500 dark:text-white resize-none"
            value={product.description}
            onChange={handleInputChange}
            placeholder="Describí las características principales, fallas (si tiene) o accesorios incluidos..."
          />
        </div>

        {/* SECCIÓN LOGÍSTICA */}
        <section className="bg-white dark:bg-[#1A1A1A] p-8 rounded-[32px] border border-gray-100 dark:border-gray-800 space-y-6">
          <h2 className="text-xl font-black dark:text-white tracking-tighter uppercase italic text-blue-500">
            Logística
          </h2>

          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 bg-blue-500/5 rounded-2xl border border-blue-500/20">
              <input
                type="checkbox"
                id="isDigital"
                name="shipping.isDigital" // Usamos la ruta completa
                className="w-5 h-5 accent-blue-600"
                checked={product.shipping.isDigital}
                onChange={handleInputChange} // Usamos la función universal que ya maneja puntos
              />
              <label
                htmlFor="isDigital"
                className="text-sm font-bold dark:text-white cursor-pointer"
              >
                ¿Es un producto digital / servicio? (Sin envío físico)
              </label>
            </div>

            {/* URL Digital */}
            {product.shipping.isDigital && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase ml-1">
                  Link de descarga / Acceso
                </label>
                <input
                  type="url"
                  name="shipping.digitalUrl"
                  placeholder="https://ejemplo.com/archivo-o-acceso"
                  className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-xl p-3 text-sm outline-none focus:border-blue-500 transition-all"
                  value={product.shipping.digitalUrl || ""}
                  onChange={handleInputChange}
                />
              </div>
            )}
          </div>

          {!product.shipping.isDigital && (
            <div className="animate-in duration-500 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Checkbox Envío Gratis */}
                <label
                  className={`flex items-center gap-4 p-4 border rounded-2xl cursor-pointer transition-all ${
                    product.shipping.free // Cambié .free por .freeShipping para ser consistente
                      ? "bg-green-50 dark:bg-green-500/10 border-green-500"
                      : "bg-gray-50 dark:bg-[#252525] border-gray-200 dark:border-gray-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="shipping.free" // Corregido: sin punto al final
                    className="w-5 h-5 rounded-md border-gray-300 text-green-600 focus:ring-green-500"
                    checked={product.shipping.free}
                    onChange={handleInputChange}
                  />
                  <div className="flex items-center gap-2 font-bold text-gray-700 dark:text-gray-300 uppercase text-xs">
                    <Truck
                      size={18}
                      className={
                        product.shipping.free
                          ? "text-green-500"
                          : "text-gray-400"
                      }
                    />
                    Envío Gratis
                  </div>
                </label>

                {/* Costo Manual */}
                {!product.shipping.free && (
                  <div className="animate-in zoom-in-95 duration-200">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                        $
                      </span>
                      <input
                        type="number"
                        name="shipping.cost" // Corregido el nombre para que coincida con el estado
                        className="w-full bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 pl-8 text-sm outline-none focus:border-blue-500 transition-all"
                        value={product.shipping.cost || ""}
                        onChange={handleInputChange}
                        placeholder="Precio del envio"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Dimensiones */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase">
                    Peso (kg)
                  </label>
                  <input
                    name="shipping.dimensions.weight"
                    type="number"
                    step="0.1"
                    className="input-nero"
                    value={product.shipping.dimensions.weight || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase">
                    Largo (cm)
                  </label>
                  <input
                    name="shipping.dimensions.length"
                    type="number"
                    className="input-nero"
                    value={product.shipping.dimensions.length || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase">
                    Ancho (cm)
                  </label>
                  <input
                    name="shipping.dimensions.width" // Corregido: shippping -> shipping
                    type="number"
                    className="input-nero"
                    value={product.shipping.dimensions.width || ""}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase">
                    Alto (cm)
                  </label>
                  <input
                    name="shipping.dimensions.height"
                    type="number"
                    className="input-nero"
                    value={product.shipping.dimensions.height || ""}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium dark:text-gray-200">
                  Tiempo de despacho
                </label>
                <select
                  value={product.shipping.shippingTime}
                  onChange={(e) =>
                    setProduct({
                      ...product,
                      shipping: {
                        ...product.shipping,
                        shippingTime: e.target.value,
                      },
                    })
                  }
                  className="w-full p-2.5 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm"
                >
                                    <option value="24h">🚀 Despacho en 24 hs</option>
                  <option value="48h">⚡ Despacho en 48 hs</option>
                  <option value="72h">🐢 Despacho en 72 hs</option>
                  <option value="more">📦 Más de 72 hs</option>
                </select>
              </div>

              {/* ── MÉTODOS DE ENTREGA ── */}
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
                  Métodos de entrega
                </p>

                <div className="space-y-3">
                  {/* Envío a domicilio */}
                  <label
                    className={`flex items-center gap-4 p-4 border rounded-2xl cursor-pointer transition-all ${
                      product.shipping.delivery?.homeDelivery
                        ? "bg-blue-50 dark:bg-blue-500/10 border-blue-500"
                        : "bg-gray-50 dark:bg-[#252525] border-gray-200 dark:border-gray-800"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="w-5 h-5 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={!!product.shipping.delivery?.homeDelivery}
                      onChange={() => toggleDelivery("homeDelivery")}
                    />
                    <div className="flex items-center gap-2 font-bold text-gray-700 dark:text-gray-300 uppercase text-xs">
                      <Home
                        size={18}
                        className={
                          product.shipping.delivery?.homeDelivery
                            ? "text-blue-500"
                            : "text-gray-400"
                        }
                      />
                      Envío a domicilio
                    </div>
                  </label>

                  {/* Retiro en local */}
                  <label
                    className={`flex items-center gap-4 p-4 border rounded-2xl cursor-pointer transition-all ${
                      product.shipping.delivery?.pickup
                        ? "bg-green-50 dark:bg-green-500/10 border-green-500"
                        : "bg-gray-50 dark:bg-[#252525] border-gray-200 dark:border-gray-800"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="w-5 h-5 rounded-md border-gray-300 text-green-600 focus:ring-green-500"
                      checked={!!product.shipping.delivery?.pickup}
                      onChange={() => toggleDelivery("pickup")}
                    />
                    <div className="flex items-center gap-2 font-bold text-gray-700 dark:text-gray-300 uppercase text-xs">
                      <Store
                        size={18}
                        className={
                          product.shipping.delivery?.pickup
                            ? "text-green-500"
                            : "text-gray-400"
                        }
                      />
                      Retiro en local (sin cargo)
                    </div>
                  </label>

                  {/* Selección de sucursales (solo si pickup=true) */}
                  {product.shipping.delivery?.pickup && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300 ml-2 pl-4 border-l-2 border-green-500/40">
                      {loadingPickups ? (
                        <p className="text-xs text-gray-400">
                          Cargando tus puntos de retiro...
                        </p>
                      ) : sellerPickupLocations.length === 0 ? (
                        <div className="text-xs text-amber-600 dark:text-amber-400">
                          Todavía no tenés puntos de retiro cargados.{" "}
                          <a
                            href="/puntos-retiro"
                            target="_blank"
                            rel="noreferrer"
                            className="underline font-semibold"
                          >
                            Configurar puntos de retiro
                          </a>
                        </div>
                      ) : (
                        <>
                          <p className="text-[11px] text-gray-400 mb-2">
                            Elegí qué sucursales ofrecés para este producto. Si no
                            marcás ninguna, se ofrecen <b>todas</b>.
                          </p>
                          <div className="space-y-2">
                            {sellerPickupLocations.map((loc) => {
                              const selected =
                                product.shipping.delivery?.pickupLocationIds?.includes(
                                  loc._id,
                                );
                              return (
                                <label
                                  key={loc._id}
                                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                    selected
                                      ? "border-green-500 bg-green-50/50 dark:bg-green-500/10"
                                      : "border-gray-200 dark:border-gray-800"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 mt-0.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                    checked={!!selected}
                                    onChange={() => togglePickupLocation(loc._id)}
                                  />
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold dark:text-white">
                                      {loc.name}
                                    </p>
                                    <p className="text-[11px] text-gray-500">
                                      {[loc.street, loc.streetNumber]
                                        .filter(Boolean)
                                        .join(" ")}
                                      {loc.city ? `, ${loc.city}` : ""}
                                      {loc.state ? `, ${loc.state}` : ""}
                                    </p>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

                {/* SECCIÓN SOCIAL SELLING (COMPRA EN GRUPO / POOLS) */}
        <section className="bg-white dark:bg-[#1A1A1A] p-8 rounded-[32px] border border-gray-100 dark:border-gray-800 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black dark:text-white tracking-tighter uppercase italic text-blue-500">
                Compra en Grupo
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Permití que los compradores se agrupen (hasta 5) y accedan a
                precios por cantidad.
              </p>
            </div>
            {/* Toggle habilitar */}
            <button
              type="button"
              onClick={() =>
                handleSocialSellingToggle(!product.socialSelling.enabled)
              }
              className={`relative w-14 h-8 rounded-full transition-colors shrink-0 ${
                product.socialSelling.enabled
                  ? "bg-blue-600"
                  : "bg-gray-300 dark:bg-gray-700"
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                  product.socialSelling.enabled
                    ? "translate-x-6"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {product.socialSelling.enabled && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-6">
              {/* Aviso: excluyente con precio de oferta */}
              <div className="flex items-start gap-3 p-4 bg-amber-500/5 rounded-2xl border border-amber-500/20">
                <span className="text-amber-500 text-lg leading-none">ℹ️</span>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  La compra en grupo es <b>excluyente con el Precio de Oferta</b>
                  . Al habilitarla, se desactivó la oferta de este producto.
                </p>
              </div>

              {/* Tiers de precio por cantidad */}
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
                  Precio por cantidad de compradores
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[2, 3, 4, 5].map((buyers) => (
                    <div key={buyers} className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase">
                        {buyers} compradores
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                          $
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="w-full bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-gray-800 rounded-2xl p-4 pl-8 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
                          value={
                            product.socialSelling.tiers[buyers] === ""
                              ? ""
                              : formatMoney(
                                  product.socialSelling.tiers[buyers],
                                )
                          }
                          onChange={(e) =>
                            handleTierPriceChange(buyers, e.target.value)
                          }
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {socialSellingErrors.tiers && (
                  <p className="text-xs text-red-500 mt-2 font-medium">
                    {socialSellingErrors.tiers}
                  </p>
                )}
              </div>

              {/* Duración del pool */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">
                  Duración del pool
                </label>
                <select
                  value={product.socialSelling.durationHours}
                  onChange={(e) => handleDurationChange(e.target.value)}
                  className="w-full md:w-64 p-2.5 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-lg text-sm dark:text-white"
                >
                  <option value="24">⏱️ 24 hs</option>
                  <option value="48">⏱️ 48 hs</option>
                  <option value="72">⏱️ 72 hs</option>
                </select>
                <p className="text-[11px] text-gray-400">
                  Tiempo que tiene el grupo para completarse antes de expirar.
                </p>
              </div>
            </div>
          )}
        </section>

        <div className="bg-white dark:bg-[#1A1A1A] p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm flex flex-col items-center">
          <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-6 text-center">
            Fotos del producto ({product.images.length}/5)
          </label>
          {/* CARGA DE IMAGENES */}
          <div
            onClick={() => setIsImgModalOpen(true)}
            className="w-full max-w-md aspect-video md:aspect-[21/9] rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50/50 dark:hover:bg-blue-900/10 hover:border-blue-500 transition-all group overflow-hidden relative"
          >
            {product.images.length > 0 ? (
              <>
                <img
                  src={
                    product.images.find((img) => img.isMain)?.url ||
                    product.images[0].url
                  }
                  className="w-full h-full object-cover"
                  alt="Preview"
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 flex items-center justify-center transition-all">
                  <span className="bg-white/90 dark:bg-black/60 px-4 py-2 rounded-xl text-xs font-bold dark:text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                    Editar Galería
                  </span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center">
                <div className="p-4 bg-gray-50 dark:bg-[#252525] rounded-full mb-3 group-hover:scale-110 transition-transform">
                  <ImageIcon
                    className="text-gray-400 group-hover:text-blue-500"
                    size={32}
                  />
                </div>
                <span className="text-sm font-bold text-gray-500">
                  Cargar imágenes
                </span>
              </div>
            )}
          </div>

          {/* Miniaturas horizontales para no ocupar espacio vertical extra */}
          {product.images.length > 0 && (
            <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
              {product.images.map((img, i) => (
                <div
                  key={i}
                  className={`w-14 h-14 rounded-lg border-2 overflow-hidden flex-shrink-0 ${img.isMain ? "border-blue-500" : "border-transparent"}`}
                >
                  <img src={img.url} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Modal de Imágenes (Placeholder) */}
        <ProductImageUploadModal
          isOpen={isImgModalOpen}
          onClose={() => setIsImgModalOpen(false)}
          onUploadComplete={(images) => {
            setProduct((prev) => ({ ...prev, images }));
            // 'images' ahora es un array de objetos {url, isMain}
          }}
        />

        {/* BOTÓN FINAL */}
        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-blue-500/20 flex items-center justify-center gap-3 uppercase tracking-widest text-sm"
        >
          {isSubmitting ? "Procesando..." : "Publicar"}
        </button>
      </section>
    </form>
  );
};

export default ProductForm;
