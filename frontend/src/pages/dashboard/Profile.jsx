import { useEffect, useState } from "react";
import axios from "axios";
import {
  Shield,
  Check,
  Phone,
  Star,
  Edit,
} from "lucide-react";
import { useUserStore } from "../../store/useUserStore";
import NeroUploader from "../../components/NeroUploader";
import { AddressSection } from "../../components/AddressSection";
import { usePrivy } from "@privy-io/react-auth";
import Swal from "sweetalert2";
import genericProfile from "../../assets/img/generic-profile.png";
import BankAccountSection from "../../components/BankAccountSection";
import { InlineLoadingSpinner } from "../../components/LoadingSpinner";

export default function Profile() {
  const { dbUser, setDbUser, setAddresses } = useUserStore();
  const [profile, setProfile] = useState(
    dbUser || {
      username: "",
      firstName: "",
      lastName: "",
      addresses: [],
      dni: "",
    },
  );
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Mantenemos sincronizado el estado local del perfil cuando cambia el usuario global
  useEffect(() => {
    if (dbUser) setProfile(dbUser);
  }, [dbUser]);

    const { getAccessToken, user } = usePrivy();
  useEffect(() => {
    const fetchUserData = async () => {
      const token = await getAccessToken();
      try {
        setLoading(true);
        const response = await axios.get(
          `${import.meta.env.VITE_SERVER_URL}/api/user/profile`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        // console.log(response.data);
        setProfile(response.data);
      } catch (error) {
        // 🚩 DISPARAMOS EL SWAL AQUÍ
        Swal.fire({
          title: "Error de conexión",
          text: "No pudimos obtener tu perfil. Por favor, verificá tu conexión o intentá recargar.",
          icon: "error",
          background: "#1A1A1A",
          color: "#fff",
          showCancelButton: true,
          confirmButtonColor: "#2563eb",
          cancelButtonColor: "#374151",
          confirmButtonText: "Recargar página",
          cancelButtonText: "Cerrar",
          borderRadius: "24px",
        }).then((result) => {
          if (result.isConfirmed) {
            window.location.reload(); // Recarga física de la página
          }
        });
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleUpload = (url) => {
    setProfile({ ...profile, avatar: url });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };
  const handleSelectAddress = () => {
    return;
  };
        // Al guardar los datos personales (Teléfono, DNI, etc.)
    const handleSaveProfile = async (additionalData = {}) => {
    try {
      setIsSaving(true);

            // 🛡️ Defensa: si `additionalData` es un evento de React (por si alguien
      // lo usa como onClick={handleSaveProfile}), lo descartamos ya que solo
      // esperamos datos de AddressSection/BankAccount. Evita el error
      // "Converting circular structure to JSON".
      if (
        additionalData &&
        (typeof additionalData.nativeEvent !== "undefined" ||
          typeof additionalData.preventDefault === "function")
      ) {
        additionalData = {};
      }

      // 1. Validación de campos obligatorios SÓLO cuando se guardan datos
      //    personales (botón GUARDAR). Si viene de AddressSection/BankAccount
      //    (additionalData con addresses/bankAccounts), no la forzamos para no
      //    bloquear ese flujo a usuarios que aún no completaron el onboarding.
      const isSavingBanksOrAddresses =
        additionalData.bankAccounts !== undefined ||
        additionalData.addresses !== undefined;

      if (!isSavingBanksOrAddresses) {
        const required = ["firstName", "lastName", "dni", "phone"];
        const empty = required.find(
          (field) => !profile[field] || String(profile[field]).trim() === "",
        );
        if (empty) {
          Swal.fire({
            title: "Faltan datos",
            text: `Completá tu ${empty === "dni" ? "DNI" : empty === "firstName" ? "nombre" : empty === "lastName" ? "apellido" : "teléfono"} para poder guardar.`,
            icon: "warning",
            background: "#1A1A1A",
            color: "#fff",
            confirmButtonColor: "#2563eb",
            borderRadius: "24px",
          });
          return;
        }
      }

            // 2. Armamos el payload con datos personales únicamente.
      //    NO enviamos addresses/bankAccounts desde `profile` porque se
      //    gestionan de forma separada. Solo llegan vía `additionalData`
      //    cuando AddressSection/BankAccountSection lo requiera.
      const { addresses, bankAccounts, ...personalData } = profile;

      const token = await getAccessToken();
      const response = await axios.put(
        `${import.meta.env.VITE_SERVER_URL}/api/user/update-profile`,
        { ...personalData, ...additionalData },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.data.success) {
        const updatedUser = response.data.user;

        // 💡 Actualizamos Zustand pasando el privyId (user.id de Privy),
        //    NO response.data.user.privyId que es undefined.
        if (user?.id) {
          setDbUser(updatedUser, user.id);
        }

                // Sincronizamos el estado local con la respuesta. Como el backend ya
        // NO pisa addresses/bankAccounts cuando no vienen en el payload, el
        // updatedUser conserva los valores reales de la DB (fuente de verdad).
        setProfile((prev) => ({
          ...prev,
          ...updatedUser,
          addresses: updatedUser.addresses ?? prev.addresses,
          bankAccounts: updatedUser.bankAccounts ?? prev.bankAccounts,
        }));

        Swal.fire({
          title: "¡Perfil Actualizado!",
          text: "Tus datos se guardaron correctamente.",
          icon: "success",
          background: "#1A1A1A",
          color: "#fff",
          confirmButtonColor: "#2563eb",
          borderRadius: "24px",
        });
        setIsEditing(false);
      }
    } catch (error) {
      console.error(error);
      const message =
        error.response?.data?.message ||
        "Hubo un problema al guardar tu perfil. Intentá de nuevo.";
      Swal.fire({
        title: "Error al guardar",
        text: message,
        icon: "error",
        background: "#1A1A1A",
        color: "#fff",
        confirmButtonColor: "#2563eb",
        borderRadius: "24px",
      });
    } finally {
      setIsSaving(false);
    }
  };
  if (loading)
    return (
      <div className="p-20 text-center dark:text-white">Cargando perfil...</div>
    );
  return (
    <div className="max-w-5xl mx-auto pb-20 px-4 sm:px-6">
      <header className="mb-8 sm:mb-10">
        <h2 className="text-2xl sm:text-3xl font-black dark:text-white">
          Ajustes de Cuenta
        </h2>
        <p className="text-sm sm:text-base text-gray-500">
          Gestiona tu identidad y logística en Nero.
        </p>
      </header>
      {/* Sección de Identidad y Verificación */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6 mb-8 p-4 sm:p-6 bg-gray-50 dark:bg-white/5 rounded-[32px]">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="relative">
            <img
              onClick={() => setIsModalOpen(true)}
              src={profile.avatar || genericProfile}
              className="w-16 h-16 sm:w-20 sm:h-20 cursor-pointer rounded-full object-cover border-2 border-blue-500/20"
            />
            <NeroUploader
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              onUploadComplete={handleUpload}
              maxFiles={1} // <--- LIMITAMOS A 1
              title="Foto de Perfil"
              showMainSelection={false}
            />
            {/* Badge de Verificación Dinámico */}
            <div className="absolute -bottom-2 -right-2">
              {profile.verification?.isVerified ? (
                <div
                  className="bg-blue-600 text-white p-1.5 rounded-full shadow-lg border-4 border-white dark:border-[#1A1A1A]"
                  title="Verificado Nero"
                >
                  <Check size={14} strokeWidth={4} />
                </div>
              ) : (
                <div
                  className="bg-gray-400 text-white p-1.5 rounded-full shadow-lg border-4 border-white dark:border-[#1A1A1A]"
                  title="No verificado"
                >
                  <Check size={14} strokeWidth={4} />
                </div>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-xl sm:text-2xl font-black dark:text-white">
              @{profile.username}
            </h2>
            <div className="flex gap-2 mt-1">
              {/* Rating de Comprador */}
              <div className="flex items-center gap-1 px-2 py-0.5 bg-yellow-400/10 text-yellow-600 rounded-lg text-[10px] sm:text-xs font-black uppercase">
                <Star size={10} className="fill-yellow-600" />
                <span className="hidden sm:inline">
                  {profile.buyerRating || "5.0"} (
                  {profile.buyerReviewsCount || 0})
                </span>
                <span className="sm:hidden">
                  {profile.buyerRating || "5.0"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {!profile.verification?.isVerified && (
          <button className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-blue-600 bg-blue-600/10 px-3 sm:px-4 py-2 rounded-xl hover:bg-blue-600 hover:text-white transition-all whitespace-nowrap">
            Obtener Verificado 🚀
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-8">
        {/* FORMULARIO Y DIRECCIONES */}
        <div className="lg:col-span-2 space-y-6">
          {/* DATOS PERSONALES */}
          <section className="bg-white dark:bg-[#1a1a1a] rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 border border-gray-100 dark:border-gray-800">
            <div className="relative flex flex-row w-full items-center justify-between">
              <div className="flex items-center gap-2 mb-4 sm:mb-6 text-blue-600 font-bold uppercase text-xs tracking-widest">
                <Shield size={16} />{" "}
                <span className="hidden sm:inline">Información Personal</span>
                <span className="sm:hidden">Perfil</span>
              </div>
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => {
                  setIsEditing(!isEditing);
                }}
              >
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                  Haz clic para editar
                </p>
                <Edit size={16} className="cursor-pointer" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">
                  Teléfono de Contacto
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={profile?.phone || ""}
                    onChange={(e) =>
                      setProfile({ ...profile, phone: e.target.value })
                    }
                    placeholder="+54 9 3492 ..."
                    className="input-nero w-full pl-10 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!isEditing}
                  />
                  <Phone
                    size={16}
                    className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">
                  Nombre de usuario
                </label>
                <input
                  name="username"
                  value={profile?.username}
                  onChange={handleChange}
                  className="input-nero w-full text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                  type="text"
                  disabled={!isEditing}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">
                  Nombre
                </label>
                <input
                  name="firstName"
                  value={profile?.firstName}
                  onChange={handleChange}
                  className="input-nero w-full text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                  type="text"
                  disabled={!isEditing}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">
                  Apellido
                </label>
                <input
                  name="lastName"
                  value={profile?.lastName}
                  onChange={handleChange}
                  className="input-nero w-full text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                  type="text"
                  disabled={!isEditing}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">
                  Email
                </label>
                <input
                  value={profile?.email}
                  disabled
                  className="input-nero w-full opacity-50 bg-gray-50 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                  type="email"
                />
              </div>
                            <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">
                  Numero de Documento
                </label>
                <input
                  name="dni"
                  value={profile?.dni}
                  onChange={handleChange}
                  className="input-nero w-full opacity-50 bg-gray-50 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                  type="number"
                  disabled={!isEditing}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">
                  Bio / Presentación (opcional)
                </label>
                <textarea
                  name="bio"
                  value={profile?.bio || ""}
                  onChange={handleChange}
                  maxLength={300}
                  rows={3}
                  placeholder="Contá un poco sobre vos (máx. 300 caracteres)"
                  className="input-nero w-full resize-none text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!isEditing}
                />
                <p
                  className={`text-right text-[10px] font-medium ${
                    (profile?.bio?.length || 0) >= 300
                      ? "text-red-500"
                      : "text-gray-400"
                  }`}
                >
                  {(profile?.bio?.length || 0)}/300
                </p>
              </div>
            </div>
                        <button
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 sm:py-4 mt-4 sm:mt-6 rounded-xl sm:rounded-2xl shadow-xl shadow-blue-500/20 transition-all active:scale-[0.98] text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              onClick={() => handleSaveProfile()}
              disabled={!isEditing || isSaving}
            >
              {isSaving ? (
                <>
                  <InlineLoadingSpinner size="sm" />
                  GUARDANDO...
                </>
              ) : (
                "GUARDAR"
              )}
            </button>
          </section>

          {/* DIRECCIONES DE ENVÍO */}
          <section className="bg-white dark:bg-[#1a1a1a] rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 border border-gray-100 dark:border-gray-800">
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-4 sm:mb-6">
              Administrar direcciones
            </h2>
            <AddressSection
              addresses={dbUser?.addresses || []}
              getAccessToken={getAccessToken}
              setAddresses={setAddresses} // 👈 Pasas la función del Store, NO setProfile
            />
            <BankAccountSection
              bankAccounts={profile?.bankAccounts || []}
              getAccessToken={getAccessToken}
              profile={profile}
              setProfile={setProfile}
              handleSaveProfile={handleSaveProfile}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
