# 01 · Armado paso a paso

Al terminar tendrás el modelo con los datos de ejemplo y el mapa de estados funcionando. Después cambias las fuentes por las tuyas ([guía 03](03-adaptar-a-tu-proyecto.md)).

**Requisitos:** Power BI Desktop reciente (con *Vista de consultas DAX*) y el visual **Deneb** desde AppSource.

## 1. Preparar Power BI Desktop

1. Descarga o clona el repositorio, por ejemplo en `C:\mapa-ventas-mx-powerbi\`.
2. *Archivo › Opciones › Archivo actual › Carga de datos*: desactiva **Fecha y hora automáticas**. Con millones de filas esto ahorra mucha memoria.
3. *Insertar › Más objetos visuales › Desde AppSource*: busca **Deneb** y agrégalo.

## 2. Power Query

Abre *Transformar datos*. Para cada bloque de `powerquery/`: *Nueva fuente › Consulta en blanco › Editor avanzado*, pega el código y renombra la consulta **exactamente** como se indica.

| Orden | Archivo | Consulta | ¿Cargar al modelo? |
|---|---|---|---|
| 1 | `00_RutaProyecto.pq` | `RutaProyecto` (parámetro; cambia la ruta, debe terminar en `\`) | No |
| 2 | `01_Funciones.pq` | `Funciones` | No |
| 3 | `02_Cadenas_origen.pq` | `Cadena_A`, `Cadena_B`, `Cadena_C` | No |
| 4 | `03_Fact_Cadenas.pq` | `Fact_Cadenas` | Sí |
| 5 | `04_Fact_Nielsen.pq` | `Fact_Nielsen` | Sí |
| 6 | `05_Dimensiones.pq` | `Dim_Geo`, `Dim_Municipio`, `Dim_Region`, `Dim_Producto` | Sí |
| 7 | `06_Selectores.pq` | `Selector Métrica`, `Selector Métrica 2`, `Selector Comparación`, `_Medidas` | Sí |
| 8 | `07_Controles.pq` | `Control_Ubicaciones`, `Control_Nielsen` | No |

Para no cargar una consulta: clic derecho › desmarca **Habilitar carga**.

Antes de cerrar abre `Control_Ubicaciones`: con los datos de ejemplo debe estar vacía. *Cerrar y aplicar*.

## 3. Tabla calendario

*Modelado › Nueva tabla*, pega el contenido de [`dax/tablas.dax`](../dax/tablas.dax) desde `Dim_Calendario =`. Luego *Herramientas de tabla › Marcar como tabla de fechas* con la columna `Fecha`.

## 4. Relaciones

En la vista de modelo, revisa que existan estas relaciones (varios a uno, filtro en una sola dirección). Power BI detecta algunas solo; borra cualquier otra que haya creado.

| Desde (varios) | Hacia (uno) |
|---|---|
| `Fact_Cadenas[CVEGEO]` | `Dim_Municipio[CVEGEO]` |
| `Dim_Municipio[CVE_ENT]` | `Dim_Geo[CVE_ENT]` |
| `Dim_Geo[REGION_NIELSEN]` | `Dim_Region[REGION_NIELSEN]` |
| `Fact_Nielsen[REGION_NIELSEN]` | `Dim_Region[REGION_NIELSEN]` |
| `Fact_Cadenas[UPC_KEY]` | `Dim_Producto[UPC_KEY]` |
| `Fact_Nielsen[UPC_KEY]` | `Dim_Producto[UPC_KEY]` |
| `Fact_Cadenas[FECHA]` | `Dim_Calendario[Fecha]` |
| `Fact_Nielsen[FECHA]` | `Dim_Calendario[Fecha]` |

Los tres selectores y `_Medidas` no llevan relaciones.

```
Dim_Region ◄── Dim_Geo ◄── Dim_Municipio ◄── Fact_Cadenas ──► Dim_Producto
    ▲                                              │              ▲
    └────────────── Fact_Nielsen ─────────────────────────────────┘
                         └──────────► Dim_Calendario ◄────────────┘
```

## 5. Medidas

1. Abre la **Vista de consultas DAX**.
2. Pega todo [`dax/medidas.dax`](../dax/medidas.dax).
3. Clic en **Actualizar modelo con cambios** (sobre `DEFINE`): se crean todas las medidas en `_Medidas`.
4. Ejecuta (F5). El resultado debe coincidir con [`valores_esperados_ejemplo.csv`](valores_esperados_ejemplo.csv) (ene-sep 2026). Si coincide, el modelo está bien armado.
5. Oculta la columna `Medidas` de la tabla `_Medidas`.

## 6. El mapa de estados

1. En una página agrega segmentaciones de datos:
   - `Selector Métrica[METRICA]`: **selección única** (Formato › Configuración de segmentación › Selección única).
   - `Dim_Calendario[Año]` (o Año-Mes / Año-Bimestre).
   - `Fact_Cadenas[CADENA]`, `Dim_Producto[CATEGORIA]`, `Dim_Producto[MARCA]`, `Dim_Producto[UPC]`, según necesites.
2. Agrega un visual **Deneb** y en *Values* pon, con estos nombres exactos:

   | Campo | Tabla |
   |---|---|
   | `CVE_ENT` | Dim_Geo |
   | `ESTADO` | Dim_Geo |
   | `REGION_NIELSEN` | Dim_Geo |
   | `Valor Mapa` | _Medidas |
   | `Valor Mapa Texto` | _Medidas |
   | `Config Mapa` | _Medidas |

3. En el visual: *… › Editar*. Elige **Vega-Lite** y la plantilla vacía, abre la pestaña **Specification**, borra lo que haya y pega todo el contenido de [`deneb/mapa_estados.json`](../deneb/mapa_estados.json). *Aplicar*.
4. En el panel *Settings* del editor (sección *Power BI Interactivity*): deja activados los **Tooltips** y activa **Cross-Filtering (Selection) of Data Points** si quieres que un clic en un estado filtre la página.
5. Título dinámico: *Formato › General › Título › fx* y elige la medida `Titulo Mapa`.

Cambia la métrica en el selector: el mapa pasa solo de quintiles azules (ventas, mix, precio) a la escala divergente rojo-gris-azul (índices, brechas, crecimientos).

## 7. Los otros mapas

Mismo procedimiento, con otros campos y otra especificación: ver [guía 02](02-mapas-deneb.md).

## 8. Guardar y versionar (opcional)

*Archivo › Guardar como › Archivos de proyecto de Power BI (.pbip)* dentro de la carpeta `powerbi/`. El formato `.pbip` es texto y Git lo versiona bien; el `.gitignore` ya excluye la caché local.

## Si algo no sale

| Síntoma | Causa probable |
|---|---|
| Deneb muestra el mapa en blanco | Un nombre de campo no coincide (revisa mayúsculas y espacios) o `CVE_ENT` llegó como número. Debe ser texto `"01"`. |
| Todos los estados del mismo color | Hay varias métricas seleccionadas: el selector debe ser de selección única. |
| Crecimientos vacíos | No hay periodo seleccionado. Filtra Año, Año-Mes o Año-Bimestre. |
| Métricas de Nielsen vacías en municipios | Es lo esperado: Nielsen y la población solo existen por región y estado. |
| Estados de una cadena no aparecen | Abre `Control_Ubicaciones`: hay ubicaciones sin clave INEGI. |
