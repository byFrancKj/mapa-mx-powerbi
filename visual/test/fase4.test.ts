import { test } from "node:test";
import assert from "node:assert/strict";

import { COLORES_TEMA, crearDataView, crearHost, nuevoElemento, opcionesUpdate, OpcionesDataView, ventana } from "./entorno";

const { Visual } = await import("../src/visual");
const { coloresDivergentes, coloresSecuenciales, SEMAFORO } = await import("../src/paletas");
const { comparar, resumir } = await import("../src/resumen");
const { acotar, encuadrar, escalarEn, interpolar } = await import("../src/zoom");

function montar() {
    const elemento = nuevoElemento();
    const entorno = crearHost();
    const visual = new Visual({ element: elemento, host: entorno.host } as never);
    return { elemento, visual, ...entorno };
}

const esperar = () => new Promise((r) => setTimeout(r, 0));
const areas = (el: HTMLElement) => [...el.querySelectorAll<SVGPathElement>("path.area")];
const area = (el: HTMLElement, nombre: string) => areas(el).find((p) => p.getAttribute("aria-label")?.startsWith(`${nombre}:`));
const textos = (el: HTMLElement, selector: string) => [...el.querySelectorAll(selector)].map((t) => t.textContent);
const panel = (el: HTMLElement) => el.querySelector<HTMLElement>("aside.panel");
const panelVisible = (el: HTMLElement) => panel(el)?.style.display !== "none";
const clic = (e: Element | null | undefined, opciones: MouseEventInit = {}) =>
    e?.dispatchEvent(new ventana.MouseEvent("click", { bubbles: true, cancelable: true, ...opciones }));

/** Escala y desplazamiento de la capa del mapa. */
function zoomDe(el: HTMLElement): { k: number; x: number; y: number } {
    const t = el.querySelector(".capa-mapa")?.getAttribute("transform") ?? "";
    const m = /translate\(([-\d.e]+),([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(t);
    return m ? { x: Number(m[1]), y: Number(m[2]), k: Number(m[3]) } : { k: 1, x: 0, y: 0 };
}

// Jalisco, Estado de México y Ciudad de México con dos fuentes y una tarjeta
const COMPARACION: OpcionesDataView = {
    claves: ["14", "15", "09"],
    valores: [366e6, 200e6, 445e6],
    nombre: "Ventas Cadenas",
    formato: "\\$#,0",
    bases: [
        { nombre: "Ventas Cadenas", valores: [366e6, 200e6, 445e6], formato: "\\$#,0" },
        { nombre: "Ventas Nielsen", valores: [749e6, 500e6, 600e6], formato: "\\$#,0" },
    ],
    tarjetas: [{ nombre: "Crec %", valores: [0.064, 0.05, -0.02], formato: "0.0%" }],
};

// ------------------------------------------------------------- semáforo

test("semáforo secuencial: de rojo (bajo) a verde (alto), con amarillo al centro", () => {
    for (let k = 2; k <= 9; k++) {
        const c = coloresSecuenciales("semaforo", k);
        assert.equal(c.length, k);
        assert.equal(new Set(c).size, k, `k=${k}: sin colores repetidos`);
        assert.ok(c.every((x) => x !== "#ffffbf"), "sin el amarillo casi blanco que se confunde con Sin dato");
    }
    assert.deepEqual(coloresSecuenciales("semaforo", 3), ["#d73027", "#fee08b", "#1a9850"]);
    assert.deepEqual(coloresSecuenciales("semaforo", 5, true), [...SEMAFORO[5]].reverse());
});

test("semáforo divergente: rojo muy por debajo, amarillo similar, verde muy por encima", () => {
    assert.deepEqual(coloresDivergentes("semaforo"), ["#d73027", "#fdae61", "#fee08b", "#a6d96a", "#1a9850"]);
});

test("semáforo en el mapa de ventas: el estado que más vende es verde y el que menos, rojo", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({
        claves: ["14", "15", "09"], valores: [366e6, 200e6, 445e6], formato: "\\$#,0",
        objetos: { colores: { paleta: "semaforo", clases: 3 } },
    })));
    assert.equal(area(elemento, "Ciudad de México")?.getAttribute("fill"), "#1a9850");
    assert.equal(area(elemento, "Jalisco")?.getAttribute("fill"), "#fee08b");
    assert.equal(area(elemento, "Estado de México")?.getAttribute("fill"), "#d73027");
});

