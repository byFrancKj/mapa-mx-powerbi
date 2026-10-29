import { test } from "node:test";
import assert from "node:assert/strict";

import { crearDataView, crearHost, nuevoElemento, opcionesUpdate, ventana } from "./entorno";

const { Visual } = await import("../src/visual");

const CLAVES = Array.from({ length: 32 }, (_, i) => String(i + 1).padStart(2, "0"));

function montar(opciones: { altoContraste?: boolean } = {}) {
    const elemento = nuevoElemento();
    const entorno = crearHost(opciones);
    const visual = new Visual({ element: elemento, host: entorno.host } as never);
    return { elemento, visual, ...entorno };
}

const areas = (el: HTMLElement) => [...el.querySelectorAll<SVGPathElement>("path.area")];
const area = (el: HTMLElement, nombre: string) => areas(el).find((p) => p.getAttribute("aria-label")?.startsWith(`${nombre}:`));
const textos = (el: HTMLElement, selector: string) => [...el.querySelectorAll(selector)].map((t) => t.textContent);
const esperar = () => new Promise((r) => setTimeout(r, 0));

test("dibuja los 32 estados y colorea solo los que tienen valor", () => {
    const { elemento, visual, llamadas } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: ["14", "15", "9", 1], valores: [100, 400, 300, 200], formato: "#,0" })));
    assert.deepEqual(llamadas.render, ["inicio", "fin"]);
    assert.equal(areas(elemento).length, 32);
    assert.equal(areas(elemento).filter((p) => p.classList.contains("con-dato")).length, 4);
    assert.equal(area(elemento, "Jalisco")?.getAttribute("aria-label"), "Jalisco: 100");
    assert.equal(area(elemento, "Sonora")?.getAttribute("fill"), "#ffffff");
    assert.notEqual(area(elemento, "Estado de México")?.getAttribute("fill"), "#ffffff");
    assert.equal(elemento.querySelector<HTMLElement>(".mensaje")?.style.display, "none");
});

test("la leyenda usa el nombre y el formato de la medida, y marca los estados sin dato", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({
        claves: CLAVES.slice(0, 10), valores: [1e6, 2e6, 3e6, 4e6, 5e6, 6e6, 7e6, 8e6, 9e6, 1.2e9],
        nombre: "Ventas Cadenas", formato: "\\$#,0",
    })));
    assert.equal(elemento.querySelector(".leyenda .titulo")?.textContent, "Ventas Cadenas");
    const etiquetas = textos(elemento, ".leyenda .etiqueta");
    assert.equal(etiquetas[0], "$1 M – $2 M");
    assert.equal(etiquetas[etiquetas.length - 2], "$9 M – $1.2 mil M");
    assert.equal(etiquetas[etiquetas.length - 1], "Sin dato");
});

test("escala divergente con centro y umbrales del panel de formato", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({
        claves: ["01", "02", "03", "04", "05"], valores: [50, 85, 100, 120, 150], formato: "#,0",
        objetos: { colores: { metodo: "divergente", centro: 100, umbral1: 10, umbral2: 30 } },
    })));
    assert.deepEqual(textos(elemento, ".leyenda .etiqueta").slice(0, 5), ["< 70", "70 a 90", "90 a 110", "110 a 130", "> 130"]);
    const relleno = (n: string) => area(elemento, n)?.getAttribute("fill");
    assert.equal(relleno("Aguascalientes"), "#ca0020"); // muy por debajo: rojo
    assert.equal(relleno("Baja California Sur"), "#f7f7f7"); // similar: gris
    assert.equal(relleno("Coahuila"), "#0571b0"); // muy por encima: azul
});

test("avisa de las claves que no reconoce, sin romper el mapa", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: ["14", "Jalisco", "33", null, "14"], valores: [1, 2, 3, 4, 5] })));
    const aviso = elemento.querySelector(".aviso");
    assert.equal(aviso?.textContent?.split("Revisa")[0], "⚠ 3 claves no reconocidas · 1 repetidas");
    assert.match(aviso?.querySelector("title")?.textContent ?? "", /Jalisco, 33, \(en blanco\)/);
    assert.equal(areas(elemento).filter((p) => p.classList.contains("con-dato")).length, 1);
});

