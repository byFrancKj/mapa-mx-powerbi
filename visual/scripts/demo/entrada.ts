/**
 * Demostración del visual en el navegador, con el host falso de las pruebas y los
 * datos ficticios del ejemplo. La arma scripts/demo.ts (npm run demo).
 *
 * En la dirección se puede fijar la escena, el tamaño y una selección inicial:
 *   index.html#escena=franjas&ancho=1000&alto=560&sel=14,18
 * y la posición del panel de detalle: &panel=abajo (derecha, abajo o encima).
 */
import { Visual } from "../../src/visual";
import { crearDataView, crearHostCon, DatoFalso, MedidaFalsa, OpcionesDataView } from "../../test/host-falso";
import textos from "../../stringResources/es-MX/resources.resjson";
import estados from "../../../.cache/vista_previa/estados.json";
import municipios from "../../../.cache/vista_previa/municipios.json";

type Registro = Record<string, string | number | null>;
const filas = estados as Registro[];
const col = (medida: string) => filas.map((e) => e[medida] as number | null);

const BASES_VENTAS: MedidaFalsa[] = [
    { nombre: "Ventas Cadenas", valores: col("Ventas Cadenas"), formato: "\\$#,0" },
    { nombre: "Ventas Mercado Estimada", valores: col("Ventas Mercado Estimada"), formato: "\\$#,0" },
];
const BASES_MIX: MedidaFalsa[] = [
    { nombre: "% Mix Cadenas", valores: col("% Mix Cadenas"), formato: "0.0%" },
    { nombre: "% Mix Mercado", valores: col("% Mix Mercado"), formato: "0.0%" },
];
const TARJETAS: MedidaFalsa[] = [
    { nombre: "Índice Cadenas vs Mercado", valores: col("Índice Cadenas vs Mercado"), formato: "#,0", objetos: { agregacion: { tipo: "promedio" } } },
    { nombre: "Crec % Cadenas", valores: col("Crec % Cadenas"), formato: "+0.0%;-0.0%;0.0%" },
    { nombre: "Precio Promedio Cadenas", valores: col("Precio Promedio Cadenas"), formato: "\\$#,0.00" },
    { nombre: "Unidades Cadenas", valores: col("Unidades Cadenas"), formato: "#,0", objetos: { agregacion: { tipo: "suma" } } },
];
const moneda = (v: number): string => `$${(v / 1e6).toFixed(1)} M`;
/** Una medida con CONCATENATEX: un renglón por tienda, ya formateado en DAX. */
const TOP_3: MedidaFalsa = {
    nombre: "Top 3 tiendas",
    tipo: { text: true },
    valores: filas.map((e) => {
        const ventas = e["Ventas Cadenas"] as number | null;
        return ventas === null ? null : [0.31, 0.22, 0.14].map((p, i) => `Tienda ${e.CVE_ENT}-0${i + 1} · ${moneda(ventas * p)}`).join("\n");
    }),
};
/** El mismo texto en toda la región: DAX lo calcula una vez y el panel lo muestra una vez. */
const TOP_3_REGION: MedidaFalsa = {
    nombre: "Top 3 de la región",
    tipo: { text: true },
    valores: filas.map((e) => `Tienda ${e.REGION} Centro\nTienda ${e.REGION} Norte\nTienda ${e.REGION} Sur`),
};
const TARJETAS_TIPOS: MedidaFalsa[] = [
    TOP_3,
    TOP_3_REGION,
    { nombre: "Última venta", tipo: { dateTime: true }, formato: "dd/MM/yyyy", valores: filas.map((_, i) => new Date(2026, 8, 30 - (i % 12))) },
    { nombre: "Cumple meta", tipo: { bool: true }, valores: filas.map((e) => ((e["Crec % Cadenas"] as number | null) ?? 0) > 0.08) },
    { nombre: "Estatus", tipo: { text: true }, valores: filas.map((e) => (((e["Crec % Cadenas"] as number | null) ?? 0) > 0.08 ? "En meta" : "Por debajo")) },
    TARJETAS[1],
];
/** Tiendas con venta en cada estado (en la demo, proporcional a la venta). */
const TIENDAS: MedidaFalsa = {
    nombre: "Tiendas",
    formato: "#,0",
    lugar: 1,
    valores: filas.map((e, i) => {
        const ventas = e["Ventas Cadenas"] as number | null;
        return ventas === null ? null : Math.round(ventas / 2.6e6) + (i % 5) * 3;
    }),
};
const BASE: OpcionesDataView = {
    claves: filas.map((e) => e.CVE_ENT),
    grupo: { nombre: "Región", valores: filas.map((e) => e.REGION) },
    valores: col("Ventas Cadenas"),
    nombre: "Ventas Cadenas",
    formato: "\\$#,0",
    bases: BASES_VENTAS,
    tarjetas: TARJETAS,
};

