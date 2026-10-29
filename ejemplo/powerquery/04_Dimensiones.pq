// =====================================================================
// Dimensiones del ejemplo (todas se cargan al modelo). Una consulta por bloque.
// Dim_Geo y Dim_Municipio son los catálogos del puente INEGI; aquí Dim_Geo
// además recibe la región de cada estado, que en tu proyecto saldrá de tu
// propia tabla. Las claves INEGI se quedan como TEXTO: "01" y "01001".
// =====================================================================


// ---------------------------------------------------------------------
// Consulta: Dim_Geo   (catálogo INEGI + región del ejemplo)
// ---------------------------------------------------------------------
let
    Origen = Funciones[LeerCsv]("puente-inegi\catalogos\dim_geo.csv"),
    Regiones = Funciones[LeerCsv]("ejemplo\config\regiones_estado.csv"),
    ConRegion = Table.ExpandTableColumn(
        Table.NestedJoin(Origen, {"CVE_ENT"}, Regiones, {"CVE_ENT"}, "R", JoinKind.LeftOuter),
        "R", {"REGION"}
    ),
    Renombrada = Table.RenameColumns(ConRegion, {{"NOMBRE_CORTO", "ESTADO"}}),
    Tipos = Table.TransformColumnTypes(
        Renombrada,
        {{"CVE_ENT", type text}, {"NOM_ENT", type text}, {"ESTADO", type text}, {"ABREV", type text},
         {"ISO_3166_2", type text}, {"REGION", type text}, {"POBLACION_2020", Int64.Type},
         {"LON", type number}, {"LAT", type number}},
        "en-US"
    )
in
    Tipos


// ---------------------------------------------------------------------
// Consulta: Dim_Municipio   (catálogo INEGI: 2,475 municipios + 32 filas "XX000")
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


// ---------------------------------------------------------------------
// Consulta: Dim_Region   (regiones del ejemplo; ordena REGION por ORDEN)
// ---------------------------------------------------------------------
let
    Origen = Funciones[LeerCsv]("ejemplo\config\regiones_orden.csv"),
    Tipos = Table.TransformColumnTypes(Origen, {{"REGION", type text}, {"ORDEN", Int64.Type}})
in
    Tipos


// ---------------------------------------------------------------------
// Consulta: Dim_Producto   (cambia la ruta por tu catálogo de UPC)
// ---------------------------------------------------------------------
let
    Origen = Funciones[LeerCsv]("ejemplo\dim_producto.csv"),
    ConLlave = Table.AddColumn(Origen, "UPC_KEY", each Funciones[LlaveUpc]([UPC]), Int64.Type),
    // Sin llaves vacías ni repetidas: el lado "uno" de una relación no las admite.
    SinDuplicados = Table.Distinct(Table.SelectRows(ConLlave, each [UPC_KEY] <> null), {"UPC_KEY"}),
    Tipos = Table.TransformColumnTypes(
        SinDuplicados,
        {{"UPC", type text}, {"DESCRIPCION", type text}, {"MARCA", type text}, {"CATEGORIA", type text},
         {"FABRICANTE", type text}, {"PRECIO_REF", type number}},
        "en-US"
    )
in
    Tipos


// ---------------------------------------------------------------------
// Consulta: _Medidas   (tabla vacía que guarda las medidas; oculta su columna)
// ---------------------------------------------------------------------
let
    Origen = #table(type table [Medidas = text], {})
in
    Origen
