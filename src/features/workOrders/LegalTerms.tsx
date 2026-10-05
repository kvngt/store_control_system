import { useLanguage } from '../../context/language.context';

export function LegalTerms() {
  const { language } = useLanguage();

  if (language === 'en') {
    return (
      <div className="legal-terms" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)', lineHeight: '1.4' }}>
        <strong>By signing, you:</strong>
        <ol style={{ paddingLeft: '1.2rem', marginTop: '0.5rem', marginBottom: '1rem' }}>
          <li><strong>Authorize</strong> the inspection, diagnosis, and the repairs and parts listed in this estimate, including the estimated completion date. Additional work will be quoted and requires your approval. We will not charge more than 10% over the estimate without your consent.</li>
          <li><strong>Confirm the vehicle condition</strong> at drop-off: mileage, fuel level, and the intake photos/videos documenting prior damage.</li>
          <li><strong>Authorize our staff to operate the vehicle</strong> for testing, diagnosis, and delivery.</li>
          <li><strong>Accept payment terms</strong>: deposit, final balance due at pickup, and storage fees if the vehicle is not picked up within the specified days after notice. You acknowledge the shop holds a mechanic's lien on the vehicle under Maryland law.</li>
          <li><strong>Shop Liability</strong>: The shop may not be liable for damage in certain circumstances while the vehicle is on premises; ask a representative about our liability and insurance. Please do not leave valuables inside the vehicle.</li>
          <li><strong>Replaced parts</strong>: We will offer you the replaced parts, except those that must be returned to the manufacturer under warranty.</li>
          <li><strong>Media and recordings</strong>: You consent to us taking photos and videos of the vehicle to document its condition and our work. These are used to service your order and resolve disputes, and will not be published without your permission.</li>
          <li><strong>Electronic signature</strong>: You consent to sign and receive documents electronically. You may request a paper copy or withdraw this consent by contacting us.</li>
          <li><strong>Acknowledge receiving our Privacy Policy</strong>: <a href="/privacidad" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>View Policy</a>.</li>
        </ol>
      </div>
    );
  }

  return (
    <div className="legal-terms" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)', lineHeight: '1.4' }}>
      <strong>Al firmar, usted:</strong>
      <ol style={{ paddingLeft: '1.2rem', marginTop: '0.5rem', marginBottom: '1rem' }}>
        <li><strong>Autoriza</strong> la inspección y el diagnóstico del vehículo, y los trabajos y repuestos de este presupuesto, con su fecha estimada de terminación. Cualquier trabajo adicional se le cotizará y solo se hará si lo autoriza. No le cobraremos más del 10 % sobre lo presupuestado sin su consentimiento.</li>
        <li><strong>Confirma el estado en que entrega el vehículo</strong>: millas, nivel de gasolina y las fotos y videos de la inspección de recepción, que registran los daños previos.</li>
        <li><strong>Autoriza al personal a manejar el vehículo</strong> para pruebas, diagnóstico y entrega.</li>
        <li><strong>Acepta las condiciones de pago</strong>: el depósito, el pago del saldo al recoger el vehículo y el almacenaje si no lo recoge en el plazo acordado. Reconoce que el taller tiene un gravamen sobre el vehículo por la reparación, las piezas y el almacenaje, según la ley de Maryland.</li>
        <li><strong>Responsabilidad del taller</strong>: mientras el vehículo esté en el taller, el taller puede no ser responsable por daños en ciertas circunstancias; pregunte a un representante hasta dónde llega su responsabilidad y su seguro. Le pedimos no dejar objetos de valor ni documentos en el vehículo.</li>
        <li><strong>Piezas reemplazadas</strong>: le ofreceremos las piezas que se cambien, salvo las que deban volver al fabricante por garantía.</li>
        <li><strong>Fotos, videos y grabaciones</strong>: acepta que tomemos fotos y videos del vehículo para documentar su estado y el trabajo. Se usan para atender su orden y resolver dudas o reclamos, y no se publican sin su permiso.</li>
        <li><strong>Firma y documentos electrónicos</strong>: acepta firmar y recibir documentos de forma electrónica. Puede pedir una copia en papel sin costo en cualquier momento y retirar este consentimiento.</li>
        <li><strong>Reconoce haber recibido el Aviso de Privacidad</strong>: <a href="/privacidad" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Ver Aviso</a>.</li>
      </ol>
    </div>
  );
}
