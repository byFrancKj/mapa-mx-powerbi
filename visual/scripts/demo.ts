/**
 * Arma una página de demostración: el visual con el host falso de las pruebas y los
 * datos ficticios del ejemplo, en un solo HTML que se abre en cualquier navegador
 * (sin Power BI y sin red). Sirve para probar el panel, el zoom y los grupos.
 *
 *   python scripts/modelo_referencia.py   # (en la raíz) genera .cache/vista_previa/
 *   npm run demo                          # (en visual/) escribe .tmp/demo/index.html
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import less from "less";

const aqui = (ruta: string): URL => new URL(ruta, import.meta.url);

const css = (await less.render(readFileSync(aqui("../style/visual.less"), "utf8"))).css;
const resultado = await build({
    entryPoints: [aqui("demo/entrada.ts").pathname],
    bundle: true,
    write: false,
    format: "iife",
    target: "es2020",
    minify: true,
    // Los estilos van aparte (ya compilados); los textos son JSON.
    loader: { ".less": "empty", ".resjson": "json" },
    logLevel: "warning",
});
const js = resultado.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const pagina = readFileSync(aqui("demo/plantilla.html"), "utf8")
    .replace("/*CSS*/", () => css)
    .replace("/*JS*/", () => js);

mkdirSync(aqui("../.tmp/demo/"), { recursive: true });
writeFileSync(aqui("../.tmp/demo/index.html"), pagina);
console.log(`• visual/.tmp/demo/index.html (${Math.round(pagina.length / 1024)} KB): ábrelo en el navegador`);
