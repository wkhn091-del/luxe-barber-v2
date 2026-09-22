/** "+97235550123" → "03-555-0123" · "+972501234567" → "050-123-4567". Anything else comes back as given. */
export function displayPhone(raw = '') {
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('972')) d = `0${d.slice(3)}`;
  if (/^0[57]\d{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (/^0[2-489]\d{7}$/.test(d)) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return String(raw);
}

/** A Waze link for the shop: the barber's own share link, or one built from the address. */
export function wazeFor(shop) {
  if (shop?.wazeUrl) return shop.wazeUrl;
  const address = shop?.addressLine?.trim();
  return address ? `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes` : null;
}
