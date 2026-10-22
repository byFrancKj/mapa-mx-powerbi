# Mapa México (INEGI) para Power BI

Objeto visual de Power BI que dibuja México por estado o municipio a partir de la **clave INEGI**. Tú pones el modelo, las relaciones y las medidas; el visual solo trae la geometría de INEGI y colorea cada estado o municipio con la medida que elijas.

![Índice por estado con escala divergente](docs/img/mapa_indice.png)

> Las imágenes usan los **datos ficticios** de la carpeta `ejemplo/`.

## Cómo funciona

```
TU POWER BI                                   EL VISUAL (.pbiviz)
Tus tablas y relaciones                       Solo trae la geometría de INEGI,
  Fact_Ventas ─► Dim_Estado[CVE_ENT]          cada estado con su clave ("01"…"32")
Tus medidas: [Ventas], [Índice]…

En el visual arrastras:
  Ubicación = Dim_Estado[CVE_ENT]   ──►   Power BI calcula tu medida por clave
  Valor     = [Tu medida]                 (con todos tus filtros) y le pasa
                                          una tabla chica:  "14" → 1,234,567
                                                   ▼
                                          El visual busca "14" en su geometría
                                          y pinta Jalisco.
```

- **Cualquier medida**, con su propio formato. Los parámetros de campo funcionan para cambiar de métrica.
- **Estados y municipios**, con drill-down de estado a municipio en el mismo visual.
- **Regiones dinámicas**: pon tu columna de región en *Grupo* y el visual dibuja su contorno. Si cambias las regiones en el modelo, el mapa cambia solo.
- **Clasificación** por cuantiles, intervalos iguales o escala divergente alrededor de un centro (100 en índices, 0 en crecimientos).
- **Mapa bivariado**: con una segunda medida, terciles de una contra terciles de la otra (¿dónde somos fuertes y además crecemos?).
- **Etiquetas** con el valor o el nombre, solo donde caben y sin encimarse.
- **Interacción nativa**: filtro cruzado, resaltado desde otros visuales, tooltips (incluidos los de página), menú contextual, teclado y alto contraste.
- **En español e inglés**, según el idioma de Power BI.
- **Seguro**: no se conecta a internet ni guarda nada. Detalle en [SECURITY.md](SECURITY.md).

![Regiones del modelo dibujadas con el campo Grupo](docs/img/mapa_regiones.png)

## Inicio rápido

1. Descarga el `.pbiviz` del último *release* (o compílalo: [docs/04](docs/04-desarrollo.md)).
2. En Power BI: panel *Visualizaciones* › *…* › **Importar un objeto visual desde un archivo**.
3. Arrastra a **Ubicación** una columna con la clave INEGI (`CVE_ENT` de estado o `CVEGEO` de municipio, texto o número) y a **Valor** tu medida. Opcional: tu región en **Grupo**.
4. Ajusta método, paleta y leyenda en *Formato*.

¿Tus datos no traen la clave INEGI (vienen por tienda o con el nombre del estado)? Usa el [puente INEGI](docs/02-puente-inegi.md).

## Documentación

| Guía | Contenido |
|---|---|
| [01 · Usar el visual](docs/01-usar-el-visual.md) | Campos, claves, panel de formato, interacción y problemas comunes. |
| [02 · Puente INEGI](docs/02-puente-inegi.md) | Catálogos y Power Query para obtener las claves, mapeo de tiendas y regiones propias. |
| [03 · Ejemplo](docs/03-ejemplo.md) | Modelo de demostración con datos ficticios: cadenas contra una fuente de mercado. |
| [04 · Desarrollo](docs/04-desarrollo.md) | Compilar y probar el visual (también desde Mac), publicar versiones y buenas prácticas. |

## Estructura

```
visual/        El objeto visual (TypeScript): código, pruebas y empaquetado
puente-inegi/  Catálogos INEGI y Power Query para obtener las claves (opcional)
ejemplo/       Datos ficticios, consultas, medidas y valores esperados de la demo
geo/           Geometría INEGI de estados y municipios (TopoJSON / GeoJSON)
scripts/       Geometría, validaciones y revisión de datos privados
docs/          Guías e imágenes
privado/       Tus archivos reales: git lo ignora
```

## Hoja de ruta

- [x] **0.1** Estados: cuantiles, intervalos y divergente; leyenda, tooltips, selección y avisos de claves.
- [x] **0.2** Municipios con drill-down y campo *Grupo* con regiones dinámicas (sin regenerar geometría).
- [x] **0.3** Mapa bivariado, etiquetas, resaltado, ícono de advertencia y textos en español e inglés.
- [ ] Certificación en AppSource (opcional: es un trámite con Microsoft; el visual ya cumple sus requisitos técnicos principales).

## Fuentes, licencia y seguridad

- Límites estatales y municipales: Marco Geoestadístico, **INEGI**. Población: Censo de Población y Vivienda 2020, **INEGI**. Detalle en [ATRIBUCION.md](ATRIBUCION.md).
- Código y documentación: [MIT](LICENSE).
- Nielsen es marca de NielsenIQ y Power BI de Microsoft. Este proyecto no está afiliado a ellas ni a ninguna cadena comercial.
- Nunca subas datos reales: ver [SECURITY.md](SECURITY.md) y [CONTRIBUTING.md](CONTRIBUTING.md).
