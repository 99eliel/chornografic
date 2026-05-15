import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";
import { getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// ==========================================
// CONFIGURAÇÃO FIREBASE 
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyAqUJYK3L0e77NYh_hE176CY3SV-jg3-Yc",
    authDomain: "chornografic.firebaseapp.com",
    projectId: "chornografic",
    storageBucket: "chornografic.firebasestorage.app",
    messagingSenderId: "685211286639",
    appId: "1:685211286639:web:9444cca8dfe2e46222e19a",
    measurementId: "G-RXNCY69R7Y"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const storage = getStorage(app);

window.arvoresData = {};
window.arvoreEditandoId = null;

// ==========================================
// INICIALIZAÇÃO DO MAPA E ÍCONES CUSTOMIZADOS
// ==========================================
const map = L.map('map').setView([-17.5255, -49.5218], 14); // Pontalina GO
window.mapInstance = map;

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);

let markers = [];

// Criando classes CSS como ícones pro Leaflet
const iconArvore = L.divIcon({ className: 'marker-arvore', iconSize: [20, 20] });
const iconVistoria = L.divIcon({ className: 'marker-vistoria', iconSize: [20, 20] });

// ==========================================
// FUNÇÕES DE GPS E UPLOAD
// ==========================================
document.getElementById('getLocationBtn').addEventListener('click', () => {
    const status = document.getElementById('location-status');
    status.textContent = "Buscando GPS...";
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                document.getElementById('latitude').value = pos.coords.latitude;
                document.getElementById('longitude').value = pos.coords.longitude;
                status.textContent = `GPS OK!`; status.classList.add('success-text');
            },
            () => { alert("Erro de GPS. Verifique permissões."); status.textContent = "Erro no GPS."; },
            { enableHighAccuracy: true }
        );
    }
});

function getBase64(file) {
    return new Promise((res, rej) => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = () => res(reader.result); reader.onerror = e => rej(e);
    });
}

// ==========================================
// SALVAR NOVO REGISTRO NO BANCO
// ==========================================
document.getElementById('treeForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const tipo = document.getElementById('regTipo').value;
    const name = document.getElementById('treeName').value;
    const rua = document.getElementById('regRua').value;
    const photoInput = document.getElementById('treePhoto').files[0];
    const lat = document.getElementById('latitude').value;
    const lng = document.getElementById('longitude').value;

    if (!lat || !lng) { alert("Capture o GPS primeiro."); return; }

    document.getElementById('submitBtn').style.display = 'none';
    document.getElementById('loader').style.display = 'block';

    try {
        const photoBase64 = await getBase64(photoInput);
        const fileName = `registros/${Date.now()}_${photoInput.name}`;
        const storageRef = ref(storage, fileName);
        
        await uploadString(storageRef, photoBase64, 'data_url');
        const photoURL = await getDownloadURL(storageRef);

        await addDoc(collection(db, "arvores"), {
            tipo: tipo,
            nome: name,
            rua: rua,
            fotoUrl: photoURL,
            fotoPath: fileName,
            latitude: parseFloat(lat),
            longitude: parseFloat(lng),
            dataRegistro: new Date().toLocaleDateString('pt-BR'),
            status: 'ativa',
            observacao: '',
            podas: [] 
        });

        alert("Registro salvo com sucesso!");
        document.getElementById('treeForm').reset();
        document.getElementById('location-status').textContent = "GPS não capturado";
        document.getElementById('location-status').classList.remove('success-text');

    } catch (error) { console.error(error); alert("Erro ao salvar."); } 
    finally {
        document.getElementById('submitBtn').style.display = 'block';
        document.getElementById('loader').style.display = 'none';
    }
});

