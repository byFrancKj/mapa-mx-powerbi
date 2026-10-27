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
| **Bases a comparar** | Hasta 4 medidas, una por fuente (por ejemplo `Ventas Cadenas` y `Ventas Nielsen Estimada`). El [panel de detalle](#panel-de-detalle) las compara contra la primera. Sin Valor, el mapa se colorea con la primera base. | opcional |
| **Tarjetas** | Hasta 8 medidas DAX que el panel de detalle muestra como tarjetas. | opcional |
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

- Dibuja el **contorno de cada grupo** donde cambia de valor, calculado con los datos de ese momento: si cambias las regiones en tu modelo, el mapa cambia solo, sin regenerar geometría. Un halo claro bajo el contorno lo separa también sobre los colores oscuros.
- Escribe el **nombre de cada grupo** sobre el mapa. Un clic en el nombre selecciona el grupo entero y abre el panel de detalle con sus totales.
- Funciona también en municipios: un grupo puede partir un estado (una zona metropolitana que cruza estados, territorios de venta por municipio).
- Agrega el grupo al tooltip.

Para distinguir mejor las regiones, en *Grupos › Colores de los grupos* elige **Franja de color por grupo**: cada grupo lleva una franja de su color por dentro del contorno, con los colores del tema del reporte, y la leyenda suma la lista de grupos (un clic en uno lo selecciona). O, en *Colores › Colorear por*, elige **Grupo** para pintar cada región de un color, sin medida.

![Franja de color, nombre y leyenda de cada región](img/mapa_regiones_color.png)

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

## Panel de detalle

Al hacer clic en un estado (o en varios, con Ctrl+clic; en Mac, ⌘+clic) se abre un panel junto al mapa con:

- La **silueta** de la selección, con sus colores del mapa, y su nombre (o "3 estados", o el nombre del grupo si seleccionaste uno entero).
- **Comparación** de las *Bases a comparar*: el valor de cada una con una barra proporcional y, de la primera contra cada una de las demás, la **diferencia**, la **diferencia %** y el **índice** (base 100), en verde o rojo según el signo. Entre dos porcentajes (por ejemplo `% Mix Cadenas` y `% Mix Nielsen`) la diferencia va en puntos porcentuales.
- **Indicadores**: una tarjeta por cada medida de *Tarjetas* (sin tarjetas, muestra Valor).
- Con varias áreas, una **tabla por estado** (o municipio) ordenada de mayor a menor.

El panel se cierra con su botón ×, con un clic en el fondo del mapa o con Esc. Para seleccionar una región completa, haz clic en su nombre sobre el mapa o en la leyenda.

![Panel de detalle de Jalisco: dos fuentes comparadas y cuatro tarjetas](img/panel_detalle.png)

![Panel de la región Occidente, seleccionada con un clic en su nombre: sumas, promedio, rangos y tabla por estado](img/panel_region.png)

### Varias áreas: cómo se combina cada medida

El visual recibe de Power BI un valor por estado y no sabe si tu medida se puede sumar. Por eso, en *Formato › Al seleccionar varias áreas* hay una lista por medida para elegir cómo se combina:

| Opción | Úsala para |
|---|---|
| **Suma** | Medidas aditivas: ventas, unidades, % de mix. Es lo que usan las bases si no eliges otra cosa. |
| **Promedio**, **Mínimo**, **Máximo** | Índices, precios, crecimientos (un promedio simple, sin ponderar). |
| **Rango (sin combinar)** | Muestra del mínimo al máximo. Es lo que usan las tarjetas si no eliges otra cosa. |

La diferencia, la diferencia % y el índice de la comparación se calculan con los totales de las bases, así que son correctos para cualquier selección si las bases son aditivas. No pongas como base una medida que repite el total de la región en cada estado (en el ejemplo, `[Ventas Nielsen]`): usa la versión que reparte la región (`[Ventas Nielsen Estimada]`).

Si necesitas el valor exacto de una medida no aditiva para varios estados, calcúlalo en DAX y muéstralo con un objeto visual de tarjeta de Power BI, que sí responde al filtro del mapa.

### Dónde aparece

*Formato › Panel de detalle › Posición*: **Automática** (a la derecha en un visual ancho, abajo en uno alto y flotando encima en uno chico), **A la derecha**, **Abajo** o **Flotando sobre el mapa**. *Tamaño* es la parte del visual que ocupa. Con **Mostrar sin selección**, el panel resume todas las áreas con datos: si filtras la página a tres estados, muestra esos tres. El *Modo de enfoque* de Power BI (en el encabezado del visual) le da más espacio a todo.

## Zoom

- **Rueda del ratón** (o pellizco en el trackpad): acerca alrededor del cursor. En *Formato › Zoom › Rueda del ratón* elige *Acerca con Ctrl* si tu página se desplaza y no quieres que la rueda la detenga, o *Nunca acerca* para usar solo los botones. En la vista completa, girar la rueda hacia atrás sigue desplazando la página.
- **Arrastrar** mueve el mapa; en pantallas táctiles, pellizca para acercar. Un arrastre no selecciona ni quita la selección.
- **Botones**: acercar, alejar, ver todo el mapa y, con una selección, acercar a ella.
- **Teclado**: `+` y `-` acercan y alejan, `0` vuelve a la vista completa y Esc quita la selección.
- **Acercar a la selección** (opción del formato): al seleccionar, el mapa se acerca solo; al quitar la selección, vuelve a la vista completa. Las islas lejanas (Revillagigedo, Islas Marías) no cuentan para el encuadre.

Al acercarte aparecen las etiquetas de las áreas chicas, y las líneas conservan su grosor. Si el panel de detalle se abre con el mapa acercado, se conserva el centro y la escala.

## Comparar fuentes en el mapa

Con dos bases o más, *Colores › Colorear por* ofrece **Diferencia entre bases** (primera menos segunda, con el formato de la primera) y **Diferencia % entre bases** ((primera − segunda) / segunda). Las dos se pintan con escala divergente alrededor de 0: ajusta los umbrales de "similar" y de "muy" (por ejemplo `0.1` y `0.3` para ±10 % y ±30 %). Es la pregunta "¿dónde se separan más las dos fuentes?" sin escribir otra medida.

## Etiquetas

*Formato › Etiquetas* muestra sobre cada área el valor (abreviado: `$212 M`), el nombre o ambos. Solo se dibujan donde caben y sin encimarse: las áreas grandes ponen su etiqueta primero. Con el mapa más grande o el texto más chico aparecen más.

![Etiquetas con el valor de cada estado](img/mapa_etiquetas.png)

## Panel de formato

**Colores**

| Opción | Para qué |
|---|---|
| Método | *Cuantiles*: el mismo número de áreas por clase, bueno para magnitudes (ventas, unidades). *Intervalos iguales*: clases del mismo ancho. *Divergente*: cinco clases alrededor de un centro. |
| Número de clases | 2 a 7 (cuantiles e intervalos). |
| Colorear por | *Valor*, *Diferencia entre bases*, *Diferencia % entre bases* o *Grupo* (aparece si hay dos bases o un grupo). |
| Paleta | Secuenciales de un tono o divergentes de dos tonos (ColorBrewer, aptas para daltonismo), y el **semáforo** (rojo · amarillo · verde), secuencial o divergente. |
| Centro | Valor neutro de la escala divergente, en las unidades de la medida: `100` para un índice, `0` para crecimientos o brechas. |
| Umbral de "similar" / de "muy" | Distancia al centro que separa las clases. Con centro 100, umbrales `10` y `30` dan: < 70, 70 a 90, 90 a 110, 110 a 130, > 130. Para crecimientos en %, `0.02` y `0.08` son ±2 % y ±8 %. En `0` se calculan solos. |
| Invertir colores | Útil cuando un valor alto es malo (precio, quiebres). |
| Sin dato | Color de las áreas sin valor. |

**Mapa:** proyección (Lambert, la que usa INEGI, o Mercator), color y grosor de los límites. En municipios los límites se dibujan a la mitad de grosor.

**Bivariado** (aparece al usar Valor 2): paleta de 3×3.

**Grupos** (aparece al usar el campo Grupo): mostrar el contorno, colores de los grupos (solo contorno o franja de color por grupo), color y grosor del contorno, mostrar u ocultar los límites dentro de cada grupo, y el nombre de cada grupo con su tamaño.

**Etiquetas:** mostrar, contenido (valor, nombre o ambos), tamaño y color del texto.

**Leyenda:** mostrar u ocultar, posición, título (por defecto, el nombre de la medida) y tamaño del texto. Las cifras usan el formato de tu medida, abreviadas en español: `$78.4 M`, `$1.5 mil M`.

**Panel de detalle:** mostrar, posición, tamaño, mostrar sin selección, silueta, diferencia, índice, diferencias en verde y rojo, y tamaño del texto.

**Al seleccionar varias áreas:** cómo se combina cada medida del panel (ver [arriba](#varias-áreas-cómo-se-combina-cada-medida)).

**Zoom:** permitir zoom, rueda del ratón, botones y su posición, y acercar a la selección.

![Crecimiento con escala divergente](img/mapa_crecimiento.png)

### Semáforo

La paleta **Semáforo** va de rojo (valor bajo) a verde (valor alto), con amarillo al centro: pensada para el mapa de ventas. *Invertir colores* la voltea para medidas donde lo alto es malo (precio, quiebres). En la escala divergente pinta rojo muy por debajo, amarillo similar y verde muy por encima: útil para índices (centro 100) y crecimientos (centro 0).

Rojo y verde se confunden con el daltonismo más común (alrededor de 1 de cada 12 hombres). El amarillo del centro y la diferencia de claridad ayudan, pero si el reporte lo verá mucha gente, acompáñalo de etiquetas o usa una paleta de un solo tono.

![Ventas por estado con el semáforo](img/mapa_semaforo.png)

## Cambiar de métrica

Crea un **parámetro de campo** (*Modelado › Nuevo parámetro › Campos*) con tus medidas, ponlo en *Valor* y agrega su segmentación. El visual lee el campo por su papel (Valor), no por su nombre, así que el cambio es inmediato.

Si unas métricas necesitan escala divergente y otras no, usa un visual por tipo o cambia el método en el panel.

## Interacción

- **Clic** en un área: filtra el resto de la página y abre el panel de detalle. **Ctrl+clic** (⌘+clic en Mac) agrega áreas. **Clic en el fondo** o Esc: quita la selección.
- **Clic en el nombre de un grupo** (sobre el mapa o en la leyenda): selecciona el grupo entero.
- **Zoom**: rueda, arrastre, pellizco, botones y teclado (ver [Zoom](#zoom)).
- **Resaltado**: si haces clic en otro visual (una barra, una fila), el mapa atenúa las áreas que no corresponden.
- **Clic derecho**: menú contextual de Power BI (obtener detalles, incluir, excluir, explorar…).
- **Teclado**: *Tab* recorre las áreas con datos; *Enter* o *Espacio* selecciona.
- **Tooltips**: área (y estado, en municipios), grupo, valor con su formato, las bases y su diferencia, y las medidas extra. También admite tooltips de página.

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
