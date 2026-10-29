# Mapa México (INEGI) para Power BI

Objeto visual de Power BI que dibuja México por estado o municipio a partir de la **clave INEGI**. Tú pones el modelo, las relaciones y las medidas; el visual solo trae la geometría de INEGI y colorea cada estado o municipio con la medida que elijas.

![Índice por estado con escala divergente](docs/img/mapa_indice.png)

> Las imágenes usan los **datos ficticios** de la carpeta `ejemplo/`.

## Cómo funciona

```
TU POWER BI                                   EL VISUAL (.pbiviz)
Tus tablas y relaciones                       Solo trae la geometría de INEGI,
  Fact_Ventas ─► Dim_Estado[CVE_ENT]          cada estado con su clave ("01"…"32")
Tus medidas: [Ventas], [Índice]…

En el visual arrastras:
  Ubicación = Dim_Estado[CVE_ENT]   ──►   Power BI calcula tu medida por clave
  Valor     = [Tu medida]                 (con todos tus filtros) y le pasa
                                          una tabla chica:  "14" → 1,234,567
                                                   ▼
                                          El visual busca "14" en su geometría
                                          y pinta Jalisco.
```

- **Cualquier medida**, con su propio formato. Los parámetros de campo funcionan para cambiar de métrica.
- **Estados y municipios**, con drill-down de estado a municipio en el mismo visual.
- **Tus propias regiones**: el visual no trae regiones fijas. Pon tu columna de región en el campo *Región* y dibuja su contorno y su nombre, con una franja del color de cada región si quieres, o pinta cada región de un color. Si cambias las regiones en el modelo, el mapa cambia solo.
- **Mar y países vecinos**: alrededor de México, el mar con líneas de agua y los nombres de los mares (Océano Pacífico, Golfo de México, Golfo de California, Mar Caribe) y de los países vecinos. O sin fondo, si prefieres el del reporte.
- **Se acerca a lo que filtras**: al filtrar una región o un estado (segmentación, filtro, drill-down o un clic en otro visual), el mapa lo muestra en grande, deja de fondo lo demás y abre el panel con su resumen.
- **Panel de detalle**: al seleccionar o filtrar se abre junto al mapa con la comparación de tus fuentes (*Bases a comparar*: diferencia, diferencia % e índice), tarjetas con tus medidas DAX y una tabla por área (un clic en una fila la selecciona en el mapa).
- **Zoom** con la rueda, arrastrando, con botones o con el teclado, y "acercar a la selección".
- **Leyenda** legible (más grande, en lista o en barra) que se reduce sola en visuales chicos.
- **Clasificación** por cuantiles, intervalos iguales o escala divergente alrededor de un centro (100 en índices, 0 en crecimientos), con paletas ColorBrewer y un semáforo rojo · amarillo · verde.
- **Comparar fuentes en el mapa**: colorea por la diferencia (absoluta o en %) entre dos bases, sin escribir otra medida.
- **Mapa bivariado**: con una segunda medida, terciles de una contra terciles de la otra (¿dónde somos fuertes y además crecemos?).
- **Etiquetas** con el valor o el nombre, solo donde caben y sin encimarse.
- **Interacción nativa**: filtro cruzado, resaltado desde otros visuales (el mapa y el panel usan lo resaltado), tooltips (incluidos los de página), menú contextual, teclado y alto contraste.
- **En español e inglés**, según el idioma de Power BI.
- **Seguro**: no se conecta a internet ni guarda nada. Detalle en [SECURITY.md](SECURITY.md).

![Regiones del modelo dibujadas con el campo Región, con el mar y los países vecinos](docs/img/mapa_regiones.png)

![Filtro de la región Occidente: el mapa la muestra en grande y el panel resume la región](docs/img/filtro_region.png)

## Inicio rápido

1. Descarga el `.pbiviz` del último *release* (o compílalo: [docs/04](docs/04-desarrollo.md)).
2. En Power BI: panel *Visualizaciones* › *…* › **Importar un objeto visual desde un archivo**.
3. Arrastra a **Ubicación** una columna con la clave INEGI (`CVE_ENT` de estado o `CVEGEO` de municipio, texto o número) y a **Valor** tu medida. Opcional: tu región en **Región**.
4. Ajusta método, paleta y leyenda en *Formato*.

¿Tus datos no traen la clave INEGI (vienen por tienda o con el nombre del estado)? Usa el [puente INEGI](docs/02-puente-inegi.md).

## Documentación

| Guía | Contenido |
|---|---|
| [01 · Usar el visual](docs/01-usar-el-visual.md) | Campos, claves, panel de formato, interacción y problemas comunes. |
| [02 · Puente INEGI](docs/02-puente-inegi.md) | Catálogos y Power Query para obtener las claves, mapeo de tiendas y regiones propias. |
| [03 · Ejemplo](docs/03-ejemplo.md) | Modelo de demostración con datos ficticios: cadenas contra una fuente de mercado. |
| [04 · Desarrollo](docs/04-desarrollo.md) | Compilar y probar el visual (también desde Mac), publicar versiones y buenas prácticas. |

## Estructura

```
visual/        El objeto visual (TypeScript): código, pruebas y empaquetado
puente-inegi/  Catálogos INEGI y Power Query para obtener las claves (opcional)
ejemplo/       Datos ficticios, consultas, medidas y valores esperados de la demo
geo/           Geometría INEGI de estados y municipios (TopoJSON / GeoJSON)
scripts/       Geometría, validaciones y revisión de datos privados
docs/          Guías e imágenes
privado/       Tus archivos reales: git lo ignora
```

## Hoja de ruta

- [x] **0.1** Estados: cuantiles, intervalos y divergente; leyenda, tooltips, selección y avisos de claves.
- [x] **0.2** Municipios con drill-down y regiones dinámicas (sin regenerar geometría).
- [x] **0.3** Mapa bivariado, etiquetas, resaltado, ícono de advertencia y textos en español e inglés.
- [x] **0.4** Panel de detalle con bases a comparar y tarjetas, zoom, nombres y colores de regiones, colorear por la diferencia entre fuentes y paleta semáforo.
- [x] **0.5** Regiones propias sin nombres fijos, mar y países vecinos con sus nombres, encuadre y panel al filtrar o al hacer clic en otro visual, panel rediseñado y leyenda más grande (también en barra).
- [ ] Certificación en AppSource (opcional: es un trámite con Microsoft; el visual ya cumple sus requisitos técnicos principales).

## Fuentes, licencia y seguridad

- Límites estatales y municipales: Marco Geoestadístico, **INEGI**. Población: Censo de Población y Vivienda 2020, **INEGI**. Países vecinos: **Natural Earth** (dominio público). Detalle en [ATRIBUCION.md](ATRIBUCION.md).
- Código y documentación: [MIT](LICENSE).
- Power BI es marca de Microsoft. Este proyecto no está afiliado a Microsoft ni a ninguna cadena comercial.
- Nunca subas datos reales: ver [SECURITY.md](SECURITY.md) y [CONTRIBUTING.md](CONTRIBUTING.md).
