// Consulta: Fact_Mercado  (se carga al modelo)
//
// Venta del mercado por región, periodo y UPC. Cambia la ruta y el registro
// de columnas para tu extracción. Los nombres de región deben coincidir con
// ejemplo\config\regiones_estado.csv o tu tabla de regiones (revisa la consulta
// Control_Mercado).
//
// FECHA es el primer día del periodo del mercado (mes, bimestre o 4 semanas).
let
    Origen = Funciones[LeerCsv]("ejemplo\mercado\mercado_regiones.csv"),

    Columnas = [FECHA = "PERIODO", REGION = "REGION", UPC = "UPC", UNIDADES = "UNIDADES", VENTAS = "VENTAS"],
    Cultura = "en-US",

    Seleccion = Table.SelectColumns(Origen, Record.FieldValues(Columnas)),
    Renombrada = Table.RenameColumns(
        Seleccion,
        List.Select(List.Zip({Record.FieldValues(Columnas), Record.FieldNames(Columnas)}), each _{0} <> _{1})
    ),
    Region = Table.TransformColumns(Renombrada, {{"REGION", Text.Trim, type text}}),
    ConUpc = Table.AddColumn(Region, "UPC_KEY", each Funciones[LlaveUpc]([UPC]), Int64.Type),
    Tipos = Table.TransformColumnTypes(
        Table.RemoveColumns(ConUpc, {"UPC"}),
        {{"FECHA", type date}, {"UNIDADES", type number}, {"VENTAS", Currency.Type}},
        Cultura
    )
in
    Tipos
