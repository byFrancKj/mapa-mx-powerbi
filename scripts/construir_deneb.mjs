#!/usr/bin/env node
/**
 * Genera las especificaciones de Deneb (Vega-Lite 6) con la geometría incrustada.
 *
 *   npm run deneb
 *
 * Deneb es un visual certificado: no puede descargar archivos externos, por eso
 * cada especificación lleva su TopoJSON dentro (sección "datasets").
 *
 * Contrato de campos (los nombres deben coincidir con los del modelo):
 *   mapa_estados.json        CVE_ENT, ESTADO, REGION_NIELSEN, Valor Mapa, Valor Mapa Texto, Config Mapa
 *   mapa_bivariado.json      CVE_ENT, ESTADO, Valor Mapa, Valor Mapa Texto, Config Mapa,
 *                            Valor Mapa 2, Valor Mapa 2 Texto, Config Mapa 2
 *   comparativo_regiones.json REGION_NIELSEN, Comparar Cadenas, Comparar Cadenas Texto,
 *                            Comparar Nielsen, Comparar Nielsen Texto, Config Comparación
 *   municipios/*.json        CVEGEO, MUNICIPIO, Valor Mapa, Valor Mapa Texto, Config Mapa
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(ROOT, ...p);

// ----------------------------------------------------------------- paleta
// Secuencial: un solo tono (azul), de claro a oscuro.
const SECUENCIAL = ['#cde2fb', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'];
// Divergente: rojo (por debajo) · gris neutro · azul (por encima).
const DIVERGENTE = ['#e34948', '#ea9c9a', '#f0efec', '#9ec5f4', '#2a78d6'];
const NOMBRES_DIVERGENTE = ['Muy por debajo', 'Por debajo', 'Similar', 'Por encima', 'Muy por encima'];
const TINTA = { primaria: '#0b0b0b', secundaria: '#52514e', muted: '#898781', borde: '#c3c2b7', superficie: '#fcfcfb' };

// Bivariado 3×3 (paleta clásica de Joshua Stevens): X en azul verdoso, Y en rosa;
// la esquina alta-alta queda en índigo. Orden: fila Y baja → alta, columna X baja → alta.
export const BIVARIADO = [
  '#e8e8e8', '#ace4e4', '#5ac8c8',
  '#dfb0d6', '#a5add3', '#5698b9',
  '#be64ac', '#8c62aa', '#3b4994',
];

const PROY_CONICA = { type: 'conicConformal', parallels: [17.5, 29.5], rotate: [102, 0] };

const CONFIG = {
  view: { stroke: null },
  font: 'Segoe UI',
  background: null,
  legend: {
    orient: 'bottom-left',
    title: null,
    symbolType: 'square',
    symbolSize: 150,
    symbolStrokeWidth: 0,
    labelFontSize: 11,
    labelColor: TINTA.secundaria,
    labelLimit: 240,
    rowPadding: 3,
    offset: 4,
    padding: 6,
    fillColor: 'rgba(252,252,251,0.85)',
    cornerRadius: 4,
  },
  text: { font: 'Segoe UI' },
};

const CFG_VACIA = "['secuencial','0','0','0','','','','','','']";

/**
 * Transformaciones que convierten [valor, texto, config] en clase y color.
 * Secuencial: quintiles (5 clases con el mismo número de áreas).
 * Divergente: 5 clases alrededor de un centro con dos umbrales (definidos en el modelo).
 */
