# 04 · Municipios y rendimiento

## Mapa municipal

![Venta de las cadenas por municipio en Jalisco](img/municipios_jalisco.png)

Hay una especificación por estado y una nacional en `deneb/municipios/`:

| Archivo | Peso | Uso |
|---|---|---|
| `mapa_municipios_XX.json` (`XX` = clave del estado) | 20–230 KB | Un estado; carga al instante. |
| `mapa_municipios_nacional.json` | ~1.2 MB | Los 2,475 municipios con contorno estatal. El editor de Deneb tarda unos segundos en abrirla. |

Campos del visual:

| Campo en Deneb | Origen |
|---|---|
| `CVEGEO` | `Dim_Municipio[CVEGEO]` (texto de 5 dígitos) |
| `MUNICIPIO` | `Dim_Municipio[MUNICIPIO]` |
| `Valor Mapa` | medida |
| `Valor Mapa Texto` | medida |
| `Config Mapa` | medida |

La versión por estado solo dibuja los municipios de ese estado aunque el visual reciba los de todo el país. Los quintiles se calculan solo con los municipios dibujados. Aun así conviene filtrar la página por el estado para que Deneb reciba menos filas.

**Qué métricas existen por municipio.** Las que solo usan venta de las cadenas: ventas, unidades, % de la venta nacional, crecimiento y precio (columna `MUNICIPAL = true` del selector). Las que dependen de **población** o de **Nielsen** quedan vacías: Nielsen no tiene dato municipal y el kit solo trae población estatal. Para métricas per cápita municipales agrega población municipal (INEGI, Censo 2020, ITER) a `Dim_Municipio` y una medida equivalente.

**Qué cadenas aparecen.** Solo las que tienen ubicación municipal (por tienda mapeada o por clave). Las que reportan por estado van al municipio comodín `XX000`, que existe en el modelo pero no se dibuja.

**Filtro cruzado.** Deneb permite seleccionar hasta 250 elementos; en estados con muchos municipios (Oaxaca tiene 570) selecciona por región o con segmentaciones.

## Rendimiento con millones de filas

El mapa en sí es ligero: Deneb recibe 32 filas por estado o alrededor de 2,500 por municipio, sin importar cuántas filas tenga el modelo. Lo que pesa es la **carga** y el **cálculo de medidas**. Recomendaciones para 4 millones de filas de UPC o más:

**En Power Query**

- Desactiva *Fecha y hora automáticas* (crea una tabla oculta por cada columna de fecha).
- Lee carpetas de archivos con `Folder.Files` y, si puedes, usa **Parquet** en lugar de CSV o Excel: es más rápido de leer y conserva tipos.
- Quita columnas que no uses antes de combinar.
- La resolución de ubicaciones ya trabaja sobre valores únicos y se une una sola vez: no la conviertas en una búsqueda fila por fila.
- `AgruparPorMunicipio = true` en `Fact_Cadenas` suma tiendas del mismo municipio, fecha y UPC. Si las cadenas reportan por tienda, reduce muchas filas.
- Si solo analizas por mes, agrupa también la fecha al primer día del mes.
- Desactiva la carga de consultas intermedias (`Funciones`, `Cadena_*`, `Control_*`).

**En el modelo**

- Esquema estrella: hechos con llaves y números; textos descriptivos en dimensiones.
- `UPC_KEY` como entero y claves INEGI como texto corto comprimen muy bien.
- `VENTAS` como decimal fijo (Currency) ocupa menos y suma más rápido.
- Relaciones de una sola dirección. No actives filtros bidireccionales.

**En las medidas**

- Las medidas iteran a lo mucho sobre los 32 estados (`SUMX` del reparto Nielsen y el índice de cobertura), nunca sobre filas de hechos.
- Los quintiles y la leyenda se calculan en Deneb, no en DAX. Calcular percentiles en DAX por municipio costaría millones de evaluaciones.
- Para revisar tiempos: *Optimizar › Analizador de rendimiento*, o *DAX Studio* con *Server Timings*.

**Si aún es lento**

- Una tabla agregada (`Fact_Cadenas_Mes`: mes × municipio × UPC) para los mapas y la tabla detallada solo para análisis por semana.
- Modo de almacenamiento compuesto con agregaciones, si migras a un modelo publicado.
