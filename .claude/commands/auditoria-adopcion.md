---
description: Revisa que un flujo de Restorify aguante los casos reales del taller (cliente sin correo, precio cerrado, dueño que cotiza después, cliente en inglés, iPhone, técnico en el patio). Solo lectura.
argument-hint: <flujo o módulo; por ejemplo "alta de la orden", "presupuesto" o "portal del cliente">
---

Revisa el flujo o módulo **$ARGUMENTS** contra los casos reales del taller (Restorify:
enderezado, pintura y mecánica en Maryland). **Solo lectura:** entrega el informe, no edites.

Para cada caso contesta **PASA**, **FALLA** o **RIESGO**, con `archivo:línea` y el cambio
mínimo que lo arreglaría.

1. **Cliente que solo deja su celular (sin correo).**
   - ¿Algo del flujo exige correo o espera un correo para avanzar? Revisa `clientes.email`,
     `cola_envios` y `encolar_correo_cliente`.
   - ¿Desde ese mismo lugar se le puede mandar su enlace `/r/` o `/s/` por WhatsApp y por
     SMS?
2. **Precio cerrado (por ejemplo, $750 con $300 de depósito).**
   - ¿Se puede registrar un trabajo con un solo precio, sin desglosar repuestos y mano de
     obra?
   - ¿El cliente ve una cuenta clara?
   - ¿Cuántos pasos hay hasta que ese precio quede autorizado y se pueda cobrar?
3. **El dueño pone el precio después.** La administradora recibe el carro sin precio y le
   manda fotos al dueño.
   - ¿El flujo permite una orden sin líneas?
   - ¿El dueño se entera de lo que falta cotizar sin que nadie se lo diga?
4. **Cliente en inglés, mecánico que escribe en español.**
   - ¿Qué ve el cliente al cambiar a inglés en el portal, el PDF, los correos y la página
     del sticker?
   - ¿Algún texto escrito a mano llega sin traducir?
5. **iPhone (Safari o PWA instalada).**
   - Las ventanas (imprimir, PDF) se abren dentro del clic, antes de cualquier `await`.
   - `playsInline` en los videos.
   - Inputs de 16 px y `env(safe-area-inset-*)`.
   - Permisos de cámara y micrófono.
6. **Técnico en el patio.**
   - ¿Su parte se resuelve en 1 o 2 toques desde el teléfono: foto, nota de voz, «terminé»?
   - Si no la hace él, ¿quién termina haciéndola en el sistema?

Termina con la lista de cambios ordenada por impacto en la adopción. Separa lo que es base de
datos y permisos (lo diseña Claude con `/nueva-migracion`) de lo que es interfaz.