// ==========================================
// RENDERIZAÇÃO DA LISTA COM FILTROS
// ==========================================
function atualizarInterfaceListaEMapa() {
    const listDiv = document.getElementById('treeList');
    listDiv.innerHTML = '';
    
    // Limpa mapa
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    const filtroTipo = document.getElementById('filtroTipo').value;
    const filtroRua = document.getElementById('filtroRua').value.toLowerCase();

    let contArvore = 0;
    let contVistoria = 0;

    const registros = Object.entries(window.arvoresData);

    if (registros.length === 0) {
        listDiv.innerHTML = '<p style="text-align:center;">Nenhum registro no banco de dados.</p>';
        document.getElementById('resumoFiltro').textContent = "0 registros encontrados.";
        return;
    }

    registros.forEach(([id, reg]) => {
        // Aplica os filtros
        if (filtroTipo !== 'todos' && reg.tipo !== filtroTipo) return;
        if (filtroRua && reg.rua && !reg.rua.toLowerCase().includes(filtroRua)) return;

        // Contadores
        if(reg.tipo === 'arvore') contArvore++;
        else contVistoria++;

        // --- Adicionar ao Mapa ---
        const isRemovida = reg.status === 'removida';
        const opacity = isRemovida ? 0.5 : 1.0; 
        const iconUsado = reg.tipo === 'arvore' ? iconArvore : iconVistoria;
        
        const marker = L.marker([reg.latitude, reg.longitude], { icon: iconUsado, opacity: opacity }).addTo(map);
        
        marker.bindPopup(`
            <div style="text-align:center;">
                <b>${reg.nome}</b><br>
                <span style="font-size:12px;">${reg.rua || 'Sem rua'}</span><br>
                <img src="${reg.fotoUrl}" width="100" style="margin: 5px 0; border-radius:4px;"><br>
                <button class="btn btn-small" onclick="abrirModal('${id}')" style="margin-top:5px; padding: 5px 10px;">⚙️ Gerenciar</button>
            </div>
        `);
        markers.push(marker);

        // --- Adicionar à Lista ---
        const card = document.createElement('div');
        card.className = `tree-card tipo-${reg.tipo}`;
        
        const imgStyle = isRemovida ? 'filter: grayscale(100%); opacity: 0.7;' : '';
        const badgeStatus = isRemovida ? `<span class="badge bg-removida">Inativa</span>` : ``;
        const tipoLabel = reg.tipo === 'arvore' ? '🌳 Árvore' : '📋 Vistoria';

        card.innerHTML = `
            <img src="${reg.fotoUrl}" style="${imgStyle}">
            <div class="tree-info">
                <h3>${reg.nome}</h3>
                <p><strong>Rua:</strong> ${reg.rua || 'Não informada'}</p>
                <p>${tipoLabel} | Reg: ${reg.dataRegistro}</p>
                ${badgeStatus}
            </div>
            <div class="actions-col">
                <button class="btn btn-small" onclick="abrirModal('${id}')" style="background-color: #0277bd;">Gerenciar</button>
                <button class="btn btn-danger btn-small" onclick="excluirArvore('${id}', '${reg.fotoPath}')">Excluir</button>
            </div>
        `;
        listDiv.appendChild(card);
    });

    // Atualiza o painel de resumo
    document.getElementById('resumoFiltro').textContent = 
        `Encontrados: ${contArvore} Árvore(s) | ${contVistoria} Vistoria(s)`;
}

// Eventos de digitação e mudança para rodar os filtros na hora
document.getElementById('filtroTipo').addEventListener('change', atualizarInterfaceListaEMapa);
document.getElementById('filtroRua').addEventListener('input', atualizarInterfaceListaEMapa);

// ==========================================
// PUXAR DADOS DO FIREBASE (EM TEMPO REAL)
// ==========================================
onSnapshot(collection(db, "arvores"), (snapshot) => {
    window.arvoresData = {};
    snapshot.forEach(docSnap => {
        window.arvoresData[docSnap.id] = docSnap.data();
    });
    atualizarInterfaceListaEMapa();
});

