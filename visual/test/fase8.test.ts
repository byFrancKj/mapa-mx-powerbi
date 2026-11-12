import { test } from "node:test";
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
const textos = (el: Element, selector: string) => [...el.querySelectorAll(selector)].map((t) => t.textContent);
const clic = (e: Element | null | undefined, opciones: MouseEventInit = {}) =>
    e?.dispatchEvent(new ventana.MouseEvent("click", { bubbles: true, cancelable: true, ...opciones }));
const encabezado = (el: HTMLElement, nombre: string) =>
    [...el.querySelectorAll<HTMLButtonElement>(".detalle thead .ordenar")].find((b) => b.textContent === nombre);
const fila = (el: HTMLElement, nombre: string) =>
    [...el.querySelectorAll<HTMLTableRowElement>(".detalle tbody tr")].find((tr) => tr.querySelector("th")?.textContent === nombre);
const regionEnLeyenda = (el: HTMLElement, region: string) =>
    [...el.querySelectorAll(".entrada-grupo")].find((e) => e.getAttribute("aria-label")?.includes(region));
const tarjetaTabla = (visual: InstanceType<typeof Visual>) =>
    visual.getFormattingModel().cards.find((c) => c.uid.startsWith("tabla")) as unknown as { groups: Array<{ slices: Array<{ displayName: string; visible?: boolean }> }> } | undefined;
const opcionesVisibles = (visual: InstanceType<typeof Visual>) =>
    (tarjetaTabla(visual)?.groups ?? []).flatMap((g) => g.slices).filter((s) => s.visible !== false).map((s) => s.displayName);

// Occidente: Jalisco, Colima y Nayarit; Noroeste: Sonora y Sinaloa.
const CLAVES = ["14", "06", "18", "26", "25"];
const REGIONES = ["Occidente", "Occidente", "Occidente", "Noroeste", "Noroeste"];
const VENTAS = [300, 40, 60, 120, 80];
const VENTAS_AA = [250, 50, 40, 160, 64];
// Tiendas distintas: una tienda que vende en dos estados cuenta una vez, así que el total no es la suma.
const TIENDAS = [500, 90, 120, 300, 200];
const TOTALES = {
    general: { "Ventas": 600, "Ventas AA": 564, "Tiendas": 877 },
    grupos: {
        Occidente: { "Ventas": 400, "Ventas AA": 340, "Tiendas": 640 },
        Noroeste: { "Ventas": 200, "Ventas AA": 224, "Tiendas": 455 },
    },
};
/** Lo que pidió el usuario: venta actual, su participación, la diferencia contra el año anterior y las tiendas. */
const TABLA: OpcionesDataView = {
    claves: CLAVES,
    grupo: { nombre: "Región", valores: REGIONES },
    valores: VENTAS,
    nombre: "Ventas",
    formato: "#,0",
    bases: [
        { nombre: "Ventas", valores: VENTAS, formato: "#,0", tambien: { tabla: 0 } },
        { nombre: "Ventas AA", valores: VENTAS_AA, formato: "#,0" },
    ],
    tabla: [{ nombre: "Tiendas", valores: TIENDAS, formato: "#,0", lugar: 1 }],
    totales: TOTALES,
    objetos: { panel: { abrir: "siempre" }, tabla: { participacion: true, diferencia: true } },
};

test("tabla: las columnas son las del campo, con % del total y diferencia junto a su medida", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(TABLA)));
    // Ventas AA está en Bases pero no en la tabla: solo sirve para la diferencia.
    assert.deepEqual(textos(elemento, ".detalle thead th"), ["Estado", "Ventas", "% del total", "Diferencia", "Diferencia %", "Tiendas"]);
    assert.deepEqual(textos(elemento, ".detalle tbody th"), ["Jalisco", "Sonora", "Sinaloa", "Nayarit", "Colima"]);
    assert.deepEqual(textos(fila(elemento, "Jalisco") as Element, "td"), ["300", "50.0%", "+50", "+20.0%", "500"]);
    assert.deepEqual(textos(fila(elemento, "Colima") as Element, "td"), ["40", "6.7%", "-10", "-20.0%", "90"]);
    const colima = [...(fila(elemento, "Colima")?.querySelectorAll("td") ?? [])];
    assert.deepEqual(colima.map((td) => td.classList.contains("negativo")), [false, false, true, true, false]);
    assert.equal(elemento.querySelector(".detalle thead th:nth-child(4)")?.getAttribute("title"), "Ventas − Ventas AA");
    assert.equal(elemento.querySelector(".detalle thead th:nth-child(3)")?.getAttribute("title"), "Ventas: participación en el total del mapa");
});

