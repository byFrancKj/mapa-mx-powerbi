# 03 · Adaptar a tu proyecto

El kit separa **lo que cambia en cada proyecto** (tus archivos y tu configuración) de **lo que no** (geometría, medidas y mapas). Casi todo se adapta editando archivos de `config/` y unas cuantas líneas de Power Query.

## 1. Conectar tus cadenas

Cada cadena entrega su información distinto. El modelo solo necesita seis campos estándar:

| Campo | Qué es |
|---|---|
| `CADENA` | Nombre con el que la quieres ver (lo pones tú en la consulta). |
| `FECHA` | Día de venta o inicio de la semana. |
| `UBICACION` | Lo que identifique dónde se vendió: ID de tienda, nombre del estado o clave INEGI. |
| `UPC` | Código de barras. |
| `UNIDADES` | Piezas. |
| `VENTAS` | Importe. |

Por cada cadena crea una consulta como las de [`powerquery/02_Cadenas_origen.pq`](../powerquery/02_Cadenas_origen.pq): cambia la ruta del archivo y el registro que dice qué columna de su archivo es cada campo.

```m
Estandar = Funciones[Estandarizar](
    Origen,
    "Mi Cadena",
    [FECHA = "Fecha Venta", UBICACION = "Sucursal", UPC = "EAN", UNIDADES = "Pzas", VENTAS = "Venta Neta"],
    "es-MX"   // cultura del archivo: "es-MX" para 31/01/2026, "en-US" para 2026-01-31
)
```

Después agrégala a la lista de `Fact_Cadenas`:

```m
Fuentes = Table.Combine({Cadena_A, Cadena_B, Cadena_C, Mi_Cadena}),
```

Y quita las de ejemplo cuando ya no las necesites.

### Relacionar cada cadena con la clave INEGI

`Funciones[ResolverUbicaciones]` intenta, en este orden:

1. **Mapeo explícito** en [`config/mapeo_ubicaciones.csv`](../config/mapeo_ubicaciones.csv). Es lo que usas cuando la cadena reporta por tienda o con códigos propios.
2. **Clave numérica**: 4 o 5 dígitos se toman como municipio (`CVEGEO`, se completa el cero inicial: `1002` → `01002`); 1 o 2 dígitos, como estado.
3. **Nombre de estado** con [`config/alias_estados.csv`](../config/alias_estados.csv), que ya reconoce más de 100 variantes ("Edo. de México", "EDOMEX", "Distrito Federal", "Nuevo Leon", "MX-JAL"…). Antes de buscar se normaliza el texto: mayúsculas, sin acentos ni puntuación.

`config/mapeo_ubicaciones.csv`:

```csv
CADENA,UBICACION,CVE_ENT,CVEGEO
Mi Cadena,SUC-0101,14,14039
Mi Cadena,SUC-0102,14,14120
Otra Cadena,Zona Bajío Norte,11,
```

- `CVEGEO` es opcional. Si lo dejas vacío, la venta va al estado (municipio comodín `XX000`) y aparece en el mapa estatal pero no en el municipal.
- El nombre de la cadena debe ser el mismo que pusiste en `Funciones[Estandarizar]`.
- Los catálogos de claves están en [`catalogos/dim_geo.csv`](../catalogos/dim_geo.csv) y [`catalogos/dim_municipio.csv`](../catalogos/dim_municipio.csv).

Si tienes las **coordenadas** de las tiendas, obtienes `CVEGEO` con un cruce punto-en-polígono contra `geo/municipios/mx_municipios.topojson` o, mejor, contra el Marco Geoestadístico original de INEGI (QGIS, GeoPandas o mapshaper).

Después de agregar una cadena abre la consulta `Control_Ubicaciones`: si tiene filas, esas ubicaciones no se reconocieron. Agrégalas al mapeo o a los alias y vuelve a actualizar. Para revisar los archivos de configuración fuera de Power BI: `python scripts/validar.py`.

## 2. Tus regiones Nielsen

Las regiones incluidas son **un ejemplo** y no corresponden a la definición oficial de Nielsen. Reemplázalas con la de tu contrato.

