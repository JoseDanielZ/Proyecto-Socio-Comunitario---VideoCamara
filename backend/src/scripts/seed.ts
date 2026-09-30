/**
 * Crea usuarios (y opcionalmente datos de ejemplo) para arrancar el sistema:
 *   npm run seed            -> solo usuarios
 *   npm run seed -- --demo  -> además tickets y visitas de ejemplo
 * Contraseñas de ejemplo: admin / admin123 y guardia1 / guardia123. CAMBIARLAS antes de usar en serio.
 */
import { buildServices } from "../compose";
import { loadConfig } from "../config";
import { openDatabase } from "../db";
import { AppError } from "../shared/errors";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;

const config = loadConfig();
const sql = openDatabase(config.databasePath);
const s = buildServices(config, sql);

const people = [
  { username: "admin", full_name: "Administración", role: "admin" as const, password: flag("admin-password", "admin123") },
  { username: "guardia1", full_name: "Guardia turno día", role: "guard" as const, password: flag("guard-password", "guardia123") },
  { username: "guardia2", full_name: "Guardia turno noche", role: "guard" as const, password: flag("guard-password", "guardia123") },
];

const ids = new Map<string, number>();
for (const person of people) {
  try {
    ids.set(person.username, (await s.auth.createUser(person)).id);
    console.log(`Usuario creado: ${person.username} (${person.role})`);
  } catch (e) {
    if (!(e instanceof AppError) || e.status !== 409) throw e;
    ids.set(person.username, (await s.auth.listUsers()).find((u) => u.username === person.username)!.id);
    console.log(`Usuario ya existía: ${person.username}`);
  }
}

if (args.includes("--demo")) {
  const admin = ids.get("admin")!;
  const guard = ids.get("guardia1")!;

  const t1 = await s.tickets.create(guard, {
    title: "Foco quemado en pasillo", description: "El pasillo de la torre 2 está sin luz desde ayer.",
    category: "maintenance", priority: "high", location: "Torre 2", reporter_name: "Sra. López",
  });
  await s.tickets.assign(t1.id, admin, admin);
  await s.tickets.changeStatus(t1.id, "in_progress", admin);
  await s.tickets.comment(t1.id, "Ya se pidió el repuesto.", admin);
  await s.tickets.create(admin, {
    title: "Fuga de agua en área común", description: "Sale agua junto a la piscina.",
    category: "damage", priority: "urgent", location: "Piscina", reporter_name: "Sr. Vallejo",
  });
  await s.tickets.create(guard, {
    title: "Ruido después de las 22:00", description: "Música fuerte en la casa 14.",
    category: "noise", priority: "low", location: "Casa 14",
  });
  await s.visits.registerEntry(guard, {
    visit_type: "visitor", full_name: "Ana Torres", destination: "Casa 2", host_name: "Fam. Ruiz",
  });
  await s.visits.registerEntry(guard, {
    visit_type: "delivery", full_name: "Carlos Pérez", company: "Uber", plate: "PBA-1234",
    vehicle_type: "motorcycle", destination: "Casa 5",
  });
  console.log("Datos de ejemplo creados (3 tickets, 2 visitas).");
}

sql.close();
