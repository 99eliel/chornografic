const STORAGE_KEY = 'storyAdsLab.campaigns.v1';
let campaigns = loadCampaigns();
let editingId = null;
let pendingImage = '';

const $ = (id) => document.getElementById(id);
const fmtNumber = (n) => new Intl.NumberFormat('pt-BR').format(Number(n) || 0);
const fmtMoney = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);
const fmtPct = (n) => `${(Number(n) || 0).toFixed(2).replace('.', ',')}%`;
const safe = (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function loadCampaigns() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(campaigns));
  } catch (err) {
    alert('O navegador ficou sem espaço para salvar. Tente usar uma imagem menor ou excluir campanhas antigas.');
    throw err;
  }
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
  return ['views','reach','likes','replies','shares','clicks','profileVisits','followers','spend']
    .reduce((obj, id) => ({ ...obj, [id]: +$(id).value || 0 }), {});
}

function updateCalculator() {
  const m = calculate();
  $('calcInteractions').textContent = fmtNumber(m.interactions);
  $('calcEngagement').textContent = fmtPct(m.engagement);
  $('calcCtr').textContent = fmtPct(m.ctr);
  $('calcCpc').textContent = fmtMoney(m.cpc);
}

document.querySelectorAll('.metric-input').forEach(el => el.addEventListener('input', updateCalculator));

function render() {
  const list = $('campaignList');
  list.innerHTML = '';
  $('emptyState').classList.toggle('hidden', campaigns.length > 0);
  $('campaignCountLabel').textContent = `${campaigns.length} ${campaigns.length === 1 ? 'campanha' : 'campanhas'}`;

  const totals = campaigns.reduce((acc, c) => {
    const m = calculate(c);
    acc.reach += +c.reach || 0;
    acc.interactions += m.interactions;
    acc.engagementWeighted += m.interactions;
    return acc;
  }, { reach: 0, interactions: 0, engagementWeighted: 0 });

  $('totalCampaigns').textContent = fmtNumber(campaigns.length);
  $('totalReach').textContent = fmtNumber(totals.reach);
  $('totalInteractions').textContent = fmtNumber(totals.interactions);
  $('avgEngagement').textContent = fmtPct(totals.reach ? (totals.engagementWeighted / totals.reach) * 100 : 0);

  [...campaigns].sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0)).forEach(c => {
    const m = calculate(c);
    const card = document.createElement('article');
    card.className = 'campaign-card';
    card.innerHTML = `
      <div class="thumb" ${c.image ? `style="background-image:url('${c.image}')"` : ''}>${c.image ? '' : '🖼️'}</div>
      <div class="campaign-info">
        <h4>${safe(c.name)}</h4>
        <p>${formatDate(c.startDate)} — ${formatDate(c.endDate)}</p>
        <div class="mini-metrics">
          <span>👁 <b>${fmtNumber(c.views)}</b> visualizações</span>
          <span>◎ <b>${fmtNumber(c.reach)}</b> alcance</span>
          <span>↗ <b>${fmtPct(m.engagement)}</b> engajamento</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-ghost btn-small" data-action="view" data-id="${c.id}">Relatório</button>
        <button class="btn btn-ghost btn-small" data-action="edit" data-id="${c.id}">Editar</button>
        <button class="btn btn-danger btn-small" data-action="delete" data-id="${c.id}">Excluir</button>
      </div>`;
    list.appendChild(card);
  });
}

function formatDate(value) {
  if (!value) return '—';
  const [y,m,d] = value.split('-');
  return `${d}/${m}/${y}`;
}

function todayISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,10);
}

function openEditor(campaign = null) {
  editingId = campaign?.id || null;
  pendingImage = campaign?.image || '';
  $('editorTitle').textContent = campaign ? 'Editar campanha' : 'Nova campanha';
  $('campaignName').value = campaign?.name || '';
  $('startDate').value = campaign?.startDate || todayISO();
  $('endDate').value = campaign?.endDate || todayISO();
  ['views','reach','likes','replies','shares','clicks','profileVisits','followers','spend'].forEach(id => {
    $(id).value = campaign?.[id] ?? 0;
  });
  setPreview(pendingImage);
  updateCalculator();
  showModal('editorModal');
}

function setPreview(src) {
  const img = $('previewImage');
  const ph = $('previewPlaceholder');
  if (src) {
    img.src = src;
    img.classList.remove('hidden');
    ph.classList.add('hidden');
  } else {
    img.removeAttribute('src');
    img.classList.add('hidden');
    ph.classList.remove('hidden');
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
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', .78));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

$('imageInput').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return alert('Selecione um arquivo de imagem.');
  try {
    pendingImage = await compressImage(file);
    setPreview(pendingImage);
  } catch {
    alert('Não foi possível processar essa imagem. Tente outro arquivo.');
  }
});

