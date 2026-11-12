"use strict";

import { Selection } from "d3-selection";

import type { Recuadro } from "./panel";

type Sel<E extends Element> = Selection<E, unknown, null, undefined>;

export interface ModeloTiempo {
    periodos: string[];
    /** El periodo que se ve; -1 es el total de los periodos. */
    actual: number;
    /** Lo que se reproduce: del periodo `rango[0]` al `rango[1]`. */
    rango: [number, number];
    reproduciendo: boolean;
    hayTotal: boolean;
    /** Se puede usar (no en un tablero ni en una exportación). */
    interactivo: boolean;
}

export interface TextosTiempo {
    region: string;
    reproducir: string;
    pausar: string;
    total: string;
    totalDesc: string;
    inicio: string;
    fin: string;
    periodo: string;
}

/** Lo que la línea del tiempo le pide al visual. */
export interface AccionesTiempo {
    alternar(): void;
    /** Ir a un periodo (-1: el total). */
    irA(i: number): void;
    fijarRango(inicio: number, fin: number): void;
}

export const ALTO_TIEMPO = 46;

const ICONO_PLAY = "M3 1.5v9l7.5-4.5z";
const ICONO_PAUSA = "M2.5 1.5h2.6v9H2.5zM6.9 1.5h2.6v9H6.9z";

/**
 * Barra de la línea del tiempo: reproducir y pausar, el total de los periodos y una
 * pista con un punto por periodo. Los dos extremos marcan el rango que se reproduce;
 * un clic en la pista (o las flechas) va a un periodo.
 *
 * La estructura se arma una vez y en cada dibujo solo se mueve: así un arrastre no se
 * corta cuando el mapa se vuelve a dibujar.
 */
export class LineaTiempo {
    private readonly raiz: Sel<HTMLDivElement>;
    private readonly boton: Sel<HTMLButtonElement>;
    private readonly icono: Sel<SVGPathElement>;
    private readonly total: Sel<HTMLButtonElement>;
    private readonly pista: Sel<HTMLDivElement>;
    private readonly banda: Sel<HTMLDivElement>;
    private readonly marcas: Sel<HTMLDivElement>;
    private readonly actual: Sel<HTMLDivElement>;
    private readonly asaInicio: Sel<HTMLDivElement>;
    private readonly asaFin: Sel<HTMLDivElement>;
    private readonly primero: Sel<HTMLSpanElement>;
    private readonly ultimo: Sel<HTMLSpanElement>;
    private readonly etiqueta: Sel<HTMLDivElement>;
    private modelo: ModeloTiempo | null = null;

    constructor(contenedor: Sel<HTMLElement>, private readonly acciones: AccionesTiempo) {
        this.raiz = contenedor.append("div").classed("tiempo", true).attr("role", "group").style("display", "none");
        this.boton = this.raiz.append("button").attr("type", "button").classed("tiempo-play", true)
            .on("click", (e: MouseEvent) => {
                e.stopPropagation();
                this.acciones.alternar();
            });
        this.icono = this.boton.append("svg").attr("viewBox", "0 0 12 12").attr("aria-hidden", "true").append("path");
        this.total = this.raiz.append("button").attr("type", "button").classed("tiempo-total", true)
            .on("click", (e: MouseEvent) => {
                e.stopPropagation();
                this.acciones.irA(-1);
            });
        const cuerpo = this.raiz.append("div").classed("tiempo-cuerpo", true);
        this.pista = cuerpo.append("div").classed("tiempo-pista", true)
            .on("pointerdown", (e: PointerEvent) => {
                const m = this.modelo;
                if (!m?.interactivo || (e.target as Element).closest(".tiempo-asa")) {
                    return;
                }
                const i = Math.max(m.rango[0], Math.min(m.rango[1], this.indiceEn(e.clientX)));
                this.acciones.irA(i);
            });
        this.banda = this.pista.append("div").classed("tiempo-banda", true);
        this.marcas = this.pista.append("div").classed("tiempo-marcas", true);
        this.actual = this.pista.append("div").classed("tiempo-actual", true).attr("role", "slider").attr("tabindex", 0)
            .on("keydown", (e: KeyboardEvent) => this.teclear(e, (m, paso) => {
                const desde = m.actual < 0 ? (paso > 0 ? m.rango[0] - 1 : m.rango[1] + 1) : m.actual;
                this.acciones.irA(Math.max(m.rango[0], Math.min(m.rango[1], desde + paso)));
            }));
        this.asaInicio = this.crearAsa("inicio");
        this.asaFin = this.crearAsa("fin");
        const extremos = cuerpo.append("div").classed("tiempo-extremos", true).attr("aria-hidden", "true");
        this.primero = extremos.append("span");
        this.ultimo = extremos.append("span");
        this.etiqueta = this.raiz.append("div").classed("tiempo-etiqueta", true).attr("aria-live", "polite");
    }

