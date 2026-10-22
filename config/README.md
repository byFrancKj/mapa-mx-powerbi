# config/

Lo que adaptas a tu proyecto. Después de editar regiones ejecuta `npm run geo` y `python scripts/validar.py`.

| Archivo | Qué contiene | ¿Lo editas? |
|---|---|---|
| `estados.csv` | Clave INEGI, nombre oficial, nombre corto, abreviatura, código ISO 3166-2 y población 2020 de los 32 estados. | Rara vez. |
| `regiones_estado.csv` | Región Nielsen de cada estado. **Las incluidas son un ejemplo.** | Sí: pon tu definición. |
| `regiones_orden.csv` | Orden de las regiones en leyendas y tablas. | Sí, si cambias regiones. |
| `regiones_municipio.csv` | Municipios asignados a una región distinta a la de su estado (áreas que parten estados). Vacío por defecto; ver `regiones_municipio.ejemplo.csv`. | Solo si lo necesitas. |
| `alias_estados.csv` | Formas de escribir cada estado, ya normalizadas (mayúsculas, sin acentos ni puntuación). | Agrega las que encuentres en tus archivos. |
| `mapeo_ubicaciones.csv` | Relación de ubicaciones propias de cada cadena (tienda, sucursal, zona) con `CVE_ENT` y, opcionalmente, `CVEGEO`. Trae las tiendas ficticias de "Cadena A". | Sí: aquí relacionas tus cadenas. |

Las claves INEGI son texto: `CVE_ENT` de 2 dígitos ("09") y `CVEGEO` de 5 ("09015"). Si abres estos CSV en Excel, impórtalos como texto para no perder los ceros.
