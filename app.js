import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";
import { getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// Suas credenciais do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAqUJYK3L0e77NYh_hE176CY3SV-jg3-Yc",
    authDomain: "chornografic.firebaseapp.com",
    projectId: "chornografic",
    storageBucket: "chornografic.firebasestorage.app",
    messagingSenderId: "685211286639",
    appId: "1:685211286639:web:9444cca8dfe2e46222e19a",
    measurementId: "G-RXNCY69R7Y"
};

// Inicialização
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Mapa Leaflet centralizado em Pontalina
const map = L.map('map').setView([-17.5255, -49.5218], 14);
window.mapInstance = map;

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

let markers = [];

// Localização GPS
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

// Salvar Dados
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

        await addDoc(collection(db, "arvores"), {
            nome: name,
            fotoUrl: photoURL,
            fotoPath: fileName,
            latitude: parseFloat(lat),
            longitude: parseFloat(lng),
            data: new Date().toLocaleDateString('pt-BR')
        });

        alert("Catalogado com sucesso!");
        document.getElementById('treeForm').reset();
        document.getElementById('location-status').textContent = "GPS não capturado";
        document.getElementById('location-status').classList.remove('success-text');

    } catch (error) {
        console.error(error);
        alert("Erro ao salvar. Verifique as regras do Firebase.");
    } finally {
        document.getElementById('submitBtn').style.display = 'block';
        document.getElementById('loader').style.display = 'none';
    }
});

// Sincronização em Tempo Real
onSnapshot(collection(db, "arvores"), (snapshot) => {
    const listDiv = document.getElementById('treeList');
    listDiv.innerHTML = '';
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    if (snapshot.empty) {
        listDiv.innerHTML = '<p style="text-align:center;">Nenhum registro encontrado.</p>';
        return;
    }

    snapshot.forEach((docSnap) => {
        const tree = docSnap.data();
        const id = docSnap.id;

        // Mapa
        const marker = L.marker([tree.latitude, tree.longitude]).addTo(map);
        marker.bindPopup(`<b>${tree.nome}</b><br><img src="${tree.fotoUrl}" width="100">`);
        markers.push(marker);

        // Lista
        const card = document.createElement('div');
        card.className = 'tree-card';
        card.innerHTML = `
            <img src="${tree.fotoUrl}">
            <div class="tree-info">
                <h3>${tree.nome}</h3>
                <p>${tree.data}</p>
            </div>
            <button class="btn btn-danger" data-id="${id}" data-path="${tree.fotoPath}">Excluir</button>
        `;
        listDiv.appendChild(card);
    });

    document.querySelectorAll('.btn-danger').forEach(btn => {
        btn.onclick = async (e) => {
            if(confirm("Deseja apagar este registro?")) {
                const docId = e.target.dataset.id;
                const path = e.target.dataset.path;
                await deleteDoc(doc(db, "arvores", docId));
                await deleteObject(ref(storage, path));
            }
        };
    });
});

// Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.log(err));
    });
}
