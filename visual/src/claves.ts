"use strict";

/** Nivel geográfico de una clave INEGI. */
export type Nivel = "estado" | "municipio";

/**
 * Convierte lo que llegue en el campo Ubicación a una clave INEGI de texto.
 * Acepta texto o número y completa los ceros que Excel o Power BI suelen quitar:
 *   1 → "01", "9" → "09", 1002 → "01002", " 14039 " → "14039".
 * Devuelve null si no parece una clave (nombres, 3 dígitos, más de 5…).
 */
export function normalizarClave(valor: unknown): string | null {
    if (valor === null || valor === undefined) {
        return null;
    }
    let texto: string;
    if (typeof valor === "number") {
        if (!Number.isInteger(valor) || valor < 0) {
            return null;
        }
        texto = String(valor);
    } else {
        texto = String(valor).trim();
    }
    if (!/^\d{1,5}$/.test(texto)) {
        return null;
    }
    if (texto.length <= 2) {
        return texto.padStart(2, "0");
    }
    if (texto.length >= 4) {
        return texto.padStart(5, "0");
    }
    return null;
}

/** 2 dígitos = estado (CVE_ENT); 5 dígitos = municipio (CVEGEO). */
export function nivelDeClave(clave: string): Nivel {
    return clave.length === 2 ? "estado" : "municipio";
}
