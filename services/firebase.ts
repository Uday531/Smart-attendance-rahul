
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// FIX: `getAuth` is not found in `firebase/auth`. Switching to compat library for auth.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDS-myGAvSIRrtst5Y4wa2004jxatv8zwE",
  authDomain: "smart-attendance-5.firebaseapp.com",
  projectId: "smart-attendance-5",
  storageBucket: "smart-attendance-5.appspot.com",
  messagingSenderId: "1086668277107",
  appId: "1:1086668277107:web:45e5a67f09a5105463f106",
  measurementId: "G-JY4YNB4SYN"
};


// Initialize Firebase using the compat library to ensure the default app instance is created for all services.
const app = firebase.initializeApp(firebaseConfig);

// Export Firebase services
// Compat auth service will automatically use the default app instance
export const auth = firebase.auth();
// FIX: Call getFirestore() and getStorage() without the compat `app` instance.
// This allows the modular functions to correctly find the default initialized app.
export const db = getFirestore();
export const storage = getStorage();