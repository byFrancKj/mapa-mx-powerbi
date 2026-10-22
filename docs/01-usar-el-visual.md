# 01 · Usar el visual

## Instalarlo

- **En un reporte**: panel *Visualizaciones* › *…* › *Importar un objeto visual desde un archivo* y elige el `.pbiviz`.
- **Para toda la organización**: un administrador lo sube en *Portal de administración › Objetos visuales de la organización*. Así todos usan la misma versión revisada y las actualizaciones se controlan en un solo lugar.

Descarga el archivo del *release* de GitHub y comprueba su huella antes de instalarlo ([SECURITY.md](../SECURITY.md)).

## Campos

| Campo | Qué poner | |
|---|---|---|
| **Ubicación (clave INEGI)** | La clave del estado (`CVE_ENT`, 2 dígitos) o del municipio (`CVEGEO`, 5 dígitos). Admite una jerarquía estado → municipio. | obligatorio |
| **Grupo (región)** | Una columna con el grupo de cada área: tu región, zona comercial, territorio… | opcional |
| **Valor** | La medida que colorea el mapa. Cualquiera de tu modelo. | obligatorio |
| **Valor 2 (bivariado)** | Una segunda medida: el mapa pasa a ser bivariado. | opcional |
| **Información sobre herramientas** | Medidas extra que aparecen al pasar el cursor. | opcional |

La clave puede ser texto o número: el visual completa los ceros que Excel o Power BI suelen quitar (`9` → `"09"`, `1002` → `"01002"`). Los nombres no sirven en Ubicación; si tus datos solo traen nombres o tiendas, conviértelos a clave con el [puente INEGI](02-puente-inegi.md).

**Recomendado:** relaciona tus hechos con dimensiones de estados y municipios (por ejemplo `Dim_Geo` y `Dim_Municipio` del puente) y usa sus claves. Así las segmentaciones y el drill-down funcionan como en cualquier visual. Una columna de clave de cualquier otra tabla también sirve.

## Estados y municipios

El visual decide el nivel por la clave: con `CVE_ENT` dibuja los 32 estados; con `CVEGEO`, los municipios.

- En el nivel municipal dibuja **solo los municipios de los estados que traen datos**, con los límites estatales como referencia. Si filtras la página a Jalisco, el mapa se acerca a Jalisco; sin filtro, ves los 2,475 municipios.
- Las claves `XX000` (datos que solo llegan a nivel estatal, como las del puente) no se dibujan en el nivel municipal: el visual las cuenta en el aviso.

![Venta por municipio en Jalisco](img/municipios_jalisco.png)

### Drill-down

Pon en Ubicación las dos columnas, en este orden: `Dim_Geo[CVE_ENT]` y debajo `Dim_Municipio[CVEGEO]`. Aparecen las flechas de exploración en el encabezado del visual:

- **Activar exploración** y clic en un estado: baja a sus municipios y el mapa se acerca.
- **Expandir todo un nivel**: municipios de todo el país.
- **Subir un nivel**: vuelve a estados.

Siempre se dibuja el nivel más profundo que manda Power BI.

## Grupos (regiones)

Pon tu columna de región en **Grupo** (por ejemplo `Dim_Geo[REGION]`). El visual:

- Dibuja el **contorno de cada grupo** donde cambia de valor, calculado con los datos de ese momento: si cambias las regiones en tu modelo, el mapa cambia solo, sin regenerar geometría.
- Funciona también en municipios: un grupo puede partir un estado (una zona metropolitana que cruza estados, territorios de venta por municipio).
- Agrega el grupo al tooltip.

Para un **mapa de regiones**, usa una medida que devuelva el valor de la región en cada estado, por ejemplo `CALCULATE ( [Tu medida], ALLEXCEPT ( Dim_Geo, Dim_Geo[REGION] ) )`, y apaga *Grupos › Límites dentro de cada grupo*: cada región se ve como una sola área.

El grupo debe ser un atributo del área: un solo valor por estado o municipio. Si una clave llega con dos grupos distintos, el visual la reporta como repetida.

![Regiones del modelo dibujadas con el campo Grupo](img/mapa_regiones.png)

## Mapa bivariado

Con una medida en **Valor 2**, cada medida se parte en terciles (bajo, medio, alto) y cada área toma el color de la combinación: Valor crece hacia la derecha de la leyenda y Valor 2 hacia arriba. La esquina oscura es "alto en ambas".

![Mapa bivariado](img/mapa_bivariado.png)

| Valor | Valor 2 | Pregunta |
|---|---|---|
| Índice per cápita | Crecimiento | ¿Dónde somos fuertes y además crecemos? |
| Índice contra el mercado | Brecha de crecimiento | ¿Dónde estamos sub-representados y perdiendo terreno? |
| % de la venta nacional | Índice de precio | ¿Los estados que más pesan son los más caros? |

En el bivariado no aplican el método ni las clases de la tarjeta Colores; la paleta se elige en la tarjeta **Bivariado**. El tooltip muestra las dos medidas y la clase ("alto en Índice · bajo en Crecimiento").

## Etiquetas

