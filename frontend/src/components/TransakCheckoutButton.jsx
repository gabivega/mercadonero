import { useState } from "react";

export const TransakCheckoutButton = () => {
  const [widgetUrl, setWidgetUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  const openTransak = async () => {
    setLoading(true);

    try {
      const response = await fetch(
        "http://localhost:3000/api/transak/create-session",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.widgetUrl) {
        throw new Error(data.error || "No se pudo obtener widgetUrl");
      }

      console.log("========== TRANSAK IFRAME ==========");
      console.log("widgetUrl:", data.widgetUrl);

      setWidgetUrl(data.widgetUrl);
    } catch (error) {
      console.error("Error creando sesión Transak:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={openTransak} disabled={loading}>
        {loading ? "Cargando..." : "Pagar con tarjeta"}
      </button>

      {widgetUrl && (
        <div
          style={{
            width: "500px",
            height: "625px",
            marginTop: "20px",
          }}
        >
          <iframe
            title="Transak"
            src={widgetUrl}
            width="100%"
            height="100%"
            style={{
              border: "none",
              borderRadius: "12px",
            }}
            allow="camera; microphone; payment"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
    </div>
  );
};

export default TransakCheckoutButton;