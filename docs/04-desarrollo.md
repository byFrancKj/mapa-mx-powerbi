# 04 · Desarrollo

El visual se desarrolla con las herramientas oficiales de Microsoft (`powerbi-visuals-tools`, API 5.11) en TypeScript, con d3 y topojson. Funciona en macOS, Windows y Linux. Power BI Desktop solo existe para Windows, pero el visual se puede probar en vivo en el servicio de Power BI desde el navegador.

## Requisitos

- **Node.js 20 o superior** (instalador LTS de [nodejs.org](https://nodejs.org) o `brew install node`).
- **Python 3** para las validaciones (`scripts/validar.py`, `scripts/revisar_datos.py`). pandas solo hace falta para regenerar el ejemplo (`pip install -r requirements.txt`).

## Primera vez

```bash
git config core.hooksPath .githooks   # revisa en cada commit que no subas datos privados
cd visual
npm ci
```

## Día a día

| Comando (en `visual/`) | Qué hace |
|---|---|
| `npm test` | Pruebas: claves, clasificación, paletas, formato, geometría y el visual completo en un DOM simulado. |
| `npm run lint` | ESLint con las reglas de seguridad de Microsoft para visuales. |
| `npm run tipos` | Revisión de tipos en modo estricto. |
| `npm run vista-previa` | Dibuja el visual con los datos del ejemplo y guarda PNG en `docs/img/` (antes: `python scripts/modelo_referencia.py` en la raíz). |
| `npm run package` | Genera `visual/dist/*.pbiviz`. |
| `npm start` | Servidor local para probar en vivo en el servicio de Power BI. |

### Probar en vivo

1. La primera vez: `npx pbiviz install-cert` (instala un certificado local para `https://localhost:8080`).
2. `npm start`.
3. En el servicio de Power BI: *Configuración › Configuración general › Desarrollador* y activa el **modo de desarrollador de objetos visuales personalizados**. Tu inquilino debe permitir visuales creados con el SDK de Power BI.
4. En un reporte en modo edición aparece el ícono de **visual de desarrollador** en el panel de visualizaciones. Cada cambio en el código se recarga solo.

O empaqueta (`npm run package`) e importa el `.pbiviz` en Power BI Desktop en una PC con Windows.

## Estructura del visual

```
visual/
├── capabilities.json   Campos (Ubicación con drill-down, Grupo, Valor, Valor 2, Tooltips), opciones de formato y privilegios (ninguno)
├── pbiviz.json         Nombre, versión y GUID del visual
├── src/
│   ├── visual.ts       Lee los campos por rol, decide el nivel, dibuja, bivariado, grupos, etiquetas, tooltips, selección, leyenda y avisos
│   ├── ajustes.ts      Panel de formato
│   ├── claves.ts       Normaliza claves INEGI (completa ceros, detecta nivel)
│   ├── clasificacion.ts Cuantiles, intervalos y divergente
│   ├── paletas.ts      Paletas ColorBrewer
│   ├── formato.ts      Formato compacto ($78.4 M, $1.5 mil M) para leyenda y etiquetas
│   ├── textos.ts       Textos en el idioma de Power BI
│   ├── geometria.ts    Carga la geometría empaquetada y calcula límites (topojson mesh)
│   └── geo/            estados.json y municipios.json (los genera npm run geo en la raíz)
├── stringResources/    Traducciones: es-ES, es-MX (igual a es-ES) y en-US (respaldo)
├── test/               Pruebas y entorno simulado de Power BI
└── scripts/            Vista previa y revisión de privilegios
```

Notas de compatibilidad, por si actualizas dependencias:

- `powerbi-visuals-utils-formattingutils` está fijado en **6.1.2**: el cargador de idiomas de `powerbi-visuals-tools` 7.2.1 no entiende el formato ESM de la 7.0.0.
- `tsconfig.json` no es estricto porque pbiviz compila también su propio código generado; `tsconfig.estricto.json` revisa el código del visual en modo estricto.
- TypeScript se queda en 5.5, la versión con la que pbiviz 7.2.1 está probado.

### Agregar un idioma

1. Copia `stringResources/en-US/` a `stringResources/<código>/` (por ejemplo `pt-BR`) y traduce los textos.
2. `npm test` revisa que todas las claves usadas en el código existan en todos los idiomas y que no sobre ninguna.

pbiviz solo empaqueta las culturas de formato de los idiomas que tienen carpeta, así que agregar un idioma también corrige el formato de sus cifras.

## Geometría y catálogos

En la raíz del repositorio:

```bash
npm install
npm run geo                                   # regenera desde la capa del repositorio (no pierde detalle)
npm run geo -- --fuente "C:/INEGI/00mun.shp"  # desde la capa original del Marco Geoestadístico
python scripts/validar.py
```

`npm run geo` escribe `geo/`, los catálogos de `puente-inegi/catalogos/` y las copias que van dentro del visual (`visual/src/geo/`). La geometría municipal es la mayor parte del paquete (unos 290 KB de sus 373 KB).

## Publicar una versión

1. Sube la versión en `visual/pbiviz.json` (`visual.version` y `version`, p. ej. `0.2.0.0`) y en `visual/package.json`.
2. Crea y sube la etiqueta: `git tag v0.2.0 && git push origin v0.2.0`.
3. GitHub Actions compila el `.pbiviz` desde ese código, calcula su SHA-256, firma una atestación de origen y publica el *release*. Si la etiqueta no coincide con la versión de `pbiviz.json`, se detiene.

## Publicar en GitHub

Una sola vez, con el CLI de GitHub (el inicio de sesión es interactivo):

```bash
brew install gh
gh auth login
bash scripts/publicar.sh             # público; --privado para un repositorio privado
```

El script se detiene ante cualquier problema y pregunta antes de cada paso que no se puede deshacer (`--si` para no preguntar):

1. Revisa que no haya datos privados ni cambios sin commit y corre `validar.py`.
2. Reemplaza el correo de los commits locales por tu dirección privada de GitHub (`ID+usuario@users.noreply.github.com`), en todo el historial y en las etiquetas, para no publicar tu correo personal. Solo si el historial todavía no se ha subido.
3. Completa autor y URLs en `visual/pbiviz.json` y los enlaces de `SECURITY.md`.
4. Crea el repositorio y sube `main` y las etiquetas. Usa tu sesión de `gh` solo para ese comando: no cambia tu configuración global de git.
5. Activa escaneo de secretos con bloqueo al subir, alertas y actualizaciones de Dependabot, reporte privado de vulnerabilidades y una regla que protege `main` (cambios por pull request con el CI en verde; los administradores pueden saltarla).
6. Espera al CI y publica el *release* de la versión actual del visual, compilado en GitHub.

Si se interrumpe, vuelve a correrlo: retoma donde se quedó.

## Seguridad del código

- Sin privilegios en `capabilities.json`: el CI (`scripts/sin_red.mjs`) falla si alguien agrega `WebAccess`, `LocalStorage` o `ExportContent`.
- Nada de `innerHTML` ni `eval`: el DOM se arma con d3 y `textContent` (lo vigila ESLint).
- Las dependencias que se empaquetan van con versión exacta y sin vulnerabilidades conocidas (`npm audit --omit=dev`). Las herramientas de desarrollo de Microsoft (servidor local de pbiviz) tienen avisos de `npm audit` que no llegan al visual; Dependabot avisa cuando hay actualización.
- Las GitHub Actions están fijadas por commit, no por etiqueta.
