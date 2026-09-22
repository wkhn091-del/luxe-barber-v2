/**
 * The same address pattern the server validates with (zod's `.email()`), so the
 * booking form can never accept an address the API would then refuse.
 */
export const EMAIL_PATTERN = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9-]*\.)+[A-Z]{2,}$/i;

export const isEmail = (value) => EMAIL_PATTERN.test(String(value ?? '').trim());

/** For an optional field: empty is fine, anything typed must be a real address. */
export const optionalEmailOk = (value) => !String(value ?? '').trim() || isEmail(value);
