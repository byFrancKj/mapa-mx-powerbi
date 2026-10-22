#!/usr/bin/env node
/**
 * Construye las geometrías y los catálogos del proyecto a partir de la capa
 * municipal del Marco Geoestadístico de INEGI.
 *
 *   npm install
 *   npm run geo                                   # usa la capa del repositorio
 *   npm run geo -- --fuente "ruta/a/00mun.shp"    # usa la capa original de INEGI
 *
 * Qué genera:
 *   geo/estados/mx_estados.topojson + .geojson     (objeto "estados")
 *   geo/municipios/mx_municipios.topojson          (objeto "municipios")
 *   puente-inegi/catalogos/dim_geo.csv, dim_municipio.csv
 *   visual/src/geo/estados.json                    (la geometría que va dentro del visual)
 *
 * Las regiones ya no se precalculan: el visual las arma con los datos del modelo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(ROOT, ...p);
const q = (p) => `"${p.replace(/\\/g, '/')}"`; // rutas con espacios y Windows

// ---------------------------------------------------------------- argumentos
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) {
      const next = arr[i + 1];
      acc.push([a.slice(2), next && !next.startsWith('--') ? next : true]);
    }
    return acc;
  }, [])
);

// Fuente: la capa que indiques con --fuente; si no, la versión que ya viene en el
// repositorio. Esa capa ya está limpia y simplificada, así que en ese caso no se
// vuelve a limpiar ni a simplificar: cada pasada perdería detalle y mapshaper no
// siempre puede volver a limpiar su propia salida cuantizada.
const FUENTE_REPO = rel('geo', 'municipios', 'mx_municipios.topojson');
const fuentePorDefecto = () => {
  const copia = rel('.cache', 'municipios_repo.topojson');
  fs.mkdirSync(rel('.cache'), { recursive: true });
  if (fs.existsSync(FUENTE_REPO) && (!fs.existsSync(copia) || fs.statSync(copia).mtimeMs < fs.statSync(FUENTE_REPO).mtimeMs)) {
    fs.copyFileSync(FUENTE_REPO, copia);
  }
  return copia;
};

const OPC = {
  fuente: args.fuente || fuentePorDefecto(),
  // Tolerancia de simplificación en metros (más alto = archivo más ligero).
  toleranciaEstados: Number(args['tolerancia-estados'] || 800),
  toleranciaMunicipios: args.fuente ? Number(args['tolerancia-municipios'] || 400) : null,
  encoding: args.encoding || null, // p. ej. latin1 si los acentos salen mal
};

if (!args.fuente) {
  console.log('• Sin --fuente: uso la capa municipal simplificada del repositorio (geo/municipios).');
}
if (!fs.existsSync(OPC.fuente)) {
  console.error(`
No encontré la capa municipal de origen:
  ${OPC.fuente}

Para máxima precisión descarga el Marco Geoestadístico de INEGI (capa de
municipios, archivo 00mun.shp con sus .dbf/.shx/.prj) y ejecuta:

  npm run geo -- --fuente "ruta/a/00mun.shp"

También acepta un GeoJSON con los campos CVEGEO, CVE_ENT, CVE_MUN y NOMGEO.
`);
  process.exit(1);
}

const run = async (label, cmd) => {
  process.stdout.write(`• ${label}\n`);
  await mapshaper.runCommands(cmd);
};

// Las tablas de atributos se piden a mapshaper en JSON: un CSV hecho a mano no
// sobrevive a nombres con coma ("Heroica Villa Tezoatlán de Segura y Luna, Cuna
// de la Independencia de Oaxaca").
const leerJson = (archivo) => JSON.parse(fs.readFileSync(archivo, 'utf8'));

const escribirCsv = (archivo, filas, cols) => {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = [cols.join(','), ...filas.map((f) => cols.map((c) => esc(f[c])).join(','))];
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, out.join('\n') + '\n', 'utf8');
};

for (const d of ['geo/estados', 'geo/municipios', 'puente-inegi/catalogos', 'visual/src/geo', '.cache']) {
  fs.mkdirSync(rel(d), { recursive: true });
}

const ESTADOS_CSV = rel('puente-inegi', 'estados.csv');

// -------------------------------------------- 1. limpiar la capa de origen
const LIMPIO = rel('.cache', 'municipios_limpio.json');
const HUELLA = rel('.cache', 'municipios_limpio.fuente');
const huella = `${path.resolve(OPC.fuente)}|${fs.statSync(OPC.fuente).mtimeMs}|${OPC.encoding || ''}`;
const huellaPrevia = fs.existsSync(HUELLA) ? fs.readFileSync(HUELLA, 'utf8') : '';
if (!fs.existsSync(LIMPIO) || huellaPrevia !== huella || args.limpiar) {
  await run(
    args.fuente ? 'Limpiando topología de la capa municipal (solo la primera vez)' : 'Leyendo la capa municipal del repositorio',
    `-i ${q(OPC.fuente)} name=municipios ${OPC.encoding ? `encoding=${OPC.encoding}` : ''} ` +
      `-proj wgs84 -filter-fields CVEGEO,CVE_ENT,CVE_MUN,NOMGEO ${args.fuente ? '-clean ' : ''}` +
      `-o ${q(LIMPIO)} ${args.fuente ? 'format=geojson' : 'format=topojson no-quantization'}`
  );
  fs.writeFileSync(HUELLA, huella);
}

const puntoInterior = `-each "LON=Math.round(this.innerX*1e5)/1e5, LAT=Math.round(this.innerY*1e5)/1e5"`;

// ----------------------------------------------------------------- 2. estados
const tmpEst = rel('.cache', 'dim_geo_tmp.json');
await run(
  `Estados (tolerancia ${OPC.toleranciaEstados} m)`,
  `-i ${q(LIMPIO)} name=municipios ` +
    `-dissolve CVE_ENT name=estados ` +
    `-join ${q(ESTADOS_CSV)} keys=CVE_ENT,CVE_ENT string-fields=CVE_ENT ` +
    `-simplify interval=${OPC.toleranciaEstados} weighted keep-shapes ` +
    `${puntoInterior} ` +
    `-o ${q(tmpEst)} format=json ` +
    `-filter-fields CVE_ENT,NOM_ENT,NOMBRE_CORTO,ABREV,ISO_3166_2,LON,LAT ` +
    `-o ${q(rel('geo/estados/mx_estados.topojson'))} format=topojson quantization=10000 ` +
    `-o ${q(rel('geo/estados/mx_estados.geojson'))} format=geojson precision=0.0001`
);

const dimGeo = leerJson(tmpEst).sort((a, b) => a.CVE_ENT.localeCompare(b.CVE_ENT));
escribirCsv(rel('puente-inegi/catalogos/dim_geo.csv'), dimGeo, [
  'CVE_ENT', 'NOM_ENT', 'NOMBRE_CORTO', 'ABREV', 'ISO_3166_2', 'POBLACION_2020', 'LON', 'LAT',
]);

// La copia que se empaqueta dentro del visual (webpack la importa como JSON).
fs.copyFileSync(rel('geo/estados/mx_estados.topojson'), rel('visual/src/geo/estados.json'));

// --------------------------------------------------------------- 3. municipios
const tmpMun = rel('.cache', 'dim_mun_tmp.json');
await run(
  OPC.toleranciaMunicipios ? `Municipios (tolerancia ${OPC.toleranciaMunicipios} m)` : 'Municipios (sin volver a simplificar)',
  `-i ${q(LIMPIO)} name=municipios ` +
    (OPC.toleranciaMunicipios ? `-simplify interval=${OPC.toleranciaMunicipios} weighted keep-shapes ` : '') +
    `${puntoInterior} ` +
    `-o ${q(tmpMun)} format=json ` +
    `-filter-fields CVEGEO,CVE_ENT,CVE_MUN,NOMGEO ` +
    `-o ${q(rel('geo/municipios/mx_municipios.topojson'))} format=topojson quantization=20000`
);

const dimMun = leerJson(tmpMun).map((r) => ({ ...r, MUNICIPIO: r.NOMGEO }));
// Fila "sin municipio" por estado, para datos que solo llegan a nivel estatal.
for (const g of dimGeo) {
  dimMun.push({
    CVEGEO: `${g.CVE_ENT}000`, CVE_ENT: g.CVE_ENT, CVE_MUN: '000',
    MUNICIPIO: `${g.NOMBRE_CORTO} (sin municipio)`, LON: g.LON, LAT: g.LAT,
  });
}
dimMun.sort((a, b) => a.CVEGEO.localeCompare(b.CVEGEO));
escribirCsv(rel('puente-inegi/catalogos/dim_municipio.csv'), dimMun, [
  'CVEGEO', 'CVE_ENT', 'CVE_MUN', 'MUNICIPIO', 'LON', 'LAT',
]);

console.log(`\nGeometría lista: ${dimGeo.length} estados y ${dimMun.length - dimGeo.length} municipios.`);
