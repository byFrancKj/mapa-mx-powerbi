# deneb/

Especificaciones de Vega-Lite 6 para el visual Deneb, con la geometría incrustada. **Archivos generados**: se reconstruyen con `npm run geo` (o `npm run deneb` si solo cambiaste el diseño en `scripts/construir_deneb.mjs`).

Para usarlas: agrega los campos al visual con estos nombres exactos, abre *Editar*, elige Vega-Lite y pega el archivo completo en la pestaña *Specification*.

| Archivo | Campos que espera |
|---|---|
| `mapa_estados.json` | `CVE_ENT`, `ESTADO`, `REGION_NIELSEN`, `Valor Mapa`, `Valor Mapa Texto`, `Config Mapa` |
| `mapa_bivariado.json` | los anteriores + `Valor Mapa 2`, `Valor Mapa 2 Texto`, `Config Mapa 2` |
| `comparativo_regiones.json` | `REGION_NIELSEN` (de `Dim_Region`), `Comparar Cadenas`, `Comparar Cadenas Texto`, `Comparar Nielsen`, `Comparar Nielsen Texto`, `Config Comparación` |
| `municipios/mapa_municipios_XX.json` | `CVEGEO`, `MUNICIPIO`, `Valor Mapa`, `Valor Mapa Texto`, `Config Mapa` |
| `municipios/mapa_municipios_nacional.json` | igual que el anterior, los 2,475 municipios |

Detalle de escalas, colores y personalización: [docs/02-mapas-deneb.md](../docs/02-mapas-deneb.md).
