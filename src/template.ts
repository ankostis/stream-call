export function applyTemplate(
  template: string,
  context: Record<string, unknown>,
  options: { onMissing?: 'leave' | 'empty' | 'throw' } = { onMissing: 'leave' }
): string {
  const onMissing = options.onMissing ?? 'leave';
  const placeholderRe = /\{\{(\w+)(?:\|(url|json))?\}\}/gi;

  // Case-insensitive matching
  const normalizedContext = Object.fromEntries(
    Object.entries(context).map(([k, v]) => [k.toLowerCase(), v])
  );

  const encodeJsonString = (val: unknown) => JSON.stringify(String(val));
  const applyFilter = (val: unknown, filter?: 'url' | 'json') => {
    if (filter === 'url') return encodeURIComponent(String(val ?? ''));
    if (filter === 'json') return encodeJsonString(val);
    return String(val ?? '');
  };

  return template.replace(placeholderRe, (_m, key: string, filter?: 'url' | 'json') => {
    const value = normalizedContext[key.toLowerCase()];
    const hasValue = value !== undefined && value !== null;
    if (!hasValue) {
      if (onMissing === 'empty') return '';
      if (onMissing === 'throw') throw new Error(`Missing placeholder: ${key}`);
      return `{{${key}${filter ? '|' + filter : ''}}}`;
    }
    return applyFilter(value, filter);
  });
}
