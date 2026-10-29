import { test } from "node:test";
import assert from "node:assert/strict";

import { crearDataView, crearHost, nuevoElemento, opcionesUpdate, OpcionesDataView, ventana } from "./entorno";

const { Visual } = await import("../src/visual");
const { mezclar } = await import("../src/paletas");

function montar(opciones: { altoContraste?: boolean } = {}) {
    const elemento = nuevoElemento();
    const entorno = crearHost(opciones);
    const visual = new Visual({ element: elemento, host: entorno.host } as never);
    return { elemento, visual, ...entorno };
}

const esperar = () => new Promise((r) => setTimeout(r, 0));
const areas = (el: HTMLElement) => [...el.querySelectorAll<SVGPathElement>("path.area")];
const area = (el: HTMLElement, nombre: string) => areas(el).find((p) => p.getAttribute("aria-label")?.startsWith(`${nombre}`));
const textos = (el: HTMLElement, selector: string) => [...el.querySelectorAll(selector)].map((t) => t.textContent);
const panel = (el: HTMLElement) => el.querySelector<HTMLElement>("aside.panel");
const panelVisible = (el: HTMLElement) => panel(el)?.style.display !== "none";
const texto = (el: HTMLElement, selector: string) => el.querySelector(selector)?.textContent;
const clic = (e: Element | null | undefined, opciones: MouseEventInit = {}) =>
    e?.dispatchEvent(new ventana.MouseEvent("click", { bubbles: true, cancelable: true, ...opciones }));

/** Escala y desplazamiento de la capa del mapa. */
function zoomDe(el: HTMLElement): { k: number; x: number; y: number } {
    const t = el.querySelector(".capa-mapa")?.getAttribute("transform") ?? "";
    const m = /translate\(([-\d.e]+),([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(t);
    return m ? { x: Number(m[1]), y: Number(m[2]), k: Number(m[3]) } : { k: 1, x: 0, y: 0 };
}

// Los 32 estados, con una región definida por el usuario: Occidente y el resto.
const TODOS = Array.from({ length: 32 }, (_, i) => String(i + 1).padStart(2, "0"));
const OCCIDENTE = ["06", "14", "16", "18"];
const ventas = TODOS.map((_, i) => (i + 1) * 1e6);
const NACIONAL: OpcionesDataView = {
    claves: TODOS,
    valores: ventas,
    nombre: "Ventas",
    formato: "\\$#,0",
    grupo: { nombre: "Región", valores: TODOS.map((k) => (OCCIDENTE.includes(k) ? "Occidente" : "Resto")) },
    bases: [
        { nombre: "Venta propia", valores: ventas, formato: "\\$#,0" },
        { nombre: "Venta del mercado", valores: ventas.map((v) => v * 2), formato: "\\$#,0" },
    ],
};

/** Lo que manda Power BI cuando una segmentación deja solo unas áreas. */
function solo(o: OpcionesDataView, claves: string[]): OpcionesDataView {
    const queda = (i: number) => claves.includes(String(o.claves[i]));
    const de = <T>(v: T[] | undefined) => v?.filter((_, i) => queda(i));
    return {
        ...o,
        claves: de(o.claves) ?? [],
        valores: de(o.valores),
        grupo: o.grupo ? { ...o.grupo, valores: de(o.grupo.valores) ?? [] } : undefined,
        bases: o.bases?.map((b) => ({ ...b, valores: de(b.valores) ?? [] })),
    };
}

/** Lo que manda Power BI cuando otro visual resalta: `parte(i)` del valor de cada fila (null, no resaltada). */
function resaltado(o: OpcionesDataView, parte: (i: number) => number | null): OpcionesDataView {
    const de = (v: Array<number | null>) => v.map((x, i) => (x === null || parte(i) === null ? null : x * (parte(i) as number)));
    return { ...o, resaltes: o.valores ? de(o.valores) : undefined, bases: o.bases?.map((b) => ({ ...b, resaltes: de(b.valores) })) };
}

// ----------------------------------------------------------------- fondo

test("fondo: mar, retícula, líneas de agua, países vecinos y costa; 'Sin fondo' los quita", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(NACIONAL)));
    assert.equal(elemento.querySelector(".mar")?.getAttribute("fill"), "#d4e4ee");
    for (const capa of [".reticula", ".tierra", ".fronteras", ".costa"]) {
        assert.ok((elemento.querySelector(capa)?.getAttribute("d") ?? "").length > 100, `${capa} dibujada`);
    }
    // Tres anillos: cada uno, una línea y su recorte del color del mar
    const lineas = [...elemento.querySelectorAll(".lineas-agua path")];
    assert.equal(lineas.length, 6);
    assert.deepEqual(lineas.filter((_, i) => i % 2 === 1).map((l) => l.getAttribute("stroke")), ["#d4e4ee", "#d4e4ee", "#d4e4ee"]);
    assert.ok(Number(lineas[0].getAttribute("stroke-width")) > Number(lineas[4].getAttribute("stroke-width")), "de la más lejana a la más cercana");

    visual.update(opcionesUpdate(crearDataView({ ...NACIONAL, objetos: { mapa: { fondo: "ninguno" } } })));
    assert.equal(elemento.querySelector(".mar")?.getAttribute("fill"), "none");
    assert.equal(elemento.querySelector<SVGGElement>(".fondo")?.style.display, "none");
    assert.equal(elemento.querySelector<SVGPathElement>(".costa")?.style.display, "none");
    assert.equal(elemento.querySelectorAll(".referencia-mar, .referencia-pais").length, 0);

    const contraste = montar({ altoContraste: true });
    contraste.visual.update(opcionesUpdate(crearDataView(NACIONAL)));
    assert.equal(contraste.elemento.querySelector(".mar")?.getAttribute("fill"), "none", "en alto contraste, sin fondo");
});

