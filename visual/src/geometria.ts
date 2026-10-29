"use strict";

import { geoArea } from "d3-geo";
import { feature, merge, mesh } from "topojson-client";
import type { GeometryCollection, GeometryObject, MultiPolygon as TopoMultiPolygon, Polygon as TopoPolygon, Topology } from "topojson-specification";
import type { Feature, FeatureCollection, Geometry, MultiLineString, MultiPolygon } from "geojson";

import type { Nivel } from "./claves";

// Límites del Marco Geoestadístico de INEGI, empaquetados dentro del visual
// (los genera scripts/construir_geo.mjs). El visual nunca descarga mapas.
import estadosTopo from "./geo/estados.json";
import municipiosTopo from "./geo/municipios.json";
// Tierra de los países vecinos y sus fronteras, de Natural Earth (scripts/construir_contexto.mjs).
import contextoTopo from "./geo/contexto.json";

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

/** Contorno de un grupo de áreas (una región) como una sola figura, sin sus límites internos. */
export function unir(c: Capa, incluir: (clave: string) => boolean): MultiPolygon {
    const partes = c.objeto.geometries.filter((g) => incluir(c.claveDe(g)));
    return merge(c.topologia, partes as Array<TopoPolygon<Propiedades> | TopoMultiPolygon<Propiedades>>);
}

const principales = new WeakMap<Area, Feature<Geometry, Propiedades>>();

/**
 * El área sin sus islas lejanas (las Revillagigedo en Colima, las Marías en Nayarit):
 * solo las partes con al menos el 5 % de la superficie de la mayor. Sirve para
 * encuadrar, porque las islas alejan la vista; el mapa las sigue dibujando.
 */
export function principal(a: Area): Feature<Geometry, Propiedades> {
    let p = principales.get(a);
    if (!p) {
        const g = a.forma.geometry;
        if (g.type === "MultiPolygon") {
            const superficies = g.coordinates.map((coordinates) => geoArea({ type: "Polygon", coordinates }));
            const mayor = Math.max(...superficies);
            p = { ...a.forma, geometry: { type: "MultiPolygon", coordinates: g.coordinates.filter((_, i) => superficies[i] >= mayor * 0.05) } };
        } else {
            p = a.forma;
        }
        principales.set(a, p);
    }
    return p;
}

/** El fondo del mapa: la tierra de los demás países, sus fronteras y la costa de México. */
export interface Fondo {
    tierra: MultiPolygon;
    fronteras: MultiLineString;
    /** Contorno exterior de México (costa y fronteras): de ahí salen las líneas de agua. */
    costa: MultiLineString;
    /** México como una sola figura (para que los nombres del fondo no caigan en su tierra). */
    mexico: MultiPolygon;
}

let fondo: Fondo | null = null;

export function fondoDelMapa(): Fondo {
    if (!fondo) {
        const t = contextoTopo as unknown as Topology;
        fondo = {
            tierra: merge(t, (t.objects.tierra as GeometryCollection).geometries as Array<TopoPolygon | TopoMultiPolygon>),
            fronteras: mesh(t, t.objects.fronteras as GeometryCollection),
            costa: bordes(capa("estado"), (_, b) => b === null),
            mexico: unir(capa("estado"), () => true),
        };
    }
    return fondo;
}
