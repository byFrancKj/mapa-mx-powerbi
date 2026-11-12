"use strict";

import { Selection } from "d3-selection";
import { geoPath, GeoProjection } from "d3-geo";
import type { Feature, Geometry } from "geojson";

type Sel<E extends Element> = Selection<E, unknown, null, undefined>;

/** Una cifra del panel: una base o una tarjeta, ya combinada y con formato. */
export interface Cifra {
    nombre: string;
    /** Valor combinado y abreviado ($366.4 M), o el rango. */
    texto: string;
    /** Valor exacto con el formato de la medida (título emergente). */
    exacto: string;
    /** Cómo se combinó: "suma de 3 estados", "rango de 3 estados"… */
    nota: string;
    /** Valor combinado, para las barras de la comparación. */
    valor: number | null;
    color: string;
    /** Un texto de DAX y no una cifra: no se abrevia ni se recorta. */
    esTexto: boolean;
    /** Los textos cuando difieren entre áreas (entonces `texto` va vacío). */
    porArea: Array<{ areas: string; texto: string }>;
}

export interface LineaDiferencia {
    nombre: string;
    texto: string;
    /** -1, 0 o 1: colorea en rojo o verde. */
    signo: number;
}

/** Por qué está abierto el panel. */
export type MotivoPanel = "seleccion" | "filtro" | "resaltado" | "todo";

/** Una columna de la tabla por área: una medida, o una cifra que calcula el visual. */
export interface ColumnaDetalle {
    /** La identifica al ordenar. */
    clave: string;
    nombre: string;
    /** De dónde sale la cifra (título emergente): "Ventas − Ventas AA", por ejemplo. */
    titulo: string;
    /** Un texto de DAX: va a la izquierda y se recorta. */
    esTexto: boolean;
}

export interface CeldaDetalle {
    texto: string;
    /** -1 o 1 en una diferencia (rojo o verde); 0 en las demás. */
    signo: number;
}

/** Una fila de la tabla por área: un clic la selecciona en el mapa. */
export interface FilaDetalle {
    clave: string;
    nombre: string;
    /** Su color en el mapa. */
    color: string;
    celdas: CeldaDetalle[];
    /** Primera columna entre su máximo (0 a 1), para la barra; null sin dato. */
    barra: number | null;
}

/** La tabla por área, ya ordenada. */
export interface TablaDetalle {
    /** Encabezado de la columna de áreas (Estado o Municipio). */
    area: string;
    columnas: ColumnaDetalle[];
    filas: FilaDetalle[];
    /** Lo que calculó DAX para todo lo que muestra la tabla; null si no hay ese total. */
    total: { nombre: string; celdas: CeldaDetalle[] } | null;
    /** La columna que ordena la tabla ("" es la de áreas). */
    orden: { columna: string; descendente: boolean };
    resto: string;
}

export interface ModeloPanel {
    titulo: string;
    subtitulo: string;
    /** Etiqueta sobre el título (Selección, Filtrado, Desde otro visual); vacía si resume todo. */
    motivo: string;
    /** Color de la región o del área; null: el de la hoja de estilos. */
    acento: string | null;
    /** El botón × quita la selección; si no hay selección, oculta el panel. */
    quitaSeleccion: boolean;
    /** Las áreas sin sus islas lejanas, con su color del mapa. */
    silueta: Array<{ forma: Feature<Geometry>; color: string }>;
    bases: Cifra[];
    /** Una por cada base contra la primera. */
    diferencias: Array<{ titulo: string; lineas: LineaDiferencia[] }>;
    tarjetas: Cifra[];
    /** Tabla por área (con varias áreas o con columnas propias). */
    detalle: TablaDetalle | null;
}

export interface EstiloPanel {
    tamanoTexto: number;
    posicion: "derecha" | "abajo" | "encima";
    /** Abajo y ancho: las secciones van lado a lado. */
    horizontal: boolean;
    colorSigno: boolean;
    colores: { texto: string | null; fondo: string | null; positivo: string; negativo: string };
    proyeccion: () => GeoProjection;
    /** Se puede elegir un área desde la tabla (no en un tablero o una exportación). */
    interactivo: boolean;
}

export interface TextosPanel {
    region: string;
    comparacion: string;
    tarjetas: string;
    detalle: string;
    cerrar: string;
    ocultar: string;
    elegir: (nombre: string) => string;
}

