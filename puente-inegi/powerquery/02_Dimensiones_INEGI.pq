// =====================================================================
// Catálogos INEGI como dimensiones (se cargan al modelo). Relaciona con ellas
// tus tablas de hechos por CVE_ENT o CVEGEO; después usa Dim_Geo[CVE_ENT] o
// Dim_Municipio[CVEGEO] en el campo "Ubicación" del visual.
// Las claves se quedan como TEXTO: "01" y "01001", nunca 1 ni 1001.
// =====================================================================


// ---------------------------------------------------------------------
// Consulta: Dim_Geo   (32 estados; población del Censo 2020)
// Para agregar tus propias regiones, combina aquí tu tabla CVE_ENT -> REGION
// (ver ejemplo\powerquery\04_Dimensiones.pq).
// ---------------------------------------------------------------------
let
    Origen = Funciones[LeerCsv]("puente-inegi\catalogos\dim_geo.csv"),
    Renombrada = Table.RenameColumns(Origen, {{"NOMBRE_CORTO", "ESTADO"}}),
    Tipos = Table.TransformColumnTypes(
        Renombrada,
        {{"CVE_ENT", type text}, {"NOM_ENT", type text}, {"ESTADO", type text}, {"ABREV", type text},
         {"ISO_3166_2", type text}, {"POBLACION_2020", Int64.Type}, {"LON", type number}, {"LAT", type number}},
        "en-US"
    )
in
    Tipos


// ---------------------------------------------------------------------
// Consulta: Dim_Municipio   (2,475 municipios + 32 filas "XX000 sin municipio")
// ---------------------------------------------------------------------
let
    Origen = Funciones[LeerCsv]("puente-inegi\catalogos\dim_municipio.csv"),
    Tipos = Table.TransformColumnTypes(
        Origen,
        {{"CVEGEO", type text}, {"CVE_ENT", type text}, {"CVE_MUN", type text}, {"MUNICIPIO", type text},
         {"LON", type number}, {"LAT", type number}},
        "en-US"
    )
in
    Tipos
