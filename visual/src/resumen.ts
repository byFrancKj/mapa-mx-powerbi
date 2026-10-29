"use strict";

/**
 * Cómo se combinan los valores de varias áreas seleccionadas en el panel de detalle.
 * El visual no puede saber si una medida se suma (ventas, unidades, % de mix sí; un
 * índice, un precio o un crecimiento no), así que se elige por medida en el panel de
 * formato. "rango" no combina: muestra del mínimo al máximo.
 */
export type Agregacion = "suma" | "promedio" | "minimo" | "maximo" | "rango";

export const AGREGACIONES: readonly Agregacion[] = ["suma", "promedio", "minimo", "maximo", "rango"];

export interface Resumen {
    /** El valor combinado; null sin valores, o con "rango" y más de un área. */
    valor: number | null;
    min: number | null;
    max: number | null;
    /** Cuántas áreas tienen valor. */
    n: number;
}

export function resumir(valores: ReadonlyArray<number | null>, agregacion: Agregacion): Resumen {
    const v = valores.filter((x): x is number => x !== null && Number.isFinite(x));
    if (v.length === 0) {
        return { valor: null, min: null, max: null, n: 0 };
    }
    let min = v[0];
    let max = v[0];
    let suma = 0;
    for (const x of v) {
        min = Math.min(min, x);
        max = Math.max(max, x);
        suma += x;
    }
    const valor = v.length === 1 ? v[0]
        : agregacion === "suma" ? suma
        : agregacion === "promedio" ? suma / v.length
        : agregacion === "minimo" ? min
        : agregacion === "maximo" ? max
        : null;
    return { valor, min, max, n: v.length };
}

export interface Comparacion {
    /** a − b */
    diferencia: number;
    /** (a − b) / |b|; null si b es 0. */
    relativa: number | null;
    /** a / b × 100; null si b es 0. */
    indice: number | null;
}

/** Compara la base a contra la base b (la primera base contra cada una de las demás). */
export function comparar(a: number | null, b: number | null): Comparacion | null {
    if (a === null || b === null) {
        return null;
    }
    return {
        diferencia: a - b,
        relativa: b === 0 ? null : (a - b) / Math.abs(b),
        indice: b === 0 ? null : (a / b) * 100,
    };
}
