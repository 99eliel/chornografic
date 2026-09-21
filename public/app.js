import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, query, where,
  setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

const LEGACY_STORAGE_KEY = "storyAdsLab.campaigns.v1";
const MIGRATION_KEY = "storyAdsLab.firebaseMigration.v1";
const PROJECTION_RATE = 0.05;
const PROJECTION_INTERVAL_HOURS = 4;
const PROJECTION_INTERVAL_MS = PROJECTION_INTERVAL_HOURS * 60 * 60 * 1000;
const PROJECTED_METRICS = ["views","reach","likes","replies","shares","clicks","profileVisits","followers"];
const $ = (id) => document.getElementById(id);
const fmtNumber = (n) => new Intl.NumberFormat("pt-BR").format(Number(n) || 0);
const fmtMoney = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);
const fmtPct = (n) => `${(Number(n) || 0).toFixed(2).replace(".", ",")}%`;
const safe = (value) => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

let currentUser = null;
let campaigns = [];
let editingId = null;
let pendingImageBlob = null;
let pendingImagePreview = "";
let originalCampaign = null;
const sharedIdFromUrl = new URLSearchParams(location.search).get("campanha");

function projectionBlocks(c, now = Date.now()) {
  if (c?.projectionEnabled === false) return 0;
  const startedAt = Number(c?.projectionStartedAt || c?.createdAt || now);
  if (!Number.isFinite(startedAt) || startedAt <= 0 || now <= startedAt) return 0;
  return Math.max(0, Math.floor((now - startedAt) / PROJECTION_INTERVAL_MS));
}

function projectCampaign(c, now = Date.now()) {
  const blocks = projectionBlocks(c, now);
  const configuredRate = Number(c?.projectionRate);
  const rate = Number.isFinite(configuredRate) ? configuredRate / 100 : PROJECTION_RATE;
  const factor = Math.pow(1 + rate, blocks);
  const projected = { ...c, projectionBlocks: blocks, projectionFactor: factor };

  PROJECTED_METRICS.forEach(key => {
    const base = Number(c?.[key]) || 0;
    projected[key] = Math.round(base * factor);
  });

  return projected;
}

function calculate(c = readMetricsFromForm()) {
  const views = +c.views || 0;
  const reach = +c.reach || 0;
  const likes = +c.likes || 0;
  const replies = +c.replies || 0;
  const shares = +c.shares || 0;
  const clicks = +c.clicks || 0;
  const profileVisits = +c.profileVisits || 0;
  const followers = +c.followers || 0;
  const spend = +c.spend || 0;
  const interactions = likes + replies + shares + clicks;
  return {
    interactions,
    engagement: reach ? (interactions / reach) * 100 : 0,
    ctr: views ? (clicks / views) * 100 : 0,
    cpc: clicks ? spend / clicks : 0,
    cpm: views ? (spend / views) * 1000 : 0,
    frequency: reach ? views / reach : 0,
    profileRate: reach ? (profileVisits / reach) * 100 : 0,
    followRate: reach ? (followers / reach) * 100 : 0
  };
}

function readMetricsFromForm() {
  return ["views","reach","likes","replies","shares","clicks","profileVisits","followers","spend"]
    .reduce((obj, id) => ({ ...obj, [id]: +$(id).value || 0 }), {});
}

function updateCalculator() {
  const m = calculate();
  $("calcInteractions").textContent = fmtNumber(m.interactions);
  $("calcEngagement").textContent = fmtPct(m.engagement);
  $("calcCtr").textContent = fmtPct(m.ctr);
  $("calcCpc").textContent = fmtMoney(m.cpc);
}

function formatDate(value) {
  if (!value) return "—";
  const [y,m,d] = value.split("-");
  return `${d}/${m}/${y}`;
}

function todayISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function setInteractive(enabled) {
  ["newCampaignBtn","emptyNewBtn","demoBtn"].forEach(id => {
    if ($(id)) $(id).disabled = !enabled;
  });
}

