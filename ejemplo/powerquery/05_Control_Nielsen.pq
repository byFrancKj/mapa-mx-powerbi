// ---------------------------------------------------------------------
// Consulta: Control_Nielsen   (desactiva "Habilitar carga")
// Regiones de la extracción de Nielsen que no existen en Dim_Region y UPC sin
// catálogo. Si aparecen, ajusta ejemplo\config\regiones_*.csv (o tu tabla de
// regiones) o el nombre en origen.
// ---------------------------------------------------------------------
let
    Regiones = List.Buffer(Dim_Region[REGION_NIELSEN]),
    Upcs = List.Buffer(Dim_Producto[UPC_KEY]),
    Faltantes = Table.SelectRows(
        Table.Distinct(Table.SelectColumns(Fact_Nielsen, {"REGION_NIELSEN", "UPC_KEY"})),
        each not List.Contains(Regiones, [REGION_NIELSEN]) or not List.Contains(Upcs, [UPC_KEY])
    ),
    Motivo = Table.AddColumn(Faltantes, "MOTIVO", each
        if not List.Contains(Regiones, [REGION_NIELSEN]) then "Región sin definir en Dim_Region" else "UPC sin catálogo", type text)
in
    Motivo
