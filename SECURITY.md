# Seguridad

## Qué hace y qué no hace el visual

- **No se conecta a internet.** El visual no declara el privilegio `WebAccess` (revisa `privileges` en [`visual/capabilities.json`](visual/capabilities.json)), así que Power BI le bloquea cualquier conexión externa. El CI falla si alguien lo agrega.
- **No guarda nada.** No usa almacenamiento local ni exporta archivos.
- **Solo ve lo que pones en sus campos.** Power BI le entrega una tabla con la clave INEGI y los valores de tus medidas; tu modelo y tus datos se quedan en Power BI.
- **La geometría va dentro.** Los límites de INEGI están empaquetados en el visual, así que no descarga mapas.

## Cómo verificar lo que instalas

Cada versión se compila en GitHub Actions a partir del código de la etiqueta correspondiente y se publica como *release* con:

- `SHA256SUMS.txt`, la huella del archivo `.pbiviz`. Compárala con `shasum -a 256 archivo.pbiviz` (macOS) o `Get-FileHash archivo.pbiviz` (Windows).
- Una atestación de origen que prueba qué commit generó el archivo:

  ```bash
  gh attestation verify archivo.pbiviz --repo <usuario>/mapa-mx-powerbi
  ```

En una organización, lo recomendable es que un administrador suba ese archivo como **visual de la organización** (Portal de administración › Objetos visuales de la organización) para que todos usen la versión revisada.

## Datos

- Nunca subas datos reales al repositorio ni los adjuntes en *issues*: usa los datos ficticios de `ejemplo/`.
- Tus archivos reales van en `privado/` o fuera del repositorio. `scripts/revisar_datos.py` lo revisa en cada commit (gancho en `.githooks/`) y en el CI.

## Reportar una vulnerabilidad

Usa el reporte privado de GitHub: pestaña **Security › Report a vulnerability** del repositorio. No abras un *issue* público para temas de seguridad.
