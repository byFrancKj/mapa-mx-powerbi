import { mock, test } from "node:test";
import assert from "node:assert/strict";

import { crearDataView, crearHost, nuevoElemento, opcionesUpdate, OpcionesDataView, ventana } from "./entorno";

const { Visual } = await import("../src/visual");

function montar() {
    const elemento = nuevoElemento();
    const entorno = crearHost();
    const visual = new Visual({ element: elemento, host: entorno.host } as never);
    return { elemento, visual, ...entorno };
}

const esperar = () => new Promise((r) => setTimeout(r, 0));
const area = (el: HTMLElement, nombre: string) =>
    [...el.querySelectorAll<SVGPathElement>("path.area")].find((p) => p.getAttribute("aria-label")?.startsWith(`${nombre}:`));
const textos = (el: HTMLElement, selector: string) => [...el.querySelectorAll(selector)].map((t) => t.textContent);
const texto = (el: HTMLElement, selector: string) => el.querySelector(selector)?.textContent;
const clic = (e: Element | null | undefined, opciones: MouseEventInit = {}) =>
    e?.dispatchEvent(new ventana.MouseEvent("click", { bubbles: true, cancelable: true, ...opciones }));
const tecla = (e: Element | null | undefined, key: string) => e?.dispatchEvent(new ventana.KeyboardEvent("keydown", { key, bubbles: true }));
const panelVisible = (el: HTMLElement) => el.querySelector<HTMLElement>("aside.panel")?.style.display !== "none";

// Occidente: Jalisco, Colima y Nayarit; Noroeste: Sonora y Sinaloa.
const CLAVES = ["14", "06", "18", "26", "25"];
const REGIONES = ["Occidente", "Occidente", "Occidente", "Noroeste", "Noroeste"];
const TOP_ESTADO = ["Tienda GDL", "Tienda COL", "Tienda TEP", "Tienda HMO", "Tienda CUL"];
const REGION: OpcionesDataView = {
    claves: CLAVES,
    grupo: { nombre: "Región", valores: REGIONES },
    valores: [300, 40, 60, 120, 80],
    nombre: "Ventas",
    formato: "#,0",
    bases: [{ nombre: "Ventas", valores: [300, 40, 60, 120, 80], formato: "#,0" }],
    tarjetas: [
        { nombre: "Top 3 tiendas", valores: TOP_ESTADO, tipo: { text: true } },
        // Tiendas distintas: una tienda que vende en dos estados cuenta una vez, así que no se suma.
        { nombre: "Tiendas", valores: [500, 90, 120, 300, 200], formato: "#,0" },
    ],
    // Lo que calcula DAX en cada nodo de la matriz
    totales: {
        general: { "Ventas": 600, "Top 3 tiendas": "Tienda GDL\nTienda HMO\nTienda CUL", "Tiendas": 877 },
        grupos: {
            Occidente: { "Ventas": 400, "Top 3 tiendas": "Tienda GDL\nTienda TEP\nTienda COL", "Tiendas": 640 },
            Noroeste: { "Ventas": 200, "Top 3 tiendas": "Tienda HMO\nTienda CUL\nTienda NAV", "Tiendas": 455 },
        },
    },
    objetos: { colores: { colorearPor: "grupo" }, panel: { abrir: "seleccion" } },
};

const regionEnLeyenda = (el: HTMLElement, region: string) =>
    [...el.querySelectorAll(".entrada-grupo")].find((e) => e.getAttribute("aria-label")?.includes(region));

test("una región: las tarjetas muestran lo que calcula DAX para la región, sin sumar ni notas", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(REGION)));
    clic(regionEnLeyenda(elemento, "Occidente"));
    await esperar();
    assert.equal(texto(elemento, ".panel-titulo"), "Occidente");
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), ["Tienda GDL\nTienda TEP\nTienda COL", "640"]);
    assert.deepEqual(textos(elemento, ".tarjeta .nota"), []);
    // La base también usa el total de DAX: exacto y sin "suma de 3 estados".
    assert.deepEqual(textos(elemento, ".base-valor"), ["400"]);
    assert.deepEqual(textos(elemento, ".base .nota"), []);
});

test("todo seleccionado (o todo lo filtrado): el total general de DAX", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ ...REGION, objetos: { ...REGION.objetos, panel: { abrir: "siempre" } } })));
    await esperar();
    assert.ok(panelVisible(elemento));
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), ["Tienda GDL\nTienda HMO\nTienda CUL", "877"]);
});

