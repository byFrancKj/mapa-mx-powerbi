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
