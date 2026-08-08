document
.getElementById("loginBtn")
.addEventListener("click", login);

async function login(){

const email=
document.getElementById("loginEmail").value;

const password=
document.getElementById("loginPassword").value;

const {error}=await forgeSupabase.auth.signInWithPassword({

email,
password

});

if(error){

document.getElementById("loginStatus").innerText=error.message;

return;

}

window.location="index.html";

}

// Register button
document
.getElementById("registerBtn")
.addEventListener("click",register);

async function register(){

const email=
document.getElementById("loginEmail").value;

const password=
document.getElementById("loginPassword").value;

const {data,error}
=
await forgeSupabase.auth.signUp({

email,
password

});

if(error){

document.getElementById("loginStatus").innerText=error.message;

return;

}

document.getElementById("loginStatus").innerText=
"Account created.";

}
