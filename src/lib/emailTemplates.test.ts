// Las plantillas viven con las edge functions (supabase/functions/_shared/email),
// pero son TypeScript puro: se prueban aquí, con el resto.
import { describe, it, expect } from 'vitest';
import { escapeHtml, renderEmail, renderEmployeeEmail, type EmailContext } from '../../supabase/functions/_shared/email/templates.ts';

// Las pruebas de siempre van en español; las del inglés (el idioma por defecto desde el
// 06/10/2026) están al final.
const base: EmailContext = {
  lang: 'es',
  portalUrl: 'https://restorifyauto.net/r/' + 'a'.repeat(64),
  cliente: { nombre: 'Marta Ruiz' },
  taller: {
    nombre: 'Reinventa Norte',
    direccion: 'Oak 12',
    telefono: '555-0100',
    email: 'taller@restorifyauto.net',
    logoUrl: 'https://cdn.example/logo.png',
    color: '#1E40AF',
  },
  orden: { numero: 'ORD-2026-014', estatus: 'en_proceso', fechaIngreso: '2026-09-10T15:00:00Z', fechaEstimadaEntrega: '2026-10-01' },
  vehiculo: '2019 Toyota Camry',
  timeZone: 'America/Chicago',
};

describe('renderEmail', () => {
  it('redacta el aviso de recepción con el enlace, el número y la fecha estimada sin correrla un día', () => {
    const email = renderEmail('recepcion', { ...base, orden: { ...base.orden, estatus: 'recepcion' } })!;
    expect(email.subject).toBe('Recibimos su 2019 Toyota Camry · ORD-2026-014');
    expect(email.html).toContain(`href="${base.portalUrl}"`);
    expect(email.html).toContain('Hola Marta:');
    // Una fecha DATE no retrocede al 30 de septiembre en EE. UU.
    expect(email.text).toContain('1 de octubre de 2026');
    expect(email.text).toContain(base.portalUrl);
  });

  it('anuncia cada estado con su propio asunto', () => {
    const subject = (estatus: string) => renderEmail('estatus', { ...base, orden: { ...base.orden, estatus } })?.subject;
    expect(subject('en_proceso')).toMatch(/^Estamos trabajando/);
    expect(subject('finalizado')).toMatch(/está listo/);
    expect(subject('entregado')).toMatch(/^Gracias por su visita/);
  });

  it('el correo de finalizado incluye el aviso de parqueo si viene en por_empezar', () => {
    const emailEs = renderEmail('estatus', {
      ...base,
      orden: { ...base.orden, estatus: 'finalizado' },
      parqueo: { estado: 'por_empezar', inicio: '2026-10-15', tarifa_inicial: 40 },
    })!;
    expect(emailEs.text).toContain('A partir del 15 de octubre de 2026 se cobrará parqueo de $40.00 por día.');

    const emailEn = renderEmail('estatus', {
      ...base,
      lang: 'en',
      orden: { ...base.orden, estatus: 'finalizado' },
      parqueo: { estado: 'por_empezar', inicio: '2026-10-15', tarifa_inicial: 40 },
    })!;
    expect(emailEn.text).toContain('Starting October 15, 2026, a parking fee of $40.00 per day will apply.');
  });

  it('el correo de finalizado avisa cuando el parqueo ya está acumulando', () => {
    const emailEs = renderEmail('estatus', {
      ...base,
      orden: { ...base.orden, estatus: 'finalizado' },
      parqueo: { estado: 'acumulando', inicio: '2026-10-15', tarifa_inicial: 40 },
    })!;
    expect(emailEs.text).toContain('Desde el 15 de octubre de 2026 se está cobrando parqueo de $40.00 por día.');

    const emailEn = renderEmail('estatus', {
      ...base,
      lang: 'en',
      orden: { ...base.orden, estatus: 'finalizado' },
      parqueo: { estado: 'acumulando', inicio: '2026-10-15', tarifa_inicial: 40 },
    })!;
    expect(emailEn.text).toContain('Since October 15, 2026, a parking fee of $40.00 per day has been accruing.');
  });

  it('el correo de entrega usa texto sobrio cuando es retirada sin reparar', () => {
    const emailEs = renderEmail('estatus', {
      ...base,
      orden: { ...base.orden, estatus: 'entregado', retirada_sin_reparar: true },
    })!;
    expect(emailEs.subject).toContain('Entrega de vehículo');
    expect(emailEs.text).toContain('sin realizar la reparación');
    expect(emailEs.text).toContain('cobrado o devuelto');
    expect(emailEs.text).not.toContain('Gracias por confiar en nosotros');

    const emailEn = renderEmail('estatus', {
      ...base,
      lang: 'en',
      orden: { ...base.orden, estatus: 'entregado', retirada_sin_reparar: true },
    })!;
    expect(emailEn.subject).toContain('Vehicle pickup summary');
    expect(emailEn.text).toContain('without performing the repair');
    expect(emailEn.text).toContain('charged or refunded');
    expect(emailEn.text).not.toContain('Thank you for trusting us');
  });

  it('no redacta un aviso de estado para uno que no se anuncia ni una plantilla desconocida', () => {
    expect(renderEmail('estatus', { ...base, orden: { ...base.orden, estatus: 'recepcion' } })).toBeNull();
    // Pedir autorización tampoco se anuncia: el presupuesto todavía no existe y su
    // propio correo sale minutos después.
    expect(renderEmail('estatus', { ...base, orden: { ...base.orden, estatus: 'espera_autorizacion' } })).toBeNull();
    expect(renderEmail('factura', base)).toBeNull();
  });

  it('escapa lo que escribió una persona: un nombre no puede inyectar HTML', () => {
    const email = renderEmail('avance', {
      ...base,
      cliente: { nombre: '<script>alert(1)</script>' },
      taller: { ...base.taller, nombre: 'Taller "Bueno" & <Cía>' },
    })!;
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('Taller &quot;Bueno&quot; &amp; &lt;Cía&gt;');
  });

  it('el pie lleva los teléfonos con descripción y WhatsApp; sin lista, el de siempre', () => {
    const telefonos = [
      { label: 'Spanish', numero: '202-607-6126', tipo: 'celular' as const, whatsapp: true },
      { label: '', numero: '+1 (301) 909-9937', tipo: 'oficina' as const, whatsapp: false },
    ];
    const email = renderEmail('avance', { ...base, taller: { ...base.taller, telefonos } })!;
    expect(email.text).toContain('Reinventa Norte · Oak 12 · Spanish: 202-607-6126 (WhatsApp) · Oficina: +1 (301) 909-9937');
    expect(email.html).toContain('Spanish: 202-607-6126 (WhatsApp)');
    expect(email.html).toContain('Oficina: +1 (301) 909-9937');
    expect(email.text).not.toContain('555-0100');

    expect(renderEmail('avance', { ...base, taller: { ...base.taller, telefonos: [] } })!.text).toContain(
      'Reinventa Norte · Oak 12 · 555-0100'
    );
  });

  it('escapa la descripción de un teléfono', () => {
    const email = renderEmail('avance', {
      ...base,
      taller: { ...base.taller, telefonos: [{ label: '<b>Office</b>', numero: '240-355-1266' }] },
    })!;
    expect(email.html).not.toContain('<b>Office</b>');
    expect(email.html).toContain('&lt;b&gt;Office&lt;/b&gt;: 240-355-1266');
  });

  it('solo usa un logo https y un color hexadecimal; lo demás cae al valor por defecto', () => {
    const email = renderEmail('avance', {
      ...base,
      taller: { ...base.taller, logoUrl: 'javascript:alert(1)', color: 'red;background:url(x)' },
    })!;
    expect(email.html).not.toContain('javascript:');
    expect(email.html).not.toContain('url(x)');
    expect(email.html).toContain('#EBC334');
  });

  it('ofrece responder solo si el taller tiene correo de contacto, y siempre la baja', () => {
    const withReply = renderEmail('avance', base)!;
    const withoutReply = renderEmail('avance', { ...base, taller: { ...base.taller, email: null } })!;
    expect(withReply.text).toContain('Puede responder a este correo');
    expect(withoutReply.text).not.toContain('Puede responder a este correo');
    expect(withoutReply.html).toContain(`${base.portalUrl}?correos=baja`);
  });

  it('saluda sin nombre cuando el cliente no tiene uno', () => {
    expect(renderEmail('avance', { ...base, cliente: { nombre: null } })!.text.startsWith('Hola:')).toBe(true);
  });
});

