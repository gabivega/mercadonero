import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const verifySupabaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No autorizado" });
    }
    const token = authHeader.split(" ")[1];

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ message: "Token inválido o expirado" });
    }

    // Mismo shape que el de Privy → el resto del código no cambia
    req.user = { did: data.user.id, email: data.user.email };
    next();
  } catch (error) {
    console.error("Error validando token de Supabase:", error);
    res.status(401).json({ message: "Token inválido o expirado" });
  }
};

export default verifySupabaseToken;