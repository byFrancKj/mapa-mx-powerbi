// Registra un cargador que ignora las hojas de estilo: en Node, `import "./visual.less"`
// no tiene sentido (en Power BI las compila pbiviz).
import { register } from "node:module";

register("./cargador-estilos.mjs", import.meta.url);
