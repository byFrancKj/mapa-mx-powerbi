// Consulta: Fact_Nielsen  (se carga al modelo)
//
// Venta de Nielsen por región, periodo y UPC. Cambia la ruta y el registro
// de columnas para tu extracción. Los nombres de región deben coincidir con
// config\regiones_estado.csv (revisa la consulta Control_Nielsen).
//
// FECHA es el primer día del periodo Nielsen (mes, bimestre o 4 semanas).
let
    Origen = Funciones[LeerCsv]("ejemplo\nielsen\nielsen_regiones.csv"),

    Columnas = [FECHA = "PERIODO", REGION_NIELSEN = "REGION_NIELSEN", UPC = "UPC", UNIDADES = "UNIDADES", VENTAS = "VENTAS"],
    Cultura = "en-US",

    Seleccion = Table.SelectColumns(Origen, Record.FieldValues(Columnas)),
    Renombrada = Table.RenameColumns(
        Seleccion,
        List.Select(List.Zip({Record.FieldValues(Columnas), Record.FieldNames(Columnas)}), each _{0} <> _{1})
    ),
    Region = Table.TransformColumns(Renombrada, {{"REGION_NIELSEN", Text.Trim, type text}}),
    ConUpc = Table.AddColumn(Region, "UPC_KEY", each Funciones[LlaveUpc]([UPC]), Int64.Type),
    Tipos = Table.TransformColumnTypes(
        Table.RemoveColumns(ConUpc, {"UPC"}),
        {{"FECHA", type date}, {"UNIDADES", type number}, {"VENTAS", Currency.Type}},
        Cultura
    )
in
    Tipos
