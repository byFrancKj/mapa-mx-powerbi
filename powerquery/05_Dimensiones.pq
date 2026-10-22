// =====================================================================
// Dimensiones (todas se cargan al modelo). Una consulta por bloque.
// Las claves INEGI se quedan como TEXTO: "01" y "01001", nunca 1 ni 1001.
// =====================================================================


// ---------------------------------------------------------------------
// Consulta: Dim_Geo   (32 estados)
// ---------------------------------------------------------------------
let
    Origen = Funciones[LeerCsv]("catalogos\dim_geo.csv"),
    Renombrada = Table.RenameColumns(Origen, {{"NOMBRE_CORTO", "ESTADO"}}),
    Tipos = Table.TransformColumnTypes(
        Renombrada,
        {{"CVE_ENT", type text}, {"NOM_ENT", type text}, {"ESTADO", type text}, {"ABREV", type text},
         {"ISO_3166_2", type text}, {"REGION_NIELSEN", type text}, {"REGION_DIVIDIDA", Int64.Type},
         {"POBLACION_2020", Int64.Type}, {"LON", type number}, {"LAT", type number}},
        "en-US"
    )
in
    Tipos


// ---------------------------------------------------------------------
// Consulta: Dim_Municipio   (2,475 municipios + 32 filas "XX000 sin municipio")
// ---------------------------------------------------------------------
let
    Origen = Funciones[LeerCsv]("catalogos\dim_municipio.csv"),
    Renombrada = Table.RenameColumns(Origen, {{"REGION_NIELSEN", "REGION_NIELSEN_MUN"}}),
    Tipos = Table.TransformColumnTypes(
        Renombrada,
        {{"CVEGEO", type text}, {"CVE_ENT", type text}, {"CVE_MUN", type text}, {"MUNICIPIO", type text},
         {"REGION_NIELSEN_MUN", type text}, {"LON", type number}, {"LAT", type number}},
        "en-US"
    )
in
    Tipos


// ---------------------------------------------------------------------
// Consulta: Dim_Region   (regiones Nielsen)
// ---------------------------------------------------------------------
let
    Origen = Funciones[LeerCsv]("catalogos\dim_region.csv"),
    Tipos = Table.TransformColumnTypes(Origen, {{"REGION_NIELSEN", type text}, {"ORDEN", Int64.Type}, {"ESTADOS", type text}})
in
    Tipos


// ---------------------------------------------------------------------
// Consulta: Dim_Producto   (cambia la ruta por tu catálogo de UPC)
// ---------------------------------------------------------------------
let
    Origen = Funciones[LeerCsv]("ejemplo\dim_producto.csv"),
    ConLlave = Table.AddColumn(Origen, "UPC_KEY", each Funciones[LlaveUpc]([UPC]), Int64.Type),
    SinDuplicados = Table.Distinct(ConLlave, {"UPC_KEY"}),
    Tipos = Table.TransformColumnTypes(
        SinDuplicados,
        {{"UPC", type text}, {"DESCRIPCION", type text}, {"MARCA", type text}, {"CATEGORIA", type text},
         {"FABRICANTE", type text}, {"PRECIO_REF", type number}},
        "en-US"
    )
in
    Tipos
