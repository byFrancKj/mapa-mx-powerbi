# Fuentes de datos y atribución

## Geometría

- **Límites municipales y estatales**: Marco Geoestadístico, Instituto Nacional de Estadística y Geografía (**INEGI**). Se usó la capa municipal en la versión publicada por CONABIO (2023) y compilada en GeoJSON en [PhantomInsights/mexico-geojson](https://github.com/PhantomInsights/mexico-geojson) (licencia MIT, carpeta `2023`).
- Procesamiento de este proyecto (`scripts/construir_geo.mjs`, con [mapshaper](https://github.com/mbloch/mapshaper)): corrección de huecos y traslapes, disolución a estados y regiones, simplificación con preservación de topología (800 m para estados y regiones, 400 m para municipios) y cálculo de un punto interior por área.
- Los límites simplificados sirven para visualización. Para análisis espacial preciso usa el Marco Geoestadístico original de INEGI.

## Población

- **Censo de Población y Vivienda 2020**, INEGI. Población total por entidad federativa (126,014,024 habitantes en total).

## Términos de uso de INEGI

La información de INEGI es de libre uso conforme a sus *Términos de Libre Uso de la Información del INEGI*, siempre que se cite la fuente. Al redistribuir o publicar mapas hechos con este proyecto, incluye una nota como:

> Fuente: INEGI, Marco Geoestadístico y Censo de Población y Vivienda 2020.

## Datos de ejemplo

Todo lo que está en `ejemplo/` y en `config/mapeo_ubicaciones.csv` es **ficticio**, generado por `scripts/generar_datos_ejemplo.py`. "Cadena A", "Cadena B" y "Cadena C", sus tiendas, marcas y productos no existen. Los UPC usan el prefijo 200 (rango de circulación restringida de GS1) para no coincidir con productos reales.

Las regiones de `config/regiones_estado.csv` son una agrupación de ejemplo y **no** corresponden a la definición de regiones de NielsenIQ.

## Marcas

Nielsen y NielsenIQ son marcas de sus respectivos titulares. Power BI es marca de Microsoft. Este proyecto no está afiliado, patrocinado ni respaldado por ninguna de ellas ni por cadenas comerciales.

## Software

- [Deneb](https://deneb-viz.github.io/) (MIT) y [Vega / Vega-Lite](https://vega.github.io/) (BSD-3-Clause) para los mapas.
- Paleta bivariada 3×3 basada en el trabajo de Joshua Stevens sobre mapas bivariados.
