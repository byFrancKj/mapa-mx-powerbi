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
}

export interface LineaDiferencia {
    nombre: string;
    texto: string;
    /** -1, 0 o 1: colorea en rojo o verde. */
    signo: number;
}

export interface ModeloPanel {
    titulo: string;
    subtitulo: string;
    /** Hay una selección que el botón de cerrar puede quitar. */
    cerrar: boolean;
    /** Las áreas sin sus islas lejanas, con su color del mapa. */
    silueta: Array<{ forma: Feature<Geometry>; color: string }>;
    bases: Cifra[];
    /** Una por cada base contra la primera. */
    diferencias: Array<{ titulo: string; lineas: LineaDiferencia[] }>;
    tarjetas: Cifra[];
    /** Tabla por área (con varias áreas). */
    detalle: { columnas: string[]; filas: Array<{ nombre: string; celdas: string[] }>; resto: string } | null;
}

export interface EstiloPanel {
    tamanoTexto: number;
    posicion: "derecha" | "abajo" | "encima";
    /** Abajo y ancho: las secciones van lado a lado. */
    horizontal: boolean;
    colorSigno: boolean;
    colores: { texto: string | null; fondo: string | null; positivo: string; negativo: string };
    proyeccion: () => GeoProjection;
}

export interface TextosPanel {
    region: string;
    comparacion: string;
    tarjetas: string;
    detalle: string;
    cerrar: string;
}

export interface Recuadro {
    x: number;
    y: number;
    ancho: number;
    alto: number;
}

const ANCHO_SILUETA = 64;
const ALTO_SILUETA = 48;

export class Panel {
    private readonly raiz: Sel<HTMLElement>;

    constructor(contenedor: Sel<HTMLElement>, private readonly alCerrar: () => void) {
        this.raiz = contenedor.append("aside").classed("panel", true).attr("role", "region").style("display", "none");
    }

    ocultar(): void {
        this.raiz.style("display", "none").selectAll("*").remove();
    }

    dibujar(m: ModeloPanel, e: EstiloPanel, t: TextosPanel, caja: Recuadro): void {
        const r = this.raiz;
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
            .style("--positivo", e.colores.positivo)
            .style("--negativo", e.colores.negativo);

        const encabezado = r.append("header").classed("panel-encabezado", true);
        if (m.silueta.length > 0) {
            this.dibujarSilueta(encabezado, m.silueta, e);
        }
        const titulos = encabezado.append("div").classed("panel-titulos", true);
        titulos.append("h2").classed("panel-titulo", true).attr("title", m.titulo).text(m.titulo);
        if (m.subtitulo) {
            titulos.append("p").classed("panel-subtitulo", true).attr("title", m.subtitulo).text(m.subtitulo);
        }
        if (m.cerrar) {
            encabezado.append("button")
                .attr("type", "button")
                .classed("panel-cerrar", true)
                .attr("aria-label", t.cerrar)
                .attr("title", t.cerrar)
                .text("×")
                .on("click", (evento: MouseEvent) => {
                    evento.stopPropagation();
                    this.alCerrar();
                });
        }

        const cuerpo = r.append("div").classed("panel-cuerpo", true);
        if (m.bases.length > 0) {
            this.dibujarComparacion(cuerpo, m, e, t);
        }
        if (m.tarjetas.length > 0) {
            const seccion = cuerpo.append("section").classed("panel-seccion", true);
            seccion.append("h3").text(t.tarjetas);
            const rejilla = seccion.append("div").classed("tarjetas", true);
            for (const c of m.tarjetas) {
                const tarjeta = rejilla.append("div").classed("tarjeta", true).attr("title", c.exacto ? `${c.nombre}: ${c.exacto}` : c.nombre);
                tarjeta.append("div").classed("tarjeta-nombre", true).text(c.nombre);
                tarjeta.append("div").classed("tarjeta-valor", true).text(c.texto);
                if (c.nota) {
                    tarjeta.append("div").classed("nota", true).text(c.nota);
                }
            }
        }
        if (m.detalle) {
            const seccion = cuerpo.append("section").classed("panel-seccion", true);
            seccion.append("h3").text(t.detalle);
            const tabla = seccion.append("table").classed("detalle", true);
            const encabezados = tabla.append("thead").append("tr");
            for (const c of m.detalle.columnas) {
                encabezados.append("th").attr("scope", "col").attr("title", c).text(c);
            }
            const cuerpoTabla = tabla.append("tbody");
            for (const f of m.detalle.filas) {
                const fila = cuerpoTabla.append("tr");
                fila.append("th").attr("scope", "row").attr("title", f.nombre).text(f.nombre);
                for (const celda of f.celdas) {
                    fila.append("td").text(celda);
                }
            }
            if (m.detalle.resto) {
                seccion.append("p").classed("nota", true).text(m.detalle.resto);
            }
        }
    }

    /** Las bases con barras proporcionales y, debajo, cada una contra la primera. */
    private dibujarComparacion(cuerpo: Sel<HTMLDivElement>, m: ModeloPanel, e: EstiloPanel, t: TextosPanel): void {
        const seccion = cuerpo.append("section").classed("panel-seccion", true);
        seccion.append("h3").text(t.comparacion);
        const maximo = Math.max(0, ...m.bases.map((b) => Math.abs(b.valor ?? 0)));
        for (const b of m.bases) {
            const fila = seccion.append("div").classed("base", true).attr("title", b.exacto ? `${b.nombre}: ${b.exacto}` : b.nombre);
            const linea = fila.append("div").classed("base-linea", true);
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
            grupo.append("div").classed("diferencias-titulo", true).text(d.titulo);
            const lista = grupo.append("dl");
            for (const l of d.lineas) {
                lista.append("dt").text(l.nombre);
                lista.append("dd")
                    .classed("positivo", e.colorSigno && l.signo > 0)
                    .classed("negativo", e.colorSigno && l.signo < 0)
                    .text(l.texto);
            }
        }
    }

    /** El estado o los estados seleccionados, en grande y con su color del mapa. */
    private dibujarSilueta(encabezado: Sel<HTMLElement>, silueta: ModeloPanel["silueta"], e: EstiloPanel): void {
        const proyeccion = e.proyeccion().fitExtent(
            [[2, 2], [ANCHO_SILUETA - 2, ALTO_SILUETA - 2]],
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
