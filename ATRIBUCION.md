# Fuentes de datos y atribución

## Geometría

- **Límites municipales y estatales**: Marco Geoestadístico, Instituto Nacional de Estadística y Geografía (**INEGI**). Se usó la capa municipal en la versión publicada por CONABIO (2023) y compilada en GeoJSON en [PhantomInsights/mexico-geojson](https://github.com/PhantomInsights/mexico-geojson) (licencia MIT, carpeta `2023`).
- Procesamiento de este proyecto (`scripts/construir_geo.mjs`, con [mapshaper](https://github.com/mbloch/mapshaper)): corrección de huecos y traslapes, disolución a estados, simplificación con preservación de topología (800 m para estados, 400 m para municipios) y cálculo de un punto interior por área.
- Los límites simplificados sirven para visualización. Para análisis espacial preciso usa el Marco Geoestadístico original de INEGI.
- **Países vecinos** (el fondo del mapa): [Natural Earth](https://www.naturalearthdata.com/), escala 1:10m, de dominio público, en la versión TopoJSON del paquete [world-atlas](https://github.com/topojson/world-atlas) de Mike Bostock (ISC). `scripts/construir_contexto.mjs` toma la tierra de los demás países, la simplifica (2.5 km) y la recorta con el México de INEGI, para que el mar llegue exactamente a su costa.

## Población

- **Censo de Población y Vivienda 2020**, INEGI. Población total por entidad federativa (126,014,024 habitantes en total).

## Términos de uso de INEGI

La información de INEGI es de libre uso conforme a sus *Términos de Libre Uso de la Información del INEGI*, siempre que se cite la fuente. Al publicar reportes hechos con este visual, incluye una nota como:

> Fuente: INEGI, Marco Geoestadístico y Censo de Población y Vivienda 2020.

## Datos de ejemplo

Todo lo que está en `ejemplo/` es **ficticio**, generado por `scripts/generar_datos_ejemplo.py`. "Cadena A", "Cadena B" y "Cadena C", sus tiendas, marcas y productos no existen. Los UPC usan el prefijo 200 (rango de circulación restringida de GS1) para no coincidir con productos reales.

Las regiones de `ejemplo/config/regiones_estado.csv` son una agrupación de ejemplo: cada quien define las suyas en su modelo.

## Marcas

Power BI es marca de Microsoft. Este proyecto no está afiliado, patrocinado ni respaldado por Microsoft ni por cadenas comerciales.

## Software incluido en el visual

- [d3-geo, d3-selection y d3-scale-chromatic](https://d3js.org) (ISC), [topojson-client](https://github.com/topojson/topojson-client) (ISC).
- Tierra de los países vecinos: Natural Earth (dominio público), vía world-atlas (ISC).
- Paletas de [ColorBrewer](https://colorbrewer2.org), de Cynthia A. Brewer, Penn State (Apache 2.0), vía d3-scale-chromatic.
- Bibliotecas de Microsoft para visuales de Power BI: `powerbi-visuals-api`, `powerbi-visuals-utils-formattingmodel` y `powerbi-visuals-utils-formattingutils` (MIT).
