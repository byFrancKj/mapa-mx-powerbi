/**
 * Host falso de Power BI y constructor de dataViews, sin dependencias de Node: lo
 * usan las pruebas (con jsdom, en entorno.ts) y la demostración en el navegador.
 */
import type powerbi from "powerbi-visuals-api";

export interface Llamadas {
    render: string[];
    tooltip: Array<[string, { dataItems?: powerbi.extensibility.VisualTooltipDataItem[] }]>;
    menu: number;
    advertencias: Array<[string, string]>;
}

/** Los primeros colores del tema predeterminado de Power BI. */
export const COLORES_TEMA = ["#118dff", "#12239e", "#e66c37", "#6b007b", "#e044a7", "#744ec2", "#d9b300", "#d64550"];

interface IdFalso {
    clave: string;
    equals(otro: IdFalso): boolean;
    getKey(): string;
}

/** Un host que registra lo que el visual le pide; `textos` son los de un resources.resjson. */
export function crearHostCon(textos: Record<string, string>, opciones: { altoContraste?: boolean; locale?: string } = {}) {
    const locale = opciones.locale ?? "es-MX";
    const llamadas: Llamadas = { render: [], tooltip: [], menu: 0, advertencias: [] };
    let seleccionados: IdFalso[] = [];
    const coloresAsignados = new Map<string, string>();
    let alSeleccionar: (() => void) | null = null;
    const host = {
        locale,
        createLocalizationManager: () => ({ getDisplayName: (clave: string) => textos[clave] ?? clave }),
        colorPalette: {
            isHighContrast: Boolean(opciones.altoContraste),
            foreground: { value: "#ffff00" },
            background: { value: "#000000" },
            // Como Power BI: cada clave nueva toma el siguiente color del tema.
            getColor: (clave: string) => {
                if (!coloresAsignados.has(clave)) {
                    coloresAsignados.set(clave, COLORES_TEMA[coloresAsignados.size % COLORES_TEMA.length]);
                }
                return { value: coloresAsignados.get(clave) };
            },
            reset() {
                coloresAsignados.clear();
                return this;
            },
        },
        hostCapabilities: { allowInteractions: true },
        displayWarningIcon: (titulo: string, detalle: string) => llamadas.advertencias.push([titulo, detalle]),
        eventService: {
            renderingStarted: () => llamadas.render.push("inicio"),
            renderingFinished: () => llamadas.render.push("fin"),
            renderingFailed: (_: unknown, error: string) => llamadas.render.push(`error: ${error}`),
        },
        tooltipService: {
            enabled: () => true,
            show: (o: never) => llamadas.tooltip.push(["show", o]),
            move: (o: never) => llamadas.tooltip.push(["move", o]),
            hide: (o: never) => llamadas.tooltip.push(["hide", o]),
        },
        createSelectionIdBuilder: () => {
            let clave = "";
            const constructor = {
                // La identidad de una fila combina los nodos de su camino en la matriz: región|clave.
                withMatrixNode: (nodo: powerbi.DataViewMatrixNode) => {
                    clave = clave ? `${clave}|${String(nodo.value)}` : String(nodo.value);
                    return constructor;
                },
                createSelectionId: (): IdFalso => ({ clave, equals: (o) => o.clave === clave, getKey: () => clave }),
            };
            return constructor;
        },
        createSelectionManager: () => ({
            // Como Power BI: volver a elegir lo único seleccionado lo deselecciona, y con
            // Ctrl se agrega o se quita.
            select: (id: IdFalso | IdFalso[], multiple: boolean) => {
                const ids = Array.isArray(id) ? id : [id];
                const esta = (x: IdFalso) => seleccionados.some((s) => s.equals(x));
                if (multiple) {
                    seleccionados = ids.every(esta) ? seleccionados.filter((s) => !ids.some((x) => x.equals(s))) : [...seleccionados, ...ids.filter((x) => !esta(x))];
                } else {
                    seleccionados = ids.length === seleccionados.length && ids.every(esta) ? [] : ids;
                }
                return Promise.resolve(seleccionados);
            },
            clear: () => {
                seleccionados = [];
                return Promise.resolve({});
            },
            getSelectionIds: () => seleccionados,
            registerOnSelectCallback: (cb: () => void) => {
                alSeleccionar = cb;
            },
            showContextMenu: () => {
                llamadas.menu++;
                return Promise.resolve({});
            },
        }),
    };
    return {
        host: host as unknown as powerbi.extensibility.visual.IVisualHost,
        llamadas,
        /** Simula una selección que llega de fuera (un marcador u otro visual). */
        seleccionarDesdeFuera(claves: string[]) {
            seleccionados = claves.map((clave) => ({ clave, equals: (o: IdFalso) => o.clave === clave, getKey: () => clave }));
            alSeleccionar?.();
        },
    };
}

