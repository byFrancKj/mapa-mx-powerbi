# ejemplo/powerbi/

Lugar para el reporte de ejemplo como **proyecto de Power BI** (*Archivo › Guardar como › Archivos de proyecto de Power BI (.pbip)*), armado con los datos ficticios de `ejemplo/`.

El formato `.pbip` guarda el modelo y el reporte como texto. El `.gitignore` excluye la caché local (`.pbi/cache.abf` y `.pbi/localSettings.json`), que contiene datos.

Tus reportes internos **no** van aquí: guárdalos en `privado/` (git la ignora). `scripts/revisar_datos.py` rechaza proyectos de Power BI fuera de esta carpeta.

Antes de subir el reporte de ejemplo:

- Comprueba que apunte a los **datos de ejemplo** y no a tus archivos reales.
- Deja los parámetros `RutaProyecto` y `RutaMapeo` con rutas genéricas (por ejemplo `C:\mapa-mx-powerbi\`): las rutas pueden revelar nombres de servidores o carpetas internas.
