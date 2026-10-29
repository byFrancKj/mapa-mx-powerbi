"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import type { Agregacion } from "./resumen";

import Card = formattingSettings.SimpleCard;
import Model = formattingSettings.Model;
import Slice = formattingSettings.Slice;

// Los textos del panel salen de stringResources/<idioma>/resources.resjson.
const opciones = (prefijo: string, valores: string[]) =>
    valores.map((value) => ({ value, displayNameKey: `${prefijo}_${value}` }));

const METODOS = opciones("Metodo", ["cuantiles", "intervalos", "divergente"]);
const PALETAS = opciones("Paleta", ["azules", "verdes", "morados", "naranjas", "rojos", "grises", "semaforo"]);
const PALETAS_DIVERGENTES = opciones("PaletaDiv", ["rojo-azul", "morado-naranja", "cafe-verde", "rosa-verde", "semaforo"]);
const COLOREAR_POR = opciones("ColorearPor", ["valor", "diferencia", "relativa", "grupo"]);
const PALETAS_BIVARIADAS = opciones("PaletaBiv", ["turquesa-rosa", "verde-azul", "rojo-azul"]);
const PROYECCIONES = opciones("Proyeccion", ["lambert", "mercator"]);
const POSICIONES = opciones("Posicion", ["abajo-izquierda", "abajo-derecha", "arriba-izquierda", "arriba-derecha"]);
const CONTENIDOS = opciones("Contenido", ["valor", "nombre", "nombre-valor"]);
const ESTILOS_GRUPO = opciones("EstiloGrupo", ["linea", "color"]);
const POSICIONES_PANEL = opciones("PosicionPanel", ["auto", "derecha", "abajo", "encima"]);
const MODOS_RUEDA = opciones("Rueda", ["siempre", "ctrl", "nunca"]);
export const OPCIONES_AGREGACION = opciones("Agregacion", ["suma", "promedio", "minimo", "maximo", "rango"]);

/** Qué colorea el mapa, ya resuelto según los campos que hay. */
export type ModoColor = "valor" | "bivariado" | "diferencia" | "relativa" | "grupo";

class ColoresCard extends Card {
    colorearPor = new formattingSettings.ItemDropdown({
        name: "colorearPor", displayNameKey: "Colores_ColorearPor", descriptionKey: "Colores_ColorearPor_Desc",
        items: COLOREAR_POR, value: COLOREAR_POR[0],
    });
    metodo = new formattingSettings.ItemDropdown({ name: "metodo", displayNameKey: "Colores_Metodo", items: METODOS, value: METODOS[0] });
    clases = new formattingSettings.NumUpDown({ name: "clases", displayNameKey: "Colores_Clases", value: 5 });
    paleta = new formattingSettings.ItemDropdown({ name: "paleta", displayNameKey: "Colores_Paleta", items: PALETAS, value: PALETAS[0] });
    paletaDivergente = new formattingSettings.ItemDropdown({
        name: "paletaDivergente", displayNameKey: "Colores_Paleta", items: PALETAS_DIVERGENTES, value: PALETAS_DIVERGENTES[0],
    });
    centro = new formattingSettings.NumUpDown({
        name: "centro", displayNameKey: "Colores_Centro", descriptionKey: "Colores_Centro_Desc", value: 0,
    });
    umbral1 = new formattingSettings.NumUpDown({
        name: "umbral1", displayNameKey: "Colores_Umbral1", descriptionKey: "Colores_Umbral1_Desc", value: 0,
    });
    umbral2 = new formattingSettings.NumUpDown({
        name: "umbral2", displayNameKey: "Colores_Umbral2", descriptionKey: "Colores_Umbral2_Desc", value: 0,
    });
    invertir = new formattingSettings.ToggleSwitch({ name: "invertir", displayNameKey: "Colores_Invertir", value: false });
    sinDato = new formattingSettings.ColorPicker({ name: "sinDato", displayNameKey: "Colores_SinDato", value: { value: "#ffffff" } });

    name = "colores";
    displayNameKey = "Tarjeta_Colores";
    slices: Slice[] = [
        this.colorearPor, this.metodo, this.clases, this.paleta, this.paletaDivergente,
        this.centro, this.umbral1, this.umbral2, this.invertir, this.sinDato,
    ];

    /** Lo que colorea el mapa (lo decide el visual con los campos que hay). */
    modo: ModoColor = "valor";
    /** Hay dos bases o más: se puede colorear por su diferencia. */
    hayComparacion = false;
    hayGrupo = false;

