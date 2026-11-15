import { Car } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { useLanguage } from '../../../../context/language.context';
import { money } from '../../../../lib/money';
import type { WorkOrder } from '../../../../types/database';
import ParkingCard from '../../../parking/ParkingCard';
import type { SectionStateProps } from '../detailTypes';
import { useOrderParking } from '../useOrderParking';

interface ParkingSectionProps {
  order: WorkOrder;
  isAdmin: boolean;
  sectionProps: SectionStateProps;
}

export default function ParkingSection({
  order,
  isAdmin,
  sectionProps,
}: ParkingSectionProps) {
  const { t } = useLanguage();
  const { isParkingEnabled, parkingAmount } = useOrderParking(order.id, order.sede_id, isAdmin);

  if (!isAdmin || !isParkingEnabled) return null;

  return (
    <CollapsibleSection
      {...sectionProps}
      title={t('parking.orderCard.title')}
      icon={<Car size={18} />}
      summary={parkingAmount > 0 ? money(parkingAmount) : undefined}
    >
      <ParkingCard order={order} />
    </CollapsibleSection>
  );
}
