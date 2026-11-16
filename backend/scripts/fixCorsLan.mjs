// Parchea el CORS de index.js agregando el origen de LAN en desarrollo.
//
// Se hace desde Node (no desde el editor) porque el checkout vive en OneDrive
// y las ediciones por editor no siempre llegan al disco real: verificamos
// leyendo el archivo con fs después de escribir.
import fs from "fs";

const P = "index.js";
let s = fs.readFileSync(P, "utf8");
const original = s;

// 1) Insertar el helper isPrivateLanOrigin antes del app.use(cors(...)).
if (!s.includes("isPrivateLanOrigin")) {
  const marker = "// En tu server.js o app.js";
  const idx = s.indexOf(marker);
  if (idx === -1) {
    console.error("No encontre el marcador del CORS. Abortando.");
    process.exit(1);
  }

  const helper = `// ── DEV: permitir el origen de LAN ───────────────────────────────────────
// El QR del kit promocional se escanea con un CELULAR, que abre el front por
// la IP de la maquina (ej. http://192.168.0.17:5173) y NO por localhost (en
// el telefono, "localhost" apunta al propio telefono).
//
// Sin esto el celular carga la pagina pero cada llamada a la API falla por
// CORS y la ficha queda vacia. Solo aplica en desarrollo.
//
// Se evalua como FUNCION (no como lista estatica) para aceptar cualquier IP
// privada sin reiniciar el server cuando cambia la IP de la maquina.
const isPrivateLanOrigin = (origin) => {
  if (process.env.NODE_ENV === "production") return false;
  // http://192.168.x.x:5173 / http://10.x.x.x:5173 / http://172.16-31.x.x:5173
  return /^http:\\/\\/(?:192\\.168|10|172\\.(?:1[6-9]|2\\d|3[01]))\\.\\d{1,3}\\.\\d{1,3}:(?:5173|4173)$/.test(
    origin || ""
  );
};

`;

  s = s.slice(0, idx) + helper + s.slice(idx);
}

// 2) Reemplazar el chequeo estatico por uno que tambien acepte la LAN.
// Normalizamos saltos de linea para que el match no dependa de CRLF/LF.
const normalize = (t) => t.replace(/\r\n/g, "\n");

const before = normalize(s);
const oldBlock = `    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'El cliente CORS para este sitio no permite el acceso desde el origen especificado.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);`;

const newBlock = `    if (allowedOrigins.includes(origin) || isPrivateLanOrigin(origin)) {
      return callback(null, true);
    }
    const msg = 'El cliente CORS para este sitio no permite el acceso desde el origen especificado.';
    return callback(new Error(msg), false);`;

if (!before.includes(oldBlock)) {
  // Ya parcheado, o el bloque cambio de forma.
  if (before.includes("isPrivateLanOrigin(origin)")) {
    console.log("El CORS ya estaba parcheado.");
  } else {
    console.error("No encontre el bloque de chequeo del CORS. Abortando.");
    process.exit(1);
  }
} else {
  s = s.replace(oldBlock, newBlock);
}

if (s !== original) {
  fs.writeFileSync(P, s, "utf8");
}

// 3) VERIFICACION EN DISCO: releemos con fs (no confiamos en el editor).
const check = fs.readFileSync(P, "utf8");
const ok =
  check.includes("isPrivateLanOrigin") &&
  check.includes("isPrivateLanOrigin(origin)");
console.log(ok ? "OK: cambios en disco" : "FALLO: no quedaron en disco");
process.exit(ok ? 0 : 1);