const clasificar = ({ valor, texto, config, prefijo = '' }) => {
  const p = prefijo;
  return [
    { calculate: `toNumber(datum['${valor}'])`, as: `${p}_v` },
    { filter: `isValid(datum.${p}_v) && isFinite(datum.${p}_v)` },
    { calculate: `isValid(datum['${config}']) ? split(datum['${config}'], '|') : ${CFG_VACIA}`, as: `${p}_cfg` },
    { calculate: `datum.${p}_cfg[0] == 'divergente' ? 'divergente' : 'secuencial'`, as: `${p}_escala` },
    { calculate: `toNumber(datum.${p}_cfg[1])`, as: `${p}_c` },
    { calculate: `toNumber(datum.${p}_cfg[2])`, as: `${p}_u1` },
    { calculate: `toNumber(datum.${p}_cfg[3])`, as: `${p}_u2` },
    { calculate: `datum.${p}_cfg[9]`, as: `${p}_titulo` },
    {
      calculate: `isValid(datum['${texto}']) ? datum['${texto}'] : format(datum.${p}_v, ',.4~g')`,
      as: `${p}_txt`,
    },
    { window: [{ op: 'ntile', param: 5, as: `${p}_q` }], sort: [{ field: `${p}_v`, order: 'ascending' }] },
    {
      calculate:
        `datum.${p}_escala == 'divergente' ? (` +
        `datum.${p}_v < datum.${p}_c - datum.${p}_u2 ? 1 : ` +
        `datum.${p}_v < datum.${p}_c - datum.${p}_u1 ? 2 : ` +
        `datum.${p}_v <= datum.${p}_c + datum.${p}_u1 ? 3 : ` +
        `datum.${p}_v <= datum.${p}_c + datum.${p}_u2 ? 4 : 5) : datum.${p}_q`,
      as: `${p}_clase`,
    },
    {
      joinaggregate: [
        { op: 'argmin', field: `${p}_v`, as: `${p}_min` },
        { op: 'argmax', field: `${p}_v`, as: `${p}_max` },
      ],
      groupby: [`${p}_clase`],
    },
    {
      calculate:
        `datum.${p}_escala == 'divergente' ? ` +
        `(length(datum.${p}_cfg[3 + datum.${p}_clase]) > 0 ? datum.${p}_cfg[3 + datum.${p}_clase] : ${JSON.stringify(NOMBRES_DIVERGENTE).replace(/"/g, "'")}[datum.${p}_clase - 1]) : ` +
        `(datum.${p}_min.${p}_txt == datum.${p}_max.${p}_txt ? datum.${p}_min.${p}_txt : datum.${p}_min.${p}_txt + ' – ' + datum.${p}_max.${p}_txt)`,
      as: `${p}_etq`,
    },
    {
      calculate:
        `datum.${p}_escala == 'divergente' ? ${JSON.stringify(DIVERGENTE).replace(/"/g, "'")}[datum.${p}_clase - 1] : ` +
        `${JSON.stringify(SECUENCIAL).replace(/"/g, "'")}[datum.${p}_clase - 1]`,
      as: `${p}_color`,
    },
  ];
};

const lugar = (p = '') => [
  { window: [{ op: 'rank', as: `${p}_rank` }], sort: [{ field: `${p}_v`, order: 'descending' }] },
  { joinaggregate: [{ op: 'count', as: `${p}_n` }] },
  { calculate: `datum.${p}_rank + ' de ' + datum.${p}_n`, as: `${p}_lugar` },
];

/**
 * Leyenda dibujada a mano (abajo a la izquierda). Se usa en lugar de la leyenda
 * automática porque el color de cada clase viene de los datos y debe respetarse
 * exactamente, sea escala secuencial o divergente.
 */
const ESC_LEY_X = { domain: [0, 1], range: [14, 28] };
const ESC_LEY_Y = { domain: [0, 5], range: [{ expr: 'height - 12' }, { expr: 'height - 102' }] };
const leyenda = (transformaciones, p = '') => ({
  description: 'Leyenda',
  transform: [
    ...transformaciones,
    {
      aggregate: [
        { op: 'min', field: `${p}_color`, as: 'color' },
        { op: 'min', field: `${p}_etq`, as: 'etq' },
      ],
      groupby: [`${p}_clase`],
    },
    { calculate: `5 - datum.${p}_clase`, as: 'y0' },
    { calculate: 'datum.y0 + 0.78', as: 'y1' },
    { calculate: 'datum.y0 + 0.39', as: 'ym' },
  ],
  layer: [
    {
      mark: { type: 'rect', cornerRadius: 2 },
      encoding: {
        x: { datum: 0, type: 'quantitative', scale: ESC_LEY_X, axis: null },
        x2: { datum: 1 },
        y: { field: 'y0', type: 'quantitative', scale: ESC_LEY_Y, axis: null },
        y2: { field: 'y1' },
        color: { field: 'color', type: 'nominal', scale: null, legend: null },
      },
    },
    {
      mark: { type: 'text', align: 'left', baseline: 'middle', dx: 6, fontSize: 11, color: TINTA.secundaria, limit: 260 },
      encoding: {
        x: { datum: 1, type: 'quantitative', scale: ESC_LEY_X },
        y: { field: 'ym', type: 'quantitative', scale: ESC_LEY_Y },
        text: { field: 'etq' },
      },
    },
  ],
});