    onPreProcess(): void {
        // Una diferencia siempre se pinta con escala divergente; el bivariado y los
        // grupos tienen sus propios colores.
        const comparacion = this.modo === "diferencia" || this.modo === "relativa";
        const univariado = this.modo === "valor" || comparacion;
        const divergente = comparacion || this.metodo.value?.value === "divergente";
        this.colorearPor.items = COLOREAR_POR.filter((i) => i.value === "valor"
            || (i.value === "grupo" ? this.hayGrupo : this.hayComparacion));
        this.colorearPor.visible = this.hayComparacion || this.hayGrupo;
        if (!this.colorearPor.items.some((i) => i.value === this.colorearPor.value?.value)) {
            this.colorearPor.value = this.colorearPor.items[0];
        }
        this.metodo.visible = univariado && !comparacion;
        this.invertir.visible = univariado;
        this.clases.visible = univariado && !divergente;
        this.paleta.visible = univariado && !divergente;
        this.paletaDivergente.visible = univariado && divergente;
        this.centro.visible = univariado && divergente;
        this.umbral1.visible = univariado && divergente;
        this.umbral2.visible = univariado && divergente;
    }
}

class BivariadoCard extends Card {
    paleta = new formattingSettings.ItemDropdown({
        name: "paleta", displayNameKey: "Bivariado_Paleta", descriptionKey: "Bivariado_Paleta_Desc",
        items: PALETAS_BIVARIADAS, value: PALETAS_BIVARIADAS[0],
    });

    name = "bivariado";
    displayNameKey = "Tarjeta_Bivariado";
    slices: Slice[] = [this.paleta];
}

class MapaCard extends Card {
    proyeccion = new formattingSettings.ItemDropdown({
        name: "proyeccion", displayNameKey: "Mapa_Proyeccion", items: PROYECCIONES, value: PROYECCIONES[0],
    });
    borde = new formattingSettings.ColorPicker({ name: "borde", displayNameKey: "Mapa_Borde", value: { value: "#d6d6d6" } });
    grosor = new formattingSettings.NumUpDown({ name: "grosor", displayNameKey: "Mapa_Grosor", value: 0.8 });

    name = "mapa";
    displayNameKey = "Tarjeta_Mapa";
    slices: Slice[] = [this.proyeccion, this.borde, this.grosor];
}

class GruposCard extends Card {
    contorno = new formattingSettings.ToggleSwitch({ name: "contorno", displayNameKey: "Grupos_Contorno", value: true });
    estilo = new formattingSettings.ItemDropdown({
        name: "estilo", displayNameKey: "Grupos_Estilo", descriptionKey: "Grupos_Estilo_Desc", items: ESTILOS_GRUPO, value: ESTILOS_GRUPO[0],
    });
    color = new formattingSettings.ColorPicker({ name: "color", displayNameKey: "Grupos_Color", value: { value: "#3b3a39" } });
    grosor = new formattingSettings.NumUpDown({ name: "grosor", displayNameKey: "Grupos_Grosor", value: 1.6 });
    limitesInternos = new formattingSettings.ToggleSwitch({
        name: "limitesInternos", displayNameKey: "Grupos_LimitesInternos", descriptionKey: "Grupos_LimitesInternos_Desc", value: true,
    });

    etiquetas = new formattingSettings.ToggleSwitch({ name: "etiquetas", displayNameKey: "Grupos_Etiquetas", value: true });
    tamanoEtiquetas = new formattingSettings.NumUpDown({ name: "tamanoEtiquetas", displayNameKey: "Grupos_TamanoEtiquetas", value: 11 });

    name = "grupos";
    displayNameKey = "Tarjeta_Grupos";
    slices: Slice[] = [this.contorno, this.estilo, this.color, this.grosor, this.limitesInternos, this.etiquetas, this.tamanoEtiquetas];

    onPreProcess(): void {
        this.tamanoEtiquetas.visible = this.etiquetas.value;
    }
}

class EtiquetasCard extends Card {
    mostrar = new formattingSettings.ToggleSwitch({ name: "mostrar", displayNameKey: "Etiquetas_Mostrar", value: false });
    contenido = new formattingSettings.ItemDropdown({
        name: "contenido", displayNameKey: "Etiquetas_Contenido", items: CONTENIDOS, value: CONTENIDOS[0],
    });
    tamano = new formattingSettings.NumUpDown({ name: "tamano", displayNameKey: "Etiquetas_Tamano", value: 10 });
    color = new formattingSettings.ColorPicker({ name: "color", displayNameKey: "Etiquetas_Color", value: { value: "#252423" } });

    name = "etiquetas";
    displayNameKey = "Tarjeta_Etiquetas";
    topLevelSlice = this.mostrar;
    slices: Slice[] = [this.contenido, this.tamano, this.color];
}

class LeyendaCard extends Card {
    mostrar = new formattingSettings.ToggleSwitch({ name: "mostrar", displayNameKey: "Leyenda_Mostrar", value: true });
    posicion = new formattingSettings.ItemDropdown({ name: "posicion", displayNameKey: "Leyenda_Posicion", items: POSICIONES, value: POSICIONES[0] });
    titulo = new formattingSettings.TextInput({
        name: "titulo", displayNameKey: "Leyenda_Titulo", placeholder: "", placeholderKey: "Leyenda_Titulo_Placeholder", value: "",
    } as ConstructorParameters<typeof formattingSettings.TextInput>[0]);
    tamano = new formattingSettings.NumUpDown({ name: "tamano", displayNameKey: "Leyenda_Tamano", value: 11 });

