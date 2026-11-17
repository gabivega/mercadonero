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
            Comprar en Mercado Nero es un proceso simple diseñado para darte la máxima seguridad sin intermediarios centralizados.
          </p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Seleccionás el producto y avanzás en la plataforma.</li>
            <li>Realizás una transferencia bancaria directa al CBU/CVU o alias del vendedor o pagas con cripto directo de tu wallet web3.</li>
            <li>El vendedor verifica el pago, despacha tu producto y vos confirmás la recepción cuando te llega para dar cierre al proceso..</li>
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
            Tu compra está protegida por un Contrato Inteligente inmutable en la blockchain. Para poder recibir pagos por transferencia, la plataforma le exige obligatoriamente al vendedor dejar un colateral en garantía por el equivalante a la orden.
          </p>
          <p className="mb-2">
            Si pagás con cripto, tu dinero queda retenido en un contrato inteligente y se libera al vendedor una vez que recibas el producto.
          </p>
          <p>
            Si el vendedor decide no enviarte el producto o intentar una estafa, su colateral o tu dinero permanece retenido y se abre una disputa para reintegrarte.
          </p>        
        </>
      ),
    },
    {
      question: "¿Cómo y a quién le realizo el pago por transferencia?",
      icon: ArrowRightLeft,
      content: (
        <>
          <p className="mb-2">
            Si elegís pagar mediante transferencia bancaria, cuando completes el checkout se van a mostrar los datos bancarios del vendedor.
          </p>
          <p className="mb-2">
            Sólo está permitido realizar transferencias desde tu propia cuenta (tiene que coincidir con tus datos de usuario) y por el monto exacto de la orden. Si alguno de los datos no coincide, el vendedor no ejecutará la orden.<br/>
          </p>
          <p className="mb-2">
            Esto significa que no podes utilizar cuentas de terceros, en caso de intentarlo tu cuenta será suspendida definitivamente.
          </p>
          <p>
            Es importante que solo transfieras a la cuenta otorgada por el sistema en el checkout cuando se crea la orden. En ese momento está garantizado que el vendedor tiene su colateral en garantía y que tu dinero queda protegido por el contrato inteligente.
          </p>
        </>
      ),
    },
    {
      question: "¿Cómo se puede abonar con criptomonedas?",
      icon: Wallet,
      content: (
        <>
        <p className="mb-2">
          Primero tenes que activar tu wallet web3 desde la seccion "billetera". No tiene costo alguno y no custodiamos esos fondos: sólo vos podes acceder y autorizar transacciones.
        </p>
        <p className="mb-2">
          Una vez creada, copias tu direccion para poder depositar USDC por redes polygon o BASE y USDT mediante la red BSC. Si depositás otros tokens o mediante otras redes no habilitadas, podrias perder tu saldo. Podes transferirte desde cualquier exchange o wallets como Binance, Belo, Ripio, Lemon etc.
        </p>
        <p className="mb-2">
          Cuando tengas saldo en tu wallet, podes elegir en el checkout el método de pago y autorizar la transacción desde tu wallet web3. Vas a recibir un email con un codigo otp para autorizar la transaccion.
        </p>
        </>
      ),
    },
    {
      question: "¿Cómo se coordinan los envíos y la entrega?",
      icon: Truck,
      content: (<>
        <p className="mb-2">
          Cada vendedor decide que método de envío ofrecer. Como comprador, podes elegir dependiendo las opciones ofrecidas y la disponibilidad de tu zona. El envío puede ser gratis o con costo adicional, lo cual está detallado en el checkout.
        </p>
        <p className="mb-2">
         El vendedor es responsable de otorgar el numero de seguimiento del envío y de cumplir con los tiempos de entrega. 
        </p>
        </>
      ),
    },
    {
      question: "¿Qué pasa si el producto llega roto, fallado o no es lo que pedí?",
      icon: AlertTriangle,
      content: (
        <>
          <p className="mb-2">
            Si el producto presenta fallas o no coincide con la descripción, no debes marcar la orden como completada. Tenés un botón explícito para abrir una disputa. Al hacerlo, el colateral del vendedor queda totalmente bloqueado en la blockchain hasta que se resuelva el conflicto.
          </p>
          <p className="mb-2">
            Recomendamos filmar el procedimiento de la apertura del paquete para contar con evidencia en caso de que haya algun problema.
          </p>
          <p className="mb-2"> 
            Un moderador va a revisar el caso y tomará la determinación final. Si el fallo es a tu favor, el vendedor pierde su colateral y se te reintegra el dinero. Si el fallo es a favor del vendedor, se libera su colateral o pago y la orden queda cerrada.
          </p>
          <p >
            La plataforma busca proteger tanto a compradores como vendedores de posibles estafas, pero la eficacia depende de que los usuarios colaboren con evidencia y reporten cualquier inconveniente de manera oportuna.
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