import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

import { crearDataView, crearHost, nuevoElemento, opcionesUpdate, recursos, ventana } from "./entorno";

const { Visual } = await import("../src/visual");
const { Ajustes, OPCIONES_AGREGACION } = await import("../src/ajustes");
const { BIVARIADAS, colorBivariado } = await import("../src/paletas");
const { formatoCompacto } = await import("../src/formato");

function montar(locale?: string) {
    const elemento = nuevoElemento();
    const entorno = crearHost({ locale });
    const visual = new Visual({ element: elemento, host: entorno.host } as never);
    return { elemento, visual, ...entorno };
}

const areas = (el: HTMLElement) => [...el.querySelectorAll<SVGPathElement>("path.area")];
const area = (el: HTMLElement, inicio: string) => areas(el).find((p) => p.getAttribute("aria-label")?.startsWith(inicio));
const tarjetasVisibles = (visual: InstanceType<typeof Visual>) =>
    visual.getFormattingModel().cards.filter((c) => (c as { visible?: boolean }).visible !== false).map((c) => c.displayName);

// Nueve estados: Valor y Valor 2 crecen en direcciones distintas
const CLAVES = ["01", "02", "03", "04", "05", "06", "07", "08", "09"];
const X = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const Y = [9, 8, 7, 6, 5, 4, 3, 2, 1];

function bivariado(extra: Partial<Parameters<typeof crearDataView>[0]> = {}) {
    return crearDataView({ claves: CLAVES, valores: X, nombre: "Índice", formato: "#,0", ...extra });
}

function conValor2(dv: ReturnType<typeof crearDataView>, valores2: Array<number | null>, nombre = "Crecimiento") {
    const columna = { source: { displayName: nombre, roles: { valor2: true }, format: "0.0%" }, values: valores2 };
    (dv.categorical?.values as unknown as unknown[]).push(columna);
    return dv;
}

test("paletas bivariadas: 9 colores, gris en la esquina baja-baja", () => {
    for (const [nombre, colores] of Object.entries(BIVARIADAS)) {
        assert.equal(colores.length, 9, nombre);
        assert.equal(colorBivariado(nombre, 0, 0), "#e8e8e8", nombre);
    }
    assert.equal(colorBivariado("turquesa-rosa", 2, 2), "#3b4994");
});

test("bivariado: terciles de cada medida, leyenda 3×3 y tarjeta propia", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(conValor2(bivariado(), Y.map((y) => y / 100))));
    const celdas = [...elemento.querySelectorAll(".leyenda rect.muestra")];
    assert.equal(celdas.length, 9, "9 celdas; los 23 estados sin datos quedan de fondo (no son Sin dato)");
    // 01: X bajo, Y alto → celda (0, 2); 09: X alto, Y bajo → celda (2, 0)
    assert.equal(area(elemento, "Aguascalientes")?.getAttribute("fill"), colorBivariado("turquesa-rosa", 0, 2));
    assert.equal(area(elemento, "Ciudad de México")?.getAttribute("fill"), colorBivariado("turquesa-rosa", 2, 0));
    assert.equal(area(elemento, "Sonora")?.getAttribute("fill"), "#f3f2ef");
    const tarjetas = tarjetasVisibles(visual);
    assert.ok(tarjetas.includes("Bivariado"));
    // El método de clasificación no aplica en el bivariado
    const colores = visual.getFormattingModel().cards.find((c) => c.displayName === "Colores") as unknown as {
        groups: Array<{ slices: Array<{ displayName: string }> }>;
    };
    const nombres = colores.groups.flatMap((g) => g.slices.map((s) => s.displayName));
    assert.ok(!nombres.includes("Método") && nombres.includes("Sin dato"), nombres.join(", "));
});

test("bivariado: el tooltip trae ambas medidas y la clase", () => {
    const { elemento, visual, llamadas } = montar();
    visual.update(opcionesUpdate(conValor2(bivariado(), Y.map((y) => y / 100))));
    area(elemento, "Aguascalientes")?.dispatchEvent(new ventana.MouseEvent("pointerover", { bubbles: true }));
    assert.deepEqual(llamadas.tooltip[0][1].dataItems, [
        { displayName: "Estado", value: "Aguascalientes" },
        { displayName: "Índice", value: "1" },
        { displayName: "Crecimiento", value: "9.0%" },
        { displayName: "Clase", value: "bajo en Índice · alto en Crecimiento" },
    ]);
});

