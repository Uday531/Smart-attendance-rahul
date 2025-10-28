// Unified Firebase configuration using compat library throughout
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

// Initialize Firebase
let app: firebase.app.App;

try {
  app = firebase.initializeApp(firebaseConfig);
  console.log("Firebase initialized successfully");
} catch (error) {
  // If already initialized, use the existing instance
  app = firebase.app();
  console.log("Using existing Firebase instance");
}

// Export Firebase services using compat library
export const auth = app.auth();
export const db = app.firestore();
export const storage = app.storage();

// Enable Firestore offline persistence (optional but recommended)
db.enablePersistence({ synchronizeTabs: true })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore persistence not available in this browser');
    }
  });

export default app;