/**
 * Lo que calcularía DAX en los nodos de la matriz (el total de lo filtrado y el de cada
 * región). En la demo: las cifras de volumen se suman, los índices y crecimientos se
 * promedian y el Top 3 de la región es el de sus estados. En Power BI lo calcula tu medida.
 */
function conTotales(o: OpcionesDataView): OpcionesDataView {
    const medidas: MedidaFalsa[] = [
        ...(o.valores ? [{ nombre: o.nombre ?? "Ventas", valores: o.valores, resaltes: o.resaltes }] : []),
        ...(o.bases ?? []),
        ...(o.tarjetas ?? []),
        ...(o.tabla ?? []),
    ];
    // Con un resaltado de otro visual, DAX calcula el total de lo resaltado.
    const total = (filas: number[], resalte = false): Record<string, DatoFalso> => Object.fromEntries(medidas.map((m) => {
        const v = filas.map((i) => (resalte && m.resaltes ? m.resaltes[i] : m.valores[i]));
        // Un Top 3 (renglones con su venta) se recalcula con todos; otro texto, el más frecuente.
        const textosV = v.filter((x): x is string => typeof x === "string");
        if (textosV.length > 0 && !textosV.some((x) => x.includes("\n"))) {
            const veces = new Map<string, number>();
            textosV.forEach((x) => veces.set(x, (veces.get(x) ?? 0) + 1));
            return [m.nombre, [...veces].sort((a, b) => b[1] - a[1])[0][0]];
        }
        if (textosV.length > 0) {
            return [m.nombre, (v.filter((x) => typeof x === "string") as string[])
                .flatMap((x) => x.split("\n")).sort((a, b) => Number(/\$([\d.]+)/.exec(b)?.[1]) - Number(/\$([\d.]+)/.exec(a)?.[1]))
                .slice(0, 3).join("\n")];
        }
        const n = v.filter((x): x is number => typeof x === "number");
        if (n.length === 0 || typeof v.find((x) => x !== null) !== "number") {
            return [m.nombre, v.find((x) => x !== null) ?? null];
        }
        const promedio = /Índice|Crec|Precio/.test(m.nombre);
        const suma = n.reduce((a, b) => a + b, 0);
        return [m.nombre, promedio ? suma / n.length : suma];
    }));
    const filas = o.claves.map((_, i) => i);
    const grupos = o.grupo ? [...new Set(o.grupo.valores.map(String))] : [];
    return {
        ...o,
        totales: {
            general: total(filas),
            ...(o.resaltes ? { resalteGeneral: total(filas, true) } : {}),
            grupos: Object.fromEntries(grupos.map((g) => [g, total(filas.filter((i) => String(o.grupo?.valores[i]) === g))])),
        },
    };
}

/** Doce meses de ventas: estacionalidad y un crecimiento distinto por estado. */
function porMes(o: OpcionesDataView): OpcionesDataView {
    const meses = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
    const estacion = [0.8, 0.78, 0.9, 0.92, 1, 0.97, 0.95, 1.02, 0.98, 1.05, 1.15, 1.4];
    const valores = meses.map((_, m) => (o.valores ?? []).map((v, i) => {
        if (v === null) {
            return null;
        }
        const crecimiento = 1 + (((i * 37) % 13) - 4) / 100 * (m / 11) * 3;
        return Math.round((v / 12) * estacion[m] * crecimiento);
    }));
    const total = (o.valores ?? []).map((_, i) => valores.reduce((s, mes) => s + (mes[i] ?? 0), 0));
    return { ...o, periodos: { nombre: "Año-Mes", etiquetas: meses, valores, total } };
}

/** Solo las filas que deja un filtro (como lo manda Power BI al filtrar una región). */
function filtrar(o: OpcionesDataView, queda: (i: number) => boolean): OpcionesDataView {
    const de = <T>(v: T[] | undefined): T[] | undefined => v?.filter((_, i) => queda(i));
    const medida = (m: MedidaFalsa): MedidaFalsa => ({ ...m, valores: de(m.valores) ?? [] });
    return {
        ...o,
        claves: de(o.claves) ?? [],
        grupo: o.grupo ? { ...o.grupo, valores: de(o.grupo.valores) ?? [] } : undefined,
        valores: de(o.valores),
        bases: o.bases?.map(medida),
        tarjetas: o.tarjetas?.map(medida),
        tabla: o.tabla?.map(medida),
    };
}

