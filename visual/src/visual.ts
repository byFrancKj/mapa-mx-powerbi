"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { select, Selection } from "d3-selection";
import { geoConicConformal, geoMercator, geoPath, GeoPath, GeoProjection } from "d3-geo";
import "./../style/visual.less";

import { Ajustes } from "./ajustes";
import { clasificar, Clasificacion, Metodo } from "./clasificacion";
import { Nivel, normalizarClave, nivelDeClave } from "./claves";
import { formatoCompacto, Unidades } from "./formato";
import { Area, bordes, capa } from "./geometria";
import { colorBivariado, coloresDivergentes, coloresSecuenciales } from "./paletas";
import { Textos } from "./textos";

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
const COLOR_LIMITE_ESTATAL = "#8a8886";
const COLOR_HALO = "#ffffff";

/** Un área con datos: lo que Power BI mandó para su clave. */
interface Fila {
    clave: string;
    valor: number | null;
    texto: string;
    valor2: number | null;
    texto2: string;
    grupo: string | null;
    /** Resaltado por otro visual (si no hay resaltado, todas lo están). */
    resaltado: boolean;
    extras: VisualTooltipDataItem[];
    id: ISelectionId;
}

interface Datos {
    nivel: Nivel;
    filas: Map<string, Fila>;
    /** Estados con datos; en el nivel municipal son los que se dibujan. */
    estadosCubiertos: Set<string>;
    nombreValor: string | null;
    formatoValor: string | undefined;
    nombreValor2: string | null;
    formatoValor2: string | undefined;
    nombreGrupo: string | null;
    /** Otro visual está resaltando una parte de los datos. */
    hayResaltado: boolean;
    /** Valores de Ubicación que no son una clave INEGI (se reportan en el mapa). */
    desconocidas: string[];
    /** Claves del otro nivel (estado entre municipios o al revés). */
    otroNivel: number;
    /** Claves XX000: datos que solo llegan a nivel estatal. */
    sinMunicipio: number;
    repetidas: string[];
}

/** Cómo se colorea: una medida en clases o dos medidas en terciles (bivariado). */
interface Coloreado {
    color(a: Area): string;
    clasif: Clasificacion | null;
    colores: string[];
    /** Bivariado: tercil (0, 1, 2) de cada medida para un área con datos. */
    terciles(fila: Fila): [number, number] | null;
}

interface EntradaLeyenda {
    color: string;
    texto: string;
}

type Sel<E extends Element> = Selection<E, unknown, null, undefined>;

const esSinMunicipio = (clave: string): boolean => clave.length === 5 && clave.endsWith("000");
const acotar = (x: number, min: number, max: number): number => Math.max(min, Math.min(max, x));