const atenuarNoSeleccion = { condition: { test: "datum.__selected__ == 'off'", value: 0.3 }, value: 1 };

// ------------------------------------------------- mapa coroplético genérico
const transformacionesMapa = (datasetGeo, objeto, clave, claveGeo) => [
  { lookup: clave, from: { data: { name: datasetGeo, format: { type: 'topojson', feature: objeto } }, key: `properties.${claveGeo}` }, as: 'geo' },
  { filter: 'isValid(datum.geo)' },
  ...clasificar({ valor: 'Valor Mapa', texto: 'Valor Mapa Texto', config: 'Config Mapa' }),
];

const mapaCoropletico = ({ datasetGeo, objeto, clave, claveGeo, nombre, nombreGeo, etiquetaNombre, contornos = [], extraTooltip = [] }) => ({
  $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
  description: `Mapa coroplético por ${etiquetaNombre.toLowerCase()}: quintiles o escala divergente según "Config Mapa".`,
  width: 'container',
  height: 'container',
  autosize: { type: 'fit', contains: 'padding' },
  padding: 4,
  config: CONFIG,
  datasets: Object.fromEntries([datasetGeo, ...contornos.map((c) => c.dataset)].map((d) => [d, `__TOPO:${d}__`])),
  data: { name: 'dataset' },
  projection: PROY_CONICA,
  layer: [
    {
      description: 'Base: todas las áreas, incluso las que no tienen datos',
      data: { name: datasetGeo, format: { type: 'topojson', feature: objeto } },
      mark: { type: 'geoshape', fill: '#ffffff', stroke: TINTA.borde, strokeWidth: 0.6 },
    },
    {
      description: 'Áreas con datos, coloreadas por clase',
      transform: [...transformacionesMapa(datasetGeo, objeto, clave, claveGeo), ...lugar()],
      params: [{ name: 'hover', select: { type: 'point', on: 'pointerover', clear: 'pointerout', fields: [clave] } }],
      mark: { type: 'geoshape', cursor: 'pointer' },
      encoding: {
        shape: { field: 'geo', type: 'geojson' },
        color: { field: '_color', type: 'nominal', scale: null, legend: null },
        stroke: { condition: { param: 'hover', empty: false, value: TINTA.primaria }, value: TINTA.superficie },
        strokeWidth: { condition: { param: 'hover', empty: false, value: 1.8 }, value: 0.7 },
        opacity: atenuarNoSeleccion,
        tooltip: [
          { field: nombre, title: etiquetaNombre },
          ...extraTooltip,
          { field: '_titulo', title: 'Métrica' },
          { field: '_txt', title: 'Valor' },
          { field: '_etq', title: 'Rango' },
          { field: '_lugar', title: 'Lugar' },
        ],
      },
    },
    ...contornos.map((c) => ({
      description: c.descripcion,
      data: { name: c.dataset, format: { type: 'topojson', feature: c.objeto } },
      mark: { type: 'geoshape', fill: null, stroke: TINTA.secundaria, strokeWidth: c.grosor ?? 1.1, strokeJoin: 'round' },
    })),
    leyenda(transformacionesMapa(datasetGeo, objeto, clave, claveGeo)),
  ],
});

