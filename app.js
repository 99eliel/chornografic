import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";
import { getFirestore, collection, addDoc, deleteDoc, updateDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// ==========================================
// CONFIGURAÇÃO FIREBASE (Eliel)
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

// Memória local para acesso rápido das árvores ao abrir o Modal
window.arvoresData = {};
window.arvoreEditandoId = null;

// ==========================================
// INICIALIZAÇÃO DO MAPA
// ==========================================
const map = L.map('map').setView([-17.5255, -49.5218], 14);
window.mapInstance = map;

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

let markers = [];

// ==========================================
// FUNÇÕES DE GPS E UPLOAD
// ==========================================
document.getElementById('getLocationBtn').addEventListener('click', () => {
    const status = document.getElementById('location-status');
    status.textContent = "Buscando GPS...";
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                document.getElementById('latitude').value = position.coords.latitude;
                document.getElementById('longitude').value = position.coords.longitude;
                status.textContent = `Localização OK!`;
                status.classList.add('success-text');
            },
            () => {
                alert("Erro ao obter GPS. Verifique as permissões.");
                status.textContent = "Erro no GPS.";
            },
            { enableHighAccuracy: true }
        );
    }
});

function getBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// ==========================================
// SALVAR NOVA ÁRVORE NO BANCO
// ==========================================
document.getElementById('treeForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('treeName').value;
    const photoInput = document.getElementById('treePhoto').files[0];
    const lat = document.getElementById('latitude').value;
    const lng = document.getElementById('longitude').value;

    if (!lat || !lng) {
        alert("Por favor, capture o GPS primeiro.");
        return;
    }

    document.getElementById('submitBtn').style.display = 'none';
    document.getElementById('loader').style.display = 'block';

    try {
        const photoBase64 = await getBase64(photoInput);
        const fileName = `arvores/${Date.now()}_${photoInput.name}`;
        const storageRef = ref(storage, fileName);
        
        await uploadString(storageRef, photoBase64, 'data_url');
        const photoURL = await getDownloadURL(storageRef);

        // Adicionamos os novos campos: status, observacao e podas
        await addDoc(collection(db, "arvores"), {
            nome: name,
            fotoUrl: photoURL,
            fotoPath: fileName,
            latitude: parseFloat(lat),
            longitude: parseFloat(lng),
            dataRegistro: new Date().toLocaleDateString('pt-BR'),
            status: 'ativa',
            observacao: '',
            podas: [] 
        });

        alert("Árvore catalogada com sucesso!");
        document.getElementById('treeForm').reset();
        document.getElementById('location-status').textContent = "GPS não capturado";
        document.getElementById('location-status').classList.remove('success-text');

    } catch (error) {
        console.error(error);
        alert("Erro ao salvar.");
    } finally {
        document.getElementById('submitBtn').style.display = 'block';
        document.getElementById('loader').style.display = 'none';
    }
});

// ==========================================
// LÓGICA DE SINCRONIZAÇÃO (LISTA E MAPA)
// ==========================================
onSnapshot(collection(db, "arvores"), (snapshot) => {
    const listDiv = document.getElementById('treeList');
    listDiv.innerHTML = '';
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    window.arvoresData = {}; // Reseta a memória local

    if (snapshot.empty) {
        listDiv.innerHTML = '<p style="text-align:center;">Nenhum registro encontrado.</p>';
        return;
    }

    snapshot.forEach((docSnap) => {
        const tree = docSnap.data();
        const id = docSnap.id;
        
        // Salva na memória global para o Modal usar depois
        window.arvoresData[id] = tree;

        // --- Lógica do Mapa ---
        const isRemovida = tree.status === 'removida';
        // Se estiver removida, deixa o pino transparente para diferenciar visualmente
        const opacity = isRemovida ? 0.5 : 1.0; 
        
        const marker = L.marker([tree.latitude, tree.longitude], { opacity: opacity }).addTo(map);
        
        const statusTextMap = isRemovida ? '<span style="color:red;">(Removida)</span>' : '<span style="color:green;">(Ativa)</span>';
        marker.bindPopup(`
            <div style="text-align:center;">
                <b>${tree.nome}</b> <br>${statusTextMap}<br>
                <img src="${tree.fotoUrl}" width="100" style="margin: 5px 0; border-radius:4px;"><br>
                <button class="btn btn-small" onclick="abrirModal('${id}')" style="margin-top:5px; padding: 5px 10px;">⚙️ Gerenciar</button>
            </div>
        `);
        markers.push(marker);

        // --- Lógica da Lista ---
        const card = document.createElement('div');
        card.className = 'tree-card';
        // Deixa a foto preto e branco se foi removida
        const imgStyle = isRemovida ? 'filter: grayscale(100%); opacity: 0.7;' : '';
        const badgeStatus = isRemovida 
            ? `<span class="status-badge bg-removida" style="margin-left:0; font-size:10px;">REMOVIDA</span>` 
            : ``;

        card.innerHTML = `
            <img src="${tree.fotoUrl}" style="${imgStyle}">
            <div class="tree-info">
                <h3>${tree.nome}</h3>
                <p style="font-size: 12px; color: #666;">Registrada: ${tree.dataRegistro}</p>
                ${badgeStatus}
            </div>
            <div class="actions-col">
                <button class="btn btn-small" onclick="abrirModal('${id}')" style="background-color: #0277bd;">Gerenciar</button>
                <button class="btn btn-danger btn-small" onclick="excluirArvore('${id}', '${tree.fotoPath}')">Excluir</button>
            </div>
        `;
        listDiv.appendChild(card);
    });
});

