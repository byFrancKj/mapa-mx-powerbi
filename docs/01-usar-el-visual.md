# 01 · Usar el visual

## Instalarlo

- **En un reporte**: panel *Visualizaciones* › *…* › *Importar un objeto visual desde un archivo* y elige el `.pbiviz`.
- **Para toda la organización**: un administrador lo sube en *Portal de administración › Objetos visuales de la organización*. Así todos usan la misma versión revisada y las actualizaciones se controlan en un solo lugar.

Descarga el archivo del *release* de GitHub y comprueba su huella antes de instalarlo ([SECURITY.md](../SECURITY.md)).

## Campos

| Campo | Qué poner | |
|---|---|---|
| **Ubicación (clave INEGI)** | Una columna con la clave del estado: `CVE_ENT` de 2 dígitos. | obligatorio |
| **Valor** | La medida que colorea el mapa. Cualquiera de tu modelo. | obligatorio |
| **Información sobre herramientas** | Medidas extra que aparecen al pasar el cursor. | opcional |

La clave puede ser texto o número: el visual completa los ceros que Excel o Power BI suelen quitar (`9` → `"09"`). Los nombres de estado no sirven aquí; si tus datos solo traen nombres o tiendas, conviértelos a clave con el [puente INEGI](02-puente-inegi.md).

**Recomendado:** relaciona tus hechos con una dimensión de estados (por ejemplo `Dim_Geo` del puente) y usa su columna `CVE_ENT`. Así las segmentaciones por estado o región funcionan como en cualquier visual. Una columna de clave de cualquier otra tabla también funciona.

## Panel de formato

**Colores**

| Opción | Para qué |
|---|---|
| Método | *Cuantiles*: el mismo número de estados por clase, bueno para magnitudes (ventas, unidades). *Intervalos iguales*: clases del mismo ancho. *Divergente*: cinco clases alrededor de un centro. |
| Número de clases | 2 a 7 (cuantiles e intervalos). |
| Paleta | Secuenciales de un tono o divergentes de dos tonos (ColorBrewer, aptas para daltonismo). |
| Centro | Valor neutro de la escala divergente, en las unidades de la medida: `100` para un índice, `0` para crecimientos o brechas. |
| Umbral de "similar" / de "muy" | Distancia al centro que separa las clases. Con centro 100, umbrales `10` y `30` dan: < 70, 70 a 90, 90 a 110, 110 a 130, > 130. Para crecimientos en %, `0.02` y `0.08` son ±2 % y ±8 %. En `0` se calculan solos. |
| Invertir colores | Útil cuando un valor alto es malo (precio, quiebres). |
| Sin dato | Color de los estados sin valor. |

**Mapa:** proyección (Lambert, la que usa INEGI, o Mercator), color y grosor de los límites.

**Leyenda:** mostrar u ocultar, posición, título (por defecto, el nombre de la medida) y tamaño del texto. Las cifras usan el formato de tu medida, abreviadas en español: `$78.4 M`, `$1.5 mil M`.

![Crecimiento con escala divergente](img/mapa_crecimiento.png)

## Cambiar de métrica

Crea un **parámetro de campo** (*Modelado › Nuevo parámetro › Campos*) con tus medidas, ponlo en *Valor* y agrega su segmentación. El visual lee el campo por su papel (Valor), no por su nombre, así que el cambio es inmediato.

Si unas métricas necesitan escala divergente y otras no, usa un visual por tipo o cambia el método en el panel.

## Interacción

- **Clic** en un estado: filtra el resto de la página. **Ctrl+clic** agrega estados. **Clic en el fondo**: quita la selección.
- **Clic derecho**: menú contextual de Power BI (obtener detalles, incluir, excluir…).
- **Teclado**: *Tab* recorre los estados con datos; *Enter* o *Espacio* selecciona.
- **Tooltips**: estado, valor con su formato y las medidas extra. También admite tooltips de página.

## Avisos del visual

| Aviso o mensaje | Qué significa |
|---|---|
| ⚠ *N claves no reconocidas* | Hay valores en Ubicación que no son una clave de estado (nombres, `33`, vacíos…). Pasa el cursor sobre el aviso para ver cuáles. Un *(en blanco)* suele indicar hechos que no encontraron su estado en la relación. |
| ⚠ *N repetidas* | La misma clave llega dos veces, por ejemplo `"9"` y `"09"`. Se usa la primera. |
| *Esta versión dibuja estados…* | Pusiste claves municipales (`CVEGEO`, 5 dígitos). El nivel municipal llega en la versión 0.2. |
| *Agrega una medida en Valor* | Falta la medida. |

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| Todo el mapa en "Sin dato" | La columna de Ubicación no trae claves (revisa el aviso) o la medida da vacío con los filtros actuales. |
| Un estado sale sin dato y no debería | En tu modelo, sus hechos no se relacionan con su clave. Revisa la relación o el control de ubicaciones del puente. |
| Todos los estados del mismo color | Los valores son iguales, o la escala divergente tiene umbrales muy grandes para las unidades de la medida. |
| La leyenda muestra porcentajes como 0.25 | La medida no tiene formato de porcentaje. Dale formato en el modelo. |