test("un filtro que deja una región: el total de DAX de lo filtrado", async () => {
    const { elemento, visual } = montar();
    const occidente = (v: unknown[]) => v.slice(0, 3);
    visual.update(opcionesUpdate(crearDataView({
        ...REGION,
        claves: occidente(CLAVES),
        grupo: { nombre: "Región", valores: occidente(REGIONES) },
        valores: [300, 40, 60],
        bases: [{ nombre: "Ventas", valores: [300, 40, 60], formato: "#,0" }],
        tarjetas: [
            { nombre: "Top 3 tiendas", valores: occidente(TOP_ESTADO) as string[], tipo: { text: true } },
            { nombre: "Tiendas", valores: [500, 90, 120], formato: "#,0" },
        ],
        totales: { general: REGION.totales?.grupos?.Occidente, grupos: { Occidente: REGION.totales?.grupos?.Occidente ?? {} } },
        objetos: { panel: { abrir: "filtro" } },
    })));
    await esperar();
    assert.ok(panelVisible(elemento), "el filtro abre el panel");
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), ["Tienda GDL\nTienda TEP\nTienda COL", "640"]);
});

test("una región completa más un estado suelto: el total de la región y el valor del estado", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(REGION)));
    clic(regionEnLeyenda(elemento, "Occidente"));
    await esperar();
    clic(area(elemento, "Sonora"), { ctrlKey: true });
    await esperar();
    const tarjetas = [...elemento.querySelectorAll(".tarjeta")];
    assert.deepEqual(textos(tarjetas[1], ".tarjeta-areas dt"), ["Occidente", "Sonora"]);
    assert.deepEqual(textos(tarjetas[1], ".tarjeta-areas dd"), ["640", "300"]);
    // Sin un total de DAX para la combinación, la base sí se combina, y lo dice.
    assert.deepEqual(textos(elemento, ".base-valor"), ["520"]);
    assert.deepEqual(textos(elemento, ".base .nota"), ["suma de 4 estados"]);
});

test("estados sueltos de una región: el valor de DAX de cada uno, no el de la región", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(REGION)));
    clic(area(elemento, "Jalisco"));
    await esperar();
    clic(area(elemento, "Colima"), { ctrlKey: true });
    await esperar();
    const tiendas = [...elemento.querySelectorAll(".tarjeta")][1];
    assert.deepEqual(textos(tiendas, ".tarjeta-areas dt"), ["Jalisco", "Colima"]);
    assert.deepEqual(textos(tiendas, ".tarjeta-areas dd"), ["500", "90"]);
});

test("clic en otro visual: el total de DAX con el resaltado", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({
        ...REGION,
        resaltes: [100, 10, null, 50, 20],
        totales: { ...REGION.totales, resalteGeneral: { "Ventas": 180, "Tiendas": 333, "Top 3 tiendas": "Tienda GDL" } },
        objetos: { panel: { abrir: "filtro" } },
    })));
    await esperar();
    assert.ok(panelVisible(elemento));
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), ["Tienda GDL", "333"]);
});

// ------------------------------------------------------------ línea del tiempo

const PERIODOS: OpcionesDataView = {
    claves: ["14", "15", "09"],
    valores: [0, 0, 0],
    nombre: "Ventas",
    formato: "#,0",
    periodos: {
        nombre: "Año-Mes",
        etiquetas: ["2026-01", "2026-02", "2026-03"],
        valores: [[10, 20, 30], [40, 50, 60], [70, 80, 90]],
        total: [120, 150, 180],
    },
};
const etiquetaArea = (el: HTMLElement, nombre: string) => area(el, nombre)?.getAttribute("aria-label");

test("línea del tiempo: empieza en el total de DAX; play recorre los periodos y repite", () => {
    mock.timers.enable({ apis: ["setInterval"] });
    try {
        const { elemento, visual } = montar();
        visual.update(opcionesUpdate(crearDataView(PERIODOS)));
        assert.ok(elemento.querySelector<HTMLElement>(".tiempo")?.style.display !== "none");
        assert.equal(texto(elemento, ".tiempo-etiqueta"), "Total");
        assert.equal(etiquetaArea(elemento, "Jalisco"), "Jalisco: 120");
        assert.equal(elemento.querySelectorAll(".tiempo-marca").length, 3);

        clic(elemento.querySelector(".tiempo-play"));
        assert.equal(texto(elemento, ".tiempo-etiqueta"), "2026-01");
        assert.equal(etiquetaArea(elemento, "Jalisco"), "Jalisco: 10");
        assert.equal(elemento.querySelector(".tiempo-play")?.getAttribute("aria-label"), "Pausar");
        mock.timers.tick(1000);
        assert.equal(etiquetaArea(elemento, "Jalisco"), "Jalisco: 40");
        mock.timers.tick(1000);
        assert.equal(texto(elemento, ".tiempo-etiqueta"), "2026-03");
        mock.timers.tick(1000);
        assert.equal(texto(elemento, ".tiempo-etiqueta"), "2026-01", "repite al terminar");

        clic(elemento.querySelector(".tiempo-play"));
        mock.timers.tick(5000);
        assert.equal(texto(elemento, ".tiempo-etiqueta"), "2026-01", "en pausa no avanza");
        clic(elemento.querySelector(".tiempo-total"));
        assert.equal(etiquetaArea(elemento, "Jalisco"), "Jalisco: 120");
    } finally {
        mock.timers.reset();
    }
});

