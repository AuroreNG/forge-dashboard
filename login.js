const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const statusEl = document.getElementById("loginStatus");

loginBtn?.addEventListener("click", login);
registerBtn?.addEventListener("click", register);


/* =========================================================
   LOGIN
========================================================= */

async function login() {
  const email = document
    .getElementById("loginEmail")
    .value
    .trim();

  const password = document
    .getElementById("loginPassword")
    .value;

  if (!email || !password) {
    statusEl.innerText = "Please enter your email and password.";
    return;
  }

  statusEl.innerText = "Signing in...";

  const { data, error } =
    await forgeSupabase.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    console.error("Login error:", error);
    statusEl.innerText = error.message;
    return;
  }

  if (!data.session) {
    statusEl.innerText =
      "Please verify your email before signing in.";
    return;
  }

  window.location.href = "index.html";
}


/* =========================================================
   REGISTER
========================================================= */

async function register() {
  const email = document
    .getElementById("loginEmail")
    .value
    .trim();

  const password = document
    .getElementById("loginPassword")
    .value;

  if (!email || !password) {
    statusEl.innerText =
      "Please enter an email and password.";
    return;
  }

  if (password.length < 6) {
    statusEl.innerText =
      "Password must be at least 6 characters.";
    return;
  }

  statusEl.innerText = "Creating account...";

  const { data, error } =
    await forgeSupabase.auth.signUp({
      email,
      password
    });

  if (error) {
    console.error("Registration error:", error);
    statusEl.innerText = error.message;
    return;
  }

  console.log("User created:", data.user);

  statusEl.innerText =
    "Account created. Please check your email and verify your account, then return here to sign in.";
}
