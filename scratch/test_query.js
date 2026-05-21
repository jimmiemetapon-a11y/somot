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

async function test1() {
  console.log("Testing query on 'expenses' with category IN ['Pantry', 'pantry'] (equality / IN only)...");
  try {
    const q = query(
      collection(db, 'expenses'),
      where('category', 'in', ['Pantry', 'pantry']),
      where('status', '==', 'liquidated'),
      where('fundedBy', '==', 'accountant')
    );
    const snap = await getDocs(q);
    console.log(`Success! Found ${snap.size} documents.`);
  } catch (err) {
    console.error("Expenses query failed:", err.message);
  }
}

async function run() {
  await test1();
}

run();
