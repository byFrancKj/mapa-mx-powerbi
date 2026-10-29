# privado/

Carpeta para **tus archivos reales**. Git ignora todo lo que pongas aquí, excepto este archivo.

Úsala para lo que nunca debe llegar a GitHub:

- Tu mapeo de tiendas (`mapeo_ubicaciones.csv`) y tus regiones reales.
- Extracciones de ventas o de proveedores de datos de mercado.
- Tus reportes internos (`.pbip`, `.pbix`).

En Power BI apunta el parámetro `RutaMapeo` a tu archivo, por ejemplo `C:\mapa-mx-powerbi\privado\mapeo_ubicaciones.csv`. Para revisarlo sin subirlo:

```bash
python scripts/validar.py --mapeo privado/mapeo_ubicaciones.csv
```

Si prefieres, guarda estos archivos fuera del repositorio: funciona igual.
