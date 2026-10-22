import { test } from "node:test";
import assert from "node:assert/strict";

import { crearDataView, crearHost, nuevoElemento, opcionesUpdate, ventana } from "./entorno";

const { Visual } = await import("../src/visual");
const { capa } = await import("../src/geometria");

function montar() {
    const elemento = nuevoElemento();
    const entorno = crearHost();
    const visual = new Visual({ element: elemento, host: entorno.host } as never);
    return { elemento, visual, ...entorno };
}

const areas = (el: HTMLElement) => [...el.querySelectorAll<SVGPathElement>("path.area")];
const area = (el: HTMLElement, inicio: string) => areas(el).find((p) => p.getAttribute("aria-label")?.startsWith(inicio));
const mostrado = (el: HTMLElement, selector: string) => {
    const e = el.querySelector<SVGElement>(selector);
    return Boolean(e && e.style.display !== "none" && (e.getAttribute("d") ?? "").length > 0);
};

// Algunos municipios de Jalisco (14) y uno de Aguascalientes (01)
const JALISCO = ["14039", "14120", "14097", "14098"];

test("geometría municipal: 2,475 municipios; Jalisco tiene 125", () => {
    const m = capa("municipio");
    assert.equal(m.areas.length, 2475);
    assert.equal(m.areas.filter((a) => a.estado === "14").length, 125);
    assert.equal(m.porClave.get("14039")?.nombre, "Guadalajara");
});

test("claves municipales: dibuja solo los municipios de los estados con datos", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: JALISCO, valores: [400, 300, 200, 100], formato: "#,0" })));
    assert.equal(areas(elemento).length, 125);
    assert.equal(areas(elemento).filter((p) => p.classList.contains("con-dato")).length, 4);
    assert.equal(area(elemento, "Guadalajara")?.getAttribute("aria-label"), "Guadalajara, Jalisco: 400");
    assert.ok(mostrado(elemento, ".limites-estatales"), "límites estatales visibles en el nivel municipal");
    assert.equal(elemento.querySelector<HTMLElement>(".mensaje")?.style.display, "none");
    // Leyenda: 121 municipios de Jalisco sin dato
    const etiquetas = [...elemento.querySelectorAll(".leyenda .etiqueta")].map((t) => t.textContent);
    assert.equal(etiquetas[etiquetas.length - 1], "Sin dato");
});

test("claves municipales como número (sin el cero inicial) también funcionan", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: [1001, 1002], valores: [1, 2] })));
    assert.equal(areas(elemento).length, capa("municipio").areas.filter((a) => a.estado === "01").length);
    assert.ok(area(elemento, "Aguascalientes, Aguascalientes")?.classList.contains("con-dato"));
});

test("drill-down: con la jerarquía expandida usa el nivel más profundo", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({
        nivelesSuperiores: [{ nombre: "CVE_ENT", valores: ["14", "14", "14", "14"] }],
        claves: JALISCO, valores: [4, 3, 2, 1],
    })));
    assert.equal(areas(elemento).length, 125);
    assert.equal(areas(elemento).filter((p) => p.classList.contains("con-dato")).length, 4);
});

test("tooltip municipal: municipio, estado, grupo y valor", () => {
    const { elemento, visual, llamadas } = montar();
    visual.update(opcionesUpdate(crearDataView({
        claves: ["14039"], valores: [1234], nombre: "Ventas", formato: "#,0",
        grupo: { nombre: "Región", valores: ["Occidente"] },
    })));
    area(elemento, "Guadalajara")?.dispatchEvent(new ventana.MouseEvent("pointerover", { bubbles: true }));
    assert.deepEqual(llamadas.tooltip[0][1].dataItems, [
        { displayName: "Municipio", value: "Guadalajara" },
        { displayName: "Estado", value: "Jalisco" },
        { displayName: "Región", value: "Occidente" },
        { displayName: "Ventas", value: "1,234" },
    ]);
    assert.ok(mostrado(elemento, ".resaltado"), "resaltado al pasar el cursor");
    area(elemento, "Guadalajara")?.dispatchEvent(new ventana.MouseEvent("pointerout", { bubbles: true }));
    assert.equal(elemento.querySelector<SVGElement>(".resaltado")?.style.display, "none");
});