test("fondo: los colores del mar y de la tierra salen del formato", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({
        ...NACIONAL, objetos: { mapa: { colorMar: { solid: { color: "#c0d8e8" } }, colorTierra: { solid: { color: "#eeeeee" } } } },
    })));
    assert.equal(elemento.querySelector(".mar")?.getAttribute("fill"), "#c0d8e8");
    assert.equal(elemento.querySelector(".tierra")?.getAttribute("fill"), "#eeeeee");
    assert.equal(elemento.querySelector(".costa")?.getAttribute("stroke"), mezclar("#c0d8e8", "#16405a", 0.45));
});

test("nombres de mares y países: en el agua, en cursiva los mares y apagables", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(NACIONAL), 1000, 600));
    const mares = textos(elemento, ".referencia-mar");
    assert.ok(mares.includes("Golfo de México"), mares.join(" | "));
    assert.ok(textos(elemento, ".referencia-pais").includes("ESTADOS UNIDOS"));
    const golfo = [...elemento.querySelectorAll(".referencia-mar")].find((t) => t.textContent === "Golfo de California");
    if (golfo) {
        assert.match(golfo.getAttribute("transform") ?? "", /^rotate\(/, "el golfo de California va inclinado");
    }
    visual.update(opcionesUpdate(crearDataView({ ...NACIONAL, objetos: { mapa: { referencias: false } } }), 1000, 600));
    assert.equal(elemento.querySelectorAll(".referencia-mar, .referencia-pais").length, 0);
});

test("las etiquetas no se escriben debajo de la leyenda", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ ...NACIONAL, objetos: { etiquetas: { mostrar: true }, leyenda: { tamano: 24 } } })));
    const caja = elemento.querySelector(".leyenda")?.getAttribute("transform") ?? "";
    const [, x, y] = /translate\(([-\d.]+),([-\d.]+)\)/.exec(caja) ?? [];
    const fondo = elemento.querySelector(".leyenda .fondo");
    const [x0, y0] = [Number(x), Number(y)];
    const [x1, y1] = [x0 + Number(fondo?.getAttribute("width")), y0 + Number(fondo?.getAttribute("height"))];
    for (const t of elemento.querySelectorAll(".etiquetas text")) {
        const tx = Number(t.getAttribute("x"));
        const ty = Number(t.getAttribute("y"));
        assert.ok(!(tx > x0 && tx < x1 && ty > y0 && ty < y1), `${t.textContent} cae dentro de la leyenda`);
    }
});

// -------------------------------------------------------------- encuadre

test("encuadre: una región filtrada llena el mapa; con todo el país, la vista completa", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(NACIONAL)));
    assert.deepEqual(zoomDe(elemento), { k: 1, x: 0, y: 0 });

    visual.update(opcionesUpdate(crearDataView(solo(NACIONAL, OCCIDENTE))));
    const k = zoomDe(elemento).k;
    assert.ok(k > 2, `acercado a Occidente (k = ${k})`);
    assert.ok(area(elemento, "Sonora")?.classList.contains("de-fondo"), "lo filtrado queda de fondo");
    assert.equal(area(elemento, "Sonora")?.getAttribute("fill"), "#f3f2ef");
    assert.ok(!textos(elemento, ".leyenda .etiqueta").includes("Sin dato"), "lo de fondo no es Sin dato");

    visual.update(opcionesUpdate(crearDataView({ ...solo(NACIONAL, OCCIDENTE), objetos: { mapa: { encuadre: "pais" } } })));
    assert.equal(zoomDe(elemento).k, 1, "con Todo el país no se acerca");

    visual.update(opcionesUpdate(crearDataView(NACIONAL)));
    assert.equal(zoomDe(elemento).k, 1, "al quitar el filtro vuelve al país");
});