test("bivariado: un estado sin Valor 2 queda sin dato", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(conValor2(bivariado(), [null, ...Y.slice(1).map((y) => y / 100)])));
    assert.equal(area(elemento, "Aguascalientes")?.getAttribute("fill"), "#ffffff");
});

test("bivariado: la paleta se elige en su tarjeta", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(conValor2(bivariado({ objetos: { bivariado: { paleta: "rojo-azul" } } }), Y)));
    assert.equal(area(elemento, "Ciudad de México")?.getAttribute("fill"), colorBivariado("rojo-azul", 2, 0));
});

test("etiquetas: apagadas por defecto; encendidas, valor abreviado donde cabe", () => {
    const { elemento, visual } = montar();
    const dv = (objetos = {}) => crearDataView({ claves: ["08", "05", "09"], valores: [212498225, 65735656, 444803003], formato: "\\$#,0", objetos });
    visual.update(opcionesUpdate(dv()));
    assert.equal(elemento.querySelectorAll(".etiqueta-area").length, 0);
    // Sin el ajuste a los datos, para ver qué cabe en la vista del país
    visual.update(opcionesUpdate(dv({ etiquetas: { mostrar: true }, mapa: { encuadre: "pais" } })));
    const textos = [...elemento.querySelectorAll(".etiqueta-area")].map((t) => t.textContent);
    assert.ok(textos.includes("$212 M"), `Chihuahua cabe: ${textos.join(" | ")}`);
    assert.ok(!textos.includes("$445 M"), "la Ciudad de México es demasiado chica para su etiqueta a este tamaño");
});

test("etiquetas: nombre y valor en dos líneas; sin dato, solo el nombre", () => {
    const { elemento, visual } = montar();
    // Los 32 estados llegan (Sonora sin valor), así que Sonora es "Sin dato" y no fondo.
    const claves = Array.from({ length: 32 }, (_, i) => String(i + 1).padStart(2, "0"));
    visual.update(opcionesUpdate(crearDataView({
        claves, valores: claves.map((c) => (c === "08" ? 212498225 : null)), formato: "\\$#,0",
        objetos: { etiquetas: { mostrar: true, contenido: "nombre-valor" } },
    })));
    const lineas = (nombre: string) => [...elemento.querySelectorAll(".etiqueta-area")]
        .map((t) => [...t.querySelectorAll("tspan")].map((x) => x.textContent))
        .find((l) => l[0] === nombre);
    assert.deepEqual(lineas("Chihuahua"), ["Chihuahua", "$212 M"]);
    assert.deepEqual(lineas("Sonora"), ["Sonora"]);
});

test("etiquetas en municipios: solo donde caben", () => {
    const { elemento, visual } = montar();
    const claves = ["14039", "14120", "14097", "14098", "14063", "14053"];
    visual.update(opcionesUpdate(crearDataView({
        claves, valores: claves.map((_, i) => (i + 1) * 1e6), formato: "\\$#,0",
        objetos: { etiquetas: { mostrar: true }, mapa: { encuadre: "pais" } },
    }), 500, 400));
    const n = elemento.querySelectorAll(".etiqueta-area").length;
    assert.ok(n > 0 && n < claves.length, `se dibujan ${n} de ${claves.length}`);
});

test("en inglés: mensajes, tooltip, leyenda y unidades", () => {
    const { elemento, visual, llamadas } = montar("en-US");
    visual.update(opcionesUpdate(null));
    assert.match(elemento.querySelector(".mensaje")?.textContent ?? "", /^Drag to Location/);
    const claves = [...Array.from({ length: 32 }, (_, i) => String(i + 1).padStart(2, "0")), "XX"];
    visual.update(opcionesUpdate(crearDataView({ claves, valores: claves.map((c) => (c === "14" ? 1.5e9 : null)), nombre: "Sales", formato: "\\$#,0" })));
    assert.equal(elemento.querySelector(".aviso")?.firstChild?.textContent, "⚠ 1 unrecognized code");
    const etiquetas = [...elemento.querySelectorAll(".leyenda .etiqueta")].map((t) => t.textContent);
    assert.equal(etiquetas[etiquetas.length - 1], "No data");
    assert.equal(etiquetas[0], "$1.5 B");
    area(elemento, "Jalisco")?.dispatchEvent(new ventana.MouseEvent("pointerover", { bubbles: true }));
    assert.equal(llamadas.tooltip[0][1].dataItems?.[0].displayName, "State");
    assert.deepEqual(tarjetasVisibles(visual), ["Colors", "Map", "Labels", "Legend", "Detail panel", "Combining several areas", "Zoom"]);
    assert.ok([...elemento.querySelectorAll(".referencia-mar")].some((t) => t.textContent === "Gulf of Mexico"));
});

