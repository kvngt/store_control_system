// Las plantillas viven con las edge functions (supabase/functions/_shared/email),
// pero son TypeScript puro: se prueban aquí, con el resto.
import { describe, it, expect } from 'vitest';
import { escapeHtml, renderEmail, type EmailContext } from '../../supabase/functions/_shared/email/templates.ts';

const base: EmailContext = {
  portalUrl: 'https://reinventa.shop/r/' + 'a'.repeat(64),
  cliente: { nombre: 'Marta Ruiz' },
  taller: {
    nombre: 'Reinventa Norte',
    direccion: 'Oak 12',
    telefono: '555-0100',
    email: 'taller@reinventa.shop',
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
    expect(subject('espera_repuestos')).toMatch(/espera repuestos/);
    expect(subject('finalizado')).toMatch(/está listo/);
    expect(subject('entregado')).toMatch(/^Gracias por su visita/);
  });

  it('no redacta un aviso de estado para uno que no se anuncia ni una plantilla desconocida', () => {
    expect(renderEmail('estatus', { ...base, orden: { ...base.orden, estatus: 'recepcion' } })).toBeNull();
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

  it('solo usa un logo https y un color hexadecimal; lo demás cae al valor por defecto', () => {
    const email = renderEmail('avance', {
      ...base,
      taller: { ...base.taller, logoUrl: 'javascript:alert(1)', color: 'red;background:url(x)' },
    })!;
    expect(email.html).not.toContain('javascript:');
    expect(email.html).not.toContain('url(x)');
    expect(email.html).toContain('#D4A017');
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
});

describe('escapeHtml', () => {
  it('escapa los cinco caracteres con significado en HTML', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });
});
