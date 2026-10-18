export function selectedOptionValues(value: string, optionValues: readonly string[]): string[] {
  const available = new Set(optionValues);
  return [...new Set(value.split(',').filter(optionValue => available.has(optionValue)))];
}

export function updateMultiSelectValue(
  currentValue: string,
  optionValues: readonly string[],
  optionValue: string | null,
  checked: boolean,
): string {
  if (optionValue === null) return checked ? optionValues.join(',') : '';

  const available = new Set(optionValues);
  if (!available.has(optionValue)) return selectedOptionValues(currentValue, optionValues).join(',');

  const selected = new Set(selectedOptionValues(currentValue, optionValues));
  if (checked) selected.add(optionValue);
  else selected.delete(optionValue);
  return optionValues.filter(value => selected.has(value)).join(',');
}
