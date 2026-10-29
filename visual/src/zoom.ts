"use strict";

/**
 * Zoom y desplazamiento del mapa, sin dependencias: rueda del ratón (y pellizco del
 * trackpad, que llega como rueda con Ctrl), arrastre con el ratón o un dedo,
 * pellizco con dos dedos y botones. La transformación se aplica como
 * `translate(x, y) scale(k)` sobre la capa del mapa.
 */

export interface Transformacion {
    k: number;
    x: number;
    y: number;
}

/** Cuándo acerca la rueda del ratón: siempre, solo con Ctrl (o ⌘) o nunca. */
export type ModoRueda = "siempre" | "ctrl" | "nunca";

export interface OpcionesZoom {
    activo: boolean;
    rueda: ModoRueda;
}

type Punto = [number, number];
export type Caja = [Punto, Punto];

export const IDENTIDAD: Transformacion = { k: 1, x: 0, y: 0 };

const DURACION_MS = 250;
/** Lo que hay que mover el puntero para que un clic cuente como arrastre. */
const UMBRAL_ARRASTRE = 4;
/** Espera tras el último giro de la rueda para dar el zoom por terminado. */
const ESPERA_FIN_MS = 150;

/** Escala alrededor de un punto de la pantalla, que queda fijo. */
export function escalarEn(t: Transformacion, factor: number, [px, py]: Punto): Transformacion {
    return { k: t.k * factor, x: px - (px - t.x) * factor, y: py - (py - t.y) * factor };
}

/**
 * Escala entre 1 y kMax, sin dejar que el mapa se salga del recuadro: con k = 1 el
 * mapa entero cabe en el visual, así que nunca se ve más allá de sus bordes.
 */
export function acotar(t: Transformacion, ancho: number, alto: number, kMax: number): Transformacion {
    const k = Math.max(1, Math.min(kMax, t.k));
    return {
        k,
        x: Math.min(0, Math.max(ancho * (1 - k), t.x)),
        y: Math.min(0, Math.max(alto * (1 - k), t.y)),
    };
}

/** La transformación que muestra una caja del mapa (en coordenadas sin zoom), con margen. */
export function encuadrar(caja: Caja, ancho: number, alto: number, kMax: number, margen = 0.12): Transformacion {
    const [[x0, y0], [x1, y1]] = caja;
    const escala = (1 - 2 * margen) / Math.max((x1 - x0) / ancho, (y1 - y0) / alto, 1e-9);
    const k = Math.max(1, Math.min(kMax, escala));
    return acotar({ k, x: ancho / 2 - (k * (x0 + x1)) / 2, y: alto / 2 - (k * (y0 + y1)) / 2 }, ancho, alto, kMax);
}

/**
 * Paso s ∈ [0, 1] de una animación: la escala cambia en proporción y el centro de la
 * vista avanza en línea recta, con aceleración al inicio y frenado al final.
 */
export function interpolar(a: Transformacion, b: Transformacion, s: number, ancho: number, alto: number): Transformacion {
    const e = s < 0.5 ? 2 * s * s : 1 - (2 - 2 * s) ** 2 / 2;
    const k = a.k * Math.pow(b.k / a.k, e);
    const cx = (ancho / 2 - a.x) / a.k + ((ancho / 2 - b.x) / b.k - (ancho / 2 - a.x) / a.k) * e;
    const cy = (alto / 2 - a.y) / a.k + ((alto / 2 - b.y) / b.k - (alto / 2 - a.y) / a.k) * e;
    return { k, x: ancho / 2 - k * cx, y: alto / 2 - k * cy };
}

export const iguales = (a: Transformacion, b: Transformacion): boolean =>
    Math.abs(a.k - b.k) < 1e-6 && Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3;
