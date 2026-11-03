"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { select, Selection } from "d3-selection";
import { geoConicConformal, geoContains, geoGraticule, geoMercator, geoPath, GeoPath, GeoProjection } from "d3-geo";
import type { MultiPolygon } from "geojson";
import "./../style/visual.less";

import { Ajustes, ModoColor } from "./ajustes";
import { clasificar, Clasificacion, Metodo } from "./clasificacion";
import { Nivel, normalizarClave, nivelDeClave } from "./claves";
import { formatoCompacto, Unidades } from "./formato";
import { Area, bordes, capa, fondoDelMapa, principal, unir } from "./geometria";
import { colorBivariado, coloresDivergentes, coloresSecuenciales, mezclar } from "./paletas";
import { Cuadro, LecturaMatriz, leerMatriz } from "./matriz";
import { Cifra, LineaDiferencia, ModeloPanel, MotivoPanel, Panel, Recuadro } from "./panel";
import { REFERENCIAS } from "./referencias";
import { Agregacion, AGREGACIONES, agruparTextos, comparar, resumir } from "./resumen";
import { Textos } from "./textos";
import { ALTO_TIEMPO, LineaTiempo } from "./tiempo";
import { Caja, encuadrar, IDENTIDAD, iguales, ModoRueda, Transformacion, Zoom } from "./zoom";

import DataView = powerbi.DataView;
import DataViewObjects = powerbi.DataViewObjects;
import DataViewValueColumn = powerbi.DataViewValueColumn;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import PrimitiveValue = powerbi.PrimitiveValue;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

const FORMATO_GENERAL = "#,0.##";
const FORMATO_RELATIVO = "+0.0%;-0.0%;0.0%";
const FORMATO_INDICE = "#,0";
const MARGEN = 8;
const OPACIDAD_NO_SELECCIONADO = 0.35;
const COLOR_LIMITE_ESTATAL = "#8a8886";
const COLOR_HALO = "#ffffff";
const COLOR_ETIQUETA_GRUPO = "#3b3a39";
// Una por base, de la paleta de Okabe e Ito (se distinguen con daltonismo).
const COLORES_BASES = ["#0072b2", "#e69f00", "#009e73", "#cc79a7"];
const POSITIVO = "#107c10";
const NEGATIVO = "#a4262c";
/** Filas como máximo en la tabla del panel. */
const MAX_FILAS_DETALLE = 50;
/** Áreas como máximo en la silueta del panel. */
const MAX_SILUETA = 300;
/** Textos distintos como máximo en una tarjeta, y áreas que se nombran en cada uno. */
const MAX_TEXTOS_TARJETA = 8;
const MAX_AREAS_TEXTO = 3;
/** Franja de color de cada grupo, por dentro de su contorno (px). */
const ANCHO_FRANJA = 4;
const LADO_BOTON = 26;
const SEPARACION_BOTONES = 4;
/** Cuánto se puede acercar desde la vista inicial: los municipios más chicos necesitan más. */
const ZOOM_MAXIMO: Record<Nivel, number> = { estado: 10, municipio: 40 };
/** Por debajo de esta escala, el encuadre de los datos no acerca (sería casi el país completo). */
const ESCALA_MINIMA_ENCUADRE = 1.12;
/** Margen alrededor de las áreas encuadradas (fracción de la vista, por lado). */
const MARGEN_ENCUADRE = 0.08;
/**
 * El mapa muestra "una parte del país" (y el panel puede abrirse solo) si las áreas con
 * datos son a lo más esta fracción de las que se dibujan, o si, siendo más, su
 * recuadro ocupa a lo más FRACCION_RECUADRO del recuadro del país.
 */
const FRACCION_PARCIAL = 0.6;
const FRACCION_RECUADRO = 0.45;
/** Líneas de agua: distancia a la costa (px) y opacidad, de la más lejana a la más cercana. */
const LINEAS_AGUA = [
    { distancia: 14, opacidad: 0.2 },
    { distancia: 8.5, opacidad: 0.36 },
    { distancia: 4, opacidad: 0.6 },
];
/** Hasta dónde llegan la retícula de meridianos y paralelos (la del fondo). */
const EXTENSION_RETICULA: [[number, number], [number, number]] = [[-150, -15], [-45, 58]];
const TINTA_MAR = "#16405a";
const TINTA_TIERRA = "#5f594f";
// Las claves de texto se escriben completas para que la prueba de traducciones las encuentre.
const NOTAS: Record<Agregacion, string> = {
    suma: "Panel_Suma",
    promedio: "Panel_Promedio",
    minimo: "Panel_Minimo",
    maximo: "Panel_Maximo",
    rango: "Panel_Rango",
};

/** Lo que trae una medida. Solo los números se combinan en el panel; un texto se muestra como lo dio DAX. */
type TipoDato = "numero" | "fecha" | "texto";

/** Una medida de Valor, Valor 2, Bases o Tarjetas, con lo que necesita el panel. */
interface Medida {
    nombre: string;
    formato: string | undefined;
    /** queryName de Power BI: identifica la medida en el panel de formato. */
    consulta: string;
    agregacion: Agregacion;
    tipo: TipoDato;
}

/** Sin valor: un BLANK, o un texto vacío (`IF ( …, [Medida], "" )` da "" en lugar de BLANK). */
const vacio = (v: PrimitiveValue | null | undefined): boolean => v === null || v === undefined || v === "";

/** La fecha de una celda: un Date, o lo que llegue en una columna con tipo fecha. */
function fechaDe(v: PrimitiveValue | null | undefined, columna: DataViewValueColumn): Date | null {
    if (vacio(v) || typeof v === "boolean") {
        return null;
    }
    const fecha = typeof v === "object" ? (v as Date) : columna.source.type?.dateTime ? new Date(v as string | number) : null;
    return fecha && !Number.isNaN(fecha.getTime()) ? fecha : null;
}

/**
 * Se decide por lo que llegó y no por el tipo declarado: una medida que devuelve
 * número o texto según el caso no tiene un tipo fijo en el modelo.
 */
function tipoDeColumna(c: DataViewValueColumn): TipoDato {
    const valores = [...c.values, ...(c.highlights ?? [])].filter((v) => !vacio(v));
    if (valores.length === 0) {
        return c.source.type?.text ? "texto" : c.source.type?.dateTime ? "fecha" : "numero";
    }
    if (valores.every((v) => fechaDe(v, c) !== null)) {
        return "fecha";
    }
    return valores.every((v) => typeof v === "number") ? "numero" : "texto";
}

/** Un área con datos: lo que Power BI mandó para su clave. */
interface Fila {
    clave: string;
    valor: number | null;
    texto: string;
    valor2: number | null;
    texto2: string;
    /** Un valor por medida de Bases y de Tarjetas, en su orden (una fecha va en milisegundos). */
    bases: Array<number | null>;
    tarjetas: Array<number | null>;
    /** Un texto ya formateado por tarjeta; null en las de números o fechas. */
    textos: Array<string | null>;
    grupo: string | null;
    /** Resaltado por otro visual (si no hay resaltado, todas lo están). Las demás quedan de fondo. */
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
    medidas: { valor: Medida | null; valor2: Medida | null; bases: Medida[]; tarjetas: Medida[] };
    /** Otro visual está resaltando una parte de los datos. */
    hayResaltado: boolean;
    /** Valores de Ubicación que no son una clave INEGI (se reportan en el mapa). */
    desconocidas: string[];
    /** Claves del otro nivel (estado entre municipios o al revés). */
    otroNivel: number;
    /** Claves XX000: datos que solo llegan a nivel estatal. */
    sinMunicipio: number;
    repetidas: string[];
    /** Lo que calculó DAX para un conjunto de áreas: el país (lo filtrado), cada región, cada estado con municipios. */
    totales: TotalDax[];
    /** El periodo de este cuadro de la línea del tiempo; null en el total o sin periodo. */
    periodo: string | null;
    nombrePeriodo: string | null;
}

/** Un total de DAX: la medida evaluada en el nodo de la matriz (no una suma del visual). */
interface TotalDax {
    nombre: string;
    general: boolean;
    claves: string[];
    fila: Fila;
}

/** Lo que colorea el mapa: Valor (o la primera base) o la diferencia entre las dos primeras bases. */
interface Serie {
    nombre: string;
    formato: string | undefined;
    de(f: Fila): number | null;
}

/** Cómo se colorea: una medida en clases, dos medidas en terciles (bivariado) o por grupo. */
interface Coloreado {
    color(a: Area): string;
    clasif: Clasificacion | null;
    colores: string[];
    /** Bivariado: tercil (0, 1, 2) de cada medida para un área con datos. */
    terciles(fila: Fila): [number, number] | null;
}

/** Un grupo (región) con datos: su color del tema, su contorno unido y dónde va su nombre. */
interface Grupo {
    nombre: string;
    color: string;
    claves: string[];
    forma: MultiPolygon | null;
    d: string;
    /** Punto para el nombre, en coordenadas del mapa sin zoom. */
    punto: [number, number] | null;
}

interface EntradaLeyenda {
    color: string;
    texto: string;
    /** Entradas de grupo: un clic selecciona todas sus áreas. */
    grupo?: string;
    /** La muestra es la franja de color del grupo, no un cuadro relleno. */
    franja?: boolean;
    /** Subtítulo de una sección de la leyenda. */
    seccion?: boolean;
}

/** Dónde van el mapa y el panel de detalle dentro del visual. */
interface Distribucion {
    mapa: Recuadro;
    panel: Recuadro | null;
    posicion: "derecha" | "abajo" | "encima";
}

/** Una etiqueta por colocar (en pantalla): su centro, su tamaño y qué tanto importa. */
interface Candidata {
    lineas: string[];
    x: number;
    y: number;
    ancho: number;
    alto: number;
    prioridad: number;
}

/** Caja y punto de un área para su etiqueta, en coordenadas sin zoom. */
interface Ancla {
    area: Area;
    caja: Caja;
    punto: [number, number] | null;
}

type Sel<E extends Element> = Selection<E, unknown, null, undefined>;

const esSinMunicipio = (clave: string): boolean => clave.length === 5 && clave.endsWith("000");

/** Recuadro de varias áreas (sin sus islas lejanas), en coordenadas del camino. */
function cajaDe(areas: Area[], camino: GeoPath): Caja {
    let caja: Caja | null = null;
    for (const a of areas) {
        const [[x0, y0], [x1, y1]] = camino.bounds(principal(a));
        caja = caja ? [[Math.min(caja[0][0], x0), Math.min(caja[0][1], y0)], [Math.max(caja[1][0], x1), Math.max(caja[1][1], y1)]] : [[x0, y0], [x1, y1]];
    }
    return caja ?? [[0, 0], [0, 0]];
}
const acotar = (x: number, min: number, max: number): number => Math.max(min, Math.min(max, x));
const transformar = (t: Transformacion): string => `translate(${t.x},${t.y}) scale(${t.k})`;

/** Lleva una clase de 1, 2 o 3 terciles a la escala 0-2 de la paleta bivariada. */
function tercil(c: Clasificacion, v: number): number {
    const i = c.claseDe(v);
    return c.numClases >= 3 ? i : c.numClases === 2 ? i * 2 : 1;
}

/** La opción "Al seleccionar varias áreas" que Power BI guarda en la columna de la medida. */
function agregacionDe(objetos: DataViewObjects | undefined, porDefecto: Agregacion): Agregacion {
    const v = objetos?.agregacion?.tipo;
    return typeof v === "string" && (AGREGACIONES as readonly string[]).includes(v) ? (v as Agregacion) : porDefecto;
}

/** La misma medida puesta en dos campos (por su queryName o, si no coincide, por su nombre). */
const mismaMedida = (a: Medida, b: Medida): boolean => a.consulta === b.consulta || a.nombre === b.nombre;

let instancias = 0;

export class Visual implements IVisual {
    private readonly host: IVisualHost;
    private readonly raiz: HTMLElement;
    private readonly seleccion: ISelectionManager;
    private readonly textos: Textos;
    private readonly servicioFormato: FormattingSettingsService;
    private readonly lienzo: Sel<HTMLDivElement>;
    private readonly svg: Sel<SVGSVGElement>;
    private readonly defs: Sel<SVGDefsElement>;
    private readonly mar: Sel<SVGRectElement>;
    private readonly capaMapa: Sel<SVGGElement>;
    private readonly capaFondo: Sel<SVGGElement>;
    private readonly reticula: Sel<SVGPathElement>;
    private readonly lineasAgua: Sel<SVGGElement>;
    private readonly tierra: Sel<SVGPathElement>;
    private readonly fronteras: Sel<SVGPathElement>;
    /** Estados sin datos en el nivel municipal: se dibujan de fondo. */
    private readonly capaContexto: Sel<SVGGElement>;
    private readonly capaAreas: Sel<SVGGElement>;
    private readonly limitesEstatales: Sel<SVGPathElement>;
    private readonly costa: Sel<SVGPathElement>;
    private readonly capaFranjas: Sel<SVGGElement>;
    private readonly haloGrupos: Sel<SVGPathElement>;
    private readonly contornoGrupos: Sel<SVGPathElement>;
    private readonly resaltado: Sel<SVGPathElement>;
    private readonly capaEtiquetas: Sel<SVGGElement>;
    private readonly capaLeyenda: Sel<SVGGElement>;
    private readonly aviso: Sel<SVGTextElement>;
    private readonly botonesZoom: Sel<HTMLDivElement>;
    private readonly mensaje: Sel<HTMLDivElement>;
    private readonly panel: Panel;
    private readonly lineaTiempo: LineaTiempo;
    /** Dónde va la línea del tiempo (null sin campo Periodo). */
    private cajaTiempo: Recuadro | null = null;
    private readonly zoom: Zoom;
    /** Prefijo de los id de los clipPath (único por copia del visual). */
    private readonly prefijo = `mx${++instancias}`;
    private ajustes = new Ajustes();
    /** El cuadro que se dibuja: un periodo de la línea del tiempo, o el total. */
    private datos: Datos | null = null;
    /** Un cuadro por periodo (vacío sin campo Periodo) y el total de los periodos (o el único cuadro). */
    private cuadros: Datos[] = [];
    private cuadroTotal: Datos | null = null;
    /** El periodo que se ve (-1: el total) y el rango que se reproduce. */
    private indicePeriodo = -1;
    private rangoPeriodos: [number, number] = [0, 0];
    private firmaPeriodos = "";
    private temporizador: ReturnType<typeof setInterval> | null = null;
    private modo: ModoColor = "valor";
    private serieColor: Serie | null = null;
    private coloreado: Coloreado | null = null;
    private grupos: Grupo[] = [];
    /** Se dibujan las franjas de color de los grupos (y su sección en la leyenda). */
    private hayFranjas = false;
    private firmaGrupos = "";
    private readonly formasGrupo = new Map<string, MultiPolygon>();
    private firmaGeometria = "";
    private viewport: powerbi.IViewport | null = null;
    private distribucion: Distribucion | null = null;
    private panelAbierto = false;
    /** Las áreas del panel, calculadas una vez por dibujo o por cambio de selección. */
    private focoActual: Fila[] = [];
    /** Las opciones del panel tal como las guardó Power BI (para la opción anterior "Mostrar sin selección"). */
    private objetosPanel: DataViewObjects[string] | undefined;
    /** El mapa muestra solo una parte del país (un filtro dejó pocas áreas con datos). */
    private parcial = false;
    /** Firma de los datos con la que se ocultó el panel con su botón (vuelve si cambian). */
    private panelOculto = "";
    private proyeccion: GeoProjection | null = null;
    private camino: GeoPath | null = null;
    private visibles: Area[] = [];
    /** Hay áreas dibujadas en color "Sin dato" (para la leyenda). */
    private haySinDato = false;
    private anclas: Ancla[] = [];
    private firmaAnclas = "";
    /** Las áreas encuadradas: si cambian (un filtro), el mapa va al encuadre nuevo. */
    private firmaFoco = "";
    private firmaProyeccion = "";
    private firmaFondo = "";
    /** Recuadro de la leyenda: las etiquetas del mapa no se le encima. */
    private cajaLeyenda: Recuadro | null = null;
    /** Transformación con la que se colocaron las etiquetas (durante un gesto se estiran). */
    private tEtiquetas: Transformacion = IDENTIDAD;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.raiz = options.element;
        const gestorIdioma = this.host.createLocalizationManager();
        this.textos = new Textos(gestorIdioma);
        this.servicioFormato = new FormattingSettingsService(gestorIdioma);
        this.seleccion = this.host.createSelectionManager();
        // Selecciones que llegan de fuera (un marcador): igual que un clic en el mapa.
        this.seleccion.registerOnSelectCallback(() => this.aplicarSeleccion(true));