function render() {
  const list = $("campaignList");
  list.innerHTML = "";
  $("emptyState").classList.toggle("hidden", campaigns.length > 0);
  $("campaignCountLabel").textContent = `${campaigns.length} ${campaigns.length === 1 ? "campanha" : "campanhas"} • online`;

  const totals = campaigns.reduce((acc, c) => {
    const projected = projectCampaign(c);
    const m = calculate(projected);
    acc.reach += +projected.reach || 0;
    acc.interactions += m.interactions;
    return acc;
  }, { reach: 0, interactions: 0 });

  $("totalCampaigns").textContent = fmtNumber(campaigns.length);
  $("totalReach").textContent = fmtNumber(totals.reach);
  $("totalInteractions").textContent = fmtNumber(totals.interactions);
  $("avgEngagement").textContent = fmtPct(totals.reach ? (totals.interactions / totals.reach) * 100 : 0);

  [...campaigns].sort((a,b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)).forEach(c => {
    const projected = projectCampaign(c);
    const m = calculate(projected);
    const image = c.imageUrl || "";
    const card = document.createElement("article");
    card.className = "campaign-card";
    card.innerHTML = `
      <div class="thumb" ${image ? `style="background-image:url('${image}')"` : ""}>${image ? "" : "🖼️"}</div>
      <div class="campaign-info">
        <h4>${safe(c.name)}</h4>
        <p>${formatDate(c.startDate)} — ${formatDate(c.endDate)}</p>
        <div class="mini-metrics">
          <span>👁 <b>${fmtNumber(projected.views)}</b> visualizações</span>
          <span>◎ <b>${fmtNumber(projected.reach)}</b> alcance</span>
          <span>↗ <b>${fmtPct(m.engagement)}</b> engajamento</span>
          <span>⏱ <b>+5%</b> a cada 4h</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-ghost btn-small" data-action="view" data-id="${c.id}">Relatório</button>
        <button class="btn btn-ghost btn-small" data-action="share" data-id="${c.id}">Compartilhar</button>
        <button class="btn btn-ghost btn-small" data-action="edit" data-id="${c.id}">Editar</button>
        <button class="btn btn-danger btn-small" data-action="delete" data-id="${c.id}">Excluir</button>
      </div>`;
    list.appendChild(card);
  });
}

async function loadCampaigns() {
  const q = query(collection(db, "campaigns"), where("ownerUid", "==", currentUser.uid));
  const snap = await getDocs(q);
  campaigns = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  render();
}

function openEditor(campaign = null) {
  editingId = campaign?.id || null;
  originalCampaign = campaign || null;
  pendingImageBlob = null;
  pendingImagePreview = campaign?.imageUrl || "";
  $("editorTitle").textContent = campaign ? "Editar campanha" : "Nova campanha";
  $("campaignName").value = campaign?.name || "";
  $("startDate").value = campaign?.startDate || todayISO();
  $("endDate").value = campaign?.endDate || todayISO();
  ["views","reach","likes","replies","shares","clicks","profileVisits","followers","spend"].forEach(id => {
    $(id).value = campaign?.[id] ?? 0;
  });
  setPreview(pendingImagePreview);
  updateCalculator();
  showModal("editorModal");
}

function setPreview(src) {
  const img = $("previewImage");
  const ph = $("previewPlaceholder");
  if (src) {
    img.src = src;
    img.classList.remove("hidden");
    ph.classList.add("hidden");
  } else {
    img.removeAttribute("src");
    img.classList.add("hidden");
    ph.classList.remove("hidden");
  }
}

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const maxW = 900, maxH = 1600;
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error("Falha ao processar imagem"));
          resolve({ blob, preview: canvas.toDataURL("image/jpeg", .82) });
        }, "image/jpeg", .82);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadCampaignImage(campaignId, blob) {
  const path = `campaign-images/${currentUser.uid}/${campaignId}.jpg`;
  const imageRef = ref(storage, path);
  await uploadBytes(imageRef, blob, { contentType: "image/jpeg" });
  return { imageUrl: await getDownloadURL(imageRef), imagePath: path };
}

function publicSnapshot(campaign) {
  return {
    ownerUid: campaign.ownerUid,
    sourceCampaignId: campaign.id,
    name: campaign.name,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    views: +campaign.views || 0,
    reach: +campaign.reach || 0,
    likes: +campaign.likes || 0,
    replies: +campaign.replies || 0,
    shares: +campaign.shares || 0,
    clicks: +campaign.clicks || 0,
    profileVisits: +campaign.profileVisits || 0,
    followers: +campaign.followers || 0,
    spend: +campaign.spend || 0,
    imageUrl: campaign.imageUrl || "",
    projectionEnabled: campaign.projectionEnabled !== false,
    projectionRate: Number(campaign.projectionRate) || 5,
    projectionIntervalHours: Number(campaign.projectionIntervalHours) || 4,
    projectionStartedAt: Number(campaign.projectionStartedAt) || Number(campaign.createdAt) || Date.now(),
    updatedAt: Date.now()
  };
}

