import termsContent from '../data/termsAndConditions';

const TermsAndConditions = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-gray-800 rounded-lg shadow-xl p-8">
        <h1 className="text-3xl font-bold text-white mb-2">{termsContent.title}</h1>
        <p className="text-sm text-gray-400 mb-8">Última actualización: {termsContent.lastUpdated}</p>
        
        <div className="space-y-8">
          {termsContent.sections.map((section) => (
            <section key={section.id} className="border-b border-gray-700 pb-6 last:border-0">
              <h2 className="text-xl font-semibold text-blue-400 mb-3">
                {section.title}
              </h2>
              <p className="leading-relaxed text-gray-300 text-justify">
                {section.content}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-10 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-md">
          <p className="text-sm text-yellow-200">
            <strong>Aviso Legal:</strong> El uso de esta plataforma implica la aceptación de los riesgos inherentes a los activos digitales y la tecnología blockchain.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TermsAndConditions;