test("encuadre: el botón de inicio vuelve al encuadre y se puede alejar hasta ver el país", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ ...solo(NACIONAL, OCCIDENTE), objetos: { panel: { abrir: "seleccion" } } })));
    const boton = (c: string) => elemento.querySelector<HTMLButtonElement>(`.zoom-${c}`);
    const inicio = zoomDe(elemento);
    assert.ok(boton("inicio")?.disabled, "ya está en la vista inicial");
    assert.equal(boton("alejar")?.disabled, false, "desde el encuadre se puede alejar");
    clic(boton("acercar"));
    assert.ok(Math.abs(zoomDe(elemento).k - inicio.k * 2) < 1e-6);
    clic(boton("inicio"));
    assert.deepEqual(zoomDe(elemento), inicio);
    for (let i = 0; i < 6; i++) {
        clic(boton("alejar"));
    }
    assert.equal(zoomDe(elemento).k, 1, "alejar llega a todo el país");
    assert.ok(boton("alejar")?.disabled);
});

test("encuadre: un cambio de tamaño a media animación termina en el encuadre nuevo", () => {
    // Animaciones con reloj propio: cada cuadro se corre a mano.
    const cuadros: FrameRequestCallback[] = [];
    const global = globalThis as unknown as Record<string, unknown>;
    const antes = { raf: global.requestAnimationFrame, caf: global.cancelAnimationFrame, mm: ventana.matchMedia };
    global.requestAnimationFrame = (f: FrameRequestCallback) => cuadros.push(f);
    global.cancelAnimationFrame = () => {
        cuadros.length = 0;
    };
    ventana.matchMedia = (() => ({ matches: false })) as unknown as typeof ventana.matchMedia;
    const correr = (ms: number) => cuadros.splice(0).forEach((f) => f(ms));
    try {
        const { elemento, visual } = montar();
        visual.update(opcionesUpdate(crearDataView(NACIONAL)));
        visual.update(opcionesUpdate(crearDataView(solo(NACIONAL, OCCIDENTE))));
        correr(0);
        correr(120);
        const aMedias = zoomDe(elemento).k;
        visual.update(opcionesUpdate(crearDataView(solo(NACIONAL, OCCIDENTE)), 900, 500));
        correr(400);

        const directo = montar();
        directo.visual.update(opcionesUpdate(crearDataView(solo(NACIONAL, OCCIDENTE)), 900, 500));
        const esperado = zoomDe(directo.elemento);
        const final = zoomDe(elemento);
        assert.ok(aMedias > 1 && aMedias < esperado.k, `la animación iba a medias (k = ${aMedias})`);
        assert.ok(Math.abs(final.k - esperado.k) < 1e-6 && Math.abs(final.x - esperado.x) < 1e-3 && Math.abs(final.y - esperado.y) < 1e-3,
            `${JSON.stringify(final)} ≠ ${JSON.stringify(esperado)}`);
    } finally {
        global.requestAnimationFrame = antes.raf;
        global.cancelAnimationFrame = antes.caf;
        ventana.matchMedia = antes.mm;
    }
});

// ---------------------------------------------------- panel al filtrar

test("filtro de una región: el panel se abre con su nombre, su resumen y el motivo", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(NACIONAL)));
    assert.equal(panelVisible(elemento), false, "sin filtro, el panel espera un clic");

    visual.update(opcionesUpdate(crearDataView(solo(NACIONAL, OCCIDENTE))));
    assert.ok(panelVisible(elemento));
    assert.equal(texto(elemento, ".panel-motivo"), "Filtrado");
    assert.equal(texto(elemento, ".panel-titulo"), "Occidente");
    assert.equal(texto(elemento, ".panel-subtitulo"), "4 estados");
    // 6 + 14 + 16 + 18 millones de venta propia, el doble del mercado
    assert.deepEqual(textos(elemento, ".base-valor"), ["$54 M", "$108 M"]);
    assert.equal(textos(elemento, ".detalle tbody tr").length, 4);
    assert.equal(elemento.querySelector(".panel-cerrar")?.getAttribute("aria-label"), "Ocultar el panel");

    visual.update(opcionesUpdate(crearDataView(solo(NACIONAL, ["14"]))));
    assert.equal(texto(elemento, ".panel-titulo"), "Jalisco");
    assert.equal(texto(elemento, ".panel-subtitulo"), "Occidente");

    visual.update(opcionesUpdate(crearDataView(NACIONAL)));
    assert.equal(panelVisible(elemento), false, "sin filtro se cierra");
});