async function saveCampaign(e) {
  e.preventDefault();
  if (!currentUser) return alert("O Firebase ainda está conectando.");

  const submitBtn = $("campaignForm").querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Salvando...";

  try {
    const id = editingId || crypto.randomUUID();
    let imageUrl = originalCampaign?.imageUrl || "";
    let imagePath = originalCampaign?.imagePath || "";

    if (pendingImageBlob) {
      const uploaded = await uploadCampaignImage(id, pendingImageBlob);
      imageUrl = uploaded.imageUrl;
      imagePath = uploaded.imagePath;
    }

    const now = Date.now();
    const campaign = {
      id,
      ownerUid: currentUser.uid,
      name: $("campaignName").value.trim(),
      startDate: $("startDate").value,
      endDate: $("endDate").value,
      imageUrl,
      imagePath,
      shareId: originalCampaign?.shareId || "",
      ...readMetricsFromForm(),
      projectionEnabled: true,
      projectionRate: 5,
      projectionIntervalHours: 4,
      projectionStartedAt: originalCampaign?.projectionStartedAt || now,
      createdAt: originalCampaign?.createdAt || now,
      updatedAt: now
    };

    if (!campaign.name) return;
    if (campaign.endDate < campaign.startDate) {
      alert("A data final não pode ser anterior à data inicial.");
      return;
    }

    await setDoc(doc(db, "campaigns", id), campaign);

    if (campaign.shareId) {
      await setDoc(doc(db, "sharedCampaigns", campaign.shareId), publicSnapshot(campaign));
    }

    hideModal("editorModal");
    $("campaignForm").reset();
    $("imageInput").value = "";
    pendingImageBlob = null;
    pendingImagePreview = "";
    editingId = null;
    originalCampaign = null;
    await loadCampaigns();
  } catch (err) {
    console.error(err);
    alert("Não foi possível salvar no Firebase. Confira Firestore, Storage e as regras do projeto.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Salvar campanha";
  }
}

function showModal(id) {
  const modal = $(id);
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  if (!document.body.classList.contains("shared-mode")) document.body.style.overflow = "hidden";
}

function hideModal(id) {
  const modal = $(id);
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function printReport() {
  const appShell = document.querySelector(".app-shell");
  const previousDisplay = appShell.style.display;
  appShell.style.display = "none";
  const restore = () => {
    appShell.style.display = previousDisplay;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  requestAnimationFrame(() => {
    window.print();
    setTimeout(restore, 100);
  });
}

function openDetail(c, readOnly = false) {
  const projected = projectCampaign(c);
  const m = calculate(projected);
  const funnelMax = Math.max(+projected.views || 0, +projected.reach || 0, m.interactions || 0, +projected.clicks || 0, 1);
  const bar = (label, value) => `
    <div class="bar-row"><span>${label}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,(value/funnelMax)*100)}%"></div></div><div class="bar-value">${fmtNumber(value)}</div></div>`;
  const storyMedia = c.imageUrl
    ? `<img src="${c.imageUrl}" alt="Criativo da campanha ${safe(c.name)}" style="width:100%;height:100%;object-fit:cover;display:block;border-radius:18px;">`
    : `<div style="width:100%;height:100%;display:grid;place-items:center;color:#9ca3af;background:#f3f4f6;border-radius:18px;">Sem imagem</div>`;

  const actions = readOnly ? "" : `
    <div class="detail-actions">
      <button class="btn btn-primary" id="printReportBtn">Imprimir / Salvar PDF</button>
      <button class="btn btn-ghost" id="shareReportBtn">Compartilhar campanha</button>
      <button class="btn btn-ghost" id="detailEditBtn">Editar campanha</button>
    </div>`;

  $("detailContent").innerHTML = `
    <div class="detail-grid">
      <div class="detail-story" style="overflow:hidden;background:#f3f4f6;">${storyMedia}</div>
      <div>
        <div class="detail-title">
          <h3>${safe(c.name)}</h3>
          <p>Período: ${formatDate(c.startDate)} a ${formatDate(c.endDate)}</p>
          <div class="projection-note">Projeção automática • +5% a cada 4 horas • ${projected.projectionBlocks} ciclo(s) decorridos</div>
        </div>
        <div class="detail-kpis">
          <div class="detail-kpi"><span>VISUALIZAÇÕES PROJETADAS</span><b>${fmtNumber(projected.views)}</b></div>
          <div class="detail-kpi"><span>ALCANCE PROJETADO</span><b>${fmtNumber(projected.reach)}</b></div>
          <div class="detail-kpi"><span>INTERAÇÕES</span><b>${fmtNumber(m.interactions)}</b></div>
          <div class="detail-kpi"><span>ENGAJAMENTO</span><b>${fmtPct(m.engagement)}</b></div>
          <div class="detail-kpi"><span>CTR</span><b>${fmtPct(m.ctr)}</b></div>
          <div class="detail-kpi"><span>INVESTIMENTO</span><b>${fmtMoney(c.spend)}</b></div>
          <div class="detail-kpi"><span>CPC</span><b>${fmtMoney(m.cpc)}</b></div>
          <div class="detail-kpi"><span>CPM</span><b>${fmtMoney(m.cpm)}</b></div>
          <div class="detail-kpi"><span>FREQUÊNCIA</span><b>${m.frequency.toFixed(2).replace(".", ",")}x</b></div>
          <div class="detail-kpi"><span>VISITAS AO PERFIL</span><b>${fmtNumber(projected.profileVisits)}</b></div>
          <div class="detail-kpi"><span>NOVOS SEGUIDORES</span><b>${fmtNumber(projected.followers)}</b></div>
          <div class="detail-kpi"><span>CONVERSÃO EM SEGUIDORES</span><b>${fmtPct(m.followRate)}</b></div>
        </div>
        <div class="funnel"><h4>Funil de desempenho projetado</h4>${bar("Visualizações", +projected.views || 0)}${bar("Alcance", +projected.reach || 0)}${bar("Interações", m.interactions)}${bar("Cliques", +projected.clicks || 0)}</div>
        ${actions}
      </div>
    </div>`;

  showModal("detailModal");

  if (!readOnly) {
    $("printReportBtn").addEventListener("click", printReport);
    $("shareReportBtn").addEventListener("click", () => shareCampaign(c));
    $("detailEditBtn").addEventListener("click", () => {
      hideModal("detailModal");
      openEditor(c);
    });
  }
}

async function shareCampaign(c) {
  try {
    let shareId = c.shareId;
    if (!shareId) {
      shareId = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
      c.shareId = shareId;
      c.updatedAt = Date.now();
      await setDoc(doc(db, "campaigns", c.id), c);
    }

    await setDoc(doc(db, "sharedCampaigns", shareId), publicSnapshot(c));
    const url = `${location.origin}${location.pathname}?campanha=${encodeURIComponent(shareId)}`;

    if (navigator.share) {
      await navigator.share({ title: c.name, text: "Confira os resultados desta campanha:", url });
    } else {
      await navigator.clipboard.writeText(url);
      alert("Link da campanha copiado.");
    }

    await loadCampaigns();
  } catch (err) {
    if (err?.name === "AbortError") return;
    console.error(err);
    alert("Não foi possível gerar o link compartilhável.");
  }
}

async function deleteCampaign(c) {
  if (!confirm(`Excluir a campanha “${c.name}”?`)) return;
  try {
    await deleteDoc(doc(db, "campaigns", c.id));
    if (c.shareId) await deleteDoc(doc(db, "sharedCampaigns", c.shareId));
    if (c.imagePath) {
      try { await deleteObject(ref(storage, c.imagePath)); } catch {}
    }
    await loadCampaigns();
  } catch (err) {
    console.error(err);
    alert("Não foi possível excluir a campanha.");
  }
}

async function migrateLegacyData() {
  if (localStorage.getItem(MIGRATION_KEY) === "done") return;
  let old = [];
  try { old = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY)) || []; } catch {}
  if (!old.length) {
    localStorage.setItem(MIGRATION_KEY, "done");
    return;
  }

  for (const item of old) {
    const id = String(item.id || crypto.randomUUID()).replaceAll("/", "-");
    let imageUrl = "";
    let imagePath = "";
    if (item.image?.startsWith("data:image/")) {
      const blob = await (await fetch(item.image)).blob();
      const uploaded = await uploadCampaignImage(id, blob);
      imageUrl = uploaded.imageUrl;
      imagePath = uploaded.imagePath;
    }
    const now = Date.now();
    const migrated = {
      id,
      ownerUid: currentUser.uid,
      name: item.name || "Campanha",
      startDate: item.startDate || todayISO(),
      endDate: item.endDate || item.startDate || todayISO(),
      views: +item.views || 0,
      reach: +item.reach || 0,
      likes: +item.likes || 0,
      replies: +item.replies || 0,
      shares: +item.shares || 0,
      clicks: +item.clicks || 0,
      profileVisits: +item.profileVisits || 0,
      followers: +item.followers || 0,
      spend: +item.spend || 0,
      imageUrl,
      imagePath,
      shareId: "",
      projectionEnabled: true,
      projectionRate: 5,
      projectionIntervalHours: 4,
      projectionStartedAt: now,
      createdAt: item.createdAt || now,
      updatedAt: item.updatedAt || now
    };
    await setDoc(doc(db, "campaigns", id), migrated, { merge: true });
  }

  localStorage.setItem(MIGRATION_KEY, "done");
}

async function loadSharedCampaign(shareId) {
  document.body.classList.add("shared-mode");
  setInteractive(false);
  try {
    const snap = await getDoc(doc(db, "sharedCampaigns", shareId));
    if (!snap.exists()) {
      $("detailContent").innerHTML = '<div style="padding:48px;text-align:center"><h2>Campanha não encontrada</h2><p class="muted">Este link pode ter expirado ou a campanha foi removida.</p></div>';
      showModal("detailModal");
      return;
    }
    const campaign = { shareId, ...snap.data() };
    document.title = `${campaign.name} • Story Ads Lab`;
    openDetail(campaign, true);
  } catch (err) {
    console.error(err);
    $("detailContent").innerHTML = '<div style="padding:48px;text-align:center"><h2>Não foi possível abrir a campanha</h2><p class="muted">Verifique as regras do Firestore e tente novamente.</p></div>';
    showModal("detailModal");
  }
}

async function startPrivateApp() {
  setInteractive(false);
  $("campaignCountLabel").textContent = "Conectando ao Firebase...";
  try {
    const credential = await signInAnonymously(auth);
    currentUser = credential.user;
    await migrateLegacyData();
    await loadCampaigns();
    setInteractive(true);
  } catch (err) {
    console.error(err);
    $("campaignCountLabel").textContent = "Firebase não conectado";
    alert("Ative a Autenticação Anônima no Firebase e publique as regras do Firestore/Storage.");
  }
}

document.querySelectorAll(".metric-input").forEach(el => el.addEventListener("input", updateCalculator));

$("imageInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return alert("Selecione um arquivo de imagem.");
  try {
    const processed = await compressImage(file);
    pendingImageBlob = processed.blob;
    pendingImagePreview = processed.preview;
    setPreview(pendingImagePreview);
  } catch {
    alert("Não foi possível processar essa imagem.");
  }
});