export interface OpcionesDataView {
    claves: unknown[];
    /** Niveles superiores de una jerarquía en Ubicación (drill-down "expandir todo"). */
    nivelesSuperiores?: Array<{ nombre: string; valores: unknown[] }>;
    grupo?: { nombre: string; valores: unknown[] };
    valores?: Array<number | null>;
    nombre?: string;
    formato?: string;
    /** Parte de Valor que resalta otro visual (null = no resaltado). */
    resaltes?: Array<number | null>;
    /** Segunda medida (campo Valor 2: mapa bivariado). */
    valores2?: Array<number | null>;
    nombre2?: string;
    formato2?: string;
    tooltips?: Array<{ nombre: string; valores: unknown[]; formato?: string }>;
    /** Campos Bases a comparar y Tarjetas. `objetos` es lo que Power BI guarda en la columna. */
    bases?: MedidaFalsa[];
    tarjetas?: MedidaFalsa[];
    /** Campo Columnas de la tabla. */
    tabla?: MedidaFalsa[];
    /** Propiedades del panel de formato, como las guarda Power BI. */
    objetos?: Record<string, Record<string, unknown>>;
    /**
     * Lo que DAX calcula en los nodos de la matriz (por nombre de medida): el total de lo
     * filtrado y el de cada región. Sin esto, la matriz no trae subtotales.
     */
    totales?: {
        general?: Record<string, DatoFalso>;
        grupos?: Record<string, Record<string, DatoFalso>>;
        /** El total con el resaltado de otro visual. */
        resalteGeneral?: Record<string, DatoFalso>;
    };
    /** Línea del tiempo: Valor en cada periodo (las demás medidas se repiten). */
    periodos?: {
        nombre?: string;
        etiquetas: unknown[];
        valores: Array<Array<number | null>>;
        /** Valor en el total de los periodos (subtotal de columnas); sin él, la matriz no lo trae. */
        total?: Array<number | null>;
    };
}

/** Lo que puede devolver una medida de DAX. */
export type DatoFalso = number | string | boolean | Date | null;

export interface MedidaFalsa {
    nombre: string;
    valores: DatoFalso[];
    /** Lo que resalta otro visual (null = no resaltado). */
    resaltes?: DatoFalso[];
    formato?: string;
    /** El tipo de la medida en el modelo (source.type). */
    tipo?: { text?: boolean; numeric?: boolean; dateTime?: boolean; bool?: boolean };
    /** queryName (por omisión, "_Medidas.<nombre>"). */
    consulta?: string;
    objetos?: Record<string, Record<string, unknown>>;
    /**
     * La misma medida también está en otro campo, en ese lugar: Power BI la manda una sola
     * vez, con sus dos roles ({ tabla: 0 } = además es la primera de Columnas de la tabla).
     */
    tambien?: Record<string, number>;
    /** Su lugar en su campo (por omisión, el orden en que se escribe). */
    lugar?: number;
}

