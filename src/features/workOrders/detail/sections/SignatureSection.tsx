import { CheckCircle2, PenLine } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { useLanguage } from '../../../../context/language.context';
import type { WorkOrder } from '../../../../types/database';
import SignatureCard from '../../SignatureCard';
import type { WorkOrderDetailApi } from '../../useWorkOrderDetail';
import type { SectionStateProps } from '../detailTypes';

interface SignatureSectionProps {
  order: WorkOrder;
  detail: WorkOrderDetailApi;
  sectionProps: SectionStateProps;
}

export default function SignatureSection({
  order,
  detail,
  sectionProps,
}: SignatureSectionProps) {
  const { t } = useLanguage();

  return (
    <CollapsibleSection
      {...sectionProps}
      title={t('workOrders.customerSignature')}
      icon={<PenLine size={18} />}
      summary={order.firma_ruta ? <CheckCircle2 size={16} style={{ color: 'var(--color-success)', verticalAlign: 'middle' }} /> : undefined}
    >
      <SignatureCard
        signaturePath={order.firma_ruta}
        signedAt={order.firma_fecha}
        customerName={order.cliente?.nombre}
        canSign={detail.canSign}
        canResign={detail.canResign}
        saving={detail.savingSignature}
        onSave={detail.saveSignature}
      />
    </CollapsibleSection>
  );
}
