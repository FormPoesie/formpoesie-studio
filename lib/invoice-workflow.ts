export function shippingMethodForChannel(channel: string) {
  return channel === 'Abholung' ? 'abholung' : 'versand';
}

export function invoiceCustomerIsComplete(name: string, address: string) {
  return name.trim().length > 0 && address.trim().length > 0;
}
