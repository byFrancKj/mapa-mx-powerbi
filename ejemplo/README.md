# ejemplo/

**Datos ficticios** para probar el kit, generados con `python scripts/generar_datos_ejemplo.py` (semilla fija, el resultado es reproducible). Octubre 2024 a septiembre 2026.

| Archivo | Formato que simula |
|---|---|
| `cadenas/cadena_a_tiendas.csv` | Venta semanal por **tienda** (`ID_TIENDA`). Las tiendas se relacionan con INEGI en `config/mapeo_ubicaciones.csv`. |
| `cadenas/cadena_b_estados.csv` | Venta semanal por **nombre de estado** escrito de distintas formas ("Edo. de México", "CDMX", "Nuevo Leon"), con otros nombres de columna (`SEMANA`, `PIEZAS`, `VENTA_NETA`). |
| `cadenas/cadena_c_municipios.csv` | Venta semanal por **clave municipal INEGI** que llega como número (sin cero inicial). |
| `nielsen/nielsen_regiones.csv` | Venta mensual por **región** de una fuente de mercado independiente. |
| `dim_producto.csv` | 12 productos inventados en 3 categorías. UPC con prefijo 200 (circulación restringida GS1). |

Ninguna cadena, tienda, marca o cifra es real.
