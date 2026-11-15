import { Building2, MessageCircle, Phone, Smartphone } from 'lucide-react';
import { telUrl, whatsAppUrl } from '../../lib/phone';
import type { PortalStrings } from '../format';
import type { PortalPhoneContact } from '../portal.types';

export interface ContactPhonesProps {
  phones: PortalPhoneContact[];
  s: PortalStrings;
  whatsappMessage: string;
}

/**
 * Los teléfonos del taller con su tipo (oficina o celular), descripción o tipo traducido,
 * botón para llamar y, si atiende WhatsApp, botón de WhatsApp para ese número.
 */
export function ContactPhones({ phones, s, whatsappMessage }: ContactPhonesProps) {
  return (
    <ul className="portal-contact-phones">
      {phones.map((p, i) => {
        const tipo = p.tipo === 'celular' ? 'celular' : 'oficina';
        const hasWa = p.whatsapp === true;
        const nombre = p.label?.trim() || (tipo === 'celular' ? s.phoneMobile : s.phoneOffice);
        const telHref = telUrl(p.numero);
        const waHref = hasWa ? whatsAppUrl(p.numero, whatsappMessage) : null;

        return (
          <li key={i} className="portal-contact-phone">
            <span className="portal-contact-phone-info">
              {tipo === 'celular' ? (
                <Smartphone size={16} className="portal-contact-phone-icon" />
              ) : (
                <Building2 size={16} className="portal-contact-phone-icon" />
              )}
              <span className="portal-contact-phone-text">
                <span className="portal-contact-phone-label">{nombre}</span>
                <span className="portal-contact-phone-number">{p.numero}</span>
              </span>
            </span>
            <span className="portal-contact-phone-actions">
              {telHref && (
                <a
                  className="btn btn-secondary"
                  href={telHref}
                  aria-label={`${s.call}: ${nombre}, ${p.numero}`}
                >
                  <Phone size={14} /> {s.call}
                </a>
              )}
              {waHref && (
                <a
                  className="btn btn-primary"
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${s.whatsapp}: ${nombre}, ${p.numero}`}
                >
                  <MessageCircle size={14} /> {s.whatsapp}
                </a>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
