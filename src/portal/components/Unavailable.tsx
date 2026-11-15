import { Phone } from 'lucide-react';
import { telUrl } from '../../lib/phone';
import type { PortalStrings } from '../format';
import type { PortalShop } from '../portal.types';
import { shopPhones } from '../shopPhones';
import { ContactPhones } from './ContactPhones';
import { EmailPreference } from './EmailPreference';
import { ShopHeader } from './ShopHeader';

export interface UnavailableProps {
  state: 'no_encontrado' | 'revocado' | 'vencido';
  shop?: PortalShop;
  cliente?: { tiene_correo: boolean; acepta_correos: boolean };
  token: string | null;
  s: PortalStrings;
}

export function Unavailable({ state, shop, cliente, token, s }: UnavailableProps) {
  const [title, body] =
    state === 'revocado'
      ? [s.revokedTitle, s.revokedBody]
      : state === 'vencido'
        ? [s.expiredTitle, s.expiredBody]
        : [s.notFoundTitle, s.notFoundBody];
  const tel = telUrl(shop?.telefono);
  const phones = shopPhones(shop);

  return (
    <div className="portal-body">
      {shop && <ShopHeader shop={shop} />}
      <section className="portal-card portal-unavailable">
        <h1>{title}</h1>
        <p>{body}</p>
        {phones.length > 0 ? (
          <ContactPhones phones={phones} s={s} whatsappMessage="" />
        ) : (
          tel && (
            <a className="btn btn-primary" href={tel}>
              <Phone size={16} /> {s.call} {shop?.telefono}
            </a>
          )
        )}
      </section>
      {state === 'vencido' && cliente?.tiene_correo && token && (
        <EmailPreference token={token} initial={cliente.acepta_correos} soloBaja s={s} />
      )}
    </div>
  );
}
