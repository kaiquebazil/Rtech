import { db, isConfigured } from "./firebase.js";
import { doc, runTransaction, serverTimestamp, collection } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = selector => document.querySelector(selector);
const form = $("#quoteForm");
const message = $("#formMessage");
const submit = $("#submitButton");
const MAX_SIZE = 8 * 1024 * 1024;

$("#year").textContent = new Date().getFullYear();
$("#marca").addEventListener("change", event => $("#outraMarcaLabel").classList.toggle("hidden", event.target.value !== "Outro"));
$("#outroServicoCheck").addEventListener("change", event => $("#outroServicoLabel").classList.toggle("hidden", !event.target.checked));
$("#observacao").addEventListener("input", event => $("#charCount").textContent = event.target.value.length);
$("#telefone").addEventListener("input", event => { let v = event.target.value.replace(/\D/g, "").slice(0, 11); event.target.value = v.length > 10 ? v.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3") : v.replace(/(\d{2})(\d{0,5})(\d{0,4})/, (_, a,b,c) => b ? `(${a}) ${b}${c ? `-${c}` : ""}` : a); });

document.querySelectorAll(".photo-slot").forEach(slot => {
  const input = slot.querySelector("input"), img = slot.querySelector("img"), remove = slot.querySelector("button");
  input.addEventListener("change", () => { const file = input.files[0]; if (!file) return; if (!validateImage(file)) { input.value = ""; return; } img.src = URL.createObjectURL(file); slot.classList.add("has-image"); });
  remove.addEventListener("click", () => { if (img.src.startsWith("blob:")) URL.revokeObjectURL(img.src); input.value = ""; img.removeAttribute("src"); slot.classList.remove("has-image"); });
});
function validateImage(file) { if (!file.type.startsWith("image/")) return showMessage("Envie apenas arquivos de imagem.", "error"), false; if (file.size > MAX_SIZE) return showMessage("Cada foto deve ter no máximo 8 MB.", "error"), false; return true; }
function showMessage(text, type) { message.textContent = text; message.className = `form-message ${type}`; }
function selectedServices() { return [...document.querySelectorAll("#services input:checked")].map(input => input.value); }
function formIsValid() {
  const required = [["#nome", "Informe seu nome completo."], ["#telefone", "Informe seu telefone."], ["#marca", "Selecione a marca do aparelho."], ["#modelo", "Informe o modelo do aparelho."]];
  for (const [selector, text] of required) if (!$(selector).value.trim()) return showMessage(text, "error"), false;
  if ($("#marca").value === "Outro" && !$("#outraMarca").value.trim()) return showMessage("Informe a marca do aparelho.", "error"), false;
  if (!$("#fotoFrente").files[0] || !$("#fotoTraseira").files[0]) return showMessage("Adicione as fotos frontal e traseira.", "error"), false;
  if (!selectedServices().length) return showMessage("Selecione pelo menos um serviço.", "error"), false;
  if (selectedServices().includes("Outro") && !$("#outroServico").value.trim()) return showMessage("Descreva o outro serviço solicitado.", "error"), false;
  return true;
}
async function compressImage(file) {
  const image = await createImageBitmap(file);
  const presets = [[1200, .76], [900, .68], [720, .60], [600, .52]];
  for (const [max, quality] of presets) {
    const ratio = Math.min(1, max / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * ratio);
    canvas.height = Math.round(image.height * ratio);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= 300 * 1024) return blob;
  }
  throw new Error("Imagem muito grande para o modo gratuito.");
}
async function reserveProtocol() {
  const counterRef = doc(db, "configuracao", "contadorOrcamentos");
  const number = await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(counterRef);
    if (!snapshot.exists()) throw new Error("Contador de protocolos não configurado.");
    const current = snapshot.data().ultimo;
    if (!Number.isInteger(current) || current < 0) throw new Error("Contador de protocolos inválido.");
    const next = current + 1;
    transaction.update(counterRef, { ultimo: next });
    return next;
  });
  return `ORC-${String(number).padStart(6, "0")}`;
}
async function photoToDataUrl(file) {
  const compressed = await compressImage(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Não foi possível processar a imagem."));
    reader.readAsDataURL(compressed);
  });
}
async function trackingId(phone) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(phone.replace(/\D/g, "")));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
form.addEventListener("submit", async event => { event.preventDefault(); if (!isConfigured) return showMessage("O Firebase ainda não foi configurado. Consulte o README.", "error"); if (!formIsValid() || !navigator.onLine) return !navigator.onLine && showMessage("Você está sem conexão. Tente novamente quando estiver online.", "error");
  submit.disabled = true; submit.querySelector("span").textContent = "Enviando orçamento..."; showMessage("", "");
  try { const protocol = await reserveProtocol(); const [fotoFrente, fotoTraseira] = await Promise.all([photoToDataUrl($("#fotoFrente").files[0]), photoToDataUrl($("#fotoTraseira").files[0])]); const services = selectedServices(); const phone = $("#telefone").value.trim(); const trackerId = await trackingId(phone); await runTransaction(db, async transaction => { const orderRef = doc(collection(db, "orcamentos")); const trackerRef = doc(db, "acompanhamentos", trackerId); const trackerSnapshot = await transaction.get(trackerRef); const brand = $("#marca").value === "Outro" ? $("#outraMarca").value.trim() : $("#marca").value; const trackingOrder = { protocolo: protocol, aparelho: `${brand} ${$("#modelo").value.trim()}`, status: "novo", valor: null, previsaoEntrega: "" }; const pedidos = trackerSnapshot.exists() ? [...(trackerSnapshot.data().pedidos || []), trackingOrder] : [trackingOrder]; transaction.set(orderRef, { protocolo: protocol, nome: $("#nome").value.trim(), telefone: phone, marca: brand, modelo: $("#modelo").value.trim(), fotoFrente, fotoTraseira, servicos: services, outroServico: services.includes("Outro") ? $("#outroServico").value.trim() : "", observacao: $("#observacao").value.trim(), valor: null, status: "novo", criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }); transaction.set(trackerRef, { pedidos, atualizadoEm: serverTimestamp() }); }); $("#protocolValue").textContent = protocol; $("#trackOrderLink").href = "acompanhar.html"; $("#formView").classList.add("hidden"); $("#successView").classList.remove("hidden"); window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error(error);
    const code = error.code || "";
    let text = "Não foi possível enviar agora. Tente novamente em instantes.";
    if (error.message.includes("Contador") || code === "firestore/failed-precondition") text = "O contador de protocolos deve existir no Firebase e o campo 'ultimo' precisa ser do tipo Número (ex.: 0).";
    if (code === "permission-denied" || code === "firestore/permission-denied") text = "O Firestore bloqueou o envio. Publique a versão atual de firestore.rules e tente novamente.";
    if (error.message.includes("Imagem muito grande")) text = "Uma das fotos ficou grande mesmo após a compressão. Escolha uma imagem mais simples ou tire outra foto.";
    showMessage(text, "error");
    submit.disabled = false;
    submit.querySelector("span").textContent = "Solicitar orçamento";
  }
});
$("#newQuote").addEventListener("click", () => { form.reset(); document.querySelectorAll(".photo-slot").forEach(slot => slot.classList.remove("has-image")); $("#successView").classList.add("hidden"); $("#formView").classList.remove("hidden"); $("#outraMarcaLabel").classList.add("hidden"); $("#outroServicoLabel").classList.add("hidden"); });
