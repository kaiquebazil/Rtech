import { db, isConfigured } from "./firebase.js";
import { doc, runTransaction, serverTimestamp, collection } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const $ = selector => document.querySelector(selector);
const form = $("#quoteForm");
const message = $("#formMessage");
const submit = $("#submitButton");
const successModal = $("#successModal");
const legacySuccessView = $("#successView");
const MAX_SIZE = 8 * 1024 * 1024;
const STORE_WHATSAPP = "5521970997340";

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
function showConfirmation() {
  if (successModal && typeof successModal.showModal === "function") {
    successModal.showModal();
    return;
  }
  // Compatibilidade para a página antiga, enquanto o novo index.html não foi publicado.
  $("#formView")?.classList.add("hidden");
  legacySuccessView?.classList.remove("hidden");
}
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
async function openImageForCompression(file) {
  if (typeof createImageBitmap === "function") {
    const image = await createImageBitmap(file);
    return { image, cleanup: () => image.close?.() };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Não foi possível abrir a imagem selecionada."));
      element.src = url;
    });
    return { image, cleanup: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}
async function compressImage(file) {
  const { image, cleanup } = await openImageForCompression(file);
  const presets = [[1200, .76], [900, .68], [720, .60], [600, .52]];
  try {
    for (const [max, quality] of presets) {
      const ratio = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * ratio);
      canvas.height = Math.round(image.height * ratio);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 300 * 1024) return blob;
    }
  } finally {
    cleanup();
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
  const value = phone.replace(/\D/g, "");
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `legacy-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function buildWhatsAppUrl({ protocol, name, phone, brand, model, services, otherService, observation }) {
  const details = [
    `*Novo pedido de orçamento — ${protocol}*`, `*Cliente:* ${name}`, `*Telefone:* ${phone}`,
    `*Aparelho:* ${brand} ${model}`, `*Serviços:* ${services.join(", ")}`,
    otherService ? `*Outro serviço:* ${otherService}` : "", `*Observação:* ${observation || "Não informada"}`,
    "*Fotos:* enviadas pelo formulário."
  ].filter(Boolean).join("\n");
  return `https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(details)}`;
}
form.addEventListener("submit", async event => { event.preventDefault(); if (!isConfigured) return showMessage("O Firebase ainda não foi configurado. Consulte o README.", "error"); if (!formIsValid() || !navigator.onLine) return !navigator.onLine && showMessage("Você está sem conexão. Tente novamente quando estiver online.", "error");
  submit.disabled = true; submit.querySelector("span").textContent = "Enviando orçamento..."; showMessage("", "");
  try { const protocol = await reserveProtocol(); const [fotoFrente, fotoTraseira] = await Promise.all([photoToDataUrl($("#fotoFrente").files[0]), photoToDataUrl($("#fotoTraseira").files[0])]); const services = selectedServices(); const phone = $("#telefone").value.trim(); const name = $("#nome").value.trim(); const brand = $("#marca").value === "Outro" ? $("#outraMarca").value.trim() : $("#marca").value; const model = $("#modelo").value.trim(); const otherService = services.includes("Outro") ? $("#outroServico").value.trim() : ""; const observation = $("#observacao").value.trim(); const trackerId = await trackingId(phone); await runTransaction(db, async transaction => { const orderRef = doc(collection(db, "orcamentos")); const trackerRef = doc(db, "acompanhamentos", trackerId); const trackerSnapshot = await transaction.get(trackerRef); const trackingOrder = { protocolo: protocol, aparelho: `${brand} ${model}`, status: "novo", valor: null, previsaoEntrega: "" }; const pedidos = trackerSnapshot.exists() ? [...(trackerSnapshot.data().pedidos || []), trackingOrder] : [trackingOrder]; transaction.set(orderRef, { protocolo: protocol, nome: name, telefone: phone, marca: brand, modelo: model, fotoFrente, fotoTraseira, servicos: services, outroServico: otherService, observacao: observation, valor: null, status: "novo", criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() }); transaction.set(trackerRef, { pedidos, atualizadoEm: serverTimestamp() }); }); const whatsappUrl = buildWhatsAppUrl({ protocol, name, phone, brand, model, services, otherService, observation }); const protocolValue = $("#protocolValue"); if (protocolValue) protocolValue.textContent = protocol; const trackOrderLink = $("#trackOrderLink"); if (trackOrderLink) trackOrderLink.href = "acompanhar.html"; const whatsappFallback = $("#whatsappFallback"); if (whatsappFallback) whatsappFallback.href = whatsappUrl; showConfirmation(); window.open(whatsappUrl, "_blank", "noopener");
  } catch (error) {
    console.error(error);
    const code = error.code || "";
    let text = "Não foi possível enviar agora. Tente novamente em instantes.";
    if (error.message?.includes("Contador") || code === "firestore/failed-precondition") text = "O contador de protocolos deve existir no Firebase e o campo 'ultimo' precisa ser do tipo Número (ex.: 0).";
    if (code === "permission-denied" || code === "firestore/permission-denied") text = "O Firestore bloqueou o envio. Publique a versão atual de firestore.rules e tente novamente.";
    if (error.message?.includes("Imagem muito grande") || code === "firestore/resource-exhausted") text = "As fotos deixaram o pedido grande demais. Escolha fotos menores ou mais simples.";
    if (code === "firestore/unavailable" || code === "firestore/deadline-exceeded") text = "Não foi possível conectar ao Firestore agora. Verifique a internet e tente novamente.";
    if (text === "Não foi possível enviar agora. Tente novamente em instantes.") text += ` Código: ${code || error.name || "desconhecido"}. Detalhe: ${error.message || "não informado"}.`;
    showMessage(text, "error");
    submit.disabled = false;
    submit.querySelector("span").textContent = "Solicitar orçamento";
  }
});
$("#newQuote")?.addEventListener("click", () => { successModal?.close(); legacySuccessView?.classList.add("hidden"); $("#formView")?.classList.remove("hidden"); form.reset(); document.querySelectorAll(".photo-slot").forEach(slot => slot.classList.remove("has-image")); $("#outraMarcaLabel").classList.add("hidden"); $("#outroServicoLabel").classList.add("hidden"); });