// ----------------------------------------------------------- mapa bivariado
const mapaBivariado = () => {
  const ESC = { domain: [0, 3], range: [14, 74] };
  const ESC_Y = { domain: [0, 3], range: [{ expr: 'height - 30' }, { expr: 'height - 90' }] };
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    description: 'Mapa bivariado 3×3: terciles de "Valor Mapa" (azul) contra terciles de "Valor Mapa 2" (naranja).',
    width: 'container',
    height: 'container',
    autosize: { type: 'fit', contains: 'padding' },
    padding: 4,
    config: CONFIG,
    datasets: { mx_estados: '__TOPO:mx_estados__', mx_regiones: '__TOPO:mx_regiones__' },
    data: { name: 'dataset' },
    projection: PROY_CONICA,
    layer: [
      {
        data: { name: 'mx_estados', format: { type: 'topojson', feature: 'estados' } },
        mark: { type: 'geoshape', fill: '#ffffff', stroke: TINTA.borde, strokeWidth: 0.6 },
      },
      {
        transform: [
          { lookup: 'CVE_ENT', from: { data: { name: 'mx_estados', format: { type: 'topojson', feature: 'estados' } }, key: 'properties.CVE_ENT' }, as: 'geo' },
          { filter: 'isValid(datum.geo)' },
          ...clasificar({ valor: 'Valor Mapa', texto: 'Valor Mapa Texto', config: 'Config Mapa', prefijo: 'x' }),
          ...clasificar({ valor: 'Valor Mapa 2', texto: 'Valor Mapa 2 Texto', config: 'Config Mapa 2', prefijo: 'y' }),
          { window: [{ op: 'ntile', param: 3, as: 'tx' }], sort: [{ field: 'x_v' }] },
          { window: [{ op: 'ntile', param: 3, as: 'ty' }], sort: [{ field: 'y_v' }] },
          { calculate: `${JSON.stringify(BIVARIADO).replace(/"/g, "'")}[(datum.ty - 1) * 3 + datum.tx - 1]`, as: '_color' },
          { calculate: "datum.tx + '-' + datum.ty", as: '_bv' },
          {
            calculate: "['bajo','medio','alto'][datum.tx - 1] + ' en ' + datum.x_titulo + ' · ' + ['bajo','medio','alto'][datum.ty - 1] + ' en ' + datum.y_titulo",
            as: '_desc',
          },
        ],
        params: [{ name: 'hover', select: { type: 'point', on: 'pointerover', clear: 'pointerout', fields: ['CVE_ENT'] } }],
        mark: { type: 'geoshape', cursor: 'pointer' },
        encoding: {
          shape: { field: 'geo', type: 'geojson' },
          color: { field: '_color', type: 'nominal', scale: null, legend: null },
          stroke: { condition: { param: 'hover', empty: false, value: TINTA.primaria }, value: TINTA.superficie },
          strokeWidth: { condition: { param: 'hover', empty: false, value: 1.8 }, value: 0.7 },
          opacity: atenuarNoSeleccion,
          tooltip: [
            { field: 'ESTADO', title: 'Estado' },
            { field: 'x_titulo', title: 'Métrica X' },
            { field: 'x_txt', title: 'Valor X' },
            { field: 'y_titulo', title: 'Métrica Y' },
            { field: 'y_txt', title: 'Valor Y' },
            { field: '_desc', title: 'Clase' },
          ],
        },
      },
      {
        data: { name: 'mx_regiones', format: { type: 'topojson', feature: 'regiones' } },
        mark: { type: 'geoshape', fill: null, stroke: TINTA.secundaria, strokeWidth: 1.3, strokeJoin: 'round' },
      },
      {
        description: 'Leyenda 3×3',
        data: { sequence: { start: 0, stop: 9, as: 'k' } },
        transform: [
          { calculate: 'datum.k % 3', as: 'i' },
          { calculate: 'floor(datum.k / 3)', as: 'j' },
          { calculate: 'datum.i + 0.94', as: 'i2' },
          { calculate: 'datum.j + 0.94', as: 'j2' },
          { calculate: `${JSON.stringify(BIVARIADO).replace(/"/g, "'")}[datum.k]`, as: 'c' },
        ],
        mark: { type: 'rect', cornerRadius: 2 },
        encoding: {
          x: { field: 'i', type: 'quantitative', scale: ESC, axis: null },
          x2: { field: 'i2' },
          y: { field: 'j', type: 'quantitative', scale: ESC_Y, axis: null },
          y2: { field: 'j2' },
          color: { field: 'c', type: 'nominal', scale: null, legend: null },
        },
      },
      {
        description: 'Títulos de los ejes de la leyenda (se toman de Config Mapa y Config Mapa 2)',
        transform: [
          { window: [{ op: 'row_number', as: 'rn' }] },
          { filter: 'datum.rn == 1' },
          { calculate: `(isValid(datum['Config Mapa']) ? split(datum['Config Mapa'], '|')[9] : 'Valor Mapa') + ' →'`, as: 'tx' },
          { calculate: `(isValid(datum['Config Mapa 2']) ? split(datum['Config Mapa 2'], '|')[9] : 'Valor Mapa 2') + ' →'`, as: 'ty' },
        ],
        layer: [
          {
            mark: { type: 'text', align: 'left', baseline: 'top', dy: 4, fontSize: 10, color: TINTA.secundaria, limit: 200 },
            encoding: { x: { datum: 0, type: 'quantitative', scale: ESC }, y: { datum: 0, type: 'quantitative', scale: ESC_Y }, text: { field: 'tx' } },
          },
          {
            mark: { type: 'text', align: 'left', baseline: 'bottom', angle: 270, dx: 0, dy: -4, fontSize: 10, color: TINTA.secundaria, limit: 120 },
            encoding: { x: { datum: 0, type: 'quantitative', scale: ESC }, y: { datum: 0, type: 'quantitative', scale: ESC_Y }, text: { field: 'ty' } },
          },
        ],
      },
    ],
  };
};

