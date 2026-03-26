// ==========================================
// 1. CONFIGURATION & STATE MANAGEMENT
// ==========================================
let dbData = {
    orders: [],
    salesOutlet: [],
    irKeluar: [],
    irMasuk: [],
    bazaar: []
};

let editState = { isEditing: false, category: null, id: null };
let orderChartInstance = null;
let salesPieChartInstance = null;

// ==========================================
// 2. FIREBASE INTEGRATION (FIXED)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDPbgc8PNp_1MnCvlDM6PK8BKlmsLZpiZY",
  authDomain: "dashboard-93c29.firebaseapp.com",
  databaseURL: "https://dashboard-93c29-default-rtdb.asia-southeast1.firebasedatabase.app", 
  projectId: "dashboard-93c29",
  storageBucket: "dashboard-93c29.firebasestorage.app",
  messagingSenderId: "348052232602",
  appId: "1:348052232602:web:4ad8e6440b080224fc0223",
  measurementId: "G-M3N68WNE58"
};

// Inisialisasi
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Fungsi Kirim Data
function syncToFirebase() {
    db.ref('bazaarOpsData').set(dbData)
    .then(() => console.log("✅ Berhasil dikirim ke Firebase!"))
    .catch((error) => console.error("❌ Gagal kirim:", error));
}

// Fungsi Tarik Data
function loadFromFirebase() {
    db.ref('bazaarOpsData').once('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            dbData = data;
            // Pastikan array tidak null
            dbData.orders = data.orders || [];
            dbData.salesOutlet = data.salesOutlet || [];
            dbData.irKeluar = data.irKeluar || [];
            dbData.irMasuk = data.irMasuk || [];
            dbData.bazaar = data.bazaar || [];
            
            localStorage.setItem('bazaarOpsData', JSON.stringify(dbData));
            if (typeof renderAllUI === "function") renderAllUI();
        }
    });
}

// ==========================================
// 3. CORE DATA LOGIC (FIXED)
// ==========================================
function saveDataToLocal() {
    localStorage.setItem('bazaarOpsData', JSON.stringify(dbData));
    syncToFirebase(); // PENTING: Memanggil fungsi push ke cloud
    renderAllUI();    
}
// ==========================================
// 4. HELPER FUNCTIONS
// ==========================================
const generateId = () => '_' + Math.random().toString(36).substr(2, 9);
const formatNum = (num) => Number(num).toLocaleString('id-ID');
const getTodayDate = () => new Date().toISOString().split('T')[0];

function calculateOrderStats(release, done) {
    const rel = parseFloat(release) || 0;
    const dn = parseFloat(done) || 0;
    const pending = rel - dn;
    const percent = rel === 0 ? 0 : ((dn / rel) * 100).toFixed(1);
    return { pending, percent };
}

// ==========================================
// 5. UI RENDERING LOGIC
// ==========================================
function renderAllUI() {
    const filterDate = document.getElementById('global-date-filter').value;
    renderDashboard(filterDate);
    renderManagementTables();
}

