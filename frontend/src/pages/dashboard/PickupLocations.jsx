import { useState, useEffect } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { usePrivy } from "@privy-io/react-auth";
import {
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Star,
  X,
  Save,
  Store,
} from "lucide-react";
import { useUserStore } from "../../store/useUserStore";
import PostalCodeInput from "../../components/PostalCodeInput";

const EMPTY_FORM = {
  name: "",
  street: "",
  streetNumber: "",
  city: "",
  state: "",
  zipcode: "",
  floor: "",
  apartment: "",
  betweenStreets: "",
  references: "",
  hours: "",
  notes: "",
  isDefault: false,
};

/**
 * PUNTOS DE RETIRO DEL VENDEDOR.
 * Permite crear/editar/eliminar sucursales donde el comprador puede retirar
 * el pedido SIN CARGO. Requiere tienda activa (shop.active).
 */
export default function PickupLocations() {
  const { getAccessToken } = usePrivy();
  const { dbUser } = useUserStore();
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal de alta/edición
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = alta
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  const serverUrl = import.meta.env.VITE_SERVER_URL;
  const shopActive = Boolean(dbUser?.shop?.active);

  // ── CARGA INICIAL ──
  const fetchLocations = async () => {
    try {
      setLoading(true);
      const token = await getAccessToken();
      const { data } = await axios.get(`${serverUrl}/api/user/pickup-locations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data?.success) setLocations(data.pickupLocations || []);
    } catch (err) {
      console.error("Error cargando puntos de retiro:", err);
      Swal.fire("Error", "No se pudieron cargar los puntos de retiro.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── HELPERS DE FORM ──
  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setIsModalOpen(true);
  };

  const openEdit = (loc) => {
    setEditingId(loc._id);
    setForm({
      name: loc.name || "",
      street: loc.street || "",
      streetNumber: loc.streetNumber || "",
      city: loc.city || "",
      state: loc.state || "",
      zipcode: loc.zipcode || "",
      floor: loc.floor || "",
      apartment: loc.apartment || "",
      betweenStreets: loc.betweenStreets || "",
      references: loc.references || "",
      hours: loc.hours || "",
      notes: loc.notes || "",
      isDefault: !!loc.isDefault,
    });
    setErrors({});
    setIsModalOpen(true);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Poné un nombre (ej.: Sucursal Centro).";
    if (!form.city.trim()) errs.city = "La ciudad es obligatoria.";
    if (!form.state.trim()) errs.state = "La provincia es obligatoria.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── GUARDAR (alta o edición) ──
  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const token = await getAccessToken();
      const payload = { ...form };
      let res;
      if (editingId) {
        res = await axios.put(
          `${serverUrl}/api/user/pickup-locations/${editingId}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } },
        );
      } else {
        res = await axios.post(`${serverUrl}/api/user/pickup-locations`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      if (res.data?.success) {
        setLocations(res.data.pickupLocations || []);
        setIsModalOpen(false);
        Swal.fire({
          toast: true,
          position: "bottom-end",
          icon: "success",
          title: editingId ? "Punto actualizado" : "Punto agregado",
          showConfirmButton: false,
          timer: 1800,
        });
      }
    } catch (err) {
      const msg = err?.response?.data?.message || "No se pudo guardar el punto.";
      Swal.fire("Error", msg, "error");
    } finally {
      setSaving(false);
    }
  };

  // ── ELIMINAR ──
  const handleDelete = async (loc) => {
    const confirm = await Swal.fire({
      title: "¿Eliminar punto de retiro?",
      text: `Se eliminará "${loc.name}". Los productos que lo usaban dejarán de ofrecerlo.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#ef4444",
      reverseButtons: true,
    });
    if (!confirm.isConfirmed) return;
    try {
      const token = await getAccessToken();
      const { data } = await axios.delete(
        `${serverUrl}/api/user/pickup-locations/${loc._id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (data?.success) setLocations(data.pickupLocations || []);
    } catch (err) {
      Swal.fire("Error", "No se pudo eliminar el punto.", "error");
    }
  };

  // ── MARCAR COMO PREDETERMINADO ──
  const handleSetDefault = async (loc) => {
    try {
      const token = await getAccessToken();
      const { data } = await axios.put(
        `${serverUrl}/api/user/pickup-locations/${loc._id}`,
        { isDefault: true },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (data?.success) setLocations(data.pickupLocations || []);
    } catch (err) {
      Swal.fire("Error", "No se pudo actualizar.", "error");
    }
  };

  // ── RENDER ──
  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black dark:text-white flex items-center gap-2">
            <Store className="text-blue-600" size={26} />
            Puntos de retiro
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configurá tus sucursales o locales. Los compradores podrán retirar ahí{" "}
            <b>sin cargo</b>.
          </p>
        </div>
        <button
          onClick={openCreate}
          disabled={!shopActive}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-sm transition-all"
        >
          <Plus size={18} /> Agregar punto
        </button>
      </div>

      {/* AVISO SI NO TIENE TIENDA */}
      {!shopActive && (
        <div className="p-4 rounded-2xl border border-amber-300/60 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-sm text-amber-800 dark:text-amber-300">
          Para configurar puntos de retiro primero tenés que tener tu{" "}
          <b>tienda activa</b> (completar el onboarding de vendedor).
        </div>
      )}

      {/* LISTA */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500" />
        </div>
      ) : locations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white dark:bg-[#1A1A1A] rounded-3xl border border-gray-100 dark:border-gray-800">
          <MapPin className="text-gray-300 dark:text-gray-700 mb-4" size={44} />
          <p className="font-bold dark:text-white">Todavía no tenés puntos de retiro</p>
          <p className="text-sm text-gray-500 max-w-sm mt-1">
            Agregá tu primera sucursal para que los compradores puedan retirar sus
            pedidos sin costo.
          </p>
          {shopActive && (
            <button
              onClick={openCreate}
              className="mt-5 flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-sm"
            >
              <Plus size={18} /> Agregar punto
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {locations.map((loc) => (
            <div
              key={loc._id}
              className="bg-white dark:bg-[#1A1A1A] rounded-3xl border border-gray-100 dark:border-gray-800 p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-black dark:text-white truncate">{loc.name}</h3>
                    {loc.isDefault && (
                      <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded font-bold uppercase">
                        Predeterminado
                      </span>
                    )}
                    {loc.active === false && (
                      <span className="text-[10px] bg-gray-400 text-white px-2 py-0.5 rounded font-bold uppercase">
                        Inactivo
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {[loc.street, loc.streetNumber].filter(Boolean).join(" ")}
                    {loc.floor ? `, Piso ${loc.floor}` : ""}
                    {loc.apartment ? `, Depto ${loc.apartment}` : ""}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {[loc.city, loc.state].filter(Boolean).join(", ")}
                    {loc.zipcode ? ` (${loc.zipcode})` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!loc.isDefault && (
                    <button
                      onClick={() => handleSetDefault(loc)}
                      title="Marcar como predeterminado"
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600"
                    >
                      <Star size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(loc)}
                    title="Editar"
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-blue-600"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(loc)}
                    title="Eliminar"
                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 text-gray-500 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {(loc.hours || loc.notes) && (
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1 pt-2 border-t border-gray-100 dark:border-gray-800">
                  {loc.hours && (
                    <p>
                      🕒 <b>Horarios:</b> {loc.hours}
                    </p>
                  )}
                  {loc.notes && (
                    <p>
                      📝 <b>Notas:</b> {loc.notes}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* MODAL ALTA/EDICIÓN */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg bg-white dark:bg-[#121212] rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl my-8">
            {/* HEADER */}
            <div className="flex items-center justify-between p-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="text-lg font-black dark:text-white">
                {editingId ? "Editar punto de retiro" : "Nuevo punto de retiro"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            {/* FORM */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <Field
                label="Nombre del punto *"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Ej: Sucursal Centro"
                error={errors.name}
              />

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field
                    label="Calle"
                    name="street"
                    value={form.street}
                    onChange={handleChange}
                    placeholder="Av. Corrientes"
                  />
                </div>
                <Field
                  label="Número"
                  name="streetNumber"
                  value={form.streetNumber}
                  onChange={handleChange}
                  placeholder="1234"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Piso"
                  name="floor"
                  value={form.floor}
                  onChange={handleChange}
                  placeholder="Opcional"
                />
                <Field
                  label="Depto"
                  name="apartment"
                  value={form.apartment}
                  onChange={handleChange}
                  placeholder="Opcional"
                />
              </div>

              <PostalCodeInput
                zipCode={form.zipcode}
                province={form.state}
                city={form.city}
                cityAsSelect
                labels={{ city: "Ciudad *" }}
                error={errors.city || errors.state || ""}
                onChange={({ zipCode, province, city }) =>
                  setForm((prev) => ({
                    ...prev,
                    ...(zipCode !== undefined ? { zipcode: zipCode } : {}),
                    ...(province !== undefined ? { state: province } : {}),
                    ...(city !== undefined ? { city } : {}),
                  }))
                }
              />

              <Field
                label="Entre calles"
                name="betweenStreets"
                value={form.betweenStreets}
                onChange={handleChange}
                placeholder="Opcional"
              />

              <Field
                label="Horarios de atención"
                name="hours"
                value={form.hours}
                onChange={handleChange}
                placeholder="Ej: Lun-Vie de 9 a 18 hs"
              />

              <Field
                label="Notas para el comprador"
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Ej: Timbre 2B, preguntar por Juan"
              />

              <label className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-[#252525] cursor-pointer">
                <input
                  type="checkbox"
                  name="isDefault"
                  checked={form.isDefault}
                  onChange={handleChange}
                  className="w-5 h-5 rounded-md text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-semibold dark:text-white">
                  Usar como punto predeterminado
                </span>
              </label>
            </div>

            {/* FOOTER */}
            <div className="flex items-center justify-end gap-3 p-6 pt-0">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-3 rounded-2xl font-bold text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm"
              >
                {saving ? "Guardando..." : (
                  <>
                    <Save size={16} /> Guardar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Input reutilizable con label + error.
function Field({ label, name, value, onChange, placeholder, error }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
        {label}
      </label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full bg-gray-50 dark:bg-[#252525] border ${error ? "border-red-500" : "border-gray-200 dark:border-gray-800"} rounded-2xl p-3.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:text-white`}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
