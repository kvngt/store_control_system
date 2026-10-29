import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { directionsUrl, fullAddress, SHOP, shopLine } from './business';
import { telUrl, toWhatsAppNumber } from '../lib/phone';

// index.html repite los datos del taller para los buscadores (no ejecutan JavaScript). Esta prueba
// avisa si uno de los dos cambia y el otro no.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const jsonLd = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]);

describe('the shop details', () => {
  it('index.html says the same as business.ts', () => {
    expect(jsonLd.name).toBe(SHOP.name);
    expect(jsonLd.email).toBe(SHOP.email);
    expect(jsonLd.address).toMatchObject({
      streetAddress: SHOP.street,
      addressLocality: SHOP.city,
      addressRegion: SHOP.region,
      postalCode: SHOP.postalCode,
    });
    const digits = (phone: string) => phone.replace(/\D/g, '');
    const ldPhones = jsonLd.contactPoint.map((point: { telephone: string }) => digits(point.telephone));
    expect(ldPhones).toEqual(SHOP.lines.map((line) => digits(line.e164)));
    expect(digits(jsonLd.telephone)).toBe(digits(shopLine('en').e164));
    expect(jsonLd.sameAs).toEqual(
      expect.arrayContaining([SHOP.links.instagram, SHOP.links.facebook, SHOP.links.beacons, SHOP.links.google]),
    );
    const [weekdays, saturday] = jsonLd.openingHoursSpecification;
    expect([weekdays.opens, weekdays.closes]).toEqual(SHOP.hours.weekdays);
    expect([saturday.opens, saturday.closes]).toEqual(SHOP.hours.saturday);
  });

  it('every line dials and the WhatsApp ones open the right chat', () => {
    for (const line of SHOP.lines) {
      expect(telUrl(line.e164)).toBe(`tel:${line.e164}`);
      expect(line.display.replace(/\D/g, '')).toBe(line.e164.replace(/\D/g, '').slice(1));
    }
    expect(toWhatsAppNumber(shopLine('es').e164)).toBe('12026076126');
    expect(shopLine('office').whatsapp).toBe(false);
  });

  it('the directions link carries the full address', () => {
    const url = new URL(directionsUrl());
    expect(url.hostname).toBe('www.google.com');
    expect(url.searchParams.get('destination')).toBe(`${SHOP.name}, ${fullAddress()}`);
  });

  it('every outside link is https', () => {
    for (const link of Object.values(SHOP.links)) expect(link).toMatch(/^https:\/\//);
  });
});
