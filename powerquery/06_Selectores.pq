// =====================================================================
// Tablas de selección (se cargan al modelo, sin relaciones).
// Cada fila es una métrica que el mapa puede mostrar. Las columnas le dicen
// a Deneb cómo colorearla:
//   ESCALA      "secuencial" (quintiles, de claro a oscuro) o "divergente"
//               (rojo por debajo · gris similar · azul por encima de CENTRO)
//   CENTRO      valor neutro de la escala divergente (100 en índices, 0 en brechas)
//   UMBRAL_1/2  distancia al centro que separa "similar" / "por encima" / "muy por encima"
//   FORMATO_DAX formato para textos y leyenda (función FORMAT de DAX)
//   SUFIJO      texto que se agrega al número (p. ej. " pp")
//   ABREVIAR    "dinero" o "numero" para mostrar M y mil M; vacío = usar FORMATO_DAX
//   MUNICIPAL   la métrica existe a nivel municipio (las que usan población
//               o Nielsen solo existen por estado o región)
// Agrega filas aquí y su caso en la medida [Valor Mapa].
// =====================================================================


// ---------------------------------------------------------------------
// Consulta: Selector Métrica
// ---------------------------------------------------------------------
let
    Tipo = type table [
        ORDEN = Int64.Type, METRICA = text, ESCALA = text, CENTRO = number, UMBRAL_1 = number, UMBRAL_2 = number,
        FORMATO_DAX = text, SUFIJO = text, ABREVIAR = text, MUNICIPAL = logical
    ],
    Filas = {
        {1,  "Ventas Cadenas",                                        "secuencial", 0,   0,    0,    "$#,0",              "",    "dinero", true},
        {2,  "Unidades Cadenas",                                      "secuencial", 0,   0,    0,    "#,0",               "",    "numero", true},
        {3,  "% de la venta nacional de las cadenas",                 "secuencial", 0,   0,    0,    "0.0%",              "",    "",       true},
        {4,  "Ventas Cadenas por 1,000 habitantes",                   "secuencial", 0,   0,    0,    "$#,0",              "",    "",       false},
        {5,  "Índice per cápita Cadenas (100 = promedio nacional)",   "divergente", 100, 10,   30,   "#,0",               "",    "",       false},
        {6,  "Índice Cadenas vs Nielsen (100 = misma distribución)",  "divergente", 100, 10,   30,   "#,0",               "",    "",       false},
        {7,  "Brecha de distribución vs Nielsen (pp)",                "divergente", 0,   0.25, 1,    "+0.00;-0.00;0.00",  " pp", "",       false},
        {8,  "Índice vs Nielsen solo donde la cadena tiene venta",    "divergente", 100, 10,   30,   "#,0",               "",    "",       false},
        {9,  "Crecimiento Cadenas vs año anterior",                   "divergente", 0,   0.02, 0.08, "+0.0%;-0.0%;0.0%",  "",    "",       true},
        {10, "Brecha de crecimiento vs Nielsen (pp)",                 "divergente", 0,   1,    5,    "+0.0;-0.0;0.0",     " pp", "",       false},
        {11, "Precio promedio Cadenas",                               "secuencial", 0,   0,    0,    "$#,0.00",           "",    "",       true},
        {12, "Índice de precio Cadenas vs Nielsen (100 = igual)",     "divergente", 100, 2,    6,    "#,0",               "",    "",       false},
        {13, "Ventas Nielsen (región)",                               "secuencial", 0,   0,    0,    "$#,0",              "",    "dinero", false},
        {14, "Crecimiento Nielsen vs año anterior (región)",          "divergente", 0,   0.02, 0.08, "+0.0%;-0.0%;0.0%",  "",    "",       false}
    }
in
    #table(Tipo, Filas)


// ---------------------------------------------------------------------
// Consulta: Selector Métrica 2   (eje Y del mapa bivariado; misma lista)
// ---------------------------------------------------------------------
let
    Origen = #"Selector Métrica"
in
    Origen


// ---------------------------------------------------------------------
// Consulta: Selector Comparación   (mapa lado a lado Cadenas vs Nielsen por región)
// ---------------------------------------------------------------------
let
    Tipo = type table [
        ORDEN = Int64.Type, COMPARACION = text, ESCALA = text, CENTRO = number, UMBRAL_1 = number, UMBRAL_2 = number,
        FORMATO_DAX = text, SUFIJO = text
    ],
    Filas = {
        {1, "Distribución de la venta por región (% del total)",   "secuencial", 0,   0,    0,    "0.0%",             ""},
        {2, "Intensidad per cápita (100 = promedio nacional)",     "divergente", 100, 10,   30,   "#,0",              ""},
        {3, "Crecimiento vs año anterior",                          "divergente", 0,   0.02, 0.08, "+0.0%;-0.0%;0.0%", ""},
        {4, "Precio promedio",                                      "secuencial", 0,   0,    0,    "$#,0.00",          ""}
    }
in
    #table(Tipo, Filas)


// ---------------------------------------------------------------------
// Consulta: _Medidas   (tabla vacía que guarda las medidas; oculta su columna)
// ---------------------------------------------------------------------
let
    Origen = #table(type table [Medidas = text], {})
in
    Origen
