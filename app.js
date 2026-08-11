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
    try {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        console.error("Hashing error:", e);
        return "";
    }
}

// --- HELPER: LOG ACTIVITY TO DATABASE ---
function logActivity(actionDesc) {
    try {
        const logRef = ref(database, 'logs');
        push(logRef, {
            action: actionDesc,
            timestamp: new Date().toLocaleString()
        }).catch(err => console.error("Logging error:", err));
    } catch (e) {
        console.error("Log exception:", e);
    }
}

// --- SESSION TIMEOUT MANAGEMENT (10 Minutes with Warning) ---
let inactivityTimer;
let warningTimer;
let countdownInterval;
let timeLeft = 10 * 60; // 10 minutes in seconds

function updateTimerDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    
    const displayElement = document.getElementById("timerDisplay");
    if (displayElement) {
        displayElement.innerText = `Auto logout in: ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }
}

function resetInactivityTimer() {
    const calcScreen = document.getElementById("calculatorScreen");
    if (!calcScreen || calcScreen.classList.contains("hide")) {
        return; 
    }

    clearTimeout(inactivityTimer);
    clearTimeout(warningTimer);
    clearInterval(countdownInterval);
    
    const warningModal = document.getElementById("sessionWarningModal");
    if (warningModal) {
        warningModal.classList.add("hide");
    }

    timeLeft = 10 * 60;
    updateTimerDisplay();

    countdownInterval = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();

        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
        }
    }, 1000);

    // 9 minutes pure hone par Warning Modal dikhayein
    warningTimer = setTimeout(() => {
        const activeCalcScreen = document.getElementById("calculatorScreen");
        if (activeCalcScreen && !activeCalcScreen.classList.contains("hide")) {
            if (warningModal) {
                warningModal.classList.remove("hide");
            }
        }
    }, 9 * 60 * 1000);

    // 10 minutes pure hone par Logout
    inactivityTimer = setTimeout(() => {
        triggerLogout("Session expired due to 10 minutes of inactivity.");
    }, 10 * 60 * 1000);
}

// User activity events
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, () => {
        const warningModal = document.getElementById("sessionWarningModal");
        if (warningModal && warningModal.classList.contains("hide")) {
            resetInactivityTimer();
        }
    }, true);
});

// Modal buttons event listeners safely bound on DOM load
document.addEventListener("DOMContentLoaded", () => {
    const extendBtn = document.getElementById("extendSessionBtn");
    const forceLogoutBtn = document.getElementById("forceLogoutBtn");

    if (extendBtn) {
        extendBtn.onclick = () => {
            resetInactivityTimer();
            logActivity("Session Extended by User");
        };
    }

    if (forceLogoutBtn) {
        forceLogoutBtn.onclick = () => {
            triggerLogout("Manually logged out from warning prompt.");
        };
    }
});

// --- ENTER KEYBOARD SHORTCUT SUPPORT ---
document.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        const loginScr = document.getElementById("loginScreen");
        const changeModal = document.getElementById("changePinModal");
        const adminPassModal = document.getElementById("adminPasswordModal");

        // If Login Screen is visible
        if (loginScr && !loginScr.classList.contains("hide")) {
            if (document.activeElement.id === "pin") {
                const pinBtn = document.getElementById("pinBtn");
                if (pinBtn) pinBtn.click();
            } else if (document.activeElement.id === "email") {
                const sendBtn = document.getElementById("sendLinkBtn");
                if (sendBtn) sendBtn.click();
            }
        }
        
        // If Change PIN Modal is visible
        if (changeModal && !changeModal.classList.contains("hide")) {
            submitUserPinChange();
        }

        // If Admin Password Modal is visible
        if (adminPassModal && !adminPassModal.classList.contains("hide")) {
            const submitAdminBtn = document.getElementById("submitAdminPin");
            if (submitAdminBtn) submitAdminBtn.click();
        }
    }
});

function openCalculator(userName) {
  const loginScr = document.getElementById("loginScreen");
  const calcScr = document.getElementById("calculatorScreen");
  
  if (loginScr) loginScr.classList.add("hide");
  if (calcScr) calcScr.classList.remove("hide");
  
  // Screen par Welcome text
  const welcomeDisplay = document.getElementById("userWelcomeDisplay");
  if (welcomeDisplay) {
      welcomeDisplay.innerText = `Welcome, ${userName || 'User'}!`;
  }

  // Welcome Popup Modal text
  const welcomeModal = document.getElementById("welcomeModal");
  const welcomeText = document.getElementById("welcomeUserText");
  if (welcomeModal && welcomeText) {
      welcomeText.innerText = `Hello, ${userName || 'User'}!`;
      welcomeModal.classList.remove("hide");
  }

  resetInactivityTimer(); 
  logActivity(`User Logged In: ${userName || 'Email Link User'}`);
}

function triggerLogout(reason = "") {
  clearTimeout(inactivityTimer);
  clearTimeout(warningTimer);
  clearInterval(countdownInterval);
  
  const displayElement = document.getElementById("timerDisplay");
  if (displayElement) {
      displayElement.innerText = ""; 
  }

  const warningModal = document.getElementById("sessionWarningModal");
  if (warningModal) {
      warningModal.classList.add("hide");
  }

  const calcScr = document.getElementById("calculatorScreen");
  const loginScr = document.getElementById("loginScreen");
  const pinInput = document.getElementById("pin");
  const emailInput = document.getElementById("email");
  const loginMsg = document.getElementById("loginMessage");

  if (calcScr) calcScr.classList.add("hide");
  if (loginScr) loginScr.classList.remove("hide");
  if (pinInput) pinInput.value = "";
  if (emailInput) emailInput.value = "";
  if (loginMsg) loginMsg.innerText = reason;
  
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
const sendLinkBtn = document.getElementById("sendLinkBtn");
if (sendLinkBtn) {
  sendLinkBtn.onclick = async () => {
    let emailEl = document.getElementById("email");
    let msgEl = document.getElementById("loginMessage");
    
    if (!emailEl || !msgEl) return;
    
    let email = emailEl.value.trim();
    if (email === "") { 
        msgEl.innerText = "Enter Email"; 
        return; 
    }

    msgEl.innerText = "Verifying authorization...";

    try {
      let usersRef = ref(database, 'users');
      let snapshot = await get(usersRef);

      if (!snapshot.exists()) {
          msgEl.innerText = "Access Denied: No users found in database.";
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
          msgEl.innerText = "Access Denied: This email is not authorized by Admin.";
          return;
      }

      if (!isActive) {
          msgEl.innerText = "Your account is blocked by Admin.";
          return;
      }

      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      localStorage.setItem("emailForSignIn", email);
      msgEl.innerText = "Email link sent. Check your mail.";
      logActivity(`Email login link requested for: ${email}`);
    } catch (error) {
      msgEl.innerText = "Error: " + error.message;
    }
  };
}

async function checkEmail() {
  try {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = localStorage.getItem("emailForSignIn");
      if (!email) { 
          email = prompt("Please enter your email to complete sign-in:"); 
      }
      if (email) {
          await signInWithEmailLink(auth, email, window.location.href);
          window.localStorage.removeItem('emailForSignIn');
          openCalculator(email);
      }
    }
  } catch (e) {
    alert("Email Link Error: " + e.message);
  }
}
checkEmail();


// --- SECURE PIN LOGIN & DEVICE LOCKING ---
const pinBtn = document.getElementById("pinBtn");
if (pinBtn) {
  pinBtn.onclick = async () => {
    let pinEl = document.getElementById("pin");
    let msgEl = document.getElementById("loginMessage");
    
    if (!pinEl || !msgEl) return;
    
    let pinInput = pinEl.value.trim();

    if (pinInput === "" || pinInput.length !== 4) {
        msgEl.innerText = "Enter a valid 4-digit PIN.";
        return;
    }

    msgEl.innerText = "Checking PIN...";

    try {
        let usersRef = ref(database, 'users');
        let q = query(usersRef, orderByChild('pin'), equalTo(pinInput));
        let snapshot = await get(q);

        if (snapshot.exists()) {
            let userData = snapshot.val();
            let userId = Object.keys(userData)[0]; 
            let user = userData[userId];

            if (user.status !== "active") {
                msgEl.innerText = "Your account is blocked by Admin.";
                return;
            }

            if (!user.deviceId || user.deviceId === "") {
                await update(ref(database, 'users/' + userId), { deviceId: deviceFingerprint });
                openCalculator(user.name);
            } else if (user.deviceId === deviceFingerprint) {
                openCalculator(user.name);
            } else {
                msgEl.innerText = "This PIN is already locked to another PC.";
            }
        } else {
            msgEl.innerText = "Invalid PIN!";
        }
    } catch (e) {
        msgEl.innerText = "Error: " + e.message;
    }
  };
}


// --- CALCULATOR LOGIC ---
function calculate() {
  const getNumber = (id) => {
      let el = document.getElementById(id);
      if (!el) return 0;
      let val = Number(el.value);
      return isNaN(val) ? 0 : val;
  };

  let sku1 = getNumber("sku1");
  let bags1 = getNumber("bags1");
  let sku2 = getNumber("sku2");
  let bags2 = getNumber("bags2");

  let totalWeight = (sku1 * bags1) + (sku2 * bags2);
  let totalBags = bags1 + bags2;

  let weightEl = document.getElementById("totalWeight");
  let bagsEl = document.getElementById("totalBags");

  if (weightEl) weightEl.innerText = totalWeight.toFixed(3) + " KG";
  if (bagsEl) bagsEl.innerText = totalBags;
}

['sku1', 'bags1', 'sku2', 'bags2'].forEach(id => {
    let el = document.getElementById(id);
    if (el) {
        el.oninput = calculate;
        el.onchange = calculate;
    }
});

let resetBtn = document.getElementById("resetBtn");
if (resetBtn) {
    resetBtn.onclick = () => {
      let s1 = document.getElementById("sku1");
      let b1 = document.getElementById("bags1");
      let s2 = document.getElementById("sku2");
      let b2 = document.getElementById("bags2");

      if (s1) s1.value = "0";
      if (b1) b1.value = "";
      if (s2) s2.value = "0";
      if (b2) b2.value = "";
      calculate(); 
    };
}

let logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.onclick = () => {
        triggerLogout();
    };
}


// --- ADMIN PANEL LOGIC ---
window.openAdminPanel = function() {
    const passwordModal = document.getElementById('adminPasswordModal');
    const pinInput = document.getElementById('adminPinInput');
    const submitBtn = document.getElementById('submitAdminPin');
    const cancelBtn = document.getElementById('cancelAdminPin');

    if (!passwordModal || !pinInput) return;

    pinInput.value = "";
    passwordModal.classList.remove('hide');
    pinInput.focus();

    if (submitBtn) {
        let newSubmitBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        
        document.getElementById('submitAdminPin').onclick = async function() {
            const pass = pinInput.value.trim();
            if (!pass) return;

            try {
                let adminPinRef = ref(database, 'admin/master_pin');
                let snapshot = await get(adminPinRef);

                let correctPinHash = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4"; 
                if (snapshot.exists()) {
                    correctPinHash = String(snapshot.val());
                }

                const inputHash = await hashString(pass);

                if (inputHash === correctPinHash) {
                    passwordModal.classList.add('hide');
                    let adminModal = document.getElementById('adminModal');
                    if (adminModal) adminModal.classList.remove('hide');
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

    if (cancelBtn) {
        let newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        
        document.getElementById('cancelAdminPin').onclick = function() {
            passwordModal.classList.add('hide');
        };
    }
}

window.closeAdminPanel = function() {
    let adminModal = document.getElementById('adminModal');
    if (adminModal) adminModal.classList.add('hide');
}

window.addNewUser = function() {
    const nameEl = document.getElementById('newUserName');
    const emailEl = document.getElementById('newUserEmail');
    const pinEl = document.getElementById('newUserPin');

    if (!nameEl || !emailEl || !pinEl) return;

    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
    const pin = pinEl.value.trim();

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
        nameEl.value = '';
        emailEl.value = '';
        pinEl.value = '';
        loadUsersTable();
        logActivity(`New User Added: ${name} (${email})`);
    }).catch((error) => {
        alert("Database Error: " + error.message);
    });
}

// --- CHANGE MASTER PIN ---
window.changeMasterPin = async function() {
    const newMasterPinEl = document.getElementById('newMasterPin');
    if (!newMasterPinEl) return;
    
    const newPin = newMasterPinEl.value.trim();

    if (newPin.length !== 4) {
        alert("Master PIN must be exactly 4 digits.");
        return;
    }

    if (confirm("Are you sure you want to change the Master PIN?")) {
        try {
            const hashedNewPin = await hashString(newPin);
            set(ref(database, 'admin/master_pin'), hashedNewPin).then(() => {
                alert("Master PIN updated successfully!");
                newMasterPinEl.value = '';
                logActivity("Admin Master PIN Changed");
            });
        } catch (error) {
            alert("Error updating Master PIN: " + error.message);
        }
    }
}

// --- RESET MASTER PIN TO DEFAULT ---
window.resetMasterPinToDefault = function() {
    if (confirm("Are you sure you want to reset the Master PIN back to default?")) {
        const defaultPinHash = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4";
        set(ref(database, 'admin/master_pin'), defaultPinHash).then(() => {
            alert("Master PIN has been reset successfully!");
            logActivity("Admin Master PIN Reset to Default");
        }).catch((error) => {
            alert("Error resetting Master PIN: " + error.message);
        });
    }
}

// Global cache for users search
let allUsersCache = [];

// --- LOAD USERS TABLE (WITH SEARCH FILTER) ---
window.loadUsersTable = function(searchQuery = "") {
    get(ref(database, 'users')).then((snapshot) => {
        const tbody = document.getElementById('usersListBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        if (snapshot.exists()) {
            allUsersCache = [];
            snapshot.forEach((childSnapshot) => {
                allUsersCache.push({ id: childSnapshot.key, ...childSnapshot.val() });
            });

            const filteredUsers = allUsersCache.filter(user => 
                user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                (user.email && user.email.toLowerCase().includes(searchQuery.toLowerCase()))
            );

            if (filteredUsers.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No users found</td></tr>`;
                return;
            }

            filteredUsers.forEach((data) => {
                const id = data.id;
                let resetBtnStyle = "background-color: #ff9800; color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 3px;";
                let toggleBtnStyle = `background-color: ${data.status === 'active' ? '#dc3545' : '#28a745'}; color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 3px; margin-left: 5px;`;
                let pinEyeStyle = "background: none; border: none; cursor: pointer; font-size: 14px; margin-left: 5px;";

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
                        <td>
                            <span id="pin-text-${id}" style="letter-spacing: 2px;">••••</span>
                            <button style="${pinEyeStyle}" onclick="togglePinVisibility('${id}', '${data.pin}')" id="pin-btn-${id}" title="Show/Hide PIN">👁️</button>
                        </td>
                        <td style="color: ${data.status === 'active' ? 'green' : 'red'}; font-weight: bold;">${data.status.toUpperCase()}</td>
                        <td>${data.deviceId ? '🔒 Locked' : '🔓 Unlocked'}</td>
                        <td>${actionBtns}</td>
                    </tr>
                `;
            });
        }
    }).catch(err => console.error("Error loading users table:", err));
}

// --- FILTER USERS TABLE ---
window.filterUsersTable = function(event) {
    if (event && event.target) {
        const queryVal = event.target.value;
        loadUsersTable(queryVal);
    }
}

// --- USER PIN CHANGE LOGIC ---
window.submitUserPinChange = async function() {
    const emailEl = document.getElementById('currentUserEmailInput');
    const oldPinEl = document.getElementById('currentOldPin');
    const newPinEl = document.getElementById('currentNewPin');

    if (!emailEl || !oldPinEl || !newPinEl) return;

    const email = emailEl.value.trim().toLowerCase();
    const oldPin = oldPinEl.value.trim();
    const newPin = newPinEl.value.trim();

    if (!email || oldPin.length !== 4 || newPin.length !== 4) {
        alert("Please enter valid email and 4-digit PINs.");
        return;
    }

    try {
        let usersRef = ref(database, 'users');
        let snapshot = await get(usersRef);

        if (!snapshot.exists()) {
            alert("No users found.");
            return;
        }

        let foundUserId = null;
        let foundUserData = null;

        snapshot.forEach((childSnapshot) => {
            let userData = childSnapshot.val();
            if (userData.email && userData.email.toLowerCase() === email) {
                foundUserId = childSnapshot.key;
                foundUserData = userData;
            }
        });

        if (!foundUserId) {
            alert("Email not found in database.");
            return;
        }

        if (foundUserData.pin !== oldPin) {
            alert("Incorrect current PIN!");
            return;
        }

        await update(ref(database, 'users/' + foundUserId), { pin: newPin });
        alert("PIN changed successfully!");
        emailEl.value = '';
        oldPinEl.value = '';
        newPinEl.value = '';
        
        let changeModal = document.getElementById('changePinModal');
        if (changeModal) changeModal.classList.add('hide');
        
        logActivity(`PIN Changed by User: ${foundUserData.name}`);

    } catch (error) {
        alert("Error changing PIN: " + error.message);
    }
}

// --- PIN HIDE/SHOW TOGGLE ---
window.togglePinVisibility = function(userId, actualPin) {
    const pinSpan = document.getElementById(`pin-text-${userId}`);
    const pinBtn = document.getElementById(`pin-btn-${userId}`);
    
    if (!pinSpan || !pinBtn) return;

    if (pinSpan.innerText === "••••") {
        pinSpan.innerText = actualPin;
        pinBtn.innerText = "🙈"; 
    } else {
        pinSpan.innerText = "••••";
        pinBtn.innerText = "👁️"; 
    }
}

// --- LOAD AUDIT LOGS ---
window.loadAuditLogs = function() {
    if (typeof database === 'undefined') {
        console.error("Database is not initialized.");
        return;
    }

    const logsRef = query(ref(database, 'logs'), limitToLast(15));
    
    get(logsRef).then((snapshot) => {
        const tbody = document.getElementById('logsListBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        if (snapshot.exists()) {
            let logsArray = [];
            snapshot.forEach((childSnapshot) => {
                logsArray.push(childSnapshot.val());
            });
            
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
