import { useEffect } from 'react';
import { Shield } from 'lucide-react';
import { useLanguage } from '../context/language.context';

export default function PrivacyPolicy() {
  const { language } = useLanguage();

  useEffect(() => {
    document.title = language === 'en' ? 'Privacy Policy - Restorify' : 'Aviso de Privacidad - Restorify';
  }, [language]);

  const EnContent = () => (
    <>
      <p><em>Last updated: October 2026</em></p>
      
      <h3>1. Who We Are and What This Covers</h3>
      <p>This Privacy Policy explains how we collect, use, and share your personal information when you use our services at the shop, our customer portal, or communicate with us.</p>
      
      <h3>2. Information We Collect</h3>
      <p>We collect information you provide directly (such as your name, phone number, and email address), vehicle information (VIN, make, model, year, license plate), and service history. We also capture photos, videos (which may include ambient audio), and diagnostic data from your vehicle to document its condition and the work performed. If you provide a deposit or payment, we may capture a photo of the receipt or check.</p>
      
      <h3>3. How We Use Your Information</h3>
      <p>We use your information to:</p>
      <ul>
        <li>Service your vehicle and fulfill your work order.</li>
        <li>Communicate with you regarding estimates, approvals, and vehicle status.</li>
        <li>Process payments and collect unpaid balances.</li>
        <li>Document the condition of your vehicle at intake and delivery to protect against false claims.</li>
        <li>Comply with legal obligations under Maryland law.</li>
      </ul>
      
      <h3>4. Photos, Videos, and Recordings</h3>
      <p>Photos and videos of your vehicle are taken strictly for documentation and service purposes. Our staff and authorized technicians will have access to them. We will not publish images or videos of your vehicle for marketing purposes without your explicit consent.</p>
      
      <h3>5. How We Share Your Information</h3>
      <p>We <strong>do not sell</strong> your personal information. We share your information only with service providers who process data on our behalf (such as our database hosting in Canada, email delivery services, error monitoring, and VIN decoding APIs). We may also disclose information to law enforcement or authorities if required by law.</p>

      <h3>6. Data Retention</h3>
      <p>We keep your information, including photos and service history, for as long as necessary to provide our services, maintain proper business records, and comply with tax and legal requirements. After this period, data will be securely deleted or anonymized.</p>

      <h3>7. Security</h3>
      <p>We implement reasonable security measures, including role-based access control and encrypted backups, to protect your data. However, no electronic storage system is completely secure, and we cannot guarantee absolute security.</p>

      <h3>8. Your Rights</h3>
      <p>You have the right to request access to, correction, or deletion of your personal data, subject to legal and business record exceptions. You may also opt out of non-essential communications at any time. To exercise these rights, please contact the shop directly.</p>

      <h3>9. Children's Privacy</h3>
      <p>Our services are not directed to individuals under 13 years of age.</p>

      <h3>10. Changes to This Policy</h3>
      <p>We may update this Privacy Policy from time to time. The revised policy will be posted on this page with the updated date.</p>
    </>
  );

  const EsContent = () => (
    <>
      <p><em>Última actualización: Octubre 2026</em></p>
      
      <h3>1. Quiénes somos y a qué se aplica</h3>
      <p>Este Aviso de Privacidad explica cómo recopilamos, usamos y compartimos su información personal cuando utiliza nuestros servicios en el taller, nuestro portal para clientes, o al comunicarse con nosotros.</p>
      
      <h3>2. Qué datos recopilamos</h3>
      <p>Recopilamos la información que nos proporciona directamente (nombre, teléfono y correo electrónico), información del vehículo (VIN, marca, modelo, año, placa) y el historial de servicios. También capturamos fotos, videos (que pueden incluir sonido ambiente) y datos de diagnóstico de su vehículo para documentar su estado y el trabajo realizado. Si entrega un depósito, podemos tomar una foto del comprobante o cheque.</p>
      
      <h3>3. Para qué usamos su información</h3>
      <p>Utilizamos su información para:</p>
      <ul>
        <li>Atender su orden y reparar su vehículo.</li>
        <li>Comunicarnos con usted sobre cotizaciones, aprobaciones y el estado del servicio.</li>
        <li>Procesar pagos y cobrar saldos pendientes.</li>
        <li>Documentar el estado de su vehículo al recibirlo y entregarlo para proteger al taller ante un reclamo.</li>
        <li>Cumplir con obligaciones legales según las leyes de Maryland.</li>
      </ul>
      
      <h3>4. Fotos, videos y grabaciones</h3>
      <p>Las fotos y videos de su vehículo se toman estrictamente con fines de documentación. Nuestro personal y técnicos autorizados tendrán acceso a ellos. No publicaremos imágenes o videos de su vehículo con fines publicitarios sin su consentimiento explícito.</p>
      
      <h3>5. Con quién compartimos su información</h3>
      <p>Nosotros <strong>no vendemos</strong> su información personal. Solo compartimos su información con proveedores de servicios que procesan datos por cuenta nuestra (como nuestro alojamiento de base de datos en Canadá, servicios de envío de correos, monitoreo de errores y APIs de decodificación de VIN). También podemos revelar información a las autoridades si la ley lo exige.</p>

      <h3>6. Cuánto tiempo la guardamos</h3>
      <p>Conservamos su información, incluidas las fotos y el historial de servicios, durante el tiempo necesario para brindar nuestros servicios, mantener registros comerciales adecuados y cumplir con los requisitos fiscales y legales. Transcurrido este período, los datos se eliminarán o anonimizarán de forma segura.</p>

      <h3>7. Seguridad</h3>
      <p>Implementamos medidas de seguridad razonables, que incluyen control de acceso por roles y copias de seguridad cifradas, para proteger sus datos. Sin embargo, ningún sistema de almacenamiento es completamente seguro, por lo que no podemos prometer seguridad absoluta.</p>

      <h3>8. Sus derechos</h3>
      <p>Tiene derecho a solicitar el acceso, la corrección o el borrado de sus datos personales, sujeto a excepciones por requisitos legales o de registros comerciales. También puede darse de baja de nuestras comunicaciones no esenciales en cualquier momento. Para ejercer estos derechos, comuníquese directamente con el taller.</p>

      <h3>9. Menores de edad</h3>
      <p>Nuestros servicios no están dirigidos a menores de 13 años.</p>

      <h3>10. Cambios a este aviso</h3>
      <p>Podemos actualizar este Aviso de Privacidad ocasionalmente. La versión revisada se publicará en esta página con la fecha actualizada.</p>
    </>
  );

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar-content">
          <div className="topbar-left">
            <h1 className="topbar-title">
              <Shield size={20} className="icon-title" />
              {language === 'en' ? 'Privacy Policy' : 'Aviso de Privacidad'}
            </h1>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="card" style={{ maxWidth: '800px', margin: '0 auto', padding: 'var(--space-6)' }}>
          <div className="prose">
            {language === 'en' ? <EnContent /> : <EsContent />}
          </div>
        </div>
      </main>
    </div>
  );
}
