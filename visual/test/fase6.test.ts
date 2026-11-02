import { test } from "node:test";
import assert from "node:assert/strict";

import { crearDataView, crearHost, MedidaFalsa, nuevoElemento, opcionesUpdate, OpcionesDataView, ventana } from "./entorno";

const { Visual } = await import("../src/visual");
const { agruparTextos } = await import("../src/resumen");

function montar(opciones: { locale?: string } = {}) {
    const elemento = nuevoElemento();
    const entorno = crearHost(opciones);
    const visual = new Visual({ element: elemento, host: entorno.host } as never);
    return { elemento, visual, ...entorno };
}

const esperar = () => new Promise((r) => setTimeout(r, 0));
const area = (el: HTMLElement, nombre: string) =>
    [...el.querySelectorAll<SVGPathElement>("path.area")].find((p) => p.getAttribute("aria-label")?.startsWith(nombre));
const textos = (el: HTMLElement, selector: string) => [...el.querySelectorAll(selector)].map((t) => t.textContent);
const clic = (e: Element | null | undefined, opciones: MouseEventInit = {}) =>
    e?.dispatchEvent(new ventana.MouseEvent("click", { bubbles: true, cancelable: true, ...opciones }));

const CLAVES = ["14", "15", "09"]; // Jalisco, Estado de México, Ciudad de México
const TOP = "Tienda Centro\nTienda Norte\nTienda Sur";

function panelCon(tarjetas: MedidaFalsa[], extra: Partial<OpcionesDataView> = {}): OpcionesDataView {
    return { claves: CLAVES, valores: [366e6, 200e6, 445e6], nombre: "Ventas", formato: "\\$#,0", tarjetas, ...extra };
}

/** Selecciona los estados con clics y devuelve el panel ya dibujado. */
async function seleccionar(elemento: HTMLElement, ...estados: string[]) {
    estados.forEach((e, i) => clic(area(elemento, e), { ctrlKey: i > 0 }));
    await esperar();
}

test("agruparTextos: cada texto una vez, con sus áreas; los vacíos no cuentan", () => {
    assert.deepEqual(agruparTextos([
        { area: "Jalisco", texto: "A" },
        { area: "Colima", texto: null },
        { area: "Sonora", texto: "B" },
        { area: "Nayarit", texto: "A" },
    ]), [{ texto: "A", areas: ["Jalisco", "Nayarit"] }, { texto: "B", areas: ["Sonora"] }]);
    assert.deepEqual(agruparTextos([{ area: "Jalisco", texto: null }]), []);
});

test("tarjeta de texto: muestra lo que da DAX, no 'Sin dato', con sus saltos de línea y a todo el ancho", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(panelCon([
        { nombre: "Top 3 tiendas", valores: [TOP, "Otra", "Otra más"], tipo: { text: true } },
    ]))));
    await seleccionar(elemento, "Jalisco");
    const valor = elemento.querySelector(".tarjeta-valor");
    assert.equal(valor?.textContent, TOP);
    assert.ok(valor?.classList.contains("texto"));
    assert.ok(elemento.querySelector(".tarjeta")?.classList.contains("ancha"));
    assert.equal(elemento.querySelector(".tarjeta .nota"), null);
});

test("tarjeta de texto: un texto corto se queda en una tarjeta normal", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(panelCon([{ nombre: "Estatus", valores: ["Cumple", "No cumple", "Cumple"] }]))));
    await seleccionar(elemento, "Jalisco");
    assert.equal(elemento.querySelector(".tarjeta-valor")?.textContent, "Cumple");
    assert.equal(elemento.querySelector(".tarjeta")?.classList.contains("ancha"), false);
});

test("tarjeta de texto: un texto repetido en las áreas seleccionadas sale una sola vez", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(panelCon([{ nombre: "Top 3 región", valores: [TOP, TOP, TOP] }]))));
    await seleccionar(elemento, "Jalisco", "Ciudad de México");
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), [TOP]);
    assert.equal(elemento.querySelector(".tarjeta-areas"), null);
});

