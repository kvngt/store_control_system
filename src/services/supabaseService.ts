// ===================================================
// RESTORIFY — Supabase data-access facade
//
// The implementation lives in one module per domain (`*.service.ts`), each
// owning its own tables and its own Supabase queries. This file only composes
// them back into the flat `supabaseService` object every screen already
// imports, so the split cost the UI layer nothing and a screen can migrate to
// the narrower `customersService` / `workOrdersService` imports at its own pace.
//
// Prefer importing the specific domain service in new code: it keeps a screen's
// dependencies honest and makes the module graph say who talks to what.
// ===================================================

import { commissionsService } from './commissions.service';
import { customersService } from './customers.service';
import { dashboardService } from './dashboard.service';
import { financeService } from './finance.service';
import { searchService } from './search.service';
import { sedesService } from './sedes.service';
import { storageService } from './storage.service';
import { usersService } from './users.service';
import { vehiclesService } from './vehicles.service';
import { workOrdersService } from './workOrders.service';

export {
  commissionsService,
  customersService,
  dashboardService,
  financeService,
  searchService,
  sedesService,
  storageService,
  usersService,
  vehiclesService,
  workOrdersService,
};

export const supabaseService = {
  ...sedesService,
  ...usersService,
  ...customersService,
  ...vehiclesService,
  ...workOrdersService,
  ...storageService,
  ...searchService,
  ...financeService,
  ...commissionsService,
  ...dashboardService,
};
