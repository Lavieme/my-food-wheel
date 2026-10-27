export function candidates(room) {
  const members = room.members.filter(m => !m.left);
  return room.places.filter(p => !room.rejected.includes(p.id) && members.every(m => m.prefs && p.price <= m.prefs.budget && !m.prefs.excluded.includes(p.id) && !m.prefs.categories.includes(p.category)));
}
export function ready(room) { return room.members.length >= (room.solo ? 1 : 2) && room.members.every(m => m.prefs); }
export function approved(room) { return ready(room) && candidates(room).length > 0 && room.members.every(m => m.approved); }
export function reset(room) {
  room.stage = 'collect'; room.result = null; room.spinAt = null; room.round = (room.round || 0) + 1;
  room.members.forEach(m => { m.approved = false; m.confirmed = false; });
}
export function validatePlaces(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 60) throw new Error('请选择 1–60 家候选店铺');
  const ids = new Set();
  return input.map(p => {
    if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id.trim().slice(0,100))) throw new Error('店铺标识无效或重复');
    ids.add(p.id.trim().slice(0,100));
    if (typeof p.name !== 'string' || !p.name.trim() || !Number.isFinite(p.price) || p.price < 0 || p.price > 10000) throw new Error('请检查店名与人均价格');
    return { id: p.id.trim().slice(0,100), name: p.name.trim().slice(0,60), price: p.price, category: String(p.category || '其他').slice(0,20), address: String(p.address || '').slice(0,200), note: String(p.note || '').slice(0,200), emoji: String(p.emoji || '🍽️').slice(0,12), sample: !!p.sample };
  });
}
