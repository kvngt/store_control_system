/**
 * Texto de ocupación cuando los carros activos superan la capacidad del taller (A-06).
 * Usa claves separadas de singular y plural para evitar "(s)".
 */
export function formatOverCapacity(
  cars: number,
  spaces: number,
  t: (key: string) => string
): string {
  const carsText =
    cars === 1
      ? t('kanban.carOne')
      : t('kanban.carMany').replace('{n}', String(cars));
  const spacesText =
    spaces === 1
      ? t('kanban.spaceOne')
      : t('kanban.spaceMany').replace('{n}', String(spaces));
  return t('kanban.overCapacity')
    .replace('{cars}', carsText)
    .replace('{spaces}', spacesText);
}