/** `lugar` es la posición en el campo: Power BI la anota en `rolesIndex`. */
const columnaMedida = (rol: string, m: MedidaFalsa, lugar?: number) => {
    const lugares = { ...(lugar === undefined ? {} : { [rol]: lugar }), ...m.tambien };
    return {
        source: {
            displayName: m.nombre, format: m.formato, type: m.tipo,
            roles: Object.fromEntries([rol, ...Object.keys(m.tambien ?? {})].map((r) => [r, true])),
            ...(Object.keys(lugares).length > 0 ? { rolesIndex: Object.fromEntries(Object.entries(lugares).map(([r, i]) => [r, [i]])) } : {}),
            queryName: m.consulta ?? `_Medidas.${m.nombre}`, isMeasure: true, objects: m.objetos,
        },
        values: m.valores,
        ...(m.resaltes ? { highlights: m.resaltes } : {}),
    };
};

interface ColumnaFalsa {
    source: Record<string, unknown> & { displayName: string };
    values: unknown[];
    highlights?: unknown[];
}

/**
 * Arma la matriz que manda Power BI: filas Región → Ubicación (con sus niveles
 * superiores), columnas Periodo → medida y, si se piden, los subtotales que calcula DAX.
 */
export function crearDataView(o: OpcionesDataView): powerbi.DataView {
    const valorNombre = o.nombre ?? "Ventas";
    const medidas: ColumnaFalsa[] = [
        ...(o.valores ? [{
            source: { displayName: valorNombre, roles: { valor: true }, format: o.formato, queryName: `_Medidas.${valorNombre}` },
            values: o.valores,
            ...(o.resaltes ? { highlights: o.resaltes } : {}),
        }] : []),
        ...(o.valores2 ? [{ source: { displayName: o.nombre2 ?? "Valor 2", roles: { valor2: true }, format: o.formato2 }, values: o.valores2 }] : []),
        ...(o.bases ?? []).map((m) => columnaMedida("bases", m)),
        ...(o.tarjetas ?? []).map((m) => columnaMedida("tarjetas", m)),
        ...(o.tabla ?? []).map((m, i) => columnaMedida("tabla", m, m.lugar ?? i)),
        ...(o.tooltips ?? []).map((t) => ({ source: { displayName: t.nombre, roles: { tooltips: true }, format: t.formato }, values: t.valores })),
    ];
    const conResalte = medidas.some((m) => m.highlights);
    const fuentes = medidas.map((m) => m.source);

    // Columnas: una hoja por medida en cada periodo (y en el total de los periodos).
    const p = o.periodos;
    const fuentePeriodo = p ? { displayName: p.nombre ?? "Periodo", roles: { periodo: true } } : null;
    const hojas: Array<{ periodo: number | null; medida: number }> = [];
    const nodoMedida = (m: number, nivel: number) => ({ level: nivel, levelSourceIndex: m, levelValues: [{ value: null, levelSourceIndex: m }] });
    let raizColumnas: Record<string, unknown>;
    if (p) {
        const hijos: unknown[] = p.etiquetas.map((etiqueta, i) => ({
            level: 0, value: etiqueta, levelValues: [{ value: etiqueta, levelSourceIndex: 0 }],
            children: medidas.map((_, m) => {
                hojas.push({ periodo: i, medida: m });
                return nodoMedida(m, 1);
            }),
        }));
        if (p.total) {
            hijos.push({ level: 0, isSubtotal: true, children: medidas.map((_, m) => {
                hojas.push({ periodo: -1, medida: m });
                return nodoMedida(m, 1);
            }) });
        }
        raizColumnas = { children: hijos };
    } else {
        raizColumnas = { children: medidas.map((_, m) => {
            hojas.push({ periodo: null, medida: m });
            return nodoMedida(m, 0);
        }) };
    }
    const nivelesColumna = p ? [{ sources: [fuentePeriodo] }, { sources: fuentes }] : [{ sources: fuentes }];

    // Lo que vale la medida m en la fila i en una hoja (Valor cambia por periodo).
    const enHoja = (i: number, h: { periodo: number | null; medida: number }): { value: unknown; highlight?: unknown } => {
        const m = medidas[h.medida];
        const esValor = Boolean(m.source.roles && (m.source.roles as Record<string, boolean>).valor);
        let value = m.values[i] ?? null;
        if (p && esValor && h.periodo !== null) {
            value = h.periodo < 0 ? p.total?.[i] ?? null : p.valores[h.periodo]?.[i] ?? null;
        }
        return conResalte ? { value, highlight: m.highlights ? m.highlights[i] ?? null : value } : { value };
    };
    const valoresFila = (i: number) => Object.fromEntries(hojas.map((h, j) => [j, { ...enHoja(i, h), valueSourceIndex: h.medida }]));
    const valoresTotal = (porMedida: Record<string, DatoFalso> | undefined, resalte?: Record<string, DatoFalso>) =>
        Object.fromEntries(hojas.map((h, j) => {
            const nombre = medidas[h.medida].source.displayName;
            const value = porMedida?.[nombre] ?? null;
            return [j, { value, ...(conResalte ? { highlight: resalte?.[nombre] ?? value } : {}), valueSourceIndex: h.medida }];
        }));

    // Filas: Región (si hay) → niveles superiores → clave.
    const nivelesFila: Array<{ sources: unknown[] }> = [
        ...(o.grupo ? [{ sources: [{ displayName: o.grupo.nombre, roles: { grupo: true } }] }] : []),
        ...(o.nivelesSuperiores ?? []).map((n) => ({ sources: [{ displayName: n.nombre, roles: { ubicacion: true } }] })),
        { sources: [{ displayName: "Clave", roles: { ubicacion: true } }] },
    ];
    type Nodo = { level?: number; value?: unknown; levelValues?: unknown[]; children?: Nodo[]; values?: unknown; isSubtotal?: boolean };
    const raizFilas: Nodo = { children: [] };
    o.claves.forEach((clave, i) => {
        const camino = [
            ...(o.grupo ? [o.grupo.valores[i]] : []),
            ...(o.nivelesSuperiores ?? []).map((n) => n.valores[i]),
            clave,
        ];
        let nodo = raizFilas;
        camino.forEach((valor, nivel) => {
            const hoja = nivel === camino.length - 1;
            let hijo = hoja ? undefined : nodo.children?.find((h) => !h.isSubtotal && h.value === valor);
            if (!hijo) {
                hijo = { level: nivel, value: valor, levelValues: [{ value: valor, levelSourceIndex: 0 }], ...(hoja ? { values: valoresFila(i) } : { children: [] }) };
                (nodo.children ??= []).push(hijo);
            }
            nodo = hijo;
        });
    });
    const t = o.totales;
    if (t?.grupos && o.grupo) {
        for (const g of raizFilas.children ?? []) {
            const porMedida = t.grupos[String(g.value)];
            if (porMedida) {
                g.children?.push({ isSubtotal: true, values: valoresTotal(porMedida) });
            }
        }
    }
    if (t?.general) {
        raizFilas.children?.push({ isSubtotal: true, values: valoresTotal(t.general, t.resalteGeneral) });
    }

    return {
        metadata: {
            columns: [...nivelesFila.flatMap((n) => n.sources), ...(fuentePeriodo ? [fuentePeriodo] : []), ...fuentes],
            objects: o.objetos ?? {},
        },
        matrix: {
            rows: { root: raizFilas, levels: nivelesFila },
            columns: { root: raizColumnas, levels: nivelesColumna },
            valueSources: fuentes,
        },
    } as unknown as powerbi.DataView;
}

export function opcionesUpdate(dataView: powerbi.DataView | null, ancho = 760, alto = 500) {
    return {
        dataViews: dataView ? [dataView] : [],
        viewport: { width: ancho, height: alto },
        type: 2,
    } as unknown as powerbi.extensibility.visual.VisualUpdateOptions;
}

export function nuevoElemento(): HTMLElement {
    const div = document.createElement("div");
    document.body.appendChild(div);
    return div;
}
