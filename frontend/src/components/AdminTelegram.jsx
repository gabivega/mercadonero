import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { usePrivy } from "../Utils/authClient";
import Swal from "sweetalert2";
import {
  Send,
  Link2,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Smartphone,
  BellRing,
  Power,
} from "lucide-react";

// ────────────────────────────────────────────────────────────────────────────
// AdminTelegram
//
// Panel de ADMIN para controlar las notificaciones por TELEGRAM del panel.
// Todo el backend vive en `/api/telegram` (solo admin):
//   GET   /status   → estado de conexión + catálogo de eventos
//   POST  /link     → detecta y vincula el chat_id (requiere /start al bot)
//   POST  /chat-id  → setea chat_id explícito (grupo o privado)
//   POST  /test     → manda un mensaje de prueba
//   PATCH /events   → enciende/apaga el interruptor maestro y cada evento
//
// ¿Por qué esta pantalla existe? Sin ella, para vincular el bot o cambiar qué
// eventos llegan había que llamar a los endpoints con PowerShell. Esto lo hace
// en dos clicks desde el panel.
// ────────────────────────────────────────────────────────────────────────────

export default function AdminTelegram() {
  const { getAccessToken } = usePrivy();
  const serverUrl = import.meta.env.VITE_SERVER_URL;

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // "link" | "test" | "save" | "chat" | "master"
  const [chatIdInput, setChatIdInput] = useState("");

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }, [getAccessToken]);

  const alert = (title, text, icon = "info") =>
    Swal.fire({ title, text, icon, background: "#1A1A1A", color: "#fff" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${serverUrl}/api/telegram/status`, {
        headers: await authHeaders(),
      });
      setStatus(data);
      setChatIdInput(data?.chatId || "");
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      alert("Error", msg, "error");
    } finally {
      setLoading(false);
    }
  }, [serverUrl, authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  const handleLink = async () => {
    setBusy("link");
    try {
      const { data } = await axios.post(
        `${serverUrl}/api/telegram/link`,
        {},
        { headers: await authHeaders() },
      );
      await alert("Chat vinculado", data.message || "Listo.", "success");
      await load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      alert("No se pudo vincular", msg, "error");
    } finally {
      setBusy(null);
    }
  };

  const handleSaveChatId = async () => {
    setBusy("chat");
    try {
      await axios.post(
        `${serverUrl}/api/telegram/chat-id`,
        { chatId: chatIdInput },
        { headers: await authHeaders() },
      );
      await alert("Guardado", "chat_id actualizado.", "success");
      await load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      alert("Error", msg, "error");
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    setBusy("test");
    try {
      const { data } = await axios.post(
        `${serverUrl}/api/telegram/test`,
        {},
        { headers: await authHeaders() },
      );
      await alert("Prueba enviada", data.message || "Revisá Telegram.", "success");
      await load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      alert("No se pudo enviar", msg, "error");
    } finally {
      setBusy(null);
    }
  };

  const patchConfig = async (payload, busyKey = "save") => {
    setBusy(busyKey);
    try {
      await axios.patch(`${serverUrl}/api/telegram/events`, payload, {
        headers: await authHeaders(),
      });
      await load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      alert("Error", msg, "error");
      // Releemos para no dejar la UI con un estado que el server rechazó.
      await load();
    } finally {
      setBusy(null);
    }
  };

  const toggleEvent = (key, enabled) =>
    patchConfig({ events: { [key]: enabled } });

  const toggleMaster = (enabled) => patchConfig({ enabled }, "master");

  // ── Estados de carga ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="animate-spin text-[#F26722]" size={28} />
      </div>
    );
  }

  // Agrupamos el catálogo por categoría para la UI.
  const grouped = (status?.events || []).reduce((acc, ev) => {
    acc[ev.group] = acc[ev.group] || [];
    acc[ev.group].push(ev);
    return acc;
  }, {});

  const tokenOk = status?.botConfigured === true;
  const chatOk = Boolean(status?.chatId);
  const ready = tokenOk && chatOk;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── ESTADO DE LA CONEXIÓN ── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F26722]/10 flex items-center justify-center">
              <Smartphone className="text-[#F26722]" size={20} />
            </div>
            <div>
              <h2 className="font-black uppercase italic text-sm">
                Notificaciones por Telegram
              </h2>
              <p className="text-xs text-zinc-500">
                Alertas del panel directo a tu celular
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
                ready
                  ? "bg-green-500/10 text-green-600"
                  : "bg-amber-500/10 text-amber-600"
              }`}
            >
              {ready ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {ready ? "Conectado" : "Falta configurar"}
            </span>
            <button
              onClick={load}
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Actualizar"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* Checklist de configuración */}
        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          <StatusRow
            ok={tokenOk}
            title="Token del bot"
            detail={
              tokenOk
                ? "Configurado en el .env del backend"
                : "Falta TELEGRAM_BOT_TOKEN en backend/.env"
            }
          />
          <StatusRow
            ok={chatOk}
            title="Chat de destino"
            detail={
              chatOk
                ? `${status.chatId} (origen: ${
                    status.chatSource === "db" ? "panel" : "env"
                  })`
                : "Sin vincular"
            }
          />
        </div>

        {status?.lastError ? (
          <div className="mt-4 flex items-start gap-2 text-xs bg-red-500/10 text-red-600 rounded-xl p-3">
            <XCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              <strong>Último error:</strong> {status.lastError}
            </span>
          </div>
        ) : null}

        {status?.lastSentAt ? (
          <p className="mt-3 text-xs text-zinc-500">
            Último mensaje enviado:{" "}
            {new Date(status.lastSentAt).toLocaleString("es-AR")}
          </p>
        ) : null}

        {/* ── ACCIONES DE VINCULACIÓN ── */}
        <div className="mt-6 pt-5 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleLink}
              disabled={busy === "link" || !tokenOk}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F26722] text-white text-sm font-bold hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy === "link" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Link2 size={16} />
              )}
              Vincular mi chat
            </button>

            <button
              onClick={handleTest}
              disabled={busy === "test" || !ready}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy === "test" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
              Enviar prueba
            </button>
          </div>

          <p className="text-xs text-zinc-500 leading-relaxed">
            <strong>Cómo vincular:</strong> abrí Telegram, buscá tu bot y
            mandale <code className="px-1 rounded bg-zinc-100 dark:bg-zinc-800">/start</code>.
            Después tocá <strong>“Vincular mi chat”</strong>. Telegram no permite
            que un bot inicie la conversación, por eso el mensaje previo es
            obligatorio.
          </p>

          {/* chat_id manual (grupos) */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-bold text-zinc-500 mb-1">
                chat_id manual (opcional, para grupos)
              </label>
              <input
                value={chatIdInput}
                onChange={(e) => setChatIdInput(e.target.value)}
                placeholder="123456789 o -1001234567890"
                className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-transparent"
              />
            </div>
            <button
              onClick={handleSaveChatId}
              disabled={busy === "chat" || !chatIdInput.trim()}
              className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-sm font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
            >
              {busy === "chat" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                "Guardar"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── INTERRUPTOR MAESTRO ── */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Power
            size={18}
            className={status?.enabled ? "text-green-500" : "text-zinc-400"}
          />
          <div>
            <p className="font-bold text-sm">Notificaciones activas</p>
            <p className="text-xs text-zinc-500">
              Interruptor general: si está apagado, no se envía nada.
            </p>
          </div>
        </div>
        <Switch
          checked={status?.enabled === true}
          onChange={toggleMaster}
          disabled={busy === "master"}
        />
      </div>

      {/* ── EVENTOS POR CATEGORÍA ── */}
      <div className="space-y-5">
        {Object.entries(grouped).map(([group, events]) => (
          <div
            key={group}
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
              <BellRing size={14} className="text-[#F26722]" />
              <h3 className="text-xs font-black uppercase tracking-wide">
                {group}
              </h3>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {events.map((ev) => (
                <li
                  key={ev.key}
                  className="px-5 py-3 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{ev.label}</p>
                    <p className="text-[11px] text-zinc-400 font-mono">
                      {ev.key}
                    </p>
                  </div>
                  <Switch
                    checked={ev.enabled}
                    onChange={(v) => toggleEvent(ev.key, v)}
                    disabled={busy === "save"}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────

function StatusRow({ ok, title, detail }) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl p-3 border ${
        ok
          ? "border-green-500/20 bg-green-500/5"
          : "border-amber-500/20 bg-amber-500/5"
      }`}
    >
      {ok ? (
        <CheckCircle2 size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
      ) : (
        <AlertTriangle
          size={16}
          className="text-amber-500 mt-0.5 flex-shrink-0"
        />
      )}
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-zinc-500 break-words">{detail}</p>
      </div>
    </div>
  );
}

function Switch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
        checked ? "bg-[#F26722]" : "bg-zinc-300 dark:bg-zinc-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
