import { createApp } from "./app";
import { buildServices } from "./compose";
import { loadConfig } from "./config";
import { openDatabase } from "./db";

const config = loadConfig();
const sql = openDatabase(config.databasePath);
const app = createApp(config, buildServices(config, sql));

if (!process.env.JWT_SECRET) {
  console.warn("JWT_SECRET no está definido: se usa una clave temporal (las sesiones se cierran al reiniciar).");
}
if (!config.ingestApiKey) {
  console.warn("INGEST_API_KEY no está definido: el motor de visión no podrá enviar cámaras ni eventos.");
}

const server = app.listen(config.port, () => {
  console.log(`API del conjunto en http://localhost:${config.port}/api  (base: ${config.databasePath})`);
});

function shutdown() {
  server.close(() => {
    sql.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref(); // los streams de video abiertos no deben impedir cerrar
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