test("abrir el panel: Al seleccionar no se abre con un filtro; Siempre resume todo el país", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ ...solo(NACIONAL, OCCIDENTE), objetos: { panel: { abrir: "seleccion" } } })));
    assert.equal(panelVisible(elemento), false);
    assert.ok(zoomDe(elemento).k > 2, "el encuadre no depende del panel");

    visual.update(opcionesUpdate(crearDataView({ ...NACIONAL, objetos: { panel: { abrir: "siempre" } } })));
    assert.ok(panelVisible(elemento));
    assert.equal(texto(elemento, ".panel-titulo"), "Todos los estados");
    assert.equal(texto(elemento, ".panel-subtitulo"), "32 estados con datos");
    assert.equal(elemento.querySelector(".panel-motivo"), null, "sin filtro no hay motivo que explicar");
});

test("el × sin selección oculta el panel hasta que cambian los datos", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(solo(NACIONAL, OCCIDENTE))));
    assert.notEqual(elemento.querySelector("svg")?.getAttribute("width"), "760");
    clic(elemento.querySelector(".panel-cerrar"));
    await esperar();
    assert.equal(panelVisible(elemento), false);
    assert.equal(elemento.querySelector("svg")?.getAttribute("width"), "760", "el mapa recupera el espacio");
    visual.update(opcionesUpdate(crearDataView(solo(NACIONAL, OCCIDENTE))));
    assert.equal(panelVisible(elemento), false, "los mismos datos: sigue oculto");
    visual.update(opcionesUpdate(crearDataView(solo(NACIONAL, ["01", "11"]))));
    assert.ok(panelVisible(elemento), "otro filtro: vuelve");
});

test("con un filtro, un clic en un estado lo muestra y el × regresa al resumen del filtro", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(solo(NACIONAL, OCCIDENTE))));
    clic(area(elemento, "Jalisco"));
    await esperar();
    assert.equal(texto(elemento, ".panel-motivo"), "Selección");
    assert.equal(texto(elemento, ".panel-titulo"), "Jalisco");
    assert.equal(elemento.querySelector(".panel-cerrar")?.getAttribute("aria-label"), "Quitar la selección");
    clic(elemento.querySelector(".panel-cerrar"));
    await esperar();
    assert.equal(texto(elemento, ".panel-titulo"), "Occidente");
});

test("clic en un área de fondo: quita la selección como el fondo y no muestra tooltip", async () => {
    const { elemento, visual, llamadas } = montar();
    visual.update(opcionesUpdate(crearDataView(solo(NACIONAL, OCCIDENTE))));
    clic(area(elemento, "Jalisco"));
    await esperar();
    assert.equal(texto(elemento, ".panel-titulo"), "Jalisco");
    clic(area(elemento, "Sonora"));
    await esperar();
    assert.equal(texto(elemento, ".panel-titulo"), "Occidente", "Sonora (de fondo) quitó la selección");
    const antes = llamadas.tooltip.length;
    area(elemento, "Sonora")?.dispatchEvent(new ventana.MouseEvent("pointerover", { bubbles: true }));
    assert.equal(llamadas.tooltip.length, antes);
});

// --------------------------------------------- resaltado de otro visual

test("clic en una fila de otro visual (una región): encuadra lo resaltado y el panel lo resume", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(resaltado(NACIONAL, (i) => (OCCIDENTE.includes(TODOS[i]) ? 1 : null)))));
    assert.ok(zoomDe(elemento).k > 2, "acercado a lo resaltado");
    assert.ok(area(elemento, "Sonora")?.classList.contains("de-fondo"));
    assert.ok(panelVisible(elemento));
    assert.equal(texto(elemento, ".panel-motivo"), "Desde otro visual");
    assert.equal(texto(elemento, ".panel-titulo"), "Occidente");
    assert.deepEqual(textos(elemento, ".base-valor"), ["$54 M", "$108 M"]);
});