const medio = (a: Punto, b: Punto): Punto => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const distancia = (a: Punto, b: Punto): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Sin animaciones si el sistema pide reducir el movimiento (o no hay cómo saberlo). */
function movimientoReducido(): boolean {
    return typeof window === "undefined" || typeof window.matchMedia !== "function" || typeof requestAnimationFrame !== "function"
        || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface Gesto {
    t0: Transformacion;
    centro: Punto;
    distancia: number;
    movido: boolean;
}

export class Zoom {
    private t: Transformacion = IDENTIDAD;
    /** La vista a la que vuelve el botón de inicio (el encuadre de los datos). */
    private inicio: Transformacion = IDENTIDAD;
    private ancho = 1;
    private alto = 1;
    private kMax = 8;
    private opciones: OpcionesZoom = { activo: true, rueda: "siempre" };
    private readonly punteros = new Map<number, Punto>();
    private gesto: Gesto | null = null;
    private suprimirClic = false;
    private animacion = 0;
    /** A dónde va la animación en curso (null sin animación). */
    private rumbo: Transformacion | null = null;
    private esperaFin: ReturnType<typeof setTimeout> | undefined;

    /** `alCambiar` recibe cada paso; `fin` indica que el movimiento terminó. */
    constructor(private readonly objetivo: SVGSVGElement, private readonly alCambiar: (t: Transformacion, fin: boolean) => void) {
        objetivo.addEventListener("wheel", (e) => this.alGirar(e), { passive: false });
        objetivo.addEventListener("pointerdown", (e) => this.alPresionar(e));
        objetivo.addEventListener("pointermove", (e) => this.alMover(e));
        objetivo.addEventListener("pointerup", (e) => this.alSoltar(e));
        objetivo.addEventListener("pointercancel", (e) => this.alSoltar(e));
        // Tras arrastrar, el clic que manda el navegador no debe seleccionar ni limpiar.
        objetivo.addEventListener("click", (e) => {
            if (this.suprimirClic) {
                this.suprimirClic = false;
                e.stopPropagation();
                e.preventDefault();
            }
        }, true);
    }

    get transformacion(): Transformacion {
        return this.t;
    }

    get escalaMaxima(): number {
        return this.kMax;
    }

    get vistaInicial(): Transformacion {
        return this.inicio;
    }

    /** Donde quedará la vista: el final de la animación en curso, o la vista actual. */
    get destino(): Transformacion {
        return this.rumbo ?? this.t;
    }

    /**
     * Tamaño, límites y vista inicial. Sin zoom del usuario, el mapa se queda en la
     * vista inicial (el encuadre de los datos también aplica sin zoom).
     */
    configurar(ancho: number, alto: number, kMax: number, opciones: OpcionesZoom, inicio: Transformacion = IDENTIDAD): void {
        this.ancho = Math.max(1, ancho);
        this.alto = Math.max(1, alto);
        this.kMax = Math.max(1, kMax);
        this.opciones = opciones;
        this.inicio = acotar(inicio, this.ancho, this.alto, this.kMax);
        // Con zoom, el navegador no debe desplazar la página con los gestos táctiles sobre el mapa.
        this.objetivo.style.touchAction = opciones.activo ? "none" : "";
        if (!opciones.activo) {
            this.detener();
            this.t = this.inicio;
        }
        this.t = acotar(this.t, this.ancho, this.alto, this.kMax);
    }

    /** Cambia la transformación de inmediato y sin avisar: quien llama vuelve a dibujar. */
    fijar(t: Transformacion): void {
        this.detener();
        this.t = acotar(t, this.ancho, this.alto, this.kMax);
    }

    acercar(): void {
        this.animarHacia(this.escalado(2, [this.ancho / 2, this.alto / 2]));
    }

    alejar(): void {
        this.animarHacia(this.escalado(0.5, [this.ancho / 2, this.alto / 2]));
    }

    /** Vuelve a la vista inicial. */
    restablecer(): void {
        this.animarHacia(this.inicio);
    }

    /** Acerca hasta que la caja (coordenadas sin zoom) llene la vista. */
    enfocar(caja: Caja): void {
        this.animarHacia(encuadrar(caja, this.ancho, this.alto, this.kMax));
    }

    /** Lleva la vista a `t` con una animación corta (o de inmediato si se pide reducir el movimiento). */
    irA(t: Transformacion): void {
        this.animarHacia(acotar(t, this.ancho, this.alto, this.kMax));
    }

    private escalado(factor: number, punto: Punto): Transformacion {
        const k = Math.max(1, Math.min(this.kMax, this.t.k * factor));
        return acotar(escalarEn(this.t, k / this.t.k, punto), this.ancho, this.alto, this.kMax);
    }

    private aplicar(t: Transformacion, fin: boolean): void {
        this.t = acotar(t, this.ancho, this.alto, this.kMax);
        this.alCambiar(this.t, fin);
    }

    private punto(e: MouseEvent): Punto {
        const caja = this.objetivo.getBoundingClientRect();
        return [e.clientX - caja.left, e.clientY - caja.top];
    }

    private alGirar(e: WheelEvent): void {
        const { activo, rueda } = this.opciones;
        if (!activo || rueda === "nunca" || (rueda === "ctrl" && !e.ctrlKey && !e.metaKey)) {
            return;
        }
        // Como d3-zoom: el pellizco del trackpad llega como rueda con Ctrl y avanza más.
        const delta = -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey ? 10 : 1);
        const destino = this.escalado(Math.pow(2, delta), this.punto(e));
        if (iguales(destino, this.t)) {
            return; // ya en el límite: la página puede desplazarse
        }
        e.preventDefault();
        this.detener();
        this.aplicar(destino, false);
        clearTimeout(this.esperaFin);
        this.esperaFin = setTimeout(() => this.alCambiar(this.t, true), ESPERA_FIN_MS);
    }

    private alPresionar(e: PointerEvent): void {
        if (!this.opciones.activo || (e.button !== undefined && e.button !== 0)) {
            return;
        }
        // Elementos que reciben su propio clic (la leyenda de grupos)
        if ((e.target as Element | null)?.closest?.(".sin-zoom")) {
            return;
        }
        this.detener();
        this.punteros.set(e.pointerId ?? 1, this.punto(e));
        this.iniciarGesto();
    }

    /** Al empezar o al cambiar el número de dedos, el gesto parte de la vista actual. */
    private iniciarGesto(): void {
        const p = [...this.punteros.values()];
        this.gesto = p.length === 0 ? null : {
            t0: this.t,
            centro: p.length > 1 ? medio(p[0], p[1]) : p[0],
            distancia: p.length > 1 ? distancia(p[0], p[1]) : 0,
            movido: this.gesto?.movido ?? false,
        };
    }

    private alMover(e: PointerEvent): void {
        const id = e.pointerId ?? 1;
        const g = this.gesto;
        if (!g || !this.punteros.has(id)) {
            return;
        }
        this.punteros.set(id, this.punto(e));
        const p = [...this.punteros.values()];
        const centro = p.length > 1 ? medio(p[0], p[1]) : p[0];
        if (!g.movido) {
            if (p.length === 1 && distancia(centro, g.centro) < UMBRAL_ARRASTRE) {
                return;
            }
            g.movido = true;
            try {
                // Sigue el arrastre aunque el puntero salga del mapa
                this.objetivo.setPointerCapture?.(id);
            } catch {
                // puntero ya liberado: el arrastre sigue mientras esté sobre el mapa
            }
        }
        let t: Transformacion = { k: g.t0.k, x: g.t0.x + centro[0] - g.centro[0], y: g.t0.y + centro[1] - g.centro[1] };
        if (p.length > 1 && g.distancia > 0) {
            const k = Math.max(1, Math.min(this.kMax, (g.t0.k * distancia(p[0], p[1])) / g.distancia));
            t = escalarEn(t, k / g.t0.k, centro);
        }
        this.aplicar(t, false);
    }

    private alSoltar(e: PointerEvent): void {
        if (!this.punteros.delete(e.pointerId ?? 1)) {
            return;
        }
        if (this.punteros.size > 0) {
            this.iniciarGesto();
            return;
        }
        const movido = this.gesto?.movido ?? false;
        this.gesto = null;
        if (movido) {
            this.suprimirClic = true;
            setTimeout(() => {
                this.suprimirClic = false;
            }, 0);
            this.alCambiar(this.t, true);
        }
    }

    private animarHacia(destino: Transformacion): void {
        this.detener();
        const inicio = this.t;
        if (iguales(inicio, destino)) {
            return;
        }
        if (movimientoReducido()) {
            this.aplicar(destino, true);
            return;
        }
        let t0 = -1;
        const paso = (ahora: number): void => {
            t0 = t0 < 0 ? ahora : t0;
            const s = Math.min(1, (ahora - t0) / DURACION_MS);
            this.animacion = s < 1 ? requestAnimationFrame(paso) : 0;
            this.rumbo = s < 1 ? destino : null;
            this.aplicar(s < 1 ? interpolar(inicio, destino, s, this.ancho, this.alto) : destino, s >= 1);
        };
        this.rumbo = destino;
        this.animacion = requestAnimationFrame(paso);
    }

    private detener(): void {
        if (this.animacion) {
            cancelAnimationFrame(this.animacion);
            this.animacion = 0;
        }
        this.rumbo = null;
    }
}