        const raiz = select(this.raiz).classed("mapa-raiz", true);
        this.lienzo = raiz.append("div").classed("lienzo", true);
        this.svg = this.lienzo.append("svg").classed("mapa-mx", true);
        this.defs = this.svg.append("defs");
        // El mar cubre la vista entera: el zoom nunca sale del recuadro del país.
        this.mar = this.svg.append("rect").classed("mar", true).attr("x", 0).attr("y", 0);
        // Todo lo que se acerca con el zoom va en esta capa.
        this.capaMapa = this.svg.append("g").classed("capa-mapa", true);
        // Fondo, de abajo hacia arriba: retícula, líneas de agua, países vecinos y sus fronteras.
        this.capaFondo = this.capaMapa.append("g").classed("fondo", true).attr("aria-hidden", "true");
        this.reticula = this.capaFondo.append("path").classed("reticula", true).attr("fill", "none");
        this.lineasAgua = this.capaFondo.append("g").classed("lineas-agua", true);
        this.tierra = this.capaFondo.append("path").classed("tierra", true);
        this.fronteras = this.capaFondo.append("path").classed("fronteras", true).attr("fill", "none");
        this.capaContexto = this.capaMapa.append("g").classed("contexto", true).attr("aria-hidden", "true");
        this.capaAreas = this.capaMapa.append("g").classed("areas", true);
        // Capas de líneas (fill="none" también como atributo, por si la hoja de estilos no carga)
        this.limitesEstatales = this.capaMapa.append("path").classed("limites-estatales", true).attr("fill", "none");
        this.costa = this.capaMapa.append("path").classed("costa", true).attr("fill", "none");
        this.capaFranjas = this.capaMapa.append("g").classed("franjas-grupo", true);
        this.haloGrupos = this.capaMapa.append("path").classed("halo-grupos", true).attr("fill", "none");
        this.contornoGrupos = this.capaMapa.append("path").classed("contorno-grupos", true).attr("fill", "none");
        this.resaltado = this.capaMapa.append("path").classed("resaltado", true).attr("fill", "none").style("display", "none");
        this.capaEtiquetas = this.svg.append("g").classed("etiquetas", true);
        this.capaLeyenda = this.svg.append("g").classed("leyenda", true);
        this.aviso = this.svg.append("text").classed("aviso", true);
        this.botonesZoom = this.lienzo.append("div").classed("zoom-botones", true).attr("role", "group").style("display", "none");
        this.panel = new Panel(raiz, {
            cerrar: () => this.cerrarPanel(),
            elegir: (clave, multiple) => {
                const fila = this.datos?.filas.get(clave);
                if (fila && this.interactivo()) {
                    this.seleccion.select(fila.id, multiple).then(() => this.aplicarSeleccion(true));
                }
            },
            senalar: (clave) => this.senalar(clave),
        });
        this.lineaTiempo = new LineaTiempo(raiz, {
            alternar: () => this.alternarReproduccion(),
            irA: (i) => {
                if (i < 0) {
                    this.detener();
                }
                this.irAPeriodo(i);
            },
            fijarRango: (inicio, fin) => this.fijarRango(inicio, fin),
        });
        this.mensaje = raiz.append("div").classed("mensaje", true);
        this.zoom = new Zoom(this.svg.node() as SVGSVGElement, (t, fin) => this.alHacerZoom(t, fin));
        this.crearBotonesZoom();

        // Clic en el fondo: quitar la selección. Clic derecho: menú contextual de Power BI.
        this.svg.on("click", () => this.limpiarSeleccion());
        this.svg.on("contextmenu", (evento: MouseEvent) => {
            this.seleccion.showContextMenu({} as ISelectionId, { x: evento.clientX, y: evento.clientY });
            evento.preventDefault();
        });
        raiz.on("keydown", (evento: KeyboardEvent) => this.alTeclear(evento));