function renderDashboard(filterDate) {
    // Filter functions
    const filterByDate = (item) => !filterDate || item.tanggal === filterDate;
    
    // Data arrays
    const fOrders = dbData.orders.filter(filterByDate);
    const fSales = dbData.salesOutlet.filter(filterByDate);
    const fIrKeluar = dbData.irKeluar.filter(filterByDate);
    const fIrMasuk = dbData.irMasuk.filter(filterByDate);
    
    // --- UPDATE CARDS ---
    // IR Keluar
    const totalIrK = fIrKeluar.reduce((sum, item) => sum + Number(item.jumlahIR), 0);
    const totalSkuK = fIrKeluar.reduce((sum, item) => sum + Number(item.totalSKU), 0);
    const totalQtyK = fIrKeluar.reduce((sum, item) => sum + Number(item.totalQty), 0);
    document.getElementById('dash-ir-keluar-ir').innerText = `${formatNum(totalIrK)} IR`;
    document.getElementById('dash-ir-keluar-sku').innerText = formatNum(totalSkuK);
    document.getElementById('dash-ir-keluar-qty').innerText = formatNum(totalQtyK);

    // IR Masuk
    const totalIrM = fIrMasuk.reduce((sum, item) => sum + Number(item.jumlahIR), 0);
    const totalSkuM = fIrMasuk.reduce((sum, item) => sum + Number(item.totalSKU), 0);
    const totalQtyM = fIrMasuk.reduce((sum, item) => sum + Number(item.totalQty), 0);
    document.getElementById('dash-ir-masuk-ir').innerText = `${formatNum(totalIrM)} IR`;
    document.getElementById('dash-ir-masuk-sku').innerText = formatNum(totalSkuM);
    document.getElementById('dash-ir-masuk-qty').innerText = formatNum(totalQtyM);

    // Event Bazaar Aktif (Minggu ini / Hari ini di antara mulai & selesai)
    const today = new Date().setHours(0,0,0,0);
    const activeBazaar = dbData.bazaar.filter(b => {
        const start = new Date(b.tanggalMulai).setHours(0,0,0,0);
        const end = new Date(b.tanggalSelesai).setHours(0,0,0,0);
        return today >= start && today <= end;
    });
    document.getElementById('dash-bazaar-active').innerText = `${activeBazaar.length} Event`;

    // --- UPDATE CHART.JS ---
    const totalSoRelease = fOrders.reduce((sum, item) => sum + Number(item.soRelease), 0);
    const totalDoneSo = fOrders.reduce((sum, item) => sum + Number(item.doneSO), 0);
    
    const ctx = document.getElementById('orderChart').getContext('2d');
    if (orderChartInstance) orderChartInstance.destroy();
    
    orderChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Done SO', 'Pending SO'],
            datasets: [{
                data: [totalDoneSo, Math.max(0, totalSoRelease - totalDoneSo)],
                backgroundColor: ['#2ecc71', '#e74c3c'],
                borderWidth: 1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
// --- UPDATE SALES OUTLET CHART (QTY & SKU DARI INPUT) ---
const salesCtx = document.getElementById('salesPieChart').getContext('2d');

// 1. Kelompokkan Data per Lokasi
const locationStats = {};

// Pastikan fSales ada isinya
if (fSales && fSales.length > 0) {
    fSales.forEach(item => {
        const loc = (item.lokasi || 'Tanpa Lokasi').trim();
        if (!locationStats[loc]) {
            locationStats[loc] = { qty: 0, sku: 0 };
        }
        
        // Ambil angka dari input, kalau bukan angka jadi 0 (biar gak error/ilang)
        locationStats[loc].qty += Number(item.qtyOrder) || 0;
        locationStats[loc].sku += Number(item.skuOrder) || 0; 
    });
}

const labels = Object.keys(locationStats);
const dataQty = labels.map(loc => locationStats[loc].qty);
const dataSku = labels.map(loc => locationStats[loc].sku);

if (salesPieChartInstance) salesPieChartInstance.destroy();

// Menggunakan tipe 'bar' agar SKU dan Qty bisa berdampingan dengan warna beda
salesPieChartInstance = new Chart(salesCtx, {
    type: 'bar',
    data: {
        labels: labels,
        datasets: [
            {
                label: 'Total Qty (Warna Biru)',
                data: dataQty,
                backgroundColor: '#3498db', // WARNA A (Biru) untuk Qty
                borderColor: '#2980b9',
                borderWidth: 1,
                yAxisID: 'y'
            },
            {
                label: 'Variasi SKU (Warna Oranye)',
    data: dataSku,
    backgroundColor: '#e67e22',
            }
        ]
    },
    options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
        y: { 
            type: 'linear', 
            position: 'left', 
            beginAtZero: true,
            title: { display: true, text: 'Jumlah (Pcs & SKU)' }
        }
        // HAPUS bagian y1 di sini agar skala kanan hilang
    }
}
});
    // --- UPDATE TABLES DASHBOARD ---
    renderTableHtml('table-dash-order', fOrders, ['tanggal', 'soRelease', 'doneSO', 'percentDone', 'keterangan']);
    renderTableHtml('table-dash-sales', fSales, ['tanggal', 'skuOrder', 'qtyOrder', 'lokasi']);
    
    // Top 5 Latest IR
    const top5IrM = [...fIrMasuk].sort((a,b) => new Date(b.tanggal) - new Date(a.tanggal)).slice(0, 5);
    renderTableHtml('table-dash-irmasuk', top5IrM, ['tanggal', 'jumlahIR', 'warehouse', 'totalSKU', 'totalQty', 'keterangan']);
    
    const top5IrK = [...fIrKeluar].sort((a,b) => new Date(b.tanggal) - new Date(a.tanggal)).slice(0, 5);
    renderTableHtml('table-dash-irkeluar', top5IrK, ['tanggal', 'jumlahIR', 'warehouse', 'totalSKU', 'totalQty', 'keterangan']);

    renderTableHtml('table-dash-bazaar', dbData.bazaar, ['namaProject', 'tanggalMulai', 'tanggalSelesai', 'keterangan']);
}

