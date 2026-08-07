import { auth, database } from "./firebase.js";

import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  ref,
  set,
  get,
  update,
  push,
  query,
  orderByChild,
  equalTo,
  limitToLast
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- GITHUB URL ---
const actionCodeSettings = {
  url: "https://aasthasarvan-ui.github.io/harmesh-weighment-calculator_2/", 
  handleCodeInApp: true
};

// --- HELPER: SHA-256 HASHING FUNCTION ---
async function hashString(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- HELPER: LOG ACTIVITY TO DATABASE (FIXED) ---
function logActivity(actionDesc) {
    const logRef = ref(database, 'logs');
    push(logRef, {
        action: actionDesc,
        timestamp: new Date().toLocaleString()
    }).catch(err => console.error("Logging error:", err));
}

// --- SESSION TIMEOUT MANAGEMENT (10 Minutes) ---

let inactivityTimer;
let countdownInterval;
let timeLeft = 10 * 60; // 10 minutes in seconds

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    
    // Timer display element ka id 'timerDisplay' mana gaya hai
    const displayElement = document.getElementById("timerDisplay");
    if (displayElement) {
        displayElement.innerText = `Auto logout in: ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    clearInterval(countdownInterval);
    
    // Timer ko wapas 10 minutes (600 seconds) par reset karein
    timeLeft = 10 * 60;
    updateTimerDisplay();

    // Har 1 second mein time kam karne ke liye
    countdownInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();

        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
        }
    }, 1000);

    // 10 minutes complete hone par logout trigger hoga
    inactivityTimer = setTimeout(() => {
        if (!document.getElementById("calculatorScreen").classList.contains("hide")) {
            triggerLogout("Session expired due to 10 minutes of inactivity.");
        }
    }, 10 * 60 * 1000);
}

// User activity events (Desktop + Mobile touch support ke sath)
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, resetInactivityTimer, true);
});

// Page load hote hi timer start karein
resetInactivityTimer();

function openCalculator(userName) {
  document.getElementById("loginScreen").classList.add("hide");
  document.getElementById("calculatorScreen").classList.remove("hide");
  resetInactivityTimer();
  logActivity(`User Logged In: ${userName || 'Email Link User'}`);
}

function triggerLogout(reason = "") {
  document.getElementById("calculatorScreen").classList.add("hide");
  document.getElementById("loginScreen").classList.remove("hide");
  document.getElementById("pin").value = "";
  document.getElementById("email").value = "";
  document.getElementById("loginMessage").innerText = reason;
  logActivity("User Logged Out" + (reason ? ` (${reason})` : ""));
}

// --- BROWSER FINGERPRINT GENERATOR ---
let deviceFingerprint = "";
async function loadFingerprint() {
    try {
        const fpPromise = await import('https://openfpcdn.io/fingerprintjs/v4').then(FingerprintJS => FingerprintJS.load());
        const result = await fpPromise.get();
        deviceFingerprint = result.visitorId;
    } catch (e) {
        console.error("Fingerprint error:", e);
    }
}
loadFingerprint();


// --- EMAIL AUTHENTICATION ---
document.getElementById("sendLinkBtn").onclick = async () => {
  let email = document.getElementById("email").value.trim();
  if (email === "") { 
      document.getElementById("loginMessage").innerText = "Enter Email"; 
      return; 
  }

  document.getElementById("loginMessage").innerText = "Verifying authorization...";

  try {
    let usersRef = ref(database, 'users');
    let snapshot = await get(usersRef);

    if (!snapshot.exists()) {
        document.getElementById("loginMessage").innerText = "Access Denied: No users found in database.";
        return;
    }

    let isAuthorized = false;
    let isActive = false;

    snapshot.forEach((childSnapshot) => {
        let userData = childSnapshot.val();
        if (userData.email && userData.email.toLowerCase() === email.toLowerCase()) {
            isAuthorized = true;
            if (userData.status === "active") {
                isActive = true;
            }
        }
    });

    if (!isAuthorized) {
        document.getElementById("loginMessage").innerText = "Access Denied: This email is not authorized by Admin.";
        return;
    }

    if (!isActive) {
        document.getElementById("loginMessage").innerText = "Your account is blocked by Admin.";
        return;
    }

    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    localStorage.setItem("emailForSignIn", email);
    document.getElementById("loginMessage").innerText = "Email link sent. Check your mail.";
    logActivity(`Email login link requested for: ${email}`);
  } catch (error) {
    document.getElementById("loginMessage").innerText = "Error: " + error.message;
  }
};

async function checkEmail() {
  if (isSignInWithEmailLink(auth, window.location.href)) {
    let email = localStorage.getItem("emailForSignIn");
    if (!email) { 
        email = prompt("Please enter your email to complete sign-in:"); 
    }
    try {
      await signInWithEmailLink(auth, email, window.location.href);
      window.localStorage.removeItem('emailForSignIn');
      openCalculator(email);
    } catch (e) {
      alert("Email Link Error: " + e.message);
    }
  }
}
checkEmail();


// --- SECURE PIN LOGIN & DEVICE LOCKING ---
document.getElementById("pinBtn").onclick = async () => {
  let pinInput = document.getElementById("pin").value.trim();

  if (pinInput === "" || pinInput.length !== 4) {
      document.getElementById("loginMessage").innerText = "Enter a valid 4-digit PIN.";
      return;
  }

  document.getElementById("loginMessage").innerText = "Checking PIN...";

  try {
      let usersRef = ref(database, 'users');
      let q = query(usersRef, orderByChild('pin'), equalTo(pinInput));
      let snapshot = await get(q);

      if (snapshot.exists()) {
          let userData = snapshot.val();
          let userId = Object.keys(userData)[0]; 
          let user = userData[userId];

          if (user.status !== "active") {
              document.getElementById("loginMessage").innerText = "Your account is blocked by Admin.";
              return;
          }

          if (!user.deviceId || user.deviceId === "") {
              await update(ref(database, 'users/' + userId), { deviceId: deviceFingerprint });
              openCalculator(user.name);
          } else if (user.deviceId === deviceFingerprint) {
              openCalculator(user.name);
          } else {
              document.getElementById("loginMessage").innerText = "This PIN is already locked to another PC.";
          }
      } else {
          document.getElementById("loginMessage").innerText = "Invalid PIN!";
      }
  } catch (e) {
      document.getElementById("loginMessage").innerText = "Error: " + e.message;
  }
};


// --- CALCULATOR LOGIC ---
function calculate() {
  const getNumber = (id) => {
      let val = Number(document.getElementById(id).value);
      return isNaN(val) ? 0 : val;
  };

  let sku1 = getNumber("sku1");
  let bags1 = getNumber("bags1");
  let sku2 = getNumber("sku2");
  let bags2 = getNumber("bags2");

  let totalWeight = (sku1 * bags1) + (sku2 * bags2);
  let totalBags = bags1 + bags2;

  document.getElementById("totalWeight").innerText = totalWeight.toFixed(3) + " KG";
  document.getElementById("totalBags").innerText = totalBags;
}

document.getElementById("sku1").onchange = calculate;
document.getElementById("bags1").oninput = calculate;
document.getElementById("sku2").onchange = calculate;
document.getElementById("bags2").oninput = calculate;

document.getElementById("resetBtn").onclick = () => {
  document.getElementById("sku1").value = "0";
  document.getElementById("bags1").value = "";
  document.getElementById("sku2").value = "0";
  document.getElementById("bags2").value = "";
  calculate(); 
};

document.getElementById("logoutBtn").onclick = () => {
    triggerLogout();
};


// --- ADMIN PANEL LOGIC (With SHA-256 Hashed Master PIN & PIN Management) ---
window.openAdminPanel = function() {
    const passwordModal = document.getElementById('adminPasswordModal');
    const pinInput = document.getElementById('adminPinInput');
    const submitBtn = document.getElementById('submitAdminPin');
    const cancelBtn = document.getElementById('cancelAdminPin');

    pinInput.value = "";
    passwordModal.classList.remove('hide');
    pinInput.focus();

    let newSubmitBtn = submitBtn.cloneNode(true);
    submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);

    let newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    document.getElementById('cancelAdminPin').onclick = function() {
        document.getElementById('adminPasswordModal').classList.add('hide');
    };

    document.getElementById('submitAdminPin').onclick = async function() {
        const pass = pinInput.value.trim();
        if (!pass) return;

        try {
            let adminPinRef = ref(database, 'admin/master_pin');
            let snapshot = await get(adminPinRef);

            // Default fallback hash for "1234"
            let correctPinHash = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"; 
            if (snapshot.exists()) {
                correctPinHash = String(snapshot.val());
            }

            const inputHash = await hashString(pass);

            if (inputHash === correctPinHash) {
                document.getElementById('adminPasswordModal').classList.add('hide');
                document.getElementById('adminModal').classList.remove('hide');
                loadUsersTable();
                loadAuditLogs();
                logActivity("Admin Panel Accessed Successfully");
            } else {
                alert("Wrong Master PIN!");
                pinInput.value = "";
                logActivity("Failed Admin Panel Login Attempt");
            }
        } catch (error) {
            alert("Error verifying Master PIN: " + error.message);
        }
    };
}

window.closeAdminPanel = function() {
    document.getElementById('adminModal').classList.add('hide');
}

window.addNewUser = function() {
    const name = document.getElementById('newUserName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const pin = document.getElementById('newUserPin').value.trim();

    if (!name || !email || pin.length !== 4) {
        alert("Please provide name, a valid email, and a 4-digit PIN."); 
        return;
    }

    const userId = "user_" + new Date().getTime();
    
    set(ref(database, 'users/' + userId), {
        name: name,
        email: email,
        pin: pin,
        status: "active",
        deviceId: "" 
    }).then(() => {
        alert("User added successfully!");
        document.getElementById('newUserName').value = '';
        document.getElementById('newUserEmail').value = '';
        document.getElementById('newUserPin').value = '';
        loadUsersTable();
        logActivity(`New User Added: ${name} (${email})`);
    }).catch((error) => {
        alert("Database Error: " + error.message);
    });
}

// --- CHANGE MASTER PIN ---
window.changeMasterPin = async function() {
    const newPin = document.getElementById('newMasterPin').value.trim();

    if (newPin.length !== 4) {
        alert("Master PIN must be exactly 4 digits.");
        return;
    }

    if (confirm("Are you sure you want to change the Master PIN?")) {
        try {
            const hashedNewPin = await hashString(newPin);
            set(ref(database, 'admin/master_pin'), hashedNewPin).then(() => {
                alert("Master PIN updated successfully!");
                document.getElementById('newMasterPin').value = '';
                logActivity("Admin Master PIN Changed");
            });
        } catch (error) {
            alert("Error updating Master PIN: " + error.message);
        }
    }
}

// --- RESET MASTER PIN TO DEFAULT ("1234") ---
window.resetMasterPinToDefault = function() {
    if (confirm("Are you sure you want to reset the Master PIN back to default '1234'?")) {
        const defaultPinHash = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4";
        set(ref(database, 'admin/master_pin'), defaultPinHash).then(() => {
            alert("Master PIN has been reset to '1234' successfully!");
            logActivity("Admin Master PIN Reset to Default");
        }).catch((error) => {
            alert("Error resetting Master PIN: " + error.message);
        });
    }
}

window.loadUsersTable = function() {
    get(ref(database, 'users')).then((snapshot) => {
        const tbody = document.getElementById('usersListBody');
        tbody.innerHTML = '';
        if (snapshot.exists()) {
            snapshot.forEach((childSnapshot) => {
                const id = childSnapshot.key;
                const data = childSnapshot.val();
                
                let resetBtnStyle = "background-color: #ff9800; color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 3px;";
                let toggleBtnStyle = `background-color: ${data.status === 'active' ? '#dc3545' : '#28a745'}; color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 3px; margin-left: 5px;`;

                let actionBtns = `
                    <button style="${resetBtnStyle}" onclick="resetDevice('${id}', '${data.name}')">Reset PC</button>
                    <button style="${toggleBtnStyle}" onclick="toggleStatus('${id}', '${data.status}', '${data.name}')">
                        ${data.status === 'active' ? 'Block' : 'Unblock'}
                    </button>
                `;

                tbody.innerHTML += `
                    <tr>
                        <td>${data.name}</td>
                        <td>${data.email || 'N/A'}</td>
                        <td>${data.pin}</td>
                        <td style="color: ${data.status === 'active' ? 'green' : 'red'}; font-weight: bold;">${data.status.toUpperCase()}</td>
                        <td>${data.deviceId ? '🔒 Locked' : '🔓 Unlocked'}</td>
                        <td>${actionBtns}</td>
                    </tr>
                `;
            });
        }
    });
}


     import { getDatabase, ref, query, limitToLast, get } from "https://www.gstatic.com/firebasejs/9.x.x/firebase-database.js"; // (Apne project ke imports ke anusaar rakhein)

window.loadAuditLogs = function() {
    // Agar database ya reference undefined hai toh error se bachne ke liye check
    if (typeof database === 'undefined') {
        console.error("Database is not initialized.");
        return;
    }

    const logsRef = query(ref(database, 'logs'), limitToLast(15));
    
    get(logsRef).then((snapshot) => {
        const tbody = document.getElementById('logsListBody');
        if (!tbody) return; // Agar HTML mein element nahi mila toh aage error na aaye
        
        tbody.innerHTML = '';
        if (snapshot.exists()) {
            let logsArray = [];
            snapshot.forEach((childSnapshot) => {
                logsArray.push(childSnapshot.val());
            });
            
            // Sabse naye logs ko sabse upar dikhane ke liye
            logsArray.reverse().forEach((log) => {
                const timeString = log.timestamp || 'N/A';
                const actionString = log.action || 'Unknown Action';
                
                tbody.innerHTML += `
                    <tr>
                        <td>${timeString}</td>
                        <td style="text-align: left;">${actionString}</td>
                    </tr>
                `;
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="2" style="text-align: center;">No logs found</td></tr>`;
        }
    }).catch((error) => {
        console.error("Error loading audit logs: ", error);
    });
};



window.resetDevice = function(userId, userName) {
    if(confirm(`Are you sure you want to reset the PC lock for ${userName}?`)) {
        update(ref(database, 'users/' + userId), { deviceId: "" }).then(() => {
            loadUsersTable();
            logActivity(`PC Lock Reset for user: ${userName}`);
        });
    }
}

window.toggleStatus = function(userId, currentStatus, userName) {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    update(ref(database, 'users/' + userId), { status: newStatus }).then(() => {
        loadUsersTable();
        logActivity(`User Status Changed (${newStatus.toUpperCase()}): ${userName}`);
    });
}
