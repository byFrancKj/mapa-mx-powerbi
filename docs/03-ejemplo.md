# 03 · Ejemplo

Un modelo de demostración completo con **datos ficticios**: tres cadenas con formatos de origen distintos y una fuente de mercado por región (simula una extracción de Nielsen). Sirve para ver el visual funcionando y como plantilla de tu propio modelo.

## Qué simula

| Archivo | Formato |
|---|---|
| `ejemplo/cadenas/cadena_a_tiendas.csv` | Venta semanal por **tienda**. Las tiendas se mapean en `ejemplo/config/mapeo_ubicaciones.csv`. |
| `ejemplo/cadenas/cadena_b_estados.csv` | Venta semanal por **nombre de estado** escrito de distintas formas, con otros nombres de columna. |
| `ejemplo/cadenas/cadena_c_municipios.csv` | Venta semanal por **clave municipal** que llega como número (sin el cero inicial). |
| `ejemplo/nielsen/nielsen_regiones.csv` | Venta mensual por **región**, fuente independiente de las cadenas. |
| `ejemplo/dim_producto.csv` | 12 productos inventados. UPC con prefijo 200 (circulación restringida de GS1). |
| `ejemplo/config/regiones_*.csv` | Una agrupación de regiones de ejemplo. **No** es la definición de NielsenIQ. |

Octubre 2024 a septiembre 2026. Se regeneran igual con `python scripts/generar_datos_ejemplo.py` (semilla fija).

## Armarlo

1. *Archivo › Opciones › Archivo actual › Carga de datos*: desactiva **Fecha y hora automáticas**.
2. Pega las consultas del [puente INEGI](02-puente-inegi.md) (`00_Parametros` y `01_Funciones`). Deja `RutaMapeo` apuntando a `ejemplo\config\mapeo_ubicaciones.csv`.
3. Pega las del ejemplo, en orden:

| Archivo | Consultas | ¿Cargar? |
|---|---|---|
| `ejemplo/powerquery/01_Cadenas_origen.pq` | `Cadena_A`, `Cadena_B`, `Cadena_C`, `Cadenas` | No |
| `ejemplo/powerquery/02_Fact_Cadenas.pq` | `Fact_Cadenas` | Sí |
| `ejemplo/powerquery/03_Fact_Nielsen.pq` | `Fact_Nielsen` | Sí |
| `ejemplo/powerquery/04_Dimensiones.pq` | `Dim_Geo`, `Dim_Municipio`, `Dim_Region`, `Dim_Producto`, `_Medidas` | Sí |
| `puente-inegi/powerquery/03_Controles.pq` | `Control_Ubicaciones` | No |
| `ejemplo/powerquery/05_Control_Nielsen.pq` | `Control_Nielsen` | No |

   El `Dim_Geo` del ejemplo es el del puente más la región de cada estado; no pegues también el de `02_Dimensiones_INEGI.pq`. Antes de cerrar, abre `Control_Ubicaciones`: debe estar vacía.

4. *Modelado › Nueva tabla*: pega [`ejemplo/dax/tablas.dax`](../ejemplo/dax/tablas.dax) desde `Dim_Calendario =` y márcala como tabla de fechas.
5. Relaciones (varios a uno, una sola dirección):

| Desde (varios) | Hacia (uno) |
|---|---|
| `Fact_Cadenas[CVEGEO]` | `Dim_Municipio[CVEGEO]` |
| `Dim_Municipio[CVE_ENT]` | `Dim_Geo[CVE_ENT]` |
| `Dim_Geo[REGION_NIELSEN]` | `Dim_Region[REGION_NIELSEN]` |
| `Fact_Nielsen[REGION_NIELSEN]` | `Dim_Region[REGION_NIELSEN]` |
| `Fact_Cadenas[UPC_KEY]` y `Fact_Nielsen[UPC_KEY]` | `Dim_Producto[UPC_KEY]` |
| `Fact_Cadenas[FECHA]` y `Fact_Nielsen[FECHA]` | `Dim_Calendario[Fecha]` |

6. *Vista de consultas DAX*: pega [`ejemplo/dax/medidas.dax`](../ejemplo/dax/medidas.dax), clic en **Actualizar modelo con cambios** y ejecuta (F5). El resultado debe coincidir con [`ejemplo/valores_esperados.csv`](../ejemplo/valores_esperados.csv) (ene-sep 2026 contra ene-sep 2025). Si coincide, el modelo está bien armado.
7. Ordena `Dim_Region[REGION_NIELSEN]` por `ORDEN` y `Dim_Calendario[Nombre Mes]` por `Mes` (*Herramientas de columnas › Ordenar por columna*).

## El visual con las medidas del ejemplo

- **Ubicación**: `Dim_Geo[CVE_ENT]`. Filtra la página por `Dim_Calendario[Año]` para que funcionen los crecimientos.
- **Valor**, según la pregunta:

| Medida | Método sugerido |
|---|---|
| `Ventas Cadenas`, `% Mix Cadenas`, `Ventas Cadenas por 1,000 hab` | Cuantiles |
| `Índice Cadenas vs Nielsen`, `Índice per cápita Cadenas`, `Índice Precio vs Nielsen` | Divergente, centro 100, umbrales 10 y 30 |
| `Crec % Cadenas`, `Crec % Nielsen` | Divergente, centro 0, umbrales 0.02 y 0.08 |
| `Brecha Mix vs Nielsen (pp)` | Divergente, centro 0, umbrales 0.25 y 1 |

Para cambiar de métrica con una segmentación, crea un parámetro de campo con estas medidas ([guía 01](01-usar-el-visual.md#cambiar-de-métrica)).

## Cómo se comparan las fuentes

- **Cadenas y Nielsen son independientes.** La comparación se hace por *distribución geográfica*: qué parte de la venta nacional cae en cada estado o región en cada fuente.
- Nielsen llega por región. A nivel estado hay dos lecturas: `[Ventas Nielsen]` (el total de la región) y `[Ventas Nielsen Estimada]`, que reparte la región entre sus estados por población y, sumada por región, devuelve el dato original.
- Los crecimientos comparan contra el mismo periodo del año anterior. El calendario termina en el último mes con datos; si tus fuentes tienen cortes distintos (una llega a octubre y otra a septiembre), revisa que compares periodos completos de ambas.
