import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../Utils/authClient";
import SupabaseLogin from "../components/SupabaseLogin";

/**
 * Página de login (ruta /login). Abre el modal de Supabase y redirige al home
 * una vez autenticado.
 */
export default function LoginPage() {
  const { authenticated, ready } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (ready && authenticated) {
      navigate("/", { replace: true });
    }
  }, [ready, authenticated, navigate]);

  return (
    <SupabaseLogin
      isOpen={open}
      onClose={() => {
        setOpen(false);
        navigate("/", { replace: true });
      }}
    />
  );
}
