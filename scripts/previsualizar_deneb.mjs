#!/usr/bin/env node
/**
 * Dibuja las especificaciones de Deneb fuera de Power BI (Vega 6 + Vega-Lite 6,
 * las mismas versiones que usa Deneb) y guarda PNG en docs/img/.
 *
 *   python scripts/modelo_referencia.py   # genera los datos de .cache/vista_previa
 *   npm run vistas
 *
 * También sirve como prueba: si una especificación tiene un error, falla aquí.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vega from 'vega';
import * as vl from 'vega-lite';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(ROOT, ...p);

const VISTAS = [
  { spec: 'deneb/mapa_estados.json', datos: 'mapa_ventas', salida: 'mapa_ventas', w: 760, h: 500 },
  { spec: 'deneb/mapa_estados.json', datos: 'mapa_indice', salida: 'mapa_indice', w: 760, h: 500 },
  { spec: 'deneb/mapa_bivariado.json', datos: 'mapa_bivariado', salida: 'mapa_bivariado', w: 760, h: 500 },
  { spec: 'deneb/comparativo_regiones.json', datos: 'comparativo_regiones', salida: 'comparativo_regiones', w: 980, h: 380 },
  { spec: 'deneb/municipios/mapa_municipios_14.json', datos: 'municipios_14', salida: 'municipios_jalisco', w: 640, h: 560 },
];

fs.mkdirSync(rel('docs/img'), { recursive: true });
let errores = 0;
for (const v of VISTAS) {
  const datos = rel('.cache/vista_previa', `${v.datos}.json`);
  if (!fs.existsSync(datos)) {
    console.error(`Faltan datos ${datos}. Ejecuta antes: python scripts/modelo_referencia.py`);
    process.exit(1);
  }
  try {
    const spec = JSON.parse(fs.readFileSync(rel(v.spec), 'utf8'));
    // Deneb ajusta el tamaño al contenedor; fuera de Power BI se fija a mano.
    spec.width = v.w;
    spec.height = v.h;
    spec.config = { ...spec.config, background: '#fcfcfb' };
    const { spec: vgSpec } = vl.compile(spec);
    const view = new vega.View(vega.parse(vgSpec), { renderer: 'none' });
    view.data('dataset', JSON.parse(fs.readFileSync(datos, 'utf8')));
    await view.runAsync();
    const svg = await view.toSVG();
    const png = new Resvg(svg, {
      fitTo: { mode: 'width', value: v.w * 2 },
      font: { loadSystemFonts: true, defaultFontFamily: 'Inter' },
    }).render().asPng();
    fs.writeFileSync(rel('docs/img', `${v.salida}.png`), png);
    console.log(`• docs/img/${v.salida}.png`);
  } catch (e) {
    errores++;
    console.error(`✗ ${v.spec} con ${v.datos}: ${e.message}`);
  }
}
process.exit(errores ? 1 : 0);