$("campaignForm").addEventListener("submit", saveCampaign);
$("newCampaignBtn").addEventListener("click", () => openEditor());
$("emptyNewBtn").addEventListener("click", () => openEditor());

$("demoBtn").addEventListener("click", () => {
  openEditor();
  $("campaignName").value = "Story — Campanha Setembro";
  $("views").value = 6320;
  $("reach").value = 5000;
  $("likes").value = 230;
  $("replies").value = 20;
  $("shares").value = 40;
  $("clicks").value = 150;
  $("profileVisits").value = 82;
  $("followers").value = 23;
  $("spend").value = 100;
  updateCalculator();
});

$("campaignList").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const c = campaigns.find(x => x.id === btn.dataset.id);
  if (!c) return;
  if (btn.dataset.action === "view") openDetail(c);
  if (btn.dataset.action === "share") await shareCampaign(c);
  if (btn.dataset.action === "edit") openEditor(c);
  if (btn.dataset.action === "delete") await deleteCampaign(c);
});

document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => hideModal(btn.dataset.close)));
document.querySelectorAll(".modal").forEach(modal => modal.addEventListener("click", e => {
  if (e.target === modal && !document.body.classList.contains("shared-mode")) hideModal(modal.id);
}));
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !document.body.classList.contains("shared-mode")) {
    document.querySelectorAll(".modal:not(.hidden)").forEach(m => hideModal(m.id));
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

updateCalculator();

if (sharedIdFromUrl) loadSharedCampaign(sharedIdFromUrl);
else startPrivateApp();