// ------------------------------------------------- lógica de la comparación

test("resumir: suma, promedio, mínimo, máximo y rango; un solo valor es exacto", () => {
    const v = [10, null, 30, 20];
    assert.equal(resumir(v, "suma").valor, 60);
    assert.equal(resumir(v, "promedio").valor, 20);
    assert.equal(resumir(v, "minimo").valor, 10);
    assert.equal(resumir(v, "maximo").valor, 30);
    assert.deepEqual(resumir(v, "rango"), { valor: null, min: 10, max: 30, n: 3 });
    assert.equal(resumir([null, 7], "rango").valor, 7);
    assert.deepEqual(resumir([null], "suma"), { valor: null, min: null, max: null, n: 0 });
});

test("comparar: diferencia, diferencia relativa e índice (sin dividir entre cero)", () => {
    assert.deepEqual(comparar(120, 100), { diferencia: 20, relativa: 0.2, indice: 120 });
    assert.deepEqual(comparar(-5, 0), { diferencia: -5, relativa: null, indice: null });
    assert.equal(comparar(null, 3), null);
});

// ------------------------------------------------------------ zoom (cálculo)

test("zoom: escalar alrededor de un punto lo deja fijo; acotar no deja salir el mapa", () => {
    const t = escalarEn({ k: 1, x: 0, y: 0 }, 2, [100, 50]);
    assert.deepEqual(t, { k: 2, x: -100, y: -50 });
    assert.deepEqual(acotar({ k: 0.5, x: 30, y: 30 }, 400, 300, 8), { k: 1, x: 0, y: 0 });
    assert.deepEqual(acotar({ k: 2, x: -1000, y: 10 }, 400, 300, 8), { k: 2, x: -400, y: 0 });
});

test("zoom: encuadrar centra la caja y respeta la escala máxima", () => {
    const t = encuadrar([[180, 130], [220, 170]], 400, 300, 8);
    assert.ok(Math.abs(t.k - 5.7) < 1e-9, String(t.k));
    assert.ok(Math.abs(t.x + 200 * t.k - 200) < 1e-9 && Math.abs(t.y + 150 * t.k - 150) < 1e-9, "el centro de la caja queda al centro");
    assert.equal(encuadrar([[199, 149], [201, 151]], 400, 300, 8).k, 8);
    const a = { k: 1, x: 0, y: 0 };
    assert.deepEqual(interpolar(a, t, 0, 400, 300), a);
    const fin = interpolar(a, t, 1, 400, 300);
    assert.ok(Math.abs(fin.k - t.k) < 1e-9 && Math.abs(fin.x - t.x) < 1e-6 && Math.abs(fin.y - t.y) < 1e-6);
});

// ---------------------------------------------------------- panel de detalle

test("panel: oculto sin selección; al hacer clic compara las bases y muestra las tarjetas", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(COMPARACION)));
    assert.equal(panelVisible(elemento), false);
    assert.equal(elemento.querySelector("svg")?.getAttribute("width"), "760");

    clic(area(elemento, "Jalisco"));
    await esperar();
    assert.ok(panelVisible(elemento));
    assert.equal(elemento.querySelector(".panel-titulo")?.textContent, "Jalisco");
    assert.equal(elemento.querySelectorAll(".panel-silueta path").length, 1);
    assert.deepEqual(textos(elemento, ".base-valor"), ["$366 M", "$749 M"]);
    assert.equal(elemento.querySelectorAll(".barra-relleno").length, 2);
    assert.equal(elemento.querySelector(".diferencias-titulo")?.textContent, "Ventas Cadenas vs Ventas Nielsen");
    assert.deepEqual(textos(elemento, ".diferencias dt"), ["Diferencia", "Diferencia %", "Índice (base 100)"]);
    assert.deepEqual(textos(elemento, ".diferencias dd"), ["-$383 M", "-51.1%", "49"]);
    assert.ok(elemento.querySelector(".diferencias dd")?.classList.contains("negativo"));
    assert.deepEqual(textos(elemento, ".tarjeta-nombre"), ["Crec %"]);
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), ["6.4%"]);
    assert.equal(elemento.querySelector(".detalle"), null, "con un solo estado no hay tabla");
    // A la derecha (el visual es ancho): el mapa cede el 36 %
    assert.equal(elemento.querySelector("svg")?.getAttribute("width"), "486");
    assert.equal(panel(elemento)?.style.left, "486px");
    assert.equal(panel(elemento)?.style.width, "274px");
});

