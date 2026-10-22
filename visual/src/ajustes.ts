"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import Card = formattingSettings.SimpleCard;
import Model = formattingSettings.Model;
import Slice = formattingSettings.Slice;

const METODOS = [
    { value: "cuantiles", displayName: "Cuantiles (mismo número de estados por clase)" },
    { value: "intervalos", displayName: "Intervalos iguales" },
    { value: "divergente", displayName: "Divergente (alrededor de un centro)" },
];

const PALETAS = [
    { value: "azules", displayName: "Azules" },
    { value: "verdes", displayName: "Verdes" },
    { value: "morados", displayName: "Morados" },
    { value: "naranjas", displayName: "Naranjas" },
    { value: "rojos", displayName: "Rojos" },
    { value: "grises", displayName: "Grises" },
];

const PALETAS_DIVERGENTES = [
    { value: "rojo-azul", displayName: "Rojo · gris · azul" },
    { value: "morado-naranja", displayName: "Morado · gris · naranja" },
    { value: "cafe-verde", displayName: "Café · gris · verde" },
    { value: "rosa-verde", displayName: "Rosa · gris · verde" },
];

const PROYECCIONES = [
    { value: "lambert", displayName: "Cónica conforme de Lambert (INEGI)" },
    { value: "mercator", displayName: "Mercator" },
];

const POSICIONES = [
    { value: "abajo-izquierda", displayName: "Abajo a la izquierda" },
    { value: "abajo-derecha", displayName: "Abajo a la derecha" },
    { value: "arriba-izquierda", displayName: "Arriba a la izquierda" },
    { value: "arriba-derecha", displayName: "Arriba a la derecha" },
];

class ColoresCard extends Card {
    metodo = new formattingSettings.ItemDropdown({ name: "metodo", displayName: "Método", items: METODOS, value: METODOS[0] });
    clases = new formattingSettings.NumUpDown({ name: "clases", displayName: "Número de clases", value: 5 });
    paleta = new formattingSettings.ItemDropdown({ name: "paleta", displayName: "Paleta", items: PALETAS, value: PALETAS[0] });
    paletaDivergente = new formattingSettings.ItemDropdown({
        name: "paletaDivergente", displayName: "Paleta", items: PALETAS_DIVERGENTES, value: PALETAS_DIVERGENTES[0],
    });
    centro = new formattingSettings.NumUpDown({
        name: "centro", displayName: "Centro",
        description: "Valor neutro, en las unidades de la medida: 100 en índices, 0 en crecimientos o brechas.",
        value: 0,
    });
    umbral1 = new formattingSettings.NumUpDown({
        name: "umbral1", displayName: "Umbral de \"similar\"",
        description: "Distancia al centro que todavía cuenta como similar (p. ej. 10 en un índice, 0.02 para ±2 %). 0 = automático.",
        value: 0,
    });
    umbral2 = new formattingSettings.NumUpDown({
        name: "umbral2", displayName: "Umbral de \"muy\"",
        description: "Distancia al centro a partir de la cual es muy por encima o muy por debajo. 0 = automático.",
        value: 0,
    });
    invertir = new formattingSettings.ToggleSwitch({ name: "invertir", displayName: "Invertir colores", value: false });
    sinDato = new formattingSettings.ColorPicker({ name: "sinDato", displayName: "Sin dato", value: { value: "#ffffff" } });

    name = "colores";
    displayName = "Colores";
    slices: Slice[] = [
        this.metodo, this.clases, this.paleta, this.paletaDivergente,
        this.centro, this.umbral1, this.umbral2, this.invertir, this.sinDato,
    ];

    onPreProcess(): void {
        const divergente = this.metodo.value?.value === "divergente";
        this.clases.visible = !divergente;
        this.paleta.visible = !divergente;
        this.paletaDivergente.visible = divergente;
        this.centro.visible = divergente;
        this.umbral1.visible = divergente;
        this.umbral2.visible = divergente;
    }
}

class MapaCard extends Card {
    proyeccion = new formattingSettings.ItemDropdown({
        name: "proyeccion", displayName: "Proyección", items: PROYECCIONES, value: PROYECCIONES[0],
    });
    borde = new formattingSettings.ColorPicker({ name: "borde", displayName: "Color de los límites", value: { value: "#d6d6d6" } });
    grosor = new formattingSettings.NumUpDown({ name: "grosor", displayName: "Grosor de los límites", value: 0.8 });

    name = "mapa";
    displayName = "Mapa";
    slices: Slice[] = [this.proyeccion, this.borde, this.grosor];
}

class GruposCard extends Card {
    contorno = new formattingSettings.ToggleSwitch({ name: "contorno", displayName: "Contorno de cada grupo", value: true });
    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Color del contorno", value: { value: "#3b3a39" } });
    grosor = new formattingSettings.NumUpDown({ name: "grosor", displayName: "Grosor del contorno", value: 1.6 });
    limitesInternos = new formattingSettings.ToggleSwitch({
        name: "limitesInternos", displayName: "Límites dentro de cada grupo",
        description: "Apágalo para que cada grupo se vea como una sola área (útil si la medida da el valor del grupo).",
        value: true,
    });

    name = "grupos";
    displayName = "Grupos";
    slices: Slice[] = [this.contorno, this.color, this.grosor, this.limitesInternos];
}

class LeyendaCard extends Card {
    mostrar = new formattingSettings.ToggleSwitch({ name: "mostrar", displayName: "Mostrar", value: true });
    posicion = new formattingSettings.ItemDropdown({ name: "posicion", displayName: "Posición", items: POSICIONES, value: POSICIONES[0] });
    titulo = new formattingSettings.TextInput({
        name: "titulo", displayName: "Título", placeholder: "Nombre de la medida", value: "",
    });
    tamano = new formattingSettings.NumUpDown({ name: "tamano", displayName: "Tamaño del texto", value: 11 });

    name = "leyenda";
    displayName = "Leyenda";
    topLevelSlice = this.mostrar;
    slices: Slice[] = [this.posicion, this.titulo, this.tamano];
}

export class Ajustes extends Model {
    colores = new ColoresCard();
    mapa = new MapaCard();
    grupos = new GruposCard();
    leyenda = new LeyendaCard();
    cards = [this.colores, this.mapa, this.grupos, this.leyenda];
}
