#!/usr/bin/env node
/**
 * Construye el fondo del mapa: la tierra de los países vecinos y sus fronteras,
 * para que alrededor de México se vean el mar y los países que lo rodean.
 *
 *   npm install
 *   npm run contexto
 *
 * Fuente: Natural Earth 1:10m (dominio público) en la versión TopoJSON del paquete
 * world-atlas. México no se toma de Natural Earth sino de la capa de INEGI del
 * repositorio (geo/estados), así que el mar llega exactamente a su costa.
 *
 * Qué genera:
 *   visual/src/geo/contexto.json   (TopoJSON con los objetos "tierra" y "fronteras")
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(ROOT, ...p);
const require = createRequire(import.meta.url);

const PAISES = require.resolve('world-atlas/countries-10m.json');
const MEXICO_INEGI = rel('geo', 'estados', 'mx_estados.topojson');
const SALIDA = rel('visual', 'src', 'geo', 'contexto.json');
// Lo que se alcanza a ver alrededor de México en un visual muy ancho o muy alto.
const RECUADRO = '-150,-15,-45,58';
// Tolerancia de simplificación en metros: es fondo, no hace falta más detalle.
const TOLERANCIA = 2500;
const MEXICO = '484';

// Las geometrías de la única salida de mapshaper (sin atributos, sale como GeometryCollection).
const geometriasDe = async (comando, entradas) => {
  const archivos = await mapshaper.applyCommands(comando, entradas);
  const json = JSON.parse(String(Object.values(archivos)[0]));
  return json.type === 'FeatureCollection' ? json.features.map((f) => f.geometry) : json.geometries;
};

console.log('• México de INEGI (un solo contorno)');
// Es la misma geometría que dibuja el visual (visual/src/geo/estados.json es una copia).
const [mexico] = await geometriasDe(
  `-i mexico.json -dissolve -o format=geojson`,
  { 'mexico.json': fs.readFileSync(MEXICO_INEGI, 'utf8') },
);

console.log(`• Países de Natural Earth, simplificados (${TOLERANCIA} m)`);
// Se simplifica antes de recortar México: así el borde con México queda tal cual lo
// dibuja el visual y no se abren rendijas en la frontera.
const archivosPaises = await mapshaper.applyCommands(
  `-i paises.json -target countries -clip bbox=${RECUADRO} -simplify interval=${TOLERANCIA} weighted keep-shapes ` +
    `-filter-fields FID -o format=geojson`,
  { 'paises.json': fs.readFileSync(PAISES, 'utf8') },
);
const paises = String(Object.values(archivosPaises)[0]);
const soloVecinos = `-filter 'FID !== "${MEXICO}"'`;

// La tierra de los demás países (para reconocer qué pedazos son extranjeros)
const extranjera = await geometriasDe(`-i paises.json ${soloVecinos} -dissolve -o format=geojson`, { 'paises.json': paises });
// Toda la tierra menos el México de INEGI: los vecinos, más los huecos entre su
// frontera y la de INEGI (que no coinciden del todo) y unas orillas sueltas donde
// la costa de Natural Earth sale más al mar que la de INEGI.
const resto = await geometriasDe(
  `-i paises.json -dissolve -erase mexico.json -explode -o format=geojson`,
  { 'paises.json': paises, 'mexico.json': JSON.stringify(mexico) },
);

// Se quedan los pedazos que tocan tierra extranjera (comparten vértices con ella):
// así se rellenan los huecos de la frontera y se van las orillas sueltas, que
// pintarían una franja de tierra entre la costa mexicana y el mar.
const clave = ([x, y]) => `${x.toFixed(7)},${y.toFixed(7)}`;
const vertices = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat(2);
const deExtranjera = new Set(extranjera.flatMap(vertices).map(clave));
const pedazos = resto.filter((g) => vertices(g).some((p) => deExtranjera.has(clave(p))));
console.log(`  ${pedazos.length} de ${resto.length} pedazos de tierra tocan a los vecinos`);

console.log('• TopoJSON');
const tierra = { type: 'GeometryCollection', geometries: pedazos };
const archivos = await mapshaper.applyCommands(
  `-i tierra.json name=tierra -dissolve ` +
    `-i paises.json ${soloVecinos} -innerlines name=fronteras ` +
    `-o target=tierra,fronteras format=topojson quantization=50000 combine-layers`,
  { 'tierra.json': JSON.stringify(tierra), 'paises.json': paises },
);
const topo = String(Object.values(archivos)[0]);
fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, topo);
console.log(`\nFondo listo: ${path.relative(ROOT, SALIDA)} (${Math.round(topo.length / 1024)} KB).`);