test("claves XX000 (sin municipio) se reportan aparte y no como errores", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: ["14039", "14000", "01000"], valores: [1, 2, 3] })));
    const aviso = elemento.querySelector(".aviso")?.firstChild?.textContent ?? "";
    assert.equal(aviso, "⚠ 2 sin municipio (no se dibujan)");
    // Aguascalientes también se dibuja: sus datos existen aunque sin municipio
    assert.equal(areas(elemento).length, 125 + capa("municipio").areas.filter((a) => a.estado === "01").length);
});

test("niveles mezclados: gana la mayoría y el resto se reporta", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: ["14", "15", "09", "14039"], valores: [1, 2, 3, 4] })));
    assert.equal(areas(elemento).length, 32);
    assert.equal(elemento.querySelector(".aviso")?.firstChild?.textContent, "⚠ 1 de otro nivel");
});

test("nombres en Ubicación: explica que necesita claves y sugiere Grupo", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({ claves: ["Bajío", "Norte"], valores: [1, 2] })));
    assert.match(elemento.querySelector(".mensaje")?.textContent ?? "", /no nombres.*Grupo/);
});

test("grupo: contorno donde cambia el grupo y tarjeta de formato visible", () => {
    const { elemento, visual } = montar();
    const claves = ["01", "11", "22", "14", "16"];
    visual.update(opcionesUpdate(crearDataView({
        claves, valores: [1, 2, 3, 4, 5],
        grupo: { nombre: "Región", valores: ["Bajío", "Bajío", "Bajío", "Occidente", "Occidente"] },
    })));
    assert.ok(mostrado(elemento, ".contorno-grupos"));
    const tarjetas = visual.getFormattingModel().cards.filter((c) => (c as { visible?: boolean }).visible !== false).map((c) => c.displayName);
    assert.ok(tarjetas.includes("Grupos"));
    // Sin límites internos: el trazo de cada área es de su mismo color
    visual.update(opcionesUpdate(crearDataView({
        claves, valores: [1, 2, 3, 4, 5],
        grupo: { nombre: "Región", valores: ["Bajío", "Bajío", "Bajío", "Occidente", "Occidente"] },
        objetos: { grupos: { limitesInternos: false } },
    })));
    const jal = area(elemento, "Jalisco");
    assert.equal(jal?.getAttribute("stroke"), jal?.getAttribute("fill"));
});

test("grupo: el contorno sigue los límites municipales (regiones que parten estados)", () => {
    const { elemento, visual } = montar();
    visual.update(opcionesUpdate(crearDataView({
        claves: JALISCO, valores: [1, 2, 3, 4],
        grupo: { nombre: "Zona", valores: ["Metro", "Metro", "Metro", "Sur"] },
    })));
    assert.ok(mostrado(elemento, ".contorno-grupos"));
});

test("el trazo de las áreas no se recalcula si la geometría no cambia", () => {
    const { elemento, visual } = montar();
    const dv = crearDataView({ claves: JALISCO, valores: [1, 2, 3, 4] });
    visual.update(opcionesUpdate(dv));
    area(elemento, "Guadalajara")?.setAttribute("d", "M0,0Z");
    visual.update(opcionesUpdate(crearDataView({ claves: JALISCO, valores: [4, 3, 2, 1] })));
    assert.equal(area(elemento, "Guadalajara")?.getAttribute("d"), "M0,0Z", "mismos datos de geometría: se reutiliza el trazo");
    visual.update(opcionesUpdate(dv, 500, 400));
    assert.notEqual(area(elemento, "Guadalajara")?.getAttribute("d"), "M0,0Z", "otro tamaño: se recalcula");
});

test("mapa municipal nacional: los 2,475 municipios", () => {
    const { elemento, visual } = montar();
    const todos = capa("municipio").areas.map((a) => a.clave);
    visual.update(opcionesUpdate(crearDataView({ claves: todos, valores: todos.map((_, i) => i) })));
    assert.equal(areas(elemento).length, 2475);
    assert.equal(areas(elemento).filter((p) => p.classList.contains("con-dato")).length, 2475);
});
