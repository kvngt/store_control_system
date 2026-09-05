export interface Vehicle {
  id: string;
  cliente_id: string;
  /** Derived from the owning customer by a DB trigger; never sent by the app. */
  sede_id?: string;
  marca: string;
  modelo: string;
  anio: number;
  vin: string;
  /** Null for units with no plate at all — auction buys, mostly. Never an
   *  empty string or a placeholder like "SIN PLACA". */
  placa: string | null;
  /** Two-letter US state that issued the plate; null whenever `placa` is. */
  placa_estado?: string | null;
  color: string;
  creado_en: string;
  // Virtual
  cliente_nombre?: string;
}

export interface VehicleInput {
  cliente_id: string;
  marca: string;
  modelo: string;
  anio: number;
  vin: string;
  placa: string | null;
  placa_estado?: string | null;
  color: string;
}
