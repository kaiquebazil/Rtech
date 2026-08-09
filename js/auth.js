import { auth, isConfigured } from "./firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const form = document.querySelector("#loginForm");
const message = document.querySelector("#loginMessage");
const button = document.querySelector("#loginButton");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");

onAuthStateChanged(auth, user => { if (user) location.replace("admin.html"); });

form.addEventListener("submit", async event => {
  event.preventDefault();
  clearMessage();
  if (!isConfigured) return setMessage("A configuração do Firebase está incompleta. Verifique o arquivo firebase-config.js.");
  if (!navigator.onLine) return setMessage("Você está sem conexão. Verifique a internet e tente novamente.");
  if (!emailInput.value.trim() || !passwordInput.value) return setMessage("Preencha seu e-mail e sua senha para continuar.");

  button.disabled = true;
  button.textContent = "Verificando acesso...";
  try {
    await withTimeout(signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value), 15000);
    setMessage("Login realizado com sucesso. Abrindo o painel...", "success");
  } catch (error) {
    console.error(error);
    let text = "E-mail ou senha inválidos. Confira os dados cadastrados no Firebase Authentication.";
    if (error.code === "auth/network-request-failed") text = "Não foi possível conectar ao Firebase. Verifique sua internet e tente novamente.";
    if (error.message === "LOGIN_TIMEOUT") text = "O Firebase demorou para responder. Verifique se o domínio do site foi adicionado em Authentication → Settings → Authorized domains.";
    setMessage(text);
    button.disabled = false;
    button.innerHTML = "Entrar <span>→</span>";
  }
});

function clearMessage() { message.textContent = ""; message.className = "message"; }
function setMessage(text, type = "error") { message.textContent = text; message.className = `message ${type}`; }
function withTimeout(promise, milliseconds) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("LOGIN_TIMEOUT")), milliseconds))
  ]);
}
