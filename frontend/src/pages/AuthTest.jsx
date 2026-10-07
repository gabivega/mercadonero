import { useState } from "react";
import { supabase } from "../Utils/supabaseClient";

export default function AuthTest() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  // Login/registro en UN paso: si no existe, lo crea
  const handleEmail = async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + "/auth-test" },
    });
    setMsg(error ? error.message : "Revisá tu mail 📩");
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/auth-test" },
    });
  };

  const showToken = async () => {
    const { data } = await supabase.auth.getSession();
    console.log("access_token:", data.session?.access_token);
    setMsg("Token en consola ✅");
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>Test Supabase Auth</h1>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@mail.com" />
      <button onClick={handleEmail}>Enviar magic link</button>
      <button onClick={handleGoogle}>Login con Google</button>
      <button onClick={showToken}>Ver token</button>
      <p>{msg}</p>
    </div>
  );
}