// =====================================================================
// Consultas de control (desactiva "Habilitar carga"). Ábrelas en el editor
// de Power Query después de agregar una cadena o una extracción de Nielsen:
// si muestran filas, hay datos que no van a aparecer en el mapa.
// =====================================================================


// ---------------------------------------------------------------------
// Consulta: Control_Ubicaciones
// Ubicaciones de las cadenas que no se pudieron convertir en una clave INEGI
// válida. Corrígelas en config\mapeo_ubicaciones.csv o config\alias_estados.csv.
// ---------------------------------------------------------------------
let
    Fuentes = Table.Combine({Cadena_A, Cadena_B, Cadena_C}),
    Unicas = Table.Distinct(Table.SelectColumns(Fuentes, {"CADENA", "UBICACION"})),
    Resueltas = Funciones[ResolverUbicaciones](Unicas),
    Validas = List.Buffer(Dim_Municipio[CVEGEO]),
    Problemas = Table.SelectRows(Resueltas, each [CVE_ENT] = null or not List.Contains(Validas, [CVEGEO])),
    Motivo = Table.AddColumn(Problemas, "MOTIVO", each
        if [CVE_ENT] = null then "No se reconoce la ubicación" else "La clave municipal no existe en el catálogo INEGI", type text)
in
    Motivo


// ---------------------------------------------------------------------
// Consulta: Control_Nielsen
// Regiones de la extracción de Nielsen que no existen en Dim_Region y UPC sin
// catálogo. Si aparecen, ajusta config\regiones_estado.csv o el nombre en origen.
// ---------------------------------------------------------------------
let
    Regiones = List.Buffer(Dim_Region[REGION_NIELSEN]),
    Upcs = List.Buffer(Dim_Producto[UPC_KEY]),
    Faltantes = Table.SelectRows(
        Table.Distinct(Table.SelectColumns(Fact_Nielsen, {"REGION_NIELSEN", "UPC_KEY"})),
        each not List.Contains(Regiones, [REGION_NIELSEN]) or not List.Contains(Upcs, [UPC_KEY])
    ),
    Motivo = Table.AddColumn(Faltantes, "MOTIVO", each
        if not List.Contains(Regiones, [REGION_NIELSEN]) then "Región Nielsen sin geometría" else "UPC sin catálogo", type text)
in
    Motivo