test("formato compacto con unidades en inglés", () => {
    const unidades = { mil: "K", millon: "M", milMillones: "B" };
    assert.equal(formatoCompacto(78430079.7, "$#,0", "en-US", String, unidades), "$78.4 M");
    assert.equal(formatoCompacto(-12345, "#,0", "en-US", String, unidades), "-12.3 K");
});

test("traducciones: toda clave usada existe en es-ES, es-MX y en-US, y es-MX es igual a es-ES", () => {
    const usadas = new Set<string>();
    // Panel de formato: tarjetas, opciones y elementos de los menús
    const ajustes = new Ajustes();
    for (const tarjeta of ajustes.cards as unknown as Array<Record<string, unknown>>) {
        usadas.add(String(tarjeta.displayNameKey));
        const slices = [...((tarjeta.slices as Array<Record<string, unknown>>) ?? []), ...(tarjeta.topLevelSlice ? [tarjeta.topLevelSlice as Record<string, unknown>] : [])];
        for (const s of slices) {
            for (const k of ["displayNameKey", "descriptionKey", "placeholderKey"]) {
                if (s[k]) usadas.add(String(s[k]));
            }
            for (const item of (s.items as Array<{ displayNameKey?: string }>) ?? []) {
                if (item.displayNameKey) usadas.add(item.displayNameKey);
            }
        }
    }
    // Campos del visual
    const capacidades = JSON.parse(readFileSync(new URL("../capabilities.json", import.meta.url), "utf8"));
    for (const rol of capacidades.dataRoles) {
        usadas.add(rol.displayNameKey);
        usadas.add(rol.descriptionKey);
    }
    // Las opciones por medida de "Al seleccionar varias áreas" (se arman con los datos)
    for (const item of OPCIONES_AGREGACION) {
        usadas.add(item.displayNameKey);
    }
    // Textos del visual, en todos sus módulos
    for (const archivo of readdirSync(new URL("../src/", import.meta.url)).filter((a) => a.endsWith(".ts"))) {
        const codigo = readFileSync(new URL(`../src/${archivo}`, import.meta.url), "utf8");
        for (const m of codigo.matchAll(/"((?:Texto|Unidad|Leyenda|Aviso|Mensaje|Panel|Zoom|Tarjeta|Ref)_[\w-]+)"/g)) {
            usadas.add(m[1]);
        }
    }
    const es = recursos("es-ES");
    const mx = recursos("es-MX");
    const en = recursos("en-US");
    for (const [idioma, textos] of Object.entries({ "es-ES": es, "es-MX": mx, "en-US": en })) {
        const faltan = [...usadas].filter((k) => !textos[k]);
        assert.deepEqual(faltan, [], `${idioma}: faltan ${faltan.join(", ")}`);
    }
    assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
    assert.deepEqual(mx, es);
    const sobran = Object.keys(es).filter((k) => !usadas.has(k));
    assert.deepEqual(sobran, [], `claves sin uso: ${sobran.join(", ")}`);
});

test("resaltado: lo que otro visual no resalta queda de fondo y el resto usa el valor resaltado", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: ["14", "15", "09"], valores: [10, 20, 30], resaltes: [4, null, 12] })));
    assert.ok(!area(elemento, "Jalisco")?.classList.contains("de-fondo"));
    assert.ok(area(elemento, "Estado de México")?.classList.contains("de-fondo"));
    assert.equal(area(elemento, "Estado de México")?.getAttribute("fill"), "#f3f2ef");
    assert.equal(area(elemento, "Jalisco")?.getAttribute("aria-label"), "Jalisco: 4");
    assert.equal(area(elemento, "Ciudad de México")?.getAttribute("aria-label"), "Ciudad de México: 12");
});

test("ícono de advertencia del encabezado con las claves no reconocidas", () => {
    const { visual, llamadas } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: ["14", "Jalisco"], valores: [1, 2] })));
    assert.equal(llamadas.advertencias.length, 1);
    assert.equal(llamadas.advertencias[0][0], "Hay claves que el mapa no pudo ubicar");
    assert.match(llamadas.advertencias[0][1], /1 clave no reconocida.*Jalisco/);
    visual.update(opcionesUpdate(crearDataView({ claves: ["14"], valores: [1] })));
    assert.equal(llamadas.advertencias.length, 1, "sin claves malas no hay advertencia");
});