test("sin campos muestra cómo empezar; sin medida pide una", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(null));
    const mensaje = () => elemento.querySelector<HTMLElement>(".mensaje");
    assert.match(mensaje()?.textContent ?? "", /Arrastra a Ubicación/);
    assert.equal(areas(elemento).length, 32);
    visual.update(opcionesUpdate(crearDataView({ claves: ["14"] })));
    assert.equal(mensaje()?.textContent, "Agrega una medida en Valor.");
});

test("clic selecciona y atenúa los demás; clic en el fondo limpia", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: ["14", "15"], valores: [1, 2] })));
    area(elemento, "Jalisco")?.dispatchEvent(new ventana.MouseEvent("click", { bubbles: true }));
    await esperar();
    assert.equal(area(elemento, "Jalisco")?.style.opacity, "1");
    assert.equal(area(elemento, "Estado de México")?.style.opacity, "0.35");
    elemento.querySelector("svg")?.dispatchEvent(new ventana.MouseEvent("click", { bubbles: true }));
    await esperar();
    assert.equal(area(elemento, "Estado de México")?.style.opacity, "1");
});

test("responde a selecciones que llegan de fuera (marcadores, otros visuales)", () => {
    const { elemento, visual, seleccionarDesdeFuera } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: ["14", "15"], valores: [1, 2] })));
    seleccionarDesdeFuera(["15"]);
    assert.equal(area(elemento, "Estado de México")?.getAttribute("aria-selected"), "true");
    assert.equal(area(elemento, "Jalisco")?.style.opacity, "0.35");
});

test("tooltip con el estado, la medida formateada y las medidas extra", () => {
    const { elemento, visual, llamadas } = montar();
    visual.update(opcionesUpdate(crearDataView({
        claves: ["14"], valores: [1234.5], nombre: "Ventas", formato: "#,0.00",
        tooltips: [{ nombre: "Crecimiento", valores: [0.163], formato: "0.0%" }],
    })));
    area(elemento, "Jalisco")?.dispatchEvent(new ventana.MouseEvent("pointerover", { bubbles: true, clientX: 10, clientY: 20 }));
    const [tipo, datos] = llamadas.tooltip[0];
    assert.equal(tipo, "show");
    assert.deepEqual(datos.dataItems, [
        { displayName: "Estado", value: "Jalisco" },
        { displayName: "Ventas", value: "1,234.50" },
        { displayName: "Crecimiento", value: "16.3%" },
    ]);
    area(elemento, "Jalisco")?.dispatchEvent(new ventana.MouseEvent("pointerout", { bubbles: true }));
    assert.equal(llamadas.tooltip[llamadas.tooltip.length - 1][0], "hide");
});

test("clic derecho abre el menú contextual de Power BI", () => {
    const { elemento, visual, llamadas } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: ["14"], valores: [1] })));
    area(elemento, "Jalisco")?.dispatchEvent(new ventana.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    assert.equal(llamadas.menu, 1);
});

test("alto contraste: límites y sin-dato con los colores del tema", () => {
    const { elemento, visual } = montar({ altoContraste: true });
    visual.update(opcionesUpdate(crearDataView({ claves: ["14"], valores: [1] })));
    assert.equal(area(elemento, "Sonora")?.getAttribute("stroke"), "#ffff00");
    assert.equal(area(elemento, "Sonora")?.getAttribute("fill"), "#000000");
});

test("el modelo de formato expone las tarjetas Colores, Mapa, Etiquetas, Leyenda, Panel y Zoom", () => {
    const { visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: ["14"], valores: [1] })));
    const modelo = visual.getFormattingModel();
    // "Bivariado" y "Grupos" solo aparecen cuando se usan Valor 2 y Grupo.
    assert.deepEqual(modelo.cards.filter((c) => c.visible !== false).map((c) => c.displayName), [
        "Colores", "Mapa", "Etiquetas", "Leyenda", "Panel de detalle", "Al seleccionar varias áreas", "Zoom",
    ]);
});
