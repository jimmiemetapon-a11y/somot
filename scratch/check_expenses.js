import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

// Parse .env manually
const envPath = path.resolve('.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
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

async function run() {
  console.log("Fetching recent expenses...");
  const q = query(collection(db, 'expenses'), orderBy('createdAt', 'desc'), limit(15));
  const snap = await getDocs(q);
  snap.docs.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}`);
    console.log(`  Date: ${data.date}`);
    console.log(`  BranchId: ${data.branchId}`);
    console.log(`  Category: "${data.category}"`);
    console.log(`  Purpose: "${data.purpose}"`);
    console.log(`  Amount: ${data.amount}`);
    console.log(`  FundedBy: "${data.fundedBy}"`);
    console.log(`  Status: "${data.status}"`);
    console.log(`  CreatedAt: ${data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt}`);
    console.log('--------------------------------------------');
  });
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
