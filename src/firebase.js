import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCgvWW3Ee9I2l7h6HHbp5Wz2y5cCiyUn2k",
  authDomain: "somotwebapp.firebaseapp.com",
  projectId: "somotwebapp",
  storageBucket: "somotwebapp.firebasestorage.app",
  messagingSenderId: "768855367026",
  appId: "1:768855367026:web:1cd689d3cdee74f98b11eb",
  measurementId: "G-Q7XX0E2PF8"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export default app;
