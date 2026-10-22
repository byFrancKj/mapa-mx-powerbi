// Consulta "Funciones" (desactiva "Habilitar carga").
// Agrupa las funciones auxiliares en un solo registro para no crear muchas consultas:
//   Funciones[LeerCsv]("config\estados.csv")
//   Funciones[Normalizar]("Edo. de México")  -> "EDO DE MEXICO"
//   Funciones[Estandarizar](tabla, "Cadena X", [FECHA = "...", UBICACION = "...", ...])
//   Funciones[ResolverUbicaciones](tablaDeUbicacionesUnicas)
let
    // Lee un CSV UTF-8 del proyecto. Todas las columnas llegan como texto:
    // así no se pierden ceros a la izquierda (CVE_ENT "01", CVEGEO "01001").
    LeerCsv = (rutaRelativa as text) as table =>
        let
            Origen = Csv.Document(
                File.Contents(RutaProyecto & rutaRelativa),
                [Delimiter = ",", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]
            ),
            Encabezados = Table.PromoteHeaders(Origen, [PromoteAllScalars = true])
        in
            Encabezados,

    // Mayúsculas, sin acentos, sin puntuación y con espacios simples.
    Normalizar = (texto as nullable text) as nullable text =>
        if texto = null then null else
        let
            Mayus = Text.Upper(Text.Trim(texto)),
            Pares = {{"Á", "A"}, {"É", "E"}, {"Í", "I"}, {"Ó", "O"}, {"Ú", "U"}, {"Ü", "U"}, {"Ñ", "N"},
                     {"À", "A"}, {"È", "E"}, {"Ì", "I"}, {"Ò", "O"}, {"Ù", "U"}},
            SinAcentos = List.Accumulate(Pares, Mayus, (t, p) => Text.Replace(t, p{0}, p{1})),
            Permitidos = {"A".."Z"} & {"0".."9"},
            SoloAlfanum = Text.Combine(List.Transform(Text.ToList(SinAcentos), each if List.Contains(Permitidos, _) then _ else " ")),
            Compacto = Text.Combine(List.Select(Text.Split(SoloAlfanum, " "), each _ <> ""), " ")
        in
            Compacto,

    // Lleva la tabla de una cadena al formato estándar:
    //   CADENA, FECHA, UPC, UBICACION, UNIDADES, VENTAS
    // "columnas" es un registro [NOMBRE_ESTANDAR = "nombre en tu archivo"].
    // "cultura" controla cómo se leen fechas y números ("en-US": 2026-01-31 y 1234.56;
    // "es-MX": 31/01/2026 y 1,234.56).
    Estandarizar = (tabla as table, nombreCadena as text, columnas as record, optional cultura as nullable text) as table =>
        let
            Cultura = if cultura = null then "en-US" else cultura,
            Origenes = Record.FieldValues(columnas),
            Estandar = Record.FieldNames(columnas),
            Seleccion = Table.SelectColumns(tabla, Origenes),
            Pares = List.Select(List.Zip({Origenes, Estandar}), each _{0} <> _{1}),
            Renombrada = Table.RenameColumns(Seleccion, Pares),
            ConCadena = Table.AddColumn(Renombrada, "CADENA", each nombreCadena, type text),
            ComoTexto = Table.TransformColumnTypes(ConCadena, {{"UPC", type text}, {"UBICACION", type text}}),
            Tipos = Table.TransformColumnTypes(ComoTexto, {{"FECHA", type date}, {"UNIDADES", type number}, {"VENTAS", type number}}, Cultura)
        in
            Table.SelectColumns(Tipos, {"CADENA", "FECHA", "UPC", "UBICACION", "UNIDADES", "VENTAS"}),

    // Resuelve cada (CADENA, UBICACION) única a claves INEGI, en este orden:
    //   1. config\mapeo_ubicaciones.csv  (tienda, sucursal o texto propio de la cadena)
    //   2. clave numérica: 4-5 dígitos = municipio (CVEGEO), 1-2 dígitos = estado
    //   3. config\alias_estados.csv      (nombre del estado escrito de muchas formas)
    // Las cadenas que solo reportan por estado quedan en el municipio "XX000".
    ResolverUbicaciones = (ubicaciones as table) as table =>
        let
            Mapeo = Table.Buffer(
                Table.AddColumn(LeerCsv("config\mapeo_ubicaciones.csv"), "NORM", each Normalizar([UBICACION]), type text)
            ),
            Alias = Table.Buffer(LeerCsv("config\alias_estados.csv")),
            ConNorm = Table.AddColumn(ubicaciones, "NORM", each Normalizar([UBICACION]), type text),
            PorMapeo = Table.NestedJoin(ConNorm, {"CADENA", "NORM"}, Mapeo, {"CADENA", "NORM"}, "M", JoinKind.LeftOuter),
            ExpM = Table.ExpandTableColumn(PorMapeo, "M", {"CVE_ENT", "CVEGEO"}, {"M_ENT", "M_GEO"}),
            PorAlias = Table.NestedJoin(ExpM, {"NORM"}, Alias, {"ALIAS"}, "A", JoinKind.LeftOuter),
            ExpA = Table.ExpandTableColumn(PorAlias, "A", {"CVE_ENT"}, {"A_ENT"}),
            Digitos = Table.AddColumn(ExpA, "DIG", each
                if [NORM] <> null and [NORM] <> "" and Text.Select([NORM], {"0".."9"}) = [NORM] then [NORM] else null, type text),
            ConGeo = Table.AddColumn(Digitos, "R_GEO", each
                if [M_GEO] <> null and [M_GEO] <> "" then Text.PadStart([M_GEO], 5, "0")
                else if [DIG] <> null and Text.Length([DIG]) >= 4 then Text.PadStart([DIG], 5, "0")
                else null, type text),
            ConEnt = Table.AddColumn(ConGeo, "R_ENT", each
                if [M_ENT] <> null and [M_ENT] <> "" then Text.PadStart([M_ENT], 2, "0")
                else if [A_ENT] <> null then [A_ENT]
                else if [R_GEO] <> null then Text.Start([R_GEO], 2)
                else if [DIG] <> null and Text.Length([DIG]) <= 2 then Text.PadStart([DIG], 2, "0")
                else null, type text),
            Final = Table.AddColumn(ConEnt, "CVEGEO", each
                if [R_GEO] <> null then [R_GEO] else if [R_ENT] <> null then [R_ENT] & "000" else null, type text),
            Resultado = Table.RenameColumns(
                Table.SelectColumns(Final, {"CADENA", "UBICACION", "R_ENT", "CVEGEO"}),
                {{"R_ENT", "CVE_ENT"}}
            )
        in
            Resultado,

    // UPC como número entero: une "0750..." y "750..." en la misma llave y comprime mejor.
    LlaveUpc = (upc as nullable text) as nullable number =>
        let d = if upc = null then "" else Text.Select(upc, {"0".."9"})
        in if d = "" then null else Number.From(d)
in
    [
        LeerCsv = LeerCsv,
        Normalizar = Normalizar,
        Estandarizar = Estandarizar,
        ResolverUbicaciones = ResolverUbicaciones,
        LlaveUpc = LlaveUpc
    ]
