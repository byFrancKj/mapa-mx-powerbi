// =====================================================================
// Una consulta por cadena (desactiva "Habilitar carga" en cada una).
// Cada cadena entrega su archivo como quiera; aquí solo dices qué columna
// de su archivo corresponde a cada campo estándar y qué tipo de ubicación trae.
//
//   FECHA      fecha de la venta o inicio de la semana
//   UBICACION  lo que identifique dónde se vendió: ID de tienda, nombre del
//              estado o clave INEGI (estatal o municipal)
//   UPC        código de barras
//   UNIDADES   piezas
//   VENTAS     importe
//
// Para agregar una cadena: duplica una de estas consultas, cambia la ruta, el
// registro de columnas y el tipo de ubicación, y agrégala a la consulta
// "Cadenas" (al final). Si reporta por tienda, da de alta sus tiendas en el
// archivo de mapeo (parámetro RutaMapeo).
// =====================================================================


// ---------------------------------------------------------------------
// Consulta: Cadena_A   (venta por tienda; las tiendas se mapean en el archivo de RutaMapeo)
// ---------------------------------------------------------------------
let
    Origen = Funciones[LeerCsv]("ejemplo\cadenas\cadena_a_tiendas.csv"),
    Estandar = Funciones[Estandarizar](
        Origen,
        "Cadena A",
        [FECHA = "FECHA", UBICACION = "ID_TIENDA", UPC = "UPC", UNIDADES = "UNIDADES", VENTAS = "VENTAS"],
        "en-US",
        "tienda"
    )
in
    Estandar


// ---------------------------------------------------------------------
// Consulta: Cadena_B   (venta por nombre de estado, escrito "como venga")
// ---------------------------------------------------------------------
let
    Origen = Funciones[LeerCsv]("ejemplo\cadenas\cadena_b_estados.csv"),
    Estandar = Funciones[Estandarizar](
        Origen,
        "Cadena B",
        [FECHA = "SEMANA", UBICACION = "ESTADO", UPC = "CODIGO_BARRAS", UNIDADES = "PIEZAS", VENTAS = "VENTA_NETA"],
        "en-US",
        "estado"
    )
in
    Estandar


// ---------------------------------------------------------------------
// Consulta: Cadena_C   (venta por clave municipal INEGI, aunque llegue sin el cero inicial)
// ---------------------------------------------------------------------
let
    Origen = Funciones[LeerCsv]("ejemplo\cadenas\cadena_c_municipios.csv"),
    Estandar = Funciones[Estandarizar](
        Origen,
        "Cadena C",
        [FECHA = "FECHA", UBICACION = "CLAVE_MUN", UPC = "UPC", UNIDADES = "UNIDADES", VENTAS = "IMPORTE"],
        "en-US",
        "municipio"
    )
in
    Estandar


// ---------------------------------------------------------------------
// Consulta: Cadenas   (desactiva "Habilitar carga")
// Junta todas las cadenas. Fact_Cadenas y Control_Ubicaciones leen de aquí,
// así que una cadena nueva solo se agrega en esta lista.
// ---------------------------------------------------------------------
let
    Fuentes = Table.Combine({Cadena_A, Cadena_B, Cadena_C})
in
    Fuentes


// ---------------------------------------------------------------------
// Variantes de origen (reemplaza la línea "Origen = ..."):
//
//   Excel:   Origen = Excel.Workbook(File.Contents("D:\datos\cadena_x.xlsx"), true){[Item = "Hoja1", Kind = "Sheet"]}[Data]
//   CSV fuera del proyecto: Origen = Funciones[LeerCsv]("D:\datos\cadena_x.csv")
//            (si el archivo viene de Excel en ANSI y los acentos salen mal, usa
//             Csv.Document con Encoding = 1252)
//   Carpeta con muchos CSV del mismo formato (recomendado para millones de filas):
//            Origen = Table.Combine(
//                List.Transform(
//                    Table.SelectRows(Folder.Files("D:\datos\cadena_x"), each [Extension] = ".csv")[Content],
//                    each Table.PromoteHeaders(Csv.Document(_, [Delimiter = ",", Encoding = 65001]), [PromoteAllScalars = true])
//                )
//            )
//   Parquet: Origen = Parquet.Document(File.Contents("D:\datos\cadena_x.parquet"))
// ---------------------------------------------------------------------
