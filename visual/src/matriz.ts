"use strict";

import powerbi from "powerbi-visuals-api";

import DataViewMatrix = powerbi.DataViewMatrix;
import DataViewMatrixNode = powerbi.DataViewMatrixNode;
import DataViewMetadataColumn = powerbi.DataViewMetadataColumn;
import PrimitiveValue = powerbi.PrimitiveValue;

/**
 * La matriz de Power BI, ya plana: una fila por área, los totales que calculó DAX
 * (del país, de cada región y de cada nivel superior de Ubicación) y un cuadro por
 * periodo de la línea del tiempo.
 *
 * Power BI evalúa las medidas en cada nodo de la matriz con su propio filtro, así que
 * el total de una región es la medida evaluada en la región, no la suma de sus estados.
 */
export interface Celda {
    valor: PrimitiveValue | null;
    /** El valor con el resaltado de otro visual; undefined si no hay resaltado. */
    resalte?: PrimitiveValue | null;
}

export interface FilaMatriz {
    /** El valor de Ubicación en el nivel más fino (la clave INEGI, sin normalizar). */
    clave: PrimitiveValue | null;
    grupo: PrimitiveValue | null;
    /** El camino de nodos desde la raíz (sin ella): la identidad de la fila. */
    nodos: DataViewMatrixNode[];
}

export interface TotalMatriz {
    /** "general" es el de toda la matriz (lo que deja el filtro de la página). */
    tipo: "general" | "grupo" | "ubicacion";
    /** El valor del nodo (nombre de la región, clave del estado…); null en el general. */
    valor: PrimitiveValue | null;
    /** Las filas que abarca (índices en `filas`). */
    filas: number[];
}

export interface Cuadro {
    /** La etiqueta del periodo; null en el total de los periodos o si no hay periodo. */
    periodo: string | null;
    /** celdas[m][i]: la medida m en la fila i; las filas de los totales van al final. */
    celdas: Celda[][];
}

export interface LecturaMatriz {
    medidas: DataViewMetadataColumn[];
    fuenteUbicacion: DataViewMetadataColumn | null;
    fuenteGrupo: DataViewMetadataColumn | null;
    fuentePeriodo: DataViewMetadataColumn | null;
    niveles: powerbi.DataViewHierarchyLevel[];
    filas: FilaMatriz[];
    totales: TotalMatriz[];
    /** Un cuadro por periodo, en el orden de Power BI (sin periodo, uno solo). */
    cuadros: Cuadro[];
    /** El total de todos los periodos (subtotal de columnas), si Power BI lo mandó. */
    totalPeriodos: Cuadro | null;
    hayResaltado: boolean;
}

type Rol = "ubicacion" | "grupo" | "periodo" | null;

const rolDe = (fuente: DataViewMetadataColumn | undefined): Rol =>
    fuente?.roles?.ubicacion ? "ubicacion" : fuente?.roles?.grupo ? "grupo" : fuente?.roles?.periodo ? "periodo" : null;

const valorDeNodo = (n: DataViewMatrixNode): PrimitiveValue | null => n.levelValues?.[0]?.value ?? n.value ?? null;

/** Una hoja de las columnas: a qué periodo (o al total) y a qué medida corresponde. */
interface HojaColumna {
    /** Índice del cuadro; -1 es el total de los periodos; null, un subtotal intermedio (se ignora). */
    cuadro: number | null;
    medida: number;
}

