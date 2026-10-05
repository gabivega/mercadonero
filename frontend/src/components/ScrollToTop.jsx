import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { captureReferralFromUrl } from "../Utils/referralTracker";

export default function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]); // Se ejecuta cada vez que cambia la ruta

  // Atribución de referidos: si la navegación SPA trae `?ref=...`, lo
  // persistimos. Cubre el caso de entrar directo a un enlace compartido
  // (ej: /producto/xxx?ref=abc). El `main.jsx` ya lo captura en el primer boot;
  // esto refuerza las navegaciones internas con query.
  useEffect(() => {
    captureReferralFromUrl(search);
  }, [search]);

  return null;
}