    ocultar(): void {
        this.modelo = null;
        this.raiz.style("display", "none");
    }

    dibujar(m: ModeloTiempo, t: TextosTiempo, caja: Recuadro, tamanoTexto: number): void {
        this.modelo = m;
        const n = m.periodos.length;
        const pos = (i: number): string => `${n <= 1 ? 50 : (i / (n - 1)) * 100}%`;
        this.raiz.style("display", null)
            .attr("aria-label", t.region)
            .classed("inactiva", !m.interactivo)
            .style("left", `${caja.x}px`)
            .style("top", `${caja.y}px`)
            .style("width", `${caja.ancho}px`)
            .style("height", `${caja.alto}px`)
            .style("font-size", `${tamanoTexto}px`);
        const textoBoton = m.reproduciendo ? t.pausar : t.reproducir;
        this.boton.attr("aria-label", textoBoton).attr("title", textoBoton).property("disabled", !m.interactivo || n < 2);
        this.icono.attr("d", m.reproduciendo ? ICONO_PAUSA : ICONO_PLAY);
        this.total.style("display", () => (m.hayTotal ? null : "none"))
            .attr("aria-pressed", String(m.actual < 0))
            .attr("title", t.totalDesc)
            .property("disabled", !m.interactivo)
            .text(t.total);
        this.banda.style("left", pos(m.rango[0])).style("width", `calc(${pos(m.rango[1])} - ${pos(m.rango[0])})`);
        this.marcas.selectAll<HTMLDivElement, string>("div")
            .data(m.periodos)
            .join("div")
            .classed("tiempo-marca", true)
            .classed("fuera", (_, i) => i < m.rango[0] || i > m.rango[1])
            .classed("vista", (_, i) => i === m.actual)
            .style("left", (_, i) => pos(i))
            .attr("title", (p) => p);
        const etiqueta = m.actual >= 0 ? m.periodos[m.actual] : t.total;
        this.actual.style("display", () => (m.actual >= 0 ? null : "none"))
            .style("left", pos(Math.max(0, m.actual)))
            .attr("aria-label", t.periodo)
            .attr("aria-valuemin", 1)
            .attr("aria-valuemax", n)
            .attr("aria-valuenow", m.actual + 1)
            .attr("aria-valuetext", etiqueta);
        for (const [asa, i, texto] of [[this.asaInicio, m.rango[0], t.inicio], [this.asaFin, m.rango[1], t.fin]] as const) {
            asa.style("left", pos(i))
                .attr("aria-label", texto)
                .attr("aria-valuemin", 1)
                .attr("aria-valuemax", n)
                .attr("aria-valuenow", i + 1)
                .attr("aria-valuetext", m.periodos[i])
                .attr("title", `${texto}: ${m.periodos[i]}`)
                .attr("tabindex", m.interactivo ? 0 : -1);
        }
        this.primero.text(m.periodos[m.rango[0]] ?? "");
        this.ultimo.text(m.rango[1] > m.rango[0] ? m.periodos[m.rango[1]] ?? "" : "");
        this.etiqueta.text(etiqueta).attr("title", etiqueta);
    }

    private crearAsa(cual: "inicio" | "fin"): Sel<HTMLDivElement> {
        const mover = (i: number): void => {
            const m = this.modelo;
            if (!m) {
                return;
            }
            const [a, b] = m.rango;
            if (cual === "inicio") {
                this.acciones.fijarRango(Math.max(0, Math.min(i, b)), b);
            } else {
                this.acciones.fijarRango(a, Math.min(m.periodos.length - 1, Math.max(i, a)));
            }
        };
        const asa = this.pista.append("div").classed("tiempo-asa", true).classed(cual, true).attr("role", "slider");
        asa.on("pointerdown", (e: PointerEvent) => {
            if (!this.modelo?.interactivo) {
                return;
            }
            e.stopPropagation();
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        })
            .on("pointermove", (e: PointerEvent) => {
                if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
                    mover(this.indiceEn(e.clientX));
                }
            })
            .on("keydown", (e: KeyboardEvent) => this.teclear(e, (m, paso) => mover((cual === "inicio" ? m.rango[0] : m.rango[1]) + paso)));
        return asa;
    }

    private teclear(e: KeyboardEvent, accion: (m: ModeloTiempo, paso: number) => void): void {
        const m = this.modelo;
        const paso = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
        if (m?.interactivo && paso !== 0) {
            accion(m, paso);
            e.preventDefault();
            e.stopPropagation();
        }
    }

    /** El periodo más cercano a una posición horizontal de la pantalla. */
    private indiceEn(x: number): number {
        const n = this.modelo?.periodos.length ?? 0;
        const caja = (this.pista.node() as HTMLDivElement).getBoundingClientRect();
        if (n <= 1 || caja.width <= 0) {
            return 0;
        }
        return Math.max(0, Math.min(n - 1, Math.round(((x - caja.left) / caja.width) * (n - 1))));
    }
}
