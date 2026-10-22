# puente-inegi/

Lo necesario para obtener claves INEGI cuando tus datos no las traen: catálogos de estados y municipios, formas de escribir los estados y consultas de Power Query. Es opcional: si tus datos ya traen `CVE_ENT`, el visual no necesita nada de aquí.

| Archivo | Contenido | ¿Lo editas? |
|---|---|---|
| `catalogos/dim_geo.csv` | 32 estados: clave, nombres, abreviatura, ISO 3166-2, población 2020 y punto interior. | No: lo genera `npm run geo`. |
| `catalogos/dim_municipio.csv` | 2,475 municipios + una fila `XX000` por estado. | No: lo genera `npm run geo`. |
| `estados.csv` | Nombres, ISO y población de los 32 estados (insumo de los catálogos). | Rara vez. |
| `alias_estados.csv` | Formas de escribir cada estado, ya normalizadas (mayúsculas, sin acentos ni puntuación). | Agrega las que encuentres. |
| `powerquery/` | Parámetros, funciones, dimensiones y consulta de control. | Solo las rutas. |

Tu archivo de mapeo de tiendas **no** va aquí: guárdalo en `privado/` o fuera del repositorio y apunta el parámetro `RutaMapeo` a él. Guía: [docs/02-puente-inegi.md](../docs/02-puente-inegi.md).

Las claves INEGI son texto: `CVE_ENT` de 2 dígitos ("09") y `CVEGEO` de 5 ("09015"). Si abres estos CSV en Excel, impórtalos como texto para no perder los ceros.
