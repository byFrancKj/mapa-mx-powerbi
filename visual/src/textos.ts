"use strict";

import powerbi from "powerbi-visuals-api";

import ILocalizationManager = powerbi.extensibility.ILocalizationManager;

/**
 * Textos del visual en el idioma de Power BI. Las traducciones viven en
 * stringResources/<idioma>/resources.resjson (es-ES, es-MX y en-US, que es el
 * respaldo para cualquier otro idioma).
 */
export class Textos {
    constructor(private readonly gestor: ILocalizationManager) {}

    /** Texto de la clave; {0}, {1}… se reemplazan por los argumentos. */
    t(clave: string, ...args: Array<string | number>): string {
        return args.reduce<string>((texto, valor, i) => texto.split(`{${i}}`).join(String(valor)), this.gestor.getDisplayName(clave));
    }
}