test("panel: varias áreas suman las bases, dan el rango de las tarjetas y una tabla ordenada", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(COMPARACION)));
    clic(area(elemento, "Estado de México"));
    await esperar();
    clic(area(elemento, "Jalisco"), { ctrlKey: true });
    await esperar();
    assert.equal(elemento.querySelector(".panel-titulo")?.textContent, "2 estados");
    assert.equal(elemento.querySelector(".panel-subtitulo")?.textContent, "Jalisco, Estado de México");
    assert.deepEqual(textos(elemento, ".base-valor"), ["$566 M", "$1.2 mil M"]);
    assert.deepEqual(textos(elemento, ".base .nota"), ["suma de 2 estados", "suma de 2 estados"]);
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), ["5.0% – 6.4%"]);
    assert.deepEqual(textos(elemento, ".tarjeta .nota"), ["rango de 2 estados"]);
    assert.deepEqual(textos(elemento, ".detalle thead th"), ["Estado", "Ventas Cadenas", "Ventas Nielsen", "Diferencia %"]);
    assert.deepEqual(textos(elemento, ".detalle tbody th"), ["Jalisco", "Estado de México"]);
    assert.deepEqual(textos(elemento, ".detalle tbody tr:first-child td"), ["$366 M", "$749 M", "-51.1%"]);
});

test("panel: cada medida se combina como diga el panel de formato (guardado en su columna)", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({
        ...COMPARACION,
        tarjetas: [{ nombre: "Crec %", valores: [0.064, 0.05, -0.02], formato: "0.0%", objetos: { agregacion: { tipo: "promedio" } } }],
    })));
    clic(area(elemento, "Jalisco"));
    await esperar();
    clic(area(elemento, "Estado de México"), { ctrlKey: true });
    await esperar();
    assert.deepEqual(textos(elemento, ".tarjeta-valor"), ["5.7%"]);
    assert.deepEqual(textos(elemento, ".tarjeta .nota"), ["promedio de 2 estados"]);

    // En el panel de formato: una lista por medida, ligada a su queryName
    const tarjeta = visual.getFormattingModel().cards.find((c) => c.displayName === "Al seleccionar varias áreas") as unknown as {
        groups: Array<{ slices: Array<{ displayName: string; control: { properties: { descriptor: { selector: unknown }; value: { value: string } } } }> }>;
    };
    const listas = tarjeta.groups[0].slices.map((s) => [s.displayName, s.control.properties.descriptor.selector, s.control.properties.value.value]);
    assert.deepEqual(listas, [
        ["Ventas Cadenas", { metadata: "_Medidas.Ventas Cadenas" }, "suma"],
        ["Ventas Nielsen", { metadata: "_Medidas.Ventas Nielsen" }, "suma"],
        ["Crec %", { metadata: "_Medidas.Crec %" }, "promedio"],
    ]);
});

test("panel: entre dos porcentajes la diferencia va en puntos porcentuales", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({
        claves: ["14"], valores: [1],
        bases: [
            { nombre: "% Mix Cadenas", valores: [0.0584], formato: "0.0%" },
            { nombre: "% Mix Nielsen", valores: [0.0715], formato: "0.0%" },
        ],
    })));
    clic(area(elemento, "Jalisco"));
    await esperar();
    assert.deepEqual(textos(elemento, ".diferencias dd").slice(0, 2), ["-1.3 pp", "-18.3%"]);
});

test("panel: sin tarjetas muestra Valor; el botón de cerrar quita la selección y devuelve el espacio", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: ["14", "15"], valores: [10, 20], nombre: "Ventas", formato: "#,0" })));
    clic(area(elemento, "Jalisco"));
    await esperar();
    assert.deepEqual(textos(elemento, ".tarjeta-nombre"), ["Ventas"]);
    assert.equal(elemento.querySelector(".base"), null, "sin bases no hay comparación");
    clic(elemento.querySelector(".panel-cerrar"));
    await esperar();
    assert.equal(panelVisible(elemento), false);
    assert.equal(elemento.querySelector("svg")?.getAttribute("width"), "760");
    assert.equal(area(elemento, "Estado de México")?.style.opacity, "1");
});

