"use strict";

import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry } from "geojson";

// Límites estatales del Marco Geoestadístico de INEGI, empaquetados dentro del
// visual (lo genera scripts/construir_geo.mjs). El visual nunca descarga mapas.
import estadosTopo from "./geo/estados.json";

export interface PropiedadesEstado {
    CVE_ENT: string;
    NOM_ENT: string;
    NOMBRE_CORTO: string;
    ABREV: string;
    ISO_3166_2: string;
    LON: number;
    LAT: number;
}

export interface Area {
    clave: string;
    nombre: string;
    forma: Feature<Geometry, PropiedadesEstado>;
}

let estadosCache: Area[] | null = null;

/** Los 32 estados, en orden de clave. */
export function estados(): Area[] {
    if (!estadosCache) {
        const topo = estadosTopo as unknown as Topology<{ estados: GeometryCollection<PropiedadesEstado> }>;
        const coleccion = feature(topo, topo.objects.estados) as FeatureCollection<Geometry, PropiedadesEstado>;
        estadosCache = coleccion.features
            .map((forma) => ({ clave: forma.properties.CVE_ENT, nombre: forma.properties.NOMBRE_CORTO, forma }))
            .sort((a, b) => a.clave.localeCompare(b.clave));
    }
    return estadosCache;
}
