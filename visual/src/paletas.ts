"use strict";

import {
    schemeBlues, schemeGreens, schemePurples, schemeOranges, schemeReds, schemeGreys,
    schemeRdBu, schemePuOr, schemeBrBG, schemePiYG,
} from "d3-scale-chromatic";

// Paletas de ColorBrewer (Cynthia A. Brewer, Penn State), vía d3-scale-chromatic.
// Cada esquema trae listas de 3 a 9 colores, de claro a oscuro.
type Esquema = ReadonlyArray<ReadonlyArray<string>>;

export const SECUENCIALES: Record<string, Esquema> = {
    azules: schemeBlues,
    verdes: schemeGreens,
    morados: schemePurples,
    naranjas: schemeOranges,
    rojos: schemeReds,
    grises: schemeGreys,
};

// Nombrados de valor bajo a valor alto, en el orden en que d3 entrega los colores
// (el de su nombre en inglés: PuOr va de morado a naranja).
export const DIVERGENTES: Record<string, Esquema> = {
    "rojo-azul": schemeRdBu,
    "morado-naranja": schemePuOr,
    "cafe-verde": schemeBrBG,
    "rosa-verde": schemePiYG,
};

/**
 * k colores de claro a oscuro (1 a 9). Se descartan los tonos casi blancos del
 * esquema (uno, o dos a partir de 7 clases) para que ninguna clase se confunda
 * con "Sin dato".
 */
export function coloresSecuenciales(nombre: string, k: number, invertir = false): string[] {
    const esquema = SECUENCIALES[nombre] ?? SECUENCIALES.azules;
    const lista = esquema[Math.min(9, Math.max(3, k + (k >= 7 ? 2 : 1)))];
    const colores = lista.slice(lista.length - k);
    return invertir ? colores.reverse() : colores;
}

/** 5 colores: muy por debajo, por debajo, similar, por encima, muy por encima. */
export function coloresDivergentes(nombre: string, invertir = false): string[] {
    const esquema = DIVERGENTES[nombre] ?? DIVERGENTES["rojo-azul"];
    const colores = [...esquema[5]];
    return invertir ? colores.reverse() : colores;
}

// Paletas bivariadas 3×3 de Joshua Stevens. Orden: filas de Valor 2 (Y) de bajo a
// alto; en cada fila, Valor (X) de bajo a alto. El nombre dice el tono de X y de Y.
export const BIVARIADAS: Record<string, readonly string[]> = {
    "turquesa-rosa": ["#e8e8e8", "#ace4e4", "#5ac8c8", "#dfb0d6", "#a5add3", "#5698b9", "#be64ac", "#8c62aa", "#3b4994"],
    "verde-azul": ["#e8e8e8", "#b8d6be", "#73ae80", "#b5c0da", "#90b2b3", "#5a9178", "#6c83b5", "#567994", "#2a5a5b"],
    "rojo-azul": ["#e8e8e8", "#e4acac", "#c85a5a", "#b0d5df", "#ad9ea5", "#985356", "#64acbe", "#627f8c", "#574249"],
};

/** Color de la celda (x, y) con x, y ∈ {0, 1, 2}. */
export function colorBivariado(nombre: string, x: number, y: number): string {
    return (BIVARIADAS[nombre] ?? BIVARIADAS["turquesa-rosa"])[y * 3 + x];
}
