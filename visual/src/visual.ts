"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { select, Selection } from "d3-selection";
import { geoConicConformal, geoContains, geoMercator, geoPath, GeoPath, GeoProjection } from "d3-geo";
import type { MultiPolygon } from "geojson";
import "./../style/visual.less";

import { Ajustes, ModoColor } from "./ajustes";
import { clasificar, Clasificacion, Metodo } from "./clasificacion";
import { Nivel, normalizarClave, nivelDeClave } from "./claves";
import { formatoCompacto, Unidades } from "./formato";
import { Area, bordes, capa, principal, unir } from "./geometria";
import { colorBivariado, coloresDivergentes, coloresSecuenciales } from "./paletas";
import { Cifra, LineaDiferencia, ModeloPanel, Panel, Recuadro } from "./panel";
import { Agregacion, AGREGACIONES, comparar, resumir } from "./resumen";
import { Textos } from "./textos";
import { Caja, IDENTIDAD, ModoRueda, Transformacion, Zoom } from "./zoom";

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
/** Franja de color de cada grupo, por dentro de su contorno (px). */
const ANCHO_FRANJA = 4;
const LADO_BOTON = 26;
const SEPARACION_BOTONES = 4;
/** Escala máxima: los municipios más chicos necesitan acercarse más. */
const ZOOM_MAXIMO: Record<Nivel, number> = { estado: 10, municipio: 40 };
// Las claves de texto se escriben completas para que la prueba de traducciones las encuentre.
const NOTAS: Record<Agregacion, string> = {
    suma: "Panel_Suma",
    promedio: "Panel_Promedio",
    minimo: "Panel_Minimo",
    maximo: "Panel_Maximo",
    rango: "Panel_Rango",
};

/** Una medida de Valor, Valor 2, Bases o Tarjetas, con lo que necesita el panel. */
interface Medida {
    nombre: string;
    formato: string | undefined;
    /** queryName de Power BI: identifica la medida en el panel de formato. */
    consulta: string;
    agregacion: Agregacion;
}

/** Un área con datos: lo que Power BI mandó para su clave. */
interface Fila {
    clave: string;
    valor: number | null;
    texto: string;
    valor2: number | null;
    texto2: string;
    /** Un valor por medida de Bases y de Tarjetas, en su orden. */
    bases: Array<number | null>;
    tarjetas: Array<number | null>;
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

/** Caja y punto de un área para su etiqueta, en coordenadas sin zoom. */
interface Ancla {
    area: Area;
    caja: Caja;
    punto: [number, number] | null;
}

type Sel<E extends Element> = Selection<E, unknown, null, undefined>;

const esSinMunicipio = (clave: string): boolean => clave.length === 5 && clave.endsWith("000");
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
    private readonly capaMapa: Sel<SVGGElement>;
    private readonly capaAreas: Sel<SVGGElement>;
    private readonly limitesEstatales: Sel<SVGPathElement>;
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
    private readonly zoom: Zoom;
    /** Prefijo de los id de los clipPath (único por copia del visual). */
    private readonly prefijo = `mx${++instancias}`;
    private ajustes = new Ajustes();
    private datos: Datos | null = null;
    private modo: ModoColor = "valor";
    private serieColor: Serie | null = null;
    private coloreado: Coloreado | null = null;
    private grupos: Grupo[] = [];
    /** Se dibujan las franjas de color de los grupos (y su sección en la leyenda). */
    private hayFranjas = false;
    private firmaGrupos = "";
    private readonly formasGrupo = new Map<string, MultiPolygon>();
    private firmaGeometria = "";
    /** La geometría sin el tamaño: si solo cambia el tamaño, el zoom conserva la vista. */
    private tipoGeometria = "";
    private viewport: powerbi.IViewport | null = null;
    private distribucion: Distribucion | null = null;
    private panelAbierto = false;
    /** Las áreas del panel, calculadas una vez por dibujo o por cambio de selección. */
    private focoActual: Fila[] = [];
    private proyeccion: GeoProjection | null = null;
    private camino: GeoPath | null = null;
    private visibles: Area[] = [];
    private anclas: Ancla[] = [];
    private firmaAnclas = "";
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
        // Todo lo que se acerca con el zoom va en esta capa.
        this.capaMapa = this.svg.append("g").classed("capa-mapa", true);
        this.capaAreas = this.capaMapa.append("g").classed("areas", true);
        // Capas de líneas (fill="none" también como atributo, por si la hoja de estilos no carga)
        this.limitesEstatales = this.capaMapa.append("path").classed("limites-estatales", true).attr("fill", "none");
        this.capaFranjas = this.capaMapa.append("g").classed("franjas-grupo", true);
        this.haloGrupos = this.capaMapa.append("path").classed("halo-grupos", true).attr("fill", "none");
        this.contornoGrupos = this.capaMapa.append("path").classed("contorno-grupos", true).attr("fill", "none");
        this.resaltado = this.capaMapa.append("path").classed("resaltado", true).attr("fill", "none").style("display", "none");
        this.capaEtiquetas = this.svg.append("g").classed("etiquetas", true);
        this.capaLeyenda = this.svg.append("g").classed("leyenda", true);
        this.aviso = this.svg.append("text").classed("aviso", true);
        this.botonesZoom = this.lienzo.append("div").classed("zoom-botones", true).attr("role", "group").style("display", "none");
        this.panel = new Panel(raiz, () => this.limpiarSeleccion());
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

