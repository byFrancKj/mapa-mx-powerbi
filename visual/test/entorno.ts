/**
 * Entorno para probar el visual fuera de Power BI: un DOM (jsdom), un host falso
 * que registra lo que el visual le pide, y un constructor de dataViews como los
 * que manda Power BI.
 */
import { JSDOM } from "jsdom";
import type powerbi from "powerbi-visuals-api";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
Object.assign(globalThis, { window: dom.window, document: dom.window.document });

export const ventana = dom.window;

export interface Llamadas {
    render: string[];
    tooltip: Array<[string, { dataItems?: powerbi.extensibility.VisualTooltipDataItem[] }]>;
    menu: number;
}

interface IdFalso {
    clave: string;
    equals(otro: IdFalso): boolean;
    getKey(): string;
}

export function crearHost(opciones: { altoContraste?: boolean } = {}) {
    const llamadas: Llamadas = { render: [], tooltip: [], menu: 0 };
    let seleccionados: IdFalso[] = [];
    let alSeleccionar: (() => void) | null = null;
    const host = {
        locale: "es-MX",
        colorPalette: {
            isHighContrast: Boolean(opciones.altoContraste),
            foreground: { value: "#ffff00" },
            background: { value: "#000000" },
        },
        hostCapabilities: { allowInteractions: true },
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
                withCategory: (categoria: powerbi.DataViewCategoryColumn, i: number) => {
                    clave = String(categoria.values[i]);
                    return constructor;
                },
                createSelectionId: (): IdFalso => ({ clave, equals: (o) => o.clave === clave, getKey: () => clave }),
            };
            return constructor;
        },
        createSelectionManager: () => ({
            select: (id: IdFalso, multiple: boolean) => {
                seleccionados = multiple ? [...seleccionados, id] : [id];
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
    valores?: Array<number | null>;
    nombre?: string;
    formato?: string;
    tooltips?: Array<{ nombre: string; valores: unknown[]; formato?: string }>;
    /** Propiedades del panel de formato, como las guarda Power BI. */
    objetos?: Record<string, Record<string, unknown>>;
}

export function crearDataView(o: OpcionesDataView): powerbi.DataView {
    const categoria = {
        source: { displayName: "CVE_ENT", roles: { ubicacion: true }, queryName: "Dim_Geo.CVE_ENT" },
        values: o.claves,
    };
    const valores = [
        ...(o.valores ? [{ source: { displayName: o.nombre ?? "Ventas", roles: { valor: true }, format: o.formato }, values: o.valores }] : []),
        ...(o.tooltips ?? []).map((t) => ({ source: { displayName: t.nombre, roles: { tooltips: true }, format: t.formato }, values: t.valores })),
    ];
    return {
        metadata: { columns: [categoria.source, ...valores.map((v) => v.source)], objects: o.objetos ?? {} },
        categorical: { categories: [categoria], values: valores },
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