/** Lo que resalta otro visual: `parte(i)` es la fracción resaltada de cada fila (null, nada). */
function resaltar(o: OpcionesDataView, parte: (i: number) => number | null): OpcionesDataView {
    const de = <T>(v: T[]): T[] => v.map((x, i) => {
        const p = parte(i);
        return x === null || p === null ? null : typeof x === "number" ? x * p : x;
    }) as T[];
    const medida = (m: MedidaFalsa): MedidaFalsa => ({ ...m, resaltes: de(m.valores) });
    return {
        ...o, resaltes: o.valores ? de(o.valores) : undefined,
        bases: o.bases?.map(medida), tarjetas: o.tarjetas?.map(medida), tabla: o.tabla?.map(medida),
    };
}

const ESCENAS: Record<string, { titulo: string; datos: OpcionesDataView }> = {
    ventas: { titulo: "Ventas con semáforo", datos: { ...BASE, objetos: { colores: { paleta: "semaforo" } } } },
    region: {
        titulo: "Filtro de región (Occidente)",
        datos: { ...filtrar(BASE, (i) => filas[i].REGION === "Occidente"), objetos: { colores: { paleta: "semaforo" } } },
    },
    estado: { titulo: "Filtro de un estado", datos: filtrar(BASE, (i) => filas[i].CVE_ENT === "14") },
    tabla: {
        titulo: "Clic en otra tabla (región Bajío)",
        datos: resaltar(BASE, (i) => (filas[i].REGION === "Bajío" ? 1 : null)),
    },
    producto: {
        titulo: "Clic en otra tabla (un producto)",
        datos: resaltar(BASE, (i) => (i % 7 === 3 ? null : 0.18 + ((i * 37) % 11) / 40)),
    },
    columnas: {
        titulo: "Tabla con columnas propias",
        datos: {
            ...BASE,
            // Ventas Cadenas está en Bases y es la primera de Columnas de la tabla; el mercado solo sirve para la diferencia.
            bases: [{ ...BASES_VENTAS[0], tambien: { tabla: 0 } }, BASES_VENTAS[1]],
            tabla: [TIENDAS, { nombre: "Precio Promedio", valores: col("Precio Promedio Cadenas"), formato: "\\$#,0.00", lugar: 2 }],
            objetos: { colores: { paleta: "semaforo" }, panel: { abrir: "siempre" }, tabla: { participacion: true, diferencia: true, relativa: false } },
        },
    },
    tipos: { titulo: "Tarjetas de texto, fecha y sí/no", datos: { ...BASE, tarjetas: TARJETAS_TIPOS } },
    tiempo: { titulo: "Línea del tiempo (12 meses)", datos: { ...porMes(BASE), tarjetas: TARJETAS_TIPOS, objetos: { colores: { paleta: "semaforo" } } } },
    barra: { titulo: "Leyenda en barra", datos: { ...BASE, objetos: { leyenda: { estilo: "barra", posicion: "abajo-izquierda" } } } },
    municipios: {
        titulo: "Municipios de Jalisco (drill-down)",
        datos: {
            claves: (municipios as Registro[]).map((m) => m.CVEGEO),
            valores: (municipios as Registro[]).map((m) => m.VENTAS as number | null),
            nombre: "Ventas Cadenas",
            formato: "\\$#,0",
        },
    },
    franjas: { titulo: "Regiones con franja de color", datos: { ...BASE, objetos: { grupos: { estilo: "color" } } } },
    mix: {
        titulo: "Diferencia % de mix",
        datos: {
            ...BASE, valores: undefined, bases: BASES_MIX,
            objetos: { colores: { colorearPor: "relativa", paletaDivergente: "semaforo", umbral1: 0.1, umbral2: 0.3 } },
        },
    },
    grupos: { titulo: "Colorear por región", datos: { ...BASE, objetos: { colores: { colorearPor: "grupo" } } } },
    etiquetas: {
        titulo: "Etiquetas y acercar a la selección",
        datos: { ...BASE, objetos: { etiquetas: { mostrar: true }, colores: { paleta: "semaforo" }, zoom: { acercarSeleccion: true } } },
    },
};

