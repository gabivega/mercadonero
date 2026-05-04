import { usePrivy } from '@privy-io/react-auth';

export default function TestAuth() {
  const { login, logout, ready, authenticated, user } = usePrivy();

  // 'ready' indica si el SDK de Privy terminó de cargar
  if (!ready) {
    return <p>Cargando Privy...</p>;
  }

  const handleAuth = async () => {
    try {
      // Esta función abre el modal de Privy (Email, Google, Wallet)
      await login();
    } catch (error) {
      console.error("Error al autenticar:", error);
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', textAlign: 'center' }}>
      <h3>Prueba de Integración Privy</h3>
      
      {!authenticated ? (
        <button 
          onClick={handleAuth}
          style={{ padding: '10px 20px', cursor: 'pointer', backgroundColor: '#F3BA2F', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}
        >
          🚀 Registrar / Iniciar Sesión
        </button>
      ) : (
        <div>
          <p style={{ color: 'green' }}>✅ ¡Autenticado con éxito!</p>
          <div style={{ textAlign: 'left', backgroundColor: '#f4f4f4', padding: '10px', fontSize: '12px' }}>
            <p><strong>Privy ID:</strong> {user.id}</p>
            <p><strong>Email:</strong> {user.email?.address || 'No tiene'}</p>
            <p><strong>Wallet:</strong> {user.wallet?.address || 'No creada aún'}</p>
          </div>
          
          <button 
            onClick={logout}
            style={{ marginTop: '10px', padding: '5px 10px', cursor: 'pointer' }}
          >
            Cerrar Sesión
          </button>
        </div>
      )}
      
      <p style={{ fontSize: '10px', marginTop: '10px' }}>
        Mira la consola (F12) para ver el objeto 'user' completo.
      </p>
    </div>
  );
}