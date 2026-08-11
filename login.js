let loginEmail = "";

const emailStep =
  document.getElementById("emailStep");

const otpStep =
  document.getElementById("otpStep");

const loginEmailInput =
  document.getElementById("loginEmail");

const loginOtpInput =
  document.getElementById("loginOtp");

const loginMessage =
  document.getElementById("loginMessage");


function showLoginMessage(message, type = "") {
  if (!loginMessage) return;

  loginMessage.textContent = message;
  loginMessage.className = `login-message ${type}`;
}


/* ==========================================================
   IF ALREADY SIGNED IN → GO TO FORGE
========================================================== */

document.addEventListener("DOMContentLoaded", async () => {

  const { data } =
    await forgeSupabase.auth.getSession();

  if (data?.session) {
    window.location.href = "./index.html";
  }

});


/* ==========================================================
   SEND VERIFICATION CODE
========================================================== */

document
  .getElementById("sendLoginCode")
  ?.addEventListener("click", async () => {

    const email =
      loginEmailInput?.value
        .trim()
        .toLowerCase();

    if (!email) {
      showLoginMessage(
        "Enter your email address.",
        "error"
      );
      return;
    }

    showLoginMessage(
      "Sending verification code..."
    );

    const { error } =
      await forgeSupabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false
        }
      });

    if (error) {
      console.error(
        "FORGE OTP ERROR:",
        error
      );

      showLoginMessage(
        error.message,
        "error"
      );

      return;
    }

    loginEmail = email;

    const otpEmailDisplay =
      document.getElementById("otpEmailDisplay");

    if (otpEmailDisplay) {
      otpEmailDisplay.textContent = email;
    }

    emailStep?.classList.add("hidden");
    otpStep?.classList.remove("hidden");

    showLoginMessage(
      "Verification code sent.",
      "success"
    );

    loginOtpInput?.focus();
  });


/* ==========================================================
   VERIFY CODE
========================================================== */

document
  .getElementById("verifyLoginCode")
  ?.addEventListener("click", async () => {

    const token =
      loginOtpInput?.value.trim();

    if (
      !loginEmail ||
      !token ||
      token.length !== 6
    ) {
      showLoginMessage(
        "Enter the 6-digit verification code.",
        "error"
      );
      return;
    }

    showLoginMessage(
      "Verifying..."
    );

    const {
      data,
      error
    } =
      await forgeSupabase.auth.verifyOtp({
        email: loginEmail,
        token,
        type: "email"
      });

    if (error) {
      console.error(
        "OTP VERIFY ERROR:",
        error
      );

      showLoginMessage(
        "That code is invalid or expired.",
        "error"
      );

      return;
    }

    if (!data?.session) {
      showLoginMessage(
        "FORGE could not create your session.",
        "error"
      );

      return;
    }

    showLoginMessage(
      "Welcome to FORGE.",
      "success"
    );

    window.location.href =
      "./index.html";
  });


/* ==========================================================
   CHANGE EMAIL
========================================================== */

document
  .getElementById("changeLoginEmail")
  ?.addEventListener("click", () => {

    otpStep?.classList.add("hidden");
    emailStep?.classList.remove("hidden");

    if (loginOtpInput) {
      loginOtpInput.value = "";
    }

    showLoginMessage("");

    loginEmailInput?.focus();
  });


/* ==========================================================
   RESEND CODE
========================================================== */

document
  .getElementById("resendLoginCode")
  ?.addEventListener("click", async () => {

    if (!loginEmail) return;

    showLoginMessage(
      "Sending a new code..."
    );

    const { error } =
      await forgeSupabase.auth.signInWithOtp({
        email: loginEmail,
        options: {
          shouldCreateUser: false
        }
      });

    if (error) {
      showLoginMessage(
        error.message,
        "error"
      );

      return;
    }

    showLoginMessage(
      "A new verification code was sent.",
      "success"
    );
  });


/* ==========================================================
   ENTER KEY SUPPORT
========================================================== */

loginEmailInput?.addEventListener(
  "keydown",
  (event) => {

    if (event.key !== "Enter") return;

    document
      .getElementById("sendLoginCode")
      ?.click();

  }
);


loginOtpInput?.addEventListener(
  "keydown",
  (event) => {

    if (event.key !== "Enter") return;

    document
      .getElementById("verifyLoginCode")
      ?.click();

  }
);
