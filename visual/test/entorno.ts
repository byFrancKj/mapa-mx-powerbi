/**
 * Entorno para probar el visual fuera de Power BI: un DOM (jsdom) y el host falso de
 * host-falso.ts con los textos de cada idioma.
 */
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

import { crearHostCon } from "./host-falso";

export { COLORES_TEMA, crearDataView, nuevoElemento, opcionesUpdate } from "./host-falso";
export type { Llamadas, MedidaFalsa, OpcionesDataView } from "./host-falso";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document });

export const ventana = dom.window;

/** Los textos de stringResources/<idioma>/resources.resjson, como los entrega Power BI. */
export function recursos(locale: string): Record<string, string> {
    return JSON.parse(readFileSync(new URL(`../stringResources/${locale}/resources.resjson`, import.meta.url), "utf8"));
}

export function crearHost(opciones: { altoContraste?: boolean; locale?: string } = {}) {
    return crearHostCon(recursos(opciones.locale ?? "es-MX"), opciones);
}
