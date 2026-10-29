# 02 · Puente INEGI

El visual solo necesita una columna con la clave INEGI. Si tus datos ya la traen, no necesitas nada de esto. El puente sirve cuando llegan **por tienda, por zona propia o con el nombre del estado escrito de mil formas**.

## Qué incluye

| Archivo | Contenido |
|---|---|
| `puente-inegi/catalogos/dim_geo.csv` | 32 estados: clave, nombre oficial y corto, abreviatura, ISO 3166-2, población 2020 y un punto interior. |
| `puente-inegi/catalogos/dim_municipio.csv` | 2,475 municipios y una fila `XX000` "sin municipio" por estado, para datos que solo llegan a nivel estatal. |
| `puente-inegi/alias_estados.csv` | Más de 100 formas de escribir los estados ("Edo. de México", "CDMX", "Nuevo Leon", "MX-JAL"…), ya normalizadas. |
| `puente-inegi/powerquery/` | Parámetros, funciones, dimensiones y la consulta de control. |

## Armarlo en Power Query

Para cada bloque de `puente-inegi/powerquery/`: *Nueva fuente › Consulta en blanco › Editor avanzado*, pega el código y renombra la consulta **exactamente** como se indica.

| Archivo | Consultas | ¿Cargar? |
|---|---|---|
| `00_Parametros.pq` | `RutaProyecto`, `RutaMapeo` | No |
| `01_Funciones.pq` | `Funciones` | No |
| `02_Dimensiones_INEGI.pq` | `Dim_Geo`, `Dim_Municipio` | Sí |
| `03_Controles.pq` | `Control_Ubicaciones` | No |