*Formato › Etiquetas* muestra sobre cada área el valor (abreviado: `$212 M`), el nombre o ambos. Solo se dibujan donde caben y sin encimarse: las áreas grandes ponen su etiqueta primero. Con el mapa más grande o el texto más chico aparecen más.

![Etiquetas con el valor de cada estado](img/mapa_etiquetas.png)

## Panel de formato

**Colores**

| Opción | Para qué |
|---|---|
| Método | *Cuantiles*: el mismo número de áreas por clase, bueno para magnitudes (ventas, unidades). *Intervalos iguales*: clases del mismo ancho. *Divergente*: cinco clases alrededor de un centro. |
| Número de clases | 2 a 7 (cuantiles e intervalos). |
| Paleta | Secuenciales de un tono o divergentes de dos tonos (ColorBrewer, aptas para daltonismo). |
| Centro | Valor neutro de la escala divergente, en las unidades de la medida: `100` para un índice, `0` para crecimientos o brechas. |
| Umbral de "similar" / de "muy" | Distancia al centro que separa las clases. Con centro 100, umbrales `10` y `30` dan: < 70, 70 a 90, 90 a 110, 110 a 130, > 130. Para crecimientos en %, `0.02` y `0.08` son ±2 % y ±8 %. En `0` se calculan solos. |
| Invertir colores | Útil cuando un valor alto es malo (precio, quiebres). |
| Sin dato | Color de las áreas sin valor. |

**Mapa:** proyección (Lambert, la que usa INEGI, o Mercator), color y grosor de los límites. En municipios los límites se dibujan a la mitad de grosor.

**Bivariado** (aparece al usar Valor 2): paleta de 3×3.

**Grupos** (aparece al usar el campo Grupo): mostrar el contorno, su color y grosor, y mostrar u ocultar los límites dentro de cada grupo.

**Etiquetas:** mostrar, contenido (valor, nombre o ambos), tamaño y color del texto.

**Leyenda:** mostrar u ocultar, posición, título (por defecto, el nombre de la medida) y tamaño del texto. Las cifras usan el formato de tu medida, abreviadas en español: `$78.4 M`, `$1.5 mil M`.

![Crecimiento con escala divergente](img/mapa_crecimiento.png)

## Cambiar de métrica

Crea un **parámetro de campo** (*Modelado › Nuevo parámetro › Campos*) con tus medidas, ponlo en *Valor* y agrega su segmentación. El visual lee el campo por su papel (Valor), no por su nombre, así que el cambio es inmediato.

Si unas métricas necesitan escala divergente y otras no, usa un visual por tipo o cambia el método en el panel.

## Interacción

- **Clic** en un área: filtra el resto de la página. **Ctrl+clic** agrega áreas. **Clic en el fondo**: quita la selección.
- **Resaltado**: si haces clic en otro visual (una barra, una fila), el mapa atenúa las áreas que no corresponden.
- **Clic derecho**: menú contextual de Power BI (obtener detalles, incluir, excluir, explorar…).
- **Teclado**: *Tab* recorre las áreas con datos; *Enter* o *Espacio* selecciona.
- **Tooltips**: área (y estado, en municipios), grupo, valor con su formato y las medidas extra. También admite tooltips de página.

## Idiomas

Los textos del visual (campos, panel de formato, tooltips, leyenda y avisos) salen en **español** si Power BI está en español y en **inglés** en cualquier otro idioma. Las cifras siguen la configuración regional del reporte.

## Avisos del visual

Cuando hay un problema con las claves, el visual lo escribe en una esquina del mapa y además muestra el **ícono de advertencia** en su encabezado, con el detalle.

| Aviso o mensaje | Qué significa |
|---|---|
| ⚠ *N claves no reconocidas* | Hay valores en Ubicación que no son una clave INEGI (nombres, `33`, vacíos…). Pasa el cursor sobre el aviso para ver cuáles. Un *(en blanco)* suele indicar hechos que no encontraron su área en la relación. |
| ⚠ *N de otro nivel* | Llegaron claves de estado y de municipio mezcladas: se dibuja el nivel de la mayoría. |
| ⚠ *N sin municipio* | Claves `XX000`: datos que solo llegan a nivel estatal y no se pueden dibujar por municipio. |
| ⚠ *N repetidas* | La misma clave llega dos veces, por ejemplo `"9"` y `"09"`, o con dos grupos. Se usa la primera. |
| *Ubicación necesita claves INEGI…* | Pusiste nombres (de estado o de región) en Ubicación. Las regiones van en Grupo. |
| *Agrega una medida en Valor* | Falta la medida. |

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| Todo el mapa en "Sin dato" | La columna de Ubicación no trae claves (revisa el aviso) o la medida da vacío con los filtros actuales. |
| Un área sale sin dato y no debería | En tu modelo, sus hechos no se relacionan con su clave. Revisa la relación o el control de ubicaciones del puente. |
| Todas las áreas del mismo color | Los valores son iguales, o la escala divergente tiene umbrales muy grandes para las unidades de la medida. |
| La leyenda muestra porcentajes como 0.25 | La medida no tiene formato de porcentaje. Dale formato en el modelo. |
| No aparecen las flechas de drill-down | Ubicación tiene una sola columna. Agrega la de municipio debajo de la de estado. |
