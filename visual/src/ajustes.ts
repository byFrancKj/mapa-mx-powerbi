"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import Card = formattingSettings.SimpleCard;
import Model = formattingSettings.Model;
import Slice = formattingSettings.Slice;

// Los textos del panel salen de stringResources/<idioma>/resources.resjson.
const opciones = (prefijo: string, valores: string[]) =>
    valores.map((value) => ({ value, displayNameKey: `${prefijo}_${value}` }));

const METODOS = opciones("Metodo", ["cuantiles", "intervalos", "divergente"]);
const PALETAS = opciones("Paleta", ["azules", "verdes", "morados", "naranjas", "rojos", "grises"]);
const PALETAS_DIVERGENTES = opciones("PaletaDiv", ["rojo-azul", "morado-naranja", "cafe-verde", "rosa-verde"]);
const PALETAS_BIVARIADAS = opciones("PaletaBiv", ["turquesa-rosa", "verde-azul", "rojo-azul"]);
const PROYECCIONES = opciones("Proyeccion", ["lambert", "mercator"]);
const POSICIONES = opciones("Posicion", ["abajo-izquierda", "abajo-derecha", "arriba-izquierda", "arriba-derecha"]);
const CONTENIDOS = opciones("Contenido", ["valor", "nombre", "nombre-valor"]);

class ColoresCard extends Card {
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
        this.metodo, this.clases, this.paleta, this.paletaDivergente,
        this.centro, this.umbral1, this.umbral2, this.invertir, this.sinDato,
    ];

    /** En el mapa bivariado los colores salen de la tarjeta Bivariado. */
    bivariado = false;

    onPreProcess(): void {
        const divergente = this.metodo.value?.value === "divergente";
        const univariado = !this.bivariado;
        this.metodo.visible = univariado;
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
    color = new formattingSettings.ColorPicker({ name: "color", displayNameKey: "Grupos_Color", value: { value: "#3b3a39" } });
    grosor = new formattingSettings.NumUpDown({ name: "grosor", displayNameKey: "Grupos_Grosor", value: 1.6 });
    limitesInternos = new formattingSettings.ToggleSwitch({
        name: "limitesInternos", displayNameKey: "Grupos_LimitesInternos", descriptionKey: "Grupos_LimitesInternos_Desc", value: true,
    });

    name = "grupos";
    displayNameKey = "Tarjeta_Grupos";
    slices: Slice[] = [this.contorno, this.color, this.grosor, this.limitesInternos];
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

export class Ajustes extends Model {
    colores = new ColoresCard();
    bivariado = new BivariadoCard();
    mapa = new MapaCard();
    grupos = new GruposCard();
    etiquetas = new EtiquetasCard();
    leyenda = new LeyendaCard();
    cards = [this.colores, this.bivariado, this.mapa, this.grupos, this.etiquetas, this.leyenda];
}
