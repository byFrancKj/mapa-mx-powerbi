// Falla si el visual pide permisos que le permitirían sacar datos del reporte.
// Power BI solo deja que un visual se conecte a internet si declara WebAccess.
import { readFileSync } from "node:fs";

const { privileges = [] } = JSON.parse(readFileSync(new URL("../capabilities.json", import.meta.url), "utf8"));
const prohibidos = privileges.filter((p) => ["WebAccess", "ExportContent", "LocalStorage"].includes(p.name));
if (prohibidos.length) {
    console.error(`capabilities.json declara privilegios no permitidos: ${prohibidos.map((p) => p.name).join(", ")}`);
    process.exit(1);
}
console.log("Sin privilegios de red, almacenamiento ni exportación.");
