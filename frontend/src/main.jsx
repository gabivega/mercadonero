import React from "react";
import { createRoot } from "react-dom/client";
import { Provider, useSelector } from "react-redux";
import store from "./store/store";
import App from "./App";
import "./index.css";
import { PrivyProvider } from "@privy-io/react-auth";
// Replace this with any of the networks listed at https://github.com/wevm/viem/blob/main/src/chains/index.ts
import { bsc } from "viem/chains";
import logoDark from "./assets/img/mn-logo-dark.png";
import logoLight from "./assets/img/mn-logo-light.png";

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID;

const PrivyAppWrapper = () => {
  // 1. Obtenemos el modo directamente de tu Redux
  const themeMode = useSelector((state) => state.theme.mode);

  const neroLogo = themeMode === "dark" ? logoDark : logoLight;

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["email", "google", "wallet"],
        appearance: {
          theme: themeMode,
          accentColor: "#F3BA2F",
          logo: neroLogo,
          landingHeader: "Mercado Nero",
          loginMessage: "Elige el metodo para autenticarte",
        },
        language: 'es-ES',
        supportedChains: [bsc],
        defaultChain: bsc,
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <App />
    </PrivyProvider>
  );
};

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Provider store={store}>
      <PrivyAppWrapper />
    </Provider>
  </React.StrictMode>,
);
