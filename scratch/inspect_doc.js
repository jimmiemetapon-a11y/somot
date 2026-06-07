import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
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

async function inspectDoc() {
  const docIds = [
    'dinein_UnimartCapitol_2026-06-04',
    'grabfood_UnimartCapitol_2026-06-04',
    'foodpanda_UnimartCapitol_2026-06-04'
  ];
  for (const docId of docIds) {
    console.log(`\n--- Document: ${docId} ---`);
    try {
      const snap = await getDoc(doc(db, 'daily_sales', docId));
      if (snap.exists()) {
        console.log(JSON.stringify(snap.data(), null, 2));
      } else {
        console.log("Not found");
      }
    } catch (err) {
      console.error(err);
    }
  }
}

inspectDoc();
