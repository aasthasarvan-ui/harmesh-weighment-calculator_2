import { initializeApp } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";


import { 
getAuth
} 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";


import { 
getDatabase
} 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";



// Firebase Configuration

const firebaseConfig = {

apiKey: "AIzaSyBleiQ6oSse-mF00_rd7keZGN93r_Eorwc",

authDomain: "mobil-otp-verification.firebaseapp.com",

databaseURL:
"https://mobil-otp-verification-default-rtdb.firebaseio.com",

projectId: "mobil-otp-verification",

storageBucket:
"mobil-otp-verification.firebasestorage.app",

messagingSenderId: "562891080486",

appId:
"1:562891080486:web:3adcc0c00a5785f88437e7"

};




// Initialize Firebase

const app = initializeApp(firebaseConfig);




// Firebase Services

const auth = getAuth(app);

const database = getDatabase(app);




// Export for app.js

export {

auth,

database

};
