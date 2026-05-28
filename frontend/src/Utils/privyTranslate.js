// Utils/privyTranslate.js
import { useEffect } from "react";

export function usePrivySpanish() {
  useEffect(() => {
    // 1. DICCIONARIO AMPLIADO (Aprobación + Confirmación)
    const translations = {
      // --- Pantalla de Aprobación ---
      "Confirm address": "Confirmar Dirección",
      "would like your permission for": "solicita tu permiso para que",
      "to spend tokens on your behalf.": "pueda operar tokens en tu nombre (Aprobación).",
      "Spender": "Contrato Destino",
      "Token address": "Dirección del Token",
      "Network": "Red Blockchain",
      "Estimated fee": "Comisión Estimada",
      "Approve": "Aprobar Depósito.",

      // --- Pantalla de Confirmación (Nuevos!) ---
      "Transaction complete!": "¡Transacción completada!",
      "You're all set.": "Todo listo de tu lado.",
      "Details": "Detalles",
      "From": "Desde (Tu Wallet)",
      "To": "Hacia (Contrato)",
      "Est. Fees": "Comisión Est.",
      "Total (including fees)": "Total (Con comisiones)",
      "All Done": "Terminar",
      "Copy": "Copiar",
      "Loading": "Cargando",
      "Submit": "Enviar",
//       "your@email.com": "tu@email.com",
      "Enter confirmation code:": "Ingresa el código de confirmación:",
"Please check ":"Por favor chequea",
" for an email from":"un correo de parte de",
"privy.io":"Mercado Nero",
// " and enter your code below.":"e ingresa el codigo debajo.",
// "Didn't get ":"¿No recibiste ",
// "an email":"un correo?",
// "Resend code":"Reenviar código",
// "":"",
      "Mercado Nero wants your permission to approve the following transaction.": "Mercado Nero solicita tu permiso para aprobar la siguiente transacción."
    };

    const translateAndStyleModal = () => {
      const modalContent = document.getElementById("privy-modal-content");
      if (!modalContent) return;

      // 2. RECORRIDO Y REEMPLAZO DE TEXTOS (Inyección HTML)
      const walker = document.createTreeWalker(modalContent, NodeFilter.SHOW_TEXT);
      let currentNode = walker.nextNode();

      while (currentNode) {
        let text = currentNode.nodeValue;
        let modified = false;

        Object.keys(translations).forEach((englishText) => {
          if (text.includes(englishText)) {
            text = text.replace(englishText, translations[englishText]);
            modified = true;
          }
        });

        if (modified) {
          const parent = currentNode.parentNode;
          if (parent && parent.tagName !== "SCRIPT" && parent.tagName !== "STYLE") {
            parent.innerHTML = parent.innerHTML.replace(currentNode.nodeValue, text);
          }
        }
        currentNode = walker.nextNode();
      }

      // 3. ESTILOS DE BOTONES (Aplica a "Approve" y a "All Done")
      const buttons = modalContent.querySelectorAll("button");
      buttons.forEach((btn) => {
        const txt = btn.textContent.trim();
        // Mismo estilo naranja Mercado Nero para cualquier botón principal de Privy
        if (
          txt === "Aprobar Depósito" || 
          txt === "Approve" || 
          txt === "Terminar" || 
          txt === "All Done"
        ) {
          btn.style.setProperty("background-color", "#F26722", "important");
          btn.style.setProperty("color", "#ffffff", "important");
          btn.style.setProperty("border-radius", "12px", "important");
          btn.style.setProperty("font-weight", "bold", "important");
          
          btn.onmouseover = () => btn.style.setProperty("background-color", "#d4561a", "important");
          btn.onmouseout = () => btn.style.setProperty("background-color", "#F26722", "important");
        }
      });

      // Asegurar color en los enlaces por si Privy intenta resetearlos
      const links = modalContent.querySelectorAll("a");
      links.forEach((link) => {
        link.style.setProperty("color", "#F26722", "important");
      });
    };

    // 4. OBSERVER GLOBAL ACTIVADO
    const observer = new MutationObserver((mutations) => {
      if (document.getElementById("privy-modal-content")) {
        translateAndStyleModal();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);
}