        // Eventos de las áreas, delegados en su capa: un manejador para miles de municipios.
        this.capaAreas
            .on("click", (evento: MouseEvent) => {
                const area = this.areaDe(evento.target);
                // Un área de fondo es como el fondo: el clic quita la selección.
                if (!area || this.esFondo(area)) {
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
                if (area && !this.esFondo(area)) {
                    this.mostrarTooltip(evento, area, false);
                }
            })
            .on("pointermove", (evento: PointerEvent) => {
                const area = this.areaDe(evento.target);
                if (area && !this.esFondo(area)) {
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
            this.objetosPanel = dataView?.metadata?.objects?.panel;
            this.cargar(dataView);
            this.prepararAjustes();
            this.viewport = options.viewport;
            this.dibujar(options.viewport.width, options.viewport.height);
            eventos.renderingFinished(options);
        } catch (error) {
            eventos.renderingFailed(options, String(error));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.servicioFormato.buildFormattingModel(this.ajustes);
    }

    public destroy(): void {
        this.detener();
    }

    // ------------------------------------------------------------------ datos

    /**
     * Lee la matriz y arma un cuadro por periodo. Si los periodos son los mismos (cambió
     * otro filtro), conserva el periodo que se veía y el rango; si no, vuelve al total.
     */
    private cargar(dataView: DataView | undefined): void {
        const lectura = leerMatriz(dataView?.matrix, (v, fuente) => this.texto(v, this.formateador(fuente.format)));
        if (!lectura) {
            this.cuadros = [];
            this.cuadroTotal = null;
            this.datos = null;
            this.detener();
            return;
        }
        // La identidad de un área es su camino en la matriz: región y ubicación.
        const ids = lectura.filas.map((f) => f.nodos
            .reduce((b, nodo) => b.withMatrixNode(nodo, lectura.niveles), this.host.createSelectionIdBuilder())
            .createSelectionId());
        if (lectura.fuentePeriodo) {
            this.cuadros = lectura.cuadros.map((c) => this.leerDatos(lectura, c, ids));
            this.cuadroTotal = lectura.totalPeriodos ? this.leerDatos(lectura, lectura.totalPeriodos, ids) : null;
        } else {
            this.cuadros = [];
            this.cuadroTotal = this.leerDatos(lectura, lectura.cuadros[0], ids);
        }
        const firma = this.cuadros.map((d) => d.periodo).join("\u0001");
        if (firma !== this.firmaPeriodos) {
            this.firmaPeriodos = firma;
            this.detener();
            this.rangoPeriodos = [0, Math.max(0, this.cuadros.length - 1)];
            this.indicePeriodo = this.cuadroTotal || this.cuadros.length === 0 ? -1 : this.cuadros.length - 1;
        }
        this.datos = this.indicePeriodo >= 0 ? this.cuadros[this.indicePeriodo] ?? null : this.cuadroTotal;
    }

    /**
     * Lee un cuadro de la matriz (un periodo, o el total) por rol: Ubicación, Región,
     * Valor, Valor 2, Bases, Tarjetas y Tooltips, nunca por nombre. Si Ubicación es una
     * jerarquía (drill-down), las áreas son el nivel más profundo. `ids` es la identidad
     * de cada fila: la misma en todos los cuadros, para que la selección siga al periodo.
     */
    private leerDatos(lectura: LecturaMatriz, cuadro: Cuadro, ids: ISelectionId[]): Datos {
        const n = lectura.filas.length;
        const columnas = lectura.medidas.map((source, m): DataViewValueColumn => {
            const celdas = cuadro.celdas[m] ?? [];
            return {
                source,
                // Power BI manda null en una celda vacía, aunque el tipo diga lo contrario.
                values: celdas.map((c) => c?.valor ?? null) as PrimitiveValue[],
                ...(lectura.hayResaltado ? { highlights: celdas.map((c) => c?.resalte ?? null) as PrimitiveValue[] } : {}),
            };
        });
        const colValor = columnas.find((c) => c.source.roles?.valor);
        const colValor2 = columnas.find((c) => c.source.roles?.valor2);
        const colBases = columnas.filter((c) => c.source.roles?.bases);
        const colTarjetas = columnas.filter((c) => c.source.roles?.tarjetas);
        const colTooltips = columnas.filter((c) => c.source.roles?.tooltips);
        // Otro visual resalta una parte (un clic en una tabla, por ejemplo): Power BI manda,
        // junto a cada medida, su valor con ese resaltado.
        const hayResaltado = lectura.hayResaltado;
        // Un texto fijo (el Top 3 de toda la región) también llega en lo no resaltado: deciden las cifras.
        const conCifras = columnas.filter((c) => tipoDeColumna(c) === "numero");
        const testigos = conCifras.length > 0 ? conCifras : columnas;
        const exacto = this.formateador(colValor?.source.format);
        const exacto2 = this.formateador(colValor2?.source.format);
        const formatosExtra = colTooltips.map((c) => this.formateador(c.source.format));
        const tiposTarjetas = colTarjetas.map(tipoDeColumna);
        const formatosTarjetas = colTarjetas.map((c) => this.formateador(c.source.format));
        const numero = (v: PrimitiveValue | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

        // Las bases se suman por omisión (son volúmenes de cada fuente). Una medida en dos campos es una sola.
        const consultaDe = (c: DataViewValueColumn): string => c.source.queryName ?? c.source.displayName;
        const enBases = new Set(colBases.flatMap((c) => [consultaDe(c), c.source.displayName]));
        const medida = (c: DataViewValueColumn, tipo: TipoDato = "numero"): Medida => ({
            nombre: c.source.displayName,
            formato: c.source.format,
            consulta: consultaDe(c),
            agregacion: tipo === "numero"
                ? agregacionDe(c.source.objects, enBases.has(consultaDe(c)) || enBases.has(c.source.displayName) ? "suma" : "rango")
                : "rango",
            tipo,
        });

        // El nivel lo decide la mayoría de claves válidas: 2 dígitos = estado, 5 = municipio.
        const claves = lectura.filas.map((f) => normalizarClave(f.clave));
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
            nombreGrupo: lectura.fuenteGrupo?.displayName ?? null,
            medidas: {
                valor: colValor ? medida(colValor) : null,
                valor2: colValor2 ? medida(colValor2) : null,
                bases: colBases.map((c) => medida(c)),
                tarjetas: colTarjetas.map((c, j) => medida(c, tiposTarjetas[j])),
            },
            hayResaltado,
            desconocidas: [],
            otroNivel: 0,
            sinMunicipio: 0,
            repetidas: [],
            totales: [],
            periodo: cuadro.periodo,
            nombrePeriodo: lectura.fuentePeriodo?.displayName ?? null,
        };
        // Una fila con los valores de la posición i (un área, o un total de DAX al final).
        const filaEn = (i: number, clave: string, grupoBruto: PrimitiveValue | null, resaltado: boolean, id: ISelectionId): Fila => {
            const de = (c: DataViewValueColumn | undefined): PrimitiveValue | undefined =>
                (c && hayResaltado && resaltado && c.highlights ? c.highlights[i] : c?.values[i]);
            const valor = numero(de(colValor));
            const valor2 = numero(de(colValor2));
            return {
                clave,
                valor,
                texto: valor === null ? this.textos.t("Texto_SinDato") : exacto(valor),
                valor2,
                texto2: valor2 === null ? this.textos.t("Texto_SinDato") : exacto2(valor2),
                bases: colBases.map((c) => numero(de(c))),
                tarjetas: colTarjetas.map((c, j) => (tiposTarjetas[j] === "fecha" ? fechaDe(de(c), c)?.getTime() ?? null : numero(de(c)))),
                textos: colTarjetas.map((c, j) => (tiposTarjetas[j] === "texto" ? this.texto(de(c), formatosTarjetas[j]) || null : null)),
                grupo: grupoBruto === null || grupoBruto === undefined || grupoBruto === "" ? null : String(grupoBruto),
                resaltado,
                extras: colTooltips.map((c, j) => ({ displayName: c.source.displayName, value: this.texto(de(c), formatosExtra[j]) })),
                id,
            };
        };
        const aceptadas: Array<string | null> = claves.map(() => null);
        claves.forEach((clave, i) => {
            const bruto = lectura.filas[i].clave;
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
            // Las áreas resaltadas usan los valores resaltados; las demás conservan los suyos (quedan de fondo).
            const resaltado = !hayResaltado || testigos.some((c) => !vacio(c.highlights?.[i]));
            datos.filas.set(clave, filaEn(i, clave, lectura.filas[i].grupo, resaltado, ids[i]));
            datos.estadosCubiertos.add(clave.slice(0, 2));
            aceptadas[i] = clave;
        });
        // Con un resaltado, el total de DAX también es el del resaltado.
        lectura.totales.forEach((t, k) => {
            const cubiertas = t.filas.map((i) => aceptadas[i]).filter((c): c is string => c !== null);
            if (cubiertas.length === 0) {
                return;
            }
            const nombre = t.tipo === "general" ? "" : t.tipo === "grupo" ? String(t.valor ?? "")
                : capa("estado").porClave.get(normalizarClave(t.valor) ?? "")?.nombre ?? String(t.valor ?? "");
            datos.totales.push({ nombre, general: t.tipo === "general", claves: cubiertas, fila: filaEn(n + k, "", null, true, ids[0]) });
        });
        return datos;
    }

    /** Decide qué colorea el mapa y qué tarjetas y opciones muestra el panel de formato. */
    private prepararAjustes(): void {
        const d = this.datos;
        const a = this.ajustes;
        const hayComparacion = (d?.medidas.bases.length ?? 0) >= 2;
        const hayGrupo = Boolean(d?.nombreGrupo);
        this.modo = this.resolverModo();
        this.serieColor = this.serie();
        a.colores.modo = this.modo;
        a.colores.hayComparacion = hayComparacion;
        a.colores.hayGrupo = hayGrupo;
        a.bivariado.visible = this.modo === "bivariado";
        a.grupos.visible = hayGrupo;
        a.panel.hayComparacion = hayComparacion;
        a.tiempo.visible = this.cuadros.length > 0;
        // Solo las bases se combinan (y solo cuando DAX no trae el total); las tarjetas muestran lo que da DAX.
        const unicas = new Map(this.medidasPanel().bases.map((m) => [m.consulta, m]));
        a.agregacion.definir(a.panel.mostrar.value ? [...unicas.values()] : []);
    }

    private resolverModo(): ModoColor {
        const d = this.datos;
        const elegido = String(this.ajustes.colores.colorearPor.value?.value ?? "valor");
        if (elegido === "grupo" && d?.nombreGrupo) {
            return "grupo";
        }
        if ((elegido === "diferencia" || elegido === "relativa") && (d?.medidas.bases.length ?? 0) >= 2) {
            return elegido;
        }
        return d?.nombreValor && d.nombreValor2 ? "bivariado" : "valor";
    }

    private serie(): Serie | null {
        const d = this.datos;
        if (!d) {
            return null;
        }
        const [b0, b1] = d.medidas.bases;
        if (this.modo === "diferencia") {
            return { nombre: `${b0.nombre} − ${b1.nombre}`, formato: b0.formato, de: (f) => comparar(f.bases[0], f.bases[1])?.diferencia ?? null };
        }
        if (this.modo === "relativa") {
            return {
                nombre: this.textos.t("Texto_VsPorcentaje", b0.nombre, b1.nombre),
                formato: FORMATO_RELATIVO,
                de: (f) => comparar(f.bases[0], f.bases[1])?.relativa ?? null,
            };
        }
        if (d.nombreValor) {
            return { nombre: d.nombreValor, formato: d.formatoValor, de: (f) => f.valor };
        }
        // Sin Valor, el mapa se colorea con la primera base.
        return b0 ? { nombre: b0.nombre, formato: b0.formato, de: (f) => f.bases[0] } : null;
    }

    /** Las medidas del panel: las bases y las tarjetas (sin tarjetas, Valor y Valor 2). */
    private medidasPanel(): { bases: Medida[]; tarjetas: Medida[] } {
        const m = this.datos?.medidas;
        if (!m) {
            return { bases: [], tarjetas: [] };
        }
        const tarjetas = m.tarjetas.length > 0
            ? m.tarjetas
            : [m.valor, m.valor2].filter((x): x is Medida => x !== null && !m.bases.some((b) => mismaMedida(b, x)));
        return { bases: m.bases, tarjetas };
    }

    private valorDe(f: Fila, m: Medida): number | null {
        const medidas = this.datos?.medidas;
        const i = medidas?.bases.indexOf(m) ?? -1;
        if (i >= 0) {
            return f.bases[i];
        }
        const j = medidas?.tarjetas.indexOf(m) ?? -1;
        if (j >= 0) {
            return f.tarjetas[j];
        }
        return m === medidas?.valor ? f.valor : m === medidas?.valor2 ? f.valor2 : null;
    }

    /** Formatea con la cadena de formato de la propia medida, como lo haría Power BI. */
    private formateador(formato: string | undefined): (v: number | Date) => string {
        const f = valueFormatter.create({ format: formato ?? FORMATO_GENERAL, cultureSelector: this.host.locale });
        return (v: number | Date) => (typeof v === "number" || formato ? f.format(v) : v.toLocaleDateString(this.host.locale));
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

    private texto(valor: PrimitiveValue | null | undefined, formatear: (v: number | Date) => string): string {
        if (valor === null || valor === undefined) {
            return "";
        }
        if (typeof valor === "boolean") {
            return this.textos.t(valor ? "Texto_Si" : "Texto_No");
        }
        return typeof valor === "string" ? valor : formatear(valor);
    }

    /** Diferencia con signo; entre dos porcentajes, en puntos porcentuales. */
    private textoDiferencia(v: number, formato: string | undefined): string {
        const signo = v > 0 ? "+" : "";
        if (formato?.includes("%")) {
            const pp = new Intl.NumberFormat(this.host.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v * 100);
            return `${signo}${pp} ${this.textos.t("Unidad_Pp")}`;
        }
        return `${signo}${this.compacto(formato)(v)}`;
    }

    // ----------------------------------------------------------------- dibujo

    private crearProyeccion(): GeoProjection {
        return String(this.ajustes.mapa.proyeccion.value?.value ?? "lambert") === "mercator"
            ? geoMercator()
            : geoConicConformal().parallels([17.5, 29.5]).rotate([102, 0]); // la misma que usa INEGI
    }

    /** El total y los periodos (o el único cuadro). */
    private todosLosCuadros(): Datos[] {
        return [...(this.cuadroTotal ? [this.cuadroTotal] : []), ...this.cuadros];
    }

    /**
     * Las filas de las que salen las clases: lo que se ve (con un resaltado, lo
     * resaltado). En un periodo, con escala común, las de todos los periodos: así un
     * color significa lo mismo en enero y en junio.
     */
    private muestraEscala(): Fila[] {
        const enFoco = (d: Datos | null): Fila[] => (d ? [...d.filas.values()].filter((f) => f.resaltado) : []);
        const comun = String(this.ajustes.tiempo.escala.value?.value ?? "comun") === "comun";
        return this.indicePeriodo >= 0 && comun ? this.cuadros.flatMap(enFoco) : enFoco(this.datos);
    }

    private colorear(sinDato: string): Coloreado {
        const datos = this.datos;
        const filas = this.muestraEscala();
        const c = this.ajustes.colores;
        if (this.modo === "bivariado") {
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
        if (this.modo === "grupo") {
            const colores = new Map(this.grupos.map((g) => [g.nombre, g.color]));
            return {
                clasif: null,
                colores: [],
                terciles: () => null,
                color: (a) => colores.get(datos?.filas.get(a.clave)?.grupo ?? "") ?? sinDato,
            };
        }
        const serie = this.serieColor;
        const valorDe = (f: Fila | undefined): number | null => (f && serie ? serie.de(f) : null);
        // Una diferencia siempre se pinta alrededor de un centro.
        const metodo = this.modo === "valor" ? (c.metodo.value?.value ?? "cuantiles") as Metodo : "divergente";
        const clasif = clasificar(filas.map(valorDe).filter((v): v is number => v !== null), {
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
                const v = valorDe(datos?.filas.get(a.clave));
                return v !== null ? colores[clasif.claseDe(v)] : sinDato;
            },
        };
    }

    /** El mapa ocupa todo el visual; con el panel abierto, le cede un lado (o el panel flota encima). */
    private distribuir(ancho: number, alto: number, conPanel: boolean): Distribucion {
        const completo: Recuadro = { x: 0, y: 0, ancho, alto };
        if (!conPanel) {
            return { mapa: completo, panel: null, posicion: "derecha" };
        }
        const p = this.ajustes.panel;
        const fraccion = acotar(p.tamano.value, 20, 70) / 100;
        let posicion = String(p.posicion.value?.value ?? "auto");
        if (posicion === "auto") {
            posicion = ancho < 420 && alto < 420 ? "encima" : ancho >= alto * 1.15 ? "derecha" : "abajo";
        }
        if (posicion === "abajo") {
            const h = Math.round(acotar(alto * fraccion, Math.min(150, alto * 0.6), 420));
            return { mapa: { x: 0, y: 0, ancho, alto: alto - h }, panel: { x: 0, y: alto - h, ancho, alto: h }, posicion: "abajo" };
        }
        if (posicion === "encima") {
            // Flota sobre el mapa sin achicarlo; en un visual chico lo cubre por completo.
            if (ancho < 420) {
                return { mapa: completo, panel: completo, posicion: "encima" };
            }
            const w = Math.round(acotar(ancho * fraccion, 240, ancho - 2 * MARGEN));
            return { mapa: completo, panel: { x: ancho - MARGEN - w, y: MARGEN, ancho: w, alto: alto - 2 * MARGEN }, posicion: "encima" };
        }
        const w = Math.round(acotar(ancho * fraccion, Math.min(220, ancho * 0.6), 480));
        return { mapa: { x: 0, y: 0, ancho: ancho - w, alto }, panel: { x: ancho - w, y: 0, ancho: w, alto }, posicion: "derecha" };
    }

    private dibujar(ancho: number, alto: number): void {
        const previo = this.distribucion?.mapa;
        const datos = this.datos;
        const nivel: Nivel = datos?.nivel ?? "estado";
        const geo = capa(nivel);
        // En municipios solo se dibujan los estados que traen datos (al hacer drill-down a
        // un estado, el mapa se acerca a él); los demás estados quedan de fondo.
        const visibles = nivel === "municipio" && datos ? geo.areas.filter((a) => datos.estadosCubiertos.has(a.estado)) : geo.areas;
        this.visibles = visibles;
        // Las áreas en foco: las que tienen datos o, si otro visual resalta, las resaltadas.
        // Con la línea del tiempo, las de cualquier periodo: el encuadre no salta al reproducir.
        const foco = [...new Set(this.todosLosCuadros().flatMap((d) => [...d.filas.values()].filter((f) => f.resaltado).map((f) => f.clave)))];
        this.parcial = this.esParcial(foco, visibles, nivel);
        this.focoActual = this.foco();
        this.panelAbierto = this.debeAbrirPanel(this.focoActual);
        // La línea del tiempo va abajo, a todo lo ancho; el mapa y el panel se reparten el resto.
        const conTiempo = this.cuadros.length > 0 && alto > ALTO_TIEMPO * 3;
        this.cajaTiempo = conTiempo ? { x: 0, y: alto - ALTO_TIEMPO, ancho, alto: ALTO_TIEMPO } : null;
        const distribucion = this.distribuir(ancho, conTiempo ? alto - ALTO_TIEMPO : alto, this.panelAbierto);
        this.distribucion = distribucion;
        const { ancho: anchoMapa, alto: altoMapa } = distribucion.mapa;
        this.lienzo
            .style("left", `${distribucion.mapa.x}px`)
            .style("top", `${distribucion.mapa.y}px`)
            .style("width", `${anchoMapa}px`)
            .style("height", `${altoMapa}px`);
        this.svg.attr("width", anchoMapa).attr("height", altoMapa);

        const ajustes = this.ajustes;
        const paleta = this.host.colorPalette;
        const altoContraste = paleta.isHighContrast;
        const colorTexto = altoContraste ? paleta.foreground.value : null;

        const sinDato = altoContraste ? paleta.background.value : ajustes.colores.sinDato.value.value;
        const fuera = altoContraste ? paleta.background.value : ajustes.colores.fueraDeFiltro.value.value;
        const borde = altoContraste ? paleta.foreground.value : ajustes.mapa.borde.value.value;

        // La proyección siempre abarca el país entero y el encuadre de los datos lo hace
        // el zoom: así se puede alejar hasta ver todo el país.
        const nombreProyeccion = String(ajustes.mapa.proyeccion.value?.value ?? "lambert");
        const proyeccion = this.crearProyeccion();
        proyeccion.fitExtent(
            [[MARGEN, MARGEN], [Math.max(MARGEN + 1, anchoMapa - MARGEN), Math.max(MARGEN + 1, altoMapa - MARGEN)]],
            { type: "FeatureCollection", features: capa("estado").areas.map((a) => a.forma) },
        );
        const camino = geoPath(proyeccion);
        const proyeccionAnterior = this.proyeccion;
        this.proyeccion = proyeccion;
        this.camino = camino;

        // El trazo de las áreas solo se recalcula si cambia la geometría.
        const firmaProyeccion = [nombreProyeccion, anchoMapa, altoMapa].join("|");
        const firma = [nivel, firmaProyeccion, nivel === "municipio" ? [...(datos?.estadosCubiertos ?? [])].sort().join(",") : ""].join("|");
        const geometriaNueva = firma !== this.firmaGeometria;
        this.firmaGeometria = firma;
        this.ajustarVista(foco, nivel, proyeccionAnterior, previo, firmaProyeccion);

        this.prepararGrupos(altoContraste);
        const coloreado = this.colorear(sinDato);
        this.coloreado = coloreado;

        const conGrupo = Boolean(datos?.nombreGrupo);
        const sinLimitesInternos = conGrupo && !ajustes.grupos.limitesInternos.value;
        const grosor = Math.max(0, ajustes.mapa.grosor.value) * (nivel === "municipio" ? 0.5 : 1);
        const interactivo = this.interactivo();
        const relleno = (a: Area): string => (this.esFondo(a) ? fuera : coloreado.color(a));

        const seleccionAreas = this.capaAreas.selectAll<SVGPathElement, Area>("path.area").data(visibles, (a) => a.clave);
        seleccionAreas.exit().remove();
        const nuevas = seleccionAreas.enter().append("path").classed("area", true);
        (geometriaNueva ? nuevas.merge(seleccionAreas) : nuevas).attr("d", (a) => camino(a.forma) ?? "");
        nuevas.merge(seleccionAreas)
            .classed("con-dato", (a) => datos?.filas.has(a.clave) ?? false)
            .classed("de-fondo", (a) => this.esFondo(a))
            .attr("fill", relleno)
            // Sin límites internos, el trazo del mismo color tapa las rendijas entre áreas.
            .attr("stroke", (a) => (sinLimitesInternos && !this.esFondo(a) ? relleno(a) : borde))
            .attr("stroke-width", sinLimitesInternos ? 0.6 : grosor)
            .attr("tabindex", (a) => (interactivo && datos?.filas.has(a.clave) ? 0 : -1))
            .attr("aria-label", (a) => this.etiquetaDe(a));
        this.haySinDato = visibles.some((a) => !this.esFondo(a) && this.valorColor(a) === null);

        // Nivel municipal: los estados sin datos, de fondo, para ver dónde está lo que se muestra.
        const contexto = nivel === "municipio" && datos ? capa("estado").areas.filter((a) => !datos.estadosCubiertos.has(a.clave)) : [];
        const seleccionContexto = this.capaContexto.selectAll<SVGPathElement, Area>("path").data(contexto, (a) => a.clave);
        seleccionContexto.exit().remove();
        const nuevosContexto = seleccionContexto.enter().append("path");
        (geometriaNueva ? nuevosContexto.merge(seleccionContexto) : nuevosContexto).attr("d", (a) => camino(a.forma) ?? "");
        nuevosContexto.merge(seleccionContexto).attr("fill", fuera).attr("stroke", borde).attr("stroke-width", Math.max(0, ajustes.mapa.grosor.value));

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

        this.dibujarFondo(anchoMapa, altoMapa);
        this.dibujarFranjas(altoContraste);
        if (datos && conGrupo && ajustes.grupos.contorno.value) {
            // Contorno donde cambia el grupo, calculado con los datos de este momento. Lo que
            // otro visual dejó de fondo cuenta como sin grupo: entre dos áreas de fondo no hay línea.
            const grupoDe = (k: string): string | null => {
                const fila = datos.filas.get(k);
                return fila?.resaltado ? fila.grupo : null;
            };
            // Con el mar de fondo la costa ya se ve: el contorno solo separa regiones.
            const conCosta = !this.conFondo();
            const lineas = bordes(geo, (a, b) => {
                const ga = grupoDe(a);
                if (b === null) {
                    return ga !== null && conCosta;
                }
                const gb = grupoDe(b);
                return ga !== gb && (ga !== null || gb !== null);
            });
            const trazo = camino(lineas) ?? "";
            const grosorContorno = Math.max(0, ajustes.grupos.grosor.value);
            // Un halo claro bajo el contorno lo separa también sobre los colores oscuros.
            this.haloGrupos
                .attr("d", trazo)
                .attr("stroke", altoContraste ? paleta.background.value : COLOR_HALO)
                .attr("stroke-width", grosorContorno > 0 ? grosorContorno + 2.5 : 0)
                .style("display", null);
            this.contornoGrupos
                .attr("d", trazo)
                .attr("stroke", altoContraste ? paleta.foreground.value : ajustes.grupos.color.value.value)
                .attr("stroke-width", grosorContorno)
                .style("display", null);
        } else {
            this.haloGrupos.style("display", "none");
            this.contornoGrupos.style("display", "none");
        }

        this.resaltado.style("display", "none");
        this.atenuar();
        // La leyenda va antes que las etiquetas, que la esquivan.
        if (this.modo === "bivariado") {
            this.dibujarLeyendaBivariada(sinDato, borde, anchoMapa, altoMapa, colorTexto);
        } else {
            this.dibujarLeyenda(coloreado, sinDato, borde, anchoMapa, altoMapa, colorTexto);
        }
        this.dibujarEtiquetas();
        this.dibujarAviso(anchoMapa, colorTexto);
        this.dibujarMensaje();
        this.dibujarPanel();
        this.dibujarTiempo();
        this.actualizarBotonesZoom();
    }

    // ------------------------------------------------------- línea del tiempo

    private dibujarTiempo(): void {
        const caja = this.cajaTiempo;
        if (!caja) {
            this.lineaTiempo.ocultar();
            return;
        }
        const t = this.textos;
        this.lineaTiempo.dibujar({
            periodos: this.cuadros.map((d) => d.periodo ?? ""),
            actual: this.indicePeriodo,
            rango: this.rangoPeriodos,
            reproduciendo: this.temporizador !== null,
            hayTotal: this.cuadroTotal !== null,
            interactivo: this.interactivo(),
        }, {
            region: t.t("Tiempo_Region"),
            reproducir: t.t("Tiempo_Reproducir"),
            pausar: t.t("Tiempo_Pausar"),
            total: t.t("Tiempo_Total"),
            totalDesc: t.t("Tiempo_TotalDesc", this.cuadros.length),
            inicio: t.t("Tiempo_Inicio"),
            fin: t.t("Tiempo_Fin"),
            periodo: t.t("Tiempo_Periodo"),
        }, caja, acotar(this.ajustes.panel.tamanoTexto.value, 9, 18));
    }

    /** Muestra un periodo (-1: el total de los periodos). */
    private irAPeriodo(i: number): void {
        const datos = i >= 0 ? this.cuadros[i] : this.cuadroTotal;
        if (!datos || !this.viewport) {
            return;
        }
        this.indicePeriodo = i;
        this.datos = datos;
        this.dibujar(this.viewport.width, this.viewport.height);
    }

    /** Reproduce el rango desde su inicio (o desde el periodo que se ve) o lo pausa. */
    private alternarReproduccion(): void {
        if (this.temporizador !== null) {
            this.detener();
            this.dibujarTiempo();
            return;
        }
        const [inicio, fin] = this.rangoPeriodos;
        const segundos = acotar(this.ajustes.tiempo.velocidad.value, 0.2, 10);
        this.temporizador = setInterval(() => this.avanzar(), segundos * 1000);
        if (this.indicePeriodo < inicio || this.indicePeriodo >= fin) {
            this.irAPeriodo(inicio);
        } else {
            this.dibujarTiempo();
        }
    }

    private avanzar(): void {
        const [inicio, fin] = this.rangoPeriodos;
        let i = this.indicePeriodo + 1;
        if (i > fin) {
            if (!this.ajustes.tiempo.repetir.value) {
                this.detener();
                this.dibujarTiempo();
                return;
            }
            i = inicio;
        }
        this.irAPeriodo(i);
    }

    private detener(): void {
        if (this.temporizador !== null) {
            clearInterval(this.temporizador);
            this.temporizador = null;
        }
    }

    /** Cambia el rango que se reproduce; si el periodo que se ve queda fuera, va al extremo más cercano. */
    private fijarRango(inicio: number, fin: number): void {
        this.rangoPeriodos = [inicio, fin];
        const i = this.indicePeriodo;
        if (i >= 0 && (i < inicio || i > fin)) {
            this.irAPeriodo(i < inicio ? inicio : fin);
        } else {
            this.dibujarTiempo();
        }
    }

    /**
     * Vista inicial y zoom: el mapa encuadra las áreas en foco. Si cambian (un filtro o
     * un resaltado), va de la vista actual al encuadre nuevo; si solo cambia el tamaño
     * (se abrió el panel), conserva lo que se veía, salvo que estuviera en la vista inicial.
     */
    private ajustarVista(foco: string[], nivel: Nivel, proyeccionAnterior: GeoProjection | null, previo: Recuadro | undefined, firmaProyeccion: string): void {
        const caja = this.distribucion?.mapa;
        if (!caja) {
            return;
        }
        const ajustes = this.ajustes;
        const proyeccionNueva = firmaProyeccion !== this.firmaProyeccion;
        const mismoTipo = this.firmaProyeccion.split("|")[0] === firmaProyeccion.split("|")[0];
        // Una vista de antes llevada a la proyección nueva: mismo centro y misma escala.
        const llevar = (t: Transformacion): Transformacion | null => {
            if (!proyeccionNueva) {
                return t;
            }
            const centro = mismoTipo && previo && proyeccionAnterior?.invert
                ? proyeccionAnterior.invert([(previo.ancho / 2 - t.x) / t.k, (previo.alto / 2 - t.y) / t.k])
                : null;
            const p = centro && this.proyeccion ? this.proyeccion(centro) : null;
            return p ? { k: t.k, x: caja.ancho / 2 - t.k * p[0], y: caja.alto / 2 - t.k * p[1] } : null;
        };
        // Lo que se ve ahora y a dónde iba (si una animación iba a la vista inicial, cuenta como que ya estaba ahí).
        const actual = llevar(this.zoom.transformacion);
        const destino = llevar(this.zoom.destino);
        const estabaEnInicio = iguales(this.zoom.destino, this.zoom.vistaInicial);
        const inicio = this.encuadre(foco, nivel);
        this.zoom.configurar(caja.ancho, caja.alto, Math.max(1, inicio.k) * ZOOM_MAXIMO[nivel], {
            activo: this.zoomActivo(),
            rueda: String(ajustes.zoom.rueda.value?.value ?? "siempre") as ModoRueda,
        }, inicio);
        const firmaFoco = [nivel, String(ajustes.mapa.encuadre.value?.value ?? "datos"), [...foco].sort().join(",")].join("|");
        if (this.firmaFoco === "" || actual === null || destino === null) {
            this.zoom.fijar(inicio);
        } else if (firmaFoco !== this.firmaFoco) {
            this.zoom.fijar(actual);
            this.zoom.irA(inicio);
        } else if (proyeccionNueva) {
            this.zoom.fijar(estabaEnInicio ? inicio : destino);
        }
        this.firmaFoco = firmaFoco;
        this.firmaProyeccion = firmaProyeccion;
        this.capaMapa.attr("transform", transformar(this.zoom.transformacion));
    }

    /**
     * La vista que encuadra las áreas en foco (con "Ajustar a los datos") o, en
     * municipios, los estados que se dibujan. Con el panel flotando encima, encuadra en
     * la parte del mapa que el panel deja libre.
     */
    private encuadre(foco: string[], nivel: Nivel): Transformacion {
        const camino = this.camino;
        const d = this.distribucion;
        if (!camino || !d) {
            return IDENTIDAD;
        }
        const geo = capa(nivel);
        const ajustarADatos = String(this.ajustes.mapa.encuadre.value?.value ?? "datos") === "datos";
        let areas: Area[];
        if (ajustarADatos && foco.length > 0) {
            areas = foco.map((k) => geo.porClave.get(k)).filter((a): a is Area => a !== undefined);
        } else if (nivel === "municipio") {
            areas = this.visibles;
        } else {
            return IDENTIDAD;
        }
        if (areas.length === 0 || (nivel === "estado" && areas.length === geo.areas.length)) {
            return IDENTIDAD;
        }
        const ancho = d.posicion === "encima" && d.panel && d.panel.ancho < d.mapa.ancho ? d.panel.x - MARGEN : d.mapa.ancho;
        const t = encuadrar(cajaDe(areas, camino), Math.max(1, ancho), d.mapa.alto, Infinity, MARGEN_ENCUADRE);
        return t.k < ESCALA_MINIMA_ENCUADRE ? IDENTIDAD : t;
    }

    /**
     * El mapa muestra solo una parte del país: pocas áreas con datos (un filtro, una
     * segmentación, un resaltado) o muchas pero juntas (una región grande). En
     * municipios cuenta cuántos estados hay: una cadena con tiendas en unos cuantos
     * municipios de todo el país no es un filtro, un drill-down a un estado sí.
     */
    private esParcial(foco: string[], visibles: Area[], nivel: Nivel): boolean {
        const n = foco.length;
        if (nivel === "municipio") {
            const estados = new Set(foco.map((k) => k.slice(0, 2))).size;
            return n > 0 && estados <= capa("estado").areas.length * FRACCION_PARCIAL;
        }
        if (n === 0 || n >= visibles.length) {
            return false;
        }
        if (n <= visibles.length * FRACCION_PARCIAL) {
            return true;
        }
        // Proporción de recuadros: no depende de la escala, así que basta la proyección sin ajustar.
        const camino = geoPath(this.crearProyeccion());
        const geo = capa("estado");
        const superficie = ([[x0, y0], [x1, y1]]: Caja): number => (x1 - x0) * (y1 - y0);
        const enFoco = foco.map((k) => geo.porClave.get(k)).filter((a): a is Area => a !== undefined);
        return superficie(cajaDe(enFoco, camino)) <= FRACCION_RECUADRO * superficie(cajaDe(geo.areas, camino));
    }

    /**
     * Un área de fondo: sin datos mientras el mapa muestra solo una parte del país, o
     * fuera de lo que resalta otro visual. Se pinta neutra y no responde al ratón.
     */
    private esFondo(a: Area): boolean {
        const fila = this.datos?.filas.get(a.clave);
        return fila ? !fila.resaltado : this.parcial;
    }

    /** El valor que colorea un área (null sin dato). */
    private valorColor(a: Area): number | null {
        const fila = this.datos?.filas.get(a.clave);
        if (!fila) {
            return null;
        }
        if (this.modo === "bivariado") {
            return fila.valor !== null && fila.valor2 !== null ? fila.valor : null;
        }
        if (this.modo === "grupo") {
            return fila.grupo !== null ? 0 : null;
        }
        return this.serieColor?.de(fila) ?? null;
    }

    private conFondo(): boolean {
        return String(this.ajustes.mapa.fondo.value?.value ?? "mar") === "mar" && !this.host.colorPalette.isHighContrast;
    }

    /**
     * El mar con líneas de agua alrededor de la costa, una retícula tenue, los países
     * vecinos y sus fronteras. Las líneas de agua son trazos anchos del contorno de
     * México que se recortan con trazos del color del mar: quedan anillos a 3, 8 y 13
     * px de la costa. Lo que cae en tierra lo tapan los vecinos y México.
     */
    private dibujarFondo(ancho: number, alto: number): void {
        const m = this.ajustes.mapa;
        const camino = this.camino;
        const conMar = this.conFondo();
        const mar = m.colorMar.value.value;
        const tierra = m.colorTierra.value.value;
        this.mar.attr("width", ancho).attr("height", alto).attr("fill", conMar ? mar : "none");
        this.capaFondo.style("display", () => (conMar ? null : "none"));
        this.costa.style("display", () => (conMar ? null : "none"));
        if (!conMar || !camino) {
            return;
        }
        if (this.firmaFondo !== this.firmaProyeccion) {
            const fondo = fondoDelMapa();
            const costa = camino(fondo.costa) ?? "";
            this.reticula.attr("d", camino(geoGraticule().extent(EXTENSION_RETICULA).step([5, 5])()) ?? "");
            this.tierra.attr("d", camino(fondo.tierra) ?? "");
            this.fronteras.attr("d", camino(fondo.fronteras) ?? "");
            this.costa.attr("d", costa);
            this.lineasAgua.selectAll("path").data(LINEAS_AGUA.flatMap((l) => [l, l])).join("path").attr("d", costa).attr("fill", "none");
            this.firmaFondo = this.firmaProyeccion;
        }
        const linea = mezclar(mar, TINTA_MAR, 0.3);
        this.lineasAgua.selectAll<SVGPathElement, (typeof LINEAS_AGUA)[number]>("path")
            .attr("stroke", (_, i) => (i % 2 === 0 ? linea : mar))
            .attr("stroke-opacity", (l, i) => (i % 2 === 0 ? l.opacidad : 1))
            .attr("stroke-width", (l, i) => 2 * l.distancia + (i % 2 === 0 ? 1.2 : -1.2));
        this.reticula.attr("stroke", mezclar(mar, "#ffffff", 0.5));
        // El trazo del color de la tierra cierra las rendijas con la frontera de México.
        this.tierra.attr("fill", tierra).attr("stroke", tierra);
        this.fronteras.attr("stroke", mezclar(tierra, TINTA_TIERRA, 0.35));
        this.costa.attr("stroke", mezclar(mar, TINTA_MAR, 0.45));
    }

    /** Grupos con datos: su color del tema y, si se necesitan, su contorno unido y el punto de su nombre. */
    private prepararGrupos(altoContraste: boolean): void {
        const datos = this.datos;
        const camino = this.camino;
        if (!datos?.nombreGrupo || !camino) {
            this.grupos = [];
            return;
        }
        const porGrupo = new Map<string, string[]>();
        for (const f of datos.filas.values()) {
            if (f.grupo !== null) {
                porGrupo.set(f.grupo, [...(porGrupo.get(f.grupo) ?? []), f.clave]);
            }
        }
        const nombres = [...porGrupo.keys()].sort((a, b) => a.localeCompare(b, this.host.locale));
        const firma = `${datos.nivel}|${nombres.map((g) => `${g}:${(porGrupo.get(g) ?? []).join(",")}`).join("|")}`;
        if (firma !== this.firmaGrupos) {
            this.formasGrupo.clear();
            this.firmaGrupos = firma;
        }
        const g = this.ajustes.grupos;
        const conForma = this.modo === "grupo" || g.etiquetas.value || g.estilo.value?.value === "color";
        const paleta = this.host.colorPalette;
        const geo = capa(datos.nivel);
        this.grupos = nombres.map((nombre) => {
            const claves = porGrupo.get(nombre) ?? [];
            let forma = this.formasGrupo.get(nombre) ?? null;
            if (conForma && !forma) {
                const incluidas = new Set(claves);
                forma = unir(geo, (k) => incluidas.has(k));
                this.formasGrupo.set(nombre, forma);
            }
            return {
                nombre,
                color: altoContraste ? paleta.foreground.value : paleta.getColor(nombre).value,
                claves,
                forma,
                d: forma ? camino(forma) ?? "" : "",
                punto: forma ? this.puntoDeGrupo(forma, claves) : null,
            };
        });
    }

    /** El centro del grupo si cae dentro; si no (una región en forma de C), el de su área más grande. */
    private puntoDeGrupo(forma: MultiPolygon, claves: string[]): [number, number] | null {
        const camino = this.camino;
        const proyeccion = this.proyeccion;
        const datos = this.datos;
        if (!camino || !proyeccion || !datos) {
            return null;
        }
        const c = camino.centroid(forma);
        const lugar = Number.isFinite(c[0]) && Number.isFinite(c[1]) ? proyeccion.invert?.(c) : null;
        if (lugar && geoContains(forma, lugar)) {
            return [c[0], c[1]];
        }
        const areas = capa(datos.nivel).porClave;
        let mayor: Area | null = null;
        let superficie = -1;
        for (const k of claves) {
            const a = areas.get(k);
            const s = a ? camino.area(a.forma) : -1;
            if (a && s > superficie) {
                superficie = s;
                mayor = a;
            }
        }
        return mayor ? this.puntoInterior(mayor) : null;
    }

    /** Punto interior precalculado (estados) o centroide (municipios), sin zoom. */
    private puntoInterior(a: Area): [number, number] | null {
        const camino = this.camino;
        const proyeccion = this.proyeccion;
        if (!camino || !proyeccion) {
            return null;
        }
        const { LON, LAT } = a.forma.properties;
        const p = typeof LON === "number" && typeof LAT === "number" ? proyeccion([LON, LAT]) : camino.centroid(a.forma);
        return p && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? [p[0], p[1]] : null;
    }

    /**
     * Estilo "color por grupo": una franja del color de cada grupo por dentro de su
     * contorno (el trazo es doble de ancho y el recorte deja solo la mitad interior).
     */
    private dibujarFranjas(altoContraste: boolean): void {
        const conFranjas = this.modo !== "grupo" && !altoContraste && this.ajustes.grupos.estilo.value?.value === "color";
        const franjas = conFranjas ? this.grupos.filter((g) => g.d) : [];
        this.hayFranjas = franjas.length > 0;
        const id = (i: number): string => `${this.prefijo}-franja-${i}`;
        this.defs.selectAll<SVGClipPathElement, Grupo>("clipPath")
            .data(franjas)
            .join((entrada) => {
                const recorte = entrada.append("clipPath");
                recorte.append("path");
                return recorte;
            })
            .attr("id", (_, i) => id(i))
            .select("path")
            .attr("d", (g) => g.d);
        this.capaFranjas.selectAll<SVGPathElement, Grupo>("path")
            .data(franjas)
            .join("path")
            .attr("d", (g) => g.d)
            .attr("clip-path", (_, i) => `url(#${id(i)})`)
            .attr("fill", "none")
            .attr("stroke", (g) => g.color)
            .attr("stroke-width", ANCHO_FRANJA * 2)
            .attr("stroke-linejoin", "round");
    }

    private nombreEstado(a: Area): string {
        return capa("estado").porClave.get(a.estado)?.nombre ?? a.estado;
    }

    private etiquetaDe(a: Area): string {
        const estado = this.datos?.nivel === "municipio" ? `, ${this.nombreEstado(a)}` : "";
        const fila = this.datos?.filas.get(a.clave);
        const serie = this.serieColor;
        const v = fila && serie && this.modo !== "valor" && this.modo !== "bivariado" ? serie.de(fila) : null;
        const texto = v !== null && serie ? this.formateador(serie.formato)(v) : fila?.texto ?? this.textos.t("Texto_SinDato");
        return `${a.nombre}${estado}: ${texto}`;
    }

    /** Caja y punto de cada área visible, sin zoom; se recalculan si cambia la geometría. */
    private anclasActuales(): Ancla[] {
        const camino = this.camino;
        if (this.firmaAnclas !== this.firmaGeometria && camino) {
            this.anclas = this.visibles.map((area) => ({ area, caja: camino.bounds(area.forma) as Caja, punto: this.puntoInterior(area) }));
            this.firmaAnclas = this.firmaGeometria;
        }
        return this.anclas;
    }

    /**
     * Etiquetas sobre las áreas, solo donde caben y sin encimarse: primero los nombres
     * de los grupos, luego las áreas grandes, y se omite la que choque con otra (el texto
     * se mide por número de caracteres). Se colocan con el zoom actual, así que al
     * acercarse aparecen las de las áreas chicas.
     */
    private dibujarEtiquetas(): void {
        const ajustes = this.ajustes.etiquetas;
        const ajustesGrupos = this.ajustes.grupos;
        const datos = this.datos;
        const t = this.zoom.transformacion;
        this.tEtiquetas = t;
        this.capaEtiquetas.attr("transform", null).selectAll("*").remove();
        const caja = this.distribucion?.mapa;
        const conAreas = ajustes.mostrar.value;
        const conGrupos = Boolean(datos?.nombreGrupo) && ajustesGrupos.etiquetas.value && this.grupos.length > 0;
        const conReferencias = this.conFondo() && this.ajustes.mapa.referencias.value;
        if (!caja || (!conAreas && !conGrupos && !conReferencias)) {
            return;
        }
        const paleta = this.host.colorPalette;
        const colorTexto = paleta.isHighContrast ? paleta.foreground.value : null;
        const halo = paleta.isHighContrast ? paleta.background.value : COLOR_HALO;
        const enVista = (x: number, y: number): boolean => x >= 0 && y >= 0 && x <= caja.ancho && y <= caja.alto;

        const colocadas: Candidata[] = [];
        const choca = (c: Candidata): boolean => colocadas.some((o) =>
            Math.abs(c.x - o.x) * 2 < c.ancho + o.ancho + 4 && Math.abs(c.y - o.y) * 2 < c.alto + o.alto + 2);
        // Nada se escribe debajo de la leyenda.
        const l = this.cajaLeyenda;
        if (l) {
            colocadas.push({ lineas: [], x: l.x + l.ancho / 2, y: l.y + l.alto / 2, ancho: l.ancho, alto: l.alto, prioridad: Infinity });
        }
        const texto = (x: number, y: number, tam: number, color: string): Sel<SVGTextElement> => this.capaEtiquetas.append("text")
            .attr("x", x)
            .attr("y", y)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "central")
            .attr("fill", colorTexto ?? color)
            .attr("stroke", halo)
            .attr("stroke-width", 3)
            .attr("stroke-linejoin", "round")
            .attr("paint-order", "stroke")
            .style("font-size", `${tam}px`);

        if (conGrupos) {
            const tam = acotar(ajustesGrupos.tamanoEtiquetas.value, 6, 28);
            // Con colores por grupo, un punto del color del grupo antecede a su nombre.
            const conPunto = this.modo === "grupo" || (ajustesGrupos.estilo.value?.value === "color" && !paleta.isHighContrast);
            for (const g of this.grupos) {
                // Una región que otro visual dejó de fondo no lleva nombre.
                if (!g.punto || !g.claves.some((k) => datos?.filas.get(k)?.resaltado)) {
                    continue;
                }
                const x = g.punto[0] * t.k + t.x;
                const y = g.punto[1] * t.k + t.y;
                const nombre = g.nombre.toLocaleUpperCase(this.host.locale);
                const c = { lineas: [nombre], x, y, ancho: (nombre.length + (conPunto ? 2 : 0)) * tam * 0.72, alto: tam * 1.25, prioridad: Infinity };
                if (!enVista(x, y) || choca(c)) {
                    continue;
                }
                colocadas.push(c);
                const etiqueta = texto(x, y, tam, COLOR_ETIQUETA_GRUPO).classed("etiqueta-grupo", true).attr("letter-spacing", "0.06em");
                if (this.interactivo()) {
                    // Un clic en el nombre selecciona el grupo entero.
                    etiqueta.classed("sin-zoom", true)
                        .attr("pointer-events", "all")
                        .attr("role", "button")
                        .attr("aria-label", this.textos.t("Leyenda_SeleccionarGrupo", g.nombre))
                        .on("click", (evento: MouseEvent) => {
                            evento.stopPropagation();
                            this.seleccionarGrupo(g.nombre, evento.ctrlKey || evento.metaKey || evento.shiftKey);
                        });
                }
                if (conPunto) {
                    etiqueta.append("tspan").attr("fill", colorTexto ?? g.color).text("● ");
                }
                etiqueta.append("tspan").text(nombre);
            }
        }

        if (conAreas && datos) {
            this.etiquetasDeAreas(datos, colocadas, choca, enVista, texto);
        }
        if (conReferencias) {
            this.dibujarReferencias(caja, colocadas, choca);
        }
    }

    /** Valor o nombre sobre las áreas grandes primero; se omite la que choque con otra. */
    private etiquetasDeAreas(
        datos: Datos,
        colocadas: Candidata[],
        choca: (c: Candidata) => boolean,
        enVista: (x: number, y: number) => boolean,
        texto: (x: number, y: number, tam: number, color: string) => Sel<SVGTextElement>,
    ): void {
        const ajustes = this.ajustes.etiquetas;
        const t = this.zoom.transformacion;
        const contenido = String(ajustes.contenido.value?.value ?? "valor");
        const tam = acotar(ajustes.tamano.value, 6, 24);
        const interlineado = tam * 1.15;
        const serie = this.serieColor;
        const compacto = this.compacto(serie?.formato);
        const candidatas: Candidata[] = [];
        for (const { area: a, caja: [[x0, y0], [x1, y1]], punto } of this.anclasActuales()) {
            if (this.esFondo(a)) {
                continue;
            }
            const fila = datos.filas.get(a.clave);
            const valor = fila ? (this.modo === "bivariado" ? fila.valor : serie?.de(fila) ?? null) : null;
            const lineas: string[] = [];
            if (contenido !== "valor") {
                lineas.push(a.nombre);
            }
            if (contenido !== "nombre" && valor !== null) {
                lineas.push(compacto(valor));
            }
            if (lineas.length === 0 || (contenido === "valor" && valor === null) || !punto) {
                continue;
            }
            const ancho = Math.max(...lineas.map((l) => l.length)) * tam * 0.55;
            const alto = lineas.length * interlineado;
            const x = punto[0] * t.k + t.x;
            const y = punto[1] * t.k + t.y;
            if ((x1 - x0) * t.k < ancho || (y1 - y0) * t.k < alto || !enVista(x, y)) {
                continue;
            }
            candidatas.push({ lineas, x, y, ancho, alto, prioridad: (x1 - x0) * (y1 - y0) });
        }
        for (const c of candidatas.sort((a, b) => b.prioridad - a.prioridad)) {
            if (choca(c)) {
                continue;
            }
            colocadas.push(c);
            const etiqueta = texto(c.x, c.y - ((c.lineas.length - 1) * interlineado) / 2, tam, ajustes.color.value.value).classed("etiqueta-area", true);
            c.lineas.forEach((linea, i) => etiqueta.append("tspan").attr("x", c.x).attr("dy", i === 0 ? 0 : interlineado).text(linea));
        }
    }

    /**
     * Nombres de mares (en cursiva, como en los mapas impresos) y de países vecinos,
     * donde caben completos y sin tapar otras etiquetas ni la leyenda.
     */
    private dibujarReferencias(
        caja: Recuadro,
        colocadas: Candidata[],
        choca: (c: Candidata) => boolean,
    ): void {
        const proyeccion = this.proyeccion;
        if (!proyeccion) {
            return;
        }
        const t = this.zoom.transformacion;
        const enPantalla = (lon: number, lat: number): [number, number] | null => {
            const p = proyeccion([lon, lat]);
            return p ? [p[0] * t.k + t.x, p[1] * t.k + t.y] : null;
        };
        const fondo = fondoDelMapa();
        // ¿Algún punto del texto cae en tierra? (en México, o en cualquier tierra si es un mar)
        const tocaTierra = (puntos: Array<[number, number]>, mar: boolean): boolean => puntos.some(([x, y]) => {
            const lugar = proyeccion.invert?.([(x - t.x) / t.k, (y - t.y) / t.k]);
            return Boolean(lugar && (geoContains(fondo.mexico, lugar) || (mar && geoContains(fondo.tierra, lugar))));
        });
        // Crecen un poco con el visual, sin pasar de 15 px.
        const tamMar = acotar(Math.round(Math.min(caja.ancho, caja.alto) / 36), 10, 15);
        const m = this.ajustes.mapa;
        const colorMar = mezclar(m.colorMar.value.value, TINTA_MAR, 0.62);
        const colorPais = mezclar(m.colorTierra.value.value, TINTA_TIERRA, 0.5);
        for (const r of REFERENCIAS) {
            const mar = r.tipo === "mar";
            const tam = mar ? tamMar : Math.round(tamMar * 0.8);
            const nombre = mar ? this.textos.t(r.texto) : this.textos.t(r.texto).toLocaleUpperCase(this.host.locale);
            // Ancho aproximado: cursiva angosta; mayúsculas con espaciado.
            const largo = nombre.length * tam * (mar ? 0.5 : 0.74);
            let elegida: { c: Candidata; angulo: number } | null = null;
            for (const [lon, lat] of r.lugares) {
                const p = enPantalla(lon, lat);
                const q = r.eje ? enPantalla(lon + r.eje[0], lat + r.eje[1]) : null;
                if (!p) {
                    continue;
                }
                const angulo = q ? Math.atan2(q[1] - p[1], q[0] - p[0]) : 0;
                const c: Candidata = {
                    lineas: [nombre],
                    x: p[0],
                    y: p[1],
                    ancho: Math.abs(Math.cos(angulo)) * largo + Math.abs(Math.sin(angulo)) * tam,
                    alto: Math.abs(Math.sin(angulo)) * largo + Math.abs(Math.cos(angulo)) * tam * 1.2,
                    prioridad: 0,
                };
                const dentro = c.x - c.ancho / 2 >= 2 && c.x + c.ancho / 2 <= caja.ancho - 2 && c.y - c.alto / 2 >= 2 && c.y + c.alto / 2 <= caja.alto - 2;
                if (!dentro || choca(c)) {
                    continue;
                }
                // Puntos a lo largo del texto, arriba y abajo de su línea.
                const [cos, sen] = [Math.cos(angulo), Math.sin(angulo)];
                const puntos: Array<[number, number]> = [];
                for (let i = 0; i <= 6; i++) {
                    const d = (i / 6 - 0.5) * largo;
                    for (const h of [-tam / 2, tam / 2]) {
                        puntos.push([p[0] + d * cos - h * sen, p[1] + d * sen + h * cos]);
                    }
                }
                if (!tocaTierra(puntos, mar)) {
                    elegida = { c, angulo };
                    break;
                }
            }
            if (!elegida) {
                continue;
            }
            const { c, angulo } = elegida;
            colocadas.push(c);
            this.capaEtiquetas.append("text")
                .classed(mar ? "referencia-mar" : "referencia-pais", true)
                .attr("x", c.x)
                .attr("y", c.y)
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "central")
                .attr("transform", angulo ? `rotate(${(angulo * 180) / Math.PI} ${c.x} ${c.y})` : null)
                .attr("fill", mar ? colorMar : colorPais)
                .style("font-size", `${tam}px`)
                .text(nombre);
        }
    }

    private dibujarLeyenda(coloreado: Coloreado, sinDato: string, borde: string, ancho: number, alto: number, colorTexto: string | null): void {
        const ajustes = this.ajustes.leyenda;
        const datos = this.datos;
        const t = this.textos;
        this.capaLeyenda.selectAll("*").remove();
        this.cajaLeyenda = null;
        if (!ajustes.mostrar.value || !datos) {
            return;
        }

        const entradas: EntradaLeyenda[] = [];
        let tituloPorOmision = "";
        if (this.modo === "grupo") {
            tituloPorOmision = datos.nombreGrupo ?? "";
            entradas.push(...this.grupos.map((g) => ({ color: g.color, texto: g.nombre, grupo: g.nombre })));
            if (this.haySinDato) {
                entradas.push({ color: sinDato, texto: t.t("Texto_SinDato") });
            }
        } else {
            const clasif = coloreado.clasif;
            const serie = this.serieColor;
            if (!clasif || clasif.numClases === 0 || !serie) {
                return;
            }
            tituloPorOmision = serie.nombre;
            const compacto = this.compacto(serie.formato);
            if (String(ajustes.estilo.value?.value ?? "lista") === "barra") {
                this.dibujarLeyendaBarra(clasif, coloreado.colores, compacto, ajustes.titulo.value || tituloPorOmision, sinDato, borde, ancho, alto, colorTexto);
                return;
            }
            if (clasif.metodo === "divergente") {
                const ultima = clasif.numClases - 1;
                for (const c of clasif.clases) {
                    const texto = c.indice === 0 ? `< ${compacto(c.hasta ?? 0)}`
                        : c.indice === ultima ? `> ${compacto(c.desde ?? 0)}`
                        : t.t("Leyenda_Rango", compacto(c.desde ?? 0), compacto(c.hasta ?? 0));
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
            if (this.haySinDato) {
                entradas.push({ color: sinDato, texto: t.t("Texto_SinDato") });
            }
            if (this.hayFranjas) {
                entradas.push({ color: "", texto: datos.nombreGrupo ?? "", seccion: true });
                entradas.push(...this.grupos.map((g) => ({ color: g.color, texto: g.nombre, grupo: g.nombre, franja: true })));
            }
        }

        // Medidas aproximadas: el texto se mide por número de caracteres.
        const { tam, fila, cuadro, px, py } = this.medidasLeyenda();
        const recortar = this.recortador(ancho, tam);
        const titulo = recortar(ajustes.titulo.value || tituloPorOmision);
        // Con muchos grupos, van en dos columnas para que la leyenda no tape el mapa;
        // si aun así no caben, se recortan y se dice cuántos faltan.
        const deGrupo = (e: EntradaLeyenda): boolean => e.grupo !== undefined;
        const filasCon = (columnas: number): number => {
            const n = entradas.filter(deGrupo).length;
            return entradas.length - n + Math.ceil(n / columnas);
        };
        const columnas = entradas.filter(deGrupo).length >= 4 && ((titulo ? 1 : 0) + filasCon(1)) * fila + 2 * py > alto * 0.45 ? 2 : 1;
        const maxFilas = Math.max(2, Math.floor((alto - 2 * MARGEN - 2 * py) / fila) - (titulo ? 1 : 0));
        let quitados = 0;
        while (filasCon(columnas) + (quitados ? 1 : 0) > maxFilas && entradas.some(deGrupo)) {
            entradas.splice(entradas.map(deGrupo).lastIndexOf(true), 1);
            quitados++;
        }
        if (quitados > 0) {
            entradas.push({ color: "", texto: t.t("Leyenda_Mas", quitados) });
        }
        const anchoEntrada = (e: EntradaLeyenda): number => (e.texto.length * 0.56 + (e.seccion || !e.color ? 0 : (cuadro + 8) / tam)) * tam;
        const anchoGrupo = Math.max(0, ...entradas.filter(deGrupo).map(anchoEntrada)) + 10;
        const anchoTexto = Math.max(titulo.length * 0.62 * tam, columnas * anchoGrupo, ...entradas.filter((e) => !deGrupo(e)).map(anchoEntrada));
        const anchoCaja = Math.min(ancho - 2 * MARGEN, Math.ceil(anchoTexto + 2 * px));
        const altoCaja = (titulo ? fila : 0) + filasCon(columnas) * fila + 2 * py;
        const anchoColumna = (anchoCaja - 2 * px + 6) / columnas;
        const maxGrupo = Math.max(4, Math.floor((anchoColumna - cuadro - 14) / (tam * 0.56)));
        const recortarGrupo = columnas > 1 ? (texto: string): string => (texto.length > maxGrupo ? `${texto.slice(0, maxGrupo - 1)}…` : texto) : recortar;
        const filasGrupo = Math.ceil(entradas.filter(deGrupo).length / columnas);

        const capaLeyenda = this.posicionarLeyenda(anchoCaja, altoCaja, ancho, alto);
        let yy = py;
        if (titulo) {
            capaLeyenda.append("text").classed("titulo", true)
                .attr("x", px).attr("y", yy + fila / 2).attr("dominant-baseline", "central")
                .style("font-size", `${tam}px`).style("fill", () => colorTexto).text(titulo);
            yy += fila;
        }
        let j = 0;
        let yGrupos = 0;
        for (const e of entradas) {
            let x = px;
            let y = yy;
            if (deGrupo(e)) {
                // Los grupos llenan las columnas de arriba abajo.
                if (j === 0) {
                    yGrupos = yy;
                    yy += filasGrupo * fila;
                }
                x = px + Math.floor(j / filasGrupo) * anchoColumna;
                y = yGrupos + (j % filasGrupo) * fila;
                j++;
            } else {
                yy += fila;
            }
            if (e.seccion || !e.color) {
                capaLeyenda.append("text").classed(e.seccion ? "titulo" : "etiqueta", true)
                    .attr("x", x).attr("y", y + fila / 2).attr("dominant-baseline", "central")
                    .style("font-size", `${tam}px`).style("fill", () => colorTexto).text(recortar(e.texto));
                continue;
            }
            // Las entradas de grupo seleccionan el grupo entero (clic, Enter o Espacio).
            const grupo = e.grupo;
            const destino = grupo === undefined ? capaLeyenda : capaLeyenda.append("g")
                .classed("entrada-grupo", true)
                .classed("sin-zoom", true)
                .attr("pointer-events", "all")
                .attr("role", "button")
                .attr("tabindex", this.interactivo() ? 0 : -1)
                .attr("aria-label", t.t("Leyenda_SeleccionarGrupo", grupo))
                .on("click", (evento: MouseEvent) => {
                    evento.stopPropagation();
                    this.seleccionarGrupo(grupo, evento.ctrlKey || evento.metaKey || evento.shiftKey);
                })
                .on("keydown", (evento: KeyboardEvent) => {
                    if (evento.key === "Enter" || evento.key === " ") {
                        evento.preventDefault();
                        this.seleccionarGrupo(grupo, evento.ctrlKey || evento.metaKey);
                    }
                });
            if (grupo !== undefined) {
                destino.append("rect").attr("x", x - 5).attr("y", y).attr("width", anchoColumna - 4).attr("height", fila).attr("fill", "transparent");
            }
            const muestra = destino.append("rect").classed("muestra", true)
                .attr("x", x).attr("y", y + (fila - cuadro) / 2).attr("width", cuadro).attr("height", cuadro).attr("rx", 3);
            if (e.franja) {
                muestra.attr("fill", sinDato).attr("stroke", e.color).attr("stroke-width", 3);
            } else {
                muestra.attr("fill", e.color).attr("stroke", borde);
            }
            destino.append("text").classed("etiqueta", true)
                .attr("x", x + cuadro + 7).attr("y", y + fila / 2).attr("dominant-baseline", "central")
                .style("font-size", `${tam}px`).style("fill", () => colorTexto).text((grupo === undefined ? recortar : recortarGrupo)(e.texto));
        }
    }

    /**
     * Leyenda en barra: un tramo de color por clase y, debajo, los cortes entre clases
     * (en cuantiles e intervalos, también el mínimo y el máximo). Si los cortes no caben,
     * se escribe uno sí y uno no.
     */
    private dibujarLeyendaBarra(
        clasif: Clasificacion, colores: string[], compacto: (v: number) => string, tituloBase: string,
        sinDato: string, borde: string, ancho: number, alto: number, colorTexto: string | null,
    ): void {
        const { tam, fila, cuadro, px, py } = this.medidasLeyenda();
        const divergente = clasif.metodo === "divergente";
        const clases = divergente ? clasif.clases : clasif.clases.filter((k) => k.n > 0);
        const n = clases.length;
        const cortes: Array<{ i: number; texto: string }> = divergente
            ? clases.slice(1).map((c, i) => ({ i: i + 1, texto: compacto(c.desde ?? 0) }))
            : [{ i: 0, texto: compacto(clases[0].min) }, ...clases.slice(1).map((c, i) => ({ i: i + 1, texto: compacto(c.min) })), { i: n, texto: compacto(clases[n - 1].max) }];
        const anchoCorte = Math.max(...cortes.map((c) => c.texto.length)) * tam * 0.56 + 8;
        const recortar = this.recortador(ancho, tam);
        const titulo = recortar(tituloBase);
        const textoSinDato = this.textos.t("Texto_SinDato");
        const anchoSinDato = this.haySinDato ? cuadro + 7 + textoSinDato.length * tam * 0.56 : 0;
        const maximo = ancho - 2 * MARGEN - 2 * px;
        const anchoBarra = Math.max(Math.min(maximo, Math.max(n * Math.max(tam * 2.6, anchoCorte), titulo.length * 0.62 * tam)), 40);
        const tramo = anchoBarra / n;
        const paso = Math.max(1, Math.ceil(anchoCorte / tramo));
        const altoBarra = Math.round(tam * 0.9);
        // "Sin dato" va junto al título si cabe; si no, en su propia fila.
        const sinDatoAlLado = this.haySinDato && titulo.length * 0.62 * tam + 16 + anchoSinDato <= anchoBarra;
        const anchoCaja = Math.min(ancho - 2 * MARGEN, Math.ceil(anchoBarra + 2 * px));
        const altoCaja = Math.round(2 * py + (titulo || sinDatoAlLado ? fila : 0) + altoBarra + 5 + tam * 1.3 + (this.haySinDato && !sinDatoAlLado ? fila : 0));

        const capaLeyenda = this.posicionarLeyenda(anchoCaja, altoCaja, ancho, alto);
        let y = py;
        const sinDatoEn = (x: number, yy: number): void => {
            capaLeyenda.append("rect").classed("muestra", true)
                .attr("x", x).attr("y", yy + (fila - cuadro) / 2).attr("width", cuadro).attr("height", cuadro).attr("rx", 3)
                .attr("fill", sinDato).attr("stroke", borde);
            capaLeyenda.append("text").classed("etiqueta", true)
                .attr("x", x + cuadro + 7).attr("y", yy + fila / 2).attr("dominant-baseline", "central")
                .style("font-size", `${tam}px`).style("fill", () => colorTexto).text(textoSinDato);
        };
        if (titulo || sinDatoAlLado) {
            if (titulo) {
                capaLeyenda.append("text").classed("titulo", true)
                    .attr("x", px).attr("y", y + fila / 2).attr("dominant-baseline", "central")
                    .style("font-size", `${tam}px`).style("fill", () => colorTexto).text(titulo);
            }
            if (sinDatoAlLado) {
                sinDatoEn(px + anchoBarra - anchoSinDato, y);
            }
            y += fila;
        }
        clases.forEach((c, i) => {
            capaLeyenda.append("rect").classed("tramo", true)
                .attr("x", px + i * tramo).attr("y", y).attr("width", tramo + (i < n - 1 ? 0.5 : 0)).attr("height", altoBarra)
                .attr("fill", colores[c.indice]);
        });
        capaLeyenda.append("rect").classed("marco", true)
            .attr("x", px).attr("y", y).attr("width", anchoBarra).attr("height", altoBarra).attr("rx", 2)
            .attr("fill", "none").attr("stroke", borde);
        const yCorte = y + altoBarra + 5 + (tam * 1.3) / 2;
        cortes.filter((_, k) => k % paso === 0 || (!divergente && k === cortes.length - 1)).forEach((c) => {
            const x = px + c.i * tramo;
            capaLeyenda.append("line").classed("corte", true)
                .attr("x1", x).attr("x2", x).attr("y1", y + altoBarra).attr("y2", y + altoBarra + 4).attr("stroke", borde);
            capaLeyenda.append("text").classed("etiqueta", true)
                .attr("x", x).attr("y", yCorte).attr("dominant-baseline", "central")
                .attr("text-anchor", c.i === 0 ? "start" : c.i === n ? "end" : "middle")
                .style("font-size", `${tam * 0.92}px`).style("fill", () => colorTexto).text(c.texto);
        });
        if (this.haySinDato && !sinDatoAlLado) {
            sinDatoEn(px, yCorte + tam * 0.65);
        }
    }

    /** Leyenda 3×3: Valor crece hacia la derecha y Valor 2 hacia arriba. */
    private dibujarLeyendaBivariada(sinDato: string, borde: string, ancho: number, alto: number, colorTexto: string | null): void {
        const ajustes = this.ajustes.leyenda;
        const datos = this.datos;
        this.capaLeyenda.selectAll("*").remove();
        this.cajaLeyenda = null;
        if (!ajustes.mostrar.value || !datos) {
            return;
        }
        const { tam, fila, cuadro, px, py } = this.medidasLeyenda();
        const celda = Math.round(tam * 1.7);
        const recortar = this.recortador(ancho, tam);
        const textoY = `↑ ${recortar(datos.nombreValor2 ?? "")}`;
        const textoX = `${recortar(datos.nombreValor ?? "")} →`;
        const anchoTexto = Math.max(textoX.length, textoY.length) * tam * 0.56;
        const anchoCaja = Math.min(ancho - 2 * MARGEN, Math.ceil(Math.max(3 * celda, anchoTexto) + 2 * px));
        const altoCaja = fila + 3 * celda + fila + (this.haySinDato ? fila : 0) + 2 * py;
        const paleta = String(this.ajustes.bivariado.paleta.value?.value ?? "turquesa-rosa");

        const capaLeyenda = this.posicionarLeyenda(anchoCaja, altoCaja, ancho, alto);
        const x0 = px;
        const y0 = py + fila;
        capaLeyenda.append("text").classed("etiqueta", true)
            .attr("x", x0).attr("y", py + fila / 2).attr("dominant-baseline", "central")
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
        if (this.haySinDato) {
            const yy = y0 + 3 * celda + fila;
            capaLeyenda.append("rect").classed("muestra", true)
                .attr("x", x0).attr("y", yy + (fila - cuadro) / 2).attr("width", cuadro).attr("height", cuadro).attr("rx", 3)
                .attr("fill", sinDato).attr("stroke", borde);
            capaLeyenda.append("text").classed("etiqueta", true)
                .attr("x", x0 + cuadro + 7).attr("y", yy + fila / 2).attr("dominant-baseline", "central")
                .style("font-size", `${tam}px`).style("fill", () => colorTexto).text(this.textos.t("Texto_SinDato"));
        }
    }

    /** Tamaño del texto, alto de fila, lado de la muestra y márgenes interiores de la leyenda. */
    private medidasLeyenda(): { tam: number; fila: number; cuadro: number; px: number; py: number } {
        const tam = acotar(this.ajustes.leyenda.tamano.value, 8, 24);
        return { tam, fila: Math.round(tam * 1.75), cuadro: Math.round(tam * 1.2), px: Math.round(tam * 0.85), py: Math.round(tam * 0.5) };
    }

    private recortador(ancho: number, tam: number): (t: string) => string {
        const maxCaracteres = Math.max(4, Math.floor((ancho - 2 * MARGEN - 12) / (tam * 0.6)));
        return (t: string): string => (t.length > maxCaracteres ? `${t.slice(0, maxCaracteres - 1)}…` : t);
    }

    /**
     * Coloca la caja de la leyenda en la esquina elegida y devuelve su capa. Si no cabe
     * en el 42 % del alto o el 40 % del ancho del mapa (un visual chico, muchas
     * regiones), se reduce entera, sin bajar de 9 px de texto.
     */
    private posicionarLeyenda(anchoCaja: number, altoCaja: number, ancho: number, alto: number): Sel<SVGGElement> {
        const posicion = String(this.ajustes.leyenda.posicion.value?.value ?? "abajo-izquierda");
        const { tam } = this.medidasLeyenda();
        // En un visual chico el texto baja hacia 9 px; en uno normal se queda como se eligió.
        const porTamano = Math.max(9, Math.min(ancho, alto) / 30) / tam;
        const escala = Math.max(Math.min(1, 9 / tam), Math.min(1, (alto * 0.42) / altoCaja, (ancho * 0.4) / anchoCaja, porTamano));
        const x = posicion.endsWith("derecha") ? ancho - MARGEN - anchoCaja * escala : MARGEN;
        const y = posicion.startsWith("arriba") ? MARGEN : alto - MARGEN - altoCaja * escala;
        this.cajaLeyenda = { x, y, ancho: anchoCaja * escala, alto: altoCaja * escala };
        const capaLeyenda = this.capaLeyenda.attr("transform", `translate(${x},${y})${escala < 1 ? ` scale(${escala})` : ""}`);
        capaLeyenda.append("rect").classed("fondo", true).attr("width", anchoCaja).attr("height", altoCaja).attr("rx", 6);
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
        } else if (d.nombreValor === null && d.medidas.bases.length === 0) {
            texto = this.textos.t("Mensaje_SinValor");
        }
        this.mensaje.style("display", () => (texto ? null : "none")).text(texto);
    }

    // ---------------------------------------------------------- panel de detalle

    private debeAbrirPanel(foco: Fila[]): boolean {
        return this.ajustes.panel.mostrar.value && foco.length > 0;
    }

    /** Cuándo se abre el panel. La opción de antes, "Mostrar sin selección", equivale a Siempre. */
    private modoPanel(): "seleccion" | "filtro" | "siempre" {
        const guardado = this.objetosPanel;
        if (guardado?.abrir === undefined && guardado?.sinSeleccion === true) {
            return "siempre";
        }
        const modo = String(this.ajustes.panel.abrir.value?.value ?? "filtro");
        return modo === "seleccion" || modo === "siempre" ? modo : "filtro";
    }

    /**
     * Las áreas del panel: las seleccionadas; sin selección, las que tienen datos cuando un
     * filtro o un resaltado de otro visual dejan una parte del mapa (o siempre, si se pidió).
     */
    private foco(): Fila[] {
        const datos = this.datos;
        if (!datos) {
            return [];
        }
        const filas = [...datos.filas.values()];
        const ids = this.seleccion.getSelectionIds() as ISelectionId[];
        if (ids.length > 0) {
            return filas.filter((f) => ids.some((id) => id.equals(f.id)));
        }
        const modo = this.modoPanel();
        const abre = modo === "siempre" || (modo === "filtro" && (datos.hayResaltado || this.parcial));
        return abre && this.panelOculto !== this.firmaPanel() ? filas.filter((f) => f.resaltado) : [];
    }

    /** Lo que resume el panel sin selección; si cambia (otro filtro), el panel oculto vuelve. */
    private firmaPanel(): string {
        const enFoco = [...(this.datos?.filas.values() ?? [])].filter((f) => f.resaltado);
        const total = enFoco.reduce((s, f) => s + (f.valor ?? f.bases[0] ?? f.tarjetas[0] ?? 0), 0);
        return `${enFoco.map((f) => f.clave).join(",")}|${total}`;
    }

    /** El botón × del panel: quita la selección o, sin selección, oculta el panel. */
    private cerrarPanel(): void {
        if (this.seleccion.getSelectionIds().length > 0) {
            this.limpiarSeleccion();
        } else {
            this.panelOculto = this.firmaPanel();
            this.aplicarSeleccion(false);
        }
    }

    /** Marca un área en el mapa (al pasar por su fila en la tabla del panel). */
    private senalar(clave: string | null): void {
        const nodo = clave === null ? null : this.capaAreas.selectAll<SVGPathElement, Area>("path.area").filter((a) => a.clave === clave).node();
        if (nodo) {
            this.resaltado.attr("d", nodo.getAttribute("d")).style("display", null);
        } else {
            this.resaltado.style("display", "none");
        }
    }

    private dibujarPanel(): void {
        const distribucion = this.distribucion;
        const caja = distribucion?.panel;
        const foco = this.panelAbierto ? this.focoActual : [];
        if (!distribucion || !caja || foco.length === 0 || !this.datos) {
            this.panel.ocultar();
            return;
        }
        const t = this.textos;
        const paleta = this.host.colorPalette;
        const ac = paleta.isHighContrast;
        this.panel.dibujar(this.modeloPanel(foco), {
            tamanoTexto: acotar(this.ajustes.panel.tamanoTexto.value, 9, 18),
            posicion: distribucion.posicion,
            horizontal: distribucion.posicion === "abajo" && caja.ancho > caja.alto * 1.8,
            colorSigno: this.ajustes.panel.colorSigno.value,
            colores: {
                texto: ac ? paleta.foreground.value : null,
                fondo: ac ? paleta.background.value : null,
                positivo: ac ? paleta.foreground.value : paleta.positive?.value ?? POSITIVO,
                negativo: ac ? paleta.foreground.value : paleta.negative?.value ?? NEGATIVO,
            },
            proyeccion: () => this.crearProyeccion(),
            interactivo: this.interactivo(),
        }, {
            region: t.t("Panel_Region"),
            comparacion: t.t("Panel_Comparacion"),
            tarjetas: t.t("Panel_Tarjetas"),
            detalle: t.t("Panel_Detalle", t.t(this.datos.nivel === "municipio" ? "Texto_Municipio" : "Texto_Estado").toLocaleLowerCase(this.host.locale)),
            cerrar: t.t("Panel_Cerrar"),
            ocultar: t.t("Panel_Ocultar"),
            elegir: (nombre) => t.t("Panel_SeleccionarArea", nombre),
        }, caja);
    }

    private modeloPanel(foco: Fila[]): ModeloPanel {
        const datos = this.datos as Datos;
        const t = this.textos;
        const geo = capa(datos.nivel);
        const municipal = datos.nivel === "municipio";
        const plural = t.t(municipal ? "Texto_Municipios" : "Texto_Estados");
        const nombre = (f: Fila): string => geo.porClave.get(f.clave)?.nombre ?? f.clave;
        const haySeleccion = this.seleccion.getSelectionIds().length > 0;
        const motivo: MotivoPanel = haySeleccion ? "seleccion" : datos.hayResaltado ? "resaltado" : this.parcial ? "filtro" : "todo";
        const n = foco.length;
        const cuenta = `${n} ${plural}`;
        const paleta = this.host.colorPalette;
        const sinDato = paleta.isHighContrast ? paleta.background.value : this.ajustes.colores.sinDato.value.value;
        const colorDe = (f: Fila): string => {
            const a = geo.porClave.get(f.clave);
            return a && this.coloreado ? this.coloreado.color(a) : sinDato;
        };
        const colorGrupo = (g: string | null): string | null => this.grupos.find((x) => x.nombre === g)?.color ?? null;

        // Regiones completas: todas sus áreas con datos están en el panel (un filtro de
        // región, un clic en su nombre o en su fila de otro visual).
        const regiones = [...new Set(foco.map((f) => f.grupo))];
        const completas = n > 1 && regiones.length <= 3 && regiones.every((g) => g !== null
            && [...datos.filas.values()].every((f) => f.grupo !== g || foco.includes(f)));
        // Todo lo que se ve, sin filtro que deje una parte (siempre abierto, o un resaltado en todo el país)
        const todo = motivo !== "seleccion" && !this.parcial && n === [...datos.filas.values()].filter((f) => f.resaltado).length;
        let titulo: string;
        let subtitulo: string;
        let acento: string | null = null;
        if (n === 1) {
            const f = foco[0];
            const area = geo.porClave.get(f.clave);
            titulo = nombre(f);
            subtitulo = [municipal && area ? this.nombreEstado(area) : null, f.grupo].filter(Boolean).join(" · ");
            acento = colorGrupo(f.grupo) ?? colorDe(f);
        } else if (todo) {
            titulo = t.t("Panel_Todos", plural);
            subtitulo = t.t("Panel_ConDatos", cuenta);
        } else if (completas) {
            titulo = regiones.join(" · ");
            subtitulo = cuenta;
            acento = regiones.length === 1 ? colorGrupo(regiones[0]) : null;
        } else if (municipal && motivo !== "seleccion" && new Set(foco.map((f) => f.clave.slice(0, 2))).size === 1) {
            // Un drill-down o un filtro a un estado: su nombre y sus municipios.
            titulo = capa("estado").porClave.get(foco[0].clave.slice(0, 2))?.nombre ?? cuenta;
            subtitulo = cuenta;
        } else {
            titulo = cuenta;
            subtitulo = `${foco.slice(0, 4).map(nombre).join(", ")}${n > 4 ? ", …" : ""}`;
        }
        if (datos.periodo) {
            subtitulo = [datos.periodo, subtitulo].filter(Boolean).join(" · ");
        }
        const motivos: Record<MotivoPanel, string> = {
            seleccion: t.t("Panel_MotivoSeleccion"),
            filtro: t.t("Panel_MotivoFiltro"),
            resaltado: t.t("Panel_MotivoResaltado"),
            todo: "",
        };

        const { bases, tarjetas } = this.medidasPanel();
        const bloques = this.bloquesDax(foco);
        // Una base con su total de DAX es exacta; si no lo hay (estados sueltos), se combina como se eligió.
        const cifra = (m: Medida, color: string): Cifra => {
            const formato = this.formateador(m.formato);
            const compacto = this.compacto(m.formato);
            if (bloques.length === 1) {
                const v = this.valorDe(bloques[0].fila, m);
                return {
                    nombre: m.nombre, texto: v === null ? t.t("Texto_SinDato") : compacto(v), exacto: v === null ? "" : formato(v),
                    nota: "", valor: v, color, esTexto: false, porArea: [],
                };
            }
            const r = resumir(foco.map((f) => this.valorDe(f, m)), m.agregacion);
            const texto = r.valor !== null ? compacto(r.valor)
                : r.min !== null && r.max !== null ? (r.min === r.max ? compacto(r.min) : `${compacto(r.min)} – ${compacto(r.max)}`)
                : t.t("Texto_SinDato");
            return {
                nombre: m.nombre,
                texto,
                exacto: r.valor !== null ? formato(r.valor) : "",
                nota: this.nota(m.agregacion, r.n, n, plural),
                valor: r.valor,
                color,
                esTexto: false,
                porArea: [],
            };
        };
        // Una tarjeta no calcula: muestra lo que dio DAX en cada bloque (una vez si todos dan lo mismo).
        const tarjeta = (m: Medida): Cifra => {
            const j = datos.medidas.tarjetas.indexOf(m);
            const formato = this.formateador(m.formato);
            const compacto = this.compacto(m.formato);
            const textoDe = (f: Fila, exacto: boolean): string | null => {
                if (m.tipo === "texto") {
                    return f.textos[j] ?? null;
                }
                const v = this.valorDe(f, m);
                return v === null ? null : m.tipo === "fecha" ? formato(new Date(v)) : exacto ? formato(v) : compacto(v);
            };
            const grupos = agruparTextos(bloques.map((b) => ({ area: b.nombre, texto: textoDe(b.fila, false) })));
            const unico = grupos.length === 1 ? grupos[0].texto : null;
            const resto = grupos.length - MAX_TEXTOS_TARJETA;
            return {
                nombre: m.nombre,
                texto: unico ?? (grupos.length === 0 ? t.t("Texto_SinDato") : ""),
                exacto: bloques.length === 1 ? textoDe(bloques[0].fila, true) ?? "" : unico ?? "",
                nota: resto > 0 ? t.t("Panel_TextosResto", resto) : "",
                valor: null,
                color: "",
                esTexto: m.tipo !== "numero",
                porArea: unico !== null ? [] : grupos.slice(0, MAX_TEXTOS_TARJETA).map((g) => ({
                    areas: g.areas.length > MAX_AREAS_TEXTO
                        ? t.t("Panel_AreasMas", g.areas.slice(0, MAX_AREAS_TEXTO).join(", "), g.areas.length - MAX_AREAS_TEXTO)
                        : g.areas.join(", "),
                    texto: g.texto,
                })),
            };
        };
        const cifrasBases = bases.map((m, i) => cifra(m, COLORES_BASES[i % COLORES_BASES.length]));

        const p = this.ajustes.panel;
        const diferencias: ModeloPanel["diferencias"] = [];
        if (bases.length >= 2 && (p.diferencia.value || p.indice.value)) {
            const relativa = this.formateador(FORMATO_RELATIVO);
            const indice = this.formateador(FORMATO_INDICE);
            for (let i = 1; i < bases.length; i++) {
                const c = comparar(cifrasBases[0].valor, cifrasBases[i].valor);
                if (!c) {
                    continue;
                }
                const lineas: LineaDiferencia[] = [];
                if (p.diferencia.value) {
                    lineas.push({ nombre: t.t("Panel_Diferencia"), texto: this.textoDiferencia(c.diferencia, bases[0].formato), signo: Math.sign(c.diferencia) });
                    if (c.relativa !== null) {
                        lineas.push({ nombre: t.t("Panel_DiferenciaPct"), texto: relativa(c.relativa), signo: Math.sign(c.relativa) });
                    }
                }
                if (p.indice.value && c.indice !== null) {
                    lineas.push({ nombre: t.t("Panel_Indice"), texto: indice(c.indice), signo: Math.sign(c.indice - 100) });
                }
                diferencias.push({ titulo: t.t("Panel_Vs", bases[0].nombre, bases[i].nombre), lineas });
            }
        }

        let detalle: ModeloPanel["detalle"] = null;
        const columnas = bases.length > 0 ? bases : [datos.medidas.valor, datos.medidas.valor2].filter((m): m is Medida => m !== null);
        if (n > 1 && columnas.length > 0) {
            const conRelativa = bases.length >= 2;
            const formatos = columnas.map((m) => this.compacto(m.formato));
            const relativa = this.formateador(FORMATO_RELATIVO);
            const primera = (f: Fila): number | null => this.valorDe(f, columnas[0]);
            // De mayor a menor en la primera columna; sin dato al final.
            const orden = [...foco].sort((a, b) => {
                const va = primera(a);
                const vb = primera(b);
                return va === null ? (vb === null ? 0 : 1) : vb === null ? -1 : vb - va;
            });
            const mayor = Math.max(0, ...foco.map((f) => Math.abs(primera(f) ?? 0)));
            detalle = {
                columnas: [
                    t.t(municipal ? "Texto_Municipio" : "Texto_Estado"),
                    ...columnas.map((m) => m.nombre),
                    ...(conRelativa ? [t.t("Panel_DiferenciaPct")] : []),
                ],
                filas: orden.slice(0, MAX_FILAS_DETALLE).map((f) => {
                    const celdas = columnas.map((m, i) => {
                        const v = this.valorDe(f, m);
                        return v === null ? "–" : formatos[i](v);
                    });
                    if (conRelativa) {
                        const r = comparar(f.bases[0], f.bases[1])?.relativa ?? null;
                        celdas.push(r === null ? "–" : relativa(r));
                    }
                    const v = primera(f);
                    return { clave: f.clave, nombre: nombre(f), color: colorDe(f), celdas, barra: v === null || mayor === 0 ? null : Math.abs(v) / mayor };
                }),
                resto: n > MAX_FILAS_DETALLE ? t.t("Panel_Resto", n - MAX_FILAS_DETALLE) : "",
            };
        }

        const silueta = p.silueta.value && n <= MAX_SILUETA
            ? foco.map((f) => geo.porClave.get(f.clave)).filter((a): a is Area => a !== undefined)
                .map((area) => ({ forma: principal(area), color: this.coloreado?.color(area) ?? sinDato }))
            : [];

        return {
            titulo,
            subtitulo,
            motivo: motivos[motivo],
            acento,
            quitaSeleccion: haySeleccion,
            silueta,
            bases: cifrasBases,
            diferencias,
            tarjetas: tarjetas.map(tarjeta),
            detalle,
        };
    }

    /**
     * Lo que DAX calculó para las áreas del panel, en los menos bloques posibles: todo lo
     * que deja el filtro, regiones completas, estados completos (en municipios) y, lo que
     * no completa ningún bloque, área por área. Con un resaltado, cuenta lo resaltado.
     */
    private bloquesDax(foco: Fila[]): Array<{ nombre: string; fila: Fila }> {
        const datos = this.datos;
        const geo = capa(datos?.nivel ?? "estado");
        const porArea = (f: Fila): { nombre: string; fila: Fila } => ({ nombre: geo.porClave.get(f.clave)?.nombre ?? f.clave, fila: f });
        if (!datos || foco.length <= 1) {
            return foco.map(porArea);
        }
        const libres = new Set(foco.map((f) => f.clave));
        const orden = new Map(foco.map((f, i) => [f.clave, i]));
        const bloques: Array<{ nombre: string; fila: Fila; orden: number }> = [];
        // Los más grandes primero: el total general, luego regiones, luego estados.
        const candidatos = datos.totales
            .map((t) => ({ t, claves: t.claves.filter((k) => datos.filas.get(k)?.resaltado) }))
            .filter((c) => c.claves.length > 1)
            .sort((a, b) => b.claves.length - a.claves.length);
        for (const { t, claves } of candidatos) {
            if (claves.every((k) => libres.has(k))) {
                bloques.push({ nombre: t.nombre, fila: t.fila, orden: Math.min(...claves.map((k) => orden.get(k) ?? 0)) });
                claves.forEach((k) => libres.delete(k));
            }
        }
        for (const f of foco) {
            if (libres.has(f.clave)) {
                bloques.push({ ...porArea(f), orden: orden.get(f.clave) ?? 0 });
            }
        }
        return bloques.sort((a, b) => a.orden - b.orden);
    }

    /** "suma de 3 estados", "rango de 2 de 3 estados"… (vacío con un área). */
    private nota(agregacion: Agregacion, conValor: number, total: number, plural: string): string {
        if (total <= 1 || conValor === 0) {
            return "";
        }
        if (conValor === 1) {
            return this.textos.t("Panel_SoloUna", total, plural);
        }
        const cuenta = conValor === total ? `${conValor} ${plural}` : this.textos.t("Panel_NDeM", conValor, total, plural);
        return this.textos.t(NOTAS[agregacion], cuenta);
    }

    // ------------------------------------------------------------------- zoom

    private zoomActivo(): boolean {
        return this.ajustes.zoom.activo.value && this.interactivo() && this.datos !== null;
    }

    private crearBotonesZoom(): void {
        const t = this.textos;
        const botones: Array<{ clase: string; texto: string; icono: string; accion: () => void }> = [
            { clase: "acercar", texto: t.t("Zoom_Acercar"), icono: "M6 1.5v9M1.5 6h9", accion: () => this.zoom.acercar() },
            { clase: "alejar", texto: t.t("Zoom_Alejar"), icono: "M1.5 6h9", accion: () => this.zoom.alejar() },
            {
                clase: "inicio", texto: t.t("Zoom_Inicio"), icono: "M1 4.5V1h3.5M7.5 1H11v3.5M11 7.5V11H7.5M4.5 11H1V7.5",
                accion: () => this.zoom.restablecer(),
            },
            {
                clase: "seleccion", texto: t.t("Zoom_Seleccion"), icono: "M6 .5v3M6 8.5v3M.5 6h3M8.5 6h3M7.8 6a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 1 1 3.6 0",
                accion: () => this.enfocarSeleccion(),
            },
        ];
        this.botonesZoom.attr("aria-label", t.t("Tarjeta_Zoom"));
        for (const b of botones) {
            const boton = this.botonesZoom.append("button")
                .attr("type", "button")
                .classed(`zoom-${b.clase}`, true)
                .attr("aria-label", b.texto)
                .attr("title", b.texto)
                .on("click", (evento: MouseEvent) => {
                    evento.stopPropagation();
                    b.accion();
                });
            boton.append("svg").attr("viewBox", "0 0 12 12").attr("aria-hidden", "true").append("path").attr("d", b.icono);
        }
    }

    /** Cada paso del zoom mueve la capa del mapa; al terminar, se recolocan las etiquetas. */
    private alHacerZoom(t: Transformacion, fin: boolean): void {
        this.capaMapa.attr("transform", transformar(t));
        if (fin) {
            this.dibujarEtiquetas();
        } else {
            // Durante el gesto las etiquetas se mueven con el mapa (y se estiran un momento).
            const r = t.k / this.tEtiquetas.k;
            this.capaEtiquetas.attr("transform", `translate(${t.x - r * this.tEtiquetas.x},${t.y - r * this.tEtiquetas.y}) scale(${r})`);
        }
        this.actualizarBotonesZoom();
    }

    private actualizarBotonesZoom(): void {
        const z = this.ajustes.zoom;
        const caja = this.distribucion?.mapa;
        const visible = Boolean(caja) && this.zoomActivo() && z.botones.value;
        this.botonesZoom.style("display", () => (visible ? null : "none"));
        if (!visible || !caja) {
            return;
        }
        const t = this.zoom.transformacion;
        const haySeleccion = this.seleccion.getSelectionIds().length > 0;
        // Si la leyenda está en la misma esquina, los botones pasan al otro lado.
        let posicion = String(z.posicion.value?.value ?? "arriba-derecha");
        if (this.ajustes.leyenda.mostrar.value && posicion === String(this.ajustes.leyenda.posicion.value?.value)) {
            posicion = posicion.endsWith("derecha") ? posicion.replace("derecha", "izquierda") : posicion.replace("izquierda", "derecha");
        }
        const esquinaAviso = this.aviso.attr("text-anchor") === "end" ? "arriba-derecha" : "arriba-izquierda";
        const bajoAviso = posicion === esquinaAviso && this.aviso.text() !== "" ? 16 : 0;
        const n = haySeleccion ? 4 : 3;
        const altoBotones = n * (LADO_BOTON + SEPARACION_BOTONES) - SEPARACION_BOTONES;
        this.botonesZoom
            .style("left", `${posicion.endsWith("derecha") ? caja.ancho - MARGEN - LADO_BOTON : MARGEN}px`)
            .style("top", `${posicion.startsWith("arriba") ? MARGEN + bajoAviso : caja.alto - MARGEN - altoBotones}px`);
        this.botonesZoom.select(".zoom-acercar").property("disabled", t.k >= this.zoom.escalaMaxima - 1e-6);
        this.botonesZoom.select(".zoom-alejar").property("disabled", t.k <= 1 + 1e-6);
        this.botonesZoom.select(".zoom-inicio").property("disabled", iguales(t, this.zoom.vistaInicial));
        this.botonesZoom.select(".zoom-seleccion").style("display", () => (haySeleccion ? null : "none"));
    }

    /** Acerca el mapa a lo seleccionado; sin selección, vuelve a la vista completa. */
    private enfocarSeleccion(): void {
        const camino = this.camino;
        const datos = this.datos;
        if (!camino || !datos) {
            return;
        }
        const ids = this.seleccion.getSelectionIds() as ISelectionId[];
        const geo = capa(datos.nivel);
        const areas = [...datos.filas.values()]
            .filter((f) => ids.some((id) => id.equals(f.id)))
            .map((f) => geo.porClave.get(f.clave))
            .filter((a): a is Area => a !== undefined);
        if (areas.length > 0) {
            this.zoom.enfocar(cajaDe(areas, camino));
        } else {
            this.zoom.restablecer();
        }
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
            this.seleccion.select(fila.id, multiple).then(() => this.aplicarSeleccion(true));
        }
    }

    /** Selecciona todas las áreas de un grupo (desde su entrada en la leyenda). */
    private seleccionarGrupo(grupo: string, multiple: boolean): void {
        if (!this.interactivo()) {
            return;
        }
        const ids = [...(this.datos?.filas.values() ?? [])].filter((f) => f.grupo === grupo).map((f) => f.id);
        if (ids.length > 0) {
            this.seleccion.select(ids, multiple).then(() => this.aplicarSeleccion(true));
        }
    }

    private limpiarSeleccion(): void {
        const habia = this.seleccion.getSelectionIds().length > 0;
        this.seleccion.clear().then(() => this.aplicarSeleccion(habia));
    }

    private alTeclear(evento: KeyboardEvent): void {
        if (evento.key === "Escape") {
            if (this.seleccion.getSelectionIds().length > 0) {
                this.limpiarSeleccion();
            }
            return;
        }
        if (!this.zoomActivo() || evento.ctrlKey || evento.metaKey || evento.altKey) {
            return;
        }
        const acciones: Record<string, () => void> = {
            "+": () => this.zoom.acercar(),
            "=": () => this.zoom.acercar(),
            "-": () => this.zoom.alejar(),
            "0": () => this.zoom.restablecer(),
        };
        const accion = acciones[evento.key];
        if (accion) {
            accion();
            evento.preventDefault();
        }
    }

    /**
     * Tras un cambio de selección: atenúa lo no seleccionado, abre o cierra el panel
     * (y si cambia, reacomoda el mapa) y, si se pidió en el formato, acerca el mapa.
     */
    private aplicarSeleccion(acercar: boolean): void {
        const foco = this.foco();
        if (this.viewport && this.debeAbrirPanel(foco) !== this.panelAbierto) {
            this.dibujar(this.viewport.width, this.viewport.height);
        } else {
            this.focoActual = foco;
            this.atenuar();
            this.dibujarPanel();
            this.actualizarBotonesZoom();
        }
        if (acercar && this.ajustes.zoom.acercarSeleccion.value && this.zoomActivo()) {
            this.enfocarSeleccion();
        }
    }

    /**
     * Atenúa lo no seleccionado (también ante marcadores). Lo que otro visual no
     * resalta ya está de fondo, en color neutro, y no se atenúa más.
     */
    private atenuar(): void {
        const ids = this.seleccion.getSelectionIds() as ISelectionId[];
        const filas = this.datos?.filas;
        const seleccionada = (a: Area): boolean => {
            const fila = filas?.get(a.clave);
            return Boolean(fila && ids.some((id) => id.equals(fila.id)));
        };
        this.capaAreas.selectAll<SVGPathElement, Area>("path.area")
            .attr("aria-selected", (a) => String(seleccionada(a)))
            .style("opacity", (a) => (ids.length === 0 || seleccionada(a) || this.esFondo(a) ? 1 : OPACIDAD_NO_SELECCIONADO));
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
        if (datos?.periodo && datos.nombrePeriodo) {
            items.push({ displayName: datos.nombrePeriodo, value: datos.periodo });
        }
        if (datos?.nombreValor) {
            items.push({ displayName: datos.nombreValor, value: fila?.texto ?? t.t("Texto_SinDato") });
        }
        if (datos?.nombreValor && datos.nombreValor2) {
            items.push({ displayName: datos.nombreValor2, value: fila?.texto2 ?? t.t("Texto_SinDato") });
            const terciles = fila && this.modo === "bivariado" ? this.coloreado?.terciles(fila) : null;
            if (terciles) {
                const nivelDe = (i: number): string => t.t(["Texto_Bajo", "Texto_Medio", "Texto_Alto"][i]);
                items.push({
                    displayName: t.t("Texto_Clase"),
                    value: t.t("Texto_ClaseBivariada", nivelDe(terciles[0]), datos.nombreValor, nivelDe(terciles[1]), datos.nombreValor2),
                });
            }
        }
        // Las bases (sin repetir Valor o Valor 2) y la diferencia de las dos primeras
        const medidas = datos?.medidas;
        if (medidas && medidas.bases.length > 0) {
            const mostradas = [medidas.valor, medidas.valor2].filter((m): m is Medida => m !== null);
            medidas.bases.forEach((b, i) => {
                const v = fila?.bases[i] ?? null;
                if (!mostradas.some((m) => mismaMedida(m, b))) {
                    items.push({ displayName: b.nombre, value: v === null ? t.t("Texto_SinDato") : this.formateador(b.formato)(v) });
                }
            });
            const c = fila && medidas.bases.length >= 2 ? comparar(fila.bases[0], fila.bases[1]) : null;
            if (c) {
                const relativa = c.relativa === null ? "" : ` (${this.formateador(FORMATO_RELATIVO)(c.relativa)})`;
                items.push({
                    displayName: t.t("Texto_DiferenciaVs", medidas.bases[1].nombre),
                    value: `${this.textoDiferencia(c.diferencia, medidas.bases[0].formato)}${relativa}`,
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