function renderManagementTables() {
    renderTableWithActions('table-manage-orders', dbData.orders, ['tanggal', 'soRelease', 'qtyRelease', 'doneSO', 'doneQty', 'pendingQty', 'percentDone', 'keterangan'], 'orders');
    renderTableWithActions('table-manage-salesOutlet', dbData.salesOutlet, ['tanggal', 'skuOrder', 'qtyOrder', 'lokasi'], 'salesOutlet');
    renderTableWithActions('table-manage-irKeluar', dbData.irKeluar, ['tanggal', 'jumlahIR', 'warehouse', 'totalSKU', 'totalQty', 'keterangan'], 'irKeluar');
    renderTableWithActions('table-manage-irMasuk', dbData.irMasuk, ['tanggal', 'jumlahIR', 'warehouse', 'totalSKU', 'totalQty', 'keterangan'], 'irMasuk');
    renderTableWithActions('table-manage-bazaar', dbData.bazaar, ['namaProject', 'tanggalMulai', 'tanggalSelesai', 'keterangan'], 'bazaar');
}

function renderTableHtml(tableId, dataArray, columns) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = '';
    if(dataArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length}" style="text-align:center;">Tidak ada data</td></tr>`;
        return;
    }
    dataArray.forEach(item => {
        let tr = document.createElement('tr');
        columns.forEach(col => {
            let td = document.createElement('td');
            // Format numbers if it's purely a number and not a date/string
            let val = item[col];
            if(!isNaN(val) && val !== '' && col !== 'percentDone') val = formatNum(val);
            if(col === 'percentDone') val = val + '%';
            td.innerText = val || '-';
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
}

function renderTableWithActions(tableId, dataArray, columns, category) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = '';
    if(dataArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${columns.length + 1}" style="text-align:center;">Tidak ada data</td></tr>`;
        return;
    }
    dataArray.forEach(item => {
        let tr = document.createElement('tr');
        columns.forEach(col => {
            let td = document.createElement('td');
            let val = item[col];
            if(!isNaN(val) && val !== '' && col !== 'percentDone') val = formatNum(val);
            if(col === 'percentDone') val = val + '%';
            td.innerText = val || '-';
            tr.appendChild(td);
        });
        // Actions
        let tdAction = document.createElement('td');
        tdAction.className = 'action-buttons';
        tdAction.innerHTML = `
            <button class="btn-primary btn-sm btn-edit" data-id="${item.id}" data-category="${category}"><i class="fas fa-edit"></i></button>
            <button class="btn-danger btn-sm btn-delete" data-id="${item.id}" data-category="${category}"><i class="fas fa-trash"></i></button>
        `;
        tr.appendChild(tdAction);
        tbody.appendChild(tr);
    });
}

// ==========================================
// 6. EVENT LISTENERS & FORM HANDLING
// ==========================================

// --- Navigation ---
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        const targetId = link.getAttribute('data-target');
        document.querySelectorAll('.view-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(targetId).classList.add('active');
    });
});

// --- Date Filter ---
document.getElementById('global-date-filter').addEventListener('change', () => {
    renderAllUI();
});

