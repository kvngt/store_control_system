import { useQuery } from '@tanstack/react-query';
import { parkingService } from '../../../services/parking.service';
import { queryKeys } from '../../../lib/queryClient';

export function useOrderParking(orderId: string | undefined, sedeId: string | undefined, isAdmin: boolean) {
  const parkingConfigQuery = useQuery({
    queryKey: queryKeys.parkingConfig(sedeId ?? ''),
    queryFn: () => parkingService.getConfig(sedeId ?? ''),
    enabled: isAdmin && !!sedeId,
  });
  const isParkingEnabled = !!parkingConfigQuery.data?.habilitado;

  const parkingQuery = useQuery({
    queryKey: queryKeys.orderParking(orderId ?? ''),
    queryFn: () => parkingService.getOrderParking(orderId ?? ''),
    enabled: isAdmin && isParkingEnabled && !!orderId,
  });
  const parkingAmount = parkingQuery.data?.monto ?? 0;

  return { isParkingEnabled, parkingAmount };
}
