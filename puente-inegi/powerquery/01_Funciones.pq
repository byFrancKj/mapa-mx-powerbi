// Consulta "Funciones" (desactiva "Habilitar carga").
// Agrupa las funciones auxiliares en un solo registro para no crear muchas consultas:
//   Funciones[LeerCsv]("puente-inegi\alias_estados.csv")   ruta relativa al proyecto o completa
//   Funciones[Normalizar]("Edo. de México")  -> "EDO DE MEXICO"
//   Funciones[Estandarizar](tabla, "Cadena X", [FECHA = "...", UBICACION = "...", ...], "es-MX", "tienda")
//   Funciones[ResolverUbicaciones](tablaDeUbicacionesUnicas)
let
    // Lee un CSV UTF-8. Acepta una ruta relativa a RutaProyecto o una ruta completa
    // ("D:\privado\mapeo.csv", "\\servidor\carpeta\mapeo.csv").
    // Todas las columnas llegan como texto: así no se pierden ceros a la izquierda.
    LeerCsv = (ruta as text) as table =>
        let
            Base = if Text.EndsWith(RutaProyecto, "\") then RutaProyecto else RutaProyecto & "\",
            Completa = if Text.Contains(ruta, ":") or Text.StartsWith(ruta, "\\") then ruta else Base & ruta,
            Origen = Csv.Document(
                File.Contents(Completa),
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
            // Acentos escritos como carácter aparte (texto "NFD", común en archivos de Mac)
            SinCombinantes = Text.Remove(Mayus, List.Transform({768..879}, Character.FromNumber)),
            Pares = {{"Á", "A"}, {"É", "E"}, {"Í", "I"}, {"Ó", "O"}, {"Ú", "U"}, {"Ü", "U"}, {"Ñ", "N"},
                     {"À", "A"}, {"È", "E"}, {"Ì", "I"}, {"Ò", "O"}, {"Ù", "U"}},
            SinAcentos = List.Accumulate(Pares, SinCombinantes, (t, p) => Text.Replace(t, p{0}, p{1})),
            Permitidos = {"A".."Z"} & {"0".."9"},
            SoloAlfanum = Text.Combine(List.Transform(Text.ToList(SinAcentos), each if List.Contains(Permitidos, _) then _ else " ")),
            Compacto = Text.Combine(List.Select(Text.Split(SoloAlfanum, " "), each _ <> ""), " ")
        in
            Compacto,

    // Lleva la tabla de una cadena al formato estándar:
    //   CADENA, FECHA, UPC, UBICACION, UNIDADES, VENTAS, TIPO_UBICACION
    // "columnas" es un registro [NOMBRE_ESTANDAR = "nombre en tu archivo"].
    // "cultura" controla cómo se leen fechas y números ("en-US": 2026-01-31 y 1234.56;
    // "es-MX": 31/01/2026 y 1,234.56).
    // "tipoUbicacion" dice qué es UBICACION y evita interpretaciones por accidente:
    //   "tienda"     solo se resuelve con el mapeo (un ID numérico nunca se toma como clave INEGI)
    //   "estado"     mapeo, nombre del estado (alias) o clave de 1-2 dígitos
    //   "municipio"  mapeo o clave numérica (4-5 dígitos = municipio, 1-2 = estado)
    //   "auto"       (predeterminado) prueba todo lo anterior
    Estandarizar = (tabla as table, nombreCadena as text, columnas as record, optional cultura as nullable text,
                    optional tipoUbicacion as nullable text) as table =>
        let
            Cultura = if cultura = null then "en-US" else cultura,
            Tipo = if tipoUbicacion = null then "auto" else tipoUbicacion,
            Origenes = Record.FieldValues(columnas),
            Estandar = Record.FieldNames(columnas),
            Seleccion = Table.SelectColumns(tabla, Origenes),
            Pares = List.Select(List.Zip({Origenes, Estandar}), each _{0} <> _{1}),
            Renombrada = Table.RenameColumns(Seleccion, Pares),
            ConCadena = Table.AddColumn(Renombrada, "CADENA", each nombreCadena, type text),
            ConTipo = Table.AddColumn(ConCadena, "TIPO_UBICACION", each Tipo, type text),
            ComoTexto = Table.TransformColumnTypes(ConTipo, {{"UPC", type text}, {"UBICACION", type text}}),
            Tipos = Table.TransformColumnTypes(ComoTexto, {{"FECHA", type date}, {"UNIDADES", type number}, {"VENTAS", type number}}, Cultura)
        in
            Table.SelectColumns(Tipos, {"CADENA", "FECHA", "UPC", "UBICACION", "UNIDADES", "VENTAS", "TIPO_UBICACION"}),

    // Resuelve cada (CADENA, UBICACION) única a claves INEGI:
    //   1. El mapeo (archivo de RutaMapeo) manda: si la ubicación está ahí, se usa
    //      solo lo que dice el mapeo (CVEGEO, o el estado si CVEGEO va vacío).
    //   2. Si no está en el mapeo, según TIPO_UBICACION: clave numérica
    //      (4-5 dígitos = municipio, 1-2 = estado) o nombre del estado (alias).
    // Las ubicaciones resueltas solo a estado quedan en el municipio "XX000".
    ResolverUbicaciones = (ubicaciones as table) as table =>
        let
            // Una ubicación repetida en el mapeo duplicaría ventas: se usa la primera
            // (Control_Ubicaciones las reporta).
            Mapeo = Table.Buffer(
                Table.Distinct(
                    Table.AddColumn(LeerCsv(RutaMapeo), "NORM", each Normalizar([UBICACION]), type text),
                    {"CADENA", "NORM"}
                )
            ),
            Alias = Table.Buffer(Table.Distinct(LeerCsv("puente-inegi\alias_estados.csv"), {"ALIAS"})),
            ConTipo =
                if Table.HasColumns(ubicaciones, "TIPO_UBICACION") then ubicaciones
                else Table.AddColumn(ubicaciones, "TIPO_UBICACION", each "auto", type text),
            ConNorm = Table.AddColumn(ConTipo, "NORM", each Normalizar([UBICACION]), type text),
            PorMapeo = Table.NestedJoin(ConNorm, {"CADENA", "NORM"}, Mapeo, {"CADENA", "NORM"}, "M", JoinKind.LeftOuter),
            ExpM = Table.ExpandTableColumn(PorMapeo, "M", {"CVE_ENT", "CVEGEO"}, {"M_ENT", "M_GEO"}),
            PorAlias = Table.NestedJoin(ExpM, {"NORM"}, Alias, {"ALIAS"}, "A", JoinKind.LeftOuter),
            ExpA = Table.ExpandTableColumn(PorAlias, "A", {"CVE_ENT"}, {"A_ENT"}),
            Vacio = (v) => v = null or v = "",
            Claves = Table.AddColumn(ExpA, "R", each
                let
                    tipo = [TIPO_UBICACION],
                    enMapeo = not Vacio([M_ENT]) or not Vacio([M_GEO]),
                    dig = if not Vacio([NORM]) and Text.Select([NORM], {"0".."9"}) = [NORM] then [NORM] else null,
                    digitosMun = tipo = "auto" or tipo = "municipio",
                    digitosEnt = tipo = "auto" or tipo = "estado" or tipo = "municipio",
                    porAlias = tipo = "auto" or tipo = "estado",
                    geo =
                        if enMapeo then (if Vacio([M_GEO]) then null else Text.PadStart([M_GEO], 5, "0"))
                        else if digitosMun and dig <> null and Text.Length(dig) >= 4 and Text.Length(dig) <= 5
                            then Text.PadStart(dig, 5, "0")
                        else null,
                    ent =
                        if enMapeo then
                            (if not Vacio([M_ENT]) then Text.PadStart([M_ENT], 2, "0")
                             else if geo <> null then Text.Start(geo, 2) else null)
                        else if geo <> null then Text.Start(geo, 2)
                        else if porAlias and not Vacio([A_ENT]) then Text.PadStart([A_ENT], 2, "0")
                        else if digitosEnt and dig <> null and Text.Length(dig) <= 2 then Text.PadStart(dig, 2, "0")
                        else null
                in
                    [CVE_ENT = ent, CVEGEO = if geo <> null then geo else if ent <> null then ent & "000" else null]),
            Expandida = Table.ExpandRecordColumn(Claves, "R", {"CVE_ENT", "CVEGEO"}),
            Resultado = Table.TransformColumnTypes(
                Table.SelectColumns(Expandida, {"CADENA", "UBICACION", "CVE_ENT", "CVEGEO"}),
                {{"CVE_ENT", type text}, {"CVEGEO", type text}}
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