test("panel: abajo en un visual alto, encima en uno chico, y apagado desde el formato", async () => {
    const alto = montar();
    alto.visual.update(opcionesUpdate(crearDataView(COMPARACION), 400, 700));
    clic(area(alto.elemento, "Jalisco"));
    await esperar();
    assert.equal(alto.elemento.querySelector("svg")?.getAttribute("height"), "448");
    assert.equal(panel(alto.elemento)?.style.top, "448px");

    const chico = montar();
    chico.visual.update(opcionesUpdate(crearDataView(COMPARACION), 380, 300));
    clic(area(chico.elemento, "Jalisco"));
    await esperar();
    assert.ok(panel(chico.elemento)?.classList.contains("encima"));
    assert.equal(panel(chico.elemento)?.style.width, "380px");
    assert.equal(chico.elemento.querySelector("svg")?.getAttribute("width"), "380", "el mapa no se achica");

    const apagado = montar();
    apagado.visual.update(opcionesUpdate(crearDataView({ ...COMPARACION, objetos: { panel: { mostrar: false } } })));
    clic(area(apagado.elemento, "Jalisco"));
    await esperar();
    assert.equal(panelVisible(apagado.elemento), false);
});

test("panel sin selección: resume todas las áreas con datos (las que dejan los filtros)", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ ...COMPARACION, objetos: { panel: { sinSeleccion: true } } })));
    assert.ok(panelVisible(elemento));
    assert.equal(elemento.querySelector(".panel-titulo")?.textContent, "Todos los estados");
    assert.equal(elemento.querySelector(".panel-subtitulo")?.textContent, "3 estados con datos");
    assert.equal(elemento.querySelector(".panel-cerrar"), null, "no hay selección que quitar");
    assert.deepEqual(textos(elemento, ".detalle tbody th"), ["Ciudad de México", "Jalisco", "Estado de México"]);
});

test("tooltip: agrega las bases y su diferencia", () => {
    const { elemento, visual, llamadas } = montar();
    visual.update(opcionesUpdate(crearDataView({
        claves: ["14"], valores: [100], nombre: "Ventas A", formato: "\\$#,0",
        bases: [{ nombre: "Ventas A", valores: [100], formato: "\\$#,0" }, { nombre: "Ventas B", valores: [80], formato: "\\$#,0" }],
    })));
    area(elemento, "Jalisco")?.dispatchEvent(new ventana.MouseEvent("pointerover", { bubbles: true }));
    assert.deepEqual(llamadas.tooltip[0][1].dataItems, [
        { displayName: "Estado", value: "Jalisco" },
        { displayName: "Ventas A", value: "$100" },
        { displayName: "Ventas B", value: "$80" },
        { displayName: "Diferencia vs Ventas B", value: "+$20 (+25.0%)" },
    ]);
});

// --------------------------------------------------- colorear por diferencia

test("colorear por la diferencia entre bases: escala divergente alrededor de 0", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({
        claves: ["01", "02", "03"], formato: "#,0",
        bases: [{ nombre: "A", valores: [100, 50, 80], formato: "#,0" }, { nombre: "B", valores: [80, 80, 80], formato: "#,0" }],
        objetos: { colores: { colorearPor: "diferencia" } },
    })));
    assert.equal(area(elemento, "Aguascalientes")?.getAttribute("fill"), "#0571b0");
    assert.equal(area(elemento, "Baja California")?.getAttribute("fill"), "#ca0020");
    assert.equal(area(elemento, "Baja California Sur")?.getAttribute("fill"), "#f7f7f7");
    assert.equal(elemento.querySelector(".leyenda .titulo")?.textContent, "A − B");
    assert.equal(elemento.querySelector<HTMLElement>(".mensaje")?.style.display, "none", "sin Valor, las bases bastan");
    const colores = visual.getFormattingModel().cards.find((c) => c.displayName === "Colores") as unknown as {
        groups: Array<{ slices: Array<{ displayName: string }> }>;
    };
    const opciones = colores.groups[0].slices.map((s) => s.displayName);
    assert.ok(opciones.includes("Colorear por") && !opciones.includes("Método"), opciones.join(", "));
});

test("sin Valor, el mapa se colorea con la primera base", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: ["14", "15"], bases: [{ nombre: "Ventas Cadenas", valores: [1, 2], formato: "#,0" }] })));
    assert.equal(elemento.querySelector(".leyenda .titulo")?.textContent, "Ventas Cadenas");
    assert.notEqual(area(elemento, "Jalisco")?.getAttribute("fill"), "#ffffff");
});

// ----------------------------------------------------------------- regiones