// ==========================================
// FUNÇÕES DO MODAL (GERENCIAR DETALHES)
// ==========================================

window.abrirModal = (id) => {
    const tree = window.arvoresData[id];
    if(!tree) return;
    
    window.arvoreEditandoId = id;
    
    // Preenche os dados
    document.getElementById('modalNome').textContent = tree.nome;
    document.getElementById('modalObs').value = tree.observacao || '';
    
    // Lida com o Status
    const badge = document.getElementById('modalStatusBadge');
    const btnRemover = document.getElementById('btnRemoverTree');
    
    if (tree.status === 'removida') {
        badge.textContent = 'Removida';
        badge.className = 'status-badge bg-removida';
        btnRemover.textContent = '✅ Restaurar para Ativa';
        btnRemover.className = 'btn btn-secondary';
        btnRemover.style.backgroundColor = '#4CAF50';
    } else {
        badge.textContent = 'Ativa';
        badge.className = 'status-badge bg-ativa';
        btnRemover.textContent = '⚠️ Marcar como Removida';
        btnRemover.className = 'btn btn-danger';
        btnRemover.style.backgroundColor = ''; // Volta ao CSS padrão
    }

    // Lida com as Podas
    renderizarListaPodas(tree.podas || []);

    document.getElementById('manageModal').classList.add('active');
};

window.fecharModal = () => {
    document.getElementById('manageModal').classList.remove('active');
    window.arvoreEditandoId = null;
};

function renderizarListaPodas(podasArray) {
    const ul = document.getElementById('modalPodas');
    ul.innerHTML = '';
    if (podasArray.length === 0) {
        ul.innerHTML = '<li>Nenhuma poda registrada.</li>';
        return;
    }
    podasArray.forEach(poda => {
        const li = document.createElement('li');
        li.textContent = `Poda realizada em: ${poda}`;
        ul.appendChild(li);
    });
}

window.registrarPodaHoje = () => {
    const tree = window.arvoresData[window.arvoreEditandoId];
    if(!tree.podas) tree.podas = [];
    
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    tree.podas.push(dataHoje);
    renderizarListaPodas(tree.podas);
};

window.alternarStatusRemovida = () => {
    const tree = window.arvoresData[window.arvoreEditandoId];
    tree.status = tree.status === 'removida' ? 'ativa' : 'removida';
    
    // Atualiza visual do Modal na hora
    const badge = document.getElementById('modalStatusBadge');
    const btnRemover = document.getElementById('btnRemoverTree');
    
    if (tree.status === 'removida') {
        badge.textContent = 'Removida';
        badge.className = 'status-badge bg-removida';
        btnRemover.textContent = '✅ Restaurar para Ativa';
        btnRemover.style.backgroundColor = '#4CAF50';
    } else {
        badge.textContent = 'Ativa';
        badge.className = 'status-badge bg-ativa';
        btnRemover.textContent = '⚠️ Marcar como Removida';
        btnRemover.style.backgroundColor = 'var(--danger)';
    }
};

window.salvarAlteracoesTree = async () => {
    const id = window.arvoreEditandoId;
    const treeModificada = window.arvoresData[id];
    const novaObs = document.getElementById('modalObs').value;

    try {
        const docRef = doc(db, "arvores", id);
        await updateDoc(docRef, {
            observacao: novaObs,
            status: treeModificada.status,
            podas: treeModificada.podas
        });
        
        alert('Alterações salvas com sucesso!');
        window.fecharModal();
    } catch (error) {
        console.error("Erro ao atualizar: ", error);
        alert('Erro ao salvar as edições.');
    }
};

// Exclusão Total (Apaga do Banco e o Arquivo de Imagem)
window.excluirArvore = async (id, path) => {
    if(confirm("Deseja apagar DEFINITIVAMENTE este registro do sistema?")) {
        try {
            await deleteDoc(doc(db, "arvores", id));
            if(path) {
                await deleteObject(ref(storage, path));
            }
        } catch(e) {
            console.error(e);
            alert("Erro ao excluir do banco.");
        }
    }
};

// ==========================================
// SERVICE WORKER PWA
// ==========================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.log(err));
    });
}
