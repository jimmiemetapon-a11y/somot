import { doc, runTransaction, setDoc, deleteDoc } from 'firebase/firestore';
import { AYALA_BRANCH, reconcileAyalaDineOut } from '../utils/ayalaDineOut.js';

const idsForDate = date => ({ dinein: `dinein_AyalaCloverleaf_${date}`, grabfood: `grabfood_AyalaCloverleaf_${date}` });
const eligible = row => row.branchId === AYALA_BRANCH && ['dinein', 'grabfood'].includes(row.channelId);

// Both documents are updated atomically; retries always replace the previous adjustment.
export async function saveWithAyalaDineOut(db, ref, data) {
  if (!eligible(data)) return setDoc(ref, data);
  const ids = idsForDate(data.date);
  return runTransaction(db, async tx => {
    if (data.channelId === 'dinein') {
      const grabRef = doc(db, 'daily_sales', ids.grabfood);
      const grab = await tx.get(grabRef);
      tx.set(ref, reconcileAyalaDineOut(data, grab.exists() ? grab.data() : null, grabRef.id));
    } else {
      const dineRef = doc(db, 'daily_sales', ids.dinein);
      const dine = await tx.get(dineRef);
      tx.set(ref, data);
      if (dine.exists()) tx.set(dineRef, reconcileAyalaDineOut(dine.data(), data, ref.id));
    }
  });
}

export async function syncAyalaDineOut(db, date, dineinId = idsForDate(date).dinein) {
  return runTransaction(db, async tx => {
    const dineRef = doc(db, 'daily_sales', dineinId);
    const grabRef = doc(db, 'daily_sales', idsForDate(date).grabfood);
    const dine = await tx.get(dineRef);
    const grab = await tx.get(grabRef);
    if (!dine.exists()) return false;
    const current = dine.data();
    const next = reconcileAyalaDineOut(current, grab.exists() ? grab.data() : null, grabRef.id);
    if (JSON.stringify(current) !== JSON.stringify(next)) tx.set(dineRef, next);
    return true;
  });
}

export async function deleteWithAyalaDineOut(db, ref, data) {
  if (!eligible(data) || data.channelId !== 'grabfood') return deleteDoc(ref);
  return runTransaction(db, async tx => {
    const dineRef = doc(db, 'daily_sales', idsForDate(data.date).dinein);
    const dine = await tx.get(dineRef);
    tx.delete(ref);
    if (dine.exists()) tx.set(dineRef, reconcileAyalaDineOut(dine.data(), null));
  });
}