- `RutaProyecto`: la carpeta del repositorio, por ejemplo `C:\mapa-mx-powerbi\`.
- `RutaMapeo`: la ruta **completa** de tu archivo de mapeo. El real va en `privado\` o fuera del repositorio, nunca en una carpeta que subas a GitHub.

Después relaciona tus hechos con `Dim_Municipio[CVEGEO]` (o directo con `Dim_Geo[CVE_ENT]`) y `Dim_Municipio[CVE_ENT]` con `Dim_Geo[CVE_ENT]`, en relaciones de varios a uno con filtro en una sola dirección.

## Llevar cada fuente a claves INEGI

Por cada fuente crea una consulta que la lleve al formato estándar con `Funciones[Estandarizar]`:

```m
Estandar = Funciones[Estandarizar](
    Origen,
    "Mi Cadena",
    [FECHA = "Fecha Venta", UBICACION = "Sucursal", UPC = "EAN", UNIDADES = "Pzas", VENTAS = "Venta Neta"],
    "es-MX",     // cultura del archivo: "es-MX" para 31/01/2026, "en-US" para 2026-01-31
    "tienda"     // qué es UBICACION: "tienda", "estado", "municipio" o "auto"
)
```

Junta todas en una consulta **`Cadenas`** con `Table.Combine({...})`. Tu tabla de hechos y `Control_Ubicaciones` leen de ahí, así que una fuente nueva se agrega en un solo lugar. Ejemplo completo en `ejemplo/powerquery/`.

`Funciones[ResolverUbicaciones]` trabaja sobre las ubicaciones únicas:

1. **El mapeo manda.** Si la ubicación está en tu archivo de mapeo, se usa lo que dice: su `CVEGEO`, o el estado (municipio `XX000`) si `CVEGEO` va vacío.
2. Si no está en el mapeo, según el **tipo de ubicación**:

| Tipo | Qué intenta |
|---|---|
| `tienda` | Nada más: una tienda sin mapear se reporta en el control. Un ID numérico nunca se toma como clave INEGI por accidente. |
| `estado` | Nombre del estado (alias) o clave de 1-2 dígitos. |
| `municipio` | Clave numérica: 4-5 dígitos es municipio (`1002` → `01002`) y 1-2 dígitos es estado. |
| `auto` | Todo lo anterior. Úsalo solo si sabes que tus IDs no se parecen a claves INEGI. |

Antes de comparar, el texto se normaliza: mayúsculas, sin acentos ni puntuación.

### El archivo de mapeo

```csv
CADENA,UBICACION,CVE_ENT,CVEGEO
Mi Cadena,SUC-0101,14,14039
Mi Cadena,SUC-0102,14,14120
Otra Cadena,Zona Bajío Norte,11,
```

- `CADENA` debe coincidir con el nombre que pusiste en `Estandarizar`.
- `CVEGEO` es opcional: vacío, la venta va al estado (municipio `XX000`).
- Si tienes **coordenadas** de las tiendas, obtén `CVEGEO` con un cruce punto-en-polígono contra `geo/municipios/mx_municipios.topojson` o, mejor, contra el Marco Geoestadístico original de INEGI (QGIS, GeoPandas o mapshaper).

Revísalo sin subirlo a ningún lado:

```bash
python scripts/validar.py --mapeo privado/mapeo_ubicaciones.csv
```

Detecta claves inexistentes, municipios que no pertenecen al estado indicado y ubicaciones repetidas (también las que solo difieren en guiones o acentos), que duplicarían ventas.

### Control_Ubicaciones

Ábrela en el editor de Power Query después de agregar una fuente. Si tiene filas, hay ubicaciones que no aparecerían en el mapa o caerían en el lugar equivocado:

| Motivo | Qué hacer |
|---|---|
| No se reconoce la ubicación | Agrégala al mapeo o a `alias_estados.csv`. |
| La clave no existe en el catálogo INEGI | Revisa la clave en el origen o en el mapeo. |
| La clave municipal no pertenece al estado indicado | El mapeo tiene `CVE_ENT` y `CVEGEO` inconsistentes. |
| Ubicación repetida en el mapeo | Deja una sola fila por ubicación. |

## Regiones propias

Tus regiones (zonas comerciales, territorios de venta, las de tu proveedor de datos…) son un dato de tu modelo: agrégalas como columna a `Dim_Geo` combinando una tabla `CVE_ENT → REGION`. Así funcionan en segmentaciones, y el visual dibuja su contorno si pones esa columna en el campo *Región*. El ejemplo lo hace en `ejemplo/powerquery/04_Dimensiones.pq`.

Si una región parte un estado (una zona metropolitana que incluye municipios de dos estados), pon la región en `Dim_Municipio` con una tabla `CVEGEO → REGION` y úsala en *Región* con el mapa municipal: el contorno sigue los límites de los municipios. No hay que regenerar geometría en ningún caso.

## Productos y fuentes de mercado

- `Funciones[LlaveUpc]` guarda el UPC como número (`UPC_KEY`), así `0750…` y `750…` son la misma llave.
- Si la fuente de mercado usa su propio código de producto, une una tabla de equivalencias antes de calcular `UPC_KEY`.
- Fuentes que llegan por periodo (bimestres, 4 semanas): usa como fecha el inicio del periodo y compara con columnas de periodo del calendario, no con días sueltos. Filtra filas de total nacional en Power Query.

## Rendimiento con millones de filas

**En Power Query**

- Desactiva *Fecha y hora automáticas* (crea una tabla oculta por cada columna de fecha).
- Lee carpetas con `Folder.Files` y, si puedes, usa **Parquet**: es más rápido que CSV o Excel y conserva tipos.
- Quita columnas que no uses antes de combinar.
- La resolución de ubicaciones trabaja sobre valores únicos, pero las fuentes se recorren dos veces (valores únicos y combinación). Si eso pesa, guarda tus fuentes en Parquet o agrega por mes antes de combinar.
- Desactiva la carga de consultas intermedias (`Funciones`, fuentes individuales, `Cadenas`, controles).

**En el modelo**

- Esquema estrella: hechos con llaves y números, textos en dimensiones.
- Claves INEGI como texto corto y `UPC_KEY` como entero comprimen muy bien. `VENTAS` como decimal fijo ocupa menos.
- Relaciones de una sola dirección.
- El visual recibe una fila por estado, sin importar cuántas filas tenga el modelo: lo que pesa es el cálculo de tus medidas. Revisa tiempos con *Analizador de rendimiento* o DAX Studio.
