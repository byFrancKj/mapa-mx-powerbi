# ejemplo/

**Datos ficticios** para probar el visual y el puente INEGI, generados con `python scripts/generar_datos_ejemplo.py` (semilla fija, el resultado es reproducible). Octubre 2024 a septiembre 2026.

| Archivo | Contenido |
|---|---|
| `cadenas/cadena_a_tiendas.csv` | Venta semanal por **tienda** (`ID_TIENDA`), mapeada en `config/mapeo_ubicaciones.csv`. |
| `cadenas/cadena_b_estados.csv` | Venta semanal por **nombre de estado** escrito de distintas formas, con otros nombres de columna. |
| `cadenas/cadena_c_municipios.csv` | Venta semanal por **clave municipal** que llega como número (sin el cero inicial). |
| `mercado/mercado_regiones.csv` | Venta mensual por **región** de una fuente de mercado independiente. |
| `dim_producto.csv` | 12 productos inventados. UPC con prefijo 200 (circulación restringida GS1). |
| `config/` | Mapeo de tiendas y regiones del ejemplo. Las regiones son una agrupación de ejemplo: cámbiala por la tuya. |
| `powerquery/`, `dax/` | Consultas y medidas del modelo de demostración. |
| `valores_esperados.csv` | Lo que debe dar el modelo armado (lo genera `scripts/modelo_referencia.py`). |

Ninguna cadena, tienda, marca o cifra es real. Guía: [docs/03-ejemplo.md](../docs/03-ejemplo.md).
