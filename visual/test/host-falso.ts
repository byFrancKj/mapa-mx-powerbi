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
                // Como en Power BI, la identidad combina todas las columnas de categoría.
                withCategory: (categoria: powerbi.DataViewCategoryColumn, i: number) => {
                    clave = clave ? `${clave}|${String(categoria.values[i])}` : String(categoria.values[i]);
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
    /** Propiedades del panel de formato, como las guarda Power BI. */
    objetos?: Record<string, Record<string, unknown>>;
}

export interface MedidaFalsa {
    nombre: string;
    valores: Array<number | null>;
    formato?: string;
    /** queryName (por omisión, "_Medidas.<nombre>"). */
    consulta?: string;
    objetos?: Record<string, Record<string, unknown>>;
}

const columnaMedida = (rol: string, m: MedidaFalsa) => ({
    source: {
        displayName: m.nombre, roles: { [rol]: true }, format: m.formato,
        queryName: m.consulta ?? `_Medidas.${m.nombre}`, isMeasure: true, objects: m.objetos,
    },
    values: m.valores,
});

export function crearDataView(o: OpcionesDataView): powerbi.DataView {
    const categorias = [
        ...(o.nivelesSuperiores ?? []).map((n) => ({ source: { displayName: n.nombre, roles: { ubicacion: true } }, values: n.valores })),
        { source: { displayName: "Clave", roles: { ubicacion: true } }, values: o.claves },
        ...(o.grupo ? [{ source: { displayName: o.grupo.nombre, roles: { grupo: true } }, values: o.grupo.valores }] : []),
    ];
    const valores = [
        ...(o.valores ? [{
            source: { displayName: o.nombre ?? "Ventas", roles: { valor: true }, format: o.formato, queryName: `_Medidas.${o.nombre ?? "Ventas"}` },
            values: o.valores,
            ...(o.resaltes ? { highlights: o.resaltes } : {}),
        }] : []),
        ...(o.valores2 ? [{ source: { displayName: o.nombre2 ?? "Valor 2", roles: { valor2: true }, format: o.formato2 }, values: o.valores2 }] : []),
        ...(o.bases ?? []).map((m) => columnaMedida("bases", m)),
        ...(o.tarjetas ?? []).map((m) => columnaMedida("tarjetas", m)),
        ...(o.tooltips ?? []).map((t) => ({ source: { displayName: t.nombre, roles: { tooltips: true }, format: t.formato }, values: t.valores })),
    ];
    return {
        metadata: { columns: [...categorias.map((c) => c.source), ...valores.map((v) => v.source)], objects: o.objetos ?? {} },
        categorical: { categories: categorias, values: valores },
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
