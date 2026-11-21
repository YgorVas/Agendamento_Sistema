export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function phoneVariants(value: string): [string, string] {
  const digits = normalizePhoneDigits(value);
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) {
    return [digits, digits.slice(2)];
  }
  if (digits.length === 10 || digits.length === 11) {
    return [digits, "55" + digits];
  }
  return [digits, digits];
}
