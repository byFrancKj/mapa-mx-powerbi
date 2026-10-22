// =====================================================================
// Consulta de control (desactiva "Habilitar carga"). Ábrela en el editor de
// Power Query después de agregar una fuente: si muestra filas, hay datos que
// no van a aparecer en el mapa o que caerían en el lugar equivocado.
//
// Necesita una consulta llamada "Cadenas" que junte todas tus fuentes con
// Table.Combine (ver ejemplo\powerquery\01_Cadenas_origen.pq). Así, al agregar
// una fuente nueva, basta con sumarla a "Cadenas" y el control la revisa sola.
// =====================================================================


// ---------------------------------------------------------------------
// Consulta: Control_Ubicaciones
// ---------------------------------------------------------------------
let
    Columnas = List.Intersect({{"CADENA", "UBICACION", "TIPO_UBICACION"}, Table.ColumnNames(Cadenas)}),
    Unicas = Table.Distinct(Table.SelectColumns(Cadenas, Columnas)),
    Resueltas = Funciones[ResolverUbicaciones](Unicas),
    Validas = List.Buffer(Dim_Municipio[CVEGEO]),
    Problemas = Table.SelectRows(Resueltas, each
        [CVE_ENT] = null or not List.Contains(Validas, [CVEGEO]) or Text.Start([CVEGEO], 2) <> [CVE_ENT]),
    ConMotivo = Table.AddColumn(Problemas, "MOTIVO", each
        if [CVE_ENT] = null then "No se reconoce la ubicación"
        else if not List.Contains(Validas, [CVEGEO]) then "La clave no existe en el catálogo INEGI"
        else "La clave municipal no pertenece al estado indicado", type text),

    // Ubicaciones repetidas en el mapeo (también las que solo difieren en
    // mayúsculas, acentos o puntuación, como "SUC-01" y "SUC 01").
    Mapeo = Table.AddColumn(Funciones[LeerCsv](RutaMapeo), "NORM", each Funciones[Normalizar]([UBICACION]), type text),
    Repetidas = Table.SelectRows(
        Table.Group(Mapeo, {"CADENA", "NORM"}, {
            {"UBICACION", each Text.Combine([UBICACION], " / "), type text},
            {"N", each Table.RowCount(_), Int64.Type}
        }),
        each [N] > 1
    ),
    DuplicadasMapeo = Table.AddColumn(
        Table.SelectColumns(Repetidas, {"CADENA", "UBICACION"}),
        "MOTIVO", each "Ubicación repetida en el mapeo (se usa la primera)", type text
    )
in
    Table.Combine({ConMotivo, DuplicadasMapeo})