test("tarjeta de texto: si difieren, un renglón por texto con sus áreas; nunca una suma", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(panelCon([{ nombre: "Top 3", valores: ["A", "B", "A"] }]))));
    await seleccionar(elemento, "Jalisco", "Estado de México", "Ciudad de México");
    assert.deepEqual(textos(elemento, ".tarjeta-areas dt"), ["Jalisco, Ciudad de México", "Estado de México"]);
    assert.deepEqual(textos(elemento, ".tarjeta-areas dd"), ["A", "B"]);
    assert.equal(elemento.querySelector(".tarjeta-valor"), null);
    assert.ok(elemento.querySelector(".tarjeta")?.classList.contains("ancha"));
});

test("tarjeta de texto: avisa cuántas áreas no tienen texto y usa 'Sin dato' si ninguna tiene", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(panelCon([
        { nombre: "Top 3", valores: ["A", "A", null] },
        { nombre: "Vacía", valores: [null, "", null], tipo: { text: true } },
    ]))));
    await seleccionar(elemento, "Jalisco", "Estado de México", "Ciudad de México");
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), ["A", "Sin dato"]);
    assert.deepEqual(textos(elemento, ".tarjeta .nota"), ["2 de 3 estados"]);
});

test("tarjeta de texto: limita los textos distintos y las áreas que nombra", async () => {
    const claves = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13"];
    const valores = claves.map((_, i) => (i < 4 ? "Común" : `Texto ${i}`));
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves, valores: claves.map((_, i) => i + 1), tarjetas: [{ nombre: "Top", valores }] })));
    await seleccionar(elemento, "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", "Coahuila",
        "Colima", "Chiapas", "Chihuahua", "Ciudad de México", "Durango", "Guanajuato", "Guerrero", "Hidalgo");
    const areas = textos(elemento, ".tarjeta-areas dt");
    assert.equal(areas.length, 8);
    assert.equal(areas[0], "Aguascalientes, Baja California, Baja California Sur y 1 más");
    assert.equal(elemento.querySelector(".tarjeta .nota")?.textContent, "y 2 más");
});

test("tarjeta de fecha: usa el formato de la medida y con varias áreas da el rango", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(panelCon([{
        nombre: "Última venta",
        valores: [new Date(2026, 8, 30), new Date(2026, 7, 15), null],
        formato: "dd/MM/yyyy",
        tipo: { dateTime: true },
    }]))));
    await seleccionar(elemento, "Jalisco");
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), ["30/09/2026"]);
    await seleccionar(elemento, "Estado de México", "Jalisco");
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), ["15/08/2026 – 30/09/2026"]);
    assert.ok(elemento.querySelector(".tarjeta")?.classList.contains("ancha"), "el rango se lee completo");
    assert.deepEqual(textos(elemento, ".tarjeta .nota"), ["rango de 2 estados"]);
});

test("tarjeta de fecha: también llega como texto en una columna de fechas, y sin formato no falla", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(panelCon([{
        nombre: "Última venta", valores: ["2026-09-30T12:00:00.000Z", null, null], tipo: { dateTime: true },
    }]))));
    await seleccionar(elemento, "Jalisco");
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), [new Date("2026-09-30T12:00:00.000Z").toLocaleDateString("es-MX")]);
});

test("tarjeta sí/no: en el idioma del reporte; con áreas distintas agrupa", async () => {
    const { elemento, visual } = montar();
    const datos = crearDataView(panelCon([{ nombre: "Cumple meta", valores: [true, false, true], tipo: { bool: true } }]));
    visual.update(opcionesUpdate(datos));
    await seleccionar(elemento, "Jalisco");
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), ["Sí"]);
    await seleccionar(elemento, "Estado de México", "Jalisco");
    assert.deepEqual(textos(elemento, ".tarjeta-areas dd"), ["Sí", "No"]);
    assert.deepEqual(textos(elemento, ".tarjeta-areas dt"), ["Jalisco", "Estado de México"]);

    const ingles = montar({ locale: "en-US" });
    ingles.visual.update(opcionesUpdate(datos));
    await seleccionar(ingles.elemento, "Jalisco");
    assert.deepEqual(textos(ingles.elemento, ".tarjeta-valor"), ["Yes"]);
});