// ==========================================
// FUNÇÕES DO MODAL (GERENCIAR DETALHES)
// ==========================================
window.abrirModal = (id) => {
    const reg = window.arvoresData[id];
    if(!reg) return;
    
    window.arvoreEditandoId = id;
    
    // Preenche os textos
    document.getElementById('modalNome').textContent = reg.nome;
    document.getElementById('modalRua').textContent = `Endereço: ${reg.rua || 'N/A'}`;
    document.getElementById('modalObs').value = reg.observacao || '';
    
    // Badge de Tipo
    const badgeTipo = document.getElementById('modalTipoBadge');
    if(reg.tipo === 'arvore') {
        badgeTipo.textContent = 'Árvore'; badgeTipo.className = 'badge bg-arvore';
    } else {
        badgeTipo.textContent = 'Vistoria'; badgeTipo.className = 'badge bg-vistoria';
    }

    // Badge e Botão de Status
    const badgeStatus = document.getElementById('modalStatusBadge');
    const btnRemover = document.getElementById('btnRemoverTree');
    
    if (reg.status === 'removida') {
        badgeStatus.textContent = 'Inativa / Removida'; badgeStatus.className = 'badge bg-removida';
        btnRemover.textContent = '✅ Restaurar para Ativa'; btnRemover.style.backgroundColor = '#4CAF50';
    } else {
        badgeStatus.textContent = 'Ativa'; badgeStatus.className = 'badge bg-ativa';
        btnRemover.textContent = '⚠️ Marcar Inativa/Removida'; btnRemover.style.backgroundColor = 'var(--danger)';
    }

    // Histórico de Serviços
    renderizarListaPodas(reg.podas || []);
    document.getElementById('manageModal').classList.add('active');
};

window.fecharModal = () => {
    document.getElementById('manageModal').classList.remove('active');
    window.arvoreEditandoId = null;
};

function renderizarListaPodas(podasArray) {
    const ul = document.getElementById('modalPodas');
    ul.innerHTML = '';
    if (podasArray.length === 0) { ul.innerHTML = '<li>Nenhum serviço registrado.</li>'; return; }
    podasArray.forEach(poda => {
        const li = document.createElement('li'); li.textContent = `Serviço em: ${poda}`; ul.appendChild(li);
    });
}

window.registrarPodaHoje = () => {
    const reg = window.arvoresData[window.arvoreEditandoId];
    if(!reg.podas) reg.podas = [];
    reg.podas.push(new Date().toLocaleDateString('pt-BR'));
    renderizarListaPodas(reg.podas);
};

window.alternarStatusRemovida = () => {
    const reg = window.arvoresData[window.arvoreEditandoId];
    reg.status = reg.status === 'removida' ? 'ativa' : 'removida';
    
    const badgeStatus = document.getElementById('modalStatusBadge');
    const btnRemover = document.getElementById('btnRemoverTree');
    
    if (reg.status === 'removida') {
        badgeStatus.textContent = 'Inativa / Removida'; badgeStatus.className = 'badge bg-removida';
        btnRemover.textContent = '✅ Restaurar para Ativa'; btnRemover.style.backgroundColor = '#4CAF50';
    } else {
        badgeStatus.textContent = 'Ativa'; badgeStatus.className = 'badge bg-ativa';
        btnRemover.textContent = '⚠️ Marcar Inativa/Removida'; btnRemover.style.backgroundColor = 'var(--danger)';
    }
};

window.salvarAlteracoesTree = async () => {
    const id = window.arvoreEditandoId;
    const regModificado = window.arvoresData[id];
    const novaObs = document.getElementById('modalObs').value;

    try {
        await updateDoc(doc(db, "arvores", id), {
            observacao: novaObs,
            status: regModificado.status,
            podas: regModificado.podas
        });
        alert('Alterações salvas!');
        window.fecharModal();
    } catch (error) { console.error(error); alert('Erro ao salvar edições.'); }
};

window.excluirArvore = async (id, path) => {
    if(confirm("Deseja apagar DEFINITIVAMENTE este registro?")) {
        try {
            await deleteDoc(doc(db, "arvores", id));
            if(path) await deleteObject(ref(storage, path));
        } catch(e) { console.error(e); alert("Erro ao excluir."); }
    }
};

// ==========================================
// SERVICE WORKER PWA
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.log(e)));
}
