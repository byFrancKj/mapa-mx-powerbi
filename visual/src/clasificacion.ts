"use strict";

/**
 * Cómo se reparten los valores en clases de color:
 *   cuantiles   el mismo número de áreas en cada clase
 *   intervalos  clases del mismo ancho entre el mínimo y el máximo
 *   divergente  5 clases alrededor de un centro: muy por debajo, por debajo,
 *               similar, por encima, muy por encima
 */
export type Metodo = "cuantiles" | "intervalos" | "divergente";

export interface OpcionesClasificacion {
    metodo: Metodo;
    /** Cuantiles e intervalos: número de clases (se acota a 1–9). */
    clases: number;
    /** Divergente: valor neutro (100 en índices, 0 en crecimientos o brechas). */
    centro: number;
    /** Divergente: distancia al centro que separa "similar" de "por encima/debajo" (0 = automático). */
    umbral1: number;
    /** Divergente: distancia al centro que separa "por encima" de "muy por encima" (0 = automático). */
    umbral2: number;
}

export interface Clase {
    indice: number;
    /** Valores reales de las áreas en la clase (NaN si está vacía). */
    min: number;
    max: number;
    n: number;
    /** Límites teóricos de la clase en la escala divergente. */
    desde?: number;
    hasta?: number;
}

export interface Clasificacion {
    metodo: Metodo;
    numClases: number;
    clases: Clase[];
    claseDe(valor: number): number;
    /** Divergente: umbrales que se usaron (los indicados o los automáticos). */
    umbral1?: number;
    umbral2?: number;
}

const acotar = (x: number, min: number, max: number): number => Math.max(min, Math.min(max, x));

/** Cuantil con interpolación lineal (el mismo método que Excel PERCENTILE.INC). */
function cuantil(ordenados: number[], p: number): number {
    const h = (ordenados.length - 1) * p;
    const abajo = Math.floor(h);
    const arriba = Math.min(abajo + 1, ordenados.length - 1);
    return ordenados[abajo] + (h - abajo) * (ordenados[arriba] - ordenados[abajo]);
}

/** Asigna clase contando cuántos cortes quedan por debajo: valores iguales, misma clase. */
function porCortes(cortes: number[]): (v: number) => number {
    return (v: number) => {
        let clase = 0;
        while (clase < cortes.length && v > cortes[clase]) {
            clase++;
        }
        return clase;
    };
}

export function clasificar(valores: number[], opciones: OpcionesClasificacion): Clasificacion {
    const datos = valores.filter((v) => Number.isFinite(v));
    if (datos.length === 0) {
        return { metodo: opciones.metodo, numClases: 0, clases: [], claseDe: () => -1 };
    }
    const ordenados = [...datos].sort((a, b) => a - b);
    const min = ordenados[0];
    const max = ordenados[ordenados.length - 1];

    let numClases: number;
    let claseDe: (v: number) => number;
    let limites: Array<[number, number]> | undefined;
    let umbral1: number | undefined;
    let umbral2: number | undefined;

    if (opciones.metodo === "divergente") {
        const c = opciones.centro;
        umbral1 = opciones.umbral1;
        umbral2 = opciones.umbral2;
        if (!(umbral1 > 0 && umbral2 > umbral1)) {
            // Automático: 5 intervalos del mismo ancho entre centro − m y centro + m
            const m = Math.max(Math.abs(min - c), Math.abs(max - c));
            umbral1 = m * 0.2;
            umbral2 = m * 0.6;
        }
        const u1 = umbral1;
        const u2 = umbral2;
        numClases = 5;
        claseDe = (v) => (v < c - u2 ? 0 : v < c - u1 ? 1 : v <= c + u1 ? 2 : v <= c + u2 ? 3 : 4);
        limites = [[-Infinity, c - u2], [c - u2, c - u1], [c - u1, c + u1], [c + u1, c + u2], [c + u2, Infinity]];
    } else if (opciones.metodo === "intervalos") {
        numClases = min === max ? 1 : acotar(Math.round(opciones.clases), 1, 9);
        const ancho = (max - min) / numClases;
        claseDe = porCortes(Array.from({ length: numClases - 1 }, (_, i) => min + ancho * (i + 1)));
    } else {
        // Nunca más clases que valores distintos: evita clases vacías por empates.
        numClases = acotar(Math.min(Math.round(opciones.clases), new Set(ordenados).size), 1, 9);
        claseDe = porCortes(Array.from({ length: numClases - 1 }, (_, i) => cuantil(ordenados, (i + 1) / numClases)));
    }

    const clases: Clase[] = Array.from({ length: numClases }, (_, indice) => ({
        indice,
        min: NaN,
        max: NaN,
        n: 0,
        ...(limites ? { desde: limites[indice][0], hasta: limites[indice][1] } : {}),
    }));
    for (const v of datos) {
        const clase = clases[claseDe(v)];
        clase.n++;
        clase.min = Number.isNaN(clase.min) ? v : Math.min(clase.min, v);
        clase.max = Number.isNaN(clase.max) ? v : Math.max(clase.max, v);
    }
    return { metodo: opciones.metodo, numClases, clases, claseDe, umbral1, umbral2 };
}