const REGIONES: OpcionesDataView = {
    claves: ["01", "11", "22", "14", "16"],
    valores: [1, 2, 3, 4, 5],
    grupo: { nombre: "Región", valores: ["Bajío", "Bajío", "Bajío", "Occidente", "Occidente"] },
};

test("regiones: halo bajo el contorno y el nombre de cada grupo", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(REGIONES)));
    const halo = elemento.querySelector<SVGPathElement>(".halo-grupos");
    assert.notEqual(halo?.style.display, "none");
    assert.equal(halo?.getAttribute("stroke"), "#ffffff");
    assert.deepEqual(textos(elemento, ".etiqueta-grupo").sort(), ["BAJÍO", "OCCIDENTE"]);
    visual.update(opcionesUpdate(crearDataView({ ...REGIONES, objetos: { grupos: { etiquetas: false } } })));
    assert.equal(elemento.querySelectorAll(".etiqueta-grupo").length, 0);
});

test("regiones con franja de color: colores del tema, recorte por dentro y leyenda que selecciona", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ ...REGIONES, objetos: { grupos: { estilo: "color" } } })));
    const franjas = [...elemento.querySelectorAll(".franjas-grupo path")];
    assert.deepEqual(franjas.map((f) => f.getAttribute("stroke")), [COLORES_TEMA[0], COLORES_TEMA[1]]);
    assert.match(franjas[0].getAttribute("clip-path") ?? "", /^url\(#mx\d+-franja-0\)$/);
    assert.equal(elemento.querySelectorAll("defs clipPath").length, 2);
    assert.deepEqual(textos(elemento, ".leyenda .entrada-grupo .etiqueta"), ["Bajío", "Occidente"]);

    clic(elemento.querySelector(".leyenda .entrada-grupo rect"));
    await esperar();
    assert.equal(elemento.querySelector(".panel-titulo")?.textContent, "Bajío");
    assert.equal(elemento.querySelector(".panel-subtitulo")?.textContent, "3 estados");
    assert.equal(area(elemento, "Jalisco")?.style.opacity, "0.35");
    assert.equal(area(elemento, "Querétaro")?.style.opacity, "1");
});

test("colorear por grupo: cada región con un color del tema y su leyenda", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ ...REGIONES, objetos: { colores: { colorearPor: "grupo" } } })));
    assert.equal(area(elemento, "Aguascalientes")?.getAttribute("fill"), COLORES_TEMA[0]);
    assert.equal(area(elemento, "Jalisco")?.getAttribute("fill"), COLORES_TEMA[1]);
    assert.equal(area(elemento, "Sonora")?.getAttribute("fill"), "#ffffff");
    assert.equal(elemento.querySelector(".leyenda .titulo")?.textContent, "Región");
    assert.deepEqual(textos(elemento, ".leyenda .etiqueta"), ["Bajío", "Occidente", "Sin dato"]);
});

// --------------------------------------------------------------------- zoom

test("zoom con botones: acercar, alejar y volver a la vista completa", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(COMPARACION)));
    const boton = (c: string) => elemento.querySelector<HTMLButtonElement>(`.zoom-${c}`);
    assert.notEqual(elemento.querySelector<HTMLElement>(".zoom-botones")?.style.display, "none");
    assert.ok(boton("alejar")?.disabled, "sin zoom no se puede alejar");
    clic(boton("acercar"));
    assert.deepEqual(zoomDe(elemento), { k: 2, x: -380, y: -250 });
    assert.equal(boton("alejar")?.disabled, false);
    clic(boton("acercar"));
    clic(boton("alejar"));
    assert.equal(zoomDe(elemento).k, 2);
    clic(boton("inicio"));
    assert.deepEqual(zoomDe(elemento), { k: 1, x: 0, y: 0 });
    assert.equal(elemento.querySelector<HTMLElement>(".zoom-seleccion")?.style.display, "none", "sin selección no hay a qué acercarse");
});

