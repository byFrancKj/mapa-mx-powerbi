# powerbi/

Guarda aquí tu reporte como **proyecto de Power BI** (*Archivo › Guardar como › Archivos de proyecto de Power BI (.pbip)*).

El formato `.pbip` guarda el modelo y el reporte como texto, así que Git muestra qué cambió y la comunidad puede abrirlo directo en Power BI Desktop. El `.gitignore` del repositorio ya excluye la caché local (`.pbi/cache.abf` y `.pbi/localSettings.json`), que puede contener tus datos.

Antes de subirlo:

- Comprueba que el modelo apunte a los **datos de ejemplo** y no a tus archivos reales.
- Cambia el parámetro `RutaProyecto` a una ruta genérica (por ejemplo `C:\mapa-ventas-mx-powerbi\`).
