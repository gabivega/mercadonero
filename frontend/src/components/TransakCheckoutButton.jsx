import { Transak } from '@transak/ui-js-sdk';

export const TransakCheckoutButton = () => {
    
 const openTransak = async () => {

 
    const widgetUrl= await fetch('http://localhost:3000/api/transak/create-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },            
        })      
    const data = await widgetUrl.json();
    console.log('Session ID from backend:', data.sessionId);
    // 1. Definir los parámetros de configuración del widget
    // const apiKey = '5bf81dff-ea44-409d-8a93-406387690b9e'; // Reemplazar por tu API Key de Staging
    const baseUrl = 'https://global-stg.transak.com';

    const queryParams = new URLSearchParams({
      apiKey: apiKey,
      productsAvailed: 'BUY',              // Solo permite compra (oculta Sell)
      fiatCurrency: 'USD',                 // Moneda de pago
      fiatAmount: '100',                   // Monto deseado
      cryptoCurrencyCode: 'USDT',          // Cripto elegida
      defaultPaymentMethod: 'credit_debit_card',
      language: 'es',                      // Idioma en español
      referrerDomain: window.location.origin
    });

    // 2. Construir la widgetUrl completa con los parámetros
    // const widgetUrl = `${baseUrl}?${queryParams.toString()}`;

    // 3. Inicializar el SDK
    const transak = new Transak({
      widgetUrl: widgetUrl,
      widgetHeight: '625px',
      widgetWidth: '500px',
    });

    transak.init();

    // Event listeners del SDK
    Transak.on(Transak.EVENTS.TRANSAK_WIDGET_CLOSE, () => {
      console.log('Widget cerrado');
    });

    Transak.on(Transak.EVENTS.TRANSAK_ORDER_SUCCESSFUL, (orderData) => {
      console.log('Orden completada con éxito:', orderData);
      transak.close();
    });
  };

  return (
    <button onClick={openTransak}>
      Pagar con Tarjeta (Transak)
    </button>
  );
};

export default TransakCheckoutButton;