// ------------------------------------------- comparativo Cadenas vs Nielsen
const comparativoRegiones = () => {
  const lookupGeo = { lookup: '_key', from: { data: { name: 'mx_comparativo', format: { type: 'topojson', feature: 'comparativo' } }, key: 'properties.KEY' }, as: 'geo' };
  const transformaciones = [
    { fold: ['Comparar Cadenas', 'Comparar Nielsen'], as: ['_serie', '_valor'] },
    { calculate: "datum._serie == 'Comparar Cadenas' ? 'I' : 'D'", as: '_lado' },
    { calculate: "datum._lado + '|' + datum.REGION_NIELSEN", as: '_key' },
    { calculate: "datum._lado == 'I' ? datum['Comparar Cadenas Texto'] : datum['Comparar Nielsen Texto']", as: '_texto' },
    { calculate: "datum._lado == 'I' ? 'Cadenas' : 'Nielsen'", as: '_fuente' },
    lookupGeo,
    { filter: 'isValid(datum.geo)' },
    ...clasificar({ valor: '_valor', texto: '_texto', config: 'Config Comparación' }),
  ];
  return {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    description: 'Cadenas (izquierda) contra Nielsen (derecha) por región Nielsen, con la misma escala de color.',
    width: 'container',
    height: 'container',
    autosize: { type: 'fit', contains: 'padding' },
    padding: 4,
    config: CONFIG,
    datasets: { mx_comparativo: '__TOPO:mx_comparativo__' },
    data: { name: 'dataset' },
    projection: { type: 'mercator' },
    layer: [
      {
        data: { name: 'mx_comparativo', format: { type: 'topojson', feature: 'comparativo' } },
        mark: { type: 'geoshape', fill: '#ffffff', stroke: TINTA.borde, strokeWidth: 0.8 },
      },
      {
        transform: transformaciones,
        params: [{ name: 'hover', select: { type: 'point', on: 'pointerover', clear: 'pointerout', fields: ['REGION_NIELSEN'] } }],
        mark: { type: 'geoshape', cursor: 'pointer' },
        encoding: {
          shape: { field: 'geo', type: 'geojson' },
          color: { field: '_color', type: 'nominal', scale: null, legend: null },
          stroke: { condition: { param: 'hover', empty: false, value: TINTA.primaria }, value: TINTA.superficie },
          strokeWidth: { condition: { param: 'hover', empty: false, value: 1.8 }, value: 1 },
          opacity: atenuarNoSeleccion,
          tooltip: [
            { field: 'REGION_NIELSEN', title: 'Región Nielsen' },
            { field: '_fuente', title: 'Fuente' },
            { field: '_titulo', title: 'Métrica' },
            { field: '_txt', title: 'Valor' },
            { field: '_etq', title: 'Rango' },
          ],
        },
      },
      {
        description: 'Valor de cada región (halo + texto)',
        transform: transformaciones,
        layer: [
          {
            mark: { type: 'text', fontSize: 11, fontWeight: 600, stroke: TINTA.superficie, strokeWidth: 3, strokeJoin: 'round', opacity: 0.9 },
            encoding: { longitude: { field: 'geo.properties.LON', type: 'quantitative' }, latitude: { field: 'geo.properties.LAT', type: 'quantitative' }, text: { field: '_txt' } },
          },
          {
            mark: { type: 'text', fontSize: 11, fontWeight: 600, color: TINTA.primaria },
            encoding: { longitude: { field: 'geo.properties.LON', type: 'quantitative' }, latitude: { field: 'geo.properties.LAT', type: 'quantitative' }, text: { field: '_txt' } },
          },
        ],
      },
      leyenda(transformaciones),
      {
        description: 'Encabezados de cada mapa',
        data: { values: [{ t: 'Cadenas', lon: -101, lat: 34.2 }, { t: 'Nielsen', lon: -67, lat: 34.2 }] },
        mark: { type: 'text', fontSize: 13, fontWeight: 600, color: TINTA.primaria, baseline: 'bottom' },
        encoding: { longitude: { field: 'lon', type: 'quantitative' }, latitude: { field: 'lat', type: 'quantitative' }, text: { field: 't' } },
      },
    ],
  };
};