test("zoom con la rueda: acerca alrededor del cursor; en el límite deja desplazar la página", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(COMPARACION)));
    const svg = elemento.querySelector("svg") as SVGSVGElement;
    const girar = (deltaY: number, extra: WheelEventInit = {}) => {
        const e = new ventana.WheelEvent("wheel", { deltaY, clientX: 200, clientY: 100, bubbles: true, cancelable: true, ...extra });
        svg.dispatchEvent(e);
        return e;
    };
    assert.equal(girar(100).defaultPrevented, false, "ya en la vista completa: la página se desplaza");
    assert.equal(girar(-500).defaultPrevented, true);
    const t = zoomDe(elemento);
    assert.equal(t.k, 2);
    assert.deepEqual([t.x, t.y], [-200, -100], "el punto bajo el cursor queda fijo");

    visual.update(opcionesUpdate(crearDataView({ ...COMPARACION, objetos: { zoom: { rueda: "ctrl" } } })));
    const k = zoomDe(elemento).k;
    girar(-500);
    assert.equal(zoomDe(elemento).k, k, "sin Ctrl no acerca");
    girar(-50, { ctrlKey: true });
    assert.ok(zoomDe(elemento).k > k, "con Ctrl (o el pellizco del trackpad) sí");
});

test("arrastrar mueve el mapa y no selecciona; el siguiente clic sí", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(COMPARACION)));
    clic(elemento.querySelector(".zoom-acercar"));
    const svg = elemento.querySelector("svg") as SVGSVGElement;
    const jalisco = area(elemento, "Jalisco") as SVGPathElement;
    const puntero = (tipo: string, x: number, y: number) =>
        jalisco.dispatchEvent(new ventana.MouseEvent(tipo, { clientX: x, clientY: y, bubbles: true, cancelable: true }));
    puntero("pointerdown", 300, 200);
    puntero("pointermove", 320, 215);
    puntero("pointermove", 340, 230);
    puntero("pointerup", 340, 230);
    clic(jalisco);
    await esperar();
    assert.deepEqual(zoomDe(elemento), { k: 2, x: -340, y: -220 });
    assert.equal(panelVisible(elemento), false, "el clic que cierra un arrastre no selecciona");
    assert.equal(svg.getAttribute("width"), "760");
    clic(jalisco);
    await esperar();
    assert.ok(panelVisible(elemento));
});

test("al abrir el panel el zoom conserva la escala; con 'Acercar a la selección' se acerca solo", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(COMPARACION)));
    clic(elemento.querySelector(".zoom-acercar"));
    clic(area(elemento, "Jalisco"));
    await esperar();
    assert.ok(panelVisible(elemento));
    assert.equal(zoomDe(elemento).k, 2, "el mapa se achicó pero no perdió el zoom");
    assert.notEqual(elemento.querySelector<HTMLElement>(".zoom-seleccion")?.style.display, "none");

    const auto = montar();
    auto.visual.update(opcionesUpdate(crearDataView({ ...COMPARACION, objetos: { zoom: { acercarSeleccion: true } } })));
    clic(area(auto.elemento, "Jalisco"));
    await esperar();
    assert.ok(zoomDe(auto.elemento).k > 2, `acercado a Jalisco (k = ${zoomDe(auto.elemento).k})`);
    clic(auto.elemento.querySelector("svg"));
    await esperar();
    assert.deepEqual(zoomDe(auto.elemento), { k: 1, x: 0, y: 0 }, "al quitar la selección vuelve a la vista completa");
});

test("con zoom aparecen las etiquetas de las áreas chicas", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ ...COMPARACION, objetos: { etiquetas: { mostrar: true }, zoom: { acercarSeleccion: true } } })));
    assert.ok(!textos(elemento, ".etiquetas text").includes("$445 M"), "la Ciudad de México no cabe sin zoom");
    clic(area(elemento, "Ciudad de México"));
    await esperar();
    assert.ok(textos(elemento, ".etiquetas text").includes("$445 M"), textos(elemento, ".etiquetas text").join(" | "));
});

test("zoom con el teclado y apagado desde el formato", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(COMPARACION)));
    elemento.dispatchEvent(new ventana.KeyboardEvent("keydown", { key: "+", bubbles: true }));
    assert.equal(zoomDe(elemento).k, 2);
    elemento.dispatchEvent(new ventana.KeyboardEvent("keydown", { key: "0", bubbles: true }));
    assert.equal(zoomDe(elemento).k, 1);
    visual.update(opcionesUpdate(crearDataView({ ...COMPARACION, objetos: { zoom: { activo: false } } })));
    assert.equal(elemento.querySelector<HTMLElement>(".zoom-botones")?.style.display, "none");
    elemento.dispatchEvent(new ventana.KeyboardEvent("keydown", { key: "+", bubbles: true }));
    assert.equal(zoomDe(elemento).k, 1);
});