test("línea del tiempo: el rango limita lo que se reproduce y sin repetir se detiene", () => {
    mock.timers.enable({ apis: ["setInterval"] });
    try {
        const { elemento, visual } = montar();
        visual.update(opcionesUpdate(crearDataView({ ...PERIODOS, objetos: { tiempo: { repetir: false, velocidad: 2 } } })));
        tecla(elemento.querySelector(".tiempo-asa.inicio"), "ArrowRight");
        assert.equal(elemento.querySelector(".tiempo-asa.inicio")?.getAttribute("aria-valuetext"), "2026-02");
        assert.ok(elemento.querySelector(".tiempo-marca")?.classList.contains("fuera"));
        clic(elemento.querySelector(".tiempo-play"));
        assert.equal(texto(elemento, ".tiempo-etiqueta"), "2026-02", "empieza en el inicio del rango");
        mock.timers.tick(1000);
        assert.equal(texto(elemento, ".tiempo-etiqueta"), "2026-02", "2 segundos por periodo");
        mock.timers.tick(1000);
        assert.equal(texto(elemento, ".tiempo-etiqueta"), "2026-03");
        mock.timers.tick(2000);
        assert.equal(texto(elemento, ".tiempo-etiqueta"), "2026-03", "sin repetir, se queda en el último");
        assert.equal(elemento.querySelector(".tiempo-play")?.getAttribute("aria-label"), "Reproducir");
        // Con las flechas se va periodo por periodo, dentro del rango.
        tecla(elemento.querySelector(".tiempo-actual"), "ArrowLeft");
        tecla(elemento.querySelector(".tiempo-actual"), "ArrowLeft");
        assert.equal(texto(elemento, ".tiempo-etiqueta"), "2026-02");
    } finally {
        mock.timers.reset();
    }
});

test("línea del tiempo: escala común (el mismo valor, el mismo color) o de cada periodo", () => {
    const color = (escala: string) => {
        const { elemento, visual } = montar();
        visual.update(opcionesUpdate(crearDataView({ ...PERIODOS, objetos: { colores: { clases: 3 }, tiempo: { escala } } })));
        tecla(elemento.querySelector(".tiempo-asa.fin"), "ArrowLeft");
        tecla(elemento.querySelector(".tiempo-asa.inicio"), "ArrowLeft");
        clic(elemento.querySelector(".tiempo-play"));
        const enero = area(elemento, "Jalisco")?.getAttribute("fill");
        clic(elemento.querySelector(".tiempo-play"));
        tecla(elemento.querySelector(".tiempo-actual"), "ArrowRight");
        const febrero = area(elemento, "Jalisco")?.getAttribute("fill");
        return { enero, febrero };
    };
    const comun = color("comun");
    assert.notEqual(comun.enero, comun.febrero, "con escala común, 10 y 40 no son la misma clase");
    const propia = color("periodo");
    assert.equal(propia.enero, propia.febrero, "en cada periodo, Jalisco es el más bajo");
});

test("línea del tiempo: el panel y el tooltip dicen el periodo; el encuadre no salta", async () => {
    const { elemento, visual, llamadas } = montar();
    visual.update(opcionesUpdate(crearDataView({ ...PERIODOS, objetos: { panel: { abrir: "seleccion" } } })));
    clic(area(elemento, "Jalisco"));
    await esperar();
    const transformacion = elemento.querySelector(".capa-mapa")?.getAttribute("transform");
    tecla(elemento.querySelector(".tiempo-asa.inicio"), "ArrowRight");
    clic(elemento.querySelector(".tiempo-play"));
    clic(elemento.querySelector(".tiempo-play"));
    assert.equal(texto(elemento, ".panel-titulo"), "Jalisco", "la selección sigue al cambiar de periodo");
    assert.equal(texto(elemento, ".panel-subtitulo"), "2026-02");
    area(elemento, "Jalisco")?.dispatchEvent(new ventana.MouseEvent("pointerover", { bubbles: true }));
    const items = llamadas.tooltip.at(-1)?.[1].dataItems ?? [];
    assert.equal(items.find((i) => i.displayName === "Año-Mes")?.value, "2026-02");
    assert.equal(elemento.querySelector(".capa-mapa")?.getAttribute("transform"), transformacion);
});

test("sin campo Periodo no hay línea del tiempo ni su tarjeta de formato", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: ["14"], valores: [1] })));
    assert.equal(elemento.querySelector<HTMLElement>(".tiempo")?.style.display, "none");
    assert.equal(visual.getFormattingModel().cards.some((c) => c.uid.startsWith("tiempo")), false);
    visual.update(opcionesUpdate(crearDataView(PERIODOS)));
    assert.ok(visual.getFormattingModel().cards.some((c) => c.uid.startsWith("tiempo")));
});
