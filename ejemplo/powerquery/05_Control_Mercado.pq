// ---------------------------------------------------------------------
// Consulta: Control_Mercado   (desactiva "Habilitar carga")
// Regiones de la extracción del mercado que no existen en Dim_Region y UPC sin
// catálogo. Si aparecen, ajusta ejemplo\config\regiones_*.csv (o tu tabla de
// regiones) o el nombre en origen.
// ---------------------------------------------------------------------
let
    Regiones = List.Buffer(Dim_Region[REGION]),
    Upcs = List.Buffer(Dim_Producto[UPC_KEY]),
    Faltantes = Table.SelectRows(
        Table.Distinct(Table.SelectColumns(Fact_Mercado, {"REGION", "UPC_KEY"})),
        each not List.Contains(Regiones, [REGION]) or not List.Contains(Upcs, [UPC_KEY])
    ),
    Motivo = Table.AddColumn(Faltantes, "MOTIVO", each
        if not List.Contains(Regiones, [REGION]) then "Región sin definir en Dim_Region" else "UPC sin catálogo", type text)
in
    Motivo
