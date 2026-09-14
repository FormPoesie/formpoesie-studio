export function shippingMethodForChannel(channel: string) {
  return channel === 'Abholung' ? 'abholung' : null;
}

export function invoiceCustomerIsComplete(name: string, address: string) {
  return name.trim().length > 0 && address.trim().length > 0;
}
