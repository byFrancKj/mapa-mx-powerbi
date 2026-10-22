#!/usr/bin/env node
/**
 * Construye las geometrías y catálogos del proyecto a partir de la capa
 * municipal del Marco Geoestadístico de INEGI.
 *
 *   npm install
 *   npm run geo                                   # usa la capa del repositorio
 *   npm run geo -- --fuente "ruta/a/00mun.shp"    # usa la capa original de INEGI
 *
 * Qué genera:
 *   geo/estados/mx_estados.topojson + .geojson     (objeto "estados")
 *   geo/regiones/mx_regiones.topojson + .geojson   (objeto "regiones")
 *   geo/regiones/mx_regiones_comparativo.topojson (regiones duplicadas lado a lado)
 *   geo/municipios/mx_municipios.topojson         (objeto "municipios")
 *   geo/municipios/por_estado/mun_XX.topojson     (un archivo por estado)
 *   catalogos/dim_geo.csv, dim_municipio.csv, dim_region.csv
 *   deneb/*.json                                  (especificaciones con la geometría incrustada)
 *
 * Las regiones Nielsen salen de config/regiones_estado.csv y, si tiene filas,
 * de config/regiones_municipio.csv (para áreas que parten un estado).
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

// Fuente: la capa que indiques con --fuente; si no, la versión simplificada que
// ya viene en el repositorio (suficiente para cambiar regiones Nielsen).
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
  toleranciaMunicipios: Number(args['tolerancia-municipios'] || 400),
  encoding: args.encoding || null, // p. ej. latin1 si los acentos salen mal
  sinMunicipios: Boolean(args['sin-municipios']),
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

const leerCsv = (archivo) => {
  const txt = fs.readFileSync(archivo, 'utf8').replace(/^﻿/, '').trim();
  if (!txt) return [];
  const [enc, ...filas] = txt.split(/\r?\n/);
  const cols = enc.split(',').map((c) => c.trim());
  return filas
    .filter((f) => f.trim())
    .map((f) => {
      const v = f.split(',');
      return Object.fromEntries(cols.map((c, i) => [c, (v[i] ?? '').trim()]));
    });
};

const escribirCsv = (archivo, filas, cols) => {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const out = [cols.join(','), ...filas.map((f) => cols.map((c) => esc(f[c])).join(','))];
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, out.join('\n') + '\n', 'utf8');
};

for (const d of ['geo/estados', 'geo/regiones', 'geo/municipios/por_estado', 'catalogos', '.cache']) {
  fs.mkdirSync(rel(d), { recursive: true });
}

// ------------------------------------------------------------ configuración
const CFG = {
  estados: rel('config', 'estados.csv'),
  regEst: rel('config', 'regiones_estado.csv'),
  regMun: rel('config', 'regiones_municipio.csv'),
  regOrden: rel('config', 'regiones_orden.csv'),
};

const regionesEstado = leerCsv(CFG.regEst);
const overrides = fs.existsSync(CFG.regMun) ? leerCsv(CFG.regMun) : [];
const ordenRegiones = leerCsv(CFG.regOrden);

if (regionesEstado.length !== 32) {
  console.error(`config/regiones_estado.csv debe tener las 32 entidades (tiene ${regionesEstado.length}).`);
  process.exit(1);
}
const conOverrides = overrides.length > 0;
const estadosDivididos = new Set(overrides.map((o) => o.CVEGEO.slice(0, 2)));

// -------------------------------------------- 1. limpiar la capa de origen
const LIMPIO = rel('.cache', 'municipios_limpio.json');
const HUELLA = rel('.cache', 'municipios_limpio.fuente');
const huella = `${path.resolve(OPC.fuente)}|${fs.statSync(OPC.fuente).mtimeMs}|${OPC.encoding || ''}`;
const huellaPrevia = fs.existsSync(HUELLA) ? fs.readFileSync(HUELLA, 'utf8') : '';
if (!fs.existsSync(LIMPIO) || huellaPrevia !== huella || args.limpiar) {
  await run(
    'Limpiando topología de la capa municipal (solo la primera vez)',
    `-i ${q(OPC.fuente)} name=municipios ${OPC.encoding ? `encoding=${OPC.encoding}` : ''} ` +
      `-proj wgs84 -filter-fields CVEGEO,CVE_ENT,CVE_MUN,NOMGEO -clean ` +
      `-o ${q(LIMPIO)} format=geojson`
  );
  fs.writeFileSync(HUELLA, huella);
}

// Asigna REGION_NIELSEN a cada municipio (por estado y, si aplica, por municipio).
const OVR = rel('.cache', 'overrides.csv');
if (conOverrides) escribirCsv(OVR, overrides.map((o) => ({ CVEGEO: o.CVEGEO, OVR_REGION: o.REGION_NIELSEN })), ['CVEGEO', 'OVR_REGION']);
const asignarRegion =
  `-join ${q(CFG.regEst)} keys=CVE_ENT,CVE_ENT string-fields=CVE_ENT ` +
  (conOverrides
    ? `-join ${q(OVR)} keys=CVEGEO,CVEGEO string-fields=CVEGEO ` +
      `-each "if (OVR_REGION) REGION_NIELSEN = OVR_REGION" -filter-fields CVEGEO,CVE_ENT,CVE_MUN,NOMGEO,REGION_NIELSEN `
    : '');
const puntoInterior = `-each "LON=Math.round(this.innerX*1e5)/1e5, LAT=Math.round(this.innerY*1e5)/1e5"`;

// ---------------------------------------------------- 2. estados y regiones
const tmpEst = rel('.cache', 'dim_geo_tmp.csv');
await run(
  `Estados y regiones (tolerancia ${OPC.toleranciaEstados} m)`,
  `-i ${q(LIMPIO)} name=municipios ${asignarRegion}` +
    `-dissolve CVE_ENT + name=estados ` +
    `-dissolve REGION_NIELSEN target=municipios + name=regiones ` +
    `-join ${q(CFG.estados)} target=estados keys=CVE_ENT,CVE_ENT string-fields=CVE_ENT ` +
    `-join ${q(CFG.regEst)} target=estados keys=CVE_ENT,CVE_ENT string-fields=CVE_ENT ` +
    `-simplify interval=${OPC.toleranciaEstados} weighted keep-shapes target=estados ` +
    `${puntoInterior} target=estados ` +
    `${puntoInterior} target=regiones ` +
    `-o ${q(tmpEst)} format=csv target=estados ` +
    `-filter-fields CVE_ENT,NOM_ENT,NOMBRE_CORTO,ABREV,ISO_3166_2,REGION_NIELSEN target=estados ` +
    `-o ${q(rel('geo/estados/mx_estados.topojson'))} format=topojson quantization=10000 target=estados ` +
    `-o ${q(rel('geo/regiones/mx_regiones.topojson'))} format=topojson quantization=10000 target=regiones ` +
    `-o ${q(rel('geo/estados/mx_estados.geojson'))} format=geojson precision=0.0001 target=estados ` +
    `-o ${q(rel('geo/regiones/mx_regiones.geojson'))} format=geojson precision=0.0001 target=regiones`
);

// Regiones duplicadas lado a lado (copia desplazada 34° al este) para el mapa
// comparativo Cadenas vs Nielsen: un solo mapa, dos vistas, misma escala.
const DESPLAZAMIENTO = 34;
await run(
  'Regiones para el comparativo lado a lado',
  `-i ${q(rel('geo/regiones/mx_regiones.geojson'))} name=izq ` +
    `-each "LADO='I', KEY='I|' + REGION_NIELSEN" ` +
    `-i ${q(rel('geo/regiones/mx_regiones.geojson'))} name=der ` +
    `-affine shift=${DESPLAZAMIENTO},0 ` +
    `-each "LADO='D', KEY='D|' + REGION_NIELSEN, LON = Math.round((LON + ${DESPLAZAMIENTO})*1e5)/1e5" ` +
    `-merge-layers target=izq,der force name=comparativo ` +
    `-o ${q(rel('geo/regiones/mx_regiones_comparativo.topojson'))} format=topojson quantization=10000`
);

// dim_geo.csv: catálogo de estados con punto interior y bandera de región dividida
const dimGeo = leerCsv(tmpEst).map((r) => ({
  ...r,
  REGION_DIVIDIDA: estadosDivididos.has(r.CVE_ENT) ? 1 : 0,
}));
escribirCsv(rel('catalogos/dim_geo.csv'), dimGeo, [
  'CVE_ENT', 'NOM_ENT', 'NOMBRE_CORTO', 'ABREV', 'ISO_3166_2',
  'REGION_NIELSEN', 'REGION_DIVIDIDA', 'POBLACION_2020', 'LON', 'LAT',
]);

// dim_region.csv
const regiones = [...new Set(regionesEstado.map((r) => r.REGION_NIELSEN).concat(overrides.map((o) => o.REGION_NIELSEN)))];
const orden = Object.fromEntries(ordenRegiones.map((r) => [r.REGION_NIELSEN, Number(r.ORDEN)]));
const poblacionRegion = {};
for (const r of dimGeo) poblacionRegion[r.REGION_NIELSEN] = (poblacionRegion[r.REGION_NIELSEN] || 0) + Number(r.POBLACION_2020);
escribirCsv(
  rel('catalogos/dim_region.csv'),
  regiones
    .map((r) => ({ REGION_NIELSEN: r, ORDEN: orden[r] ?? 99, ESTADOS: dimGeo.filter((g) => g.REGION_NIELSEN === r).map((g) => g.ABREV).join(' ') }))
    .sort((a, b) => a.ORDEN - b.ORDEN || a.REGION_NIELSEN.localeCompare(b.REGION_NIELSEN)),
  ['REGION_NIELSEN', 'ORDEN', 'ESTADOS']
);

// ---------------------------------------------------------------- 3. municipios
if (!OPC.sinMunicipios) {
  const tmpMun = rel('.cache', 'dim_mun_tmp.csv');
  const dirPorEstado = rel('geo/municipios/por_estado');
  await run(
    `Municipios (tolerancia ${OPC.toleranciaMunicipios} m)`,
    `-i ${q(LIMPIO)} name=municipios ${asignarRegion}` +
      `-simplify interval=${OPC.toleranciaMunicipios} weighted keep-shapes ` +
      `${puntoInterior} ` +
      `-o ${q(tmpMun)} format=csv ` +
      `-filter-fields CVEGEO,CVE_ENT,CVE_MUN,NOMGEO,REGION_NIELSEN ` +
      `-o ${q(rel('geo/municipios/mx_municipios.topojson'))} format=topojson quantization=20000 ` +
      `-split CVE_ENT ` +
      `-o ${q(dirPorEstado + '/')} format=topojson quantization=20000 singles extension=topojson`
  );
  // Renombra municipios-01.topojson -> mun_01.topojson y fija el nombre del objeto
  for (const f of fs.readdirSync(dirPorEstado)) {
    const m = f.match(/(\d{2})\.topojson$/);
    if (!m) continue;
    const destino = path.join(dirPorEstado, `mun_${m[1]}.topojson`);
    const topo = JSON.parse(fs.readFileSync(path.join(dirPorEstado, f), 'utf8'));
    const [obj] = Object.values(topo.objects);
    topo.objects = { municipios: obj };
    fs.writeFileSync(destino, JSON.stringify(topo));
    if (path.join(dirPorEstado, f) !== destino) fs.unlinkSync(path.join(dirPorEstado, f));
  }
  const dimMun = leerCsv(tmpMun).map((r) => ({ ...r, MUNICIPIO: r.NOMGEO }));
  // Fila "sin municipio" por estado, para cadenas que solo reportan a nivel estatal.
  for (const g of dimGeo) {
    dimMun.push({
      CVEGEO: `${g.CVE_ENT}000`, CVE_ENT: g.CVE_ENT, CVE_MUN: '000',
      MUNICIPIO: `${g.NOMBRE_CORTO} (sin municipio)`, REGION_NIELSEN: g.REGION_NIELSEN,
      LON: g.LON, LAT: g.LAT,
    });
  }
  dimMun.sort((a, b) => a.CVEGEO.localeCompare(b.CVEGEO));
  escribirCsv(rel('catalogos/dim_municipio.csv'), dimMun, [
    'CVEGEO', 'CVE_ENT', 'CVE_MUN', 'MUNICIPIO', 'REGION_NIELSEN', 'LON', 'LAT',
  ]);
}

console.log(`\nGeometría lista. Regiones: ${regiones.length}${conOverrides ? ` (con ${overrides.length} municipios reasignados)` : ''}.`);

// ------------------------------------------------- 4. especificaciones de Deneb
// Las especificaciones llevan la geometría incrustada, así que se regeneran aquí.
const { construirDeneb } = await import('./construir_deneb.mjs');
construirDeneb();