// --- Form Submissions ---
const formDefinitions = [
    {
        id: 'formOrderObj', cat: 'orders',
        mapData: (elements) => {
            const stats = calculateOrderStats(elements['order-qty-release'].value, elements['order-done-qty'].value);
            const soStats = calculateOrderStats(elements['order-so-release'].value, elements['order-done-so'].value); // for percent
            return {
                tanggal: elements['order-tanggal'].value,
                soRelease: elements['order-so-release'].value,
                qtyRelease: elements['order-qty-release'].value,
                doneSO: elements['order-done-so'].value,
                doneQty: elements['order-done-qty'].value,
                pendingQty: stats.pending,
                percentDone: soStats.percent,
                keterangan: elements['order-ket'].value
            }
        }
    },
    {
        id: 'formSalesObj', cat: 'salesOutlet',
        mapData: (els) => ({
            tanggal: els['sales-tanggal'].value, skuOrder: els['sales-sku'].value,
            qtyOrder: els['sales-qty'].value, lokasi: els['sales-lokasi'].value
        })
    },
    {
        id: 'formIrKeluarObj', cat: 'irKeluar',
        mapData: (els) => ({
            tanggal: els['irkeluar-tanggal'].value, jumlahIR: els['irkeluar-jumlah'].value,
            warehouse: els['irkeluar-warehouse'].value, totalSKU: els['irkeluar-sku'].value,
            totalQty: els['irkeluar-qty'].value, keterangan: els['irkeluar-ket'].value
        })
    },
    {
        id: 'formIrMasukObj', cat: 'irMasuk',
        mapData: (els) => ({
            tanggal: els['irmasuk-tanggal'].value, jumlahIR: els['irmasuk-jumlah'].value,
            warehouse: els['irmasuk-warehouse'].value, totalSKU: els['irmasuk-sku'].value,
            totalQty: els['irmasuk-qty'].value, keterangan: els['irmasuk-ket'].value
        })
    },
    {
        id: 'formBazaarObj', cat: 'bazaar',
        mapData: (els) => ({
            namaProject: els['bazaar-nama'].value, tanggalMulai: els['bazaar-mulai'].value,
            tanggalSelesai: els['bazaar-selesai'].value, keterangan: els['bazaar-ket'].value
        })
    }
];

formDefinitions.forEach(formDef => {
    const formEl = document.getElementById(formDef.id);
    formEl.addEventListener('submit', (e) => {
        e.preventDefault();
        const newData = formDef.mapData(formEl.elements);
        
        if (editState.isEditing && editState.category === formDef.cat) {
            // Update
            const index = dbData[formDef.cat].findIndex(item => item.id === editState.id);
            if(index !== -1) {
                dbData[formDef.cat][index] = { ...dbData[formDef.cat][index], ...newData };
            }
            resetEditMode(formEl);
        } else {
            // Create
            newData.id = generateId();
            dbData[formDef.cat].push(newData);
        }
        
        formEl.reset();
        saveDataToLocal();
        alert('Data berhasil disimpan!');
    });

    // Cancel Edit Button
    formEl.querySelector('.btn-cancel').addEventListener('click', () => {
        formEl.reset();
        resetEditMode(formEl);
    });
});

// --- Event Delegation (Edit & Delete) ---
document.addEventListener('click', (e) => {
    // Delete
    if (e.target.closest('.btn-delete')) {
        const btn = e.target.closest('.btn-delete');
        if(confirm('Yakin ingin menghapus data ini?')) {
            const id = btn.dataset.id;
            const cat = btn.dataset.category;
            dbData[cat] = dbData[cat].filter(item => item.id !== id);
            saveDataToLocal();
        }
    }
    
    // Edit
    if (e.target.closest('.btn-edit')) {
        const btn = e.target.closest('.btn-edit');
        const id = btn.dataset.id;
        const cat = btn.dataset.category;
        
        const item = dbData[cat].find(i => i.id === id);
        if(!item) return;

        // Find the right form
        const formDef = formDefinitions.find(f => f.cat === cat);
        const formEl = document.getElementById(formDef.id);
        
        // Populate inputs based on category (mapping keys back to DOM ids)
        if(cat === 'orders') {
            formEl.elements['order-tanggal'].value = item.tanggal;
            formEl.elements['order-so-release'].value = item.soRelease;
            formEl.elements['order-qty-release'].value = item.qtyRelease;
            formEl.elements['order-done-so'].value = item.doneSO;
            formEl.elements['order-done-qty'].value = item.doneQty;
            formEl.elements['order-ket'].value = item.keterangan;
        } else if(cat === 'salesOutlet') {
            formEl.elements['sales-tanggal'].value = item.tanggal;
            formEl.elements['sales-sku'].value = item.skuOrder;
            formEl.elements['sales-qty'].value = item.qtyOrder;
            formEl.elements['sales-lokasi'].value = item.lokasi;
        } else if(cat === 'irKeluar') {
            formEl.elements['irkeluar-tanggal'].value = item.tanggal;
            formEl.elements['irkeluar-jumlah'].value = item.jumlahIR;
            formEl.elements['irkeluar-warehouse'].value = item.warehouse;
            formEl.elements['irkeluar-sku'].value = item.totalSKU;
            formEl.elements['irkeluar-qty'].value = item.totalQty;
            formEl.elements['irkeluar-ket'].value = item.keterangan;
        } else if(cat === 'irMasuk') {
            formEl.elements['irmasuk-tanggal'].value = item.tanggal;
            formEl.elements['irmasuk-jumlah'].value = item.jumlahIR;
            formEl.elements['irmasuk-warehouse'].value = item.warehouse;
            formEl.elements['irmasuk-sku'].value = item.totalSKU;
            formEl.elements['irmasuk-qty'].value = item.totalQty;
            formEl.elements['irmasuk-ket'].value = item.keterangan;
        } else if(cat === 'bazaar') {
            formEl.elements['bazaar-nama'].value = item.namaProject;
            formEl.elements['bazaar-mulai'].value = item.tanggalMulai;
            formEl.elements['bazaar-selesai'].value = item.tanggalSelesai;
            formEl.elements['bazaar-ket'].value = item.keterangan;
        }

        // Set Edit State
        editState = { isEditing: true, category: cat, id: id };
        
        // UI Changes for edit mode
        document.getElementById(`title-form-${cat === 'irKeluar' ? 'irKeluar' : cat === 'irMasuk' ? 'irMasuk' : cat === 'salesOutlet' ? 'sales' : cat}`).innerText = `Edit Data ${cat}`;
        formEl.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-check"></i> Update Data';
        formEl.querySelector('.btn-cancel').style.display = 'inline-block';
        
        // Scroll to form smoothly
        formEl.scrollIntoView({ behavior: 'smooth' });
    }
});

