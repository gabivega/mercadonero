import { useMemo, useState, useRef, useEffect } from "react";
import { MapPin, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import {
  existeCP,
  getProvincia,
  getProvincias,
  getProvinciasLocalidades,
  normalizarCP,
} from "../Utils/postalCodes";

/**
 * Input de Código Postal con autocompletado de provincia y localidad.
 *
 * Es un componente CONTROLADO: el padre es dueño del estado. Vos le pasás
 * los valores y te avisa los cambios vía `onChange`. Además, cuando el CP
 * es válido, ofrece la lista de localidades para elegir.
 *
 * Props:
 *   - zipCode: string        (valor actual del CP)
 *   - province: string       (valor actual de provincia)
 *   - city: string           (valor actual de localidad/ciudad)
 *   - onChange: (patch) => void
 *         Recibe un objeto parcial, ej: { zipCode, province, city }.
 *   - disabled, error (string) — opcional.
 *   - cityAsSelect: bool — si true, cuando hay varias localidades para el CP
 *         se muestra un <select>; si false, un input con datalist.
 *   - labels: { zipCode, province, city } — textos de los labels.
 *
 * Comportamiento:
 *   - Escribe un CP de 4 dígitos → dispara la búsqueda.
 *   - CP válido → autocompleta province (provincia dominante) y ofrece
 *     las localidades. Si hay una sola localidad, autocompleta city.
 *   - CP válido en VARIAS provincias (ej: 6300 → La Pampa y San Luis):
 *     la provincia pasa a ser un <select> con esas provincias y las
 *     localidades se filtran por la elegida. La provincia NUNCA se deja
 *     como texto libre.
 *   - CP inválido → marca error visual y limpia provincia/localidad.
 */

const DEFAULT_LABELS = {
  zipCode: "Código Postal",
  province: "Provincia",
  city: "Localidad / Ciudad",
};

const inputBase =
  "w-full p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border outline-none focus:border-[#F26722] dark:text-white transition-colors";

export default function PostalCodeInput({
  zipCode = "",
  province = "",
  city = "",
  onChange,
  disabled = false,
  error = "",
  cityAsSelect = false,
  labels: labelsProp,
}) {
  const labels = { ...DEFAULT_LABELS, ...(labelsProp || {}) };
  const [touched, setTouched] = useState(false);
  const datalistId = useRef(
    `cp-loc-${Math.random().toString(36).slice(2, 8)}`,
  );
  // Pequeño delay de "buscando" para dar feedback visual.
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);

  const cp = normalizarCP(zipCode);
  const esValido = cp !== "" && existeCP(cp);

  // Provincias en las que aparece el CP (dominante primero).
  const provincias = useMemo(() => {
    if (!esValido) return [];
    return getProvincias(cp);
  }, [cp, esValido]);

  // El CP existe en más de una provincia → el usuario debe elegir.
  const provinciasMultiples = provincias.length > 1;

  // Localidades disponibles para el CP, filtradas por la provincia elegida.
  // Si el CP es multi-provincia y todavía no se eligió, mostramos TODAS
  // (rotuladas con su provincia) para no esconder opciones.
  const localidades = useMemo(() => {
    if (!esValido) return [];
    const source = getProvinciasLocalidades(cp);
    const filtro =
      provinciasMultiples && province ? province : null;
    const map = new Map(); // localidad -> provincia (primera encontrada)
    for (const { provincia, localidad } of source) {
      if (filtro && provincia !== filtro) continue;
      if (!map.has(localidad)) map.set(localidad, provincia);
    }
    return [...map.entries()]
      .map(([localidad, provincia]) => ({ localidad, provincia }))
      .sort((a, b) => a.localidad.localeCompare(b.localidad));
  }, [cp, esValido, province, provinciasMultiples]);

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  // Manejo del cambio del CP.
  const handleCpChange = (raw) => {
    const limpio = String(raw).replace(/\D/g, "").slice(0, 4);
    setTouched(false);
    setSearching(limpio.length === 4);

    // Simulamos una búsqueda corta para mostrar spinner (UX).
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearching(false), 180);

    // Si el CP es válido, autocompletamos la provincia dominante y, si hay
    // una sola localidad en total, también la ciudad. Si el CP existe en
    // varias provincias, NO autocompletamos ciudad (el usuario elige
    // provincia y luego localidad).
    const valido = limpio.length === 4 && existeCP(limpio);
    if (valido) {
      const provinciaDom = getProvincia(limpio);
      const provs = getProvincias(limpio);
      const locs = new Set(
        getProvinciasLocalidades(limpio).map((x) => x.localidad),
      );
      const patch = { zipCode: limpio, province: provinciaDom };
      if (provs.length === 1 && locs.size === 1) patch.city = [...locs][0];
      onChange?.(patch);
    } else {
      // CP incompleto o inexistente: limpiamos lo autocompletado.
      onChange?.({ zipCode: limpio, province: "", city: "" });
    }
  };

  const handleCityChange = (value) => {
    // Si el CP es multi-provincia y todavía no se eligió provincia, la
    // inferimos de la localidad elegida SOLO si esa localidad pertenece a
    // una única provincia dentro del CP. Si es ambigua (ej: "Santa Rosa"
    // existe en La Pampa y en San Luis), no adivinamos: el usuario debe
    // elegir la provincia.
    if (provinciasMultiples && !province && value) {
      const provs = new Set(
        getProvinciasLocalidades(cp)
          .filter((x) => x.localidad === value)
          .map((x) => x.provincia),
      );
      if (provs.size === 1) {
        return onChange?.({ city: value, province: [...provs][0] });
      }
    }
    onChange?.({ city: value });
  };

  // Cambio manual de provincia (solo posible cuando el CP es multi-provincia).
  // Reseteamos la ciudad porque las localidades cambian con la provincia.
  const handleProvinceChange = (value) => {
    onChange?.({ province: value, city: "" });
  };

  // Mostramos error si: hay error explícito del padre, o el CP fue tocado
  // y no existe.
  const mostrarError =
    error || (touched && zipCode.length === 4 && !esValido);

  return (
    <div className="space-y-3">
      {/* CP */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
          {labels.zipCode}
        </label>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            disabled={disabled}
            placeholder="Ej: 1043"
            value={zipCode}
            onChange={(e) => handleCpChange(e.target.value)}
            onBlur={() => setTouched(true)}
            className={`${inputBase} ${
              mostrarError
                ? "border-red-500"
                : esValido
                  ? "border-green-500/60"
                  : "border-zinc-200 dark:border-zinc-700"
            }`}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2">
            {searching ? (
              <Loader2 size={16} className="animate-spin text-gray-400" />
            ) : esValido ? (
              <CheckCircle2 size={16} className="text-green-500" />
            ) : null}
          </span>
        </div>
        {mostrarError && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle size={12} />
            {error || "Ese código postal no existe en Argentina."}
          </p>
        )}
      </div>

      {/* Provincia: input fijo si el CP es de una sola provincia; select
          si el CP aparece en varias (ej: 6300 → La Pampa y San Luis). */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
          {labels.province}
        </label>
        {provinciasMultiples ? (
          <select
            disabled={disabled}
            value={province}
            onChange={(e) => handleProvinceChange(e.target.value)}
            className={`${inputBase} border-zinc-200 dark:border-zinc-700 appearance-none`}
          >
            <option value="">Seleccionar provincia...</option>
            {provincias.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            readOnly
            tabIndex={-1}
            disabled={disabled}
            value={province}
            placeholder="Se completa con el CP"
            className={`${inputBase} border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 text-gray-500 dark:text-gray-400 cursor-default`}
          />
        )}
        {provinciasMultiples && (
          <p className="text-[11px] text-amber-500 flex items-center gap-1">
            <AlertCircle size={12} />
            Este CP existe en {provincias.length} provincias. Elegí la correcta.
          </p>
        )}
      </div>

      {/* Localidad / Ciudad */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-black text-gray-400 uppercase tracking-widest">
          {labels.city}
        </label>

        {cityAsSelect && localidades.length > 1 ? (
          <select
            disabled={disabled || !esValido}
            value={city}
            onChange={(e) => handleCityChange(e.target.value)}
            className={`${inputBase} border-zinc-200 dark:border-zinc-700 appearance-none`}
          >
            <option value="">Seleccionar localidad...</option>
            {localidades.map(({ localidad, provincia }) => (
              <option key={localidad} value={localidad}>
                {provinciasMultiples && !province
                  ? `${localidad} — ${provincia}`
                  : localidad}
              </option>
            ))}
          </select>
        ) : (
          <>
            <input
              type="text"
              disabled={disabled || !esValido}
              value={city}
              placeholder={
                esValido ? "Localidad" : "Se completa con el CP"
              }
              onChange={(e) => handleCityChange(e.target.value)}
              list={localidades.length > 1 ? datalistId.current : undefined}
              className={`${inputBase} border-zinc-200 dark:border-zinc-700`}
            />
            {localidades.length > 1 && (
              <datalist id={datalistId.current}>
                {localidades.map(({ localidad }) => (
                  <option key={localidad} value={localidad} />
                ))}
              </datalist>
            )}
          </>
        )}

        {/* Sugerencia de localidades cuando hay varias */}
        {esValido && localidades.length > 1 && !cityAsSelect && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <span className="text-[10px] text-gray-400 flex items-center gap-1 mr-1">
              <MapPin size={11} /> {localidades.length} localidades:
            </span>
            {localidades.slice(0, 6).map(({ localidad }) => (
              <button
                key={localidad}
                type="button"
                onClick={() => handleCityChange(localidad)}
                className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-[#F26722]/10 hover:text-[#F26722] transition-colors"
              >
                {localidad}
              </button>
            ))}
            {localidades.length > 6 && (
              <span className="text-[11px] text-gray-400 self-center">
                +{localidades.length - 6} más
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