    // ------------------------------------------------------------------ datos

    /**
     * Lee los campos por rol (Ubicación, Grupo, Valor, Valor 2, Bases, Tarjetas,
     * Tooltips), nunca por nombre. Si Ubicación es una jerarquía (drill-down), usa el
     * nivel más profundo.
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
        const colBases = columnas.filter((c) => c.source.roles?.bases);
        const colTarjetas = columnas.filter((c) => c.source.roles?.tarjetas);
        const colTooltips = columnas.filter((c) => c.source.roles?.tooltips);
        const resaltes = (colValor ?? colBases[0])?.highlights;
        const exacto = this.formateador(colValor?.source.format);
        const exacto2 = this.formateador(colValor2?.source.format);
        const formatosExtra = colTooltips.map((c) => this.formateador(c.source.format));
        const numero = (v: PrimitiveValue | undefined): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

        // Las bases se suman por omisión (son volúmenes de cada fuente); lo demás muestra
        // el rango hasta que se elija cómo combinarlo. Una medida en dos campos es una sola.
        const consultaDe = (c: DataViewValueColumn): string => c.source.queryName ?? c.source.displayName;
        const enBases = new Set(colBases.flatMap((c) => [consultaDe(c), c.source.displayName]));
        const medida = (c: DataViewValueColumn): Medida => ({
            nombre: c.source.displayName,
            formato: c.source.format,
            consulta: consultaDe(c),
            agregacion: agregacionDe(c.source.objects, enBases.has(consultaDe(c)) || enBases.has(c.source.displayName) ? "suma" : "rango"),
        });

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
            medidas: {
                valor: colValor ? medida(colValor) : null,
                valor2: colValor2 ? medida(colValor2) : null,
                bases: colBases.map(medida),
                tarjetas: colTarjetas.map(medida),
            },
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
                bases: colBases.map((c) => numero(c.values[i])),
                tarjetas: colTarjetas.map((c) => numero(c.values[i])),
                grupo: grupo === null || grupo === undefined || grupo === "" ? null : String(grupo),
                resaltado: !resaltes || (resaltes[i] !== null && resaltes[i] !== undefined),
                extras: colTooltips.map((c, j) => ({ displayName: c.source.displayName, value: this.texto(c.values[i], formatosExtra[j]) })),
                id: constructor.createSelectionId(),
            });
            datos.estadosCubiertos.add(clave.slice(0, 2));
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
        // Una lista por medida del panel (sin repetir la que está en dos campos)
        const { bases, tarjetas } = this.medidasPanel();
        const unicas = new Map([...bases, ...tarjetas].map((m) => [m.consulta, m]));
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

    private colorear(sinDato: string): Coloreado {
        const datos = this.datos;
        const filas = datos ? [...datos.filas.values()] : [];
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
        this.focoActual = this.foco();
        this.panelAbierto = this.debeAbrirPanel(this.focoActual);
        const distribucion = this.distribuir(ancho, alto, this.panelAbierto);
        this.distribucion = distribucion;
        const { ancho: anchoMapa, alto: altoMapa } = distribucion.mapa;
        this.lienzo
            .style("left", `${distribucion.mapa.x}px`)
            .style("top", `${distribucion.mapa.y}px`)
            .style("width", `${anchoMapa}px`)
            .style("height", `${altoMapa}px`);
        this.svg.attr("width", anchoMapa).attr("height", altoMapa);

        const datos = this.datos;
        const nivel: Nivel = datos?.nivel ?? "estado";
        const geo = capa(nivel);
        // En municipios solo se dibujan los estados que traen datos (al hacer
        // drill-down a un estado, el mapa se acerca a él).
        const visibles = nivel === "municipio" && datos ? geo.areas.filter((a) => datos.estadosCubiertos.has(a.estado)) : geo.areas;
        this.visibles = visibles;
        const ajustes = this.ajustes;
        const paleta = this.host.colorPalette;
        const altoContraste = paleta.isHighContrast;
        const colorTexto = altoContraste ? paleta.foreground.value : null;

        const sinDato = altoContraste ? paleta.background.value : ajustes.colores.sinDato.value.value;
        const borde = altoContraste ? paleta.foreground.value : ajustes.mapa.borde.value.value;

        const nombreProyeccion = String(ajustes.mapa.proyeccion.value?.value ?? "lambert");
        const proyeccion = this.crearProyeccion();
        const encuadre = visibles.length ? visibles : capa("estado").areas;
        proyeccion.fitExtent(
            [[MARGEN, MARGEN], [Math.max(MARGEN + 1, anchoMapa - MARGEN), Math.max(MARGEN + 1, altoMapa - MARGEN)]],
            { type: "FeatureCollection", features: encuadre.map((a) => a.forma) },
        );
        const camino = geoPath(proyeccion);

        // El trazo de las áreas solo se recalcula si cambia la geometría.
        const tipo = [nivel, nombreProyeccion, [...(datos?.estadosCubiertos ?? [])].sort().join(",")].join("|");
        const firma = [tipo, anchoMapa, altoMapa].join("|");
        const geometriaNueva = firma !== this.firmaGeometria;
        // Zoom: si solo cambió el tamaño (se abrió el panel), se conserva el centro y la escala.
        let destino: Transformacion | null = null;
        if (geometriaNueva) {
            const t = this.zoom.transformacion;
            const centro = tipo === this.tipoGeometria && previo && t.k > 1 && this.proyeccion?.invert
                ? this.proyeccion.invert([(previo.ancho / 2 - t.x) / t.k, (previo.alto / 2 - t.y) / t.k])
                : null;
            const p = centro ? proyeccion(centro) : null;
            destino = p ? { k: t.k, x: anchoMapa / 2 - t.k * p[0], y: altoMapa / 2 - t.k * p[1] } : IDENTIDAD;
        }
        this.zoom.configurar(anchoMapa, altoMapa, ZOOM_MAXIMO[nivel], {
            activo: this.zoomActivo(),
            rueda: String(ajustes.zoom.rueda.value?.value ?? "siempre") as ModoRueda,
        });
        if (destino) {
            this.zoom.fijar(destino);
        }
        this.capaMapa.attr("transform", transformar(this.zoom.transformacion));
        this.firmaGeometria = firma;
        this.tipoGeometria = tipo;
        this.proyeccion = proyeccion;
        this.camino = camino;

        this.prepararGrupos(altoContraste);
        const coloreado = this.colorear(sinDato);
        this.coloreado = coloreado;

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

        this.dibujarFranjas(altoContraste);
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
        this.dibujarEtiquetas();
        if (this.modo === "bivariado") {
            this.dibujarLeyendaBivariada(sinDato, borde, visibles.length, anchoMapa, altoMapa, colorTexto);
        } else {
            this.dibujarLeyenda(coloreado, sinDato, borde, visibles.length, anchoMapa, altoMapa, colorTexto);
        }
        this.dibujarAviso(anchoMapa, colorTexto);
        this.dibujarMensaje();
        this.dibujarPanel();
        this.actualizarBotonesZoom();
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
        if (!datos || !caja || (!conAreas && !conGrupos)) {
            return;
        }
        const paleta = this.host.colorPalette;
        const colorTexto = paleta.isHighContrast ? paleta.foreground.value : null;
        const halo = paleta.isHighContrast ? paleta.background.value : COLOR_HALO;
        const enVista = (x: number, y: number): boolean => x >= 0 && y >= 0 && x <= caja.ancho && y <= caja.alto;

        interface Candidata { lineas: string[]; x: number; y: number; ancho: number; alto: number; prioridad: number }
        const colocadas: Candidata[] = [];
        const choca = (c: Candidata): boolean => colocadas.some((o) =>
            Math.abs(c.x - o.x) * 2 < c.ancho + o.ancho + 4 && Math.abs(c.y - o.y) * 2 < c.alto + o.alto + 2);
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
                if (!g.punto) {
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

        if (!conAreas) {
            return;
        }
        const contenido = String(ajustes.contenido.value?.value ?? "valor");
        const tam = acotar(ajustes.tamano.value, 6, 24);
        const interlineado = tam * 1.15;
        const serie = this.serieColor;
        const compacto = this.compacto(serie?.formato);
        const candidatas: Candidata[] = [];
        for (const { area: a, caja: [[x0, y0], [x1, y1]], punto } of this.anclasActuales()) {
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
            const etiqueta = texto(c.x, c.y - ((c.lineas.length - 1) * interlineado) / 2, tam, ajustes.color.value.value);
            c.lineas.forEach((linea, i) => etiqueta.append("tspan").attr("x", c.x).attr("dy", i === 0 ? 0 : interlineado).text(linea));
        }
    }

    private dibujarLeyenda(
        coloreado: Coloreado, sinDato: string, borde: string,
        visibles: number, ancho: number, alto: number, colorTexto: string | null,
    ): void {
        const ajustes = this.ajustes.leyenda;
        const datos = this.datos;
        const t = this.textos;
        this.capaLeyenda.selectAll("*").remove();
        if (!ajustes.mostrar.value || !datos) {
            return;
        }

        const entradas: EntradaLeyenda[] = [];
        let tituloPorOmision = "";
        if (this.modo === "grupo") {
            tituloPorOmision = datos.nombreGrupo ?? "";
            entradas.push(...this.grupos.map((g) => ({ color: g.color, texto: g.nombre, grupo: g.nombre })));
            if ([...datos.filas.values()].filter((f) => f.grupo !== null).length < visibles) {
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
            const conValor = [...datos.filas.values()].filter((f) => serie.de(f) !== null).length;
            if (conValor < visibles) {
                entradas.push({ color: sinDato, texto: t.t("Texto_SinDato") });
            }
            if (this.hayFranjas) {
                entradas.push({ color: "", texto: datos.nombreGrupo ?? "", seccion: true });
                entradas.push(...this.grupos.map((g) => ({ color: g.color, texto: g.nombre, grupo: g.nombre, franja: true })));
            }
        }

        // Medidas aproximadas: el texto se mide por número de caracteres.
        const tam = acotar(ajustes.tamano.value, 8, 24);
        const fila = Math.round(tam * 1.7);
        const cuadro = Math.round(tam * 1.15);
        const recortar = this.recortador(ancho, tam);
        const titulo = recortar(ajustes.titulo.value || tituloPorOmision);
        // Con muchos grupos, van en dos columnas para que la leyenda no tape el mapa;
        // si aun así no caben, se recortan y se dice cuántos faltan.
        const deGrupo = (e: EntradaLeyenda): boolean => e.grupo !== undefined;
        const filasCon = (columnas: number): number => {
            const n = entradas.filter(deGrupo).length;
            return entradas.length - n + Math.ceil(n / columnas);
        };
        const columnas = entradas.filter(deGrupo).length >= 4 && ((titulo ? 1 : 0) + filasCon(1)) * fila + 8 > alto * 0.45 ? 2 : 1;
        const maxFilas = Math.max(2, Math.floor((alto - 2 * MARGEN - 8) / fila) - (titulo ? 1 : 0));
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
        const anchoTexto = Math.max(titulo.length * 0.6 * tam, columnas * anchoGrupo, ...entradas.filter((e) => !deGrupo(e)).map(anchoEntrada));
        const anchoCaja = Math.min(ancho - 2 * MARGEN, Math.ceil(anchoTexto + 14));
        const altoCaja = (titulo ? fila : 0) + filasCon(columnas) * fila + 8;
        const anchoColumna = (anchoCaja - 4) / columnas;
        const maxGrupo = Math.max(4, Math.floor((anchoColumna - cuadro - 17) / (tam * 0.56)));
        const recortarGrupo = columnas > 1 ? (texto: string): string => (texto.length > maxGrupo ? `${texto.slice(0, maxGrupo - 1)}…` : texto) : recortar;
        const filasGrupo = Math.ceil(entradas.filter(deGrupo).length / columnas);

        const capaLeyenda = this.posicionarLeyenda(anchoCaja, altoCaja, ancho, alto);
        let yy = 4;
        if (titulo) {
            capaLeyenda.append("text").classed("titulo", true)
                .attr("x", 7).attr("y", yy + fila / 2).attr("dominant-baseline", "central")
                .style("font-size", `${tam}px`).style("fill", () => colorTexto).text(titulo);
            yy += fila;
        }
        let j = 0;
        let yGrupos = 0;
        for (const e of entradas) {
            let x = 7;
            let y = yy;
            if (deGrupo(e)) {
                // Los grupos llenan las columnas de arriba abajo.
                if (j === 0) {
                    yGrupos = yy;
                    yy += filasGrupo * fila;
                }
                x = 7 + Math.floor(j / filasGrupo) * anchoColumna;
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
                .attr("x", x).attr("y", y + (fila - cuadro) / 2).attr("width", cuadro).attr("height", cuadro).attr("rx", 2);
            if (e.franja) {
                muestra.attr("fill", sinDato).attr("stroke", e.color).attr("stroke-width", 3);
            } else {
                muestra.attr("fill", e.color).attr("stroke", borde);
            }
            destino.append("text").classed("etiqueta", true)
                .attr("x", x + cuadro + 6).attr("y", y + fila / 2).attr("dominant-baseline", "central")
                .style("font-size", `${tam}px`).style("fill", () => colorTexto).text((grupo === undefined ? recortar : recortarGrupo)(e.texto));
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
        } else if (d.nombreValor === null && d.medidas.bases.length === 0) {
            texto = this.textos.t("Mensaje_SinValor");
        }
        this.mensaje.style("display", () => (texto ? null : "none")).text(texto);
    }

    // ---------------------------------------------------------- panel de detalle

    private debeAbrirPanel(foco: Fila[]): boolean {
        return this.ajustes.panel.mostrar.value && this.interactivo() && foco.length > 0;
    }

    /** Las áreas del panel: las seleccionadas o, si se pidió, todas las que tienen datos. */
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
        return this.ajustes.panel.sinSeleccion.value ? filas : [];
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
        }, {
            region: t.t("Panel_Region"),
            comparacion: t.t("Panel_Comparacion"),
            tarjetas: t.t("Panel_Tarjetas"),
            detalle: t.t("Panel_Detalle", t.t(this.datos.nivel === "municipio" ? "Texto_Municipio" : "Texto_Estado").toLocaleLowerCase(this.host.locale)),
            cerrar: t.t("Panel_Cerrar"),
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
        const n = foco.length;
        const cuenta = `${n} ${plural}`;

        let titulo: string;
        let subtitulo: string;
        if (n === 1) {
            const f = foco[0];
            const area = geo.porClave.get(f.clave);
            titulo = nombre(f);
            subtitulo = [municipal && area ? this.nombreEstado(area) : null, f.grupo].filter(Boolean).join(" · ");
        } else if (!haySeleccion) {
            titulo = t.t("Panel_Todos", plural);
            subtitulo = t.t("Panel_ConDatos", cuenta);
        } else {
            const grupos = new Set(foco.map((f) => f.grupo));
            const grupo = grupos.size === 1 ? [...grupos][0] : null;
            const todoElGrupo = grupo !== null && [...datos.filas.values()].filter((f) => f.grupo === grupo).length === n;
            titulo = todoElGrupo ? grupo : cuenta;
            subtitulo = todoElGrupo ? cuenta : `${foco.slice(0, 4).map(nombre).join(", ")}${n > 4 ? ", …" : ""}`;
        }

        const { bases, tarjetas } = this.medidasPanel();
        const cifra = (m: Medida, color: string): Cifra => {
            const r = resumir(foco.map((f) => this.valorDe(f, m)), m.agregacion);
            const compacto = this.compacto(m.formato);
            const texto = r.valor !== null ? compacto(r.valor)
                : r.min !== null && r.max !== null ? (r.min === r.max ? compacto(r.min) : `${compacto(r.min)} – ${compacto(r.max)}`)
                : t.t("Texto_SinDato");
            return {
                nombre: m.nombre,
                texto,
                exacto: r.valor !== null ? this.formateador(m.formato)(r.valor) : "",
                nota: this.nota(m.agregacion, r.n, n, plural),
                valor: r.valor,
                color,
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
                    return { nombre: nombre(f), celdas };
                }),
                resto: n > MAX_FILAS_DETALLE ? t.t("Panel_Resto", n - MAX_FILAS_DETALLE) : "",
            };
        }

        const sinDato = this.host.colorPalette.isHighContrast ? this.host.colorPalette.background.value : this.ajustes.colores.sinDato.value.value;
        const silueta = p.silueta.value && n <= MAX_SILUETA
            ? foco.map((f) => geo.porClave.get(f.clave)).filter((a): a is Area => a !== undefined)
                .map((area) => ({ forma: principal(area), color: this.coloreado?.color(area) ?? sinDato }))
            : [];

        return {
            titulo,
            subtitulo,
            cerrar: haySeleccion,
            silueta,
            bases: cifrasBases,
            diferencias,
            tarjetas: tarjetas.map((m) => cifra(m, "")),
            detalle,
        };
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
        const enInicio = t.k <= 1 + 1e-6;
        this.botonesZoom.select(".zoom-acercar").property("disabled", t.k >= this.zoom.escalaMaxima - 1e-6);
        this.botonesZoom.select(".zoom-alejar").property("disabled", enInicio);
        this.botonesZoom.select(".zoom-inicio").property("disabled", enInicio);
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
        let caja: Caja | null = null;
        for (const f of datos.filas.values()) {
            const area = geo.porClave.get(f.clave);
            if (!area || !ids.some((id) => id.equals(f.id))) {
                continue;
            }
            const [[x0, y0], [x1, y1]] = camino.bounds(principal(area));
            caja = caja ? [[Math.min(caja[0][0], x0), Math.min(caja[0][1], y0)], [Math.max(caja[1][0], x1), Math.max(caja[1][1], y1)]] : [[x0, y0], [x1, y1]];
        }
        if (caja) {
            this.zoom.enfocar(caja);
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
     * Atenúa lo no seleccionado y lo que otro visual no resalta; también responde a
     * marcadores y a selecciones hechas en otros visuales.
     */
    private atenuar(): void {
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