$('campaignForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const base = {
    id: editingId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    name: $('campaignName').value.trim(),
    startDate: $('startDate').value,
    endDate: $('endDate').value,
    image: pendingImage,
    ...readMetricsFromForm(),
    createdAt: editingId ? campaigns.find(c => c.id === editingId)?.createdAt || Date.now() : Date.now(),
    updatedAt: Date.now()
  };
  if (!base.name) return;
  if (base.endDate < base.startDate) return alert('A data final não pode ser anterior à data inicial.');
  if (editingId) campaigns = campaigns.map(c => c.id === editingId ? base : c);
  else campaigns.push(base);
  persist();
  hideModal('editorModal');
  $('campaignForm').reset();
  $('imageInput').value = '';
  pendingImage = '';
  editingId = null;
  render();
});

function showModal(id) {
  const modal = $(id);
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function hideModal(id) {
  const modal = $(id);
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => hideModal(btn.dataset.close)));
document.querySelectorAll('.modal').forEach(modal => modal.addEventListener('click', e => { if (e.target === modal) hideModal(modal.id); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal:not(.hidden)').forEach(m => hideModal(m.id)); });

$('newCampaignBtn').addEventListener('click', () => openEditor());
$('emptyNewBtn').addEventListener('click', () => openEditor());

$('campaignList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const c = campaigns.find(x => x.id === btn.dataset.id);
  if (!c) return;
  if (btn.dataset.action === 'view') openDetail(c);
  if (btn.dataset.action === 'edit') openEditor(c);
  if (btn.dataset.action === 'delete') {
    if (confirm(`Excluir a campanha “${c.name}”?`)) {
      campaigns = campaigns.filter(x => x.id !== c.id);
      persist();
      render();
    }
  }
});

function openDetail(c) {
  const m = calculate(c);
  const funnelMax = Math.max(+c.views || 0, +c.reach || 0, m.interactions || 0, +c.clicks || 0, 1);
  const bar = (label, value) => `
    <div class="bar-row"><span>${label}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,(value/funnelMax)*100)}%"></div></div><div class="bar-value">${fmtNumber(value)}</div></div>`;
  $('detailContent').innerHTML = `
    <div class="detail-grid">
      <div class="detail-story" ${c.image ? `style="background-image:url('${c.image}')"` : ''}></div>
      <div>
        <div class="detail-title"><h3>${safe(c.name)}</h3><p>Período: ${formatDate(c.startDate)} a ${formatDate(c.endDate)}</p></div>
        <div class="detail-kpis">
          <div class="detail-kpi"><span>VISUALIZAÇÕES</span><b>${fmtNumber(c.views)}</b></div>
          <div class="detail-kpi"><span>ALCANCE</span><b>${fmtNumber(c.reach)}</b></div>
          <div class="detail-kpi"><span>INTERAÇÕES</span><b>${fmtNumber(m.interactions)}</b></div>
          <div class="detail-kpi"><span>ENGAJAMENTO</span><b>${fmtPct(m.engagement)}</b></div>
          <div class="detail-kpi"><span>CTR</span><b>${fmtPct(m.ctr)}</b></div>
          <div class="detail-kpi"><span>INVESTIMENTO</span><b>${fmtMoney(c.spend)}</b></div>
          <div class="detail-kpi"><span>CPC</span><b>${fmtMoney(m.cpc)}</b></div>
          <div class="detail-kpi"><span>CPM</span><b>${fmtMoney(m.cpm)}</b></div>
          <div class="detail-kpi"><span>FREQUÊNCIA</span><b>${m.frequency.toFixed(2).replace('.', ',')}x</b></div>
          <div class="detail-kpi"><span>VISITAS AO PERFIL</span><b>${fmtNumber(c.profileVisits)}</b></div>
          <div class="detail-kpi"><span>NOVOS SEGUIDORES</span><b>${fmtNumber(c.followers)}</b></div>
          <div class="detail-kpi"><span>CONVERSÃO EM SEGUIDORES</span><b>${fmtPct(m.followRate)}</b></div>
        </div>
        <div class="funnel"><h4>Funil de desempenho</h4>${bar('Visualizações', +c.views || 0)}${bar('Alcance', +c.reach || 0)}${bar('Interações', m.interactions)}${bar('Cliques', +c.clicks || 0)}</div>
        <div class="detail-actions"><button class="btn btn-primary" onclick="window.print()">Imprimir / Salvar PDF</button><button class="btn btn-ghost" id="detailEditBtn">Editar campanha</button></div>
      </div>
    </div>`;
  showModal('detailModal');
  $('detailEditBtn').addEventListener('click', () => { hideModal('detailModal'); openEditor(c); });
}

$('demoBtn').addEventListener('click', () => {
  if (campaigns.length && !confirm('Adicionar uma campanha de exemplo sem apagar as suas campanhas?')) return;
  const demo = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-demo`,
    name: 'Story — Semana Acadêmica',
    startDate: todayISO(), endDate: todayISO(), image: '',
    views: 6320, reach: 5000, likes: 230, replies: 20, shares: 40, clicks: 150,
    profileVisits: 82, followers: 23, spend: 100,
    createdAt: Date.now(), updatedAt: Date.now()
  };
  campaigns.push(demo); persist(); render(); openDetail(demo);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

render();
updateCalculator();