test("tabla: la fila de total es lo que calculó DAX, no una suma", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(TABLA)));
    assert.deepEqual(textos(elemento, ".detalle tfoot th"), ["Total"]);
    // 877 tiendas distintas (la suma de los estados daría 1,210).
    assert.deepEqual(textos(elemento, ".detalle tfoot td"), ["600", "100.0%", "+36", "+6.4%", "877"]);

    visual.update(opcionesUpdate(crearDataView({ ...TABLA, objetos: { ...TABLA.objetos, tabla: { total: false } } })));
    assert.equal(elemento.querySelector(".detalle tfoot"), null);
    assert.deepEqual(textos(elemento, ".detalle thead th"), ["Estado", "Ventas", "Diferencia %", "Tiendas"], "sin opciones, solo la diferencia %");
});

test("tabla: un clic en un encabezado ordena por esa columna y otro clic invierte el orden", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView(TABLA)));
    const orden = () => textos(elemento, ".detalle tbody th");
    const sentido = (nombre: string) => encabezado(elemento, nombre)?.parentElement?.getAttribute("aria-sort") ?? null;
    assert.equal(sentido("Ventas"), "descending");

    clic(encabezado(elemento, "Diferencia %"));
    assert.deepEqual(orden(), ["Nayarit", "Sinaloa", "Jalisco", "Colima", "Sonora"]);
    assert.equal(sentido("Diferencia %"), "descending");
    assert.equal(sentido("Ventas"), null);
    assert.equal(ventana.document.activeElement, encabezado(elemento, "Diferencia %"), "el foco sigue en el encabezado");

    clic(encabezado(elemento, "Diferencia %"));
    assert.deepEqual(orden(), ["Sonora", "Colima", "Jalisco", "Sinaloa", "Nayarit"]);
    assert.equal(sentido("Diferencia %"), "ascending");

    clic(encabezado(elemento, "Estado"));
    assert.deepEqual(orden(), ["Colima", "Jalisco", "Nayarit", "Sinaloa", "Sonora"]);
    // El orden elegido se conserva cuando llegan datos nuevos (otro filtro).
    visual.update(opcionesUpdate(crearDataView(TABLA)));
    assert.deepEqual(orden(), ["Colima", "Jalisco", "Nayarit", "Sinaloa", "Sonora"]);
    // La barra sigue en la primera cifra y el clic en una fila sigue seleccionando.
    assert.equal(elemento.querySelectorAll(".detalle td.con-barra").length, 5);
});

test("tabla: el % del total es sobre el mapa o sobre lo que muestra el panel", async () => {
    const participacion = async (baseParticipacion: string) => {
        const { elemento, visual } = montar();
        visual.update(opcionesUpdate(crearDataView({
            ...TABLA,
            objetos: { colores: { colorearPor: "grupo" }, panel: { abrir: "seleccion" }, tabla: { participacion: true, baseParticipacion } },
        })));
        clic(regionEnLeyenda(elemento, "Occidente"));
        await esperar();
        return {
            jalisco: fila(elemento, "Jalisco")?.querySelectorAll("td")[1]?.textContent,
            total: elemento.querySelectorAll(".detalle tfoot td")[1]?.textContent,
            ventas: elemento.querySelector(".detalle tfoot td")?.textContent,
        };
    };
    // Occidente vende 400 de 600: el total de la región lo da DAX.
    assert.deepEqual(await participacion("mapa"), { jalisco: "50.0%", total: "66.7%", ventas: "400" });
    assert.deepEqual(await participacion("panel"), { jalisco: "75.0%", total: "100.0%", ventas: "400" });
});

test("tabla: con estados sueltos no hay total de DAX y la fila de total no aparece", async () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({
        ...TABLA, objetos: { panel: { abrir: "seleccion" }, tabla: { participacion: true, baseParticipacion: "panel" } },
    })));
    clic(area(elemento, "Jalisco"));
    await esperar();
    // Con columnas propias, la tabla también acompaña a un área sola.
    assert.deepEqual(textos(elemento, ".detalle tbody th"), ["Jalisco"]);
    assert.deepEqual(textos(elemento, ".detalle tbody td"), ["300", "100.0%", "+20.0%", "500"]);
    assert.equal(elemento.querySelector(".detalle tfoot"), null);

    clic(area(elemento, "Sonora"), { ctrlKey: true });
    await esperar();
    assert.deepEqual(textos(elemento, ".detalle tbody th"), ["Jalisco", "Sonora"]);
    // Sin total de DAX para la combinación, la participación usa la suma de lo que se ve: 300 de 420.
    assert.equal(fila(elemento, "Jalisco")?.querySelectorAll("td")[1]?.textContent, "71.4%");
    assert.equal(elemento.querySelector(".detalle tfoot"), null);
});

