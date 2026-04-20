// src/firebase.js

import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";  // Import Firebase Auth

const firebaseConfig = {
  apiKey: "AIzaSyDPx06ZtqmGrdBhGcO6X_cSlv3W8Iyo7cM",
  authDomain: "smart-auto-apply.firebaseapp.com",
  projectId: "smart-auto-apply",
  storageBucket: "smart-auto-apply.appspot.com",   // Fixed here
  messagingSenderId: "878166369595",
  appId: "1:878166369595:web:f6ce2990ff464fc1d4831e",
  measurementId: "G-C7637X3NSR"
};

const app = initializeApp(firebaseConfig);

const analytics = getAnalytics(app);

const auth = getAuth(app);

export { auth };
