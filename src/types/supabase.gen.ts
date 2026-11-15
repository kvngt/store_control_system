
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "catalogo_trabajo_lineas": {
                  Row: {
                    "cantidad": number,"catalogo_id": string,"costo_unitario": number | null,"descripcion": string,"especialidad": string | null,"horas": number | null,"id": string,"posicion": number,"precio": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad"?: number,"catalogo_id": string,"costo_unitario"?: number | null,"descripcion": string,"especialidad"?: string | null,"horas"?: number | null,"id"?: string,"posicion"?: number,"precio"?: number,"tipo": string
                  }
                  Update: {
                    "cantidad"?: number,"catalogo_id"?: string,"costo_unitario"?: number | null,"descripcion"?: string,"especialidad"?: string | null,"horas"?: number | null,"id"?: string,"posicion"?: number,"precio"?: number,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalogo_trabajo_lineas_catalogo_id_fkey"
      columns: ["catalogo_id"]
isOneToOne: false
      referencedRelation: "catalogo_trabajos"
      referencedColumns: ["id"]
    }
                  ]
                },"catalogo_trabajos": {
                  Row: {
                    "activo": boolean,"actualizado_en": string,"creado_en": string,"creado_por": string | null,"id": string,"nombre": string,"sede_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"actualizado_en"?: string,"creado_en"?: string,"creado_por"?: string | null,"id"?: string,"nombre": string,"sede_id": string
                  }
                  Update: {
                    "activo"?: boolean,"actualizado_en"?: string,"creado_en"?: string,"creado_por"?: string | null,"id"?: string,"nombre"?: string,"sede_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "catalogo_trabajos_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "catalogo_trabajos_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    }
                  ]
                },"clientes": {
                  Row: {
                    "acepta_correos": boolean,"correos_baja_en": string | null,"creado_en": string,"direccion": string,"email": string,"id": string,"idioma": string,"nombre": string,"notas_crm": string | null,"sede_id": string,"telefono": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acepta_correos"?: boolean,"correos_baja_en"?: string | null,"creado_en"?: string,"direccion": string,"email": string,"id"?: string,"idioma"?: string,"nombre": string,"notas_crm"?: string | null,"sede_id": string,"telefono": string
                  }
                  Update: {
                    "acepta_correos"?: boolean,"correos_baja_en"?: string | null,"creado_en"?: string,"direccion"?: string,"email"?: string,"id"?: string,"idioma"?: string,"nombre"?: string,"notas_crm"?: string | null,"sede_id"?: string,"telefono"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clientes_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    }
                  ]
                },"cola_envios": {
                  Row: {
                    "bloqueado_en": string | null,"canal": string,"clave_dedupe": string | null,"creado_en": string,"datos": NonNullable<Json>,"destinatario": string,"enviado_en": string | null,"enviar_despues_de": string,"estado": string,"id": string,"intentos": number,"orden_id": string | null,"plantilla": string,"proveedor_id": string | null,"ultimo_error": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bloqueado_en"?: string | null,"canal": string,"clave_dedupe"?: string | null,"creado_en"?: string,"datos"?: NonNullable<Json>,"destinatario": string,"enviado_en"?: string | null,"enviar_despues_de"?: string,"estado"?: string,"id"?: string,"intentos"?: number,"orden_id"?: string | null,"plantilla": string,"proveedor_id"?: string | null,"ultimo_error"?: string | null
                  }
                  Update: {
                    "bloqueado_en"?: string | null,"canal"?: string,"clave_dedupe"?: string | null,"creado_en"?: string,"datos"?: NonNullable<Json>,"destinatario"?: string,"enviado_en"?: string | null,"enviar_despues_de"?: string,"estado"?: string,"id"?: string,"intentos"?: number,"orden_id"?: string | null,"plantilla"?: string,"proveedor_id"?: string | null,"ultimo_error"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cola_envios_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    }
                  ]
                },"comision_pagos": {
                  Row: {
                    "comprobante_url": string | null,"creado_en": string,"fecha_pago": string,"id": string,"metodo": string,"monto": number,"notas": string | null,"numero_cheque": string | null,"pagado_por": string | null,"sede_id": string,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comprobante_url"?: string | null,"creado_en"?: string,"fecha_pago"?: string,"id"?: string,"metodo"?: string,"monto": number,"notas"?: string | null,"numero_cheque"?: string | null,"pagado_por"?: string | null,"sede_id": string,"usuario_id": string
                  }
                  Update: {
                    "comprobante_url"?: string | null,"creado_en"?: string,"fecha_pago"?: string,"id"?: string,"metodo"?: string,"monto"?: number,"notas"?: string | null,"numero_cheque"?: string | null,"pagado_por"?: string | null,"sede_id"?: string,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comision_pagos_pagado_por_fkey"
      columns: ["pagado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comision_pagos_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comision_pagos_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"comisiones": {
                  Row: {
                    "base_ganancia": number,"creado_en": string,"especialidad": string,"estado": string,"id": string,"labor_id": string | null,"monto": number,"orden_id": string,"pago_id": string | null,"porcentaje": number,"sede_id": string,"tecnicos": number,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_ganancia": number,"creado_en"?: string,"especialidad": string,"estado"?: string,"id"?: string,"labor_id"?: string | null,"monto": number,"orden_id": string,"pago_id"?: string | null,"porcentaje": number,"sede_id": string,"tecnicos": number,"usuario_id": string
                  }
                  Update: {
                    "base_ganancia"?: number,"creado_en"?: string,"especialidad"?: string,"estado"?: string,"id"?: string,"labor_id"?: string | null,"monto"?: number,"orden_id"?: string,"pago_id"?: string | null,"porcentaje"?: number,"sede_id"?: string,"tecnicos"?: number,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comisiones_labor_id_fkey"
      columns: ["labor_id"]
isOneToOne: false
      referencedRelation: "orden_labor"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comisiones_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comisiones_pago_id_fkey"
      columns: ["pago_id"]
isOneToOne: false
      referencedRelation: "comision_pagos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comisiones_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comisiones_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"finanzas_importaciones": {
                  Row: {
                    "creado_en": string,"fecha_importacion": string,"hash_archivo": string | null,"id": string,"importado_por": string | null,"nombre_archivo": string,"ruta_archivo": string,"sede_id": string,"total_transacciones": number
                  }
                  ComputedFields: never
                  Insert: {
                    "creado_en"?: string,"fecha_importacion"?: string,"hash_archivo"?: string | null,"id"?: string,"importado_por"?: string | null,"nombre_archivo": string,"ruta_archivo": string,"sede_id": string,"total_transacciones"?: number
                  }
                  Update: {
                    "creado_en"?: string,"fecha_importacion"?: string,"hash_archivo"?: string | null,"id"?: string,"importado_por"?: string | null,"nombre_archivo"?: string,"ruta_archivo"?: string,"sede_id"?: string,"total_transacciones"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "finanzas_importaciones_importado_por_fkey"
      columns: ["importado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "finanzas_importaciones_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    }
                  ]
                },"finanzas_movimientos": {
                  Row: {
                    "categoria": Database["public"]['Enums']["transaction_category"],"comision_pago_id": string | null,"comprobante_ruta": string | null,"creado_en": string,"descripcion": string,"fecha": string,"id": string,"importacion_id": string | null,"metodo_pago": string | null,"monto": number,"numero_cheque": string | null,"origen": string,"referencia_orden_id": string | null,"registrado_por": string | null,"sede_id": string,"tipo": Database["public"]['Enums']["transaction_type"]
                  }
                  ComputedFields: never
                  Insert: {
                    "categoria": Database["public"]['Enums']["transaction_category"],"comision_pago_id"?: string | null,"comprobante_ruta"?: string | null,"creado_en"?: string,"descripcion": string,"fecha": string,"id"?: string,"importacion_id"?: string | null,"metodo_pago"?: string | null,"monto": number,"numero_cheque"?: string | null,"origen"?: string,"referencia_orden_id"?: string | null,"registrado_por"?: string | null,"sede_id": string,"tipo": Database["public"]['Enums']["transaction_type"]
                  }
                  Update: {
                    "categoria"?: Database["public"]['Enums']["transaction_category"],"comision_pago_id"?: string | null,"comprobante_ruta"?: string | null,"creado_en"?: string,"descripcion"?: string,"fecha"?: string,"id"?: string,"importacion_id"?: string | null,"metodo_pago"?: string | null,"monto"?: number,"numero_cheque"?: string | null,"origen"?: string,"referencia_orden_id"?: string | null,"registrado_por"?: string | null,"sede_id"?: string,"tipo"?: Database["public"]['Enums']["transaction_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "finanzas_movimientos_comision_pago_id_fkey"
      columns: ["comision_pago_id"]
isOneToOne: false
      referencedRelation: "comision_pagos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "finanzas_movimientos_importacion_id_fkey"
      columns: ["importacion_id"]
isOneToOne: false
      referencedRelation: "finanzas_importaciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "finanzas_movimientos_referencia_orden_id_fkey"
      columns: ["referencia_orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "finanzas_movimientos_registrado_por_fkey"
      columns: ["registrado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "finanzas_movimientos_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    }
                  ]
                },"finanzas_reglas_categorizacion": {
                  Row: {
                    "activo": boolean,"categoria": Database["public"]['Enums']["transaction_category"],"creado_en": string,"id": string,"patron": string,"prioridad": number
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"categoria": Database["public"]['Enums']["transaction_category"],"creado_en"?: string,"id"?: string,"patron": string,"prioridad"?: number
                  }
                  Update: {
                    "activo"?: boolean,"categoria"?: Database["public"]['Enums']["transaction_category"],"creado_en"?: string,"id"?: string,"patron"?: string,"prioridad"?: number
                  }
                  Relationships: [
                    
                  ]
                },"historial_orden": {
                  Row: {
                    "accion": string,"actor_id": string | null,"actor_nombre": string | null,"cambios": NonNullable<Json>,"entidad": string,"entidad_id": string | null,"id": number,"numero_orden": string | null,"ocurrido_en": string,"orden_id": string,"origen": string,"resumen": string | null,"sede_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accion": string,"actor_id"?: string | null,"actor_nombre"?: string | null,"cambios"?: NonNullable<Json>,"entidad": string,"entidad_id"?: string | null,"id"?: never,"numero_orden"?: string | null,"ocurrido_en"?: string,"orden_id": string,"origen": string,"resumen"?: string | null,"sede_id"?: string | null
                  }
                  Update: {
                    "accion"?: string,"actor_id"?: string | null,"actor_nombre"?: string | null,"cambios"?: NonNullable<Json>,"entidad"?: string,"entidad_id"?: string | null,"id"?: never,"numero_orden"?: string | null,"ocurrido_en"?: string,"orden_id"?: string,"origen"?: string,"resumen"?: string | null,"sede_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"inspeccion_plantilla_puntos": {
                  Row: {
                    "id": string,"nombre": string,"plantilla_id": string,"posicion": number,"seccion": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"nombre": string,"plantilla_id": string,"posicion"?: number,"seccion": string
                  }
                  Update: {
                    "id"?: string,"nombre"?: string,"plantilla_id"?: string,"posicion"?: number,"seccion"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inspeccion_plantilla_puntos_plantilla_id_fkey"
      columns: ["plantilla_id"]
isOneToOne: false
      referencedRelation: "inspeccion_plantillas"
      referencedColumns: ["id"]
    }
                  ]
                },"inspeccion_plantillas": {
                  Row: {
                    "activo": boolean,"actualizado_en": string,"creado_en": string,"id": string,"nombre": string,"predeterminada": boolean,"sede_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"actualizado_en"?: string,"creado_en"?: string,"id"?: string,"nombre": string,"predeterminada"?: boolean,"sede_id": string
                  }
                  Update: {
                    "activo"?: boolean,"actualizado_en"?: string,"creado_en"?: string,"id"?: string,"nombre"?: string,"predeterminada"?: boolean,"sede_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inspeccion_plantillas_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    }
                  ]
                },"notificaciones": {
                  Row: {
                    "creado_en": string,"cuerpo": string,"datos": NonNullable<Json>,"id": string,"leida_en": string | null,"orden_id": string | null,"sede_id": string | null,"tipo": string,"titulo": string,"url": string | null,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "creado_en"?: string,"cuerpo"?: string,"datos"?: NonNullable<Json>,"id"?: string,"leida_en"?: string | null,"orden_id"?: string | null,"sede_id"?: string | null,"tipo": string,"titulo": string,"url"?: string | null,"usuario_id": string
                  }
                  Update: {
                    "creado_en"?: string,"cuerpo"?: string,"datos"?: NonNullable<Json>,"id"?: string,"leida_en"?: string | null,"orden_id"?: string | null,"sede_id"?: string | null,"tipo"?: string,"titulo"?: string,"url"?: string | null,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notificaciones_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notificaciones_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notificaciones_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"numero_orden_contadores": {
                  Row: {
                    "anio": number,"ultimo_numero": number
                  }
                  ComputedFields: never
                  Insert: {
                    "anio": number,"ultimo_numero"?: number
                  }
                  Update: {
                    "anio"?: number,"ultimo_numero"?: number
                  }
                  Relationships: [
                    
                  ]
                },"orden_asignaciones": {
                  Row: {
                    "estatus_tarea": Database["public"]['Enums']["task_status"],"fecha_asignacion": string,"id": string,"orden_id": string,"origen": string,"tipo_tarea": string,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "estatus_tarea"?: Database["public"]['Enums']["task_status"],"fecha_asignacion"?: string,"id"?: string,"orden_id": string,"origen"?: string,"tipo_tarea": string,"usuario_id": string
                  }
                  Update: {
                    "estatus_tarea"?: Database["public"]['Enums']["task_status"],"fecha_asignacion"?: string,"id"?: string,"orden_id"?: string,"origen"?: string,"tipo_tarea"?: string,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orden_asignaciones_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_asignaciones_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"orden_avances": {
                  Row: {
                    "creado_en": string,"descripcion": string,"id": string,"labor_id": string | null,"orden_id": string,"usuario_id": string | null,"visible_cliente": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "creado_en"?: string,"descripcion"?: string,"id"?: string,"labor_id"?: string | null,"orden_id": string,"usuario_id"?: string | null,"visible_cliente"?: boolean
                  }
                  Update: {
                    "creado_en"?: string,"descripcion"?: string,"id"?: string,"labor_id"?: string | null,"orden_id"?: string,"usuario_id"?: string | null,"visible_cliente"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "orden_avances_labor_id_fkey"
      columns: ["labor_id"]
isOneToOne: false
      referencedRelation: "orden_labor"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_avances_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_avances_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"orden_enlaces": {
                  Row: {
                    "accesos": number,"creado_en": string,"creado_por": string | null,"expira_en": string | null,"id": string,"orden_id": string,"revocado_en": string | null,"revocado_por": string | null,"sede_id": string,"token": string,"ultimo_acceso_en": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accesos"?: number,"creado_en"?: string,"creado_por"?: string | null,"expira_en"?: string | null,"id"?: string,"orden_id": string,"revocado_en"?: string | null,"revocado_por"?: string | null,"sede_id": string,"token": string,"ultimo_acceso_en"?: string | null
                  }
                  Update: {
                    "accesos"?: number,"creado_en"?: string,"creado_por"?: string | null,"expira_en"?: string | null,"id"?: string,"orden_id"?: string,"revocado_en"?: string | null,"revocado_por"?: string | null,"sede_id"?: string,"token"?: string,"ultimo_acceso_en"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orden_enlaces_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_enlaces_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_enlaces_revocado_por_fkey"
      columns: ["revocado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_enlaces_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    }
                  ]
                },"orden_hallazgos": {
                  Row: {
                    "avance_id": string | null,"creado_en": string,"descripcion": string,"en_reporte": boolean,"estado": string,"id": string,"orden_id": string,"presupuesto_id": string | null,"reportado_por": string,"resuelto_en": string | null,"resuelto_por": string | null,"sede_id": string,"texto_cliente": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avance_id"?: string | null,"creado_en"?: string,"descripcion": string,"en_reporte"?: boolean,"estado"?: string,"id"?: string,"orden_id": string,"presupuesto_id"?: string | null,"reportado_por": string,"resuelto_en"?: string | null,"resuelto_por"?: string | null,"sede_id": string,"texto_cliente"?: string | null
                  }
                  Update: {
                    "avance_id"?: string | null,"creado_en"?: string,"descripcion"?: string,"en_reporte"?: boolean,"estado"?: string,"id"?: string,"orden_id"?: string,"presupuesto_id"?: string | null,"reportado_por"?: string,"resuelto_en"?: string | null,"resuelto_por"?: string | null,"sede_id"?: string,"texto_cliente"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orden_hallazgos_avance_id_fkey"
      columns: ["avance_id"]
isOneToOne: false
      referencedRelation: "orden_avances"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_hallazgos_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_hallazgos_presupuesto_id_fkey"
      columns: ["presupuesto_id"]
isOneToOne: false
      referencedRelation: "presupuestos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_hallazgos_reportado_por_fkey"
      columns: ["reportado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_hallazgos_resuelto_por_fkey"
      columns: ["resuelto_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_hallazgos_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    }
                  ]
                },"orden_inspeccion_puntos": {
                  Row: {
                    "actualizado_en": string | null,"actualizado_por": string | null,"estado": string,"id": string,"inspeccion_id": string,"nombre": string,"nota": string | null,"orden_id": string,"posicion": number,"seccion": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string | null,"actualizado_por"?: string | null,"estado"?: string,"id"?: string,"inspeccion_id": string,"nombre": string,"nota"?: string | null,"orden_id": string,"posicion"?: number,"seccion": string
                  }
                  Update: {
                    "actualizado_en"?: string | null,"actualizado_por"?: string | null,"estado"?: string,"id"?: string,"inspeccion_id"?: string,"nombre"?: string,"nota"?: string | null,"orden_id"?: string,"posicion"?: number,"seccion"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orden_inspeccion_puntos_actualizado_por_fkey"
      columns: ["actualizado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_inspeccion_puntos_inspeccion_id_fkey"
      columns: ["inspeccion_id"]
isOneToOne: false
      referencedRelation: "orden_inspecciones"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_inspeccion_puntos_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    }
                  ]
                },"orden_inspecciones": {
                  Row: {
                    "completada_en": string | null,"completada_por": string | null,"creado_en": string,"creado_por": string | null,"id": string,"nombre": string,"orden_id": string,"plantilla_id": string | null,"publicada_en": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "completada_en"?: string | null,"completada_por"?: string | null,"creado_en"?: string,"creado_por"?: string | null,"id"?: string,"nombre": string,"orden_id": string,"plantilla_id"?: string | null,"publicada_en"?: string | null
                  }
                  Update: {
                    "completada_en"?: string | null,"completada_por"?: string | null,"creado_en"?: string,"creado_por"?: string | null,"id"?: string,"nombre"?: string,"orden_id"?: string,"plantilla_id"?: string | null,"publicada_en"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orden_inspecciones_completada_por_fkey"
      columns: ["completada_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_inspecciones_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_inspecciones_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: true
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_inspecciones_plantilla_id_fkey"
      columns: ["plantilla_id"]
isOneToOne: false
      referencedRelation: "inspeccion_plantillas"
      referencedColumns: ["id"]
    }
                  ]
                },"orden_labor": {
                  Row: {
                    "asignado_a": string | null,"completado_en": string | null,"completado_por": string | null,"costo": number,"creado_en": string,"decidido_en": string | null,"descripcion": string,"especialidad": string,"estado": string,"horas": number | null,"id": string,"orden_id": string,"presupuesto_id": string | null,"reparto_heredado": boolean,"trabajo_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "asignado_a"?: string | null,"completado_en"?: string | null,"completado_por"?: string | null,"costo": number,"creado_en"?: string,"decidido_en"?: string | null,"descripcion": string,"especialidad": string,"estado"?: string,"horas"?: number | null,"id"?: string,"orden_id": string,"presupuesto_id"?: string | null,"reparto_heredado"?: boolean,"trabajo_id"?: string | null
                  }
                  Update: {
                    "asignado_a"?: string | null,"completado_en"?: string | null,"completado_por"?: string | null,"costo"?: number,"creado_en"?: string,"decidido_en"?: string | null,"descripcion"?: string,"especialidad"?: string,"estado"?: string,"horas"?: number | null,"id"?: string,"orden_id"?: string,"presupuesto_id"?: string | null,"reparto_heredado"?: boolean,"trabajo_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orden_labor_asignado_a_fkey"
      columns: ["asignado_a"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_labor_completado_por_fkey"
      columns: ["completado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_labor_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_labor_presupuesto_fk"
      columns: ["presupuesto_id"]
isOneToOne: false
      referencedRelation: "presupuestos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_labor_trabajo_fk"
      columns: ["trabajo_id","orden_id"]
isOneToOne: false
      referencedRelation: "orden_trabajos"
      referencedColumns: ["id","orden_id"]
    }
                  ]
                },"orden_labor_tiempos": {
                  Row: {
                    "fin": string | null,"id": string,"inicio": string,"labor_id": string,"orden_id": string,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fin"?: string | null,"id"?: string,"inicio"?: string,"labor_id": string,"orden_id": string,"usuario_id": string
                  }
                  Update: {
                    "fin"?: string | null,"id"?: string,"inicio"?: string,"labor_id"?: string,"orden_id"?: string,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orden_labor_tiempos_labor_id_fkey"
      columns: ["labor_id"]
isOneToOne: false
      referencedRelation: "orden_labor"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_labor_tiempos_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_labor_tiempos_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"orden_media": {
                  Row: {
                    "alto": number | null,"ancho": number | null,"avance_id": string | null,"bytes": number,"creado_en": string,"duracion_seg": number | null,"id": string,"inspeccion_punto_id": string | null,"mime": string,"orden_id": string,"origen": string,"proveedor": string,"ruta": string,"ruta_miniatura": string | null,"sede_id": string,"subido_por": string | null,"tipo": string,"visible_cliente": boolean,"zona": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alto"?: number | null,"ancho"?: number | null,"avance_id"?: string | null,"bytes": number,"creado_en"?: string,"duracion_seg"?: number | null,"id"?: string,"inspeccion_punto_id"?: string | null,"mime": string,"orden_id": string,"origen": string,"proveedor"?: string,"ruta": string,"ruta_miniatura"?: string | null,"sede_id": string,"subido_por"?: string | null,"tipo": string,"visible_cliente"?: boolean,"zona"?: string | null
                  }
                  Update: {
                    "alto"?: number | null,"ancho"?: number | null,"avance_id"?: string | null,"bytes"?: number,"creado_en"?: string,"duracion_seg"?: number | null,"id"?: string,"inspeccion_punto_id"?: string | null,"mime"?: string,"orden_id"?: string,"origen"?: string,"proveedor"?: string,"ruta"?: string,"ruta_miniatura"?: string | null,"sede_id"?: string,"subido_por"?: string | null,"tipo"?: string,"visible_cliente"?: boolean,"zona"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orden_media_avance_id_fkey"
      columns: ["avance_id"]
isOneToOne: false
      referencedRelation: "orden_avances"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_media_inspeccion_punto_fk"
      columns: ["inspeccion_punto_id","orden_id"]
isOneToOne: false
      referencedRelation: "orden_inspeccion_puntos"
      referencedColumns: ["id","orden_id"]
    },{
      foreignKeyName: "orden_media_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_media_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_media_subido_por_fkey"
      columns: ["subido_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"orden_montos": {
                  Row: {
                    "actualizado_en": string,"deposito_inicial": number,"descuento": number,"descuento_motivo": string | null,"orden_id": string,"total_general": number,"total_repuestos": number
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"deposito_inicial"?: number,"descuento"?: number,"descuento_motivo"?: string | null,"orden_id": string,"total_general"?: number,"total_repuestos"?: number
                  }
                  Update: {
                    "actualizado_en"?: string,"deposito_inicial"?: number,"descuento"?: number,"descuento_motivo"?: string | null,"orden_id"?: string,"total_general"?: number,"total_repuestos"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "orden_montos_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: true
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    }
                  ]
                },"orden_parqueo": {
                  Row: {
                    "calculado_en": string | null,"calculado_hasta": string | null,"cobrar": boolean,"detalle": NonNullable<Json>,"dias_cobrados": number,"dias_exonerados": number,"estado": string,"fin_congelado": string | null,"id": string,"inicio_cobro": string | null,"inicio_manual": string | null,"monto": number,"nota": string | null,"orden_id": string,"perfil": string | null,"tarifa_manual": number | null,"tope_aplicado": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "calculado_en"?: string | null,"calculado_hasta"?: string | null,"cobrar"?: boolean,"detalle"?: NonNullable<Json>,"dias_cobrados"?: number,"dias_exonerados"?: number,"estado"?: string,"fin_congelado"?: string | null,"id"?: string,"inicio_cobro"?: string | null,"inicio_manual"?: string | null,"monto"?: number,"nota"?: string | null,"orden_id": string,"perfil"?: string | null,"tarifa_manual"?: number | null,"tope_aplicado"?: boolean
                  }
                  Update: {
                    "calculado_en"?: string | null,"calculado_hasta"?: string | null,"cobrar"?: boolean,"detalle"?: NonNullable<Json>,"dias_cobrados"?: number,"dias_exonerados"?: number,"estado"?: string,"fin_congelado"?: string | null,"id"?: string,"inicio_cobro"?: string | null,"inicio_manual"?: string | null,"monto"?: number,"nota"?: string | null,"orden_id"?: string,"perfil"?: string | null,"tarifa_manual"?: number | null,"tope_aplicado"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "orden_parqueo_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: true
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    }
                  ]
                },"orden_proximo_servicio": {
                  Row: {
                    "fecha": string | null,"idioma": string | null,"millas": number | null,"nota": string | null,"orden_id": string,"programado_en": string | null,"programado_por": string | null,"sede_id": string,"sugerido_en": string | null,"sugerido_fecha": string | null,"sugerido_millas": number | null,"sugerido_nota": string | null,"sugerido_por": string | null,"token": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "fecha"?: string | null,"idioma"?: string | null,"millas"?: number | null,"nota"?: string | null,"orden_id": string,"programado_en"?: string | null,"programado_por"?: string | null,"sede_id": string,"sugerido_en"?: string | null,"sugerido_fecha"?: string | null,"sugerido_millas"?: number | null,"sugerido_nota"?: string | null,"sugerido_por"?: string | null,"token"?: string | null
                  }
                  Update: {
                    "fecha"?: string | null,"idioma"?: string | null,"millas"?: number | null,"nota"?: string | null,"orden_id"?: string,"programado_en"?: string | null,"programado_por"?: string | null,"sede_id"?: string,"sugerido_en"?: string | null,"sugerido_fecha"?: string | null,"sugerido_millas"?: number | null,"sugerido_nota"?: string | null,"sugerido_por"?: string | null,"token"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orden_proximo_servicio_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: true
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_proximo_servicio_programado_por_fkey"
      columns: ["programado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_proximo_servicio_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_proximo_servicio_sugerido_por_fkey"
      columns: ["sugerido_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"orden_repuestos": {
                  Row: {
                    "cantidad": number,"costo_unitario": number,"creado_en": string,"decidido_en": string | null,"descripcion": string,"estado": string,"estado_pedido": string | null,"id": string,"numero_parte": string | null,"orden_id": string,"pedido_en": string | null,"precio_venta_unitario": number,"presupuesto_id": string | null,"recibido_en": string | null,"subtotal": number,"trabajo_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cantidad"?: number,"costo_unitario": number,"creado_en"?: string,"decidido_en"?: string | null,"descripcion": string,"estado"?: string,"estado_pedido"?: string | null,"id"?: string,"numero_parte"?: string | null,"orden_id": string,"pedido_en"?: string | null,"precio_venta_unitario": number,"presupuesto_id"?: string | null,"recibido_en"?: string | null,"subtotal": number,"trabajo_id"?: string | null
                  }
                  Update: {
                    "cantidad"?: number,"costo_unitario"?: number,"creado_en"?: string,"decidido_en"?: string | null,"descripcion"?: string,"estado"?: string,"estado_pedido"?: string | null,"id"?: string,"numero_parte"?: string | null,"orden_id"?: string,"pedido_en"?: string | null,"precio_venta_unitario"?: number,"presupuesto_id"?: string | null,"recibido_en"?: string | null,"subtotal"?: number,"trabajo_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orden_repuestos_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_repuestos_presupuesto_fk"
      columns: ["presupuesto_id"]
isOneToOne: false
      referencedRelation: "presupuestos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_repuestos_trabajo_fk"
      columns: ["trabajo_id","orden_id"]
isOneToOne: false
      referencedRelation: "orden_trabajos"
      referencedColumns: ["id","orden_id"]
    }
                  ]
                },"orden_trabajos": {
                  Row: {
                    "catalogo_id": string | null,"creado_en": string,"creado_por": string | null,"id": string,"orden_id": string,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "catalogo_id"?: string | null,"creado_en"?: string,"creado_por"?: string | null,"id"?: string,"orden_id": string,"titulo": string
                  }
                  Update: {
                    "catalogo_id"?: string | null,"creado_en"?: string,"creado_por"?: string | null,"id"?: string,"orden_id"?: string,"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orden_trabajos_catalogo_id_fkey"
      columns: ["catalogo_id"]
isOneToOne: false
      referencedRelation: "catalogo_trabajos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_trabajos_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orden_trabajos_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    }
                  ]
                },"ordenes_trabajo": {
                  Row: {
                    "archivada_en": string | null,"aseguradora": string | null,"cliente_id": string,"con_seguro": boolean,"creado_en": string,"creado_por": string | null,"estatus": Database["public"]['Enums']["order_status"],"fecha_estimada_entrega": string,"fecha_finalizacion": string | null,"fecha_ingreso": string,"firma_fecha": string | null,"firma_ruta": string | null,"id": string,"inspeccion_360_notas": string | null,"lista_para_entregar_en": string | null,"lista_para_entregar_por": string | null,"marcas_danos": NonNullable<Json>,"millas_ingreso": number,"motivo_autorizacion": string | null,"nivel_gasolina": string,"numero_orden": string,"numero_reclamo": string | null,"porcentaje_avance": number,"recordado_entrega_en": string | null,"retirada_sin_reparar": boolean,"sede_id": string,"tipo_trabajo": Database["public"]['Enums']["work_type"],"total_labor": number,"vehiculo_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archivada_en"?: string | null,"aseguradora"?: string | null,"cliente_id": string,"con_seguro"?: boolean,"creado_en"?: string,"creado_por"?: string | null,"estatus"?: Database["public"]['Enums']["order_status"],"fecha_estimada_entrega": string,"fecha_finalizacion"?: string | null,"fecha_ingreso"?: string,"firma_fecha"?: string | null,"firma_ruta"?: string | null,"id"?: string,"inspeccion_360_notas"?: string | null,"lista_para_entregar_en"?: string | null,"lista_para_entregar_por"?: string | null,"marcas_danos"?: NonNullable<Json>,"millas_ingreso": number,"motivo_autorizacion"?: string | null,"nivel_gasolina": string,"numero_orden": string,"numero_reclamo"?: string | null,"porcentaje_avance"?: number,"recordado_entrega_en"?: string | null,"retirada_sin_reparar"?: boolean,"sede_id": string,"tipo_trabajo": Database["public"]['Enums']["work_type"],"total_labor"?: number,"vehiculo_id": string
                  }
                  Update: {
                    "archivada_en"?: string | null,"aseguradora"?: string | null,"cliente_id"?: string,"con_seguro"?: boolean,"creado_en"?: string,"creado_por"?: string | null,"estatus"?: Database["public"]['Enums']["order_status"],"fecha_estimada_entrega"?: string,"fecha_finalizacion"?: string | null,"fecha_ingreso"?: string,"firma_fecha"?: string | null,"firma_ruta"?: string | null,"id"?: string,"inspeccion_360_notas"?: string | null,"lista_para_entregar_en"?: string | null,"lista_para_entregar_por"?: string | null,"marcas_danos"?: NonNullable<Json>,"millas_ingreso"?: number,"motivo_autorizacion"?: string | null,"nivel_gasolina"?: string,"numero_orden"?: string,"numero_reclamo"?: string | null,"porcentaje_avance"?: number,"recordado_entrega_en"?: string | null,"retirada_sin_reparar"?: boolean,"sede_id"?: string,"tipo_trabajo"?: Database["public"]['Enums']["work_type"],"total_labor"?: number,"vehiculo_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ordenes_trabajo_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ordenes_trabajo_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ordenes_trabajo_lista_para_entregar_por_fkey"
      columns: ["lista_para_entregar_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ordenes_trabajo_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ordenes_trabajo_vehiculo_id_fkey"
      columns: ["vehiculo_id"]
isOneToOne: false
      referencedRelation: "vehiculos"
      referencedColumns: ["id"]
    }
                  ]
                },"parqueo_config": {
                  Row: {
                    "actualizado_en": string,"actualizado_por": string | null,"avisar_cliente": boolean,"habilitado": boolean,"incluir_ordenes_previas": boolean,"politica_en": string | null,"politica_es": string | null,"sede_id": string,"vigente_desde": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"avisar_cliente"?: boolean,"habilitado"?: boolean,"incluir_ordenes_previas"?: boolean,"politica_en"?: string | null,"politica_es"?: string | null,"sede_id": string,"vigente_desde"?: string | null
                  }
                  Update: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"avisar_cliente"?: boolean,"habilitado"?: boolean,"incluir_ordenes_previas"?: boolean,"politica_en"?: string | null,"politica_es"?: string | null,"sede_id"?: string,"vigente_desde"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "parqueo_config_actualizado_por_fkey"
      columns: ["actualizado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parqueo_config_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: true
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    }
                  ]
                },"parqueo_perfiles": {
                  Row: {
                    "cobra_dia_evento": boolean,"dias_gracia": number,"evento_inicio": string,"gracia_dias_habiles": boolean,"habilitado": boolean,"id": string,"sede_id": string,"tipo": string,"tope_dias": number | null,"tope_monto": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cobra_dia_evento": boolean,"dias_gracia"?: number,"evento_inicio": string,"gracia_dias_habiles"?: boolean,"habilitado"?: boolean,"id"?: string,"sede_id": string,"tipo": string,"tope_dias"?: number | null,"tope_monto"?: number | null
                  }
                  Update: {
                    "cobra_dia_evento"?: boolean,"dias_gracia"?: number,"evento_inicio"?: string,"gracia_dias_habiles"?: boolean,"habilitado"?: boolean,"id"?: string,"sede_id"?: string,"tipo"?: string,"tope_dias"?: number | null,"tope_monto"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "parqueo_perfiles_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    }
                  ]
                },"parqueo_tramos": {
                  Row: {
                    "desde_dia": number,"id": string,"perfil_id": string,"tarifa_diaria": number
                  }
                  ComputedFields: never
                  Insert: {
                    "desde_dia": number,"id"?: string,"perfil_id": string,"tarifa_diaria": number
                  }
                  Update: {
                    "desde_dia"?: number,"id"?: string,"perfil_id"?: string,"tarifa_diaria"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "parqueo_tramos_perfil_id_fkey"
      columns: ["perfil_id"]
isOneToOne: false
      referencedRelation: "parqueo_perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"perfiles": {
                  Row: {
                    "avatar_url": string | null,"creado_en": string,"email": string,"id": string,"nombre_completo": string,"rol": Database["public"]['Enums']["user_role"],"sede_id": string,"telefono": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"creado_en"?: string,"email": string,"id": string,"nombre_completo": string,"rol": Database["public"]['Enums']["user_role"],"sede_id": string,"telefono"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"creado_en"?: string,"email"?: string,"id"?: string,"nombre_completo"?: string,"rol"?: Database["public"]['Enums']["user_role"],"sede_id"?: string,"telefono"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "perfiles_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    }
                  ]
                },"perfiles_pago": {
                  Row: {
                    "actualizado_en": string,"actualizado_por": string | null,"comision_porcentaje": number | null,"esquema": string,"salario_monto": number | null,"salario_periodo": string | null,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"comision_porcentaje"?: number | null,"esquema"?: string,"salario_monto"?: number | null,"salario_periodo"?: string | null,"usuario_id": string
                  }
                  Update: {
                    "actualizado_en"?: string,"actualizado_por"?: string | null,"comision_porcentaje"?: number | null,"esquema"?: string,"salario_monto"?: number | null,"salario_periodo"?: string | null,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "perfiles_pago_actualizado_por_fkey"
      columns: ["actualizado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "perfiles_pago_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: true
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"presupuestos": {
                  Row: {
                    "cancelado_en": string | null,"comentario_cliente": string | null,"creado_en": string,"enviado_por": string | null,"estado": string,"id": string,"ip": string | null,"nota_admin": string | null,"numero": number,"orden_id": string,"recordado_en": string | null,"respondido_en": string | null,"respondido_por_nombre": string | null,"respondido_por_perfil": string | null,"respondido_via": string | null,"sede_id": string,"total_aprobado": number | null,"total_propuesto": number,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cancelado_en"?: string | null,"comentario_cliente"?: string | null,"creado_en"?: string,"enviado_por"?: string | null,"estado"?: string,"id"?: string,"ip"?: string | null,"nota_admin"?: string | null,"numero": number,"orden_id": string,"recordado_en"?: string | null,"respondido_en"?: string | null,"respondido_por_nombre"?: string | null,"respondido_por_perfil"?: string | null,"respondido_via"?: string | null,"sede_id": string,"total_aprobado"?: number | null,"total_propuesto"?: number,"user_agent"?: string | null
                  }
                  Update: {
                    "cancelado_en"?: string | null,"comentario_cliente"?: string | null,"creado_en"?: string,"enviado_por"?: string | null,"estado"?: string,"id"?: string,"ip"?: string | null,"nota_admin"?: string | null,"numero"?: number,"orden_id"?: string,"recordado_en"?: string | null,"respondido_en"?: string | null,"respondido_por_nombre"?: string | null,"respondido_por_perfil"?: string | null,"respondido_via"?: string | null,"sede_id"?: string,"total_aprobado"?: number | null,"total_propuesto"?: number,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "presupuestos_enviado_por_fkey"
      columns: ["enviado_por"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "presupuestos_orden_id_fkey"
      columns: ["orden_id"]
isOneToOne: false
      referencedRelation: "ordenes_trabajo"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "presupuestos_respondido_por_perfil_fkey"
      columns: ["respondido_por_perfil"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "presupuestos_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    }
                  ]
                },"push_suscripciones": {
                  Row: {
                    "actualizado_en": string,"auth": string,"creado_en": string,"endpoint": string,"id": string,"p256dh": string,"ultimo_error": string | null,"user_agent": string | null,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"auth": string,"creado_en"?: string,"endpoint": string,"id"?: string,"p256dh": string,"ultimo_error"?: string | null,"user_agent"?: string | null,"usuario_id": string
                  }
                  Update: {
                    "actualizado_en"?: string,"auth"?: string,"creado_en"?: string,"endpoint"?: string,"id"?: string,"p256dh"?: string,"ultimo_error"?: string | null,"user_agent"?: string | null,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_suscripciones_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "perfiles"
      referencedColumns: ["id"]
    }
                  ]
                },"sedes": {
                  Row: {
                    "capacidad": number,"color_tema": string | null,"comision_porcentaje": number,"direccion": string,"email_contacto": string | null,"fecha_creacion": string,"id": string,"logo_url": string | null,"nombre": string,"tarifa_hora": number | null,"telefono": string,"telefonos": NonNullable<Json>,"whatsapp": string | null,"zona_horaria": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capacidad"?: number,"color_tema"?: string | null,"comision_porcentaje"?: number,"direccion": string,"email_contacto"?: string | null,"fecha_creacion"?: string,"id"?: string,"logo_url"?: string | null,"nombre": string,"tarifa_hora"?: number | null,"telefono": string,"telefonos"?: NonNullable<Json>,"whatsapp"?: string | null,"zona_horaria"?: string
                  }
                  Update: {
                    "capacidad"?: number,"color_tema"?: string | null,"comision_porcentaje"?: number,"direccion"?: string,"email_contacto"?: string | null,"fecha_creacion"?: string,"id"?: string,"logo_url"?: string | null,"nombre"?: string,"tarifa_hora"?: number | null,"telefono"?: string,"telefonos"?: NonNullable<Json>,"whatsapp"?: string | null,"zona_horaria"?: string
                  }
                  Relationships: [
                    
                  ]
                },"traducciones": {
                  Row: {
                    "actualizado_en": string,"creado_en": string,"idioma_destino": string,"md5_hash": string,"origen": string,"sede_id": string,"texto_original": string,"traduccion": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actualizado_en"?: string,"creado_en"?: string,"idioma_destino": string,"md5_hash": string,"origen"?: string,"sede_id": string,"texto_original": string,"traduccion": string
                  }
                  Update: {
                    "actualizado_en"?: string,"creado_en"?: string,"idioma_destino"?: string,"md5_hash"?: string,"origen"?: string,"sede_id"?: string,"texto_original"?: string,"traduccion"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "traducciones_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    }
                  ]
                },"vehiculos": {
                  Row: {
                    "anio": number,"cliente_id": string,"color": string,"creado_en": string,"id": string,"marca": string,"modelo": string,"placa": string | null,"placa_estado": string | null,"sede_id": string,"vin": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anio": number,"cliente_id": string,"color": string,"creado_en"?: string,"id"?: string,"marca": string,"modelo": string,"placa"?: string | null,"placa_estado"?: string | null,"sede_id": string,"vin": string
                  }
                  Update: {
                    "anio"?: number,"cliente_id"?: string,"color"?: string,"creado_en"?: string,"id"?: string,"marca"?: string,"modelo"?: string,"placa"?: string | null,"placa_estado"?: string | null,"sede_id"?: string,"vin"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vehiculos_cliente_id_fkey"
      columns: ["cliente_id"]
isOneToOne: false
      referencedRelation: "clientes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vehiculos_sede_id_fkey"
      columns: ["sede_id"]
isOneToOne: false
      referencedRelation: "sedes"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "_agregar_borradores":
{ Args: { "p_presupuesto_id": string }; Returns: number
                           },
"_avance_por_tareas":
{ Args: { "p_orden_id": string }; Returns: number
                           },
"_balance_orden":
{ Args: { "p_orden_id": string }; Returns: {
              "cobrado": number,"comisiones": number,"comisiones_pagadas": number,"costo_repuestos": number,"margen": number,"total_orden": number
            }[]
                           },
"_crear_presupuesto":
{ Args: { "p_orden_id": string }; Returns: {
              "cancelado_en": string | null,
"comentario_cliente": string | null,
"creado_en": string,
"enviado_por": string | null,
"estado": string,
"id": string,
"ip": string | null,
"nota_admin": string | null,
"numero": number,
"orden_id": string,
"recordado_en": string | null,
"respondido_en": string | null,
"respondido_por_nombre": string | null,
"respondido_por_perfil": string | null,
"respondido_via": string | null,
"sede_id": string,
"total_aprobado": number | null,
"total_propuesto": number,
"user_agent": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "presupuestos"
        isOneToOne: true
        isSetofReturn: false
      } },
"_diccionario_traducciones":
{ Args: { "p_orden_id": string }; Returns: Json
                           },
"_estatus_cliente":
{ Args: { "p_estatus": Database["public"]['Enums']["order_status"],"p_lista": string }; Returns: string
                           },
"_historial_diferencias":
{ Args: { "p_antes": Json,"p_campos": (string)[],"p_despues": Json }; Returns: Json
                           },
"_historial_valores":
{ Args: { "p_campos": (string)[],"p_clave": string,"p_fila": Json }; Returns: Json
                           },
"_lineas_pendientes":
{ Args: { "p_presupuesto_id": string }; Returns: (string)[]
                           },
"_parqueo_calcular":
{ Args: { "p_hasta"?: string,"p_orden_id": string }; Returns: Json
                           },
"_parqueo_calculo":
{ Args: { "p_ajustes"?: Json,"p_fecha_evento": string,"p_hasta": string,"p_perfil": Json,"p_vigente_desde"?: string }; Returns: Json
                           },
"_recalcular_parqueo":
{ Args: { "p_orden_id": string }; Returns: undefined
                           },
"_reloj_tope":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_reparto_comisiones":
{ Args: { "p_orden_id": string }; Returns: {
              "base": number,"especialidad": string,"esquema": string,"labor_id": string,"monto": number,"porcentaje": number,"tecnicos": number,"usuario_id": string
            }[]
                           },
"_resolver_presupuesto":
{ Args: { "p_aprobadas": (string)[],"p_comentario": string,"p_ip": string,"p_nombre": string,"p_nota": string,"p_perfil": string,"p_presupuesto_id": string,"p_user_agent": string,"p_via": string }; Returns: Json
                           },
"_saldo_orden":
{ Args: { "p_orden_id": string }; Returns: number
                           },
"_salir_de_espera":
{ Args: { "p_orden_id": string }; Returns: undefined
                           },
"_sembrar_plantilla_inspeccion":
{ Args: { "p_sede_id": string }; Returns: undefined
                           },
"_telefonos_sede":
{ Args: { "p_telefonos": Json }; Returns: Json
                           },
"_textos_cliente":
{ Args: { "p_orden_id": string }; Returns: (string)[]
                           },
"admins_de_sede":
{ Args: { "p_sede_id": string }; Returns: (string)[]
                           },
"agregar_trabajo_del_catalogo":
{ Args: { "p_asignado_a"?: string,"p_catalogo_id": string,"p_orden_id": string }; Returns: string
                           },
"ajustar_parqueo_orden":
{ Args: { "p_ajustes": Json,"p_orden_id": string }; Returns: Json
                           },
"aplicar_descuento":
{ Args: { "p_monto"?: number,"p_motivo"?: string,"p_orden_id": string,"p_porcentaje"?: number }; Returns: Json
                           },
"app_schema_version":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"aprobar_comision":
{ Args: { "p_comision_id": string,"p_monto"?: number,"p_porcentaje"?: number }; Returns: undefined
                           },
"aprobar_comisiones":
{ Args: { "p_ids": (string)[] }; Returns: number
                           },
"archivos_huerfanos":
{ Args: { "p_limit"?: number }; Returns: {
              "nombre": string
            }[]
                           },
"asegurar_enlace_orden":
{ Args: { "p_orden_id": string }; Returns: {
              "accesos": number,
"creado_en": string,
"creado_por": string | null,
"expira_en": string | null,
"id": string,
"orden_id": string,
"revocado_en": string | null,
"revocado_por": string | null,
"sede_id": string,
"token": string,
"ultimo_acceso_en": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orden_enlaces"
        isOneToOne: true
        isSetofReturn: false
      } },
"balance_orden":
{ Args: { "p_orden_id": string }; Returns: Json
                           },
"borrar_plantilla_inspeccion":
{ Args: { "p_id": string }; Returns: undefined
                           },
"borrar_tiempo":
{ Args: { "p_tiempo_id": string }; Returns: undefined
                           },
"borrar_trabajo_catalogo":
{ Args: { "p_id": string }; Returns: undefined
                           },
"cancelar_presupuesto":
{ Args: { "p_presupuesto_id": string }; Returns: undefined
                           },
"catalogo_de_trabajos":
{ Args: { "p_incluir_inactivos"?: boolean,"p_sede_id": string }; Returns: Json
                           },
"claim_outbox":
{ Args: { "p_limit"?: number }; Returns: {
              "bloqueado_en": string | null,
"canal": string,
"clave_dedupe": string | null,
"creado_en": string,
"datos": NonNullable<Json>,
"destinatario": string,
"enviado_en": string | null,
"enviar_despues_de": string,
"estado": string,
"id": string,
"intentos": number,
"orden_id": string | null,
"plantilla": string,
"proveedor_id": string | null,
"ultimo_error": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "cola_envios"
        isOneToOne: false
        isSetofReturn: true
      } },
"comisiones_estimadas":
{ Args: { "p_orden_id": string }; Returns: Json
                           },
"completar_inspeccion":
{ Args: { "p_inspeccion_id": string }; Returns: undefined
                           },
"corregir_tiempo":
{ Args: { "p_fin": string,"p_inicio": string,"p_tiempo_id": string }; Returns: undefined
                           },
"cotizar_hallazgo":
{ Args: { "p_hallazgo_id": string }; Returns: Json
                           },
"crear_enlace_cliente":
{ Args: { "p_orden_id": string }; Returns: {
              "accesos": number,
"creado_en": string,
"creado_por": string | null,
"expira_en": string | null,
"id": string,
"orden_id": string,
"revocado_en": string | null,
"revocado_por": string | null,
"sede_id": string,
"token": string,
"ultimo_acceso_en": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orden_enlaces"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_work_order":
{ Args: { "p_assignments"?: Json,"p_labor"?: Json,"p_order": Json,"p_parts"?: Json }; Returns: {
              "archivada_en": string | null,
"aseguradora": string | null,
"cliente_id": string,
"con_seguro": boolean,
"creado_en": string,
"creado_por": string | null,
"estatus": Database["public"]['Enums']["order_status"],
"fecha_estimada_entrega": string,
"fecha_finalizacion": string | null,
"fecha_ingreso": string,
"firma_fecha": string | null,
"firma_ruta": string | null,
"id": string,
"inspeccion_360_notas": string | null,
"lista_para_entregar_en": string | null,
"lista_para_entregar_por": string | null,
"marcas_danos": NonNullable<Json>,
"millas_ingreso": number,
"motivo_autorizacion": string | null,
"nivel_gasolina": string,
"numero_orden": string,
"numero_reclamo": string | null,
"porcentaje_avance": number,
"recordado_entrega_en": string | null,
"retirada_sin_reparar": boolean,
"sede_id": string,
"tipo_trabajo": Database["public"]['Enums']["work_type"],
"total_labor": number,
"vehiculo_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "ordenes_trabajo"
        isOneToOne: true
        isSetofReturn: false
      } },
"current_user_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["user_role"]
                           },
"current_user_sede_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"datos_correo":
{ Args: { "p_cola_id": string }; Returns: Json
                           },
"datos_orden_aviso":
{ Args: { "p_orden_id": string }; Returns: Json
                           },
"datos_portal":
{ Args: { "p_token": string }; Returns: Json
                           },
"datos_servicio":
{ Args: { "p_token": string }; Returns: Json
                           },
"delete_sede_cascade":
{ Args: { "p_sede_id": string }; Returns: Json
                           },
"descartar_hallazgo":
{ Args: { "p_en_reporte": boolean,"p_hallazgo_id": string,"p_texto": string }; Returns: undefined
                           },
"descartar_sugerencia_proximo_servicio":
{ Args: { "p_orden_id": string }; Returns: undefined
                           },
"deshacer_importacion_estado_cuenta":
{ Args: { "p_importacion_id": string }; Returns: number
                           },
"detener_reloj":
{ Args: { "p_labor_id": string }; Returns: undefined
                           },
"dispatch_outbox_if_due":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"eliminar_push":
{ Args: { "p_endpoint": string }; Returns: undefined
                           },
"encolar_correo_cliente":
{ Args: { "p_clave_dedupe"?: string,"p_datos"?: Json,"p_espera"?: string,"p_orden_id": string,"p_plantilla": string }; Returns: string
                           },
"entregar_orden":
{ Args: { "p_comprobante_ruta"?: string,"p_metodo"?: string,"p_numero_cheque"?: string,"p_orden_id": string }; Returns: Json
                           },
"enviar_presupuesto":
{ Args: { "p_notificar"?: boolean,"p_orden_id": string }; Returns: Json
                           },
"enviar_reporte_cliente":
{ Args: { "p_orden_id": string }; Returns: Json
                           },
"es_correo_valido":
{ Args: { "p_email": string }; Returns: boolean
                           },
"finish_outbox":
{ Args: { "p_error"?: string,"p_estado": string,"p_id": string,"p_proveedor_id"?: string }; Returns: undefined
                           },
"guardar_config_parqueo":
{ Args: { "p_config": Json,"p_sede_id": string }; Returns: Json
                           },
"guardar_plantilla_inspeccion":
{ Args: { "p_activo": boolean,"p_id": string,"p_nombre": string,"p_predeterminada": boolean,"p_puntos": Json,"p_sede_id": string }; Returns: string
                           },
"guardar_trabajo_catalogo":
{ Args: { "p_activo": boolean,"p_id": string,"p_lineas": Json,"p_nombre": string,"p_sede_id": string }; Returns: string
                           },
"guardar_traducciones":
{ Args: { "p_idioma_destino": string,"p_sede_id": string,"p_textos": Json }; Returns: undefined
                           },
"hoy_taller":
{ Args: { "p_sede_id"?: string }; Returns: string
                           },
"importar_estado_cuenta":
{ Args: { "p_importacion": Json,"p_movimientos": Json }; Returns: string
                           },
"indicadores_taller":
{ Args: { "p_desde": string,"p_hasta": string,"p_sede_id": string }; Returns: Json
                           },
"iniciar_inspeccion":
{ Args: { "p_orden_id": string,"p_plantilla_id"?: string }; Returns: string
                           },
"iniciar_reloj":
{ Args: { "p_labor_id": string }; Returns: string
                           },
"invoke_edge_function":
{ Args: { "p_body"?: Json,"p_name": string }; Returns: number
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_assigned_to_order":
{ Args: { "p_orden_id": string }; Returns: boolean
                           },
"marcar_estatus_enviado":
{ Args: { "p_cola_id": string,"p_estatus": string }; Returns: undefined
                           },
"marcar_labor_completada":
{ Args: { "p_completado"?: boolean,"p_labor_id": string }; Returns: Json
                           },
"marcar_lista_para_entregar":
{ Args: { "p_orden_id": string }; Returns: Json
                           },
"marcar_punto_inspeccion":
{ Args: { "p_estado": string,"p_nota"?: string,"p_punto_id": string }; Returns: undefined
                           },
"margen_ordenes":
{ Args: { "p_desde": string,"p_desplazamiento"?: number,"p_hasta": string,"p_limite"?: number,"p_sede_id": string,"p_tz"?: string }; Returns: Json
                           },
"mis_ordenes_asignadas":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"notificar":
{ Args: { "p_cuerpo": string,"p_datos"?: Json,"p_orden_id"?: string,"p_tipo": string,"p_titulo": string,"p_usuarios": (string)[] }; Returns: number
                           },
"notificar_cliente_avance":
{ Args: { "p_orden_id": string }; Returns: string
                           },
"ordenes_esperando_autorizacion":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"ordenes_esperando_repuestos":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"parqueo_config_sede":
{ Args: { "p_sede_id": string }; Returns: Json
                           },
"parqueo_de_orden":
{ Args: { "p_orden_id": string }; Returns: Json
                           },
"pay_commissions":
{ Args: { "p_comision_ids": (string)[],"p_comprobante_url"?: string,"p_fecha_pago"?: string,"p_metodo"?: string,"p_notas"?: string,"p_numero_cheque"?: string,"p_usuario_id": string }; Returns: {
              "comprobante_url": string | null,
"creado_en": string,
"fecha_pago": string,
"id": string,
"metodo": string,
"monto": number,
"notas": string | null,
"numero_cheque": string | null,
"pagado_por": string | null,
"sede_id": string,
"usuario_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "comision_pagos"
        isOneToOne: true
        isSetofReturn: false
      } },
"plantillas_inspeccion":
{ Args: { "p_sede_id": string }; Returns: Json
                           },
"preferencia_correos_portal":
{ Args: { "p_acepta": boolean,"p_token": string }; Returns: Json
                           },
"preferencia_idioma_portal":
{ Args: { "p_idioma": string,"p_token": string }; Returns: Json
                           },
"probar_push":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"programar_proximo_servicio":
{ Args: { "p_fecha": string,"p_idioma"?: string,"p_millas": number,"p_nota": string,"p_orden_id": string }; Returns: {
              "fecha": string | null,
"idioma": string | null,
"millas": number | null,
"nota": string | null,
"orden_id": string,
"programado_en": string | null,
"programado_por": string | null,
"sede_id": string,
"sugerido_en": string | null,
"sugerido_fecha": string | null,
"sugerido_millas": number | null,
"sugerido_nota": string | null,
"sugerido_por": string | null,
"token": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orden_proximo_servicio"
        isOneToOne: true
        isSetofReturn: false
      } },
"publicar_inspeccion":
{ Args: { "p_inspeccion_id": string,"p_publicar": boolean }; Returns: undefined
                           },
"purge_old_notifications":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"quitar_proximo_servicio":
{ Args: { "p_orden_id": string }; Returns: undefined
                           },
"quitar_trabajo":
{ Args: { "p_trabajo_id": string }; Returns: undefined
                           },
"recalcular_parqueo_pendiente":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"recalculate_order_totals":
{ Args: { "target_order_id": string }; Returns: undefined
                           },
"recordar_ordenes_vencidas":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"recordar_presupuestos_sin_respuesta":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"regenerar_enlace_cliente":
{ Args: { "p_orden_id": string }; Returns: {
              "accesos": number,
"creado_en": string,
"creado_por": string | null,
"expira_en": string | null,
"id": string,
"orden_id": string,
"revocado_en": string | null,
"revocado_por": string | null,
"sede_id": string,
"token": string,
"ultimo_acceso_en": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "orden_enlaces"
        isOneToOne: true
        isSetofReturn: false
      } },
"registrar_anticipo":
{ Args: { "p_comprobante_ruta"?: string,"p_metodo": string,"p_monto": number,"p_numero_cheque"?: string,"p_orden_id": string }; Returns: Json
                           },
"registrar_autorizacion":
{ Args: { "p_aprobadas": (string)[],"p_lineas": (string)[],"p_nombre"?: string,"p_nota"?: string,"p_orden_id": string,"p_via": string }; Returns: Json
                           },
"registrar_push":
{ Args: { "p_auth": string,"p_endpoint": string,"p_p256dh": string,"p_user_agent"?: string }; Returns: undefined
                           },
"reintentar_correos_fallidos":
{ Args: { "p_horas"?: number }; Returns: number
                           },
"reintentar_envio":
{ Args: { "p_id": string }; Returns: undefined
                           },
"renombrar_trabajo":
{ Args: { "p_titulo": string,"p_trabajo_id": string }; Returns: undefined
                           },
"reportar_hallazgo":
{ Args: { "p_descripcion": string,"p_orden_id": string }; Returns: Json
                           },
"repuestos_de_orden":
{ Args: { "p_orden_id": string }; Returns: {
              "cantidad": number,"descripcion": string,"estado": string,"estado_pedido": string,"id": string
            }[]
                           },
"requiere_atencion":
{ Args: { "p_hoy"?: string,"p_sede_id"?: string }; Returns: Json
                           },
"responder_presupuesto_portal":
{ Args: { "p_aprobadas": (string)[],"p_comentario": string,"p_ip": string,"p_lineas": (string)[],"p_nombre": string,"p_presupuesto_id": string,"p_token": string,"p_user_agent": string }; Returns: Json
                           },
"resumen_empleado":
{ Args: { "p_usuario_id": string }; Returns: Json
                           },
"resumen_importaciones":
{ Args: { "p_sede_id"?: string }; Returns: Json
                           },
"resumen_mis_comisiones":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"resumen_panel":
{ Args: { "p_hoy": string,"p_sede_id": string,"p_tz"?: string }; Returns: Json
                           },
"retirar_sin_reparar":
{ Args: { "p_cobro"?: number,"p_comprobante_ruta"?: string,"p_concepto"?: string,"p_conservar"?: (string)[],"p_metodo"?: string,"p_numero_cheque"?: string,"p_orden_id": string }; Returns: Json
                           },
"reverse_order_delivery_finance":
{ Args: { "target_order_id": string }; Returns: undefined
                           },
"revocar_enlace_cliente":
{ Args: { "p_orden_id": string }; Returns: undefined
                           },
"saldo_orden":
{ Args: { "p_orden_id": string }; Returns: Json
                           },
"saldo_retiro":
{ Args: { "p_cobro"?: number,"p_conservar"?: (string)[],"p_orden_id": string }; Returns: Json
                           },
"sede_delete_impact":
{ Args: { "p_sede_id": string }; Returns: Json
                           },
"sugerir_proximo_servicio":
{ Args: { "p_fecha": string,"p_millas": number,"p_nota": string,"p_orden_id": string }; Returns: undefined
                           },
"sync_order_commissions":
{ Args: { "target_order_id": string }; Returns: undefined
                           },
"sync_order_parts_expense":
{ Args: { "target_order_id": string }; Returns: undefined
                           },
"trabajos_de_orden":
{ Args: { "p_orden_id": string }; Returns: Json
                           },
"trabajos_pendientes_vehiculo":
{ Args: { "p_excluir_orden"?: string,"p_vehiculo_id": string }; Returns: Json
                           },
"traducciones_orden":
{ Args: { "p_orden_id": string }; Returns: Json
                           },
"traducciones_portal":
{ Args: { "p_token": string }; Returns: Json
                           },
"usuarios_con_push":
{ Args: Record<PropertyKey, never>; Returns: {
              "dispositivos": number,"usuario_id": string
            }[]
                           },
"vista_previa_parqueo":
{ Args: { "p_fecha_evento": string,"p_hasta": string,"p_perfil": Json }; Returns: Json
                           }
          }
          Enums: {
            "order_status": "recepcion"|"en_proceso"|"espera_autorizacion"|"finalizado"|"entregado","task_status": "pendiente"|"en_curso"|"completada","transaction_category": "pago_cliente"|"compra_repuesto"|"planilla"|"gasto_operativo"|"comision_bancaria","transaction_type": "ingreso"|"egreso","user_role": "admin"|"mecanico"|"pintor","work_type": "mecanica"|"pintura"|"combinado"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "order_status": ["recepcion", "en_proceso", "espera_autorizacion", "finalizado", "entregado"],"task_status": ["pendiente", "en_curso", "completada"],"transaction_category": ["pago_cliente", "compra_repuesto", "planilla", "gasto_operativo", "comision_bancaria"],"transaction_type": ["ingreso", "egreso"],"user_role": ["admin", "mecanico", "pintor"],"work_type": ["mecanica", "pintura", "combinado"]
          }
        }
} as const
