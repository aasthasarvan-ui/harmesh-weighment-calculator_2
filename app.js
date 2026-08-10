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
  query,
  orderByChild,
  equalTo
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// --- 1. GITHUB URL ---
const actionCodeSettings = {
  url: "https://aasthasarvan-ui.github.io/harmesh-weighment-calculator/",
  handleCodeInApp: true
};

// --- 2. SCREEN TOGGLE ---
function openCalculator() {
  document.getElementById("loginScreen").classList.add("hide");
  document.getElementById("calculatorScreen").classList.remove("hide");
}

// --- 3. BROWSER FINGERPRINT GENERATOR ---
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


// --- 4. EMAIL AUTHENTICATION ---
document.getElementById("sendLinkBtn").onclick = async () => {
  let email = document.getElementById("email").value.trim();
  if (email === "") { alert("Enter Email"); return; }
  try {
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    localStorage.setItem("emailForSignIn", email);
    document.getElementById("loginMessage").innerHTML = "Email link sent. Check your mail.";
  } catch (error) {
    alert(error.message);
  }
};

async function checkEmail() {
  if (isSignInWithEmailLink(auth, window.location.href)) {
    let email = localStorage.getItem("emailForSignIn");
    if (!email) { email = prompt("Enter Email"); }
    try {
      await signInWithEmailLink(auth, email, window.location.href);
      openCalculator();
    } catch (e) {
      alert(e.message);
    }
  }
}
checkEmail();


// --- 5. SECURE PIN LOGIN & DEVICE LOCKING ---
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
              openCalculator();
          } else if (user.deviceId === deviceFingerprint) {
              openCalculator();
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


// --- 6. CALCULATOR LOGIC ---
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

document.getElementById("sku1").oninput = calculate;
document.getElementById("bags1").oninput = calculate;
document.getElementById("sku2").oninput = calculate;
document.getElementById("bags2").oninput = calculate;

document.getElementById("resetBtn").onclick = () => {
  document.getElementById("sku1").value = "";
  document.getElementById("bags1").value = "";
  document.getElementById("sku2").value = "";
  document.getElementById("bags2").value = "";
  calculate(); 
};


// --- 7. ADMIN PANEL LOGIC ---
const ADMIN_PASSWORD = "admin"; // Default password, change later

window.openAdminPanel = function() {
    const pass = prompt("Enter Admin Password:");
    if (pass === ADMIN_PASSWORD) {
        document.getElementById('adminModal').classList.remove('hide');
        loadUsersTable();
    } else if (pass !== null) {
        alert("Wrong Password!");
    }
}

window.closeAdminPanel = function() {
    document.getElementById('adminModal').classList.add('hide');
}

window.addNewUser = function() {
    const name = document.getElementById('newUserName').value.trim();
    const pin = document.getElementById('newUserPin').value.trim();

    if (!name || pin.length !== 4) {
        alert("Please provide name and a 4-digit PIN."); return;
    }

    const userId = "user_" + new Date().getTime();
    set(ref(database, 'users/' + userId), {
        name: name,
        pin: pin,
        status: "active",
        deviceId: "" 
    }).then(() => {
        alert("User added successfully!");
        document.getElementById('newUserName').value = '';
        document.getElementById('newUserPin').value = '';
        loadUsersTable();
    });
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
                    <button style="${resetBtnStyle}" onclick="resetDevice('${id}')">Reset PC</button>
                    <button style="${toggleBtnStyle}" onclick="toggleStatus('${id}', '${data.status}')">
                        ${data.status === 'active' ? 'Block' : 'Unblock'}
                    </button>
                `;

                tbody.innerHTML += `
                    <tr>
                        <td>${data.name}</td>
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

window.resetDevice = function(userId) {
    if(confirm("Are you sure you want to reset the PC lock for this user?")) {
        update(ref(database, 'users/' + userId), { deviceId: "" }).then(() => loadUsersTable());
    }
}

window.toggleStatus = function(userId, currentStatus) {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    update(ref(database, 'users/' + userId), { status: newStatus }).then(() => loadUsersTable());
}

