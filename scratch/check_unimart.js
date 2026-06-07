import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
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

async function checkUnimart() {
  console.log("Checking Unimart Capitol docs for June 2026...");
  try {
    const q = query(
      collection(db, 'daily_sales'),
      where('branchId', '==', 'Unimart Capitol'),
      where('date', '>=', '2026-06-01'),
      where('date', '<=', '2026-06-30')
    );
    const snap = await getDocs(q);
    console.log(`Found ${snap.size} documents:`);
    snap.forEach(doc => {
      const data = doc.data();
      console.log(`Doc ID: ${doc.id}`);
      console.log(` - Date: ${data.date}`);
      console.log(` - Channel: ${data.channelId}`);
      console.log(` - Net: ${data.financials?.net || data.net}`);
      console.log(` - hourlyNet:`, data.hourlyNet ? Object.keys(data.hourlyNet) : 'None');
    });
  } catch (err) {
    console.error("Error:", err);
  }
}

checkUnimart();