/** Lleva una clase de 1, 2 o 3 terciles a la escala 0-2 de la paleta bivariada. */
function tercil(c: Clasificacion, v: number): number {
    const i = c.claseDe(v);
    return c.numClases >= 3 ? i : c.numClases === 2 ? i * 2 : 1;
}

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly raiz: HTMLElement;
    private readonly seleccion: ISelectionManager;
    private readonly textos: Textos;
    private readonly servicioFormato: FormattingSettingsService;
    private readonly svg: Sel<SVGSVGElement>;
    private readonly capaAreas: Sel<SVGGElement>;
    private readonly limitesEstatales: Sel<SVGPathElement>;
    private readonly contornoGrupos: Sel<SVGPathElement>;
    private readonly resaltado: Sel<SVGPathElement>;
    private readonly capaEtiquetas: Sel<SVGGElement>;
    private readonly capaLeyenda: Sel<SVGGElement>;
    private readonly aviso: Sel<SVGTextElement>;
    private readonly mensaje: Sel<HTMLDivElement>;
    private ajustes = new Ajustes();
    private datos: Datos | null = null;
    private coloreado: Coloreado | null = null;
    private firmaGeometria = "";

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.raiz = options.element;
        const gestorIdioma = this.host.createLocalizationManager();
        this.textos = new Textos(gestorIdioma);
        this.servicioFormato = new FormattingSettingsService(gestorIdioma);
        this.seleccion = this.host.createSelectionManager();
        this.seleccion.registerOnSelectCallback(() => this.aplicarSeleccion());

        const raiz = select(this.raiz);
        this.svg = raiz.append("svg").classed("mapa-mx", true);
        this.capaAreas = this.svg.append("g").classed("areas", true);
        // Capas de líneas (fill="none" también como atributo, por si la hoja de estilos no carga)
        this.limitesEstatales = this.svg.append("path").classed("limites-estatales", true).attr("fill", "none");
        this.contornoGrupos = this.svg.append("path").classed("contorno-grupos", true).attr("fill", "none");
        this.resaltado = this.svg.append("path").classed("resaltado", true).attr("fill", "none").style("display", "none");
        this.capaEtiquetas = this.svg.append("g").classed("etiquetas", true);
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

        // Eventos de las áreas, delegados en su capa: un manejador para miles de municipios.
        this.capaAreas
            .on("click", (evento: MouseEvent) => {
                const area = this.areaDe(evento.target);
                if (!area) {
                    return;
                }
                evento.stopPropagation();
                if (this.interactivo()) {
                    this.seleccionar(area, evento.ctrlKey || evento.metaKey || evento.shiftKey);
                }
            })
            .on("keydown", (evento: KeyboardEvent) => {
                const area = this.areaDe(evento.target);
                if (area && (evento.key === "Enter" || evento.key === " ")) {
                    this.seleccionar(area, evento.ctrlKey || evento.metaKey);
                    evento.preventDefault();
                }
            })
            .on("contextmenu", (evento: MouseEvent) => {
                const area = this.areaDe(evento.target);
                const fila = area ? this.datos?.filas.get(area.clave) : undefined;
                this.seleccion.showContextMenu(fila ? fila.id : ({} as ISelectionId), { x: evento.clientX, y: evento.clientY });
                evento.preventDefault();
                evento.stopPropagation();
            })
            .on("pointerover", (evento: PointerEvent) => {
                const area = this.areaDe(evento.target);
                if (area) {
                    this.mostrarTooltip(evento, area, false);
                }
            })
            .on("pointermove", (evento: PointerEvent) => {
                const area = this.areaDe(evento.target);
                if (area) {
                    this.mostrarTooltip(evento, area, true);
                }
            })
            .on("pointerout", (evento: PointerEvent) => {
                if (!this.areaDe(evento.relatedTarget)) {
                    this.ocultarTooltip(evento);
                }
            });
    }

    public update(options: VisualUpdateOptions): void {
        const eventos = this.host.eventService;
        eventos.renderingStarted(options);
        try {
            const dataView = options.dataViews?.[0];
            this.ajustes = this.servicioFormato.populateFormattingSettingsModel(Ajustes, dataView);
            this.datos = this.leerDatos(dataView);
            const bivariado = this.esBivariado();
            this.ajustes.colores.bivariado = bivariado;
            this.ajustes.bivariado.visible = bivariado;
            this.ajustes.grupos.visible = Boolean(this.datos?.nombreGrupo);
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

    /**
     * Lee los campos por rol (Ubicación, Grupo, Valor, Valor 2, Tooltips), nunca por
     * nombre. Si Ubicación es una jerarquía (drill-down), usa el nivel más profundo.
     */
    private leerDatos(dataView: DataView | undefined): Datos | null {
        const categorias = dataView?.categorical?.categories ?? [];
        const niveles = categorias.filter((c) => c.source.roles?.ubicacion);
        if (niveles.length === 0) {
            return null;
        }
        const ubicacion = niveles[niveles.length - 1];
        const colGrupo = categorias.find((c) => c.source.roles?.grupo);
        const columnas = dataView?.categorical?.values ?? [];
        const colValor = columnas.find((c) => c.source.roles?.valor);
        const colValor2 = columnas.find((c) => c.source.roles?.valor2);
        const colTooltips = columnas.filter((c) => c.source.roles?.tooltips);
        const resaltes = colValor?.highlights;
        const exacto = this.formateador(colValor?.source.format);
        const exacto2 = this.formateador(colValor2?.source.format);
        const formatosExtra = colTooltips.map((c) => this.formateador(c.source.format));
        const numero = (v: PrimitiveValue | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

        // El nivel lo decide la mayoría de claves válidas: 2 dígitos = estado, 5 = municipio.
        const claves = ubicacion.values.map(normalizarClave);
        let votosEstado = 0;
        let votosMunicipio = 0;
        for (const c of claves) {
            if (c && nivelDeClave(c) === "estado" && capa("estado").porClave.has(c)) {
                votosEstado++;
            } else if (c && nivelDeClave(c) === "municipio" && (capa("municipio").porClave.has(c) || esSinMunicipio(c))) {
                votosMunicipio++;
            }
        }
        const nivel: Nivel = votosMunicipio > votosEstado ? "municipio" : "estado";
        const validas = capa(nivel).porClave;

        const datos: Datos = {
            nivel,
            filas: new Map(),
            estadosCubiertos: new Set(),
            nombreValor: colValor?.source.displayName ?? null,
            formatoValor: colValor?.source.format,
            nombreValor2: colValor2?.source.displayName ?? null,
            formatoValor2: colValor2?.source.format,
            nombreGrupo: colGrupo?.source.displayName ?? null,
            hayResaltado: Boolean(resaltes),
            desconocidas: [],
            otroNivel: 0,
            sinMunicipio: 0,
            repetidas: [],
        };
        claves.forEach((clave, i) => {
            const bruto = ubicacion.values[i];
            if (clave && nivelDeClave(clave) !== nivel) {
                datos.otroNivel++;
                return;
            }
            if (clave && esSinMunicipio(clave)) {
                datos.sinMunicipio++;
                datos.estadosCubiertos.add(clave.slice(0, 2));
                return;
            }
            if (!clave || !validas.has(clave)) {
                datos.desconocidas.push(bruto === null || bruto === undefined || bruto === "" ? this.textos.t("Texto_EnBlanco") : String(bruto));
                return;
            }
            if (datos.filas.has(clave)) {
                datos.repetidas.push(String(bruto));
                return;
            }
            const valor = numero(colValor?.values[i]);
            const valor2 = numero(colValor2?.values[i]);
            const grupo = colGrupo?.values[i];
            const constructor = categorias.reduce((b, c) => b.withCategory(c, i), this.host.createSelectionIdBuilder());
            datos.filas.set(clave, {
                clave,
                valor,
                texto: valor === null ? this.textos.t("Texto_SinDato") : exacto(valor),
                valor2,
                texto2: valor2 === null ? this.textos.t("Texto_SinDato") : exacto2(valor2),
                grupo: grupo === null || grupo === undefined || grupo === "" ? null : String(grupo),
                resaltado: !resaltes || (resaltes[i] !== null && resaltes[i] !== undefined),
                extras: colTooltips.map((c, j) => ({ displayName: c.source.displayName, value: this.texto(c.values[i], formatosExtra[j]) })),
                id: constructor.createSelectionId(),
            });
            datos.estadosCubiertos.add(clave.slice(0, 2));
        });
        return datos;
    }

    private esBivariado(): boolean {
        return Boolean(this.datos?.nombreValor && this.datos.nombreValor2);
    }

    /** Formatea con la cadena de formato de la propia medida, como lo haría Power BI. */
    private formateador(formato: string | undefined): (v: number) => string {
        const f = valueFormatter.create({ format: formato ?? FORMATO_GENERAL, cultureSelector: this.host.locale });
        return (v: number) => f.format(v);
    }

    private compacto(formato: string | undefined): (v: number) => string {
        const exacto = this.formateador(formato);
        const unidades: Unidades = {
            mil: this.textos.t("Unidad_Mil"),
            millon: this.textos.t("Unidad_Millon"),
            milMillones: this.textos.t("Unidad_MilMillones"),
        };
        return (v: number) => formatoCompacto(v, formato, this.host.locale, exacto, unidades);
    }

    private texto(valor: PrimitiveValue, formatear: (v: number) => string): string {
        if (valor === null || valor === undefined) {
            return "";
        }
        return typeof valor === "number" ? formatear(valor) : String(valor);
    }

    // ----------------------------------------------------------------- dibujo

    private colorear(sinDato: string): Coloreado {
        const datos = this.datos;
        const filas = datos ? [...datos.filas.values()] : [];
        const c = this.ajustes.colores;
        if (this.esBivariado()) {
            const ambas = filas.filter((f) => f.valor !== null && f.valor2 !== null);
            const opciones = { metodo: "cuantiles" as Metodo, clases: 3, centro: 0, umbral1: 0, umbral2: 0 };
            const cx = clasificar(ambas.map((f) => f.valor as number), opciones);
            const cy = clasificar(ambas.map((f) => f.valor2 as number), opciones);
            const paleta = String(this.ajustes.bivariado.paleta.value?.value ?? "turquesa-rosa");
            const terciles = (f: Fila): [number, number] | null =>
                f.valor === null || f.valor2 === null ? null : [tercil(cx, f.valor), tercil(cy, f.valor2)];
            return {
                clasif: null,
                colores: [],
                terciles,
                color: (a) => {
                    const fila = datos?.filas.get(a.clave);
                    const t = fila ? terciles(fila) : null;
                    return t ? colorBivariado(paleta, t[0], t[1]) : sinDato;
                },
            };
        }
        const metodo = (c.metodo.value?.value ?? "cuantiles") as Metodo;
        const clasif = clasificar(filas.map((f) => f.valor).filter((v): v is number => v !== null), {
            metodo,
            clases: acotar(Math.round(c.clases.value), 2, 7),
            centro: c.centro.value,
            umbral1: c.umbral1.value,
            umbral2: c.umbral2.value,
        });
        const colores = metodo === "divergente"
            ? coloresDivergentes(String(c.paletaDivergente.value?.value), c.invertir.value)
            : coloresSecuenciales(String(c.paleta.value?.value), clasif.numClases, c.invertir.value);
        return {
            clasif,
            colores,
            terciles: () => null,
            color: (a) => {
                const fila = datos?.filas.get(a.clave);
                return fila && fila.valor !== null ? colores[clasif.claseDe(fila.valor)] : sinDato;
            },
        };
    }

    private dibujar(ancho: number, alto: number): void {
        this.svg.attr("width", ancho).attr("height", alto);
        const datos = this.datos;
        const nivel: Nivel = datos?.nivel ?? "estado";
        const geo = capa(nivel);
        // En municipios solo se dibujan los estados que traen datos (al hacer
        // drill-down a un estado, el mapa se acerca a él).
        const visibles = nivel === "municipio" && datos ? geo.areas.filter((a) => datos.estadosCubiertos.has(a.estado)) : geo.areas;
        const ajustes = this.ajustes;
        const paleta = this.host.colorPalette;
        const altoContraste = paleta.isHighContrast;
        const colorTexto = altoContraste ? paleta.foreground.value : null;

        const sinDato = altoContraste ? paleta.background.value : ajustes.colores.sinDato.value.value;
        const borde = altoContraste ? paleta.foreground.value : ajustes.mapa.borde.value.value;
        const coloreado = this.colorear(sinDato);
        this.coloreado = coloreado;

        const nombreProyeccion = String(ajustes.mapa.proyeccion.value?.value ?? "lambert");
        const proyeccion = nombreProyeccion === "mercator"
            ? geoMercator()
            : geoConicConformal().parallels([17.5, 29.5]).rotate([102, 0]); // la misma que usa INEGI
        const encuadre = visibles.length ? visibles : capa("estado").areas;
        proyeccion.fitExtent(
            [[MARGEN, MARGEN], [Math.max(MARGEN + 1, ancho - MARGEN), Math.max(MARGEN + 1, alto - MARGEN)]],
            { type: "FeatureCollection", features: encuadre.map((a) => a.forma) },
        );
        const camino = geoPath(proyeccion);

        // El trazo de las áreas solo se recalcula si cambia la geometría.
        const firma = [nivel, ancho, alto, nombreProyeccion, [...(datos?.estadosCubiertos ?? [])].sort().join(",")].join("|");
        const geometriaNueva = firma !== this.firmaGeometria;
        this.firmaGeometria = firma;

        const conGrupo = Boolean(datos?.nombreGrupo);
        const sinLimitesInternos = conGrupo && !ajustes.grupos.limitesInternos.value;
        const grosor = Math.max(0, ajustes.mapa.grosor.value) * (nivel === "municipio" ? 0.5 : 1);
        const interactivo = this.interactivo();

        const seleccionAreas = this.capaAreas.selectAll<SVGPathElement, Area>("path.area").data(visibles, (a) => a.clave);
        seleccionAreas.exit().remove();
        const nuevas = seleccionAreas.enter().append("path").classed("area", true);
        (geometriaNueva ? nuevas.merge(seleccionAreas) : nuevas).attr("d", (a) => camino(a.forma) ?? "");
        nuevas.merge(seleccionAreas)
            .classed("con-dato", (a) => datos?.filas.has(a.clave) ?? false)
            .attr("fill", coloreado.color)
            // Sin límites internos, el trazo del mismo color tapa las rendijas entre áreas.
            .attr("stroke", (a) => (sinLimitesInternos ? coloreado.color(a) : borde))
            .attr("stroke-width", sinLimitesInternos ? 0.6 : grosor)
            .attr("tabindex", (a) => (interactivo && datos?.filas.has(a.clave) ? 0 : -1))
            .attr("aria-label", (a) => this.etiquetaDe(a));

        if (nivel === "municipio" && visibles.length > 0) {
            if (geometriaNueva) {
                const lineas = bordes(geo, (a, b) => b === null || a.slice(0, 2) !== b.slice(0, 2));
                this.limitesEstatales.attr("d", camino(lineas) ?? "");
            }
            this.limitesEstatales
                .attr("stroke", altoContraste ? paleta.foreground.value : COLOR_LIMITE_ESTATAL)
                .attr("stroke-width", Math.max(0.8, ajustes.mapa.grosor.value * 1.2))
                .style("display", null);
        } else {
            this.limitesEstatales.style("display", "none");
        }

        if (datos && conGrupo && ajustes.grupos.contorno.value) {
            // Contorno donde cambia el grupo, calculado con los datos de este momento.
            const grupoDe = (k: string): string | null => datos.filas.get(k)?.grupo ?? null;
            const lineas = bordes(geo, (a, b) => {
                const ga = grupoDe(a);
                if (b === null) {
                    return ga !== null;
                }
                const gb = grupoDe(b);
                return ga !== gb && (ga !== null || gb !== null);
            });
            this.contornoGrupos
                .attr("d", camino(lineas) ?? "")
                .attr("stroke", altoContraste ? paleta.foreground.value : ajustes.grupos.color.value.value)
                .attr("stroke-width", Math.max(0, ajustes.grupos.grosor.value))
                .style("display", null);
        } else {
            this.contornoGrupos.style("display", "none");
        }

        this.resaltado.style("display", "none");
        this.aplicarSeleccion();
        this.dibujarEtiquetas(visibles, camino, proyeccion, colorTexto);
        if (this.esBivariado()) {
            this.dibujarLeyendaBivariada(sinDato, borde, visibles.length, ancho, alto, colorTexto);
        } else {
            this.dibujarLeyenda(coloreado, sinDato, borde, visibles.length, ancho, alto, colorTexto);
        }
        this.dibujarAviso(ancho, colorTexto);
        this.dibujarMensaje();
    }

    private nombreEstado(a: Area): string {
        return capa("estado").porClave.get(a.estado)?.nombre ?? a.estado;
    }

    private etiquetaDe(a: Area): string {
        const estado = this.datos?.nivel === "municipio" ? `, ${this.nombreEstado(a)}` : "";
        return `${a.nombre}${estado}: ${this.datos?.filas.get(a.clave)?.texto ?? this.textos.t("Texto_SinDato")}`;
    }

    /**
     * Etiquetas sobre las áreas, solo donde caben y sin encimarse: las áreas grandes
     * colocan la suya primero y se omite la que choque con otra (el texto se mide por
     * número de caracteres).
     */
    private dibujarEtiquetas(visibles: Area[], camino: GeoPath, proyeccion: GeoProjection, colorTexto: string | null): void {
        const ajustes = this.ajustes.etiquetas;
        const datos = this.datos;
        this.capaEtiquetas.selectAll("*").remove();
        if (!ajustes.mostrar.value || !datos) {
            return;
        }
        const contenido = String(ajustes.contenido.value?.value ?? "valor");
        const tam = acotar(ajustes.tamano.value, 6, 24);
        const interlineado = tam * 1.15;
        const compacto = this.compacto(datos.formatoValor);
        const halo = this.host.colorPalette.isHighContrast ? this.host.colorPalette.background.value : COLOR_HALO;

        interface Candidata { lineas: string[]; x: number; y: number; ancho: number; alto: number; prioridad: number }
        const candidatas: Candidata[] = [];
        for (const a of visibles) {
            const valor = datos.filas.get(a.clave)?.valor ?? null;
            const lineas: string[] = [];
            if (contenido !== "valor") {
                lineas.push(a.nombre);
            }
            if (contenido !== "nombre" && valor !== null) {
                lineas.push(compacto(valor));
            }
            if (lineas.length === 0 || (contenido === "valor" && valor === null)) {
                continue;
            }
            const [[x0, y0], [x1, y1]] = camino.bounds(a.forma);
            const ancho = Math.max(...lineas.map((l) => l.length)) * tam * 0.55;
            const alto = lineas.length * interlineado;
            if (x1 - x0 < ancho || y1 - y0 < alto) {
                continue;
            }
            // Punto interior precalculado (estados) o centroide (municipios).
            const { LON, LAT } = a.forma.properties;
            const punto = typeof LON === "number" && typeof LAT === "number" ? proyeccion([LON, LAT]) : camino.centroid(a.forma);
            if (!punto || !Number.isFinite(punto[0]) || !Number.isFinite(punto[1])) {
                continue;
            }
            candidatas.push({ lineas, x: punto[0], y: punto[1], ancho, alto, prioridad: (x1 - x0) * (y1 - y0) });
        }

        const colocadas: Candidata[] = [];
        const choca = (c: Candidata): boolean => colocadas.some((o) =>
            Math.abs(c.x - o.x) * 2 < c.ancho + o.ancho + 4 && Math.abs(c.y - o.y) * 2 < c.alto + o.alto + 2);
        for (const c of candidatas.sort((a, b) => b.prioridad - a.prioridad)) {
            if (choca(c)) {
                continue;
            }
            colocadas.push(c);
            const texto = this.capaEtiquetas.append("text")
                .attr("x", c.x)
                .attr("y", c.y - ((c.lineas.length - 1) * interlineado) / 2)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "central")
                .attr("fill", colorTexto ?? ajustes.color.value.value)
                .attr("stroke", halo)
                .attr("stroke-width", 3)
                .attr("stroke-linejoin", "round")
                .attr("paint-order", "stroke")
                .style("font-size", `${tam}px`);
            c.lineas.forEach((linea, i) => texto.append("tspan").attr("x", c.x).attr("dy", i === 0 ? 0 : interlineado).text(linea));
        }
    }

    private dibujarLeyenda(
        coloreado: Coloreado, sinDato: string, borde: string,
        visibles: number, ancho: number, alto: number, colorTexto: string | null,
    ): void {
        const ajustes = this.ajustes.leyenda;
        const datos = this.datos;
        const clasif = coloreado.clasif;
        this.capaLeyenda.selectAll("*").remove();
        if (!ajustes.mostrar.value || !datos || !clasif || clasif.numClases === 0) {
            return;
        }

        const compacto = this.compacto(datos.formatoValor);
        const entradas: EntradaLeyenda[] = [];
        if (clasif.metodo === "divergente") {
            const ultima = clasif.numClases - 1;
            for (const c of clasif.clases) {
                const texto = c.indice === 0 ? `< ${compacto(c.hasta ?? 0)}`
                    : c.indice === ultima ? `> ${compacto(c.desde ?? 0)}`
                    : this.textos.t("Leyenda_Rango", compacto(c.desde ?? 0), compacto(c.hasta ?? 0));
                entradas.push({ color: coloreado.colores[c.indice], texto });
            }
        } else {
            for (const c of clasif.clases.filter((k) => k.n > 0)) {
                entradas.push({
                    color: coloreado.colores[c.indice],
                    texto: c.min === c.max ? compacto(c.min) : `${compacto(c.min)} – ${compacto(c.max)}`,
                });
            }
        }
        const conValor = [...datos.filas.values()].filter((f) => f.valor !== null).length;
        if (conValor < visibles) {
            entradas.push({ color: sinDato, texto: this.textos.t("Texto_SinDato") });
        }

        // Medidas aproximadas: el texto se mide por número de caracteres.
        const tam = acotar(ajustes.tamano.value, 8, 24);
        const fila = Math.round(tam * 1.7);
        const cuadro = Math.round(tam * 1.15);
        const recortar = this.recortador(ancho, tam);
        const titulo = recortar(ajustes.titulo.value || datos.nombreValor || "");
        const anchoTexto = Math.max(titulo.length * 0.6, ...entradas.map((e) => e.texto.length * 0.56 + (cuadro + 8) / tam)) * tam;
        const anchoCaja = Math.min(ancho - 2 * MARGEN, Math.ceil(anchoTexto + 14));
        const altoCaja = (titulo ? fila : 0) + entradas.length * fila + 8;

        const capaLeyenda = this.posicionarLeyenda(anchoCaja, altoCaja, ancho, alto);
        let yy = 4;
        if (titulo) {
            capaLeyenda.append("text").classed("titulo", true)
                .attr("x", 7).attr("y", yy + fila / 2).attr("dominant-baseline", "central")
                .style("font-size", `${tam}px`).style("fill", () => colorTexto).text(titulo);
            yy += fila;
        }
        for (const e of entradas) {
            capaLeyenda.append("rect").classed("muestra", true)
                .attr("x", 7).attr("y", yy + (fila - cuadro) / 2).attr("width", cuadro).attr("height", cuadro).attr("rx", 2)
                .attr("fill", e.color).attr("stroke", borde);
            capaLeyenda.append("text").classed("etiqueta", true)
                .attr("x", 7 + cuadro + 6).attr("y", yy + fila / 2).attr("dominant-baseline", "central")
                .style("font-size", `${tam}px`).style("fill", () => colorTexto).text(recortar(e.texto));
            yy += fila;
        }
    }

    /** Leyenda 3×3: Valor crece hacia la derecha y Valor 2 hacia arriba. */
    private dibujarLeyendaBivariada(
        sinDato: string, borde: string, visibles: number, ancho: number, alto: number, colorTexto: string | null,
    ): void {
        const ajustes = this.ajustes.leyenda;
        const datos = this.datos;
        this.capaLeyenda.selectAll("*").remove();
        if (!ajustes.mostrar.value || !datos) {
            return;
        }
        const tam = acotar(ajustes.tamano.value, 8, 24);
        const celda = Math.round(tam * 1.6);
        const fila = Math.round(tam * 1.7);
        const recortar = this.recortador(ancho, tam);
        const textoY = `↑ ${recortar(datos.nombreValor2 ?? "")}`;
        const textoX = `${recortar(datos.nombreValor ?? "")} →`;
        const conAmbas = [...datos.filas.values()].filter((f) => f.valor !== null && f.valor2 !== null).length;
        const conSinDato = conAmbas < visibles;
        const anchoTexto = Math.max(textoX.length, textoY.length) * tam * 0.56;
        const anchoCaja = Math.min(ancho - 2 * MARGEN, Math.ceil(Math.max(3 * celda, anchoTexto) + 14));
        const altoCaja = fila + 3 * celda + fila + (conSinDato ? fila : 0) + 6;
        const paleta = String(this.ajustes.bivariado.paleta.value?.value ?? "turquesa-rosa");

        const capaLeyenda = this.posicionarLeyenda(anchoCaja, altoCaja, ancho, alto);
        const x0 = 7;
        const y0 = fila;
        capaLeyenda.append("text").classed("etiqueta", true)
            .attr("x", x0).attr("y", fila / 2 + 2).attr("dominant-baseline", "central")
            .style("font-size", `${tam}px`).style("fill", () => colorTexto).text(textoY);
        for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 3; x++) {
                capaLeyenda.append("rect").classed("muestra", true)
                    .attr("x", x0 + x * celda).attr("y", y0 + (2 - y) * celda).attr("width", celda - 1).attr("height", celda - 1)
                    .attr("fill", colorBivariado(paleta, x, y));
            }
        }
        capaLeyenda.append("text").classed("etiqueta", true)
            .attr("x", x0).attr("y", y0 + 3 * celda + fila / 2).attr("dominant-baseline", "central")
            .style("font-size", `${tam}px`).style("fill", () => colorTexto).text(textoX);
        if (conSinDato) {
            const yy = y0 + 3 * celda + fila;
            const cuadro = Math.round(tam * 1.15);
            capaLeyenda.append("rect").classed("muestra", true)
                .attr("x", x0).attr("y", yy + (fila - cuadro) / 2).attr("width", cuadro).attr("height", cuadro).attr("rx", 2)
                .attr("fill", sinDato).attr("stroke", borde);
            capaLeyenda.append("text").classed("etiqueta", true)
                .attr("x", x0 + cuadro + 6).attr("y", yy + fila / 2).attr("dominant-baseline", "central")
                .style("font-size", `${tam}px`).style("fill", () => colorTexto).text(this.textos.t("Texto_SinDato"));
        }
    }

    private recortador(ancho: number, tam: number): (t: string) => string {
        const maxCaracteres = Math.max(4, Math.floor((ancho - 2 * MARGEN - 12) / (tam * 0.6)));
        return (t: string): string => (t.length > maxCaracteres ? `${t.slice(0, maxCaracteres - 1)}…` : t);
    }

    /** Coloca la caja de la leyenda en la esquina elegida y devuelve su capa. */
    private posicionarLeyenda(anchoCaja: number, altoCaja: number, ancho: number, alto: number): Sel<SVGGElement> {
        const posicion = String(this.ajustes.leyenda.posicion.value?.value ?? "abajo-izquierda");
        const x = posicion.endsWith("derecha") ? ancho - MARGEN - anchoCaja : MARGEN;
        const y = posicion.startsWith("arriba") ? MARGEN : alto - MARGEN - altoCaja;
        const capaLeyenda = this.capaLeyenda.attr("transform", `translate(${x},${y})`);
        capaLeyenda.append("rect").classed("fondo", true).attr("width", anchoCaja).attr("height", altoCaja).attr("rx", 4);
        return capaLeyenda;
    }

    /** Aviso visible cuando hay claves que el mapa no pudo ubicar. */
    private dibujarAviso(ancho: number, colorTexto: string | null): void {
        const d = this.datos;
        const t = this.textos;
        const partes: string[] = [];
        if (d?.desconocidas.length) {
            partes.push(t.t(d.desconocidas.length === 1 ? "Aviso_NoReconocida" : "Aviso_NoReconocidas", d.desconocidas.length));
        }
        if (d?.otroNivel) {
            partes.push(t.t("Aviso_OtroNivel", d.otroNivel));
        }
        if (d?.sinMunicipio && d.nivel === "municipio") {
            partes.push(t.t("Aviso_SinMunicipio", d.sinMunicipio));
        }
        if (d?.repetidas.length) {
            partes.push(t.t("Aviso_Repetidas", d.repetidas.length));
        }
        const leyendaArribaIzquierda = String(this.ajustes.leyenda.posicion.value?.value) === "arriba-izquierda" && this.ajustes.leyenda.mostrar.value;
        this.aviso
            .attr("x", leyendaArribaIzquierda ? ancho - MARGEN : MARGEN)
            .attr("y", MARGEN + 10)
            .attr("text-anchor", leyendaArribaIzquierda ? "end" : "start")
            .style("fill", () => colorTexto)
            .text(partes.length ? `⚠ ${partes.join(" · ")}` : "");
        const ejemplos = [...(d?.desconocidas ?? []), ...(d?.repetidas ?? [])].slice(0, 12);
        const detalle = ejemplos.length ? t.t("Aviso_Revisa", `${ejemplos.join(", ")}${(d?.desconocidas.length ?? 0) > 12 ? "…" : ""}`) : "";
        this.aviso.selectAll("title")
            .data(detalle ? [detalle] : [])
            .join("title")
            .text((e) => e);
        // El mismo aviso en el ícono de advertencia del encabezado del visual.
        if (partes.length && typeof this.host.displayWarningIcon === "function") {
            this.host.displayWarningIcon(t.t("Aviso_Titulo"), [partes.join(" · "), detalle].filter(Boolean).join(". "));
        }
    }

    private dibujarMensaje(): void {
        const d = this.datos;
        let texto = "";
        if (!d) {
            texto = this.textos.t("Mensaje_Inicio");
        } else if (d.filas.size === 0 && d.desconocidas.length > 0 && d.desconocidas.every((v) => !/^\s*\d+\s*$/.test(v))) {
            texto = this.textos.t("Mensaje_Nombres");
        } else if (d.nombreValor === null) {
            texto = this.textos.t("Mensaje_SinValor");
        }
        this.mensaje.style("display", () => (texto ? null : "none")).text(texto);
    }

    // ------------------------------------------------------------ interacción

    private interactivo(): boolean {
        return this.host.hostCapabilities?.allowInteractions !== false;
    }

    /** El área bajo un evento (los eventos se delegan en la capa de áreas). */
    private areaDe(objetivo: EventTarget | null): Area | null {
        const e = objetivo as Element | null;
        if (!e || typeof e.getAttribute !== "function" || e.tagName.toLowerCase() !== "path" || !e.classList.contains("area")) {
            return null;
        }
        return select<Element, Area>(e).datum() ?? null;
    }

    private seleccionar(area: Area, multiple: boolean): void {
        const fila = this.datos?.filas.get(area.clave);
        if (fila) {
            this.seleccion.select(fila.id, multiple).then(() => this.aplicarSeleccion());
        }
    }

    /**
     * Atenúa lo no seleccionado y lo que otro visual no resalta; también responde a
     * marcadores y a selecciones hechas en otros visuales.
     */
    private aplicarSeleccion(): void {
        const ids = this.seleccion.getSelectionIds() as ISelectionId[];
        const filas = this.datos?.filas;
        const hayResaltado = this.datos?.hayResaltado ?? false;
        const seleccionada = (a: Area): boolean => {
            const fila = filas?.get(a.clave);
            return Boolean(fila && ids.some((id) => id.equals(fila.id)));
        };
        this.capaAreas.selectAll<SVGPathElement, Area>("path.area")
            .attr("aria-selected", (a) => String(seleccionada(a)))
            .style("opacity", (a) => {
                const porSeleccion = ids.length === 0 || seleccionada(a);
                const porResaltado = !hayResaltado || Boolean(filas?.get(a.clave)?.resaltado);
                return porSeleccion && porResaltado ? 1 : OPACIDAD_NO_SELECCIONADO;
            });
    }

    private mostrarTooltip(evento: PointerEvent, area: Area, mover: boolean): void {
        const objetivo = evento.target as SVGPathElement;
        this.resaltado.attr("d", objetivo.getAttribute("d")).style("display", null);
        if (!this.host.tooltipService.enabled()) {
            return;
        }
        const t = this.textos;
        const datos = this.datos;
        const fila = datos?.filas.get(area.clave);
        const items: VisualTooltipDataItem[] = datos?.nivel === "municipio"
            ? [
                { displayName: t.t("Texto_Municipio"), value: area.nombre },
                { displayName: t.t("Texto_Estado"), value: this.nombreEstado(area) },
            ]
            : [{ displayName: t.t("Texto_Estado"), value: area.nombre }];
        if (datos?.nombreGrupo && fila?.grupo) {
            items.push({ displayName: datos.nombreGrupo, value: fila.grupo });
        }
        if (datos?.nombreValor) {
            items.push({ displayName: datos.nombreValor, value: fila?.texto ?? t.t("Texto_SinDato") });
        }
        if (datos?.nombreValor && datos.nombreValor2) {
            items.push({ displayName: datos.nombreValor2, value: fila?.texto2 ?? t.t("Texto_SinDato") });
            const terciles = fila ? this.coloreado?.terciles(fila) : null;
            if (terciles) {
                const nivelDe = (i: number): string => t.t(["Texto_Bajo", "Texto_Medio", "Texto_Alto"][i]);
                items.push({
                    displayName: t.t("Texto_Clase"),
                    value: t.t("Texto_ClaseBivariada", nivelDe(terciles[0]), datos.nombreValor, nivelDe(terciles[1]), datos.nombreValor2),
                });
            }
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
        this.resaltado.style("display", "none");
        this.host.tooltipService.hide({ immediately: true, isTouchEvent: evento.pointerType === "touch" });
    }
}