test("una medida mixta (número o texto según el caso) se muestra como la dio DAX, con su formato", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(panelCon([{ nombre: "Crec", valores: [0.064, "N/A", null], formato: "0.0%" }]))));
    await seleccionar(elemento, "Jalisco");
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), ["6.4%"]);
    await seleccionar(elemento, "Estado de México");
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), ["N/A"]);
});

test("una medida numérica con textos vacíos sigue siendo numérica: se combina y se puede elegir cómo", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(panelCon([{ nombre: "Unidades", valores: [10, "", 30], formato: "#,0", objetos: { agregacion: { tipo: "suma" } } }]))));
    await seleccionar(elemento, "Jalisco", "Estado de México", "Ciudad de México");
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), ["40"]);
    assert.deepEqual(textos(elemento, ".tarjeta .nota"), ["suma de 2 de 3 estados"]);
});

test("formato: solo las medidas numéricas tienen lista de 'Al seleccionar varias áreas'", () => {
    const { visual } = montar();
    visual.update(opcionesUpdate(crearDataView(panelCon([
        { nombre: "Top 3", valores: ["A", "B", "C"], tipo: { text: true } },
        { nombre: "Última venta", valores: [new Date(2026, 0, 1), new Date(2026, 0, 2), null], tipo: { dateTime: true } },
        { nombre: "Crec %", valores: [0.1, 0.2, 0.3], formato: "0.0%" },
    ]))));
    const agregacion = visual.getFormattingModel().cards.find((c) => c.uid.startsWith("agregacion"));
    const nombres = agregacion?.groups.flatMap((g) => g.slices ?? []).map((s) => s.displayName);
    assert.deepEqual(nombres, ["Crec %"]);
});

test("solo Tarjetas: el mapa funciona sin Valor y sin Bases, y sin medidas numéricas no ofrece combinar", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: CLAVES, tarjetas: [{ nombre: "Top 3", valores: [TOP, "B", "C"], tipo: { text: true } }] })));
    await seleccionar(elemento, "Jalisco");
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), [TOP]);
    assert.equal(visual.getFormattingModel().cards.some((c) => c.uid.startsWith("agregacion")), false);
});

test("resaltado: un texto fijo no marca como resaltadas las áreas fuera del filtro", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(panelCon([
        { nombre: "Top 3 región", valores: [TOP, TOP, TOP], resaltes: [TOP, TOP, TOP] },
    ], { resaltes: [366e6, null, null] }))));
    await esperar();
    assert.equal(elemento.querySelector(".panel-titulo")?.textContent, "Jalisco", "solo el área con cifra resaltada entra al panel");
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), [TOP]);
});

test("resaltado: sin cifras, deciden los textos (y un texto vacío no cuenta)", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({
        claves: CLAVES,
        tarjetas: [{ nombre: "Top 3", valores: ["A", "B", "C"], resaltes: ["A", "", null], tipo: { text: true } }],
    })));
    await esperar();
    assert.equal(elemento.querySelector(".panel-titulo")?.textContent, "Jalisco");
});

test("tooltips: las fechas usan el formato de la medida y los sí/no el idioma del reporte", () => {
    const { elemento, visual, llamadas } = montar();
    visual.update(opcionesUpdate(crearDataView({
        claves: CLAVES, valores: [1, 2, 3],
        tooltips: [
            { nombre: "Última venta", valores: [new Date(2026, 8, 30), null, null], formato: "dd/MM/yyyy" },
            { nombre: "Cumple", valores: [true, false, true] },
            { nombre: "Top", valores: ["Tienda Centro", null, null] },
        ],
    })));
    area(elemento, "Jalisco")?.dispatchEvent(new ventana.MouseEvent("pointerover", { bubbles: true }));
    area(elemento, "Jalisco")?.dispatchEvent(new ventana.MouseEvent("pointerenter", { bubbles: true }));
    const items = llamadas.tooltip.at(-1)?.[1].dataItems ?? [];
    const de = (nombre: string) => items.find((i) => i.displayName === nombre)?.value;
    assert.equal(de("Última venta"), "30/09/2026");
    assert.equal(de("Cumple"), "Sí");
    assert.equal(de("Top"), "Tienda Centro");
});
