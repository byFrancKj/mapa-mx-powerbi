"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { select, Selection } from "d3-selection";
import { geoConicConformal, geoMercator, geoPath } from "d3-geo";
import "./../style/visual.less";

import { Ajustes } from "./ajustes";
import { clasificar, Clasificacion, Metodo } from "./clasificacion";
import { normalizarClave, nivelDeClave } from "./claves";
import { formatoCompacto } from "./formato";
import { estados, Area } from "./geometria";
import { coloresDivergentes, coloresSecuenciales } from "./paletas";

import DataView = powerbi.DataView;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import PrimitiveValue = powerbi.PrimitiveValue;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

const FORMATO_GENERAL = "#,0.##";
const MARGEN = 8;
const OPACIDAD_NO_SELECCIONADO = 0.35;

/** Un estado con datos: lo que Power BI mandó para su clave. */
interface Fila {
    clave: string;
    valor: number | null;
    texto: string;
    extras: VisualTooltipDataItem[];
    id: ISelectionId;
}

interface Datos {
    filas: Map<string, Fila>;
    nombreValor: string | null;
    formatoValor: string | undefined;
    /** Valores de Ubicación que no son una clave de estado (se reportan en el mapa). */
    desconocidas: string[];
    /** Claves de 5 dígitos: el nivel municipal llega en la siguiente versión. */
    municipales: number;
    repetidas: string[];
}

interface EntradaLeyenda {
    color: string;
    texto: string;
}