test("tabla: el orden de las columnas es el del campo, y acepta textos y fechas", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({
        ...TABLA,
        bases: [
            // Ventas es la segunda del campo, aunque llegue antes por estar en Bases.
            { nombre: "Ventas", valores: VENTAS, formato: "#,0", tambien: { tabla: 1 } },
            { nombre: "Ventas AA", valores: VENTAS_AA, formato: "#,0" },
        ],
        tabla: [
            { nombre: "Estatus", valores: ["En meta", "Por debajo", "En meta", null, "Cerrada"], tipo: { text: true }, lugar: 0 },
            { nombre: "Última venta", valores: [1, 2, 3, 4, 5].map((d) => new Date(2026, 9, d)), tipo: { dateTime: true }, formato: "dd/MM/yyyy", lugar: 2 },
        ],
        totales: undefined,
        objetos: { panel: { abrir: "siempre" }, tabla: { participacion: true } },
    })));
    // La participación va junto a la primera columna solo si es una cifra; la diferencia, junto a su base.
    assert.deepEqual(textos(elemento, ".detalle thead th"), ["Estado", "Estatus", "Ventas", "Diferencia %", "Última venta"]);
    // Un texto ordena de la A a la Z, con lo vacío al final, y no lleva barra.
    assert.deepEqual(textos(elemento, ".detalle tbody th"), ["Sinaloa", "Jalisco", "Nayarit", "Colima", "Sonora"]);
    assert.deepEqual(textos(fila(elemento, "Sonora") as Element, "td"), ["–", "120", "-25.0%", "04/10/2026"]);
    assert.ok(fila(elemento, "Jalisco")?.querySelector("td")?.classList.contains("texto"));
    assert.equal(elemento.querySelectorAll(".detalle td.con-barra").length, 0);
    assert.equal(elemento.querySelector(".detalle tfoot"), null, "sin subtotales de DAX no hay fila de total");

    clic(encabezado(elemento, "Última venta"));
    assert.deepEqual(textos(elemento, ".detalle tbody th"), ["Sinaloa", "Sonora", "Nayarit", "Colima", "Jalisco"]);
});

test("tabla: se puede ocultar, y sus opciones aparecen solo cuando aplican", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ ...TABLA, objetos: { panel: { abrir: "siempre" }, tabla: { mostrar: false } } })));
    assert.equal(elemento.querySelector(".detalle"), null);
    assert.ok(elemento.querySelector(".base-valor"), "el resto del panel sigue");

    visual.update(opcionesUpdate(crearDataView(TABLA)));
    assert.deepEqual(opcionesVisibles(visual), ["Columna % del total", "% del total sobre", "Columna Diferencia", "Columna Diferencia %", "Fila de total"]);
    // Sin dos bases no hay diferencias; sin participación no hay sobre qué calcularla.
    visual.update(opcionesUpdate(crearDataView({ ...TABLA, bases: undefined, objetos: { panel: { abrir: "siempre" } } })));
    assert.deepEqual(opcionesVisibles(visual), ["Columna % del total", "Fila de total"]);
    assert.deepEqual(textos(elemento, ".detalle thead th"), ["Estado", "Tiendas"]);
    visual.update(opcionesUpdate(crearDataView({ ...TABLA, objetos: { panel: { mostrar: false } } })));
    assert.equal(tarjetaTabla(visual), undefined, "sin panel no hay tarjeta de la tabla");
});

test("tabla: en un tablero (sin interacción) los encabezados no son botones", () => {
    const elemento = nuevoElemento();
    const { host } = crearHost();
    (host as unknown as { hostCapabilities: { allowInteractions: boolean } }).hostCapabilities.allowInteractions = false;
    const visual = new Visual({ element: elemento, host } as never);
    visual.update(opcionesUpdate(crearDataView(TABLA)));
    assert.equal(elemento.querySelector(".detalle .ordenar"), null);
    assert.deepEqual(textos(elemento, ".detalle thead th").slice(0, 2), ["Estado", "Ventas"]);
});
