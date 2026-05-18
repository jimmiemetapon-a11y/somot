
import { db } from './src/firebase.js';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

async function check() {
  const q = query(collection(db, 'expenses'), where('category', '==', 'Pantry'), limit(20));
  const snap = await getDocs(q);
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}, Purpose: ${data.purpose}, FundedBy: ${data.fundedBy}, Status: ${data.status}`);
  });
}

check();
