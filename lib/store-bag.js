const BAG_KEY = 'aadhar_bag';

export function readBag() {
  try {
    const lines = JSON.parse(localStorage.getItem(BAG_KEY) || '[]');
    return Array.isArray(lines) && lines.length <= 50 && lines.every((line) =>
      line && Number.isSafeInteger(line.variant_id) && line.variant_id > 0 &&
      Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 99
    ) ? lines : [];
  } catch {
    return [];
  }
}

export function writeBag(lines) {
  localStorage.setItem(BAG_KEY, JSON.stringify(lines));
  window.dispatchEvent(new Event('shop-bag-change'));
}

export function addToBag(variantId, quantity, available) {
  const id = Number(variantId);
  const count = Number(quantity);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isInteger(count) || count < 1) {
    return { ok: false, message: 'Choose an option and a valid quantity.' };
  }
  const bag = readBag();
  const existing = bag.find((line) => line.variant_id === id);
  if (!existing && bag.length >= 50) return { ok: false, message: 'Your bag can hold up to 50 different items.' };
  const next = (existing?.quantity || 0) + count;
  if (next > 99 || next > Number(available)) return { ok: false, message: 'That quantity is not available. Check your bag or choose fewer.' };
  if (existing) existing.quantity = next;
  else bag.push({ variant_id: id, quantity: count });
  try {
    writeBag(bag);
    return { ok: true, message: 'Added to your bag.' };
  } catch {
    return { ok: false, message: 'Could not save your bag in this browser. Please enable local storage and try again.' };
  }
}
