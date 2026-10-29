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

// Semáforo: tonos de RdYlGn (ColorBrewer) de rojo (bajo) a verde (alto), k = 1 a 9.
// Sin el amarillo casi blanco del centro (#ffffbf), para que ninguna clase se
// confunda con "Sin dato". Rojo contra verde no es apto para daltonismo.
export const SEMAFORO: Esquema = [
    [],
    ["#fee08b"],
    ["#d73027", "#1a9850"],
    ["#d73027", "#fee08b", "#1a9850"],
    ["#d73027", "#fdae61", "#a6d96a", "#1a9850"],
    ["#d73027", "#fdae61", "#fee08b", "#a6d96a", "#1a9850"],
    ["#d73027", "#f46d43", "#fdae61", "#a6d96a", "#66bd63", "#1a9850"],
    ["#d73027", "#f46d43", "#fdae61", "#fee08b", "#a6d96a", "#66bd63", "#1a9850"],
    ["#a50026", "#d73027", "#f46d43", "#fdae61", "#a6d96a", "#66bd63", "#1a9850", "#006837"],
    ["#a50026", "#d73027", "#f46d43", "#fdae61", "#fee08b", "#a6d96a", "#66bd63", "#1a9850", "#006837"],
];

// Nombrados de valor bajo a valor alto, en el orden en que d3 entrega los colores
// (el de su nombre en inglés: PuOr va de morado a naranja).
export const DIVERGENTES: Record<string, Esquema> = {
    "rojo-azul": schemeRdBu,
    "morado-naranja": schemePuOr,
    "cafe-verde": schemeBrBG,
    "rosa-verde": schemePiYG,
    semaforo: SEMAFORO,
};

/**
 * k colores de claro a oscuro (1 a 9). Se descartan los tonos casi blancos del
 * esquema (uno, o dos a partir de 7 clases) para que ninguna clase se confunda
 * con "Sin dato". El semáforo va de rojo a verde pasando por amarillo.
 */
export function coloresSecuenciales(nombre: string, k: number, invertir = false): string[] {
    let colores: string[];
    if (nombre === "semaforo") {
        colores = [...SEMAFORO[Math.min(9, Math.max(1, k))]];
    } else {
        const esquema = SECUENCIALES[nombre] ?? SECUENCIALES.azules;
        const lista = esquema[Math.min(9, Math.max(3, k + (k >= 7 ? 2 : 1)))];
        colores = lista.slice(lista.length - k);
    }
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

/**
 * Mezcla dos colores #rrggbb: t = 0 da `a` y t = 1 da `b`. Sirve para sacar los tonos
 * del fondo (líneas de agua, costa, fronteras) del color del mar o de la tierra que
 * elija quien hace el reporte. Un color que no sea #rrggbb se devuelve tal cual.
 */
export function mezclar(a: string, b: string, t: number): string {
    const rgb = (c: string): number[] | null => {
        const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
        return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null;
    };
    const x = rgb(a);
    const y = rgb(b);
    if (!x || !y) {
        return a;
    }
    return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
