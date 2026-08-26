import React, { useState, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import axios from 'axios';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { allCategories } from '../data/allCategories.js';
import { useUserStore } from '../store/useUserStore';
import { useSyncUser } from '../Utils/userSync';
import SellerOnboarding from './SellerOnboarding.jsx';
import {
  Import,
  FileSpreadsheet,
  FileDown,
  Link as LinkIcon,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
} from 'lucide-react';

const MAX_LINKS = 5;
const MAX_IMAGES = 3;

// Mapa de categorías/subcategorías oficiales de la plataforma (fuente única de verdad).
// Los vendedores NO pueden inventar categorías: deben usar exactamente estos slugs.
const categoryMap = new Map(
  allCategories.map((cat) => [
    cat.slug,
    new Set((cat.subcategories || []).map((s) => s.slug)),
  ])
);

export const ImportSection = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { getAccessToken } = usePrivy();

  // ── ONBOARDING VENDEDOR ──
  const { dbUser, setDbUser } = useUserStore();
  const { syncUser } = useSyncUser(setDbUser);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [pendingBulk, setPendingBulk] = useState(null);
  const onboardingComplete = Boolean(dbUser?.shop?.active);
  const onboardingPrefill = {
    firstName: dbUser?.firstName || "",
    lastName: dbUser?.lastName || "",
    dni: dbUser?.dni || "",
    phone: dbUser?.phone || "",
    shopName: dbUser?.shop?.name || "",
    taxCondition: dbUser?.shop?.taxCondition || "",
  };
    const handleOnboardingComplete = async (draft) => {
    setIsOnboardingOpen(false);
    await syncUser();
    if (draft) await handleBulkSubmit(true); // force=true: ya completó el onboarding
  };

  const [links, setLinks] = useState(['']);
  const [isImporting, setIsImporting] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  const addLink = () => {
    if (links.length < MAX_LINKS) {
      setLinks([...links, '']);
    }
  };

  const removeLink = (index) => {
    if (links.length > 1) {
      const filtered = links.filter((_, i) => i !== index);
      setLinks(filtered);
    }
  };

  const updateLink = (value, index) => {
    const updated = [...links];
    updated[index] = value;
    setLinks(updated);
  };

    const validLinks = links.map((l) => l.trim()).filter(Boolean);

    // ── PLANTILLA DE EJEMPLO ──
    const downloadTemplate = () => {
      const template = [
        {
          titulo: 'Parlante Bluetooth Portátil',
          marca: 'JBL',
          categoria: 'electronica-audio-y-video',
          subcategoria: 'audio',
          moneda: 'ARS',
          precio: '120000',
          precio_oferta: '99000',
          estado: 'new',
          stock: '10',
          descripcion: 'Parlante portátil con batería de 20 horas y resistencia al agua IPX7. Perfecto para exteriores.',
          imagen1: 'https://example.com/parlante1.jpg',
          imagen2: 'https://example.com/parlante2.jpg',
          imagen3: '',
          envio_digital: 'NO',
          link_digital: '',
          envio_gratis: 'SI',
          costo_envio: '',
          peso_kg: '1.2',
          largo_cm: '20',
          ancho_cm: '10',
          alto_cm: '8',
          tiempo_despacho: '24h',
        },
        {
          titulo: 'Cargador Inalámbrico Universal',
          marca: 'Samsung',
          categoria: 'celulares-y-telefonos',
          subcategoria: 'accesorios-para-celulares',
          moneda: 'ARS',
          precio: '45000',
          precio_oferta: '',
          estado: 'new',
          stock: '25',
          descripcion: 'Cargador inalámbrico de 15W con carga rápida. Compatible con iPhone y Android.',
          imagen1: 'https://example.com/cargador.jpg',
          imagen2: '',
          imagen3: '',
          envio_digital: 'NO',
          link_digital: '',
          envio_gratis: 'NO',
          costo_envio: '5000',
          peso_kg: '0.4',
          largo_cm: '10',
          ancho_cm: '10',
          alto_cm: '2',
          tiempo_despacho: '48h',
        },
      ];

      const ws = XLSX.utils.json_to_sheet(template);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Productos');
      XLSX.writeFile(wb, 'plantilla-productos-nero.xlsx');
    };

    // ── DESCARGA DEL LISTADO OFICIAL DE CATEGORÍAS ──
    const downloadCategoriesList = () => {
      const rows = [];
      allCategories.forEach((cat) => {
        const subs = cat.subcategories || [];
        if (subs.length === 0) {
          rows.push({ categoria: cat.slug, categoria_nombre: cat.name, subcategoria: '', subcategoria_nombre: '' });
        } else {
          subs.forEach((sub) => {
            rows.push({ categoria: cat.slug, categoria_nombre: cat.name, subcategoria: sub.slug, subcategoria_nombre: sub.name });
          });
        }
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Categorias');
      XLSX.writeFile(wb, 'categorias-oficiales-nero.xlsx');
    };

    // ── MAPEO DE FILAS DEL EXCEL ──
    const mapRow = (row, index) => {
      const errors = [];
      const get = (key) => {
        const val = row[key];
        if (val === undefined || val === null) return '';
        return String(val).trim();
      };

      const name = get('titulo');
      const brand = get('marca');
      const category = get('categoria').toLowerCase();
      const subCategory = get('subcategoria').toLowerCase();
      const description = get('descripcion');
      const price = Number(get('precio')) || 0;
      const salePrice = Number(get('precio_oferta')) || 0;
      const currency = get('moneda').toUpperCase() === 'USD' ? 'USD' : 'ARS';
      const conditionRaw = get('estado').toLowerCase();
      const condition = conditionRaw.includes('us') ? 'used'
        : conditionRaw.includes('reacond') ? 'refurbished' : 'new';
      const stock = Number(get('stock')) || 1;

      const isDigital = ['si', 'sí', 'true', '1', 's'].includes(get('envio_digital').trim().toLowerCase());
      const digitalUrl = get('link_digital');
      const freeShipping = !isDigital && ['si', 'sí', 'true', '1', 's'].includes(get('envio_gratis').trim().toLowerCase());
      const shippingCost = Number(get('costo_envio')) || 0;
      const weight = Number(get('peso_kg')) || 0;
      const length = Number(get('largo_cm')) || 0;
      const width = Number(get('ancho_cm')) || 0;
      const height = Number(get('alto_cm')) || 0;
      const shippingTimeRaw = get('tiempo_despacho');
      const shippingTime = shippingTimeRaw.includes('48') ? '48h'
        : shippingTimeRaw.includes('72') ? '72h'
        : shippingTimeRaw.includes('mas') || shippingTimeRaw.includes('más') ? 'more'
        : '24h';

      // URLs de imágenes (máximo 3)
      const imageUrls = [get('imagen1'), get('imagen2'), get('imagen3')]
        .filter(Boolean)
        .slice(0, MAX_IMAGES);

      const needsBrand = !['inmuebles', 'servicios'].includes(category);

      // Validaciones
      if (!name) errors.push(`Fila ${index + 2}: falta el título.`);
      else if (name.length < 5) errors.push(`Fila ${index + 2}: el título es demasiado corto (mín. 5 caracteres).`);
            if (!description) errors.push(`Fila ${index + 2}: falta la descripción.`);

      // Validación estricta contra las categorías/subcategorías oficiales de la plataforma.
      // No se permiten categorías inventadas: solo los slugs del listado oficial.
      if (!category) {
        errors.push(`Fila ${index + 2}: falta la categoría.`);
      } else if (!categoryMap.has(category)) {
        errors.push(`Fila ${index + 2}: la categoría '${category}' no existe en la plataforma. Usá un slug oficial (ej. 'celulares-y-telefonos'). Descargá el listado de categorías.`);
      } else if (subCategory && !categoryMap.get(category).has(subCategory)) {
        errors.push(`Fila ${index + 2}: la subcategoría '${subCategory}' no pertenece a '${category}'. Revisá el listado oficial.`);
      }
      if (needsBrand && !brand) errors.push(`Fila ${index + 2}: falta la marca.`);
      if (price <= 0) errors.push(`Fila ${index + 2}: el precio debe ser mayor a cero.`);
      if (salePrice > 0 && salePrice >= price) errors.push(`Fila ${index + 2}: el precio de oferta debe ser menor al precio original.`);

      imageUrls.forEach((url) => {
        try { new URL(url); } catch { errors.push(`Fila ${index + 2}: URL de imagen inválida: ${url}`); }
      });

      const data = {
        name,
        brand: needsBrand ? brand : undefined,
        description,
        price,
        currency,
        sale: salePrice > 0 ? { active: true, price: salePrice } : { active: false, price: 0 },
        stock: Math.floor(stock),
        category,
        subCategory: subCategory || '',
        condition,
        images: imageUrls.map((url, i) => ({ url, isMain: i === 0 })),
        shipping: {
          isDigital,
          free: freeShipping,
          cost: isDigital ? 0 : shippingCost,
          dimensions: { weight, length, width, height },
          shippingTime,
        },
                listingType: 'product',
        source: 'manual',
      };

      if (isDigital && digitalUrl) data.shipping.digitalUrl = digitalUrl;

      return { data, errors, hasErrors: errors.length > 0 };
    };

    // ── PROCESAR ARCHIVO EXCEL/CSV ──
    const handleFileChange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setParsing(true);
      setFileName(file.name);

      try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonRows = XLSX.utils.sheet_to_json(sheet);

        if (jsonRows.length === 0) throw new Error('El archivo está vacío o no tiene filas con datos.');

        const rows = jsonRows.map((row, i) => mapRow(row, i));
        setParsedRows(rows);

        const validCount = rows.filter((r) => !r.hasErrors).length;
        const errorCount = rows.length - validCount;

        Swal.fire({
          title: 'Archivo cargado',
          html: `<p class="text-sm text-gray-400">Se detectaron <b class="text-white">${rows.length}</b> fila(s).<br/>
            <span class="text-green-400">✅ ${validCount} válidas</span><br/>
            <span class="text-red-400">⚠️ ${errorCount} con errores</span></p>`,
          icon: 'info',
          background: '#1A1A1A',
          color: '#ffffff',
          confirmButtonColor: '#2563eb',
          customClass: { popup: 'rounded-3xl border border-gray-800' },
        });
      } catch (err) {
        console.error(err);
        Swal.fire({
          title: 'Error al leer el archivo',
          text: err.message || 'Asegurate de que sea un archivo Excel (.xlsx/.xls) o CSV válido.',
          icon: 'error',
          background: '#1A1A1A',
          color: '#ffffff',
          confirmButtonColor: '#2563eb',
          customClass: { popup: 'rounded-3xl border border-gray-800' },
        });
      } finally {
        setParsing(false);
        e.target.value = null;
      }
    };

    // ── ENVIAR PRODUCTOS VÁLIDOS AL BACKEND ──
        const handleBulkSubmit = async (force = false) => {
          // ── BLOQUEO DE ONBOARDING VENDEDOR ──
          // La carga masiva SIEMPRE crea productos de pago (listingType 'product').
          // Si no completó el onboarding (y no viene forzado desde el modal ya cerrado),
          // guardamos el draft y abrimos el modal.
          if (!onboardingComplete && !force) {
            setPendingBulk(parsedRows);
            setIsOnboardingOpen(true);
            return;
          }

          const validProducts = parsedRows.filter((r) => !r.hasErrors).map((r) => r.data);

      if (validProducts.length === 0) {
        Swal.fire({
          title: 'Sin productos válidos',
          text: 'Corrige los errores en el archivo y vuelve a cargarlo.',
          icon: 'warning',
          background: '#1A1A1A',
          color: '#ffffff',
          confirmButtonColor: '#2563eb',
          customClass: { popup: 'rounded-3xl border border-gray-800' },
        });
        return;
      }

      setIsBulkSubmitting(true);
      try {
        const token = await getAccessToken();
        const { data } = await axios.post(
          `${import.meta.env.VITE_SERVER_URL}/api/product/bulk-import`,
          { products: validProducts },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setParsedRows([]);
        setFileName('');

        Swal.fire({
          title: data.success ? '¡Importación completada!' : 'Importación parcial',
          html: `<p class="text-sm text-gray-400">
            <span class="text-green-400">✅ ${data.created} producto(s) importado(s)</span><br/>
            ${data.failed > 0 ? `<span class="text-red-400">⚠️ ${data.failed} con errores</span>` : ''}
          </p>`,
          icon: data.failed > 0 ? 'warning' : 'success',
          background: '#1A1A1A',
          color: '#ffffff',
          confirmButtonColor: '#2563eb',
          customClass: { popup: 'rounded-3xl border border-gray-800' },
        });
      } catch (error) {
        console.error(error);
        const errorMsg = error.response?.data?.message || error.message;
        Swal.fire({
          title: 'Error al importar',
          text: errorMsg,
          icon: 'error',
          background: '#1A1A1A',
          color: '#ffffff',
          confirmButtonColor: '#2563eb',
          customClass: { popup: 'rounded-3xl border border-gray-800' },
        });
      } finally {
        setIsBulkSubmitting(false);
      }
    };

    const validCount = parsedRows.filter((r) => !r.hasErrors).length;
    const errorCount = parsedRows.length - validCount;

    // ⚠️ IMPORTACIÓN POR LINK (Mercado Libre) — se mantiene deshabilitada
    const handleImport = async () => {
    if (!isImporting) {
      setIsImporting(true);
      setTimeout(() => setIsImporting(false), 600);
    }
    return Swal.fire({
      title: 'Importación temporalmente deshabilitada',
      text: 'La sincronización con Mercado Libre está momentáneamente suspendida por cambios en sus políticas de acceso. Estamos trabajando para reactivarla con una solución estable. Disculpá las molestias.',
      icon: 'info',
      background: '#1A1A1A',
      color: '#ffffff',
      confirmButtonColor: '#2563eb',
      customClass: { popup: 'rounded-3xl border border-gray-800' },
    });
  };

  return (
    <>
    <div className="mb-8 w-full transition-all duration-300 mt-5">
      {/* Botón Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between p-5 rounded-[24px] border transition-all duration-300 ${
          isOpen
            ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20'
            : 'bg-white dark:bg-[#1A1A1A] border-gray-100 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:border-blue-500/50'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${isOpen ? 'bg-white/20' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-600'}`}>
            <Import size={20} />
          </div>
          <div className="text-left">
            <span className="block font-black text-sm uppercase tracking-wider">Carga Masiva e Importación</span>
            {!isOpen && <span className="text-[10px] opacity-60 uppercase font-bold">Excel / CSV, Mercado Libre, Amazon...</span>}
          </div>
        </div>
        {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
      </button>

      {/* Contenido Expandible */}
      <div
        className={`overflow-hidden transition-all duration-500 ease-in-out ${
          isOpen ? 'max-h-[2500px] opacity-100 mt-4' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="p-1 bg-gradient-to-r from-blue-600/10 to-purple-600/10 rounded-[32px] border border-blue-500/10">
          <div className="bg-white dark:bg-[#1A1A1A] rounded-[30px] p-6 flex flex-col gap-6">
            {/* Header + Acciones */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-blue-500" />
                  <h3 className="font-black text-[11px] uppercase tracking-wider dark:text-white text-gray-500">Optimiza tu inventario</h3>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-[280px]">
                  Sincronizá tus productos de otras plataformas en segundos.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 w-full md:w-auto">
                <button
                  onClick={() => setShowLinkForm(!showLinkForm)}
                  className={`md:w-[200px] flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 rounded-2xl font-bold text-xs transition-all dark:text-white ${
                    showLinkForm
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10'
                  }`}
                >
                  <LinkIcon size={16} />
                  IMPORTAR POR LINK
                                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="md:w-[220px] flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 text-white rounded-2xl font-bold text-xs shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all uppercase tracking-tighter"
                >
                  {parsing ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
                  {parsing ? 'Procesando...' : 'Subir CSV / Excel'}
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            {/* Zona de instrucciones + plantilla */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-green-500/10 flex items-center justify-center">
                    <FileSpreadsheet size={14} className="text-green-500" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm dark:text-white uppercase tracking-tight">Carga masiva con Excel/CSV</h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Usa la plantilla como guía. Mínimo las columnas: titulo, marca, categoria, precio, descripcion
                    </p>
                  </div>
                </div>
                                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={downloadTemplate}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 font-bold text-xs transition-all"
                  >
                    <FileDown size={16} />
                    Plantilla (.xlsx)
                  </button>
                  <button
                    onClick={downloadCategoriesList}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 font-bold text-xs transition-all"
                    title="Descargá el listado oficial con los slugs de categorías y subcategorías que podés usar"
                  >
                    <FileDown size={16} />
                    Categorías oficiales
                  </button>
                </div>
              </div>

              {/* Leyenda de columnas esperadas */}
              <div className="mt-3 bg-blue-500/5 dark:bg-white/5 rounded-xl p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-1.5 flex items-center gap-1">
                  <AlertTriangle size={11} /> Columnas aceptadas
                </p>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  {[
                    'titulo', 'marca', 'categoria', 'subcategoria', 'moneda', 'precio',
                    'precio_oferta', 'estado', 'stock', 'descripcion', 'imagen1', 'imagen2',
                    'imagen3', 'envio_digital', 'link_digital', 'envio_gratis', 'costo_envio',
                    'peso_kg', 'largo_cm', 'ancho_cm', 'alto_cm', 'tiempo_despacho',
                  ].map((col) => (
                    <span key={col} className="px-2 py-1 rounded-lg bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-800 font-mono">
                      {col}
                    </span>
                  ))}
                </div>
                                <p className="text-[10px] text-gray-400 mt-2">
                  💡 Podés dejar <b>imagen1, imagen2, imagen3</b> vacías y cargar las fotos luego desde el editor del producto. Máximo 3 URLs por producto.
                </p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5 flex items-start gap-1">
                  <AlertTriangle size={11} className="flex-shrink-0 mt-px" />
                  <span>
                    Las columnas <b>categoria</b> y <b>subcategoria</b> deben usar <b>exactamente</b> los slugs del listado oficial de la plataforma. No se aceptan categorías inventadas. Descargá el listado en "Categorías oficiales".
                  </span>
                </p>
              </div>
            </div>

            {/* Resumen de filas detectadas */}
            {parsedRows.length > 0 && (
              <div className="border-t border-gray-100 dark:border-gray-800 pt-6 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-black text-sm dark:text-white uppercase tracking-tighter flex items-center gap-2">
                      <FileSpreadsheet size={16} className="text-blue-500" />
                      Previsualización <span className="text-gray-400 normal-case">· {fileName}</span>
                    </h4>
                    <p className="text-xs mt-0.5">
                      <span className="text-green-500 font-bold">{validCount} válida(s)</span>
                      {errorCount > 0 && <span className="text-red-500 font-bold"> · {errorCount} con errores</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => { setParsedRows([]); setFileName(''); }}
                    className="p-2 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-500 hover:text-red-500 transition-colors"
                    title="Limpiar previsualización"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Tabla de resumen */}
                <div className="max-h-64 overflow-y-auto rounded-2xl border border-gray-100 dark:border-gray-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 dark:bg-white/5 sticky top-0">
                      <tr className="text-[10px] uppercase tracking-wider text-gray-500">
                        <th className="p-3">#</th>
                        <th className="p-3">Título</th>
                        <th className="p-3">Precio</th>
                        <th className="p-3">Imágenes</th>
                        <th className="p-3">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.map((row, i) => (
                        <tr key={i} className={`border-t border-gray-50 dark:border-gray-800 ${row.hasErrors ? 'bg-red-500/5' : ''}`}>
                          <td className="p-3 font-mono text-gray-400">{i + 2}</td>
                          <td className="p-3 font-semibold dark:text-white truncate max-w-[180px]">{row.data.name || '— sin título —'}</td>
                          <td className="p-3 text-blue-600 font-bold">${Number(row.data.price).toLocaleString()}</td>
                          <td className="p-3 font-mono text-gray-500">{row.data.images.length}/3</td>
                          <td className="p-3">
                            {row.hasErrors ? (
                              <span className="flex items-center gap-1 text-red-500 font-bold uppercase text-[10px]">
                                <AlertTriangle size={12} /> Error
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-green-500 font-bold uppercase text-[10px]">
                                <CheckCircle2 size={12} /> Ok
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Lista de errores detallados */}
                {errorCount > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {parsedRows.filter((r) => r.hasErrors).map((row, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-[11px] text-red-500 bg-red-500/5 rounded-xl p-2.5">
                        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                        <div>
                          {row.errors.map((err, k) => <p key={k}>{err}</p>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Botón de importación */}
                <div className="mt-5 flex items-center justify-end">
                  <button
                    onClick={handleBulkSubmit}
                    disabled={isBulkSubmitting || validCount === 0}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isBulkSubmitting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Importando {validCount}...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} /> IMPORTAR {validCount} PRODUCTO(S)
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Formulario de Links (Mercado Libre) */}
            {showLinkForm && (
              <div className="border-t border-gray-100 dark:border-gray-800 pt-6 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 bg-yellow-400 rounded-md flex items-center justify-center">
                    <span className="text-[10px] font-black text-yellow-950">ML</span>
                  </div>
                  <h4 className="font-black text-sm dark:text-white uppercase tracking-tight">
                    Importar desde Mercado Libre
                  </h4>
                  <span className="ml-auto text-[10px] font-bold uppercase text-gray-400">
                    {links.length}/{MAX_LINKS}
                  </span>
                </div>

                <div className="space-y-3">
                  {links.map((link, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="url"
                        value={link}
                        onChange={(e) => updateLink(e.target.value, index)}
                        placeholder="https://articulo.mercadolibre.com.ar/MLA-XXXX-..."
                        className="flex-1 px-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-sm dark:text-white focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => removeLink(index)}
                        disabled={links.length === 1}
                        className="p-2 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-400 hover:text-red-500 dark:text-gray-300 disabled:opacity-30"
                        title="Quitar link"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                {links.length < MAX_LINKS && (
                  <button
                    onClick={addLink}
                    className="mt-3 flex items-center gap-2 text-blue-600 text-xs font-bold hover:text-blue-700 transition-colors"
                  >
                    <Plus size={16} /> Agregar otro link
                  </button>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    Traemos título, precio, fotos y descripción.
                  </p>
                  <button
                    onClick={handleImport}
                    disabled={isImporting || validLinks.length === 0}
                    className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Importando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} /> IMPORTAR ({validLinks.length})
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
                </div>
      </div>
    </div>

    {/* Modal de Onboarding Vendedor (carga masiva) */}
        <SellerOnboarding
      isOpen={isOnboardingOpen}
      onClose={() => setIsOnboardingOpen(false)}
      onComplete={handleOnboardingComplete}
      draft={pendingBulk}
      prefill={onboardingPrefill}
    />
    </>
  );
};