type Sel<E extends Element> = Selection<E, unknown, null, undefined>;

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly raiz: HTMLElement;
    private readonly seleccion: ISelectionManager;
    private readonly servicioFormato = new FormattingSettingsService();
    private readonly svg: Sel<SVGSVGElement>;
    private readonly capaAreas: Sel<SVGGElement>;
    private readonly capaLeyenda: Sel<SVGGElement>;
    private readonly aviso: Sel<SVGTextElement>;
    private readonly mensaje: Sel<HTMLDivElement>;
    private ajustes = new Ajustes();
    private datos: Datos | null = null;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.raiz = options.element;
        this.seleccion = this.host.createSelectionManager();
        this.seleccion.registerOnSelectCallback(() => this.aplicarSeleccion());

        const raiz = select(this.raiz);
        this.svg = raiz.append("svg").classed("mapa-mx", true);
        this.capaAreas = this.svg.append("g").classed("areas", true);
        this.capaLeyenda = this.svg.append("g").classed("leyenda", true);
        this.aviso = this.svg.append("text").classed("aviso", true);
        this.mensaje = raiz.append("div").classed("mensaje", true);

        // Clic en el fondo: quitar la selección. Clic derecho: menú contextual de Power BI.
        this.svg.on("click", () => {
            this.seleccion.clear().then(() => this.aplicarSeleccion());
        });
        this.svg.on("contextmenu", (evento: MouseEvent) => {
            this.seleccion.showContextMenu({} as ISelectionId, { x: evento.clientX, y: evento.clientY });
            evento.preventDefault();
        });
    }

    public update(options: VisualUpdateOptions): void {
        const eventos = this.host.eventService;
        eventos.renderingStarted(options);
        try {
            const dataView = options.dataViews?.[0];
            this.ajustes = this.servicioFormato.populateFormattingSettingsModel(Ajustes, dataView);
            this.datos = this.leerDatos(dataView);
            this.dibujar(options.viewport.width, options.viewport.height);
            eventos.renderingFinished(options);
        } catch (error) {
            eventos.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.servicioFormato.buildFormattingModel(this.ajustes);
    }

    // ------------------------------------------------------------------ datos

    /** Lee los campos por rol (Ubicación, Valor, Tooltips), nunca por nombre. */
    private leerDatos(dataView: DataView | undefined): Datos | null {
        const ubicacion = dataView?.categorical?.categories?.find((c) => c.source.roles?.ubicacion);
        if (!ubicacion) {
            return null;
        }
        const columnas = dataView?.categorical?.values ?? [];
        const colValor = columnas.find((c) => c.source.roles?.valor);
        const colTooltips = columnas.filter((c) => c.source.roles?.tooltips);
        const formatoValor = colValor?.source.format;
        const exacto = this.formateador(formatoValor);
        const formatosExtra = colTooltips.map((c) => this.formateador(c.source.format));
        const validas = new Set(estados().map((e) => e.clave));

        const datos: Datos = {
            filas: new Map(),
            nombreValor: colValor?.source.displayName ?? null,
            formatoValor,
            desconocidas: [],
            municipales: 0,
            repetidas: [],
        };
        ubicacion.values.forEach((bruto, i) => {
            const clave = normalizarClave(bruto);
            if (clave && nivelDeClave(clave) === "municipio") {
                datos.municipales++;
                return;
            }
            if (!clave || !validas.has(clave)) {
                datos.desconocidas.push(bruto === null || bruto === undefined || bruto === "" ? "(en blanco)" : String(bruto));
                return;
            }
            if (datos.filas.has(clave)) {
                datos.repetidas.push(String(bruto));
                return;
            }
            const v = colValor?.values[i];
            const valor = typeof v === "number" && Number.isFinite(v) ? v : null;
            datos.filas.set(clave, {
                clave,
                valor,
                texto: valor === null ? "Sin dato" : exacto(valor),
                extras: colTooltips.map((c, j) => ({ displayName: c.source.displayName, value: this.texto(c.values[i], formatosExtra[j]) })),
                id: this.host.createSelectionIdBuilder().withCategory(ubicacion, i).createSelectionId(),
            });
        });
        return datos;
    }

    /** Formatea con la cadena de formato de la propia medida, como lo haría Power BI. */
    private formateador(formato: string | undefined): (v: number) => string {
        const f = valueFormatter.create({ format: formato ?? FORMATO_GENERAL, cultureSelector: this.host.locale });
        return (v: number) => f.format(v);
    }

    private texto(valor: PrimitiveValue, formatear: (v: number) => string): string {
        if (valor === null || valor === undefined) {
            return "";
        }
        return typeof valor === "number" ? formatear(valor) : String(valor);
    }

    // ----------------------------------------------------------------- dibujo

    private dibujar(ancho: number, alto: number): void {
        this.svg.attr("width", ancho).attr("height", alto);
        const datos = this.datos;
        const areas = estados();
        const ajustes = this.ajustes;
        const paleta = this.host.colorPalette;
        const altoContraste = paleta.isHighContrast;

        const valores = datos ? [...datos.filas.values()].map((f) => f.valor).filter((v): v is number => v !== null) : [];
        const metodo = (ajustes.colores.metodo.value?.value ?? "cuantiles") as Metodo;
        const clasif = clasificar(valores, {
            metodo,
            clases: Math.min(7, Math.max(2, Math.round(ajustes.colores.clases.value))),
            centro: ajustes.colores.centro.value,
            umbral1: ajustes.colores.umbral1.value,
            umbral2: ajustes.colores.umbral2.value,
        });
        const colores = metodo === "divergente"
            ? coloresDivergentes(String(ajustes.colores.paletaDivergente.value?.value), ajustes.colores.invertir.value)
            : coloresSecuenciales(String(ajustes.colores.paleta.value?.value), clasif.numClases, ajustes.colores.invertir.value);
        const sinDato = altoContraste ? paleta.background.value : ajustes.colores.sinDato.value.value;
        const borde = altoContraste ? paleta.foreground.value : ajustes.mapa.borde.value.value;

        const proyeccion = ajustes.mapa.proyeccion.value?.value === "mercator"
            ? geoMercator()
            : geoConicConformal().parallels([17.5, 29.5]).rotate([102, 0]); // la misma que usa INEGI
        proyeccion.fitExtent(
            [[MARGEN, MARGEN], [Math.max(MARGEN + 1, ancho - MARGEN), Math.max(MARGEN + 1, alto - MARGEN)]],
            { type: "FeatureCollection", features: areas.map((e) => e.forma) },
        );
        const camino = geoPath(proyeccion);
        const colorDe = (e: Area): string => {
            const fila = datos?.filas.get(e.clave);
            return fila && fila.valor !== null ? colores[clasif.claseDe(fila.valor)] : sinDato;
        };
        const interactivo = this.host.hostCapabilities?.allowInteractions !== false;

        this.capaAreas.selectAll<SVGPathElement, Area>("path.area")
            .data(areas, (e) => e.clave)
            .join("path")
            .classed("area", true)
            .classed("con-dato", (e) => datos?.filas.has(e.clave) ?? false)
            .attr("d", (e) => camino(e.forma) ?? "")
            .attr("fill", colorDe)
            .attr("stroke", borde)
            .attr("stroke-width", Math.max(0, ajustes.mapa.grosor.value))
            .attr("tabindex", (e) => (interactivo && datos?.filas.has(e.clave) ? 0 : -1))
            .attr("aria-label", (e) => `${e.nombre}: ${datos?.filas.get(e.clave)?.texto ?? "Sin dato"}`)
            .on("click", (evento: MouseEvent, e) => {
                evento.stopPropagation();
                if (interactivo) {
                    this.seleccionar(e, evento.ctrlKey || evento.metaKey || evento.shiftKey);
                }
            })
            .on("keydown", (evento: KeyboardEvent, e) => {
                if (evento.key === "Enter" || evento.key === " ") {
                    this.seleccionar(e, evento.ctrlKey || evento.metaKey);
                    evento.preventDefault();
                }
            })
            .on("contextmenu", (evento: MouseEvent, e) => {
                const fila = datos?.filas.get(e.clave);
                this.seleccion.showContextMenu(fila ? fila.id : ({} as ISelectionId), { x: evento.clientX, y: evento.clientY });
                evento.preventDefault();
                evento.stopPropagation();
            })
            .on("pointerenter", (evento: PointerEvent, e) => this.mostrarTooltip(evento, e, false))
            .on("pointermove", (evento: PointerEvent, e) => this.mostrarTooltip(evento, e, true))
            .on("pointerleave", (evento: PointerEvent) => this.ocultarTooltip(evento));

        this.aplicarSeleccion();
        this.dibujarLeyenda(clasif, colores, sinDato, borde, ancho, alto, altoContraste ? paleta.foreground.value : null);
        this.dibujarAviso(ancho, altoContraste ? paleta.foreground.value : null);
        this.dibujarMensaje();
    }

    private dibujarLeyenda(
        clasif: Clasificacion, colores: string[], sinDato: string, borde: string,
        ancho: number, alto: number, colorTexto: string | null,
    ): void {
        const ajustes = this.ajustes.leyenda;
        const datos = this.datos;
        this.capaLeyenda.selectAll("*").remove();
        if (!ajustes.mostrar.value || !datos || clasif.numClases === 0) {
            return;
        }

        const exacto = this.formateador(datos.formatoValor);
        const compacto = (v: number): string => formatoCompacto(v, datos.formatoValor, this.host.locale, exacto);
        const entradas: EntradaLeyenda[] = [];
        if (clasif.metodo === "divergente") {
            const ultima = clasif.numClases - 1;
            for (const c of clasif.clases) {
                const texto = c.indice === 0 ? `< ${compacto(c.hasta ?? 0)}`
                    : c.indice === ultima ? `> ${compacto(c.desde ?? 0)}`
                    : `${compacto(c.desde ?? 0)} a ${compacto(c.hasta ?? 0)}`;
                entradas.push({ color: colores[c.indice], texto });
            }
        } else {
            for (const c of clasif.clases.filter((k) => k.n > 0)) {
                entradas.push({ color: colores[c.indice], texto: c.min === c.max ? compacto(c.min) : `${compacto(c.min)} – ${compacto(c.max)}` });
            }
        }
        const conValor = [...datos.filas.values()].filter((f) => f.valor !== null).length;
        if (conValor < estados().length) {
            entradas.push({ color: sinDato, texto: "Sin dato" });
        }

        // Medidas aproximadas: el texto se mide por número de caracteres.
        const tam = Math.max(8, Math.min(24, ajustes.tamano.value));
        const fila = Math.round(tam * 1.7);
        const cuadro = Math.round(tam * 1.15);
        const maxCaracteres = Math.max(4, Math.floor((ancho - 2 * MARGEN - 12) / (tam * 0.6)));
        const recortar = (t: string): string => (t.length > maxCaracteres ? `${t.slice(0, maxCaracteres - 1)}…` : t);
        const titulo = recortar(ajustes.titulo.value || datos.nombreValor || "");
        const anchoTexto = Math.max(titulo.length * 0.6, ...entradas.map((e) => e.texto.length * 0.56 + (cuadro + 8) / tam)) * tam;
        const anchoCaja = Math.min(ancho - 2 * MARGEN, Math.ceil(anchoTexto + 14));
        const altoCaja = (titulo ? fila : 0) + entradas.length * fila + 8;
        const posicion = String(ajustes.posicion.value?.value ?? "abajo-izquierda");
        const x = posicion.endsWith("derecha") ? ancho - MARGEN - anchoCaja : MARGEN;
        const y = posicion.startsWith("arriba") ? MARGEN : alto - MARGEN - altoCaja;

        const capa = this.capaLeyenda.attr("transform", `translate(${x},${y})`);
        capa.append("rect").classed("fondo", true).attr("width", anchoCaja).attr("height", altoCaja).attr("rx", 4);
        let yy = 4;
        if (titulo) {
            capa.append("text").classed("titulo", true)
                .attr("x", 7).attr("y", yy + fila / 2).attr("dominant-baseline", "central")
                .style("font-size", `${tam}px`).style("fill", () => colorTexto).text(titulo);
            yy += fila;
        }
        for (const e of entradas) {
            capa.append("rect").classed("muestra", true)
                .attr("x", 7).attr("y", yy + (fila - cuadro) / 2).attr("width", cuadro).attr("height", cuadro).attr("rx", 2)
                .attr("fill", e.color).attr("stroke", borde);
            capa.append("text").classed("etiqueta", true)
                .attr("x", 7 + cuadro + 6).attr("y", yy + fila / 2).attr("dominant-baseline", "central")
                .style("font-size", `${tam}px`).style("fill", () => colorTexto).text(recortar(e.texto));
            yy += fila;
        }
    }

    /** Aviso visible cuando hay claves que el mapa no pudo ubicar. */
    private dibujarAviso(ancho: number, colorTexto: string | null): void {
        const d = this.datos;
        const partes: string[] = [];
        if (d?.desconocidas.length) {
            partes.push(`${d.desconocidas.length} ${d.desconocidas.length === 1 ? "clave no reconocida" : "claves no reconocidas"}`);
        }
        if (d?.municipales && d.filas.size > 0) {
            partes.push(`${d.municipales} claves municipales (aún no se dibujan)`);
        }
        if (d?.repetidas.length) {
            partes.push(`${d.repetidas.length} repetidas`);
        }
        const leyendaArribaIzquierda = String(this.ajustes.leyenda.posicion.value?.value) === "arriba-izquierda" && this.ajustes.leyenda.mostrar.value;
        this.aviso
            .attr("x", leyendaArribaIzquierda ? ancho - MARGEN : MARGEN)
            .attr("y", MARGEN + 10)
            .attr("text-anchor", leyendaArribaIzquierda ? "end" : "start")
            .style("fill", () => colorTexto)
            .text(partes.length ? `⚠ ${partes.join(" · ")}` : "");
        const ejemplos = [...(d?.desconocidas ?? []), ...(d?.repetidas ?? [])].slice(0, 12);
        this.aviso.selectAll("title")
            .data(ejemplos.length ? [ejemplos] : [])
            .join("title")
            .text((e) => `Revisa estas claves en tu modelo: ${e.join(", ")}${(d?.desconocidas.length ?? 0) > 12 ? "…" : ""}`);
    }

    private dibujarMensaje(): void {
        const d = this.datos;
        let texto = "";
        if (!d) {
            texto = "Arrastra a Ubicación una columna con claves INEGI de estado (CVE_ENT) y a Valor la medida que quieras ver.";
        } else if (d.filas.size === 0 && d.municipales > 0) {
            texto = "Esta versión dibuja estados: usa claves de 2 dígitos (CVE_ENT). El nivel municipal (CVEGEO) llega en la siguiente versión.";
        } else if (d.nombreValor === null) {
            texto = "Agrega una medida en Valor.";
        }
        this.mensaje.style("display", () => (texto ? null : "none")).text(texto);
    }

    // ------------------------------------------------------------ interacción

    private seleccionar(area: Area, multiple: boolean): void {
        const fila = this.datos?.filas.get(area.clave);
        if (fila) {
            this.seleccion.select(fila.id, multiple).then(() => this.aplicarSeleccion());
        }
    }

    /** Atenúa lo no seleccionado; también responde a marcadores y a otros visuales. */
    private aplicarSeleccion(): void {
        const ids = this.seleccion.getSelectionIds() as ISelectionId[];
        this.capaAreas.selectAll<SVGPathElement, Area>("path.area")
            .attr("aria-selected", (e) => {
                const fila = this.datos?.filas.get(e.clave);
                return String(Boolean(fila && ids.some((id) => id.equals(fila.id))));
            })
            .style("opacity", function () {
                return ids.length === 0 || this.getAttribute("aria-selected") === "true" ? 1 : OPACIDAD_NO_SELECCIONADO;
            });
    }

    private mostrarTooltip(evento: PointerEvent, area: Area, mover: boolean): void {
        select(evento.currentTarget as SVGPathElement).raise().classed("activa", true);
        if (!this.host.tooltipService.enabled()) {
            return;
        }
        const fila = this.datos?.filas.get(area.clave);
        const items: VisualTooltipDataItem[] = [{ displayName: "Estado", value: area.nombre }];
        if (this.datos?.nombreValor) {
            items.push({ displayName: this.datos.nombreValor, value: fila?.texto ?? "Sin dato" });
        }
        if (fila) {
            items.push(...fila.extras);
        }
        const caja = this.raiz.getBoundingClientRect();
        const opciones = {
            coordinates: [evento.clientX - caja.left, evento.clientY - caja.top],
            isTouchEvent: evento.pointerType === "touch",
            dataItems: items,
            identities: fila ? [fila.id] : [],
        };
        if (mover) {
            this.host.tooltipService.move(opciones);
        } else {
            this.host.tooltipService.show(opciones);
        }
    }

    private ocultarTooltip(evento: PointerEvent): void {
        select(evento.currentTarget as SVGPathElement).classed("activa", false);
        this.host.tooltipService.hide({ immediately: true, isTouchEvent: evento.pointerType === "touch" });
    }
}
