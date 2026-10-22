/**
 * Dibuja el visual fuera de Power BI con los datos del ejemplo y guarda PNG en
 * docs/img/. Usa el mismo código que corre en Power BI, con un host falso.
 *
 *   python scripts/modelo_referencia.py   # (en la raíz) genera .cache/vista_previa/
 *   npm run vista-previa                  # (en visual/)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

import { crearDataView, crearHost, nuevoElemento, opcionesUpdate, OpcionesDataView } from "../test/entorno";

const { Visual } = await import("../src/visual");

const RAIZ = new URL("../../", import.meta.url);
const leer = (archivo: string): Array<Record<string, string | number | null>> =>
    JSON.parse(readFileSync(new URL(`.cache/vista_previa/${archivo}`, RAIZ), "utf8"));
const estados = leer("estados.json");
const municipios = leer("municipios.json");

// Equivalente de style/visual.less (en Power BI lo aplica pbiviz; aquí va dentro del SVG).
const CSS = `
  .leyenda .fondo { fill: #ffffff; fill-opacity: 0.85; }
  .leyenda .titulo { fill: #252423; font-weight: 600; }
  .leyenda .etiqueta { fill: #605e5c; }
  .aviso { fill: #a4262c; font-size: 11px; }
  .limites-estatales, .contorno-grupos { stroke-linejoin: round; }
  text { font-family: Helvetica, Arial, sans-serif; }
`;

const porEstado = (medida: string, formato: string): OpcionesDataView => ({
    claves: estados.map((e) => e.CVE_ENT),
    valores: estados.map((e) => e[medida] as number | null),
    nombre: medida,
    formato,
});

const jalisco = municipios.filter((m) => String(m.CVEGEO).startsWith("14"));

const VISTAS: Array<{ archivo: string; datos: OpcionesDataView; ancho?: number; alto?: number }> = [
    { archivo: "mapa_ventas.png", datos: porEstado("Ventas Cadenas", "\\$#,0") },
    {
        archivo: "mapa_indice.png",
        datos: { ...porEstado("Índice Cadenas vs Nielsen", "#,0"), objetos: { colores: { metodo: "divergente", centro: 100, umbral1: 10, umbral2: 30 } } },
    },
    {
        archivo: "mapa_crecimiento.png",
        datos: {
            ...porEstado("Crec % Cadenas", "+0.0%;-0.0%;0.0%"),
            objetos: { colores: { metodo: "divergente", centro: 0, umbral1: 0.02, umbral2: 0.08, paletaDivergente: "morado-naranja" } },
        },
    },
    {
        // Regiones como dato del modelo: el contorno se calcula con el campo Grupo.
        archivo: "mapa_regiones.png",
        datos: {
            ...porEstado("Índice Cadenas vs Nielsen", "#,0"),
            grupo: { nombre: "Región", valores: estados.map((e) => e.REGION_NIELSEN) },
            objetos: { colores: { metodo: "divergente", centro: 100, umbral1: 10, umbral2: 30 } },
        },
    },
    {
        archivo: "municipios_jalisco.png",
        datos: { claves: jalisco.map((m) => m.CVEGEO), valores: jalisco.map((m) => m.VENTAS as number), nombre: "Ventas Cadenas", formato: "\\$#,0" },
        ancho: 640,
        alto: 560,
    },
];

mkdirSync(new URL("docs/img/", RAIZ), { recursive: true });
for (const v of VISTAS) {
    const ancho = v.ancho ?? 760;
    const alto = v.alto ?? 500;
    const elemento = nuevoElemento();
    const visual = new Visual({ element: elemento, host: crearHost().host } as never);
    visual.update(opcionesUpdate(crearDataView(v.datos), ancho, alto));
    const svg = elemento.querySelector("svg") as SVGSVGElement;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const estilo = document.createElementNS("http://www.w3.org/2000/svg", "style");
    estilo.textContent = CSS;
    svg.insertBefore(estilo, svg.firstChild);
    const png = new Resvg(svg.outerHTML, {
        fitTo: { mode: "width", value: ancho * 2 },
        background: "#fcfcfb",
        font: { loadSystemFonts: true, defaultFontFamily: "Helvetica" },
    }).render().asPng();
    writeFileSync(new URL(`docs/img/${v.archivo}`, RAIZ), png);
    console.log(`• docs/img/${v.archivo}`);
}
