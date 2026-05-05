import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyA7D1fTwaU_wEMAXVusCe-KZ64qlTtKch8",
  authDomain: "absenlokasi-467200.firebaseapp.com",
  projectId: "absenlokasi-467200",
  storageBucket: "absenlokasi-467200.firebasestorage.app",
  messagingSenderId: "321828779854",
  appId: "1:321828779854:web:c0c5b378af6c3e38bad01f",
  measurementId: "G-0CFXJT72YN"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export default app;
