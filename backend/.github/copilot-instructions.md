# Backend Copilot Instructions

## Project Overview
Backend de marketplace multivendor para el MVP de Nero. Stack MERN con autenticación basada en tokens JWT.

**Stack**: Node.js + Express + MongoDB (Atlas) + JWT + bcrypt  
**Status**: Fase inicial - rutas de usuario implementadas, ampliación en progreso  
**Idioma**: JavaScript/Node.js  
**Entry Point**: `index.js`

## Arquitectura

### Estructura de Carpetas
```
src/
  routes/          # Definición de rutas de Express
  controllers/     # Lógica de control (manejo de requests)
  services/        # Lógica de negocio
  models/          # Esquemas de MongoDB (Mongoose)
  middleware/      # Autenticación, validación, error handling
  utils/           # Utilidades, helpers
  config/          # Configuración (DB, env variables)
```

### Autenticación y Seguridad
- **JWT**: Tokens con expiración configurada en `.env`
- **Bcrypt**: Hash de contraseñas en registros y actualizaciones
- **Middleware de Auth**: Validar token en rutas protegidas antes de pasar al controller
- **Roles**: Estructura preparada para usuarios (buyer, seller, admin)

### Diseño REST API
- Endpoints por recurso: `/api/usuarios`, `/api/productos`, `/api/ordenes`, etc.
- Métodos: GET (obtener), POST (crear), PUT/PATCH (actualizar), DELETE (eliminar)
- Respuestas consistentes: `{ success: boolean, data: {...}, message: string }`
- Códigos HTTP apropiados: 200, 201, 400, 401, 403, 404, 500

## Workflow de Desarrollo

### Setup Inicial
```bash
npm install
npm run dev          # Servidor con auto-reload
npm test             # Suite de pruebas
```

### Dependencias Principales
- **express**: Framework web
- **mongoose**: ODM para MongoDB
- **jsonwebtoken**: Generación y validación de tokens JWT
- **bcryptjs**: Hash de contraseñas
- **dotenv**: Manejo de variables de entorno
- **nodemon**: Auto-reload en desarrollo (devDependency)

### Variables de Entorno (.env)
```
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb+srv://usuario:password@cluster.mongodb.net/nero
JWT_SECRET=tu_secret_key_muy_segura
JWTPatrones de Código

### Manejo de Errores
- Crear estructura de respuesta uniforme: `{ success: false, message: "Error descriptivo", status: 400 }`
- Try-catch en funciones async
- Nunca loguear passwords o tokens
- Retornar códigos de error HTTP apropiados

### Middleware de Autenticación
Patrón típico en rutas protegidas:
```javascript
router.post('/ruta-protegida', authenticateToken, controllerFunction);
```
El middleware `authenticateToken` valida el JWT antes de ejecutar la lógica del controller.

### Estructura de Controllers
```javascript
// Patrón: controller recibe (req, res, next)
const registrarUsuario = async (req, res) => {
  try {
    // Validar input
    // Procesar con service
    // Retornar respuesta
    res.status(201).json({ success: true, data: usuario });
  }Flujo de Autenticación (Actual)
1. **Registro**: Password hasheado con bcrypt, usuario creado en MongoDB
2. **Login**: Validar email + password, generar JWT si credenciales OK
3. **Rutas Protegidas**: Token en header `Authorization: Bearer <token>`, middleware valida
4. **Renovación**: Token expira según `JWT_EXPIRE`, cliente debe hacer login nuevamente

## Consideraciones de Seguridad
- Validar inputs en controllers (email formato, password fortaleza)
- Nunca retornar passwords en responses
- Implementar rate limiting en login/registro (prevenir brute force)
- HTTPS obligatorio en producción
- CORS configurado correctamente hacia frontend

## Estructura de Respuesta Estándar
```javascript
// Éxito
{ success: true, data: { id, email, name }, message: "Usuario creado" }

// Error
{ success: false, message: "Email ya existe", status: 400 }
```

## Archivos Clave a Crear/Mantener
1. `index.js` - Entry point y configuración de Express
2. `.env.example` - Template de variables (para que otros hagan cp a .env)
3. `src/config/database.js` - Conexión a MongoDB Atlas
4. `src/middleware/auth.js` - Validación de JWT
5. `.gitignore` - Excluir `node_modules/`, `.env`, `*.log`

## Debugging
- Nodemon reinicia servidor automáticamente en cambios
- MongoDB Compass útil para inspeccionar datos localmente
- Postman/Insomnia para testear endpoints
- Logs con `console.log()`; considerar paquete `winston` para producció

## Integration Points
- Frontend: Define API contract clearly in documentation
## Próximos Pasos del Proyecto
- Rutas para productos (CRUD)
- Sistema de órdenes
- Lógica de vendedores/marketplace
- Carrito de compras
- Pagos (integración)

---

*Actualizado: 18 de febrero, 2026*  
*Stack: Node.js + Express + MongoDB (Atlas) + JWT + bcrypt
- Add API documentation with example requests/responses
- Include setup instructions in README.md
- Document environment variables required for setup
- Keep comments for complex business logic

## Debugging Tips
- Use `console.log()` with clear prefixes for development
- Consider `debug` package for structured logging
- Use Node debugger: `node --inspect index.js`
- VS Code debugging: Add `.vscode/launch.json` configuration

---

*Last updated: February 18, 2026*  
*For updates to this guide, review project conventions and patterns.*
