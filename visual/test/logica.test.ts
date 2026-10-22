import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizarClave, nivelDeClave } from "../src/claves";
import { clasificar } from "../src/clasificacion";
import { coloresDivergentes, coloresSecuenciales } from "../src/paletas";
import { formatoCompacto } from "../src/formato";
import { estados } from "../src/geometria";

test("claves: completa ceros y acepta texto o número", () => {
    assert.equal(normalizarClave(1), "01");
    assert.equal(normalizarClave("9"), "09");
    assert.equal(normalizarClave(" 14 "), "14");
    assert.equal(normalizarClave(1002), "01002");
    assert.equal(normalizarClave("14039"), "14039");
    assert.equal(normalizarClave(9.0), "09");
});

test("claves: rechaza lo que no es una clave INEGI", () => {
    for (const malo of [null, undefined, "", "Jalisco", "123", "123456", 1.5, -3, "01.0", "MX-JAL"]) {
        assert.equal(normalizarClave(malo), null, String(malo));
    }
});

test("claves: el nivel sale de la longitud", () => {
    assert.equal(nivelDeClave("14"), "estado");
    assert.equal(nivelDeClave("14039"), "municipio");
});

test("cuantiles: el mismo número de áreas por clase", () => {
    const c = clasificar([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { metodo: "cuantiles", clases: 5, centro: 0, umbral1: 0, umbral2: 0 });
    assert.equal(c.numClases, 5);
    assert.deepEqual(c.clases.map((k) => k.n), [2, 2, 2, 2, 2]);
    assert.deepEqual([1, 3, 5, 7, 10].map(c.claseDe), [0, 1, 2, 3, 4]);
});

test("cuantiles: valores iguales caen en la misma clase y no hay más clases que valores distintos", () => {
    const c = clasificar([5, 5, 5, 5, 9], { metodo: "cuantiles", clases: 5, centro: 0, umbral1: 0, umbral2: 0 });
    assert.equal(c.numClases, 2);
    assert.equal(c.claseDe(5), 0);
    assert.equal(c.claseDe(9), 1);
});

test("intervalos: clases del mismo ancho", () => {
    const c = clasificar([0, 10, 20, 30, 40, 100], { metodo: "intervalos", clases: 4, centro: 0, umbral1: 0, umbral2: 0 });
    assert.deepEqual([0, 24, 26, 49, 51, 74, 76, 100].map(c.claseDe), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test("divergente: cinco clases alrededor del centro con los umbrales indicados", () => {
    const c = clasificar([50, 85, 100, 120, 150], { metodo: "divergente", clases: 5, centro: 100, umbral1: 10, umbral2: 30 });
    assert.equal(c.numClases, 5);
    assert.deepEqual([69, 70, 89, 90, 100, 110, 111, 130, 131].map(c.claseDe), [0, 1, 1, 2, 2, 2, 3, 3, 4]);
    assert.equal(c.clases[1].desde, 70);
    assert.equal(c.clases[1].hasta, 90);
});

test("divergente: umbrales automáticos si no se indican", () => {
    const c = clasificar([-0.1, 0, 0.05], { metodo: "divergente", clases: 5, centro: 0, umbral1: 0, umbral2: 0 });
    assert.ok(Math.abs((c.umbral1 ?? 0) - 0.02) < 1e-12);
    assert.ok(Math.abs((c.umbral2 ?? 0) - 0.06) < 1e-12);
    assert.equal(c.claseDe(-0.1), 0);
    assert.equal(c.claseDe(0), 2);
});

test("sin valores: ninguna clase", () => {
    const c = clasificar([NaN, Infinity], { metodo: "cuantiles", clases: 5, centro: 0, umbral1: 0, umbral2: 0 });
    assert.equal(c.numClases, 0);
});

test("paletas secuenciales: de claro a oscuro, sin el tono casi blanco", () => {
    for (const k of [1, 2, 3, 5, 7, 9]) {
        const azules = coloresSecuenciales("azules", k);
        assert.equal(azules.length, k);
        assert.ok(azules.every((c, i) => i === 0 || luminancia(azules[i - 1]) > luminancia(c)), `k=${k}`);
        if (k <= 7) {
            assert.ok(luminancia(azules[0]) < 225, `k=${k}: el tono más claro (${azules[0]}) no debe confundirse con blanco`);
        }
    }
});

test("paletas divergentes: el primer color es el del valor bajo que dice su nombre", () => {
    const tono = (hex: string): string => {
        const [r, g, b] = [rojo(hex), verde(hex), azul(hex)];
        if (r > g && r > b) return g > b * 1.4 && r - g < 110 ? "cafe-naranja" : b > g ? "rosa-rojo" : "rojo-naranja";
        if (b > r && b > g) return r > g ? "morado" : "azul";
        return "verde";
    };
    const esperado: Record<string, [RegExp, RegExp]> = {
        "rojo-azul": [/rojo/, /azul/],
        "morado-naranja": [/morado/, /naranja/],
        "cafe-verde": [/cafe/, /verde|azul/],
        "rosa-verde": [/rosa/, /verde/],
    };
    for (const [nombre, [bajo, alto]] of Object.entries(esperado)) {
        const c = coloresDivergentes(nombre);
        assert.equal(c.length, 5);
        assert.match(tono(c[0]), bajo, `${nombre}: bajo ${c[0]}`);
        assert.match(tono(c[4]), alto, `${nombre}: alto ${c[4]}`);
    }
    assert.deepEqual(coloresDivergentes("rojo-azul", true), [...coloresDivergentes("rojo-azul")].reverse());
});

test("formato compacto: unidades en español y porcentajes intactos", () => {
    const exacto = (v: number) => `exacto(${v})`;
    assert.equal(formatoCompacto(78430079.7, "$#,0", "es-MX", exacto), "$78.4 M");
    assert.equal(formatoCompacto(1541697234.69, "$#,0", "es-MX", exacto), "$1.5 mil M");
    assert.equal(formatoCompacto(-12345, "#,0", "es-MX", exacto), "-12.3 mil");
    assert.equal(formatoCompacto(161, "#,0", "es-MX", exacto), "exacto(161)");
    assert.equal(formatoCompacto(0.245, "0.0%", "es-MX", exacto), "exacto(0.245)");
});

test("geometría: los 32 estados con clave y nombre", () => {
    const e = estados();
    assert.equal(e.length, 32);
    assert.deepEqual(e.map((x) => x.clave), Array.from({ length: 32 }, (_, i) => String(i + 1).padStart(2, "0")));
    assert.equal(e.find((x) => x.clave === "14")?.nombre, "Jalisco");
    assert.ok(e.every((x) => x.forma.geometry && x.nombre));
});

function canal(hex: string, i: number): number {
    return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
}
function rojo(hex: string): number {
    return canal(hex, 0);
}
function azul(hex: string): number {
    return canal(hex, 2);
}
function luminancia(hex: string): number {
    return 0.2126 * canal(hex, 0) + 0.7152 * canal(hex, 1) + 0.0722 * canal(hex, 2);
}
function verde(hex: string): number {
    return canal(hex, 1);
}
