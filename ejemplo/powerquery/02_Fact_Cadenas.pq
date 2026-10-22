// Consulta: Fact_Cadenas  (se carga al modelo)
//
// Toma todas las cadenas de la consulta "Cadenas", resuelve la ubicación de
// cada una a claves INEGI y deja una tabla compacta:
//   CADENA, FECHA, CVEGEO, UPC_KEY, UNIDADES, VENTAS
//
// Rendimiento con millones de filas:
//   * La resolución de ubicaciones trabaja sobre valores ÚNICOS (cientos o miles),
//     no sobre cada fila; luego se une de regreso con una sola combinación.
//     Ojo: eso recorre las fuentes dos veces (valores únicos + combinación).
//   * UPC se guarda como entero (UPC_KEY): ocupa menos memoria que el texto.
//   * AgruparPorMunicipio = true suma tiendas del mismo municipio, semana y UPC;
//     reduce filas si tus cadenas reportan por tienda y no necesitas ver la tienda.
let
    AgruparPorMunicipio = true,

    Ubicaciones = Table.Distinct(Table.SelectColumns(Cadenas, {"CADENA", "UBICACION", "TIPO_UBICACION"})),
    Resueltas = Table.Buffer(
        Table.RenameColumns(
            Funciones[ResolverUbicaciones](Ubicaciones),
            {{"CADENA", "R_CADENA"}, {"UBICACION", "R_UBICACION"}}
        )
    ),
    ConClaves = Table.Join(Cadenas, {"CADENA", "UBICACION"}, Resueltas, {"R_CADENA", "R_UBICACION"}, JoinKind.LeftOuter),

    ConUpc = Table.AddColumn(ConClaves, "UPC_KEY", each Funciones[LlaveUpc]([UPC]), Int64.Type),
    Columnas = Table.SelectColumns(ConUpc, {"CADENA", "FECHA", "CVEGEO", "UPC_KEY", "UNIDADES", "VENTAS"}),

    Agrupada =
        if AgruparPorMunicipio then
            Table.Group(
                Columnas,
                {"CADENA", "FECHA", "CVEGEO", "UPC_KEY"},
                {
                    {"UNIDADES", each List.Sum([UNIDADES]), type number},
                    {"VENTAS", each List.Sum([VENTAS]), type number}
                }
            )
        else
            Columnas,

    Tipos = Table.TransformColumnTypes(
        Agrupada,
        {{"CADENA", type text}, {"FECHA", type date}, {"CVEGEO", type text}, {"UPC_KEY", Int64.Type},
         {"UNIDADES", type number}, {"VENTAS", Currency.Type}}
    )
in
    Tipos
