# Cómo contribuir

Gracias por mejorar el proyecto. Algunas reglas para que siga siendo útil para cualquiera:

1. **Nunca subas datos reales** de cadenas, de Nielsen ni de clientes. Para ejemplos usa `scripts/generar_datos_ejemplo.py`.
2. **Archivos generados**: `catalogos/`, `geo/` y `deneb/` salen de `npm run geo`. Cambia `config/` o los scripts y regenera; no edites esos archivos a mano.
3. **Antes de abrir un pull request** ejecuta:

   ```bash
   npm install
   pip install -r requirements.txt
   npm run geo                       # si cambiaste config/ o scripts de geometría
   python scripts/validar.py
   python scripts/modelo_referencia.py
   npm run vistas                    # comprueba que las especificaciones compilan
   ```

   GitHub Actions corre lo mismo en cada *push*.
4. **Medidas DAX nuevas**: agrégalas a `dax/medidas.dax` y, si cambian resultados, a `scripts/modelo_referencia.py` para que `docs/valores_esperados_ejemplo.csv` siga sirviendo como prueba.
5. **Alias de estados**: escríbelos ya normalizados (mayúsculas, sin acentos ni puntuación).

## Ideas pendientes

- Script para asignar `CVEGEO` a tiendas a partir de coordenadas.
- Población municipal para métricas per cápita a nivel municipio.
- Plantilla `.pbip` lista para abrir.
- Mapas por localidad o código postal.
