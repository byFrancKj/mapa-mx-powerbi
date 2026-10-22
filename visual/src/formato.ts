"use strict";

/**
 * Formato compacto para la leyenda: cada valor con su propia unidad y en español
 * ($78.4 M, $1.5 mil M, 12.3 mil). Los porcentajes y los valores chicos se dejan
 * con el formato exacto de la medida.
 *
 * Se hace aquí y no con las unidades de Power BI porque éstas eligen una sola
 * unidad para todo el rango ($0.08bn junto a $1.54bn) y no están en español.
 */
export function formatoCompacto(
    valor: number,
    formatoMedida: string | undefined,
    locale: string,
    exacto: (v: number) => string,
): string {
    const abs = Math.abs(valor);
    if (formatoMedida?.includes("%") || abs < 10000) {
        return exacto(valor);
    }
    const [divisor, unidad] = abs >= 1e9 ? [1e9, "mil M"] : abs >= 1e6 ? [1e6, "M"] : [1e3, "mil"];
    const cifra = new Intl.NumberFormat(locale, { maximumFractionDigits: abs / divisor < 100 ? 1 : 0 }).format(abs / divisor);
    const moneda = /[$€£¥]/.exec(formatoMedida ?? "")?.[0] ?? "";
    return `${valor < 0 ? "-" : ""}${moneda}${cifra} ${unidad}`;
}