describe('renderEmail: presupuestos', () => {
  const quote = {
    numero: 2,
    estado: 'enviado',
    via: null,
    totalPropuesto: 880,
    totalAprobado: null,
    lineas: [
      { descripcion: 'Frenos', monto: 300, estado: 'pendiente' },
      { descripcion: 'Pintura <brillante>', monto: 500, estado: 'pendiente' },
      { descripcion: 'Diagnóstico', monto: 100, estado: 'aprobado' },
    ],
  };

  it('lista solo lo pendiente, con su total, y escapa las descripciones', () => {
    const email = renderEmail('presupuesto', { ...base, presupuesto: quote })!;
    expect(email.subject).toBe('Presupuesto para su 2019 Toyota Camry · ORD-2026-014');
    expect(email.text).toContain('- Frenos: $300.00');
    expect(email.text).toContain('- Total: $800.00');
    expect(email.text).not.toContain('Diagnóstico');
    expect(email.html).toContain('Pintura &lt;brillante&gt;');
  });

  it('no redacta un presupuesto que ya se respondió o que no tiene nada pendiente', () => {
    expect(renderEmail('presupuesto', { ...base, presupuesto: { ...quote, estado: 'respondido' } })).toBeNull();
    expect(renderEmail('presupuesto', { ...base, presupuesto: { ...quote, lineas: [] } })).toBeNull();
    expect(renderEmail('presupuesto', base)).toBeNull();
  });

  it('la constancia dice qué autorizó y qué no, y cómo lo registró el taller', () => {
    const answered = {
      ...quote,
      estado: 'respondido',
      via: 'admin_telefono',
      totalAprobado: 300,
      lineas: [
        { descripcion: 'Frenos', monto: 300, estado: 'aprobado' },
        { descripcion: 'Pintura', monto: 500, estado: 'rechazado' },
      ],
    };
    const email = renderEmail('presupuesto_confirmacion', { ...base, presupuesto: answered })!;
    expect(email.subject).toBe('Registramos su autorización · ORD-2026-014');
    expect(email.text).toContain('por teléfono');
    expect(email.text).toContain('No autorizados: Pintura.');
    expect(email.text).toContain('- Total autorizado: $300.00');

    const fromPortal = renderEmail('presupuesto_confirmacion', { ...base, presupuesto: { ...answered, via: 'cliente_portal' } })!;
    expect(fromPortal.subject).toBe('Recibimos su respuesta · ORD-2026-014');
  });

  it('usa singular y plural sin "(s)" en la vista previa de presupuesto y confirmación', () => {
    const onePending = { ...quote, lineas: [{ descripcion: 'Frenos', monto: 300, estado: 'pendiente' }] };
    const twoPending = {
      ...quote,
      lineas: [
        { descripcion: 'Frenos', monto: 300, estado: 'pendiente' },
        { descripcion: 'Pintura', monto: 500, estado: 'pendiente' },
      ],
    };
    const oneApproved = { ...quote, estado: 'respondido', via: 'cliente_portal', totalAprobado: 300, lineas: [{ descripcion: 'Frenos', monto: 300, estado: 'aprobado' }] };
    const twoApproved = {
      ...quote,
      estado: 'respondido',
      via: 'cliente_portal',
      totalAprobado: 800,
      lineas: [
        { descripcion: 'Frenos', monto: 300, estado: 'aprobado' },
        { descripcion: 'Pintura', monto: 500, estado: 'aprobado' },
      ],
    };

    expect(renderEmail('presupuesto', { ...base, lang: 'es', presupuesto: onePending })!.html).toContain('1 trabajo por $300.00 espera su autorización.');
    expect(renderEmail('presupuesto', { ...base, lang: 'es', presupuesto: twoPending })!.html).toContain('2 trabajos por $800.00 esperan su autorización.');
    expect(renderEmail('presupuesto', { ...base, lang: 'en', presupuesto: onePending })!.html).toContain('1 job for $300.00 is waiting for your approval.');
    expect(renderEmail('presupuesto', { ...base, lang: 'en', presupuesto: twoPending })!.html).toContain('2 jobs for $800.00 are waiting for your approval.');

    expect(renderEmail('presupuesto_confirmacion', { ...base, lang: 'es', presupuesto: oneApproved })!.html).toContain('Autorizó 1 trabajo por $300.00.');
    expect(renderEmail('presupuesto_confirmacion', { ...base, lang: 'es', presupuesto: twoApproved })!.html).toContain('Autorizó 2 trabajos por $800.00.');
    expect(renderEmail('presupuesto_confirmacion', { ...base, lang: 'en', presupuesto: oneApproved })!.html).toContain('You approved 1 job for $300.00.');
    expect(renderEmail('presupuesto_confirmacion', { ...base, lang: 'en', presupuesto: twoApproved })!.html).toContain('You approved 2 jobs for $800.00.');

    const allSamples = [
      renderEmail('recepcion', { ...base, orden: { ...base.orden, estatus: 'recepcion' } })!,
      renderEmail('estatus', { ...base, orden: { ...base.orden, estatus: 'en_proceso' } })!,
      renderEmail('avance', base)!,
      renderEmail('reporte', base)!,
      renderEmail('presupuesto', { ...base, presupuesto: onePending })!,
      renderEmail('presupuesto_confirmacion', { ...base, presupuesto: oneApproved })!,
      renderEmail('recepcion', { ...base, lang: 'en', orden: { ...base.orden, estatus: 'recepcion' } })!,
      renderEmail('estatus', { ...base, lang: 'en', orden: { ...base.orden, estatus: 'en_proceso' } })!,
      renderEmail('avance', { ...base, lang: 'en' })!,
      renderEmail('reporte', { ...base, lang: 'en' })!,
      renderEmail('presupuesto', { ...base, lang: 'en', presupuesto: onePending })!,
      renderEmail('presupuesto_confirmacion', { ...base, lang: 'en', presupuesto: oneApproved })!,
    ];
    for (const email of allSamples) {
      expect(email.html).not.toContain('(s)');
      expect(email.text).not.toContain('(s)');
    }
  });
});