function resetEditMode(formEl) {
    const cat = editState.category;
    editState = { isEditing: false, category: null, id: null };
    document.getElementById(`title-form-${cat === 'irKeluar' ? 'irKeluar' : cat === 'irMasuk' ? 'irMasuk' : cat === 'salesOutlet' ? 'sales' : cat}`).innerText = `Input Data`;
    formEl.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save"></i> Simpan Data';
    formEl.querySelector('.btn-cancel').style.display = 'none';
}

// ==========================================
// 7. BONUS FEATURES (Dark Mode, Export, Print)
// ==========================================

// Theme Toggle
const themeBtn = document.getElementById('theme-toggle');
themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('bazaarOpsTheme', isDark ? 'dark' : 'light');
    themeBtn.innerHTML = isDark ? '<i class="fas fa-sun"></i> Light Mode' : '<i class="fas fa-moon"></i> Dark Mode';
});

// Load Theme
if(localStorage.getItem('bazaarOpsTheme') === 'dark') {
    document.body.classList.add('dark-mode');
    themeBtn.innerHTML = '<i class="fas fa-sun"></i> Light Mode';
}

// Print
document.getElementById('btn-print').addEventListener('click', () => window.print());

// Export Excel (Using SheetJS)
document.getElementById('btn-export').addEventListener('click', () => {
    const wb = XLSX.utils.book_new();
    
    // Convert arrays to sheets
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dbData.orders), "Data Order");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dbData.salesOutlet), "Sales Outlet");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dbData.irKeluar), "IR Keluar");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dbData.irMasuk), "IR Masuk");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dbData.bazaar), "Event Bazaar");
    
    XLSX.writeFile(wb, `BazaarOps_Report_${getTodayDate()}.xlsx`);
});

// Clear All Data
document.getElementById('clear-data-btn').addEventListener('click', () => {
    if(confirm('BAHAYA: Anda yakin ingin menghapus SEMUA data secara permanen?')) {
        dbData = { orders: [], salesOutlet: [], irKeluar: [], irMasuk: [], bazaar: [] };
        saveDataToLocal();
    }
});

// ==========================================
// 8. INITIALIZE APP
// ==========================================
function initData() {
    // Ambil data dari local dulu (agar user tidak melihat layar kosong saat loading)
    const localData = localStorage.getItem('bazaarOpsData');
    if (localData) {
        dbData = JSON.parse(localData);
        renderAllUI();
    }
    
    // Tarik data terbaru dari Firebase (untuk sinkronisasi antar perangkat)
    loadFromFirebase(); 
}

document.addEventListener('DOMContentLoaded', initData);