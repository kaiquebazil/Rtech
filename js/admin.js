import { auth, db, isConfigured } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, onSnapshot, query, orderBy, doc, updateDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
const $ = s => document.querySelector(s); let orders = [], activeOrder = null;
const labels = { novo: "Novo", em_analise: "Em análise", orcamento_enviado: "Orçamento enviado", aprovado: "Aprovado", em_manutencao: "Em manutenção", pronto: "Pronto", entregue: "Entregue", cancelado: "Cancelado" };
if (!isConfigured) location.replace("login.html");
onAuthStateChanged(auth, user => { if (!user) return location.replace("login.html"); $("#adminName").textContent = user.email || "Administrador"; listenOrders(); });
$("#logoutButton").addEventListener("click", () => signOut(auth));
$("#search").addEventListener("input", renderOrders); $("#statusFilter").addEventListener("change", renderOrders);
function listenOrders() { onSnapshot(query(collection(db, "orcamentos"), orderBy("criadoEm", "desc")), snapshot => { orders = snapshot.docs.map(d => ({ id: d.id, ...d.data() })); $("#loading").classList.add("hidden"); updateStats(); renderOrders(); }, error => { console.error(error); $("#loading").textContent = "Não foi possível carregar os orçamentos."; }); }
function updateStats() { const count = status => orders.filter(o => o.status === status).length; $("#statNovo").textContent = count("novo"); $("#statAnalise").textContent = count("em_analise"); $("#statAprovado").textContent = count("aprovado"); $("#statTotal").textContent = orders.length; }
function filteredOrders() { const term = $("#search").value.trim().toLowerCase(), status = $("#statusFilter").value; return orders.filter(o => (!term || [o.protocolo,o.nome,o.telefone,o.modelo].some(x => (x || "").toLowerCase().includes(term))) && (status === "todos" || o.status === status)); }
function date(ts) { return ts?.toDate ? ts.toDate().toLocaleDateString("pt-BR") : "—"; }
function escapeHtml(value = "") { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function renderOrders() { const result = filteredOrders(); $("#orderCount").textContent = `${result.length} ${result.length === 1 ? "orçamento" : "orçamentos"}`; $("#orders").innerHTML = result.length ? result.map(o => `<article class="order-row"><div><small>PROTOCOLO</small><strong>${escapeHtml(o.protocolo)}</strong></div><div><small>CLIENTE</small><strong>${escapeHtml(o.nome)}</strong><span>${escapeHtml(o.telefone)}</span></div><div><small>APARELHO</small><strong>${escapeHtml(o.marca)} ${escapeHtml(o.modelo)}</strong><span>${(o.servicos || []).slice(0,2).map(escapeHtml).join(" · ")}</span></div><div><small>STATUS</small><span class="status ${o.status}">${labels[o.status] || o.status}</span></div><div><small>DATA</small><strong>${date(o.criadoEm)}</strong></div><button class="view" data-id="${o.id}">Ver detalhes →</button></article>`).join("") : `<div class="empty">Nenhum orçamento encontrado.</div>`; document.querySelectorAll(".view").forEach(button => button.addEventListener("click", () => openDetail(button.dataset.id))); }
function statusOptions(selected) { return Object.entries(labels).map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join(""); }
function formatCurrency(value) { return value == null ? "" : Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2 }); }
async function trackingId(phone) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(phone.replace(/\D/g, ""))); return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join(""); }
function openDetail(id) { activeOrder = orders.find(o => o.id === id); const o = activeOrder; $("#detailContent").innerHTML = `<p class="eyebrow">${escapeHtml(o.protocolo)}</p><h2>${escapeHtml(o.nome)}</h2><p class="modal-subtitle">Criado em ${date(o.criadoEm)} · Atualizado em ${date(o.atualizadoEm)}</p><div class="detail-grid"><section><h3>Cliente</h3><p><b>Nome</b>${escapeHtml(o.nome)}</p><p><b>Telefone</b>${escapeHtml(o.telefone)}</p></section><section><h3>Aparelho</h3><p><b>Marca</b>${escapeHtml(o.marca)}</p><p><b>Modelo</b>${escapeHtml(o.modelo)}</p></section></div><section><h3>Fotos do aparelho</h3><div class="detail-photos"><button class="image-thumb" data-image="${o.fotoFrente}"><img src="${o.fotoFrente}" alt="Frente"><span>Frente</span></button><button class="image-thumb" data-image="${o.fotoTraseira}"><img src="${o.fotoTraseira}" alt="Traseira"><span>Traseira</span></button></div></section><section><h3>Serviços</h3><div class="tags">${(o.servicos || []).map(s => `<span>${escapeHtml(s)}</span>`).join("")}</div>${o.outroServico ? `<p class="text-note">${escapeHtml(o.outroServico)}</p>` : ""}</section><section><h3>Observação do cliente</h3><p class="text-note">${escapeHtml(o.observacao || "Nenhuma observação enviada.")}</p></section><section class="management"><h3>Gerenciar orçamento</h3><div class="manage-grid"><label>Status<select id="editStatus">${statusOptions(o.status)}</select></label><label>Valor do orçamento (R$)<input id="editValue" inputmode="decimal" value="${formatCurrency(o.valor)}" placeholder="0,00"></label><label>Previsão de entrega<input id="editDelivery" type="date" value="${o.previsaoEntrega || ""}"></label></div><label>Observação interna<textarea id="adminNote" maxlength="1000" placeholder="Visível somente para administradores">${escapeHtml(o.observacaoAdmin || "")}</textarea></label><div class="manage-actions"><button id="saveOrder" class="save">Salvar alterações</button><button id="sendWhatsApp" class="whatsapp">Enviar pelo WhatsApp</button></div></section>`; document.querySelectorAll(".image-thumb").forEach(btn => btn.addEventListener("click", () => showImage(btn.dataset.image))); $("#detailModal").showModal(); }
$("#closeModal").addEventListener("click", () => $("#detailModal").close());
$("#detailModal").addEventListener("click", event => { if (event.target === $("#detailModal")) $("#detailModal").close(); });
document.addEventListener("click", async event => {
  if (event.target.id === "sendWhatsApp") {
    const phone = activeOrder.telefone.replace(/\D/g, "");
    const number = phone.length <= 11 ? `55${phone}` : phone;
    const value = $("#editValue").value.trim() ? `R$ ${$("#editValue").value.trim()}` : "a definir";
    const delivery = $("#editDelivery").value ? new Date(`${$("#editDelivery").value}T12:00:00`).toLocaleDateString("pt-BR") : "a definir";
    const services = (activeOrder.servicos || []).join(", ");
    const text = `Olá, ${activeOrder.nome}! Seu orçamento para ${activeOrder.marca} ${activeOrder.modelo} ficou em ${value}.\n\nServiço: ${services}\nPrazo estimado: ${delivery}\n\nProtocolo: ${activeOrder.protocolo}`;
    window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    return;
  }
  if (event.target.id !== "saveOrder") return;
  const button = event.target, value = $("#editValue").value.trim().replace(/\./g, "").replace(",", "."); const amount = value === "" ? null : Number(value); if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return toast("Informe um valor válido.", true); button.disabled = true; button.textContent = "Salvando...";
  try {
    const status = $("#editStatus").value;
    const delivery = $("#editDelivery").value;
    await updateDoc(doc(db, "orcamentos", activeOrder.id), { status, valor: amount, previsaoEntrega: delivery, observacaoAdmin: $("#adminNote").value.trim(), atualizadoEm: serverTimestamp() });
    const trackerRef = doc(db, "acompanhamentos", await trackingId(activeOrder.telefone));
    await runTransaction(db, async transaction => {
      const tracker = await transaction.get(trackerRef);
      const pedidos = (tracker.data()?.pedidos || []).map(item => item.protocolo === activeOrder.protocolo
        ? { ...item, status, valor: amount, previsaoEntrega: delivery }
        : item);
      transaction.set(trackerRef, { pedidos, atualizadoEm: serverTimestamp() }, { merge: true });
    });
    $("#detailModal").close(); toast("Status atualizado com sucesso.");
  } catch (error) { console.error(error); toast("Não foi possível salvar as alterações.", true); button.disabled = false; button.textContent = "Salvar alterações"; }
});
function showImage(src) { $("#largeImage").src = src; $("#imageModal").showModal(); }
$("#closeImage").addEventListener("click", () => $("#imageModal").close());
$("#imageModal").addEventListener("click", event => { if (event.target === $("#imageModal")) $("#imageModal").close(); });
function toast(text, error = false) { const el = $("#toast"); el.textContent = text; el.className = `toast visible ${error ? "error" : ""}`; setTimeout(() => el.classList.remove("visible"), 3200); }