/** Lo que el panel le pide al visual. */
export interface AccionesPanel {
    /** El botón ×. */
    cerrar(): void;
    /** Clic (o Enter) en una fila de la tabla. */
    elegir(clave: string, multiple: boolean): void;
    /** El cursor entra a una fila (o sale, con null): se marca el área en el mapa. */
    senalar(clave: string | null): void;
    /** Clic en un encabezado de la tabla ("" es la columna de áreas). */
    ordenar(columna: string, descendente: boolean): void;
}

export interface Recuadro {
    x: number;
    y: number;
    ancho: number;
    alto: number;
}

const ANCHO_SILUETA = 76;
const ALTO_SILUETA = 58;
/** Un texto más largo que esto ya no cabe en una tarjeta angosta. */
const LARGO_TEXTO_CORTO = 16;

export class Panel {
    private readonly raiz: Sel<HTMLElement>;
    /** El encabezado con el que se acaba de ordenar: al redibujar conserva el foco y el desplazamiento. */
    private reordenada: string | null = null;

    constructor(contenedor: Sel<HTMLElement>, private readonly acciones: AccionesPanel) {
        this.raiz = contenedor.append("aside").classed("panel", true).attr("role", "region").style("display", "none");
    }

    ocultar(): void {
        this.reordenada = null;
        this.raiz.style("display", "none").selectAll("*").remove();
    }

    dibujar(m: ModeloPanel, e: EstiloPanel, t: TextosPanel, caja: Recuadro): void {
        const r = this.raiz;
        const desplazamiento = this.reordenada === null ? 0 : r.select<HTMLDivElement>(".panel-cuerpo").node()?.scrollTop ?? 0;
        r.selectAll("*").remove();
        r.style("display", null)
            .attr("aria-label", t.region)
            .classed("abajo", e.posicion === "abajo")
            .classed("encima", e.posicion === "encima")
            .classed("horizontal", e.horizontal)
            .style("left", `${caja.x}px`)
            .style("top", `${caja.y}px`)
            .style("width", `${caja.ancho}px`)
            .style("height", `${caja.alto}px`)
            .style("font-size", `${e.tamanoTexto}px`)
            // Alto contraste: solo los colores del tema (en otro caso, los de la hoja de estilos)
            .style("--panel-texto", () => e.colores.texto)
            .style("--panel-fondo", () => e.colores.fondo)
            .style("--acento", () => e.colores.texto ?? m.acento)
            .style("--positivo", e.colores.positivo)
            .style("--negativo", e.colores.negativo);

        const encabezado = r.append("header").classed("panel-encabezado", true);
        if (m.silueta.length > 0) {
            this.dibujarSilueta(encabezado, m.silueta, e);
        }
        const titulos = encabezado.append("div").classed("panel-titulos", true);
        if (m.motivo) {
            titulos.append("p").classed("panel-motivo", true).text(m.motivo);
        }
        titulos.append("h2").classed("panel-titulo", true).attr("title", m.titulo).text(m.titulo);
        if (m.subtitulo) {
            titulos.append("p").classed("panel-subtitulo", true).attr("title", m.subtitulo).text(m.subtitulo);
        }
        const textoCerrar = m.quitaSeleccion ? t.cerrar : t.ocultar;
        encabezado.append("button")
            .attr("type", "button")
            .classed("panel-cerrar", true)
            .attr("aria-label", textoCerrar)
            .attr("title", textoCerrar)
            .text("×")
            .on("click", (evento: MouseEvent) => {
                evento.stopPropagation();
                this.acciones.cerrar();
            });

        const cuerpo = r.append("div").classed("panel-cuerpo", true);
        if (m.bases.length > 0) {
            this.dibujarComparacion(cuerpo, m, e, t);
        }
        if (m.tarjetas.length > 0) {
            const seccion = this.seccion(cuerpo, t.tarjetas);
            const rejilla = seccion.append("div").classed("tarjetas", true);
            for (const c of m.tarjetas) {
                // Un texto largo o de varias líneas (un Top 3) ocupa todo el ancho del panel.
                const ancha = c.esTexto && (c.porArea.length > 0 || c.texto.length > LARGO_TEXTO_CORTO || c.texto.includes("\n"));
                const tarjeta = rejilla.append("div")
                    .classed("tarjeta", true)
                    .classed("ancha", ancha)
                    .attr("title", c.exacto ? `${c.nombre}: ${c.exacto}` : c.nombre);
                tarjeta.append("div").classed("tarjeta-nombre", true).text(c.nombre);
                if (c.porArea.length > 0) {
                    const lista = tarjeta.append("dl").classed("tarjeta-areas", true);
                    for (const a of c.porArea) {
                        lista.append("dt").text(a.areas);
                        lista.append("dd").text(a.texto);
                    }
                } else {
                    // Un rango ("+6.4% – +15.7%") va más chico para que quepa completo.
                    tarjeta.append("div")
                        .classed("tarjeta-valor", true)
                        .classed("largo", c.texto.length > 11)
                        .classed("texto", c.esTexto)
                        .text(c.texto);
                }
                if (c.nota) {
                    tarjeta.append("div").classed("nota", true).text(c.nota);
                }
            }
        }
        if (m.detalle) {
            this.dibujarDetalle(this.seccion(cuerpo, t.detalle).classed("seccion-tabla", true), m.detalle, e, t);
        }
        const nodo = cuerpo.node();
        if (nodo && desplazamiento > 0) {
            nodo.scrollTop = desplazamiento;
        }
        this.reordenada = null;
    }