test("clic en un producto de otro visual: los colores y el panel usan los valores resaltados", () => {
    const { elemento, visual, llamadas } = montar();
    visual.update(opcionesUpdate(crearDataView(resaltado(NACIONAL, () => 0.5))));
    assert.equal(zoomDe(elemento).k, 1, "todo el país resaltado: la vista completa");
    assert.equal(texto(elemento, ".panel-motivo"), "Desde otro visual");
    assert.equal(texto(elemento, ".panel-titulo"), "Todos los estados");
    // La mitad de 1 + 2 + … + 32 millones
    assert.deepEqual(textos(elemento, ".base-valor"), ["$264 M", "$528 M"]);
    assert.equal(textos(elemento, ".leyenda .etiqueta")[0], "$500 mil – $3.5 M", "las clases salen de lo resaltado");
    area(elemento, "Jalisco")?.dispatchEvent(new ventana.MouseEvent("pointerover", { bubbles: true }));
    const items = llamadas.tooltip.at(-1)?.[1].dataItems ?? [];
    assert.deepEqual(items.find((d) => d.displayName === "Ventas"), { displayName: "Ventas", value: "$7,000,000" });
});

// ------------------------------------------------------- tabla del panel

test("tabla del panel: pasar el cursor marca el área y un clic la selecciona", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(solo(NACIONAL, OCCIDENTE))));
    const filas = [...elemento.querySelectorAll<HTMLTableRowElement>(".detalle tbody tr")];
    assert.deepEqual(filas.map((f) => f.querySelector("th")?.textContent), ["Nayarit", "Michoacán", "Jalisco", "Colima"]);
    assert.ok(filas.every((f) => f.classList.contains("elegible") && f.getAttribute("tabindex") === "0"));
    assert.equal(filas[0].querySelector("td.con-barra")?.getAttribute("style"), "--barra: 100%;");

    const jalisco = filas[2];
    const resaltado = elemento.querySelector<SVGPathElement>(".resaltado");
    jalisco.dispatchEvent(new ventana.Event("pointerenter"));
    assert.notEqual(resaltado?.style.display, "none");
    assert.equal(resaltado?.getAttribute("d"), area(elemento, "Jalisco")?.getAttribute("d"));
    jalisco.dispatchEvent(new ventana.Event("pointerleave"));
    assert.equal(resaltado?.style.display, "none");

    clic(jalisco);
    await esperar();
    assert.equal(texto(elemento, ".panel-titulo"), "Jalisco");
    assert.equal(area(elemento, "Jalisco")?.getAttribute("aria-selected"), "true");
});

// --------------------------------------------------------------- leyenda

test("leyenda: más grande por omisión y en barra con los cortes entre clases", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(NACIONAL)));
    assert.equal(elemento.querySelector<SVGTextElement>(".leyenda .titulo")?.style.fontSize, "13px");

    visual.update(opcionesUpdate(crearDataView({ ...NACIONAL, objetos: { leyenda: { estilo: "barra" } } })));
    assert.equal(elemento.querySelectorAll(".leyenda rect.tramo").length, 5);
    const cortes = textos(elemento, ".leyenda .etiqueta");
    assert.equal(cortes[0], "$1 M");
    assert.equal(cortes[cortes.length - 1], "$32 M");
    assert.equal(cortes.length, 6, "mínimo, cuatro cortes y máximo");
});

test("leyenda: en un visual chico se reduce entera", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(NACIONAL), 360, 260));
    assert.match(elemento.querySelector(".leyenda")?.getAttribute("transform") ?? "", /scale\(0\.\d+\)/);
});

// ------------------------------------------------------------ municipios

test("municipios: un drill-down a un estado lo encuadra y el panel lleva su nombre", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: ["14039", "14120", "14097", "14098"], valores: [4, 3, 2, 1], formato: "#,0" })));
    assert.ok(zoomDe(elemento).k > 3, `acercado a la zona de Guadalajara (k = ${zoomDe(elemento).k})`);
    assert.equal(texto(elemento, ".panel-titulo"), "Jalisco");
    assert.equal(texto(elemento, ".panel-subtitulo"), "4 municipios");
});

test("municipios: una cadena con municipios en todo el país no es un filtro", () => {
    const { elemento, visual } = montar();
    // Un municipio de cada estado: el municipio 001
    const claves = TODOS.map((k) => `${k}001`);
    visual.update(opcionesUpdate(crearDataView({ claves, valores: claves.map((_, i) => i + 1), formato: "#,0" })));
    assert.equal(panelVisible(elemento), false);
    assert.equal(zoomDe(elemento).k, 1);
    assert.equal(textos(elemento, ".leyenda .etiqueta").at(-1), "Sin dato", "los demás municipios no tienen dato");
});

test("mezclar colores: proporción entre dos #rrggbb; otro formato se respeta", () => {
    assert.equal(mezclar("#000000", "#ffffff", 0.5), "#808080");
    assert.equal(mezclar("#d4e4ee", "#16405a", 0), "#d4e4ee");
    assert.equal(mezclar("red", "#ffffff", 0.5), "red");
});
