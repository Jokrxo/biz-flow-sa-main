export const normalizeDigits = (s: string | null | undefined): string => String(s || '').replace(/\D/g, '');
export const isTenDigitPhone = (s: string | null | undefined): boolean => normalizeDigits(s).length === 10;
export const isValidBankAccountNumber = (s: string | null | undefined): boolean => {
  const n = normalizeDigits(s);
  return n.length >= 10 && n.length <= 20;
};
