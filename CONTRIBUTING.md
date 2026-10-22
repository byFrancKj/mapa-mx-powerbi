# Cómo contribuir

Gracias por mejorar el proyecto. Algunas reglas para que siga siendo útil y seguro para cualquiera:

1. **Nunca subas datos reales** de cadenas, de fuentes de mercado ni de clientes, tampoco en *issues*. Para ejemplos usa `scripts/generar_datos_ejemplo.py`. Activa el gancho que lo revisa en cada commit:

   ```bash
   git config core.hooksPath .githooks
   ```

2. **Archivos generados**: `geo/`, `puente-inegi/catalogos/` y `visual/src/geo/` salen de `npm run geo`; `ejemplo/valores_esperados.csv` de `scripts/modelo_referencia.py`. Cambia los scripts o sus insumos y regenera; no los edites a mano.
3. **Antes de abrir un pull request** ejecuta:

   ```bash
   python scripts/validar.py
   python scripts/revisar_datos.py
   cd visual && npm ci && npm run lint && npm run tipos && npm test
   ```

   GitHub Actions corre lo mismo en cada *push* y *pull request*.
4. **El visual no se conecta a internet.** No agregues privilegios a `visual/capabilities.json` (`WebAccess`, `LocalStorage`, `ExportContent`): el CI lo rechaza. Nada de `innerHTML` ni `eval`.
5. **Dependencias del visual** con versión exacta. Revisa `npm audit --omit=dev` antes de agregar una.
6. **Alias de estados**: escríbelos ya normalizados (mayúsculas, sin acentos ni puntuación).
7. Para temas de seguridad, usa el reporte privado de vulnerabilidades ([SECURITY.md](SECURITY.md)), no un *issue* público.

## Ideas pendientes

- Mapa bivariado (Valor 2).
- Etiquetas con el valor o el nombre sobre cada área.
- Localización de textos del visual.
- Script para asignar `CVEGEO` a tiendas a partir de coordenadas.
- Población municipal para métricas per cápita a nivel municipio.