const parametros = new URLSearchParams(location.hash.slice(1));
const estado = {
    escena: parametros.get("escena") ?? "ventas",
    ancho: Number(parametros.get("ancho") ?? 1000),
    alto: Number(parametros.get("alto") ?? 560),
};

const barra = document.createElement("div");
barra.className = "barra";
const ayuda = document.createElement("p");
ayuda.className = "ayuda";
ayuda.textContent = "Clic: selecciona y abre el panel · Ctrl+clic (⌘+clic en Mac): agrega · clic en el fondo: limpia · "
    + "rueda: acerca · arrastrar: mueve · clic en el nombre de una región: la selecciona. Datos ficticios.";
let contenedor = document.createElement("div");
document.body.append(barra, ayuda, contenedor);

const globo = document.createElement("div");
globo.className = "globo";
document.body.appendChild(globo);

interface OpcionesGlobo { coordinates: number[]; dataItems?: Array<{ displayName: string; value: string }> }

/** Monta el visual de cero (como al insertarlo en un reporte). */
function montar(seleccion: string[] = []): void {
    const escena = ESCENAS[estado.escena] ?? ESCENAS.ventas;
    const nuevo = document.createElement("div");
    nuevo.className = "visual";
    nuevo.style.width = `${estado.ancho}px`;
    nuevo.style.height = `${estado.alto}px`;
    contenedor.replaceWith(nuevo);
    contenedor = nuevo;

    const entorno = crearHostCon(textos as Record<string, string>);
    // Un tooltip sencillo en lugar del de Power BI
    const mostrar = (o: OpcionesGlobo): void => {
        globo.replaceChildren(...(o.dataItems ?? []).map((d) => {
            const fila = document.createElement("div");
            const nombre = document.createElement("span");
            nombre.textContent = d.displayName;
            const valor = document.createElement("b");
            valor.textContent = d.value;
            fila.append(nombre, valor);
            return fila;
        }));
        const caja = nuevo.getBoundingClientRect();
        globo.style.left = `${caja.left + o.coordinates[0] + 14}px`;
        globo.style.top = `${caja.top + o.coordinates[1] + 14}px`;
        globo.style.display = "block";
    };
    Object.assign(entorno.host, {
        tooltipService: { enabled: () => true, show: mostrar, move: mostrar, hide: () => { globo.style.display = "none"; } },
    });
    const visual = new Visual({ element: nuevo, host: entorno.host } as never);
    const posicion = parametros.get("panel");
    const datos: OpcionesDataView = posicion
        ? { ...escena.datos, objetos: { ...escena.datos.objetos, panel: { ...escena.datos.objetos?.panel, posicion } } }
        : escena.datos;
    visual.update({ dataViews: [crearDataView(conTotales(datos))], viewport: { width: estado.ancho, height: estado.alto }, type: 2 } as never);
    if (seleccion.length > 0) {
        // La identidad de un área es su camino en la matriz: región y clave.
        const grupos = escena.datos.grupo?.valores ?? [];
        entorno.seleccionarDesdeFuera(seleccion.map((k) => {
            const i = escena.datos.claves.indexOf(k);
            return grupos.length > 0 && i >= 0 ? `${String(grupos[i])}|${k}` : k;
        }));
    }
    for (const b of barra.querySelectorAll<HTMLButtonElement>("button")) {
        b.setAttribute("aria-pressed", String(b.dataset.escena === estado.escena));
    }
}

for (const [clave, e] of Object.entries(ESCENAS)) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.dataset.escena = clave;
    boton.textContent = e.titulo;
    boton.addEventListener("click", () => {
        estado.escena = clave;
        montar();
    });
    barra.appendChild(boton);
}
const tamanos: Record<string, [number, number]> = {
    "Ancho (1000 × 560)": [1000, 560],
    "Mediano (760 × 500)": [760, 500],
    "Alto (420 × 760)": [420, 760],
    "Chico (380 × 300)": [380, 300],
};
const selector = document.createElement("select");
selector.setAttribute("aria-label", "Tamaño del visual");
for (const [nombre, [ancho, alto]] of Object.entries(tamanos)) {
    selector.add(new Option(nombre, `${ancho}x${alto}`, false, ancho === estado.ancho && alto === estado.alto));
}
selector.addEventListener("change", () => {
    [estado.ancho, estado.alto] = selector.value.split("x").map(Number);
    montar();
});
barra.appendChild(selector);

montar((parametros.get("sel") ?? "").split(",").filter(Boolean));
