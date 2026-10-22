// =====================================================================
// Parámetros (Inicio > Administrar parámetros > Nuevo, tipo Texto), o pega
// cada bloque en una consulta en blanco con el nombre indicado.
// =====================================================================


// ---------------------------------------------------------------------
// Parámetro: RutaProyecto
// Carpeta donde clonaste o descomprimiste el repositorio.
// ---------------------------------------------------------------------
"C:\mapa-mx-powerbi\" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]


// ---------------------------------------------------------------------
// Parámetro: RutaMapeo
// Ruta COMPLETA del CSV que relaciona tus tiendas o zonas con claves INEGI
// (columnas CADENA, UBICACION, CVE_ENT, CVEGEO). Tu archivo real debe vivir
// FUERA del repositorio o en la carpeta privado\, que git ignora.
// Por defecto apunta al mapeo ficticio del ejemplo.
// ---------------------------------------------------------------------
"C:\mapa-mx-powerbi\ejemplo\config\mapeo_ubicaciones.csv" meta [IsParameterQuery = true, Type = "Text", IsParameterQueryRequired = true]
