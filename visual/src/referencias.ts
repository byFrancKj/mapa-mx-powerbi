"use strict";

/**
 * Nombres de los mares y de los países vecinos que se escriben sobre el fondo del
 * mapa. Cada uno tiene lugares posibles (longitud, latitud), en orden de preferencia:
 * va en el primero donde cabe sin tocar tierra mexicana (y, si es un mar, ninguna
 * tierra) ni otra etiqueta. Los textos salen de stringResources.
 */
export interface Referencia {
    /** Clave del texto en resources.resjson. */
    texto: string;
    tipo: "mar" | "pais";
    lugares: Array<[number, number]>;
    /** Hacia dónde corre el texto desde su lugar (el golfo de California va inclinado). */
    eje?: [number, number];
}

export const REFERENCIAS: Referencia[] = [
    { texto: "Ref_Pacifico", tipo: "mar", lugares: [[-109.5, 16.2], [-104.5, 15.6], [-113.5, 22.5], [-118.5, 27]] },
    { texto: "Ref_GolfoMexico", tipo: "mar", lugares: [[-92.2, 24.6], [-94.5, 23], [-90.5, 26]] },
    { texto: "Ref_GolfoCalifornia", tipo: "mar", lugares: [[-111.25, 27.25], [-110.3, 25.9]], eje: [1.65, -2.25] },
    { texto: "Ref_Caribe", tipo: "mar", lugares: [[-85.3, 18.4], [-85.6, 20], [-84, 16.9]] },
    { texto: "Ref_EstadosUnidos", tipo: "pais", lugares: [[-101.2, 31.7], [-108, 33], [-97.8, 30.6]] },
    { texto: "Ref_Guatemala", tipo: "pais", lugares: [[-90.25, 15.05], [-90.2, 16.85], [-90.6, 14.6]] },
    { texto: "Ref_Belice", tipo: "pais", lugares: [[-88.72, 17.15], [-88.6, 16.6]] },
    { texto: "Ref_Honduras", tipo: "pais", lugares: [[-86.6, 14.75]] },
    { texto: "Ref_ElSalvador", tipo: "pais", lugares: [[-88.9, 13.75]] },
    { texto: "Ref_Cuba", tipo: "pais", lugares: [[-79.4, 21.75], [-78, 21.4]] },
];