export function leerMatriz(
    matriz: DataViewMatrix | undefined,
    formatoPeriodo: (v: PrimitiveValue, fuente: DataViewMetadataColumn) => string,
): LecturaMatriz | null {
    const niveles = matriz?.rows?.levels ?? [];
    const fuentes = niveles.map((l) => l.sources[0]);
    const iUbicacion = fuentes.map(rolDe).lastIndexOf("ubicacion");
    if (!matriz || iUbicacion < 0) {
        return null;
    }
    const medidas = matriz.valueSources ?? [];
    const nivelesColumna = matriz.columns?.levels ?? [];
    const fuentePeriodo = nivelesColumna.flatMap((l) => l.sources).find((s) => rolDe(s) === "periodo") ?? null;

    // Columnas: cada hoja es una medida en un periodo (o en el total de los periodos).
    const periodos: string[] = [];
    const hojas: HojaColumna[] = [];
    let hayTotalPeriodos = false;
    const recorrerColumnas = (nodo: DataViewMatrixNode, etiqueta: string[], subtotal: "total" | "intermedio" | null): void => {
        const hijos = nodo.children ?? [];
        if (hijos.length === 0) {
            const medida = nodo.levelValues?.[0]?.levelSourceIndex ?? nodo.levelSourceIndex ?? 0;
            if (subtotal === "intermedio") {
                hojas.push({ cuadro: null, medida });
            } else if (subtotal === "total") {
                hayTotalPeriodos = true;
                hojas.push({ cuadro: -1, medida });
            } else {
                const nombre = etiqueta.join(" ");
                let i = periodos.indexOf(nombre);
                if (i < 0) {
                    i = periodos.push(nombre) - 1;
                }
                hojas.push({ cuadro: i, medida });
            }
            return;
        }
        for (const hijo of hijos) {
            const fuente = nivelesColumna[hijo.level ?? 0]?.sources[hijo.levelValues?.[0]?.levelSourceIndex ?? 0];
            const esPeriodo = rolDe(fuente) === "periodo";
            const valor = valorDeNodo(hijo);
            const marca = hijo.isSubtotal ? (nodo === matriz.columns.root ? "total" : "intermedio") : null;
            recorrerColumnas(hijo, esPeriodo && fuente && !hijo.isSubtotal && valor !== null ? [...etiqueta, formatoPeriodo(valor, fuente)] : etiqueta, subtotal ?? marca);
        }
    };
    if (matriz.columns?.root) {
        recorrerColumnas(matriz.columns.root, [], null);
    }
    if (hojas.length === 0) {
        medidas.forEach((_, m) => hojas.push({ cuadro: 0, medida: m }));
    }
    if (periodos.length === 0) {
        periodos.push("");
    }

    const lectura: LecturaMatriz = {
        medidas,
        fuenteUbicacion: fuentes[iUbicacion] ?? null,
        fuenteGrupo: fuentes.find((f) => rolDe(f) === "grupo") ?? null,
        fuentePeriodo,
        niveles,
        filas: [],
        totales: [],
        cuadros: periodos.map((p) => ({ periodo: fuentePeriodo ? p : null, celdas: medidas.map(() => []) })),
        totalPeriodos: hayTotalPeriodos ? { periodo: null, celdas: medidas.map(() => []) } : null,
        hayResaltado: false,
    };

    // Los valores de un nodo, repartidos en sus cuadros; `posicion` es su fila (o la de un total).
    const anotar = (nodo: DataViewMatrixNode | undefined, posicion: number): void => {
        const cuadros = [...lectura.cuadros, ...(lectura.totalPeriodos ? [lectura.totalPeriodos] : [])];
        for (const c of cuadros) {
            for (const columna of c.celdas) {
                columna[posicion] = { valor: null };
            }
        }
        for (const [clave, v] of Object.entries(nodo?.values ?? {})) {
            const hoja = hojas[Number(clave)];
            const cuadro = hoja?.cuadro === -1 ? lectura.totalPeriodos : hoja?.cuadro !== null && hoja ? lectura.cuadros[hoja.cuadro] : null;
            const medida = (v as powerbi.DataViewMatrixNodeValue).valueSourceIndex ?? hoja?.medida ?? 0;
            if (!cuadro || !cuadro.celdas[medida]) {
                continue;
            }
            const celda: Celda = { valor: v.value ?? null };
            if ("highlight" in v) {
                celda.resalte = (v as powerbi.DataViewMatrixNodeValue).highlight ?? null;
                lectura.hayResaltado = true;
            }
            cuadro.celdas[medida][posicion] = celda;
        }
    };

    // Filas: las hojas son áreas; un nodo con hijos puede traer su total (un hijo
    // marcado como subtotal, o sus propios valores).
    const pendientes: Array<{ total: TotalMatriz; nodo: DataViewMatrixNode }> = [];
    const recorrerFilas = (nodo: DataViewMatrixNode, camino: DataViewMatrixNode[]): number[] => {
        const hijos = (nodo.children ?? []).filter((h) => !h.isSubtotal);
        if (hijos.length === 0 && nodo !== matriz.rows.root) {
            let clave: PrimitiveValue | null = null;
            let grupo: PrimitiveValue | null = null;
            for (const n of camino) {
                const rol = rolDe(niveles[n.level ?? 0]?.sources[n.levelValues?.[0]?.levelSourceIndex ?? 0]);
                if (rol === "ubicacion") {
                    clave = valorDeNodo(n);
                } else if (rol === "grupo") {
                    grupo = valorDeNodo(n);
                }
            }
            const i = lectura.filas.push({ clave, grupo, nodos: camino }) - 1;
            anotar(nodo, i);
            return [i];
        }
        const debajo = hijos.flatMap((h) => recorrerFilas(h, [...camino, h]));
        const subtotal = (nodo.children ?? []).find((h) => h.isSubtotal) ?? (nodo.values && Object.keys(nodo.values).length > 0 ? nodo : undefined);
        if (subtotal && debajo.length > 0) {
            const rol = nodo === matriz.rows.root ? null : rolDe(niveles[nodo.level ?? 0]?.sources[0]);
            pendientes.push({
                total: { tipo: rol === null ? "general" : rol === "grupo" ? "grupo" : "ubicacion", valor: rol === null ? null : valorDeNodo(nodo), filas: debajo },
                nodo: subtotal,
            });
        }
        return debajo;
    };
    recorrerFilas(matriz.rows.root, []);
    for (const p of pendientes) {
        lectura.totales.push(p.total);
        anotar(p.nodo, lectura.filas.length + lectura.totales.length - 1);
    }
    return lectura;
}