    private seccion(cuerpo: Sel<HTMLDivElement>, titulo: string): Sel<HTMLElement> {
        const seccion = cuerpo.append("section").classed("panel-seccion", true);
        seccion.append("h3").text(titulo);
        return seccion;
    }

    /** Las bases con barras proporcionales y, debajo, cada una contra la primera. */
    private dibujarComparacion(cuerpo: Sel<HTMLDivElement>, m: ModeloPanel, e: EstiloPanel, t: TextosPanel): void {
        const seccion = this.seccion(cuerpo, t.comparacion);
        const maximo = Math.max(0, ...m.bases.map((b) => Math.abs(b.valor ?? 0)));
        for (const b of m.bases) {
            const fila = seccion.append("div").classed("base", true).attr("title", b.exacto ? `${b.nombre}: ${b.exacto}` : b.nombre);
            const linea = fila.append("div").classed("base-linea", true);
            linea.append("span").classed("base-punto", true).style("background", e.colores.texto ?? b.color);
            linea.append("span").classed("base-nombre", true).text(b.nombre);
            linea.append("span").classed("base-valor", true).text(b.texto);
            if (b.valor !== null && maximo > 0) {
                fila.append("div").classed("barra", true)
                    .append("div").classed("barra-relleno", true)
                    .style("width", `${Math.max(1, (Math.abs(b.valor) / maximo) * 100).toFixed(1)}%`)
                    .style("background", e.colores.texto ?? b.color);
            }
            if (b.nota) {
                fila.append("div").classed("nota", true).text(b.nota);
            }
        }
        for (const d of m.diferencias) {
            const grupo = seccion.append("div").classed("diferencias", true);
            grupo.append("div").classed("diferencias-titulo", true).attr("title", d.titulo).text(d.titulo);
            // Una cifra por renglón de la lista: diferencia, diferencia % e índice.
            const lista = grupo.append("dl").classed("diferencia-cifras", true);
            for (const l of d.lineas) {
                const cifra = lista.append("div")
                    .classed("cifra-dif", true)
                    .classed("positivo", e.colorSigno && l.signo > 0)
                    .classed("negativo", e.colorSigno && l.signo < 0);
                cifra.append("dt").text(l.nombre);
                cifra.append("dd")
                    .classed("positivo", e.colorSigno && l.signo > 0)
                    .classed("negativo", e.colorSigno && l.signo < 0)
                    .text(l.texto);
            }
        }
    }

