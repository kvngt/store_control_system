import { useEffect } from 'react';
import { Shield } from 'lucide-react';
import { useLanguage } from '../context/language.context';

interface Section {
  title: string;
  body: string[];
  list?: string[];
}

interface Policy {
  title: string;
  updated: string;
  sections: Section[];
}

/**
 * El aviso de privacidad, en español y en inglés (plan-legal-y-privacidad.md §6.3).
 *
 * Es un documento legal y va entero aquí, no en `translations.ts`: es un texto largo que se
 * revisa como unidad (lo revisa un abogado de Maryland antes de darlo por definitivo) y la fase
 * L3 del plan lo pasará a versiones guardadas en la base. Tiene que decir **solo lo que la app
 * hace**: si se agrega un proveedor o un uso de datos, se cambia aquí antes de publicarlo.
 */
const POLICY: Record<'es' | 'en', Policy> = {
  es: {
    title: 'Aviso de Privacidad',
    updated: 'Última actualización: 5 de octubre de 2026',
    sections: [
      {
        title: '1. A qué se aplica',
        body: [
          'Este aviso explica cómo el taller que atiende su vehículo recopila, usa y comparte su información cuando le damos servicio, cuando usa su enlace del taller (el portal del cliente) y cuando le escribimos.',
        ],
      },
      {
        title: '2. Qué datos recopilamos',
        body: ['Recopilamos:'],
        list: [
          'Sus datos de contacto: nombre, teléfono, correo electrónico y dirección.',
          'Los datos de su vehículo: VIN, marca, modelo, año, color, placa, millas y nivel de gasolina al recibirlo.',
          'Fotos y videos del vehículo, al recibirlo y durante el trabajo. Pueden verse la placa, el interior y objetos que haya dejado en él. Los videos pueden grabar sonido.',
          'Su firma de recepción y la fecha en que firmó.',
          'Sus respuestas a los presupuestos: qué autorizó, cuándo, y la dirección IP y el navegador con que respondió en su enlace.',
          'Los pagos y, si nos los da, la foto del comprobante o del cheque.',
        ],
      },
      {
        title: '3. Para qué la usamos',
        body: ['Usamos su información para:'],
        list: [
          'Atender su orden y reparar su vehículo.',
          'Comunicarnos con usted sobre presupuestos, autorizaciones y el estado del servicio.',
          'Cobrar el servicio y llevar nuestros registros.',
          'Documentar el estado de su vehículo al recibirlo y al entregarlo, y resolver dudas o reclamos.',
          'Cumplir con nuestras obligaciones legales, incluidas las leyes de Maryland.',
        ],
      },
      {
        title: '4. Fotos, videos y grabaciones',
        body: [
          'Las fotos y los videos se toman para documentar el vehículo y el trabajo. Los ve el personal del taller, y usted ve los que publicamos en su enlace. No los publicamos con fines publicitarios sin su permiso.',
          'Nuestro personal no graba conversaciones sin el permiso de todos los presentes, como exige la ley de Maryland. Si no quiere que un video grabe sonido, avísenos. No usamos fotos ni grabaciones para reconocer a nadie por su cara o por su voz.',
        ],
      },
      {
        title: '5. Con quién la compartimos',
        body: [
          'No vendemos su información. Solo la compartimos con proveedores que la procesan por cuenta del taller:',
        ],
        list: [
          'Almacenamiento de la base de datos y de los archivos (Supabase), en servidores ubicados en Canadá.',
          'Alojamiento del sitio web (Hostinger) y fuentes tipográficas del sitio (Google Fonts).',
          'Envío de correos (Resend).',
          'Traducción automática al inglés de los textos de su orden que usted ve (Google Gemini).',
          'Decodificación del VIN (NHTSA, del gobierno de EE. UU.).',
          'Monitoreo de fallas de la aplicación (Sentry), sin las fotos ni los textos de la pantalla.',
        ],
      },
      {
        title: '',
        body: ['También podemos entregar información a las autoridades cuando la ley lo exija.'],
      },
      {
        title: '6. Cuánto tiempo la guardamos',
        body: [
          'Guardamos su información, incluidas las fotos y el historial del servicio, mientras sea necesaria para atenderle, llevar nuestros registros y cumplir requisitos fiscales y legales. Después la borramos o la anonimizamos de forma segura.',
        ],
      },
      {
        title: '7. Seguridad',
        body: [
          'Usamos medidas de seguridad razonables: cada persona del taller ve solo lo que su puesto necesita, los archivos se guardan en almacenamiento privado y hay copias de seguridad. Ningún sistema es completamente seguro y no podemos prometer seguridad absoluta. Si una filtración afecta su información, se lo avisaremos como exige la ley de Maryland.',
        ],
      },
      {
        title: '8. Sus derechos',
        body: [
          'Puede pedirnos ver, corregir o borrar sus datos, con las excepciones que fija la ley (por ejemplo, lo que debemos conservar por impuestos o por un reclamo). También puede darse de baja de los correos que no son de su servicio. Para hacerlo, comuníquese con el taller con los datos de contacto de su presupuesto o de su enlace.',
          'Si cree que no tratamos bien su información, puede presentar una queja ante la División de Protección al Consumidor de la Fiscalía General de Maryland.',
        ],
      },
      {
        title: '9. Menores de edad',
        body: ['Nuestros servicios no están dirigidos a menores de 13 años.'],
      },
      {
        title: '10. Cambios a este aviso',
        body: ['Si cambiamos este aviso, publicaremos aquí la versión nueva con su fecha.'],
      },
    ],
  },
  en: {
    title: 'Privacy Notice',
    updated: 'Last updated: October 5, 2026',
    sections: [
      {
        title: '1. What this covers',
        body: [
          'This notice explains how the shop servicing your vehicle collects, uses and shares your information when we service your vehicle, when you use your shop link (the customer portal) and when we email you.',
        ],
      },
      {
        title: '2. Information we collect',
        body: ['We collect:'],
        list: [
          'Your contact details: name, phone, email and address.',
          'Your vehicle details: VIN, make, model, year, color, license plate, mileage and fuel level at drop-off.',
          'Photos and videos of the vehicle, at drop-off and during the work. They may show the plate, the interior and items left in it. Videos may record sound.',
          'Your drop-off signature and the date you signed.',
          'Your answers to estimates: what you authorized, when, and the IP address and browser you used in your link.',
          'Payments and, if you give it to us, a photo of the receipt or check.',
        ],
      },
      {
        title: '3. How we use it',
        body: ['We use your information to:'],
        list: [
          'Service your order and repair your vehicle.',
          'Communicate with you about estimates, authorizations and the status of the service.',
          'Collect payment and keep our records.',
          'Document the condition of your vehicle at drop-off and pickup, and resolve questions or claims.',
          'Comply with our legal obligations, including Maryland law.',
        ],
      },
      {
        title: '4. Photos, videos and recordings',
        body: [
          'Photos and videos are taken to document the vehicle and the work. Shop staff can see them, and you see the ones we publish in your link. We do not publish them for advertising without your permission.',
          'Our staff do not record conversations without the consent of everyone present, as Maryland law requires. If you do not want a video to record sound, let us know. We do not use photos or recordings to identify anyone by their face or voice.',
        ],
      },
      {
        title: '5. Who we share it with',
        body: ['We do not sell your information. We only share it with providers that process it on the shop’s behalf:'],
        list: [
          'Database and file storage (Supabase), on servers located in Canada.',
          'Website hosting (Hostinger) and website fonts (Google Fonts).',
          'Email delivery (Resend).',
          'Automatic translation into English of the order text you see (Google Gemini).',
          'VIN decoding (NHTSA, a U.S. government agency).',
          'App error monitoring (Sentry), without the photos or the on-screen text.',
        ],
      },
      {
        title: '',
        body: ['We may also disclose information to authorities when the law requires it.'],
      },
      {
        title: '6. How long we keep it',
        body: [
          'We keep your information, including photos and service history, for as long as needed to serve you, keep our records and meet tax and legal requirements. After that we securely delete or anonymize it.',
        ],
      },
      {
        title: '7. Security',
        body: [
          'We use reasonable security measures: each staff member sees only what their role needs, files are kept in private storage and there are backups. No system is completely secure and we cannot promise absolute security. If a breach affects your information, we will notify you as Maryland law requires.',
        ],
      },
      {
        title: '8. Your rights',
        body: [
          'You may ask us to access, correct or delete your data, subject to legal exceptions (for example, what we must keep for taxes or a claim). You may also unsubscribe from emails that are not about your service. To do so, contact the shop using the contact details on your estimate or in your link.',
          'If you believe we have not handled your information properly, you may file a complaint with the Consumer Protection Division of the Maryland Attorney General.',
        ],
      },
      {
        title: '9. Children',
        body: ['Our services are not directed to children under 13.'],
      },
      {
        title: '10. Changes to this notice',
        body: ['If we change this notice, we will post the new version here with its date.'],
      },
    ],
  },
};

/** Página pública (`/privacidad`, sin sesión): la enlazan el texto de la firma y el portal. */
export default function PrivacyPolicy() {
  const { language, setLanguage } = useLanguage();
  const policy = POLICY[language === 'en' ? 'en' : 'es'];

  useEffect(() => {
    document.title = `${policy.title} - Restorify`;
  }, [policy.title]);

  return (
    <div className="legal-page">
      <header className="legal-page-header">
        <h1 className="legal-page-title">
          <Shield size={22} aria-hidden="true" /> {policy.title}
        </h1>
        <div className="legal-page-lang" role="group" aria-label="Idioma / Language">
          <button type="button" className={language === 'es' ? 'active' : ''} aria-pressed={language === 'es'} onClick={() => setLanguage('es')}>
            ES
          </button>
          <button type="button" className={language === 'en' ? 'active' : ''} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>
            EN
          </button>
        </div>
      </header>
      <main className="legal-page-body card">
        <p className="legal-page-updated">{policy.updated}</p>
        {policy.sections.map((section, i) => (
          <section key={i}>
            {section.title && <h2>{section.title}</h2>}
            {section.body.map((paragraph, j) => (
              <p key={j}>{paragraph}</p>
            ))}
            {section.list && (
              <ul>
                {section.list.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
