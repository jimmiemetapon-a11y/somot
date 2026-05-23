import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, limit } from 'firebase/firestore';
import fs from 'fs';

// Parse .env manually
const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length === 2) {
    env[parts[0].trim()] = parts[1].trim();
  }
});

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspectSales() {
  console.log("Inspecting 'daily_sales' collection structures...");
  const channels = ['dinein', 'grabfood', 'foodpanda', 'online'];
  for (const ch of channels) {
    try {
      const q = query(
        collection(db, 'daily_sales'),
        where('channelId', '==', ch),
        limit(3)
      );
      const snap = await getDocs(q);
      console.log(`\n--- Channel: ${ch} (${snap.size} docs found) ---`);
      snap.forEach(doc => {
        const data = doc.data();
        console.log(`Document ID: ${doc.id}`);
        console.log(`- Date: ${data.date}, Branch: ${data.branchId}`);
        console.log(`- Financials:`, JSON.stringify(data.financials || {}));
        console.log(`- Breakdown:`, JSON.stringify(data.breakdown || {}));
      });
    } catch (err) {
      console.error(`Query failed for ${ch}:`, err.message);
    }
  }
}

async function run() {
  await inspectSales();
}

run();