    /**
     * Tabla por área con una barra en la primera columna. Un clic en un encabezado la
     * ordena por esa columna (otro clic invierte el orden). Un clic (o Enter) en una fila
     * selecciona esa área en el mapa; pasar el cursor la marca.
     */
    private dibujarDetalle(seccion: Sel<HTMLElement>, detalle: TablaDetalle, e: EstiloPanel, t: TextosPanel): void {
        const tabla = seccion.append("table").classed("detalle", true);
        const encabezados = tabla.append("thead").append("tr");
        const encabezado = (clave: string, nombre: string, titulo: string, esTexto: boolean): void => {
            const ordenada = detalle.orden.columna === clave;
            const th = encabezados.append("th")
                .attr("scope", "col")
                .attr("title", titulo)
                .classed("texto", esTexto)
                .attr("aria-sort", ordenada ? (detalle.orden.descendente ? "descending" : "ascending") : null);
            if (!e.interactivo) {
                th.text(nombre);
                return;
            }
            const boton = th.append("button")
                .attr("type", "button")
                .classed("ordenar", true)
                .text(nombre)
                .on("click", (evento: MouseEvent) => {
                    evento.stopPropagation();
                    this.reordenada = clave;
                    // Las cifras empiezan de mayor a menor; los textos, de la A a la Z.
                    this.acciones.ordenar(clave, ordenada ? !detalle.orden.descendente : !esTexto);
                });
            if (this.reordenada === clave) {
                boton.node()?.focus({ preventScroll: true });
            }
        };
        encabezado("", detalle.area, detalle.area, true);
        for (const c of detalle.columnas) {
            encabezado(c.clave, c.nombre, c.titulo, c.esTexto);
        }
        const celda = (fila: Sel<HTMLTableRowElement>, c: CeldaDetalle, i: number): Sel<HTMLTableCellElement> => {
            const esTexto = detalle.columnas[i]?.esTexto ?? false;
            return fila.append("td")
                .classed("texto", esTexto)
                .classed("positivo", e.colorSigno && c.signo > 0)
                .classed("negativo", e.colorSigno && c.signo < 0)
                .attr("title", esTexto ? c.texto : null)
                .text(c.texto);
        };
        const cuerpoTabla = tabla.append("tbody");
        for (const f of detalle.filas) {
            const fila = cuerpoTabla.append("tr");
            if (e.interactivo) {
                fila.classed("elegible", true)
                    .attr("tabindex", 0)
                    .attr("aria-label", t.elegir(f.nombre))
                    .on("click", (evento: MouseEvent) => {
                        evento.stopPropagation();
                        this.acciones.elegir(f.clave, evento.ctrlKey || evento.metaKey || evento.shiftKey);
                    })
                    .on("keydown", (evento: KeyboardEvent) => {
                        if (evento.key === "Enter" || evento.key === " ") {
                            evento.preventDefault();
                            this.acciones.elegir(f.clave, evento.ctrlKey || evento.metaKey);
                        }
                    })
                    .on("pointerenter", () => this.acciones.senalar(f.clave))
                    .on("pointerleave", () => this.acciones.senalar(null))
                    .on("focus", () => this.acciones.senalar(f.clave))
                    .on("blur", () => this.acciones.senalar(null));
            }
            const nombre = fila.append("th").attr("scope", "row").attr("title", f.nombre);
            nombre.append("span").classed("muestra-area", true).style("background", e.colores.texto ? "transparent" : f.color);
            nombre.append("span").text(f.nombre);
            f.celdas.forEach((c, i) => {
                const td = celda(fila, c, i);
                if (i === 0 && f.barra !== null) {
                    // La barra va de fondo, detrás del número, para no ensanchar la tabla.
                    td.classed("con-barra", true).style("--barra", `${Math.max(0, Math.min(1, f.barra)) * 100}%`);
                }
            });
        }
        if (detalle.total) {
            const pie = tabla.append("tfoot").append("tr");
            pie.append("th").attr("scope", "row").text(detalle.total.nombre);
            detalle.total.celdas.forEach((c, i) => celda(pie, c, i));
        }
        if (detalle.resto) {
            seccion.append("p").classed("nota", true).text(detalle.resto);
        }
    }

    /** El estado o los estados seleccionados, en grande y con su color del mapa. */
    private dibujarSilueta(encabezado: Sel<HTMLElement>, silueta: ModeloPanel["silueta"], e: EstiloPanel): void {
        const proyeccion = e.proyeccion().fitExtent(
            [[3, 3], [ANCHO_SILUETA - 3, ALTO_SILUETA - 3]],
            { type: "FeatureCollection", features: silueta.map((s) => s.forma) },
        );
        const camino = geoPath(proyeccion);
        const svg = encabezado.append("svg")
            .classed("panel-silueta", true)
            .attr("width", ANCHO_SILUETA)
            .attr("height", ALTO_SILUETA)
            .attr("aria-hidden", "true");
        for (const s of silueta) {
            svg.append("path")
                .attr("d", camino(s.forma) ?? "")
                .attr("fill", s.color)
                .attr("stroke", e.colores.texto ?? "#605e5c")
                .attr("stroke-width", silueta.length > 40 ? 0.2 : 0.6);
        }
    }
}