    name = "leyenda";
    displayNameKey = "Tarjeta_Leyenda";
    topLevelSlice = this.mostrar;
    slices: Slice[] = [this.posicion, this.titulo, this.tamano];
}

class PanelCard extends Card {
    mostrar = new formattingSettings.ToggleSwitch({ name: "mostrar", displayNameKey: "Panel_Mostrar", value: true });
    posicion = new formattingSettings.ItemDropdown({
        name: "posicion", displayNameKey: "Panel_Posicion", items: POSICIONES_PANEL, value: POSICIONES_PANEL[0],
    });
    tamano = new formattingSettings.NumUpDown({
        name: "tamano", displayNameKey: "Panel_Tamano", descriptionKey: "Panel_Tamano_Desc", value: 36,
    });
    sinSeleccion = new formattingSettings.ToggleSwitch({
        name: "sinSeleccion", displayNameKey: "Panel_SinSeleccion", descriptionKey: "Panel_SinSeleccion_Desc", value: false,
    });
    silueta = new formattingSettings.ToggleSwitch({ name: "silueta", displayNameKey: "Panel_Silueta", value: true });
    diferencia = new formattingSettings.ToggleSwitch({ name: "diferencia", displayNameKey: "Panel_Diferencia", value: true });
    indice = new formattingSettings.ToggleSwitch({ name: "indice", displayNameKey: "Panel_Indice", value: true });
    colorSigno = new formattingSettings.ToggleSwitch({ name: "colorSigno", displayNameKey: "Panel_ColorSigno", value: true });
    tamanoTexto = new formattingSettings.NumUpDown({ name: "tamanoTexto", displayNameKey: "Panel_TamanoTexto", value: 12 });

    name = "panel";
    displayNameKey = "Tarjeta_Panel";
    descriptionKey = "Tarjeta_Panel_Desc";
    topLevelSlice = this.mostrar;
    slices: Slice[] = [
        this.posicion, this.tamano, this.sinSeleccion, this.silueta,
        this.diferencia, this.indice, this.colorSigno, this.tamanoTexto,
    ];

    /** Hay dos bases o más: aplican la diferencia y el índice. */
    hayComparacion = false;

    onPreProcess(): void {
        this.diferencia.visible = this.hayComparacion;
        this.indice.visible = this.hayComparacion;
        this.colorSigno.visible = this.hayComparacion;
    }
}

/** Una lista por medida del panel; la arma el visual con las columnas que recibe. */
class AgregacionCard extends Card {
    name = "agregacion";
    displayNameKey = "Tarjeta_Agregacion";
    descriptionKey = "Tarjeta_Agregacion_Desc";
    slices: Slice[] = [];

    /**
     * Power BI guarda la opción de cada medida en su columna (selector por queryName),
     * así que el visual la lee del dataView y aquí solo la presenta.
     */
    definir(medidas: Array<{ nombre: string; consulta: string; agregacion: Agregacion }>): void {
        this.slices = medidas.map((m) => new formattingSettings.ItemDropdown({
            name: "tipo",
            displayName: m.nombre,
            items: OPCIONES_AGREGACION,
            value: OPCIONES_AGREGACION.find((o) => o.value === m.agregacion) ?? OPCIONES_AGREGACION[0],
            selector: { metadata: m.consulta },
        }));
        this.visible = this.slices.length > 0;
    }
}

class ZoomCard extends Card {
    activo = new formattingSettings.ToggleSwitch({ name: "activo", displayNameKey: "Zoom_Activo", value: true });
    rueda = new formattingSettings.ItemDropdown({
        name: "rueda", displayNameKey: "Zoom_Rueda", descriptionKey: "Zoom_Rueda_Desc", items: MODOS_RUEDA, value: MODOS_RUEDA[0],
    });
    botones = new formattingSettings.ToggleSwitch({ name: "botones", displayNameKey: "Zoom_Botones", value: true });
    posicion = new formattingSettings.ItemDropdown({ name: "posicion", displayNameKey: "Zoom_Posicion", items: POSICIONES, value: POSICIONES[3] });
    acercarSeleccion = new formattingSettings.ToggleSwitch({
        name: "acercarSeleccion", displayNameKey: "Zoom_AcercarSeleccion", descriptionKey: "Zoom_AcercarSeleccion_Desc", value: false,
    });

    name = "zoom";
    displayNameKey = "Tarjeta_Zoom";
    topLevelSlice = this.activo;
    slices: Slice[] = [this.rueda, this.botones, this.posicion, this.acercarSeleccion];

    onPreProcess(): void {
        this.posicion.visible = this.botones.value;
    }
}

export class Ajustes extends Model {
    colores = new ColoresCard();
    bivariado = new BivariadoCard();
    mapa = new MapaCard();
    grupos = new GruposCard();
    etiquetas = new EtiquetasCard();
    leyenda = new LeyendaCard();
    panel = new PanelCard();
    agregacion = new AgregacionCard();
    zoom = new ZoomCard();
    cards = [this.colores, this.bivariado, this.mapa, this.grupos, this.etiquetas, this.leyenda, this.panel, this.agregacion, this.zoom];
}
