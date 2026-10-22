/**
 * Dibuja el visual fuera de Power BI con los datos del ejemplo y guarda PNG en
 * docs/img/. Usa el mismo código que corre en Power BI, con un host falso.
 *
 *   python scripts/modelo_referencia.py   # (en la raíz) genera .cache/vista_previa/estados.json
 *   npm run vista-previa                  # (en visual/)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

import { crearDataView, crearHost, nuevoElemento, opcionesUpdate } from "../test/entorno";

const { Visual } = await import("../src/visual");

const RAIZ = new URL("../../", import.meta.url);
const estados: Array<Record<string, string | number | null>> = JSON.parse(
    readFileSync(new URL(".cache/vista_previa/estados.json", RAIZ), "utf8"),
);

// Equivalente de style/visual.less (en Power BI lo aplica pbiviz; aquí va dentro del SVG).
const CSS = `
  .leyenda .fondo { fill: #ffffff; fill-opacity: 0.85; }
  .leyenda .titulo { fill: #252423; font-weight: 600; }
  .leyenda .etiqueta { fill: #605e5c; }
  .aviso { fill: #a4262c; font-size: 11px; }
  text { font-family: Helvetica, Arial, sans-serif; }
`;

const VISTAS = [
    { archivo: "mapa_ventas.png", medida: "Ventas Cadenas", formato: "\\$#,0", objetos: {} },
    {
        archivo: "mapa_indice.png", medida: "Índice Cadenas vs Nielsen", formato: "#,0",
        objetos: { colores: { metodo: "divergente", centro: 100, umbral1: 10, umbral2: 30 } },
    },
    {
        archivo: "mapa_crecimiento.png", medida: "Crec % Cadenas", formato: "+0.0%;-0.0%;0.0%",
        objetos: { colores: { metodo: "divergente", centro: 0, umbral1: 0.02, umbral2: 0.08, paletaDivergente: "morado-naranja" } },
    },
];

mkdirSync(new URL("docs/img/", RAIZ), { recursive: true });
for (const v of VISTAS) {
    const elemento = nuevoElemento();
    const visual = new Visual({ element: elemento, host: crearHost().host } as never);
    visual.update(opcionesUpdate(crearDataView({
        claves: estados.map((e) => e.CVE_ENT),
        valores: estados.map((e) => e[v.medida] as number | null),
        nombre: v.medida,
        formato: v.formato,
        objetos: v.objetos,
    }), 760, 500));
    const svg = elemento.querySelector("svg") as SVGSVGElement;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const estilo = document.createElementNS("http://www.w3.org/2000/svg", "style");
    estilo.textContent = CSS;
    svg.insertBefore(estilo, svg.firstChild);
    const png = new Resvg(svg.outerHTML, {
        fitTo: { mode: "width", value: 1520 },
        background: "#fcfcfb",
        font: { loadSystemFonts: true, defaultFontFamily: "Helvetica" },
    }).render().asPng();
    writeFileSync(new URL(`docs/img/${v.archivo}`, RAIZ), png);
    console.log(`• docs/img/${v.archivo}`);
}
