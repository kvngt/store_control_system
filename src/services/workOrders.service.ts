// Work orders and everything that hangs off one: labor, parts, assignments,
// progress log, 360-degree intake photos and the customer signature.
import { orderQueries } from './workOrders/queries';
import { orders } from './workOrders/orders';
import { orderRealtime } from './workOrders/realtime';
import { orderLines } from './workOrders/lines';
import { orderMoney } from './workOrders/money';
import { orderFollowUp } from './workOrders/followUp';
import { orderTeam } from './workOrders/team';
import { orderClock } from './workOrders/clock';

export const workOrdersService = {
  ...orderQueries,
  ...orders,
  ...orderRealtime,
  ...orderLines,
  ...orderMoney,
  ...orderFollowUp,
  ...orderTeam,
  ...orderClock,
};