// ------------------------------------------------------------- escritura
const leerTopo = (archivo) => JSON.stringify(JSON.parse(fs.readFileSync(rel(archivo), 'utf8')));

const escribir = (destino, spec, topos) => {
  let txt = JSON.stringify(spec, null, 2);
  for (const [nombre, archivo] of Object.entries(topos)) {
    txt = txt.replace(`"__TOPO:${nombre}__"`, () => leerTopo(archivo));
  }
  if (txt.includes('__TOPO:')) throw new Error(`Falta geometría en ${destino}`);
  JSON.parse(txt);
  fs.mkdirSync(path.dirname(rel(destino)), { recursive: true });
  fs.writeFileSync(rel(destino), txt);
  return destino;
};

export const especificaciones = () => {
  const salida = [];
  salida.push([
    'deneb/mapa_estados.json',
    mapaCoropletico({
      datasetGeo: 'mx_estados', objeto: 'estados', clave: 'CVE_ENT', claveGeo: 'CVE_ENT',
      nombre: 'ESTADO', nombreGeo: 'NOMBRE_CORTO', etiquetaNombre: 'Estado',
      extraTooltip: [{ field: 'REGION_NIELSEN', title: 'Región Nielsen' }],
      contornos: [{ dataset: 'mx_regiones', objeto: 'regiones', descripcion: 'Contorno de regiones Nielsen' }],
    }),
    { mx_estados: 'geo/estados/mx_estados.topojson', mx_regiones: 'geo/regiones/mx_regiones.topojson' },
  ]);
  salida.push(['deneb/mapa_bivariado.json', mapaBivariado(), { mx_estados: 'geo/estados/mx_estados.topojson', mx_regiones: 'geo/regiones/mx_regiones.topojson' }]);
  salida.push(['deneb/comparativo_regiones.json', comparativoRegiones(), { mx_comparativo: 'geo/regiones/mx_regiones_comparativo.topojson' }]);

  const munCfg = {
    datasetGeo: 'mx_municipios', objeto: 'municipios', clave: 'CVEGEO', claveGeo: 'CVEGEO',
    nombre: 'MUNICIPIO', nombreGeo: 'NOMGEO', etiquetaNombre: 'Municipio',
  };
  const dirEst = rel('geo/municipios/por_estado');
  if (fs.existsSync(dirEst)) {
    for (const f of fs.readdirSync(dirEst).filter((x) => /^mun_\d{2}\.topojson$/.test(x)).sort()) {
      const cve = f.slice(4, 6);
      salida.push([`deneb/municipios/mapa_municipios_${cve}.json`, mapaCoropletico(munCfg), { mx_municipios: `geo/municipios/por_estado/${f}` }]);
    }
  }
  if (fs.existsSync(rel('geo/municipios/mx_municipios.topojson'))) {
    salida.push([
      'deneb/municipios/mapa_municipios_nacional.json',
      mapaCoropletico({ ...munCfg, contornos: [{ dataset: 'mx_estados', objeto: 'estados', descripcion: 'Contorno estatal', grosor: 0.9 }] }),
      { mx_municipios: 'geo/municipios/mx_municipios.topojson', mx_estados: 'geo/estados/mx_estados.topojson' },
    ]);
  }
  return salida;
};

export const construirDeneb = () => {
  const salida = especificaciones();
  for (const [destino, spec, topos] of salida) escribir(destino, spec, topos);
  const kb = (f) => Math.round(fs.statSync(rel(f)).size / 1024);
  for (const [destino] of salida.filter(([d]) => !/municipios_\d{2}/.test(d))) console.log(`• ${destino} (${kb(destino)} KB)`);
  const nMun = salida.filter(([d]) => /municipios_\d{2}/.test(d)).length;
  if (nMun) console.log(`• deneb/municipios/mapa_municipios_XX.json (${nMun} estados)`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) construirDeneb();