1. Edita [`config/regiones_estado.csv`](../config/regiones_estado.csv): una región para cada uno de los 32 estados. Los nombres deben ser **idénticos** a los de tu extracción de Nielsen.
2. Ordena las regiones para leyendas y tablas en [`config/regiones_orden.csv`](../config/regiones_orden.csv).
3. Si un área Nielsen **parte un estado** (por ejemplo, una zona metropolitana que incluye municipios de dos estados), asigna esos municipios en [`config/regiones_municipio.csv`](../config/regiones_municipio.csv). Hay un ejemplo en `regiones_municipio.ejemplo.csv`.
4. Regenera geometría, catálogos y especificaciones:

   ```bash
   npm install
   npm run geo
   python scripts/validar.py
   ```

5. En Power BI: actualiza los datos y vuelve a pegar las especificaciones de `deneb/` en cada visual (la geometría de regiones va dentro).

**Estados divididos entre regiones.** El mapa de regiones dibujará el límite exacto. En el modelo estatal cada estado queda en la región de `regiones_estado.csv` (marcado con `REGION_DIVIDIDA = 1` en `Dim_Geo`). Si necesitas que la venta de las cadenas siga el límite municipal:

1. Cambia la relación `Dim_Geo[REGION_NIELSEN] → Dim_Region` por `Dim_Municipio[REGION_NIELSEN_MUN] → Dim_Region`.
2. Considera que el reparto de Nielsen por población (`[Ventas Nielsen Estimada]`) sigue siendo estatal. Para repartir a nivel municipio necesitas población municipal (INEGI, Censo 2020, ITER).

## 3. Tu extracción de Nielsen

En [`powerquery/04_Fact_Nielsen.pq`](../powerquery/04_Fact_Nielsen.pq) cambia la ruta y el registro `Columnas`. Nielsen se carga **por región**, con `FECHA` = primer día del periodo.

- **Periodos bimestrales o de 4 semanas**: usa como `FECHA` el inicio de cada periodo y compara las fuentes con columnas de periodo del calendario (`Año-Mes`, `Año-Bimestre`), no con días.
- **Periodos que no coinciden con meses** (por ejemplo, bimestres dic-ene): agrega a `Dim_Calendario` una columna con tu periodo y úsala en las segmentaciones.
- **Total México** u otras filas que no sean región: fíltralas en Power Query; si no, aparecerán en `Control_Nielsen`.

## 4. Productos

[`powerquery/05_Dimensiones.pq`](../powerquery/05_Dimensiones.pq) lee `Dim_Producto` de un CSV. Cámbialo por tu catálogo con al menos `UPC`; las demás columnas (marca, categoría, fabricante…) son libres.

- El UPC se guarda como número (`UPC_KEY`), así `0750…` y `750…` son la misma llave.
- Si Nielsen usa su propio código de producto, agrega una tabla de equivalencias (código Nielsen → UPC) y únela en `Fact_Nielsen` antes de calcular `UPC_KEY`.
- Para comparar contra Nielsen filtra por producto, marca o categoría: el precio promedio de muchos UPC mezclados mide la mezcla, no el precio.

## 5. Métricas nuevas

1. Crea la medida (en `dax/medidas.dax` o directamente en Power BI).
2. Agrega una fila a `Selector Métrica` en [`powerquery/06_Selectores.pq`](../powerquery/06_Selectores.pq): número de `ORDEN` nuevo, escala, centro, umbrales y formato.
3. Agrega el caso a `[Valor Mapa]` (y a `[Valor Mapa 2]` si la quieres en el bivariado):

   ```dax
   15, [Mi Métrica Nueva]
   ```

No hay que tocar Deneb: color, leyenda y textos salen de la fila del selector.

## 6. Nombres

"Cadenas" y "Nielsen" solo aparecen en nombres de medidas, en el selector y en los encabezados del comparativo. Para un proyecto con una sola cadena puedes renombrar las medidas en Power BI (Deneb no las usa por nombre, salvo `Valor Mapa`, `Valor Mapa Texto`, `Config Mapa` y las del comparativo) y cambiar los encabezados en `comparativoRegiones()` de `scripts/construir_deneb.mjs`.
