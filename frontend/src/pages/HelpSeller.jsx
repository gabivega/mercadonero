import React, { useState } from "react";
import { Shield, Wallet, Cpu, HelpCircle, ChevronDown, CheckCircle, AlertTriangle, Percent } from "lucide-react";

export default function HelpSeller() {
  // Estado para manejar qué acordeón está abierto (null = todos cerrados)
  const [openFaq, setOpenFaq] = useState(0);

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqs = [
    {
      question: "¿Qué es el colateral en garantía y por qué debo dejarlo?",
      icon: Shield,
      content: (
        <>
          <p className="mb-2">
            El colateral es un depósito de respaldo que realizás en la blockchain para garantizar que vas a cumplir con el envío y las condiciones del producto publicado. 
          </p>
          <p>
            Al no haber intermediarios centralizados que retengan el dinero, este colateral funciona como un seguro de confianza mutua. Se congela temporalmente en el contrato inteligente y se libera de forma automática en tu wallet una vez que el comprador confirma que recibió el producto en perfectas condiciones.
          </p>
        </>
      ),
    },   
    {
      question: "¿Cómo y cuándo recibo el pago de la venta?",
      icon: CheckCircle,
      content: (
        <>
          <p className="mb-2">
            A diferencia de las plataformas tradicionales, recibís el pago por adelantado mediante una transferencia directa por parte del comprador (a tu CBU/CVU o alias bancario configurado).
          </p>
          <p className="mb-2">
            La unica condicion es que previamente deposites saldo en tu wallet y "congeles" una cantidad equivalente al valor de la venta, esto funciona como una garantía para el comprador.
          </p>
          <p>
            Una vez que verificás el ingreso del dinero en tu cuenta bancaria, tenés la obligación de confirmar la recepción en la plataforma para proceder con el despacho del producto. Tu colateral permanecerá congelado resguardando la operación hasta el final del flujo.
          </p>
        </>
      ),
    },
    {
      question: "¿De dónde se descuenta la comisión de la plataforma?",
      icon: Percent,
      content: (
        <p>
          La comisión por venta exitosa se descuenta del colateral congelado en garantía dentro del smart contract. Esto se realiza de forma automática una vez el comprador indica que reibió el producto correctamente.
        </p>
      ),
    },
    {
      question: "¿Qué pasa si hay fallas, el producto es incorrecto o hay una disputa?",
      icon: AlertTriangle,
      content: (
        <>
          <p className="mb-2">
            Si el comprador indica que el producto llegó dañado, tiene fallas o no coincide con lo publicado, se abre un periodo de disputa y el colateral en garantía permanecerá congelado en el contrato hasta que el conflicto se resuelva.
          </p>
          <p>
            Si se determina que el reclamo es justo, el comprador podrá requerir la devolución de su dinero. En ese caso, deberás reembolsarle la transferencia bancaria y, una vez acreditado el retorno, el sistema liberará tu colateral de vuelta a tu wallet. Cumplir con los estándares evita fricciones y bloqueos de fondos.
          </p>
        </>
      ),
    },
     {
      question: "¿Cómo funcionan los contratos inteligentes y la firma de mi wallet?",
      icon: Cpu,
      content: (
        <>
          <p className="mb-2">
            Un contrato inteligente (Smart Contract) es un programa autónomo que corre en la blockchain y ejecuta reglas inmutables. Cuando vendés, utilizás tu wallet para firmar digitalmente la transacción.
          </p>
          <p>
            Esta firma no es una clave de acceso, sino una autorización criptográfica obligatoria para que el contrato pueda resguardar tu colateral de manera transparente y segura, sin que dependas de la buena voluntad de nadie.
          </p>
        </>
      ),
    },
    {
      question: "¿Mercado Nero custodia mis fondos en algún momento?",
      icon: Wallet,
      content: (
        <p>
          No, nunca. Mercado Nero es una plataforma descentralizada. Nosotros no tenemos acceso a tus claves, no abrimos cuentas bancarias a tu nombre ni guardamos tus criptomonedas en nuestros servidores. Vos sos el único custodio absoluto de tus fondos. Todo el proceso de garantía ocurre directamente entre tu wallet y el contrato inteligente en la red blockchain.
          La plataforma solamente facilita la conexión entre los participantes y el contrato inteligente.
        </p>
      ),
    },
  ];

  return (
    <section className="w-full py-12 px-4 bg-gray-50 dark:bg-zinc-950 transition-colors duration-300">
      <div className="max-w-4xl mx-auto">
        
        {/* Encabezado */}
        <div className="text-center mb-10">
          <div className="inline-flex p-3 bg-orange-50 dark:bg-orange-950/20 text-[#F26722] rounded-2xl mb-4">
            <HelpCircle className="w-6 h-6 stroke-[2]" />
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-gray-900 dark:text-white mb-3">
            Guía Avanzada para Vendedores
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-2xl mx-auto">
            Descubrí cómo funciona nuestro ecosistema descentralizado, las garantías por contratos inteligentes y la gestión segura de tus operaciones en Mercado Nero.
          </p>
        </div>

        {/* Contenedor de FAQs (Acordeón) */}
        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const IconComponent = faq.icon;
            const isOpen = openFaq === index;

            return (
              <div
                key={index}
                className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-100 dark:border-zinc-800/60 shadow-sm overflow-hidden transition-all duration-300"
              >
                {/* Botón de Apertura */}
                <button
                  onClick={() => toggleFaq(index)}
                  className="w-full flex items-center justify-between p-5 text-left font-bold text-gray-800 dark:text-zinc-100 hover:bg-gray-50/50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3.5 pr-4">
                    <div className={`p-2 rounded-lg transition-colors ${
                      isOpen 
                        ? "bg-[#F26722] text-white" 
                        : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400"
                    }`}>
                      <IconComponent className="w-4 h-4 stroke-[2.5]" />
                    </div>
                    <span className="text-sm md:text-base tracking-tight">{faq.question}</span>
                  </div>
                  <ChevronDown
                    className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-300 ${
                      isOpen ? "rotate-180 text-[#F26722]" : ""
                    }`}
                  />
                </button>

                {/* Contenido Desplegable */}
                <div
                  className={`transition-all duration-300 ease-in-out overflow-hidden ${
                    isOpen ? "max-h-[500px] border-t border-gray-50 dark:border-zinc-800/40" : "max-h-0"
                  }`}
                >
                  <div className="p-5 text-xs md:text-sm text-gray-600 dark:text-zinc-400 leading-relaxed bg-white dark:bg-zinc-900">
                    {faq.content}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Nota de pie informativa */}
        <div className="mt-8 p-4 bg-orange-50/60 dark:bg-orange-950/10 rounded-xl border border-orange-100/50 dark:border-orange-900/20 text-center">
          <p className="text-xs text-gray-500 dark:text-zinc-400">
            ¿Tenés dudas adicionales sobre el funcionamiento de los Smart Contracts? Revisá la documentación técnica o contactá a nuestra comunidad de soporte.
          </p>
        </div>

      </div>
    </section>
  );
}