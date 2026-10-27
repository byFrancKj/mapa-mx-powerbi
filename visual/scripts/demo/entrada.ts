/**
 * Demostración del visual en el navegador, con el host falso de las pruebas y los
 * datos ficticios del ejemplo. La arma scripts/demo.ts (npm run demo).
 *
 * En la dirección se puede fijar la escena, el tamaño y una selección inicial:
 *   index.html#escena=franjas&ancho=1000&alto=560&sel=14,18
 */
import { Visual } from "../../src/visual";
import { crearDataView, crearHostCon, MedidaFalsa, OpcionesDataView } from "../../test/host-falso";
import textos from "../../stringResources/es-MX/resources.resjson";
import estados from "../../../.cache/vista_previa/estados.json";

type Registro = Record<string, string | number | null>;
const filas = estados as Registro[];
const col = (medida: string) => filas.map((e) => e[medida] as number | null);

const BASES_VENTAS: MedidaFalsa[] = [
    { nombre: "Ventas Cadenas", valores: col("Ventas Cadenas"), formato: "\\$#,0" },
    { nombre: "Ventas Nielsen Estimada", valores: col("Ventas Nielsen Estimada"), formato: "\\$#,0" },
];
const BASES_MIX: MedidaFalsa[] = [
    { nombre: "% Mix Cadenas", valores: col("% Mix Cadenas"), formato: "0.0%" },
    { nombre: "% Mix Nielsen", valores: col("% Mix Nielsen"), formato: "0.0%" },
];
const TARJETAS: MedidaFalsa[] = [
    { nombre: "Índice Cadenas vs Nielsen", valores: col("Índice Cadenas vs Nielsen"), formato: "#,0", objetos: { agregacion: { tipo: "promedio" } } },
    { nombre: "Crec % Cadenas", valores: col("Crec % Cadenas"), formato: "+0.0%;-0.0%;0.0%" },
    { nombre: "Precio Promedio Cadenas", valores: col("Precio Promedio Cadenas"), formato: "\\$#,0.00" },
    { nombre: "Unidades Cadenas", valores: col("Unidades Cadenas"), formato: "#,0", objetos: { agregacion: { tipo: "suma" } } },
];
const BASE: OpcionesDataView = {
    claves: filas.map((e) => e.CVE_ENT),
    grupo: { nombre: "Región Nielsen", valores: filas.map((e) => e.REGION_NIELSEN) },
    valores: col("Ventas Cadenas"),
    nombre: "Ventas Cadenas",
    formato: "\\$#,0",
    bases: BASES_VENTAS,
    tarjetas: TARJETAS,
};

const ESCENAS: Record<string, { titulo: string; datos: OpcionesDataView }> = {
    ventas: { titulo: "Ventas con semáforo", datos: { ...BASE, objetos: { colores: { paleta: "semaforo" } } } },
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
    visual.update({ dataViews: [crearDataView(escena.datos)], viewport: { width: estado.ancho, height: estado.alto }, type: 2 } as never);
    if (seleccion.length > 0) {
        // La identidad de un área combina todas sus categorías: clave y grupo.
        const grupos = escena.datos.grupo?.valores ?? [];
        entorno.seleccionarDesdeFuera(seleccion.map((k) => {
            const i = escena.datos.claves.indexOf(k);
            return grupos.length > 0 && i >= 0 ? `${k}|${String(grupos[i])}` : k;
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