describe('renderEmail: reporte', () => {
  it('el reporte que manda un admin lleva el enlace y no el contenido', () => {
    const email = renderEmail('reporte', base)!;
    expect(email.subject).toBe('Reporte de su 2019 Toyota Camry · ORD-2026-014');
    expect(email.text).toContain(`Ver reporte: ${base.portalUrl}`);
    expect(email.text).not.toContain('$');
  });
});

describe('escapeHtml', () => {
  it('escapa los cinco caracteres con significado en HTML', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
});

// Pedido del taller del 06/10/2026: los correos llegan en inglés salvo que el cliente elija
// español en su enlace.
describe('renderEmail en inglés', () => {
  const en: EmailContext = { ...base, lang: undefined };

  it('sin idioma, el correo sale en inglés', () => {
    const email = renderEmail('recepcion', { ...en, orden: { ...en.orden, estatus: 'recepcion' } })!;
    expect(email.subject).toBe('We received your 2019 Toyota Camry · ORD-2026-014');
    expect(email.html).toContain('<html lang="en">');
    expect(email.html).toContain('Hi Marta,');
    expect(email.text).toContain('October 1, 2026');
    expect(email.text).toContain('This link is personal');
    expect(email.text).toContain('I do not want to receive these emails');
    expect(email.text).not.toMatch(/Hola|Orden ORD/);
  });

  it('cada plantilla tiene su versión en inglés', () => {
    const quote = { numero: 1, estado: 'enviado', totalPropuesto: 300, lineas: [{ descripcion: 'Brake replacement', monto: 300, estado: 'pendiente' }] };
    expect(renderEmail('estatus', { ...en, orden: { ...en.orden, estatus: 'finalizado' } })!.subject).toBe('Your 2019 Toyota Camry is ready · ORD-2026-014');
    expect(renderEmail('presupuesto', { ...en, presupuesto: quote })!.text).toContain('- Brake replacement: $300.00');
    expect(renderEmail('presupuesto_confirmacion', {
      ...en,
      presupuesto: { ...quote, estado: 'respondido', via: 'admin_telefono', lineas: [{ descripcion: 'Brake replacement', monto: 300, estado: 'rechazado' }] },
    })!.text).toContain('Not approved: Brake replacement.');
    expect(renderEmail('reporte', en)!.subject).toBe('Report for your 2019 Toyota Camry · ORD-2026-014');
    expect(renderEmail('avance', en)!.subject).toBe('Updates on your 2019 Toyota Camry · ORD-2026-014');
  });

  it('con "es" sale en español', () => {
    expect(renderEmail('avance', { ...en, lang: 'es' })!.subject).toBe('Novedades de su 2019 Toyota Camry · ORD-2026-014');
  });

  it('un teléfono sin descripción sale como "Mobile: …" en inglés', () => {
    const telefonos = [
      { label: '', numero: '202-607-6126', tipo: 'celular' as const, whatsapp: true },
    ];
    const email = renderEmail('avance', { ...en, taller: { ...en.taller, telefonos } })!;
    expect(email.text).toContain('Mobile: 202-607-6126 (WhatsApp)');
  });
});

// 06/10/2026: el técnico recibe un correo con la orden asignada y la respuesta del cliente.
describe('renderEmployeeEmail', () => {
  it('lleva el aviso, cada línea juntada y el botón a la orden; escapa lo escrito', () => {
    const email = renderEmployeeEmail({
      appUrl: 'https://restorifyauto.net/work-orders?open=o-1',
      taller: { nombre: 'Reinventa Norte', color: '#1E40AF' },
      tipo: 'tarea_asignada',
      titulo: 'Nueva tarea · ORD-2026-014',
      lineas: ['Cambio de frenos — 2019 Toyota Camry', '<b>Alineación</b>'],
    });
    expect(email.subject).toBe('Nueva tarea · ORD-2026-014');
    expect(email.text).toContain('Tienes trabajo nuevo asignado.');
    expect(email.text).toContain('- Cambio de frenos — 2019 Toyota Camry');
    expect(email.text).toContain('Abrir la orden: https://restorifyauto.net/work-orders?open=o-1');
    expect(email.html).toContain('&lt;b&gt;Alineación&lt;/b&gt;');
  });

  it('la respuesta del presupuesto se presenta como tal', () => {
    const email = renderEmployeeEmail({
      appUrl: 'https://restorifyauto.net/work-orders?open=o-1',
      taller: { nombre: 'Reinventa Norte' },
      tipo: 'presupuesto_respondido',
      titulo: 'Trabajo no autorizado · ORD-2026-014',
      lineas: ['No realizar: Frenos.'],
    });
    expect(email.text).toContain('El cliente respondió el presupuesto de tu orden.');
    expect(email.text).toContain('- No realizar: Frenos.');
  });
});

describe('renderEmail y renderEmployeeEmail: contraste, teléfonos, asunto y botón', () => {
  it('usa #6B6B76 en el pie en lugar de #9A9AA6 y envuelve cada teléfono con white-space:nowrap', () => {
    const telefonos = [
      { label: 'Spanish', numero: '202-607-6126', tipo: 'celular' as const, whatsapp: true },
      { label: 'Office', numero: '+1 (301) 909-9937', tipo: 'oficina' as const, whatsapp: false },
    ];
    const clientEmail = renderEmail('avance', { ...base, taller: { ...base.taller, telefonos } })!;
    expect(clientEmail.html).not.toContain('#9A9AA6');
    expect(clientEmail.html).toContain('<span style="white-space:nowrap">Spanish: 202-607-6126 (WhatsApp)</span>');
    expect(clientEmail.html).toContain('<span style="white-space:nowrap">Office: +1 (301) 909-9937</span>');
    expect(clientEmail.html).not.toContain('<span style="white-space:nowrap">Oak 12</span>');

    const singlePhoneEmail = renderEmail('avance', { ...base, taller: { ...base.taller, telefonos: [] } })!;
    expect(singlePhoneEmail.html).toContain('<span style="white-space:nowrap">555-0100</span>');

    const employeeEmail = renderEmployeeEmail({
      appUrl: 'https://restorifyauto.net/work-orders?open=o-1',
      taller: { nombre: 'Reinventa Norte' },
      tipo: 'asignacion',
      titulo: 'Nueva orden · ORD-2026-014',
      lineas: ['Revisar frenos'],
    });
    expect(employeeEmail.html).not.toContain('#9A9AA6');
    expect(employeeEmail.html).toContain('color:#6B6B76;">Aviso automático de Restorify');
  });

  it('recorta el vehículo largo en el asunto a 40 caracteres y lo deja completo en el cuerpo', () => {
    const longVehicle = '2019 Toyota Land Cruiser Prado VXR Turbo Diésel 4x4';
    const email = renderEmail('avance', { ...base, vehiculo: longVehicle })!;
    const expectedShort = `${longVehicle.slice(0, 39).trimEnd()}…`;
    expect(expectedShort.length).toBeLessThanOrEqual(40);
    expect(email.subject).toBe(`Novedades de su ${expectedShort} · ORD-2026-014`);
    expect(email.subject).not.toContain(longVehicle);
    expect(email.html).toContain(`<title>Novedades de su ${expectedShort} · ORD-2026-014</title>`);
    expect(email.html).toContain(longVehicle);
    expect(email.text).toContain(longVehicle);
  });

  it('agrega borde oscuro al botón cuando el color del taller es muy claro, pero no con colores normales', () => {
    const lightClient = renderEmail('avance', { ...base, taller: { ...base.taller, color: '#F2F2F2' } })!;
    expect(lightClient.html).toContain('background:#F2F2F2;color:#111111;border:1px solid #1A1A1F;');

    const yellowClient = renderEmail('avance', { ...base, taller: { ...base.taller, color: '#EBC334' } })!;
    expect(yellowClient.html).not.toContain('border:1px solid #1A1A1F');

    const lightEmployee = renderEmployeeEmail({
      appUrl: 'https://restorifyauto.net/work-orders?open=o-1',
      taller: { nombre: 'Reinventa Norte', color: '#F2F2F2' },
      tipo: 'asignacion',
      titulo: 'Nueva orden · ORD-2026-014',
      lineas: ['Revisar frenos'],
    });
    expect(lightEmployee.html).toContain('background:#F2F2F2;color:#111111;border:1px solid #1A1A1F;');

    const yellowEmployee = renderEmployeeEmail({
      appUrl: 'https://restorifyauto.net/work-orders?open=o-1',
      taller: { nombre: 'Reinventa Norte', color: '#EBC334' },
      tipo: 'asignacion',
      titulo: 'Nueva orden · ORD-2026-014',
      lineas: ['Revisar frenos'],
    });
    expect(yellowEmployee.html).not.toContain('border:1px solid #1A1A1F');
  });
});
