import React, { useState } from "react";
import { ShieldCheck, Wallet, ShoppingCart, HelpCircle, ChevronDown, ArrowRightLeft, Truck, AlertTriangle } from "lucide-react";

export default function HelpBuyer() {
  // Estado para manejar qué acordeón está abierto (null = todos cerrados)
  const [openFaq, setOpenFaq] = useState(0);

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqs = [
    {
      question: "¿Cómo funciona el proceso de compra en Mercado Nero?",
      icon: ShoppingCart,
      content: (
        <>
          <p className="mb-2">
            Comprar en Mercado Nero es un proceso híbrido diseñado para darte la máxima seguridad sin intermediarios centralizados. Consta de tres pasos simples:
          </p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Seleccionás el producto y avanzás en la plataforma.</li>
            <li>Realizás una **transferencia bancaria directa** al CBU/CVU o alias del vendedor.</li>
            <li>El vendedor verifica el pago, despacha tu producto y vos confirmás la recepción cuando te llega para dar el cierre seguro.</li>
          </ol>
        </>
      ),
    },
    {
      question: "¿Qué garantías tengo de que el vendedor me va a enviar el producto?",
      icon: ShieldCheck,
      content: (
        <>
          <p className="mb-2">
            Tu compra está protegida por un **Contrato Inteligente (Smart Contract)** inmutable en la blockchain. Para poder publicar cualquier producto, la plataforma le exige obligatoriamente al vendedor dejar un **colateral en garantía** (fondos bloqueados en la red).
          </p>
          <p>
            Si el vendedor decide no enviarte el producto o intentar una estafa, su colateral permanece congelado y se abre una disputa para resarcir los daños. El vendedor arriesga su propio dinero, lo que garantiza que cumpla con su parte.
          </p>
        </>
      ),
    },
    {
      question: "¿Cómo y a quién le realizo el pago?",
      icon: ArrowRightLeft,
      content: (
        <>
          <p className="mb-2">
            El pago del producto se realiza mediante **transferencia directa desde tu homebanking o billetera virtual** (Mercado Pago, Ualá, banco tradicional, etc.) hacia la cuenta bancaria que el vendedor tenga vinculada.
          </p>
          <p>
            Al comprar, el sistema te mostrará los datos de facturación y el alias del vendedor. No pagás comisiones extra por la transferencia y el dinero va directo al comerciante, garantizando rapidez y evitando demoras de plataformas intermediarias.
          </p>
        </>
      ),
    },
    {
      question: "¿Por qué tengo que conectar mi wallet con Privy?",
      icon: Wallet,
      content: (
        <p>
          Aunque pagues con transferencia bancaria tradicional, **necesitás una identidad criptográfica para interactuar con las garantías de la plataforma**. Privy te genera una billetera digital segura de forma transparente. Con ella vas a firmar digitalmente la confirmación de que el producto llegó bien, informando directamente al contrato inteligente para que libere el colateral del vendedor. Vos tenés el control absoluto del flujo.
        </p>
      ),
    },
    {
      question: "¿Cómo se coordinan los envíos y la entrega?",
      icon: Truck,
      content: (
        <p>
          Los métodos de envío (Correo Argentino, Andreani, moto mensajería o retiro en persona) están detallados por el vendedor en la publicación. Una vez que realizás la transferencia y el vendedor la confirma, la plataforma habilita un canal para el seguimiento del despacho. El vendedor tiene la obligación de cargar el código de seguimiento para que puedas monitorear tu paquete.
        </p>
      ),
    },
    {
      question: "¿Qué pasa si el producto llega roto, fallado o no es lo que pedí?",
      icon: AlertTriangle,
      content: (
        <>
          <p className="mb-2">
            Si el producto presenta fallas o no coincide con la descripción, **no debes marcar la orden como completada**. Tenés un botón explícito para abrir una disputa. Al hacerlo, el colateral del vendedor queda totalmente bloqueado en la blockchain.
          </p>
          <p>
            Deberás coordinar con el vendedor la devolución del artículo. Una vez que le reenvíes el paquete, el vendedor procederá a devolverte el dinero a tu cuenta bancaria y recién ahí se destrabará el conflicto, liberando su garantía. Tu derecho como comprador está respaldado criptográficamente.
          </p>
        </>
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
            Guía Avanzada para Compradores
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-2xl mx-auto">
            Entendé cómo protegemos tus compras mediante tecnología blockchain, contratos inteligentes de garantía y transferencias directas sin riesgos.
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
            ¿Tenés un problema con una compra en curso? No verifiques la entrega y abrí una disputa inmediatamente desde tu panel de usuario para resguardar los fondos.
          </p>
        </div>

      </div>
    </section>
  );
}