import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import store from "./store/store";
import App from "./App";
import "./index.css";
import { AuthProvider } from "./Utils/authClient";
import { captureReferralFromUrl } from "./Utils/referralTracker";
// Registra el interceptor global de axios (logout + redirect ante 401).
// Debe importarse temprano para que aplique a todas las peticiones.
import "./Utils/axiosAuth";

// Capturamos `?ref=<userId|código>` UNA vez, al bootear la app, y lo dejamos
// persistido en localStorage. Así la próxima compra del visitante queda
// atribuida a quien compartió el enlace, aunque navegue antes de comprar.
captureReferralFromUrl();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Provider store={store}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Provider>
  </React.StrictMode>,
);
