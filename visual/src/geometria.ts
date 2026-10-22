"use strict";

import { feature, mesh } from "topojson-client";
import type { GeometryCollection, GeometryObject, Topology } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry, MultiLineString } from "geojson";

import type { Nivel } from "./claves";

// Límites del Marco Geoestadístico de INEGI, empaquetados dentro del visual
// (los genera scripts/construir_geo.mjs). El visual nunca descarga mapas.
import estadosTopo from "./geo/estados.json";
import municipiosTopo from "./geo/municipios.json";

type Propiedades = Record<string, string | number>;

export interface Area {
    /** CVE_ENT (estados) o CVEGEO (municipios). */
    clave: string;
    nombre: string;
    /** CVE_ENT del estado al que pertenece (en estados, la misma clave). */
    estado: string;
    forma: Feature<Geometry, Propiedades>;
}

export interface Capa {
    nivel: Nivel;
    areas: Area[];
    porClave: Map<string, Area>;
    topologia: Topology;
    objeto: GeometryCollection<Propiedades>;
    claveDe(g: GeometryObject<Propiedades>): string;
}

const definiciones: Record<Nivel, { topo: unknown; objeto: string; clave: string; nombre: string }> = {
    estado: { topo: estadosTopo, objeto: "estados", clave: "CVE_ENT", nombre: "NOMBRE_CORTO" },
    municipio: { topo: municipiosTopo, objeto: "municipios", clave: "CVEGEO", nombre: "NOMGEO" },
};

const cache = new Map<Nivel, Capa>();

/** Estados o municipios, en orden de clave. Se construye una vez por nivel. */
export function capa(nivel: Nivel): Capa {
    let c = cache.get(nivel);
    if (!c) {
        const d = definiciones[nivel];
        const topologia = d.topo as Topology;
        const objeto = topologia.objects[d.objeto] as GeometryCollection<Propiedades>;
        const coleccion = feature(topologia, objeto) as FeatureCollection<Geometry, Propiedades>;
        const areas = coleccion.features
            .map((forma) => ({
                clave: String(forma.properties[d.clave]),
                nombre: String(forma.properties[d.nombre]),
                estado: String(forma.properties.CVE_ENT),
                forma,
            }))
            .sort((a, b) => a.clave.localeCompare(b.clave));
        c = {
            nivel,
            areas,
            porClave: new Map(areas.map((a) => [a.clave, a])),
            topologia,
            objeto,
            claveDe: (g) => String((g.properties as Propiedades | undefined)?.[d.clave]),
        };
        cache.set(nivel, c);
    }
    return c;
}

/** Los 32 estados. */
export function estados(): Area[] {
    return capa("estado").areas;
}

/**
 * Líneas de los límites que cumplen `filtro`, sin repetir los compartidos.
 * `filtro(a, b)` recibe las claves de las dos áreas que comparten el límite;
 * `b` es null en la costa o la frontera.
 */
export function bordes(c: Capa, filtro: (a: string, b: string | null) => boolean): MultiLineString {
    return mesh(c.topologia, c.objeto, (a, b) => filtro(c.claveDe(a), a === b ? null : c.claveDe(b)));
}
