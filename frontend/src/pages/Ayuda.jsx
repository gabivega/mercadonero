import React, { useState } from "react";
import { ShieldCheck, Wallet, ShoppingCart, HelpCircle, ChevronDown, ArrowRightLeft, Truck, AlertTriangle } from "lucide-react";

export default function Ayuda() {
  // Estado para manejar qué acordeón está abierto (null = todos cerrados)
  const [openFaq, setOpenFaq] = useState(0);

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqs = [
    {
      question: "¿Qué es Mercado Nero y que tiene de diferente con otros marketplaces?",
      icon: ShoppingCart,
      content: (
        <>
          <p className="mb-2">
            Mercado Nero es un marketplace multivendedor que integra tecnología blockchain y contratos inteligentes para ofrecer una experiencia de compra más segura y con comisiones mucho mas bajas.
            Integramos medios de pagos tradicionales y los respaldamos con criptomonedas, lo que permite transacciones más rápidas y seguras.
            Gracias a esta integración, somos el único marketplace que permite que los vendedores cobren su venta por adelantado, mientras se ofrece al comprador la protección del 100% de su inversión.
          </p>        
        </>
      ),
    },
    {
      question: "¿Cúal es la comisión que cobra la plataforma?",
      icon: ShieldCheck,
      content: (
        <>
          <p className="mb-2">
            Para la etapa inicial se mantiene una comision fija del 3% de cada transacción. Esta comision se descuenta del activo colateral colocado por el vendedor en el contrato inteligente.
            No se cobra ningun tipo de gasto o impuesto adicional, el monto es fijo e inmutable.
          </p>        
        </>
      ),
    },
    {
      question: "¿Cómo es el proceso de compra?",
      icon: ArrowRightLeft,
      content: (
        <>
          <p className="mb-2">
           Es igual a cualquier plataforma de comercio electrónico, elegís el producto que necesitas y procedés al checkout, eligiendo tu dirección de envío. Tras tu confirmación, se crea una orden de compra.
           Se muestran los datos bancarios del vendedor para que puedas realizar la transferencia.       
          </p>
          <p>
            No tenés que preocuparte por estafas porque la compra está protegida al 100%, ya que el vendedor tiene activos congelados en garantía dentro de un contrato inteligente.
            Una vez realizado y notificado el pago, el vendedor procederá a despachar por el metodo seleccionado. Cuando se confirma que el producto te llegó correctamente, se le libera la garantía al vendedor.
            <p>
            Tu compra está protegida durante todo el proceso.</p>
          </p>
        </>
      ),
    },
    {
      question: "¿La plataforma retiene los fondos de los usuarios?",
      icon: Wallet,
      content: (
        <p>
            No, la plataforma no retiene ni almacena ningun tipo de activo de ningun usuario. Todos los fondos permanecen en posesion de los usuarios en su wallet y la plataforma no tiene ningun control sobre ellos.
            Los activos colaterales colocados en garantía por parte de los vendedores, quedan almacenados temporalmente en un contrato inteligente, y pueden ser retirados en cualquier momento a menos que exista una orden abierta.
            La plataforma es facilitadora de transacciones, no intermediaria.
        </p>
      ),
    },
    {
      question: "¿Cómo se coordinan los envíos y la entrega?",
      icon: Truck,
      content: (
        <p>
          Los métodos de envío (Correo Argentino, Andreani, Oca, y cadetería o retiro en persona) están detallados por el vendedor en la publicación. Una vez que realizás la transferencia y el vendedor la confirma, la plataforma habilita un canal para el seguimiento del despacho. El vendedor tiene la obligación de cargar el código de seguimiento para que puedas monitorear tu paquete.
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
            Sección Ayuda
          </h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-2xl mx-auto">
            Entendé cómo opera Mercado Nero mediante tecnología blockchain, contratos inteligentes de garantía y transferencias directas sin riesgos.
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