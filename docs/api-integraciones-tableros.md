# API de tableros — guía para el sistema consumidor

Endpoints de solo lectura que exponen indicadores de ESDOMED Services para alimentar
tableros en otro sistema. Todas las fechas se interpretan en hora de El Salvador.

## Autenticación

Cada petición lleva la llave de integración en un header:

```
x-api-key: <LLAVE>
```

También se acepta `Authorization: Bearer <LLAVE>`. Sin llave o con llave incorrecta la API
responde `401`. La llave la entrega ESDOMED (variable `INTEGRACIONES_API_KEY` en Vercel).

## Tableros disponibles

| id | Métrica | Alcance |
|---|---|---|
| `medicina-interna` | Egresos vivos y fallecidos | Medicina Interna Hombres 1-3, Medicina Interna Mujeres 1-3, Servicio de Cardiologia, Servicio de Hematologia, Servicio de Aislados, Servicio de Oncologia, Dialisis Peritoneal |
| `cirugia` | Egresos vivos y fallecidos | Cirugía Hombres 1, Cirugía Mujeres 1, Cirugía Cardiovascular, Neurocirugia |
| `convenios` | Egresos vivos y fallecidos | Bienestar Magisterial |
| `uci` | Egresos vivos y fallecidos | Unidad de cuidados intensivos General 1 Adultos, UCI aislados Adultos, UCI cardiovascular Adultos, UCI Extracorpórea Adultos, UCI Quirúrgicos Adultos, Unidad de Cuidados Neurointensivos Adultos, Unidad de Cuidados Coronarios y Posquirúrgicos Cardiovasculares |
| `ucin` | Egresos vivos y fallecidos | Unidad de Cuidados Intermedios Adultos MINSAL, Intermedios Crónicos Adultos, Intermedios Aislados Adultos |
| `paliativos` | Egresos vivos y fallecidos | Dolor y Cuidados Paliativos |
| `apoyo-riiss` | Ingresos totales por mes | Todo el hospital |

`GET /api/integraciones/tableros` devuelve este mismo índice en JSON.

## Consulta

```
GET /api/integraciones/tableros/{id}?anio=2026
GET /api/integraciones/tableros/{id}?mes=2026-08
GET /api/integraciones/tableros/{id}?desde=2026-01-01&hasta=2026-06-30
```

| Parámetro | Descripción |
|---|---|
| `anio=YYYY` | Serie mensual del año. Es el valor por defecto si no se envía ningún parámetro de fecha. |
| `mes=YYYY-MM` | Un solo mes. |
| `desde` / `hasta` | Rango libre `YYYY-MM-DD`, ambos inclusive, máximo 366 días. |
| `detalle=1` | Agrega la lista de pacientes egresados (contiene datos personales; solo tableros de egresos). |
| `refrescar=1` | Ignora la caché de 10 minutos y vuelve a consultar la base. |

## Respuesta — tableros de egresos

```json
{
  "tablero": "medicina-interna",
  "nombre": "Hospitalización Medicina Interna",
  "metrica": "egresos",
  "rango": { "desde": "2026-01-01", "hasta": "2026-12-31", "zonaHoraria": "America/El_Salvador" },
  "servicios": ["Medicina Interna Hombres 1", "..."],
  "total": 1234, "vivos": 1100, "fallecidos": 134,
  "porSexo": { "masculino": 600, "femenino": 630, "otro": 4 },
  "porMes": [{ "mes": "2026-01", "total": 100, "vivos": 90, "fallecidos": 10 }],
  "porServicio": [{ "servicio": "Medicina Interna Hombres 1", "total": 200, "vivos": 180, "fallecidos": 20, "masculino": 200, "femenino": 0, "otro": 0 }],
  "porModalidad": [{ "estado": "alta_vivo", "tipo": "vivo", "modalidad": "Domicilio", "total": 900 }],
  "filas": [{ "mes": "2026-01", "servicio": "Medicina Interna Hombres 1", "sexo": "masculino", "tipo": "vivo", "estado": "alta_vivo", "modalidad": "Domicilio", "total": 15 }],
  "generadoEn": "2026-09-02T15:00:00.000Z",
  "cache": { "estado": "miss", "ttlMinutos": 10 }
}
```

`filas` es la tabla plana (mes × servicio × sexo × modalidad) pensada para cargarla
directo en la herramienta de BI; los demás bloques son los mismos datos ya agregados.
Los meses del rango y los servicios del grupo siempre aparecen, aunque vayan en cero.

Semántica: un egreso es un ingreso con fecha de egreso dentro del rango; el servicio es
aquel en el que estaba el paciente al egresar. Egreso vivo agrupa las modalidades
domicilio, voluntaria/exigida, traslado a otro hospital, fuga e in extremis. Es la misma
regla que la Reportería → Tabuladores del dashboard, así que los números coinciden.

## Respuesta — `apoyo-riiss` (ingresos)

```json
{
  "tablero": "apoyo-riiss",
  "nombre": "Servicio de apoyo a RIISS",
  "metrica": "ingresos",
  "rango": { "desde": "2026-01-01", "hasta": "2026-12-31", "zonaHoraria": "America/El_Salvador" },
  "total": 9876,
  "porMes": [{ "mes": "2026-01", "total": 800 }, { "mes": "2026-02", "total": 790 }],
  "generadoEn": "2026-09-02T15:00:00.000Z",
  "cache": { "estado": "miss", "ttlMinutos": 10 }
}
```

## Ejemplo en Power BI (Power Query M)

```m
let
    Origen = Json.Document(
        Web.Contents(
            "https://<dominio-de-la-app>/api/integraciones/tableros/medicina-interna",
            [ Query = [ anio = "2026" ], Headers = [ #"x-api-key" = "<LLAVE>" ] ]
        )
    ),
    Filas = Table.FromRecords(Origen[filas])
in
    Filas
```

Para `apoyo-riiss` usar `Table.FromRecords(Origen[porMes])`. En Power BI Desktop, al
pedir credenciales elegir **Anónimo**: la llave viaja en el header definido en la consulta.

## Errores

| Código | Motivo |
|---|---|
| 400 | Parámetros de fecha inválidos o rango mayor a 366 días |
| 401 | Llave ausente o incorrecta |
| 404 | Id de tablero desconocido (la respuesta lista los disponibles) |
| 503 | La integración no está configurada en el servidor |
