<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import * as XLSX from 'xlsx'; // Import untuk fitur Export Excel

// Impor dari file konfigurasi Firebase Anda
import { db, auth } from './firebase.js'; 

// Impor fungsi-fungsi untuk Database (Firestore)
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction, addDoc, getDoc, query, where } from 'firebase/firestore'

// Impor fungsi-fungsi BARU untuk Autentikasi (Login/Register)
import { 
    onAuthStateChanged, 
    signOut, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword 
} from "firebase/auth";

// --- STATE MANAGEMENT ---
const activePage = ref('dashboard');
const isLoading = ref(true);
const isSaving = ref(false);
const isSavingSettings = ref(false);
const currentUser = ref(null); // <-- TAMBAHKAN INI: untuk menyimpan data pengguna
const authForm = reactive({
    email: '',
    password: '',
    error: '',
    activationCode: '' // <-- TAMBAHKAN BARIS INI
});
const state = reactive({
    settings: { 
        brandName: 'FASHION OS', 
        minStok: 10,
        marketplaces: [],
        modelBaju: []
    },
    produk: [],
    transaksi: [],
    biaya: [],
    keuanganLain: [],
    retur: [
    { id: 'RET-001', tanggal: '2025-07-21', sku: 'FSH-TSH-BL-M', qty: 1, alasan: 'Ukuran tidak sesuai', tindakLanjut: 'Tukar Ukuran', channelId: 'shopee-a' },
    { id: 'RET-002', tanggal: '2025-07-22', sku: 'FSH-KJM-NV-L', qty: 1, alasan: 'Cacat produksi', tindakLanjut: 'Refund', channelId: 'tiktok-shop' },
],
    carts: {},
    promotions: { perChannel: {}, perModel: {} },
    specialPrices: {},
    produksi: [
    { 
        id: 'PROD-001', 
        tanggal: '2025-07-01', 
        namaProduk: 'Kaos Polos Premium',
        namaPemaklun: 'Jahit Rapi', 
        statusProses: 'Selesai', 
        kuantitasJadi: 98,
        kuantitasPerbaikan: 0,
        admin: 'Admin A',
        statusPembayaran: 'Belum Dibayar',
        totalBiayaMaterial: 5500000, 
        totalHargaJasaMaklun: 1470000,
        catatan: '-',
        kainBahan: [
            { modelBajuId: 'MODEL-001', namaKain: 'Cotton Combed 30s', warnaKain: 'Hitam', ukuran: 'M', tokoKain: 'Toko Kain Jaya', totalYard: 220, hargaKainPerYard: 25000, yardPerBaju: 2.2, targetQty: 100, aktualJadi: 98, hargaMaklunPerPcs: 15000, aktualJadiKombinasi: null, biayaAlat: null }
        ]
    },
    { 
        id: 'PROD-002', 
        tanggal: '2025-07-05', 
        namaProduk: 'Kemeja Flanel',
        namaPemaklun: 'Berkah Jaya', 
        statusProses: 'Selesai', 
        kuantitasJadi: 64,
        kuantitasPerbaikan: 2,
        admin: 'Admin B',
        statusPembayaran: 'Sudah Dibayar',
        jumlahPembayaran: 960000,
        tanggalPembayaran: '2025-07-10',
        totalBiayaMaterial: 7700000, 
        totalHargaJasaMaklun: 960000,
        catatan: 'Ada 2 pcs perlu perbaikan minor.',
        kainBahan: [
            { modelBajuId: 'MODEL-002', namaKain: 'Flanel Import', warnaKain: 'Merah Kotak', ukuran: 'L', tokoKain: 'Sumber Flanel', totalYard: 150, hargaKainPerYard: 50000, yardPerBaju: 2.3, targetQty: 65, aktualJadi: 64, hargaMaklunPerPcs: 15000, aktualJadiKombinasi: null, biayaAlat: null }
        ]
    },
],
    // --- START: KODE BARU UNTUK STOK KAIN ---
    gudangKain: [
        { id: 'GK-001', tanggalBeli: '2025-07-10', namaKain: 'Cotton Combed 30s', warna: 'Hitam Pekat', sisaYard: 150.5, toko: 'Toko Kain Abadi', hargaBeliPerYard: 25500 },
        { id: 'GK-002', tanggalBeli: '2025-07-12', namaKain: 'Crinkle Airflow', warna: 'Sage Green', sisaYard: 88, toko: 'Sumber Jaya Textile', hargaBeliPerYard: 32000 },
        { id: 'GK-003', tanggalBeli: '2025-07-15', namaKain: 'Cotton Combed 30s', warna: 'Putih BW', sisaYard: 25.0, toko: 'Toko Kain Abadi', hargaBeliPerYard: 24500 },
    ],
    // --- END: KODE BARU UNTUK STOK KAIN ---
    transactionCounter: 0,
});
async function submitAddProduct() {
    const form = uiState.modalData;
    if (!form.sku || !form.nama || !form.hpp || !form.hargaJualDefault) {
        alert('SKU, Nama, HPP, dan Harga Jual Default wajib diisi.');
        return;
    }

    const skuUpperCase = form.sku.toUpperCase();
    const productRef = doc(db, "products", skuUpperCase);

    const productData = {
        product_name: form.nama,
        color: form.warna || '',
        variant: form.varian || '',
        physical_stock: 0,
        hpp: form.hpp,
        userId: currentUser.value.uid
    };

    try {
        await setDoc(productRef, productData);
        
        const batch = writeBatch(db);
        state.settings.marketplaces.forEach(channel => {
            const priceDocId = `${skuUpperCase}-${channel.id}`;
            const priceRef = doc(db, "product_prices", priceDocId);
            batch.set(priceRef, {
                product_sku: skuUpperCase,
                marketplace_id: channel.id,
                price: form.hargaJualDefault
            });
        });

        await batch.commit();
        alert(`Produk "${form.nama}" berhasil ditambahkan ke database!`);
        
        // Muat ulang semua data untuk mendapatkan data terbaru
        await loadAllDataFromFirebase(); 
        
        hideModal();

    } catch (error) {
        console.error('Error menyimpan produk ke Firebase:', error);
        alert('Gagal menyimpan produk ke database. Cek console untuk detail.');
    }
}
function generateUniqueCode() {
    const numbers = Math.floor(10 + Math.random() * 90); // 2 angka acak
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 3; i++) {
        result += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    return `${numbers}${result}`;
}
async function handleSubscription(plan) {
    if (!currentUser.value) return alert("Silakan login terlebih dahulu.");

    try {
        console.log(`Mengirim permintaan langganan untuk paket: ${plan}`);

        // Kirim permintaan ke Serverless Function kita
        const response = await fetch('/api/buat-tagihan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan: plan,
                userId: currentUser.value.uid,
                email: currentUser.value.email
            })
        });

        if (!response.ok) {
            throw new Error('Gagal menghubungi server.');
        }

        const data = await response.json();

        // Arahkan pengguna ke halaman pembayaran yang diberikan oleh backend
        alert(`Anda akan diarahkan ke halaman pembayaran...`);
        window.location.href = data.paymentUrl;

    } catch (error) {
        console.error("Gagal membuat link pembayaran:", error);
        alert("Gagal memproses langganan. Silakan coba lagi.");
    }
}
async function handleRegister() {
    try {
        // 1. Buat akun pengguna di Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
        const user = userCredential.user;

        // 2. Siapkan dokumen baru untuk pengguna di koleksi 'users'
        const userDocRef = doc(db, "users", user.uid);
        let newUserData = {
            email: user.email,
            subscriptionStatus: '', // Akan kita isi di bawah
            subscriptionEndDate: null,
            trialEndDate: null
        };

        const now = new Date();
        
        // 3. Cek apakah ada Kode Aktivasi yang dimasukkan
        if (authForm.activationCode === 'BAYAR30HARI') { 
            // LOGIKA UNTUK PEMBELI ONLINE (SHOPEE)
            // Anda akan memberikan kode 'BAYAR30HARI' kepada pembeli Shopee Anda
            newUserData.subscriptionStatus = 'active';
            const nextMonth = new Date(now.setMonth(now.getMonth() + 1));
            newUserData.subscriptionEndDate = nextMonth;
            alert('Registrasi berhasil! Langganan Anda aktif selama 30 hari.');

        } else {
            // LOGIKA UNTUK PENGGUNA OFFLINE (FREE TRIAL)
            // Jika kode aktivasi kosong atau salah
            newUserData.subscriptionStatus = 'trial';
            const sevenDaysLater = new Date(now.setDate(now.getDate() + 7));
            newUserData.trialEndDate = sevenDaysLater;
            alert('Registrasi berhasil! Anda mendapatkan free trial selama 7 hari.');
        }

        // 4. Simpan data pengguna ke Firestore
        await setDoc(userDocRef, newUserData);

        authForm.error = '';
        // Pengguna akan otomatis login

    } catch (error) {
        authForm.error = error.message;
    }
}

async function handleLogin() {
    try {
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
        authForm.error = '';
    } catch (error) {
        authForm.error = error.message;
    }
}

async function handleLogout() {
    await signOut(auth);
}
async function submitAddStockIn() {
    const form = uiState.modalData;
    if (!form.sku || !form.qty || form.qty <= 0 || !form.alasan) {
        alert('SKU, Alasan, dan Jumlah Stok (harus lebih dari 0) wajib diisi.');
        return;
    }

    const skuToUpdate = form.sku.toUpperCase();
    const quantityToAdd = form.qty;

    try {
        // PENTING: Kita akan menggunakan Transaksi Firestore untuk keamanan data
        // Ini memastikan kita membaca stok terbaru sebelum menambahkannya.
        const productRef = doc(db, "products", skuToUpdate);

        await runTransaction(db, async (transaction) => {
            const productDoc = await transaction.get(productRef);
            if (!productDoc.exists()) {
                throw new Error(`Produk dengan SKU "${skuToUpdate}" tidak ditemukan di database.`);
            }

            const currentStock = productDoc.data().physical_stock || 0;
            const newStock = currentStock + quantityToAdd;
            
            transaction.update(productRef, { physical_stock: newStock });
            
            // Update state lokal HANYA setelah transaksi Firebase sukses
            const productInState = getProductBySku(skuToUpdate);
            if (productInState) {
                productInState.stokFisik = newStock;
            }
        });

        alert(`Stok untuk SKU ${skuToUpdate} berhasil ditambahkan sebanyak ${quantityToAdd}.`);
        hideModal();

    } catch (error) {
        console.error("Error dalam transaksi stok masuk:", error);
        alert(`Gagal memperbarui stok: ${error.message}`);
    }
}
const uiState = reactive({
    activeAccordion: null,
    activeCartChannel: state.settings.marketplaces.length > 0 ? state.settings.marketplaces[0].id : null,
    dashboardDateFilter: 'today',
    dashboardStartDate: '',
    dashboardEndDate: '',
    dashboardStartMonth: new Date().getMonth() + 1,
    dashboardEndMonth: new Date().getMonth() + 1,
    dashboardStartYear: new Date().getFullYear(),
    dashboardEndYear: new Date().getFullYear(),
    // --- START: KODE BARU UNTUK UI STOK KAIN ---
    gudangKainSearch: '',
    gudangKainSort: 'tanggal-desc',
    // --- END: KODE BARU UNTUK UI STOK KAIN ---
    editProduksiBatch: { kainBahan: [] },
    hargaHppSelectedProduct: '',
    inventoryFilterStock: 'all',
    inventorySearch: '',
    inventorySort: 'nama-asc',
    isModalVisible: false,
    keuanganPemasukanBulan: new Date().getMonth() + 1,
    keuanganPemasukanEndDate: '',
    keuanganPemasukanFilter: 'today',
    keuanganPemasukanStartDate: '',
    keuanganPemasukanTahun: new Date().getFullYear(),
    keuanganPengeluaranBulan: new Date().getMonth() + 1,
    keuanganPengeluaranEndDate: '',
    keuanganPengeluaranFilter: 'today',
    keuanganPengeluaranStartDate: '',
    keuanganPengeluaranTahun: new Date().getFullYear(),
    laporanData: { ringkasan: [], laporanPerStatus: [], statusTerpilih: '' },
    laporanStatusSelected: 'all',
    // --- START: KODE BARU UNTUK LAPORAN SEMUANYA ---
    laporanSemuaFilter: 'this_month',
    laporanSemuaStartDate: '',
    laporanSemuaEndDate: '',
    // TAMBAHKAN & SESUAIKAN BAGIAN INI
    laporanSemuaBulan: new Date().getMonth() + 1,
    laporanSemuaTahun: new Date().getFullYear(),
    laporanSemuaStartMonth: new Date().getMonth() + 1,
    laporanSemuaEndMonth: new Date().getMonth() + 1,
    laporanSemuaStartYear: new Date().getFullYear(),
    laporanSemuaEndYear: new Date().getFullYear(),
    // --- END: KODE BARU UNTUK LAPORAN SEMUANYA ---
    // --- START: KODE BARU UNTUK PAGINASI ---
    laporanSemuaCurrentPage: 1,
    laporanSemuaItemsPerPage: 5, // Tampilkan 5 baris data per halaman
    // --- END: KODE BARU UNTUK PAGINASI ---
    analisisModelFilter: 'none', // Pilihan utama: 'none', 'model', 'all'
analisisModelSelectedModel: '', // Wadah untuk menyimpan ID model baju yang dipilih
analisisModelSelectedType: 'aktualJadi', // Pilihan 'aktualJadi' atau 'aktualJadiKombinasi'
    modalData: {},
    modalType: '',
   newProduksiBatch: { kainBahan: [] }, // DIPERBAIKI
   pengaturanMarketplaceSearch: '',
   pengaturanModelBajuSearch: '', // <-- TAMBAHKAN BARIS INI
   posDateFilter: 'today',
    posStartDate: '',
    posEndDate: '',
    // TAMBAHKAN & SESUAIKAN BAGIAN INI
    posBulan: new Date().getMonth() + 1, // Ganti nama ini agar konsisten
    posTahun: new Date().getFullYear(),
    posStartMonth: new Date().getMonth() + 1,
    posEndMonth: new Date().getMonth() + 1,
    posStartYear: new Date().getFullYear(),
    posEndYear: new Date().getFullYear(),
    posSearchQuery: '',
    posSearchRecommendations: [],
    specialPriceChannel: state.settings.marketplaces.length > 0 ? state.settings.marketplaces[0].id : null,
    specialPriceSearch: '',
    specialPriceRecommendations: [],
    selectedProductForSpecialPrice: null,
    specialPriceInput: null,
    produksiFilterStatus: 'all',
    produksiSearch: '',
    promosiSelectedModel: '',
    returPageBulan: new Date().getMonth() + 1,
    returPageDateFilter: 'all_time',
    returPageEndDate: '',
    returPageSearchQuery: '',
    returPageSearchRecommendations: [],
    returPageStartDate: '',
    returPageTahun: new Date().getFullYear(),
    returSearchQuery: '',
    returSearchRecommendations: [],
    ringkasanStatusSelected: 'Selesai',
    stockInSearchRecommendations: [],
});


let profitExpenseChart = null;
let salesChannelChart = null;
// --- UTILITY FUNCTIONS ---
const formatCurrency = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value || 0);
const formatNumber = (value) => (value === null || value === undefined) ? '' : new Intl.NumberFormat('id-ID').format(value);
const getProductBySku = (sku) => {
    // Pertama, pastikan 'sku' yang dicari tidak kosong
    if (!sku) {
        return undefined;
    }
    // Cari produk, dan pastikan setiap produk 'p' dan 'p.sku' ada sebelum membandingkan
    return state.produk.find(p => p && p.sku && p.sku.toLowerCase() === sku.toLowerCase());
};
const getMarketplaceById = (id) => state.settings.marketplaces.find(mp => mp.id === id);

function filterDataByDate(data, filterType, startDateStr, endDateStr, startMonth, startYear, endMonth, endYear) {
    if (!data) return [];
    const now = new Date();

    return data.filter(item => {
        if (!item.tanggal) return false;
        const itemDate = new Date(item.tanggal);
        itemDate.setHours(0, 0, 0, 0);

        switch (filterType) {
            case 'today':
                return itemDate.toDateString() === now.toDateString();

            case 'last_7_days': {
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(now.getDate() - 7);
                sevenDaysAgo.setHours(0, 0, 0, 0);
                return itemDate >= sevenDaysAgo && itemDate <= now;
            }
            case 'last_30_days': {
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(now.getDate() - 30);
                thirtyDaysAgo.setHours(0, 0, 0, 0);
                return itemDate >= thirtyDaysAgo && itemDate <= now;
            }
            case 'this_year':
                return itemDate.getFullYear() === now.getFullYear();

            // LOGIKA RENTANG TANGGAL YANG DIPERBAIKI
            case 'by_date_range': {
                if (!startDateStr || !endDateStr) return true;
                const start = new Date(startDateStr);
                const end = new Date(endDateStr);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                return itemDate >= start && itemDate <= end;
            }
            
            // LOGIKA BARU UNTUK RENTANG BULAN
            case 'by_month_range': {
                if (!startMonth || !startYear || !endMonth || !endYear) return true;
                const start = new Date(startYear, startMonth - 1, 1);
                const end = new Date(endYear, endMonth, 0); // Hari terakhir dari bulan akhir
                end.setHours(23, 59, 59, 999);
                return itemDate >= start && itemDate <= end;
            }

            // LOGIKA BARU UNTUK RENTANG TAHUN
            case 'by_year_range': {
                if (!startYear || !endYear) return true;
                const start = new Date(startYear, 0, 1); // 1 Januari dari tahun awal
                const end = new Date(endYear, 11, 31); // 31 Desember dari tahun akhir
                end.setHours(23, 59, 59, 999);
                return itemDate >= start && itemDate <= end;
            }
            
            case 'all_time':
            default:
                return true;
        }
    });
}

const formatInputNumber = (value) => {
    if (value === null || value === undefined) return '';
    return new Intl.NumberFormat('id-ID').format(value);
};

const parseInputNumber = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const parsed = value.toString().replace(/[^0-9]/g, '');
    return parseInt(parsed, 10) || 0;
};


// --- COMPUTED PROPERTIES ---
const dashboardFilteredData = computed(() => ({
    transaksi: filterDataByDate(
        state.transaksi, 
        uiState.dashboardDateFilter, 
        uiState.dashboardStartDate, 
        uiState.dashboardEndDate,
        uiState.dashboardStartMonth,
        uiState.dashboardStartYear,
        uiState.dashboardEndMonth,
        uiState.dashboardEndYear
    ),
    biaya: filterDataByDate(
        state.biaya, 
        uiState.dashboardDateFilter, 
        uiState.dashboardStartDate, 
        uiState.dashboardEndDate,
        uiState.dashboardStartMonth,
        uiState.dashboardStartYear,
        uiState.dashboardEndMonth,
        uiState.dashboardEndYear
    ),
    keuanganLain: filterDataByDate(
        state.keuanganLain, 
        uiState.dashboardDateFilter, 
        uiState.dashboardStartDate, 
        uiState.dashboardEndDate,
        uiState.dashboardStartMonth,
        uiState.dashboardStartYear,
        uiState.dashboardEndMonth,
        uiState.dashboardEndYear
    ),
    retur: filterDataByDate(
        state.retur, 
        uiState.dashboardDateFilter, 
        uiState.dashboardStartDate, 
        uiState.dashboardEndDate,
        uiState.dashboardStartMonth,
        uiState.dashboardStartYear,
        uiState.dashboardEndMonth,
        uiState.dashboardEndYear
    )
}));
const dashboardKpis = computed(() => {
    const { transaksi, biaya, keuanganLain, retur } = dashboardFilteredData.value;
    let totalOmsetBersih = 0, totalHppTerjual = 0, totalBiayaTransaksi = 0;
    transaksi.forEach(trx => {
        totalOmsetBersih += trx.total;
        trx.items.forEach(item => {
            totalHppTerjual += (item.hpp || 0) * item.qty;
        });
        if (trx.biaya && trx.biaya.total) {
            // PERBAIKAN: Sekarang hanya menjumlahkan 'trx.biaya.total' yang sudah benar.
            totalBiayaTransaksi += trx.biaya.total;
        }
    });
    const totalBiayaOperasional = biaya.reduce((sum, b) => sum + b.jumlah, 0);
    const totalModalMasuk = keuanganLain.filter(i => i.tipe === 'Modal Masuk').reduce((s, i) => s + i.jumlah, 0);
    const totalAmbilanPribadi = keuanganLain.filter(i => i.tipe === 'Ambilan Pribadi').reduce((s, i) => s + i.jumlah, 0);
    const totalNilaiRetur = retur.reduce((sum, r) => { const p = getProductBySku(r.sku); const hargaJual = p && p.hargaJual ? (Object.values(p.hargaJual)[0] || p.hpp) : 0; return sum + (hargaJual * r.qty); }, 0);
    const labaKotor = totalOmsetBersih - totalHppTerjual;
    const labaBersihEst = labaKotor - totalBiayaOperasional - totalBiayaTransaksi;
    const saldoKas = totalOmsetBersih - totalBiayaOperasional - totalAmbilanPribadi + totalModalMasuk - totalBiayaTransaksi;
    const totalUnitStok = state.produk.reduce((sum, p) => sum + (p.stokFisik || 0), 0);
    const totalNilaiStokHPP = state.produk.reduce((sum, p) => sum + ((p.stokFisik || 0) * (p.hpp || 0)), 0);
    return { saldoKas, totalOmsetBersih, labaKotor, labaBersihEst, totalBiayaOperasional, totalUnitStok, totalNilaiStokHPP, totalNilaiRetur };
});

const filteredTransaksi = computed(() => {
    return filterDataByDate(
        state.transaksi, 
        uiState.posDateFilter, 
        uiState.posStartDate, 
        uiState.posEndDate,
        uiState.posStartMonth,
        uiState.posStartYear,
        uiState.posEndMonth,
        uiState.posEndYear
    ).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
});
const activeCart = computed(() => state.carts[uiState.activeCartChannel] || []);
const cartSummary = computed(() => {
    const summary = { subtotal: 0, itemCount: 0, discount: { totalDiscount: 0, description: '' }, finalTotal: 0 };
    if (!uiState.activeCartChannel || activeCart.value.length === 0) return summary;
    summary.subtotal = activeCart.value.reduce((sum, item) => sum + (item.hargaJualAktual * item.qty), 0);
    summary.itemCount = activeCart.value.reduce((sum, item) => sum + item.qty, 0);
    summary.discount = calculateBestDiscount(activeCart.value, uiState.activeCartChannel);
    summary.finalTotal = summary.subtotal - summary.discount.totalDiscount;
    return summary;
});
const filteredGudangKain = computed(() => {
    let kainData = [...state.gudangKain];
    const searchTerm = uiState.gudangKainSearch.toLowerCase();

    if (searchTerm) {
        kainData = kainData.filter(kain => 
            kain.namaKain.toLowerCase().includes(searchTerm) ||
            kain.warna.toLowerCase().includes(searchTerm) ||
            kain.toko.toLowerCase().includes(searchTerm)
        );
    }

    kainData.sort((a, b) => {
        switch (uiState.gudangKainSort) {
            case 'nama-asc': return a.namaKain.localeCompare(b.namaKain);
            case 'nama-desc': return b.namaKain.localeCompare(a.namaKain);
            case 'stok-desc': return b.sisaYard - a.sisaYard;
            case 'stok-asc': return a.sisaYard - b.sisaYard;
            case 'tanggal-asc': return new Date(a.tanggalBeli) - new Date(b.tanggalBeli);
            case 'tanggal-desc': default: return new Date(b.tanggalBeli) - new Date(a.tanggalBeli);
        }
    });

    return kainData;
});
const inventoryProductGroups = computed(() => {
    const grouped = state.produk.reduce((acc, product) => {
        if (!acc[product.nama]) {
            acc[product.nama] = { 
                nama: product.nama, 
                variants: [], 
                totalStock: 0, 
                totalNilaiStok: 0,
                totalVariants: 0
            };
        }
        acc[product.nama].variants.push(product);
        acc[product.nama].totalStock += (product.stokFisik || 0);
        acc[product.nama].totalNilaiStok += (product.stokFisik || 0) * (parseInputNumber(product.hpp) || 0);
        return acc;
    }, {});
    
    let productGroups = Object.values(grouped);

    productGroups.forEach(group => {
        group.totalVariants = group.variants.length;
    });

    const searchTerm = (uiState.inventorySearch || '').toLowerCase();
    const stockFilter = uiState.inventoryFilterStock;
    const minStock = state.settings.minStok;

    productGroups = productGroups.filter(group => {
        const matchesSearch = (group.nama || '').toLowerCase().includes(searchTerm);
        if (!matchesSearch) return false;
        
        // Logika filter stok yang sudah diperbaiki
        if (stockFilter === 'all') return true;
        if (stockFilter === 'aman') return group.totalStock > minStock;
        if (stockFilter === 'menipis') return group.totalStock > 0 && group.totalStock <= minStock;
        if (stockFilter === 'habis') return group.totalStock === 0;
        return true; 
    });

    productGroups.sort((a, b) => {
        switch (uiState.inventorySort) {
            case 'nama-desc': return b.nama.localeCompare(a.nama);
            case 'stok-desc': return b.totalStock - a.totalStock;
            case 'stok-asc': return a.totalStock - b.totalStock;
            case 'nama-asc': default: return a.nama.localeCompare(b.nama);
        }
    });

    return productGroups;
});

const modalStockSummary = computed(() => {
    if (uiState.modalType !== 'kelolaStok' || !uiState.modalData.original) {
        return { teralokasi: 0, belumTeralokasi: 0 };
    }
    const { product } = uiState.modalData;
    const teralokasi = Object.values(product.stokAlokasi).reduce((sum, val) => sum + (val || 0), 0);
    const belumTeralokasi = (product.stokFisik || 0) - teralokasi;
    return { teralokasi, belumTeralokasi };
});

const laporanTotalBiayaMaklun = computed(() => {
    if (!uiState.laporanData.laporanPerStatus || uiState.laporanData.laporanPerStatus.length === 0) {
        return 0;
    }
    return uiState.laporanData.laporanPerStatus.reduce((total, batch) => {
        return total + (batch.totalHargaJasaMaklun || 0);
    }, 0);
});

const filteredPengeluaran = computed(() => {
    return filterDataByDate(
        state.biaya, 
        uiState.keuanganPengeluaranFilter, 
        uiState.keuanganPengeluaranStartDate, 
        uiState.keuanganPengeluaranEndDate,
        uiState.keuanganPengeluaranStartMonth,
        uiState.keuanganPengeluaranStartYear,
        uiState.keuanganPengeluaranEndMonth,
        uiState.keuanganPengeluaranEndYear
    ).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
});
const filteredPemasukan = computed(() => {
    return filterDataByDate(
        state.keuanganLain, 
        uiState.keuanganPemasukanFilter, 
        uiState.keuanganPemasukanStartDate, 
        uiState.keuanganPemasukanEndDate,
        uiState.keuanganPemasukanStartMonth,
        uiState.keuanganPemasukanStartYear,
        uiState.keuanganPemasukanEndMonth,
        uiState.keuanganPemasukanEndYear
    ).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
});
const filteredRetur = computed(() => {
    // 1. "Bongkar" data retur menjadi daftar item yang rata (flattened list)
    const flatReturItems = state.retur.flatMap(doc => 
        (doc.items || []).map(itemDetail => ({
            ...itemDetail, // sku, qty, alasan, tindakLanjut
            returnDocId: doc.id, // Simpan ID dokumen induknya
            tanggal: doc.tanggal,
            channelId: doc.channelId
        }))
    );

    // 2. Lakukan filter seperti biasa pada daftar yang sudah rata
    let returData = flatReturItems;
    const searchQuery = uiState.returPageSearchQuery.toLowerCase();
    if (searchQuery) {
        returData = returData.filter(item => {
            const product = getProductBySku(item.sku);
            const productName = product ? product.nama.toLowerCase() : '';
            return (
                item.sku.toLowerCase().includes(searchQuery) ||
                (item.alasan && item.alasan.toLowerCase().includes(searchQuery)) ||
                productName.includes(searchQuery)
            );
        });
    }

    returData = filterDataByDate(
        returData, 
        uiState.returPageDateFilter, 
        uiState.returPageStartDate, 
        uiState.returPageEndDate,
        uiState.returPageStartMonth,
        uiState.returPageStartYear,
        uiState.returPageEndMonth,
        uiState.returPageEndYear
    );

    return returData.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
});

const filteredMarketplaces = computed(() => {
    const query = uiState.pengaturanMarketplaceSearch.toLowerCase();
    if (!query) {
        return state.settings.marketplaces;
    }
    return state.settings.marketplaces.filter(mp => 
        (mp.name || '').toLowerCase().includes(query)
    );
});

const filteredModelBaju = computed(() => {
    const query = uiState.pengaturanModelBajuSearch.toLowerCase();
    if (!query) {
        return state.settings.modelBaju;
    }
    return state.settings.modelBaju.filter(model => 
        // TAMBAHKAN (model.namaModel || '')
        // Ini berarti: "gunakan model.namaModel, TAPI jika tidak ada, gunakan string kosong ''"
        (model.namaModel || '').toLowerCase().includes(query)
    );
});



const filteredProduksiBatches = computed(() => {
    if (!state.produksi) return [];
    return state.produksi.filter(batch => {
        const searchTerm = uiState.produksiSearch.toLowerCase();
        const statusFilter = uiState.produksiFilterStatus;

        const matchesStatus = statusFilter === 'all' || batch.statusProses === statusFilter;

        // Logika pencarian yang diperbarui
        // 1. Mencari di ID Batch atau Nama Pemaklun
        // 2. Mencari di dalam setiap item kainBahan (idUnik, namaKain, warnaKain, ukuran)
        const matchesSearch = 
            (batch.id || '').toLowerCase().includes(searchTerm) || 
            (batch.namaPemaklun && batch.namaPemaklun.toLowerCase().includes(searchTerm)) ||
            (batch.kainBahan || []).some(item => 
                (item.idUnik || '').toLowerCase().includes(searchTerm) ||
                (item.namaKain || '').toLowerCase().includes(searchTerm) ||
                (item.warnaKain || '').toLowerCase().includes(searchTerm) ||
                (item.ukuran || '').toLowerCase().includes(searchTerm)
            );

        return matchesStatus && matchesSearch;
    });
});

const hargaHppProductNames = computed(() => {
    return [...new Set(state.produk.map(p => p.nama))];
});

const hargaHppFilteredVariants = computed(() => {
    if (!uiState.hargaHppSelectedProduct) {
        return [];
    }
    return state.produk.filter(p => p.nama === uiState.hargaHppSelectedProduct);
});



const ringkasanJadiData = computed(() => {
    const summary = {};
    const filteredBatches = state.produksi.filter(batch => {
        if (uiState.ringkasanStatusSelected === 'all') return true;
        return batch.statusProses === uiState.ringkasanStatusSelected;
    });
    filteredBatches.forEach(batch => {
        (batch.kainBahan || []).forEach(kb => {
            if (kb.aktualJadi > 0) {
                const modelName = state.settings.modelBaju.find(m => m.id === kb.modelBajuId)?.namaModel || 'N/A';
                const key = `${batch.tanggal}|${batch.namaPemaklun}|${modelName}|${kb.namaKain}|${kb.warnaKain}|${kb.ukuran}`;
                if (!summary[key]) {
                    summary[key] = { tanggal: batch.tanggal, pemaklun: batch.namaPemaklun, model: modelName, kain: kb.namaKain, warna: kb.warnaKain, ukuran: kb.ukuran, total: 0 };
                }
                summary[key].total += kb.aktualJadi;
            }
        });
    });
    return Object.values(summary).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
});
const produksiDetailComputed = computed(() => {
    if (!uiState.modalData || !uiState.modalData.kainBahan) {
        return { ...uiState.modalData, totalAktualJadi: 0 };
    }
    const total = uiState.modalData.kainBahan.reduce((sum, item) => {
        return sum + (parseInt(item.aktualJadi, 10) || 0);
    }, 0);

    return {
        ...uiState.modalData,
        totalAktualJadi: total
    };
});
const laporanSemuanyaData = computed(() => {
    const semuaItemProduksi = state.produksi.flatMap(batch => 
        (batch.kainBahan || []).map(kain => ({
            ...kain, // <-- Baris ini menyalin SEMUA properti, termasuk 'aktualJadiKombinasi'
            batchId: batch.id,
            tanggal: batch.tanggal,
            namaPemaklun: batch.namaPemaklun,
            statusProses: batch.statusProses,
        }))
    );

     const filteredData = filterDataByDate(
        semuaItemProduksi, 
        uiState.laporanSemuaFilter, 
        uiState.laporanSemuaStartDate, 
        uiState.laporanSemuaEndDate, 
        uiState.laporanSemuaStartMonth,
        uiState.laporanSemuaStartYear,
        uiState.laporanSemuaEndMonth,
        uiState.laporanSemuaEndYear
    );

    const tableData = filteredData.map(item => {
        const modelInfo = state.settings.modelBaju.find(m => m.id === item.modelBajuId) || {};
        const totalBiayaKain = (item.totalYard || 0) * (item.hargaKainPerYard || 0);
        const totalBiayaMaklun = (item.aktualJadi || 0) * (item.hargaMaklunPerPcs || 0);
        const totalBiayaAlat = item.biayaAlat || 0;
        const totalBiayaProduksi = totalBiayaKain + totalBiayaMaklun + totalBiayaAlat;
        
        return {
            ...item, // <-- Baris ini memastikan SEMUA properti diteruskan ke tabel
            modelNama: modelInfo.namaModel || 'N/A',
            totalBiayaKain,
            totalBiayaMaklun,
            totalBiayaAlat,
            totalBiayaProduksi,
            totalKuantitas: (item.aktualJadi || 0) + (item.aktualJadiKombinasi || 0),
        };
    }).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

    return { tableData };
});

const laporanSemuaKpis = computed(() => {
    const tableData = laporanSemuanyaData.value.tableData;
    if (!tableData || tableData.length === 0) {
        return { totalBajuSelesai: 0, totalBiaya: 0, avgHpp: 0, totalBatch: 0 };
    }

    // =================================================================
    // INI BAGIAN KUNCI YANG DIPERBAIKI:
    // Secara eksplisit HANYA menjumlahkan nilai dari `item.aktualJadi`
    // =================================================================
    const totalBajuSelesai = tableData.reduce((sum, item) => sum + (item.aktualJadi || 0), 0);
    
    const totalBiaya = tableData.reduce((sum, item) => sum + item.totalBiayaProduksi, 0);
    const avgHpp = totalBajuSelesai > 0 ? totalBiaya / totalBajuSelesai : 0;
    const totalBatch = new Set(tableData.map(item => item.batchId)).size;

    return { totalBajuSelesai, totalBiaya, avgHpp, totalBatch };
});
const analisisModelData = computed(() => {
    const dataPerKain = state.produksi.flatMap(batch => 
        (batch.kainBahan || []).map(kain => ({
            ...kain,
            batchId: batch.id,
            tanggal: batch.tanggal,
            namaPemaklun: batch.namaPemaklun,
            statusProses: batch.statusProses,
        }))
    );

    let filteredData = dataPerKain.filter(item => {
        // Logika filter baru
        if (uiState.analisisModelFilter === 'model') {
            return item.modelBajuId === uiState.analisisModelSelectedModel;
        }
        // Jika filter belum dipilih atau ingin melihat semua, tampilkan semua
        return true;
    });

    const processedData = filteredData.map(item => {
        const modelInfo = state.settings.modelBaju.find(m => m.id === item.modelBajuId) || {};
        const totalBiayaKain = (item.totalYard || 0) * (item.hargaKainPerYard || 0);
        const yardStandar = modelInfo.yardPerBaju || 1;
        
        const targetQty = Math.floor((item.totalYard || 0) / yardStandar);

        let aktualFinal = 0;
        let totalBiayaMaklun = 0;
        let totalBiayaAlat = 0;
        
        // Tentukan nilai aktual berdasarkan filter yang dipilih
        if (uiState.analisisModelSelectedType === 'aktualJadi' && item.aktualJadi > 0) {
            aktualFinal = (item.aktualJadi || 0);
            totalBiayaMaklun = aktualFinal * (item.hargaMaklunPerPcs || 0);
            totalBiayaAlat = (item.biayaAlat || 0);
        } else if (uiState.analisisModelSelectedType === 'aktualJadiKombinasi' && item.aktualJadiKombinasi > 0) {
            aktualFinal = (item.aktualJadiKombinasi || 0);
            totalBiayaMaklun = 0;
            totalBiayaAlat = 0;
        }

        // Hindari pembagian dengan nol
        const selisih = aktualFinal - targetQty;
        const totalBiayaProduksi = totalBiayaKain + totalBiayaMaklun + totalBiayaAlat;
        const hpp = totalBiayaProduksi / (aktualFinal || 1);

        return {
            ...item,
            modelNama: modelInfo.namaModel || 'N/A',
            targetQty: targetQty,
            aktualFinal: aktualFinal,
            selisih: selisih,
            hpp: hpp,
        };
    }).filter(item => item.aktualFinal > 0); // Filter untuk hanya menampilkan yang ada hasilnya

    // Urutkan berdasarkan selisih dari yang terendah ke tertinggi (kerugian terbesar di atas)
    return processedData.sort((a, b) => a.selisih - b.selisih);
});
const kpiExplanations = {
    'saldo-kas': { title: 'Saldo Kas Saat Ini', formula: 'Omset Bersih - Biaya Operasional - Ambilan Pribadi + Modal Masuk', description: 'Estimasi uang tunai yang tersedia.' },
    'omset': { title: 'Omset Bersih', formula: 'Total Penjualan dari Semua Transaksi', description: 'Total pendapatan kotor dari penjualan.' },
    'laba-kotor': { title: 'Laba Kotor', formula: 'Omset Bersih - Total HPP Barang Terjual', description: 'Keuntungan sebelum dikurangi biaya operasional.' },
    'laba-bersih': { title: 'Laba Bersih (Est.)', formula: 'Laba Kotor - Biaya Operasional - Biaya Transaksi', description: 'Estimasi keuntungan bersih.' },
    'biaya-operasional': { title: 'Biaya Operasional', formula: 'Jumlah semua item di Riwayat Pengeluaran', description: 'Total semua biaya operasional.' },
    'total-stok': { title: 'Total Unit Stok', formula: 'Jumlah Stok Akhir dari Semua Produk', description: 'Jumlah total unit di inventaris.' },
    'nilai-stok': { title: 'Total Nilai Stok (HPP)', formula: 'Jumlah (Stok Akhir Produk x HPP Produk)', description: 'Total nilai moneter dari semua stok.' },
    'nilai-retur': { title: 'Total Nilai Retur', formula: 'Jumlah (Qty Retur x Harga Jual Produk)', description: 'Total nilai dari produk yang dikembalikan.' }
};

function showKpiHelp(kpiKey) { 
    const helpData = kpiExplanations[kpiKey]; 
    if (helpData) showModal('kpiHelp', helpData); 
}
// --- METHODS ---
async function saveData() {
    if (!currentUser.value) return alert("Anda harus login untuk menyimpan data.");
    isSaving.value = true;
    try {
        const userId = currentUser.value.uid;
        const batch = writeBatch(db);

        // Bagian 1: Simpan semua pengaturan ke dalam satu dokumen per pengguna
        const settingsRef = doc(db, "settings", userId);
        const settingsData = {
            brandName: state.settings.brandName,
            minStok: state.settings.minStok,
            marketplaces: JSON.parse(JSON.stringify(state.settings.marketplaces)),
            modelBaju: JSON.parse(JSON.stringify(state.settings.modelBaju)),
            userId: userId
        };
        batch.set(settingsRef, settingsData);

        // Bagian 2: Simpan promosi
        const promotionsRef = doc(db, "promotions", userId);
        const promotionsData = {
            perChannel: JSON.parse(JSON.stringify(state.promotions.perChannel)),
            perModel: JSON.parse(JSON.stringify(state.promotions.perModel)),
            userId: userId
        };
        batch.set(promotionsRef, promotionsData);

        // Bagian 3: Simpan HPP & Harga Jual
        for (const product of state.produk) {
            const productRef = doc(db, "products", product.sku);
            batch.update(productRef, { hpp: product.hpp });
            for (const marketplaceId in product.hargaJual) {
                const priceDocId = `${product.sku}-${marketplaceId}`;
                const priceRef = doc(db, "product_prices", priceDocId);
                batch.set(priceRef, {
                    product_sku: product.sku,
                    marketplace_id: marketplaceId,
                    price: product.hargaJual[marketplaceId] || 0,
                    userId: userId
                });
            }
        }

        await batch.commit();
        console.log('Perubahan berhasil disimpan ke Firebase!');
        alert('Pengaturan promosi berhasil disimpan!');
    } catch (error) {
        console.error("Gagal menyimpan data ke Firebase:", error);
        alert("Gagal menyimpan data.");
    } finally {
        isSaving.value = false;
    }
}
async function saveGeneralSettings() {
    if (!currentUser.value) return alert("Anda harus login untuk menyimpan pengaturan.");
    
    isSavingSettings.value = true;
    try {
        const userId = currentUser.value.uid;
        // Simpan ke dokumen yang namanya adalah ID pengguna
        const settingsRef = doc(db, "settings", userId); 

        const dataToUpdate = {
            brandName: state.settings.brandName,
            minStok: state.settings.minStok,
            userId: userId // Selalu pastikan ada userId
        };

        // Gunakan setDoc dengan merge:true agar membuat dokumen jika belum ada
        await setDoc(settingsRef, dataToUpdate, { merge: true });
        alert('Pengaturan umum berhasil disimpan ke database!');

    } catch (error) {
        console.error("Gagal menyimpan pengaturan umum:", error);
        alert("Gagal menyimpan pengaturan umum.");
    } finally {
        isSavingSettings.value = false;
    }
}
function changePage(pageName) { activePage.value = pageName; }

function showModal(type, data = {}) {
    // Logika utama untuk menampilkan modal
    uiState.isModalVisible = true;
    uiState.modalType = type;
    uiState.modalData = data;

    if (type === 'addProduksi') {
        if (!state.settings.modelBaju || state.settings.modelBaju.length === 0) {
            alert("Data 'Model Baju' belum selesai dimuat. Coba lagi sesaat.");
            hideModal();
            return;
        }
        setupNewProduksiBatch();
    } else if (type === 'editProduksi') {
        setupEditProduksiBatch(data);
    } else if (type === 'panduanProduksi' || type === 'panduanPromosi') {
        // Logika untuk modal panduan, tidak perlu setup data khusus
        // Modal utama akan tetap terbuka di belakang
        return;
    }
    
    // Untuk Edit Retur
    if (type === 'editRetur') {
        uiState.modalData = {
            ...data,
            tanggal: new Date(data.tanggal).toISOString().split('T')[0],
        };
    }
}

// Tambahkan fungsi baru ini di bawah showModal
function showNestedModal(type, data = {}) {
    // Fungsi ini khusus untuk modal yang muncul di atas modal lain
    uiState.nestedModalType = type;
    uiState.nestedModalData = data;
}

function hideNestedModal() {
    uiState.nestedModalType = null;
    uiState.nestedModalData = {};
}
async function submitKain(isEditing = false) {
    if (!currentUser.value) {
        return alert("Anda harus login untuk mengelola stok kain.");
    }

    const form = uiState.modalData;
    if (!form.namaKain || !form.warna || !form.sisaYard || !form.hargaBeliPerYard) {
        alert('Nama Kain, Warna, Sisa Yard, dan Harga Beli wajib diisi.');
        return;
    }

    const dataToSave = {
        ...form,
        tanggalBeli: new Date(form.tanggalBeli)
    };
    
    try {
        if (isEditing) {
            // Logika EDIT tidak perlu userId karena dokumen sudah ada
            const kainRef = doc(db, "fabric_stock", dataToSave.id);
            const updateData = { ...dataToSave };
            delete updateData.id;
            
            await updateDoc(kainRef, updateData);

            const index = state.gudangKain.findIndex(k => k.id === form.id);
            if (index !== -1) {
                state.gudangKain[index] = dataToSave;
            }
            alert('Data kain berhasil diperbarui!');
        } else {
            // Logika TAMBAH BARU
            dataToSave.userId = currentUser.value.uid; // <-- TAMBAHKAN userId DI SINI
            const collectionRef = collection(db, "fabric_stock");
            const newDocRef = await addDoc(collectionRef, dataToSave);

            state.gudangKain.unshift({ ...dataToSave, id: newDocRef.id });
            alert('Stok kain baru berhasil ditambahkan!');
        }
        hideModal();
    } catch (error) {
        console.error("Error menyimpan data kain:", error);
        alert("Gagal menyimpan data kain ke database.");
    }
}

async function deleteKain(kainId) {
    if (confirm(`Anda yakin ingin menghapus data kain dengan ID: ${kainId}? Stok akan hilang permanen.`)) {
        try {
            await deleteDoc(doc(db, "fabric_stock", kainId));
            
            // Update UI setelah berhasil dihapus dari Firebase
            state.gudangKain = state.gudangKain.filter(k => k.id !== kainId);
            alert('Data kain berhasil dihapus.');

        } catch (error) {
            console.error("Error menghapus data kain:", error);
            alert("Gagal menghapus data kain dari database.");
        }
    }
}
function exportLaporanSemuaToExcel() {
    const dataToExport = laporanSemuanyaData.value.tableData.map(item => ({
        "Tanggal": new Date(item.tanggal),
        "Pemaklun": item.namaPemaklun,
        "Model Baju": item.modelNama,
        "Status": item.statusProses,
        "Nama Kain": item.namaKain,
        "Warna": item.warnaKain,
        "Ukuran": item.ukuran,
        "Qty Jadi (Pcs)": item.aktualJadi,
        "Qty Kombinasi (Pcs)": item.aktualJadiKombinasi,
        "Biaya Kain (Rp)": item.totalBiayaKain,
        "Biaya Maklun (Rp)": item.totalBiayaMaklun,
        "Biaya Alat (Rp)": item.totalBiayaAlat,
        "Total Biaya (Rp)": item.totalBiayaProduksi,
    }));
    if (dataToExport.length === 0) { alert("Tidak ada data untuk diekspor."); return; }
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Produksi");
    worksheet["!cols"] = Array(13).fill({ wch: 20 });
    XLSX.writeFile(workbook, `Laporan_Produksi_Menyeluruh_${new Date().toISOString().split('T')[0]}.xlsx`);
}
function hideModal() { uiState.isModalVisible = false; }

let posSearchDebounceTimer;
function handlePosSearch() {
    clearTimeout(posSearchDebounceTimer);
    posSearchDebounceTimer = setTimeout(() => {
        const query = uiState.posSearchQuery.trim();
        if (!query) { uiState.posSearchRecommendations = []; return; }
        const exactMatch = getProductBySku(query);
        if (exactMatch) {
            addProductToCart(exactMatch);
            uiState.posSearchQuery = '';
            uiState.posSearchRecommendations = [];
        } else {
            const lowerQuery = query.toLowerCase();
            uiState.posSearchRecommendations = state.produk.filter(p => `${p.sku} ${p.nama}`.toLowerCase().includes(lowerQuery)).slice(0, 10);
        }
    }, 300);
}

function selectRecommendation(product) { addProductToCart(product); uiState.posSearchQuery = ''; uiState.posSearchRecommendations = []; }
function addProductToCart(product, qty = 1) {
    if (!uiState.activeCartChannel) { alert("Pilih channel penjualan."); return; }
    const cart = state.carts[uiState.activeCartChannel];
    const existingItem = cart.find(item => item.sku === product.sku);
    const specialPrice = state.specialPrices[uiState.activeCartChannel]?.[product.sku];
    const regularPrice = product.hargaJual?.[uiState.activeCartChannel] ?? Object.values(product.hargaJual)[0] ?? 0;
    const finalPrice = specialPrice !== undefined ? specialPrice : regularPrice;
    if (existingItem) {
        existingItem.qty += qty;
        existingItem.hargaJualAktual = finalPrice;
    } else {
        cart.push({ ...product, qty, hargaJualAktual: finalPrice });
    }
}
function updateCartItemQty(sku, delta) {
    const item = activeCart.value.find(i => i.sku === sku);
    if (item) {
        item.qty += delta;
        if (item.qty <= 0) removeFromCart(sku);
    }
}
function removeFromCart(sku) {
    const itemIndex = activeCart.value.findIndex(i => i.sku === sku);
    if (itemIndex > -1) activeCart.value.splice(itemIndex, 1);
}
function confirmCompleteTransaction() { showModal('confirmTransaction', { channelName: getMarketplaceById(uiState.activeCartChannel).name, ...cartSummary.value }); }
async function executeCompleteTransaction() {
    if (!currentUser.value) {
        return alert("Anda harus login untuk menyelesaikan transaksi.");
    }

    const marketplace = getMarketplaceById(uiState.activeCartChannel);
    const summary = cartSummary.value;

    if (!marketplace || activeCart.value.length === 0) {
        alert("Keranjang kosong atau channel penjualan tidak valid.");
        return;
    }

    // Kalkulasi biaya yang lebih detail
    const biaya = {
        adm: (marketplace.adm / 100) * summary.finalTotal,
        program: (marketplace.program / 100) * summary.finalTotal,
        layanan: (marketplace.layanan / 100) * summary.finalTotal,
        komisi: (marketplace.komisi / 100) * summary.finalTotal,
        voucher: (marketplace.voucher / 100) * summary.finalTotal,
        perPesanan: marketplace.perPesanan || 0,
    };
    biaya.total = Object.values(biaya).reduce((sum, val) => sum + val, 0);

    // Siapkan objek data transaksi yang akan disimpan
    const newTransactionData = {
        tanggal: new Date(),
        items: activeCart.value.map(i => ({ sku: i.sku, qty: i.qty, hargaJual: i.hargaJualAktual, hpp: i.hpp })),
        subtotal: summary.subtotal,
        diskon: summary.discount,
        total: summary.finalTotal,
        channel: marketplace.name,
        channelId: marketplace.id,
        biaya: biaya,
        // --- BARIS BARU DITAMBAHKAN DI SINI ---
        userId: currentUser.value.uid
    };

    try {
        const batch = writeBatch(db);
        const transactionRef = doc(collection(db, "transactions"));
        batch.set(transactionRef, newTransactionData);

        for (const item of activeCart.value) {
            const productRef = doc(db, "products", item.sku);
            const newStock = (item.stokFisik || 0) - item.qty;
            
            if (newStock < 0) {
                alert(`Stok untuk produk ${item.nama} (${item.sku}) tidak mencukupi! Transaksi dibatalkan.`);
                throw new Error("Stok tidak cukup");
            }
            
            batch.update(productRef, { physical_stock: newStock });
        }

        await batch.commit();

        const finalTransactionForUI = { ...newTransactionData, id: transactionRef.id, tanggal: newTransactionData.tanggal.toISOString().split('T')[0] };
        state.transaksi.unshift(finalTransactionForUI);
        
        activeCart.value.forEach(item => {
            const productInState = getProductBySku(item.sku);
            if (productInState) {
                productInState.stokFisik -= item.qty;
            }
        });
        
        state.carts[uiState.activeCartChannel] = [];
        hideModal();
        alert("Transaksi berhasil disimpan ke Firebase!");

    } catch (error) {
        console.error("Error saat menyimpan transaksi:", error);
        alert(`Gagal menyimpan transaksi: ${error.message}`);
    }
}
function calculateBestDiscount(cart, channelId) {
    if (!cart || cart.length === 0) return { totalDiscount: 0, description: '' };

    const promotions = [];
    const cartSubtotal = cart.reduce((sum, item) => sum + (item.hargaJualAktual * item.qty), 0);

    // 1. Kumpulkan semua promosi per-channel (Voucher Ikuti Toko, dll)
    const channelPromos = state.promotions.perChannel[channelId] || {};
    if (channelPromos.voucherToko > 0) {
        promotions.push({
            totalDiscount: (channelPromos.voucherToko / 100) * cartSubtotal,
            description: `Voucher Ikuti Toko (${channelPromos.voucherToko}%)`
        });
    }

    // 2. Kumpulkan semua promosi per-model produk
    const allModelPromos = state.promotions.perModel || {};
    const itemsByModel = cart.reduce((acc, item) => {
        if (!acc[item.nama]) {
            acc[item.nama] = { subtotal: 0, qty: 0 };
        }
        acc[item.nama].subtotal += item.hargaJualAktual * item.qty;
        acc[item.nama].qty += item.qty;
        return acc;
    }, {});

    for (const modelName in itemsByModel) {
        const modelData = itemsByModel[modelName];
        const modelPromosForChannel = (allModelPromos[modelName] || {})[channelId] || {};

        if (modelPromosForChannel.voucherProduk > 0) {
            promotions.push({
                totalDiscount: (modelPromosForChannel.voucherProduk / 100) * modelData.subtotal,
                description: `Voucher ${modelName} (${modelPromosForChannel.voucherProduk}%)`
            });
        }

        if (modelPromosForChannel.diskonBertingkat && modelPromosForChannel.diskonBertingkat.length > 0) {
            // Urutkan tingkatan dari yang paling besar minimal belanjanya
            const sortedTiers = [...modelPromosForChannel.diskonBertingkat].sort((a, b) => b.min - a.min);
            for (const tier of sortedTiers) {
                if (modelData.subtotal >= tier.min) {
                    promotions.push({
                        totalDiscount: (tier.diskon / 100) * modelData.subtotal,
                        description: `Diskon ${modelName} ${tier.diskon}%`
                    });
                    break; // Hanya ambil tingkatan terbaik yang tercapai
                }
            }
        }
    }

    // 3. Cari promosi terbaik dari semua yang terkumpul
    if (promotions.length === 0) {
        return { totalDiscount: 0, description: '' };
    }

    return promotions.reduce((best, current) => {
        return current.totalDiscount > best.totalDiscount ? current : best;
    }, { totalDiscount: 0, description: '' });
}
function renderCharts() {
    if (profitExpenseChart) profitExpenseChart.destroy();
    if (salesChannelChart) salesChannelChart.destroy();
    const { transaksi, biaya } = dashboardFilteredData.value;
    const ctxProfit = document.getElementById('profitExpenseChart')?.getContext('2d');
    const ctxSales = document.getElementById('salesChannelChart')?.getContext('2d');
    if (!ctxProfit || !ctxSales) return;
    const dates = [...new Set([...transaksi.map(t => new Date(t.tanggal).toDateString()), ...biaya.map(b => new Date(b.tanggal).toDateString())])].sort((a,b) => new Date(a) - new Date(b));
    const profitData = dates.map(d => transaksi.filter(t => new Date(t.tanggal).toDateString() === d).reduce((s,t) => s + (t.total - t.items.reduce((ts,i)=>ts+i.hpp*i.qty,0)), 0));
    const expenseData = dates.map(d => biaya.filter(b => new Date(b.tanggal).toDateString() === d).reduce((s,b) => s + b.jumlah, 0));
    profitExpenseChart = new Chart(ctxProfit, { type: 'line', data: { labels: dates, datasets: [{ label: 'Laba Kotor', data: profitData, borderColor: '#4f46e5', fill: true }, { label: 'Biaya Operasional', data: expenseData, borderColor: '#ef4444', fill: true }] }, options: { responsive: true, maintainAspectRatio: false } });
    const salesByChannel = transaksi.reduce((acc, trx) => { acc[trx.channel] = (acc[trx.channel] || 0) + trx.total; return acc; }, {});
    salesChannelChart = new Chart(ctxSales, { type: 'doughnut', data: { labels: Object.keys(salesByChannel), datasets: [{ data: Object.values(salesByChannel), backgroundColor: ['#4f46e5', '#3b82f6', '#10b981', '#f97316', '#ef4444'] }] }, options: { responsive: true, maintainAspectRatio: false } });
}

function exportTransactionsToExcel() {
    const dataToExport = filteredTransaksi.value.flatMap(trx => trx.items.map(item => {
        const product = getProductBySku(item.sku) || {};
        return {
            "ID Pesanan": trx.id, "Tanggal": new Date(trx.tanggal), "Channel": trx.channel, "SKU": item.sku,
            "Nama Produk": product.nama || 'N/A', "Qty": item.qty, "Harga Satuan": item.hargaJual,
        };
    }));
    if (dataToExport.length === 0) { alert("Tidak ada data untuk diekspor."); return; }
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transaksi");
    worksheet["!cols"] = [ { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 8 }, { wch: 15 }];
    XLSX.writeFile(workbook, `Laporan_Transaksi_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function addPromotionTier(modelName, channelId) {
    if (!state.promotions.perModel[modelName]) state.promotions.perModel[modelName] = {};
    if (!state.promotions.perModel[modelName][channelId]) state.promotions.perModel[modelName][channelId] = {};
    if (!state.promotions.perModel[modelName][channelId].diskonBertingkat) state.promotions.perModel[modelName][channelId].diskonBertingkat = [];
    state.promotions.perModel[modelName][channelId].diskonBertingkat.push({ min: 0, diskon: 0 });
}
function removePromotionTier(modelName, channelId, tierIndex) {
    if (state.promotions.perModel[modelName]?.[channelId]?.diskonBertingkat) {
        state.promotions.perModel[modelName][channelId].diskonBertingkat.splice(tierIndex, 1);
    }
}
function setupNewProduksiBatch() {
    uiState.newProduksiBatch = reactive({
        tanggal: new Date().toISOString().split('T')[0],
        namaPemaklun: '',
        statusProses: 'Dalam Proses',
        kainBahan: [{
            idUnik: generateUniqueCode(), // <-- BARIS BARU: Tambahkan kode unik
            modelBajuId: '',
            namaKain: '',
            tokoKain: '',
            warnaKain: '',
            ukuran: '',
            totalYard: null,
            hargaKainPerYard: null,
            yardPerBaju: null,
            aktualJadi: null,
            aktualJadiLabelType: 'Aktual Jadi',
            hargaMaklunPerPcs: null,
        }],
        statusPembayaran: 'Belum Dibayar',
        jumlahPembayaran: null,
        tanggalPembayaran: '',
        catatan: '',
        orangMemproses: '',
    });
}

async function submitNewProduksiBatch() {
    if (!currentUser.value) {
        return alert("Anda harus login untuk membuat batch produksi.");
    }

    const newBatchData = JSON.parse(JSON.stringify(uiState.newProduksiBatch));
    let totalQty = 0;
    let totalBiayaMaterial = 0;
    let totalHargaJasaMaklun = 0;

    (newBatchData.kainBahan || []).forEach(item => {
        totalBiayaMaterial += (item.totalYard || 0) * (item.hargaKainPerYard || 0);
        totalQty += (item.aktualJadi || 0);
        totalHargaJasaMaklun += (item.aktualJadi || 0) * (item.hargaMaklunPerPcs || 0);
    });

    const batchId = `PROD-${Date.now()}`;
    const finalBatchForState = {
        ...newBatchData,
        id: batchId,
        totalQty,
        totalBiayaMaterial,
        totalHargaJasaMaklun,
    };
    
    const dataToSave = { ...finalBatchForState };
    delete dataToSave.id;
    dataToSave.tanggal = new Date(dataToSave.tanggal);
    // --- BARIS BARU DITAMBAHKAN DI SINI ---
    dataToSave.userId = currentUser.value.uid;

    try {
        const batchRef = doc(db, "production_batches", batchId);
        await setDoc(batchRef, dataToSave);

        state.produksi.unshift(finalBatchForState);
        hideModal();
        alert('Batch produksi baru berhasil disimpan ke Firebase!');

    } catch (error) {
        console.error("Error menyimpan batch produksi baru:", error);
        alert("Gagal menyimpan batch produksi baru. Cek console.");
    }
}

function setupEditProduksiBatch(batch) {
    // Buat salinan data batch agar data asli di state tidak ikut berubah sebelum disimpan
    const dataForModal = JSON.parse(JSON.stringify(batch));

    // Periksa setiap item dan tambahkan idUnik jika belum ada
    if (dataForModal.kainBahan && Array.isArray(dataForModal.kainBahan)) {
        dataForModal.kainBahan = dataForModal.kainBahan.map(item => {
            if (!item.idUnik) {
                item.idUnik = generateUniqueCode(); // Panggil fungsi untuk membuat kode unik
            }
            return item;
        });
    }

    // Konversi objek Date ke format string YYYY-MM-DD
    if (dataForModal.tanggal) {
        dataForModal.tanggal = new Date(dataForModal.tanggal).toISOString().split('T')[0];
    }
    if (dataForModal.tanggalPembayaran) {
        dataForModal.tanggalPembayaran = new Date(dataForModal.tanggalPembayaran).toISOString().split('T')[0];
    }

    uiState.editProduksiBatch = reactive(dataForModal);
}
async function submitEditProduksiBatch() {
    const editedBatchData = JSON.parse(JSON.stringify(uiState.editProduksiBatch));
    let totalQty = 0;
    let totalBiayaMaterial = 0;
    let totalHargaJasaMaklun = 0;

    (editedBatchData.kainBahan || []).forEach(item => {
        totalBiayaMaterial += (item.totalYard || 0) * (item.hargaKainPerYard || 0);
        
        // =========================================================================
        // PERUBAHAN DI SINI: Hanya menjumlahkan 'aktualJadi'
        // =========================================================================
        totalQty += (parseInt(item.aktualJadi, 10) || 0);
        
        totalHargaJasaMaklun += (parseInt(item.aktualJadi, 10) || 0) * (item.hargaMaklunPerPcs || 0);
    });
    
    const finalBatch = { ...editedBatchData, totalQty, totalBiayaMaterial, totalHargaJasaMaklun };
    
    const dataToUpdate = { ...finalBatch };
    delete dataToUpdate.id;
    dataToUpdate.tanggal = new Date(dataToUpdate.tanggal);
    if (dataToUpdate.tanggalPembayaran) {
        dataToUpdate.tanggalPembayaran = new Date(dataToUpdate.tanggalPembayaran);
    }
    
    try {
        const batchRef = doc(db, "production_batches", finalBatch.id);
        await updateDoc(batchRef, dataToUpdate);

        const index = state.produksi.findIndex(b => b.id === finalBatch.id);
        if (index !== -1) {
            state.produksi.splice(index, 1, finalBatch);
        }
        
        hideModal();
        alert("Batch produksi berhasil diperbarui di Database.");

    } catch(error) {
        console.error("Error mengupdate batch produksi:", error);
        alert("Gagal memperbarui data di database.");
    }
}
function calculateRowSummary(item) {
    const modelInfo = state.settings.modelBaju.find(m => m.id === item.modelBajuId) || {};
    const totalBiayaKain = (item.totalYard || 0) * (item.hargaKainPerYard || 0);
    const yardStandar = modelInfo.yardPerBaju || 1;

    // 1. Target Qty sekarang SELALU dihitung dari awal
    const targetQty = Math.floor((item.totalYard || 0) / yardStandar);
    
    let aktualFinal = 0;
    let totalBiayaMaklun = 0;
    let totalBiayaAlat = 0;
    
    // 2. Tentukan data mana yang akan dipakai
    if (item.aktualJadi && item.aktualJadi > 0) {
        // Jika 'Aktual Jadi' yang diisi, gunakan data ini
        aktualFinal = (item.aktualJadi || 0);
        totalBiayaMaklun = aktualFinal * (item.hargaMaklunPerPcs || 0);
        totalBiayaAlat = (item.biayaAlat || 0);
    } else if (item.aktualJadiKombinasi && item.aktualJadiKombinasi > 0) {
        // Jika 'Aktual Jadi Kombinasi' yang diisi, gunakan data ini
        aktualFinal = (item.aktualJadiKombinasi || 0);
        // Penting: Biaya Maklun dan Alat untuk item kombinasi dianggap 0,
        // karena biaya sudah dihitung di item utama
        totalBiayaMaklun = 0; 
        totalBiayaAlat = 0;
    }

    // 3. Kalkulasi Selisih dan HPP menggunakan nilai akhir yang sudah dipilih
    const selisih = aktualFinal - targetQty;
    const totalBiayaProduksi = totalBiayaKain + totalBiayaMaklun + totalBiayaAlat;
    const hpp = totalBiayaProduksi / (aktualFinal || 1);

    return {
        targetQty,
        selisih,
        totalBiayaKain,
        totalBiayaMaklun,
        totalBiayaAlat,
        hpp
    };
}
async function deleteProduksiBatch(batchId) {
    if (confirm(`Anda yakin ingin menghapus batch produksi ID: ${batchId}?`)) {
        try {
            // Membuat referensi ke dokumen yang akan dihapus
            const batchRef = doc(db, "production_batches", batchId);
            
            // Menghapus dokumen dari Firestore
            await deleteDoc(batchRef);

            // Menghapus data dari state lokal untuk update UI instan
            state.produksi = state.produksi.filter(b => b.id !== batchId);
            
            alert(`Batch produksi ID: ${batchId} berhasil dihapus.`);
            
        } catch (error) {
            console.error("Error menghapus batch produksi:", error);
            alert("Gagal menghapus data dari database.");
        }
    }
}
function handleStockInSearch() {
    const query = uiState.modalData.sku.trim().toLowerCase();
    if (query.length < 2) {
        uiState.stockInSearchRecommendations = [];
        return;
    }
    uiState.stockInSearchRecommendations = state.produk.filter(p => 
        p.sku.toLowerCase().includes(query) ||
        p.nama.toLowerCase().includes(query)
    ).slice(0, 5); // Batasi hanya 5 rekomendasi
}

function selectStockInRecommendation(product) {
    uiState.modalData.sku = product.sku; // Isi input dengan SKU yang dipilih
    uiState.stockInSearchRecommendations = []; // Sembunyikan rekomendasi
}


function generateLaporanByStatus(status) {
    uiState.laporanData.statusTerpilih = status === 'all' ? 'Semua' : status;
    
    // KOMENTAR: Logika baru untuk menangani pilihan "Semua Status"
    if (status === 'all') {
        uiState.laporanData.laporanPerStatus = state.produksi;
    } else {
        uiState.laporanData.laporanPerStatus = state.produksi.filter(b => b.statusProses === status);
    }
    
    showModal('laporanStatusDetail');
}

function printProduksiDetail(batch) {
    const printContent = `
        <style>
            body { font-family: sans-serif; margin: 20px; } h3 { text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; } .total { font-weight: bold; }
        </style>
        <h3>Detail Batch Produksi: ${batch.id}</h3>
        <p><strong>Pemaklun:</strong> ${batch.namaPemaklun}</p>
        <p><strong>Tanggal:</strong> ${new Date(batch.tanggal).toLocaleDateString('id-ID')}</p>
        <p><strong>Status:</strong> ${batch.statusProses}</p>
        <h4>Detail Kain & Bahan</h4>
        <table><thead><tr><th>Nama Kain</th><th>Warna</th><th>Ukuran</th><th>Aktual Jadi</th></tr></thead>
            <tbody>
                ${(batch.kainBahan || []).map(kb => `<tr><td>${kb.namaKain || '-'}</td><td>${kb.warnaKain || '-'}</td><td>${kb.ukuran || '-'}</td><td>${kb.aktualJadi || 0} pcs</td></tr>`).join('')}
            </tbody>
        </table>
        <h4>Ringkasan Biaya</h4>
        <table><tbody>
            <tr><td>Total Kuantitas Jadi</td><td class="total">${batch.totalQty} pcs</td></tr>
            <tr><td>Total Biaya Material</td><td class="total">${formatCurrency(batch.totalBiayaMaterial)}</td></tr>
            <tr><td>Total Biaya Maklun</td><td class="total">${formatCurrency(batch.totalHargaJasaMaklun)}</td></tr>
        </tbody></table>
    `;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
}

function exportProduksiDetailToExcel(batch) {
    const dataForExcel = (batch.kainBahan || []).map(kb => {
        const modelName = state.settings.modelBaju.find(m => m.id === kb.modelBajuId)?.namaModel || 'N/A';
        return {
            "ID Batch": batch.id, "Tanggal Produksi": new Date(batch.tanggal), "Nama Pemaklun": batch.namaPemaklun,
            "Status Proses": batch.statusProses, "Nama Model Baju": modelName, "Nama Kain": kb.namaKain || '',
            "Aktual Jadi (Pcs)": kb.aktualJadi || 0, "Harga Maklun/Pcs": kb.hargaMaklunPerPcs || 0,
        };
    });
    if (dataForExcel.length === 0) { alert('Tidak ada detail kain untuk diexport.'); return; }
    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Detail ${batch.id}`);
    worksheet["!cols"] = [ { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 20 } ];
    XLSX.writeFile(workbook, `Detail_Produksi_${batch.id}.xlsx`);
}

function exportGroupedProduksiToExcel() {
    const status = uiState.laporanData.statusTerpilih;
    const data = uiState.laporanData.laporanPerStatus;
    if (data.length === 0) { alert(`Tidak ada data dengan status "${status}" untuk diekspor.`); return; }
    const dataForExcel = data.flatMap(batch => (batch.kainBahan || []).map(kb => {
        const modelName = state.settings.modelBaju.find(m => m.id === kb.modelBajuId)?.namaModel || 'N/A';
        return {
            "ID Batch": batch.id, "Tanggal Produksi": new Date(batch.tanggal), "Nama Pemaklun": batch.namaPemaklun,
            "Status Proses": batch.statusProses, "Nama Model Baju": modelName, "Nama Kain": kb.namaKain || '',
            "Aktual Jadi (Pcs)": kb.aktualJadi || 0, "Harga Maklun/Pcs": kb.hargaMaklunPerPcs || 0,
        };
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Laporan Produksi ${status}`);
    worksheet["!cols"] = [ { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 20 } ];
    XLSX.writeFile(workbook, `Laporan_Produksi_${status}_${new Date().toISOString().split('T')[0]}.xlsx`);
}
async function submitBiaya(isEditing = false) {
    if (!currentUser.value) {
        return alert("Anda harus login untuk mengelola biaya.");
    }
    const form = uiState.modalData;
    if (!form.kategori || !form.jumlah) {
        alert('Kategori dan Jumlah wajib diisi.');
        return;
    }

    const dataToSave = { ...form, tanggal: new Date(form.tanggal) };

    try {
        if (isEditing) {
            // Logika EDIT
            const expenseRef = doc(db, "expenses", dataToSave.id);
            const updateData = { ...dataToSave };
            delete updateData.id;
            await updateDoc(expenseRef, updateData);

            const index = state.biaya.findIndex(b => b.id === form.id);
            if (index !== -1) state.biaya[index] = dataToSave;
            alert('Data pengeluaran berhasil diperbarui.');
        } else {
            // Logika TAMBAH BARU
            dataToSave.userId = currentUser.value.uid; // <-- TAMBAHKAN userId DI SINI
            const collectionRef = collection(db, "expenses");
            const newDocRef = await addDoc(collectionRef, dataToSave);
            state.biaya.unshift({ ...dataToSave, id: newDocRef.id });
            alert('Pengeluaran baru berhasil dicatat.');
        }
        hideModal();
    } catch (error) {
        console.error("Error menyimpan biaya:", error);
        alert("Gagal menyimpan data pengeluaran.");
    }
}

async function deleteBiaya(id) {
    if (confirm('Anda yakin ingin menghapus data pengeluaran ini?')) {
        try {
            await deleteDoc(doc(db, "expenses", id));
            state.biaya = state.biaya.filter(b => b.id !== id);
            alert('Data pengeluaran berhasil dihapus.');
        } catch (error) {
            console.error("Error menghapus biaya:", error);
            alert("Gagal menghapus data pengeluaran.");
        }
    }
}

async function submitPemasukan(isEditing = false) {
    if (!currentUser.value) {
        return alert("Anda harus login untuk mengelola pemasukan.");
    }
    const form = uiState.modalData;
    if (!form.tipe || !form.jumlah) {
        alert('Tipe dan Jumlah wajib diisi.');
        return;
    }

    const dataToSave = { ...form, tanggal: new Date(form.tanggal) };

    try {
        if (isEditing) {
            // Logika EDIT
            const incomeRef = doc(db, "other_incomes", dataToSave.id);
            const updateData = { ...dataToSave };
            delete updateData.id;
            await updateDoc(incomeRef, updateData);

            const index = state.keuanganLain.findIndex(p => p.id === form.id);
            if (index !== -1) state.keuanganLain[index] = dataToSave;
            alert('Data pemasukan berhasil diperbarui.');
        } else {
            // Logika TAMBAH BARU
            dataToSave.userId = currentUser.value.uid; // <-- TAMBAHKAN userId DI SINI
            const collectionRef = collection(db, "other_incomes");
            const newDocRef = await addDoc(collectionRef, dataToSave);
            state.keuanganLain.unshift({ ...dataToSave, id: newDocRef.id });
            alert('Pemasukan baru berhasil dicatat.');
        }
        hideModal();
    } catch (error) {
        console.error("Error menyimpan pemasukan:", error);
        alert("Gagal menyimpan data pemasukan.");
    }
}

async function deletePemasukan(id) {
    if (confirm('Anda yakin ingin menghapus data pemasukan ini?')) {
        try {
            await deleteDoc(doc(db, "other_incomes", id));
            state.keuanganLain = state.keuanganLain.filter(p => p.id !== id);
            alert('Data pemasukan berhasil dihapus.');
        } catch (error) {
            console.error("Error menghapus pemasukan:", error);
            alert("Gagal menghapus data pemasukan.");
        }
    }
}


function exportKeuangan(type) {
    const data = type === 'pengeluaran' ? filteredPengeluaran.value : filteredPemasukan.value;
    const sheetName = type === 'pengeluaran' ? 'Laporan Pengeluaran' : 'Laporan Pemasukan';
    if (data.length === 0) {
        alert(`Tidak ada data ${type} untuk diexport.`);
        return;
    }
    const dataForExcel = data.map(item => ({
        "Tanggal": new Date(item.tanggal),
        "Kategori/Tipe": item.kategori || item.tipe,
        "Jumlah": item.jumlah,
        "Catatan": item.catatan || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    worksheet["!cols"] = [ { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 40 } ];
    XLSX.writeFile(workbook, `${sheetName.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function handleReturSearch() {
    // Fungsi ini sekarang hanya untuk mencari dan menampilkan rekomendasi
    const query = uiState.returSearchQuery.trim().toLowerCase();
    if (query.length < 2) {
        uiState.returSearchRecommendations = [];
        return;
    }
    uiState.returSearchRecommendations = state.produk
        .filter(p => `${p.sku} ${p.nama}`.toLowerCase().includes(query))
        .slice(0, 5);
}

function selectReturRecommendation(product) {
    if (!uiState.modalData || !uiState.modalData.items) {
        alert("Terjadi kesalahan. Coba tutup dan buka kembali modal.");
        return;
    }

    const sku = product ? product.sku : uiState.returSearchQuery.trim().toUpperCase();
    if (!sku) {
        alert('SKU produk tidak valid.');
        return;
    }
    
    // HAPUS Pengecekan 'isExist' agar bisa menambahkan SKU yang sama
    // isExist logic removed
    
    uiState.modalData.items.push({
        sku: sku,
        qty: 1,
        alasan: '',
        tindakLanjut: 'Ganti Baru'
    });
    
    uiState.returSearchQuery = '';
    uiState.returSearchRecommendations = [];
}

// Fungsi ini tidak berubah
function removeReturItem(index) {
    if (uiState.modalData && uiState.modalData.items) {
        uiState.modalData.items.splice(index, 1);
    }
}


// FUNGSI HAPUS RETUR (SEKARANG LEBIH SEDERHANA)

async function deleteReturnItem(itemToDelete) {
    if (!confirm(`Anda yakin ingin menghapus item retur '${getProductBySku(itemToDelete.sku)?.nama}'? Stok TIDAK akan disesuaikan kembali.`)) {
        return;
    }

    try {
        const returnDocRef = doc(db, "returns", itemToDelete.returnDocId);

        await runTransaction(db, async (transaction) => {
            const returnDoc = await transaction.get(returnDocRef);
            if (!returnDoc.exists()) {
                throw "Dokumen retur tidak ditemukan.";
            }

            const currentData = returnDoc.data();
            // Filter array 'items' untuk menghapus item yang sesuai (berdasarkan SKU dan detail lainnya)
            const newItems = (currentData.items || []).filter(item => 
                item.sku !== itemToDelete.sku || 
                item.alasan !== itemToDelete.alasan || 
                item.tindakLanjut !== itemToDelete.tindakLanjut
            );

            // Jika setelah difilter array menjadi kosong, hapus seluruh dokumen
            if (newItems.length === 0) {
                console.log("Tidak ada item tersisa, menghapus seluruh dokumen retur.");
                transaction.delete(returnDocRef);
            } else {
                // Jika masih ada item lain, update dokumen dengan array yang baru
                console.log("Menghapus satu item dari dokumen retur.");
                transaction.update(returnDocRef, { items: newItems });
            }
        });

        // Muat ulang semua data untuk memastikan tampilan sinkron
        await loadAllDataFromFirebase();
        alert('Item retur berhasil dihapus.');

    } catch (error) {
        console.error("Error menghapus item retur:", error);
        alert("Gagal menghapus item retur dari database.");
    }
}
async function submitReturForm() {
    if (!currentUser.value) return alert("Anda harus login untuk menyimpan retur.");
    const form = uiState.modalData;

    if (!form.tanggal || !form.channelId || form.items.length === 0) {
        alert('Tanggal, Asal Toko, dan minimal satu item retur wajib diisi.');
        return;
    }

    try {
        const batch = writeBatch(db);
        let returnRef;
        const dataToSave = {
            tanggal: new Date(form.tanggal),
            channelId: form.channelId,
            items: form.items.map(item => ({...item, qty: parseInt(item.qty)})),
            userId: currentUser.value.uid
        };
        
        const productsCollection = collection(db, "products");
        const allocationsCollection = collection(db, "stock_allocations");
        
        if (form.id) {
            // --- KASUS: EDIT RETUR (TANPA MEMPENGARUHI STOK) ---
            returnRef = doc(db, "returns", form.id);
            // Simpan data tanpa penyesuaian stok
            batch.update(returnRef, dataToSave);
        } else {
            // --- KASUS: TAMBAH RETUR BARU (DENGAN MENAMBAH STOK) ---
            returnRef = doc(collection(db, "returns"));
            batch.set(returnRef, dataToSave);

            for (const item of dataToSave.items) {
                const productInState = getProductBySku(item.sku);
                if (productInState) {
                    const newStockFisik = productInState.stokFisik + item.qty;
                    batch.update(doc(productsCollection, item.sku), { physical_stock: newStockFisik });
                    
                    const newStockAlokasi = (productInState.stokAlokasi[form.channelId] || 0) + item.qty;
                    batch.set(doc(allocationsCollection, item.sku), { [form.channelId]: newStockAlokasi }, { merge: true });
                }
            }
        }
        
        await batch.commit();

        await loadAllDataFromFirebase();

        alert(`Data retur berhasil disimpan!`);
        hideModal();

    } catch (error) {
        console.error("Error menyimpan data retur:", error);
        alert("Gagal menyimpan data retur. Cek console untuk detail.");
    }
}
function handleReturPageSearch() {
    const query = uiState.returPageSearchQuery;
    if (!query) {
        uiState.returPageSearchRecommendations = [];
        return;
    }
    const lowerQuery = query.toLowerCase();
    const recommendations = new Set();
    
    // Cari berdasarkan SKU, Nama, Alasan dari data retur yang sudah ada
    // Perbaikan untuk memastikan tidak error saat ada data kosong
    state.retur.forEach(item => {
        // Karena data retur sekarang bisa memiliki banyak item di dalam array 'items'
        // Kita perlu meloop di dalamnya juga
        (item.items || []).forEach(itemDetail => {
            const product = getProductBySku(itemDetail.sku);
            const productName = product ? product.nama : '';

            const matches = (item.id && item.id.toLowerCase().includes(lowerQuery)) ||
                            (itemDetail.sku && itemDetail.sku.toLowerCase().includes(lowerQuery)) ||
                            (productName && productName.toLowerCase().includes(lowerQuery)) ||
                            (itemDetail.alasan && itemDetail.alasan.toLowerCase().includes(lowerQuery));

            if (matches) {
                if (itemDetail.sku) recommendations.add(itemDetail.sku);
                if (productName) recommendations.add(productName);
                if (itemDetail.alasan) recommendations.add(itemDetail.alasan);
            }
        });
    });

    uiState.returPageSearchRecommendations = Array.from(recommendations).slice(0, 5);
}

function selectReturPageRecommendation(rec) {
    uiState.returPageSearchQuery = rec;
    uiState.returPageSearchRecommendations = [];
}
function exportReturToExcel() {
    const dataToExport = filteredRetur.value.map(item => {
        const product = getProductBySku(item.sku) || {};
        const marketplace = getMarketplaceById(item.channelId) || {};
        return {
            "ID Retur": item.id,
            "Tanggal": new Date(item.tanggal),
            "Asal Toko": marketplace.name || 'N/A',
            "SKU": item.sku,
            "Nama Produk": product.nama || 'N/A',
            "Qty": item.qty,
            "Alasan": item.alasan,
            "Tindak Lanjut": item.tindakLanjut,
        };
    });

    if (dataToExport.length === 0) {
        alert("Tidak ada data retur untuk diekspor.");
        return;
    }
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan Retur");
    worksheet["!cols"] = [ { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 30 }, { wch: 8 }, { wch: 30 }, { wch: 20 }];
    
    // Format tanggal
    dataToExport.forEach((_data, index) => {
        const cellRef = XLSX.utils.encode_cell({c: 1, r: index + 1});
        if (worksheet[cellRef]) {
            worksheet[cellRef].t = 'd';
            worksheet[cellRef].z = 'dd/mm/yyyy';
        }
    });

    XLSX.writeFile(workbook, `Laporan_Retur_${new Date().toISOString().split('T')[0]}.xlsx`);
}
async function addMarketplace() {
    if (!currentUser.value) return alert("Anda harus login.");

    const newMarketplace = {
        id: `marketplace-${Date.now()}`,
        name: 'Marketplace Baru',
        adm: 0, program: 0, layanan: 0, perPesanan: 0, komisi: 0, voucher: 0,
    };

    // 1. Update state lokal dulu agar UI responsif
    state.settings.marketplaces.push(newMarketplace);

    // 2. Siapkan slot promosi kosong untuk marketplace baru ini
    if (!state.promotions.perChannel[newMarketplace.id]) {
        state.promotions.perChannel[newMarketplace.id] = { voucherToko: null, voucherSemuaProduk: null };
    }

    // 3. Langsung panggil saveData untuk menyimpan seluruh state settings ke Firebase
    await saveData(); 
    alert('Marketplace baru berhasil ditambahkan dan disimpan!');
}

async function removeMarketplace(marketplaceId) {
    if (!currentUser.value) return alert("Anda harus login.");
    if (!confirm('Anda yakin ingin menghapus marketplace ini?')) return;

    const index = state.settings.marketplaces.findIndex(mp => mp.id === marketplaceId);
    if (index > -1) {
        state.settings.marketplaces.splice(index, 1);
        // Langsung panggil saveData untuk menyimpan perubahan ke Firebase
        await saveData();
        alert('Marketplace berhasil dihapus.');
    }
}

async function saveMarketplaceEdit() {
    if (!currentUser.value) return alert("Anda harus login.");
    
    const editedMarketplace = uiState.modalData;
    const index = state.settings.marketplaces.findIndex(mp => mp.id === editedMarketplace.id);
    if (index !== -1) {
        state.settings.marketplaces[index] = editedMarketplace;
    }
    
    await saveData(); // Panggil saveData untuk menyimpan
    hideModal();
    alert('Perubahan marketplace berhasil disimpan.');
}

async function addModelBaju() {
    if (!currentUser.value) return alert("Anda harus login.");

    const newModel = {
        id: `MODEL-${Date.now()}`,
        namaModel: 'Model Baru',
        yardPerBaju: 0,
        hargaMaklun: 0,
    };
    state.settings.modelBaju.push(newModel);
    await saveData(); // Panggil saveData untuk menyimpan
    alert('Model baju baru berhasil ditambahkan.');
}

async function removeModelBaju(modelId) {
    if (!currentUser.value) return alert("Anda harus login.");
    if (!confirm('Anda yakin ingin menghapus model baju ini?')) return;

    const index = state.settings.modelBaju.findIndex(m => m.id === modelId);
    if (index > -1) {
        state.settings.modelBaju.splice(index, 1);
        await saveData(); // Panggil saveData untuk menyimpan
        alert('Model baju berhasil dihapus.');
    }
}

async function saveModelBajuEdit() {
    if (!currentUser.value) return alert("Anda harus login.");

    const editedModel = uiState.modalData;
    const index = state.settings.modelBaju.findIndex(model => model.id === editedModel.id);
    if (index !== -1) {
        state.settings.modelBaju[index] = editedModel;
    }

    await saveData(); // Panggil saveData untuk menyimpan
    hideModal();
    alert('Perubahan model baju berhasil disimpan.');
}

async function saveStockAllocation() {
    if (!currentUser.value) return alert("Anda harus login untuk menyimpan perubahan.");
    const { product, original } = uiState.modalData;
    const userId = currentUser.value.uid;

    const cleanAllocationData = JSON.parse(JSON.stringify(product.stokAlokasi));
    
    try {
        const batch = writeBatch(db);

        // Operasi 1: Update stok fisik di koleksi 'products'
        const productRef = doc(db, "products", original.sku);
        batch.update(productRef, { physical_stock: product.stokFisik });
        
        // Operasi 2: Simpan/Update data alokasi di koleksi 'stock_allocations'
        const allocationRef = doc(db, "stock_allocations", original.sku);
        // TAMBAHKAN userId ke data alokasi yang disimpan
        batch.set(allocationRef, { ...cleanAllocationData, userId: userId });

        await batch.commit();

        const targetProduct = getProductBySku(original.sku);
        if (targetProduct) {
            targetProduct.stokFisik = product.stokFisik;
            targetProduct.stokAlokasi = { ...product.stokAlokasi };
        }
        
        hideModal();
        alert("Perubahan stok fisik dan alokasi berhasil disimpan!");

    } catch (error) {
        console.error("Error menyimpan alokasi stok:", error);
        alert("Gagal menyimpan perubahan stok.");
    }
}

async function removeProductVariant(sku) {
    if (confirm(`Anda yakin ingin menghapus produk dengan SKU: ${sku}? Data ini tidak bisa dikembalikan.`)) {
        try {
            // Mulai Batch Write untuk menghapus produk beserta data terkaitnya
            const batch = writeBatch(db);

            // Operasi 1: Hapus dokumen produk dari koleksi 'products'
            const productRef = doc(db, "products", sku);
            batch.delete(productRef);

            // Operasi 2: Hapus semua data harga yang terkait dengan SKU ini
            state.settings.marketplaces.forEach(channel => {
                const priceDocId = `${sku}-${channel.id}`;
                const priceRef = doc(db, "product_prices", priceDocId);
                batch.delete(priceRef);
            });

            // Jalankan semua operasi penghapusan
            await batch.commit();
            
            // Jika sukses di database, baru hapus dari state lokal
            state.produk = state.produk.filter(p => p.sku !== sku);
            alert(`Produk dengan SKU: ${sku} beserta data harganya berhasil dihapus.`);

        } catch (error) {
            console.error("Error menghapus produk:", error);
            alert("Gagal menghapus produk dari database. Cek console untuk detail.");
        }
    }
}

function goToAturHarga(productName) {
    activePage.value = 'harga-hpp';
    uiState.hargaHppSelectedProduct = productName;
}

const transactionDetails = computed(() => {
    if (uiState.modalType !== 'transactionDetail' || !uiState.modalData.id) {
        return null;
    }
    const trx = uiState.modalData;
    const totalHPP = trx.items.reduce((sum, item) => sum + (item.hpp || 0) * item.qty, 0);
    const totalBiayaMarketplace = trx.biaya.total || 0;
    const labaBersih = trx.total - totalHPP - totalBiayaMarketplace;

    return {
        ...trx,
        totalHPP,
        totalBiayaMarketplace,
        labaBersih
    };
});

const panduanData = [
    {
        icon: '📊',
        title: 'Dashboard Analitik',
        subtitle: 'Pusat Komando dan Visi Strategis Bisnis Anda.',
        content: `<p>Dashboard adalah kokpit utama operasional Anda. Halaman ini tidak hanya menampilkan angka, tetapi menyajikan denyut nadi bisnis Anda secara visual dan intuitif. Pantau <strong>Indikator Kinerja Utama (KPI)</strong> secara <i>real-time</i> untuk membuat keputusan yang cepat dan berbasis data.</p>
                  <ul>
                    <li><strong>Analisis Periodik:</strong> Gunakan filter waktu untuk mengevaluasi kinerja mingguan, bulanan, atau periode kustom untuk menemukan tren musiman.</li>
                    <li><strong>Kesehatan Finansial:</strong> Pahami metrik fundamental seperti <strong>Laba Kotor</strong> (profitabilitas produk), <strong>Biaya Operasional</strong> (efisiensi pengeluaran), dan <strong>Laba Bersih Estimasi</strong> (kesehatan bisnis secara keseluruhan).</li>
                    <li><strong>Visualisasi Data:</strong> Grafik interaktif memberikan gambaran jernih mengenai kanal penjualan mana yang paling produktif dan bagaimana alur keuntungan bergerak seiring waktu.</li>
                  </ul>`
    },
    {
        icon: '🛒',
        title: 'Kasir (Point of Sale)',
        subtitle: 'Jantung Transaksi yang Cepat, Akurat, dan Cerdas.',
        content: `<p>Setiap interaksi penjualan adalah momen krusial. Modul Kasir kami dirancang untuk presisi dan kecepatan, meminimalisir kesalahan manusia dan memaksimalkan kepuasan pelanggan.</p>
                  <ul>
                    <li><strong>Pencatatan Tanpa Hambatan:</strong> Cukup pindai (scan) barcode atau cari produk berdasarkan SKU/nama. Sistem akan langsung menambahkannya ke keranjang.</li>
                    <li><strong>Kecerdasan Promosi:</strong> Tidak perlu mengingat promo yang sedang berjalan. Sistem secara otomatis mengkalkulasi dan menerapkan <strong>diskon atau voucher terbaik</strong> yang berlaku untuk item di keranjang.</li>
                    <li><strong>Arsip Digital:</strong> Setiap transaksi dicatat secara permanen, membangun aset data penjualan yang tak ternilai dan dapat diekspor ke Excel untuk analisis lebih lanjut.</li>
                  </ul>`
    },
    {
        icon: '📦',
        title: 'Manajemen Inventaris',
        subtitle: 'Kendalikan Aset Digital dan Fisik Anda Secara Terpusat.',
        content: `<p>Stok adalah aset paling dinamis. Halaman ini memberi Anda kendali penuh dengan memisahkan dua konsep kunci:</p>
                  <ol>
                    <li><strong>Stok Master (Fisik):</strong> Ini adalah jumlah total produk yang secara nyata ada di gudang Anda. Ini adalah satu-satunya sumber kebenaran (<i>single source of truth</i>).</li>
                    <li><strong>Alokasi Stok:</strong> Ini adalah "jatah" stok yang Anda putuskan untuk ditampilkan di setiap marketplace. Strategi ini mencegah <i>overselling</i> dan memungkinkan Anda menjual satu produk di banyak tempat dengan aman.</li>
                  </ol>
                  <p>Gunakan filter status untuk secara proaktif mengidentifikasi produk yang stoknya <strong>Aman</strong>, <strong>Menipis</strong>, atau <strong>Habis</strong>, memungkinkan Anda merencanakan produksi ulang sebelum kehabisan.</p>`
    },
    {
        icon: '💲',
        title: 'Harga & HPP',
        subtitle: 'Arsitektur Profitabilitas Setiap Produk Anda.',
        content: `<p>Profitabilitas bukanlah kebetulan, melainkan hasil dari sebuah desain. Di sinilah Anda merancang fondasi keuntungan untuk setiap item yang Anda jual.</p>
                  <ul>
                    <li><strong>Input HPP Presisi:</strong> Masukkan <strong>Harga Pokok Penjualan (HPP)</strong>—biaya modal murni untuk satu produk. Ini adalah angka krusial untuk semua kalkulasi laba.</li>
                    <li><strong>Strategi Harga Dinamis:</strong> Atur harga jual yang berbeda untuk setiap marketplace, menyesuaikan dengan struktur biaya dan target pasar masing-masing.</li>
                    <li><strong>Margin Visual:</strong> Sistem secara instan menampilkan <strong>persentase margin keuntungan</strong>, memberikan Anda panduan visual yang jelas untuk menetapkan harga jual yang paling optimal.</li>
                  </ul>`
    },
    {
        icon: '🏭',
        title: 'Manajemen Produksi',
        subtitle: 'Visibilitas Penuh dari Bahan Baku hingga Produk Jadi.',
        content: `<p>Modul ini mengubah proses produksi yang kompleks menjadi alur kerja yang transparan dan terukur. Lacak setiap perintah jahit (maklun) sebagai sebuah <strong>Batch Produksi</strong> yang terkontrol.</p>
                  <ul>
                    <li><strong>Kalkulasi HPP Real:</strong> Sistem secara canggih menghitung HPP per-pcs yang sesungguhnya dari sebuah batch, dengan memperhitungkan biaya bahan, jasa maklun, dan bahkan biaya alat bantu.</li>
                    <li><strong>Analisis Efisiensi Kain:</strong> Masalah "kain gelap" atau pemborosan bahan baku terpecahkan. Dengan mencatat total yard dan jumlah jadi, sistem menunjukkan <strong>efisiensi penggunaan kain (Yard/Baju)</strong> yang sebenarnya, memberikan data vital untuk negosiasi dengan pemaklun.</li>
                    <li><strong>Analisis Kerugian:</strong> Fitur <strong>Analisis Model</strong> secara otomatis menyorot batch yang hasilnya di bawah target, memungkinkan Anda mengidentifikasi dan mengatasi inefisiensi produksi secara langsung.</li>
                  </ul>`
    },
    {
        icon: '🧵',
        title: 'Stok Kain',
        subtitle: 'Manajemen Aset Bahan Baku Produksi Anda.',
        content: `<p>Setiap produksi yang hebat dimulai dari bahan baku yang berkualitas dan terkelola dengan baik. Modul Stok Kain adalah fondasi dari seluruh alur produksi Anda.</p>
                  <ul>
                    <li><strong>Pencatatan Terpusat:</strong> Catat setiap pembelian kain baru, lengkap dengan nama, warna, sisa yard, asal toko, dan harga beli per yard.</li>
                    <li><strong>Kontrol Stok Bahan:</strong> Jangan biarkan produksi terhambat karena kehabisan bahan. Dapatkan gambaran jelas mengenai sisa stok setiap jenis kain yang Anda miliki.</li>
                    <li><strong>Integrasi Produksi:</strong> Data di sini menjadi referensi penting saat Anda membuat Batch Produksi baru, memastikan konsistensi dan akurasi data dari hulu ke hilir.</li>
                  </ul>`
    },
    {
        icon: '💰',
        title: 'Manajemen Keuangan',
        subtitle: 'Pencatatan Arus Kas Operasional untuk Laba Bersih Akurat.',
        content: `<p>Kesehatan bisnis tidak hanya diukur dari penjualan. Halaman ini berfungsi sebagai buku kas digital untuk semua arus uang di luar transaksi produk.</p>
                  <ul>
                    <li><strong>Catat Pengeluaran:</strong> Dokumentasikan setiap <strong>biaya operasional</strong>—mulai dari gaji, listrik, internet, hingga biaya pemasaran—untuk mendapatkan gambaran biaya bisnis yang sebenarnya.</li>
                    <li><strong>Catat Pemasukan Lain:</strong> Lacak <strong>pemasukan non-penjualan</strong> seperti suntikan modal dari investor atau penarikan pribadi (prive) oleh pemilik.</li>
                    <li><strong>Akurasi Laba Bersih:</strong> Data dari modul inilah yang menyempurnakan kalkulasi <strong>Laba Bersih</strong> di Dashboard, memberikan Anda angka keuntungan akhir yang paling akurat.</li>
                  </ul>`
    },
     {
        icon: '🏷️',
        title: 'Promosi & Voucher',
        subtitle: 'Alat Strategis untuk Mengakselerasi Pertumbuhan Penjualan.',
        content: `<p>Rancang skenario promosi yang menarik untuk meningkatkan konversi dan loyalitas pelanggan. Sistem ini menawarkan fleksibilitas untuk berbagai strategi pemasaran:</p>
                  <ul>
                    <li><strong>Promosi Global per Akun:</strong> Terapkan promosi umum seperti <strong>Voucher Ikuti Toko</strong> yang berlaku untuk semua produk di satu marketplace.</li>
                    <li><strong>Promosi Spesifik per Produk:</strong> Buat penawaran yang lebih tertarget seperti <strong>Diskon Bertingkat</strong> (misal: beli 2 diskon 10%) yang hanya aktif untuk model produk tertentu di kanal penjualan yang Anda pilih.</li>
                  </ul>`
    },
    {
        icon: '↩️',
        title: 'Manajemen Retur',
        subtitle: 'Mengubah Keluhan Menjadi Peningkatan Kualitas dan Loyalitas.',
        content: `<p>Proses retur yang profesional adalah cerminan dari kualitas brand Anda. Kelola setiap pengembalian produk bukan sebagai masalah, tetapi sebagai kesempatan.</p>
                  <ul>
                    <li><strong>Pencatatan Komprehensif:</strong> Catat alasan retur, asal toko, dan tindak lanjut yang diambil (refund, tukar ukuran, dll).</li>
                    <li><strong>Pengembalian Stok Otomatis:</strong> Saat retur dicatat, sistem secara cerdas akan mengembalikan jumlah stok ke <strong>Stok Master</strong> dan <strong>Alokasi Toko</strong> yang bersangkutan.</li>
                    <li><strong>Analisis Umpan Balik:</strong> Data retur adalah umpan balik paling jujur dari pasar. Analisis tren alasan retur untuk menemukan area perbaikan pada produk atau layanan Anda.</li>
                  </ul>`
    },
    {
        icon: '⚙️',
        title: 'Pengaturan',
        subtitle: 'Cetak Biru dan Fondasi Digital untuk Operasional Bisnis.',
        content: `<p>Halaman ini adalah "ruang mesin" dari aplikasi Anda. Ketepatan data di sini akan menentukan akurasi kalkulasi di seluruh sistem.</p>
                  <ul>
                    <li><strong>Identitas Brand:</strong> Atur nama brand dan batas minimum stok untuk pengingat otomatis.</li>
                    <li><strong>Struktur Biaya Marketplace:</strong> Definisikan semua kanal penjualan beserta struktur biayanya (admin, program, layanan, dll.) agar perhitungan laba per transaksi selalu akurat.</li>
                    <li><strong>Model Baju Default:</strong> Tetapkan "resep" standar produksi Anda. Data <strong>Yard/Baju</strong> dan <strong>Harga Maklun</strong> di sini akan menjadi acuan utama di modul Produksi.</li>
                  </ul>`
    },
    {
        icon: '❓',
        title: 'Pusat Bantuan',
        subtitle: 'Asisten Ahli yang Selalu Siap Memandu Anda.',
        content: `<p>Anda berada di sini! Halaman ini adalah basis pengetahuan Anda. Selain membaca panduan terstruktur ini, manfaatkan fitur <strong>pencarian cerdas</strong> di bagian atas.</p><p>Cukup ketik kata kunci seperti "cara hitung laba" atau "stok menipis", dan biarkan asisten kami memberikan jawaban yang relevan dan kontekstual untuk pertanyaan Anda.</p>`
    }
];

const promosiProductModels = computed(() => {
    return [...new Set(state.produk.map(p => p.nama))];
});

async function deleteTransaction(transactionId) {
    if (!confirm(`Anda yakin ingin menghapus transaksi ID: ${transactionId}? Stok produk akan dikembalikan.`)) {
        return;
    }

    const trxToDelete = state.transaksi.find(trx => trx.id === transactionId);
    if (!trxToDelete) {
        alert("Transaksi tidak ditemukan.");
        return;
    }

    try {
        const batch = writeBatch(db);

        const transactionRef = doc(db, "transactions", transactionId);
        batch.delete(transactionRef);

        for (const item of trxToDelete.items) {
            const productRef = doc(db, "products", item.sku);
            const productInState = getProductBySku(item.sku);
            if (productInState) {
                const newStock = (productInState.stokFisik || 0) + item.qty;
                batch.update(productRef, { physical_stock: newStock });
            }
        }

        await batch.commit();

        trxToDelete.items.forEach(item => {
            const productInState = getProductBySku(item.sku);
            if (productInState) {
                productInState.stokFisik += item.qty;
            }
        });
        state.transaksi = state.transaksi.filter(trx => trx.id !== transactionId);

        alert("Transaksi berhasil dihapus dan stok telah dikembalikan.");

    } catch (error) {
        console.error("Error saat menghapus transaksi:", error);
        alert("Gagal menghapus transaksi dari database.");
    }
}


function handleModelBajuChange(item) {
    const selectedModel = state.settings.modelBaju.find(m => m.id === item.modelBajuId);
    if (selectedModel) {
        item.yardPerBaju = selectedModel.yardPerBaju;
        item.hargaMaklunPerPcs = selectedModel.hargaMaklun;
    }
}

function addKainBahanItem(batch) {
    if (!batch.kainBahan) {
        batch.kainBahan = [];
    }
    batch.kainBahan.push({
        idUnik: generateUniqueCode(), // <-- BARIS BARU: Tambahkan kode unik
        modelBajuId: '',
        namaKain: '',
        tokoKain: '',
        warnaKain: '',
        ukuran: '',
        totalYard: null,
        hargaKainPerYard: null,
        yardPerBaju: null,
        targetQty: null,
        aktualJadi: null,
        aktualJadiLabelType: 'Aktual Jadi',
        hargaMaklunPerPcs: null,
        biayaAlat: null,
        aktualJadiKombinasi: null
    });
}

function removeKainBahanItem(batch, index) {
    if (batch.kainBahan && batch.kainBahan.length > index) {
        batch.kainBahan.splice(index, 1);
    }
}

let specialPriceDebounceTimer;
function handleSpecialPriceSearch() {
    clearTimeout(specialPriceDebounceTimer);
    uiState.selectedProductForSpecialPrice = null; // Reset pilihan setiap kali mencari
    uiState.specialPriceInput = null;

    const query = uiState.specialPriceSearch.trim().toLowerCase();
    if (query.length < 2) {
        uiState.specialPriceRecommendations = [];
        return;
    }
    specialPriceDebounceTimer = setTimeout(() => {
        uiState.specialPriceRecommendations = state.produk.filter(p => 
            p.sku.toLowerCase().includes(query) ||
            p.nama.toLowerCase().includes(query) ||
            p.warna.toLowerCase().includes(query) ||
            p.varian.toLowerCase().includes(query)
        ).slice(0, 5);
    }, 300);
}

function selectProductForSpecialPrice(product) {
    uiState.selectedProductForSpecialPrice = product;
    uiState.specialPriceSearch = `${product.nama} - ${product.varian} (${product.sku})`;
    uiState.specialPriceRecommendations = [];

    // Cek apakah sudah ada harga spesial untuk produk ini di channel yg dipilih
    const existingPrice = state.specialPrices[uiState.specialPriceChannel]?.[product.sku];
    if (existingPrice) {
        uiState.specialPriceInput = existingPrice;
    } else {
        uiState.specialPriceInput = null;
    }
}

function saveSpecialPrice() {
    if (!uiState.selectedProductForSpecialPrice || uiState.specialPriceInput === null || uiState.specialPriceInput <= 0) {
        alert("Harap pilih produk dan masukkan harga spesial yang valid.");
        return;
    }

    const channelId = uiState.specialPriceChannel;
    const sku = uiState.selectedProductForSpecialPrice.sku;
    const price = uiState.specialPriceInput;

    if (!state.specialPrices[channelId]) {
        state.specialPrices[channelId] = {};
    }
    state.specialPrices[channelId][sku] = price;

    alert(`Harga spesial untuk SKU ${sku} di channel terpilih berhasil disimpan!`);
    
    // Reset form di dalam modal
    uiState.selectedProductForSpecialPrice = null;
    uiState.specialPriceSearch = '';
    uiState.specialPriceInput = null;

    // OTOMATIS TUTUP MODAL SETELAH SIMPAN
    hideModal();
}

function deleteSpecialPrice(channelId, sku) {
    if (confirm(`Anda yakin ingin menghapus harga spesial untuk SKU ${sku}?`)) {
        if (state.specialPrices[channelId] && state.specialPrices[channelId][sku]) {
            delete state.specialPrices[channelId][sku];
            alert('Harga spesial berhasil dihapus.');
        }
    }
}
// --- LIFECYCLE & WATCHERS ---
watch(activePage, (newPage) => { if (newPage === 'dashboard') nextTick(renderCharts); });
watch(dashboardFilteredData, () => { if (activePage.value === 'dashboard') nextTick(renderCharts); });
watch(() => uiState.activeCartChannel, (newChannel) => { if (newChannel && !state.carts[newChannel]) state.carts[newChannel] = []; });
watch(() => uiState.promosiSelectedModel, (newModel) => {
    if (newModel) {
        if (!state.promotions.perModel[newModel]) {
            state.promotions.perModel[newModel] = {};
        }
        state.settings.marketplaces.forEach(channel => {
            if (!state.promotions.perModel[newModel][channel.id]) {
                state.promotions.perModel[newModel][channel.id] = { voucherProduk: null, diskonBertingkat: [] };
            }
        });
    }
});

async function loadAllDataFromFirebase() {
    isLoading.value = true;
    const userId = currentUser.value?.uid;
    if (!userId) {
        isLoading.value = false;
        return;
    }
    
    try {
        // 1. Muat dokumen settings & promotions milik pengguna
        const settingsRef = doc(db, "settings", userId);
        const promotionsRef = doc(db, "promotions", userId);
        const [settingsSnap, promotionsSnap] = await Promise.all([
            getDoc(settingsRef),
            getDoc(promotionsRef)
        ]);

        if (settingsSnap.exists()) {
            const appSettings = settingsSnap.data();
            state.settings.brandName = appSettings.brandName || 'FASHION OS';
            state.settings.minStok = appSettings.minStok || 10;
            state.settings.marketplaces = appSettings.marketplaces || [];
            state.settings.modelBaju = appSettings.modelBaju || [];
        } else {
            // Jika pengguna baru, buatkan dokumen settings untuk mereka
            console.log("Membuat dokumen settings baru untuk pengguna:", userId);
            const newSettings = {
                brandName: 'Brand Anda',
                minStok: 10,
                marketplaces: [],
                modelBaju: [],
                userId: userId
            };
            await setDoc(settingsRef, newSettings);
            Object.assign(state.settings, newSettings);
        }
        
        // 2. Inisialisasi & muat data promosi
        state.settings.marketplaces.forEach(mp => {
            if (!state.promotions.perChannel[mp.id]) {
                state.promotions.perChannel[mp.id] = { voucherToko: null, voucherSemuaProduk: null };
            }
        });

        if (promotionsSnap.exists()) {
            const promotionsData = promotionsSnap.data();
            if (promotionsData.perChannel) {
                state.promotions.perChannel = { ...state.promotions.perChannel, ...promotionsData.perChannel };
            }
            if (promotionsData.perModel) {
                state.promotions.perModel = promotionsData.perModel;
            }
        } else {
            // Jika pengguna baru, buatkan dokumen promosi
            await setDoc(promotionsRef, {
                perChannel: {}, perModel: {}, userId: userId
            });
        }

        // 3. Muat semua data lain seperti biasa...
        const [ productsSnap, pricesSnap, allocationsSnap, transactionsSnap, expensesSnap, otherIncomesSnap, returnsSnap, productionSnap, fabricSnap ] = await Promise.all([
            getDocs(query(collection(db, "products"), where("userId", "==", userId))),
            getDocs(query(collection(db, 'product_prices'), where("userId", "==", userId))),
            getDocs(query(collection(db, 'stock_allocations'), where("userId", "==", userId))),
            getDocs(query(collection(db, "transactions"), where("userId", "==", userId))),
            getDocs(query(collection(db, "expenses"), where("userId", "==", userId))),
            getDocs(query(collection(db, "other_incomes"), where("userId", "==", userId))),
            getDocs(query(collection(db, "returns"), where("userId", "==", userId))),
            getDocs(query(collection(db, "production_batches"), where("userId", "==", userId))),
            getDocs(query(collection(db, "fabric_stock"), where("userId", "==", userId))),
        ]);

        const pricesData = pricesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const allocationsData = allocationsSnap.docs.map(doc => ({ sku: doc.id, ...doc.data() }));

        state.produk = productsSnap.docs.map(docSnap => {
            const p = { id: docSnap.id, ...docSnap.data() };
            const hargaJual = {};
            const stokAlokasi = {};
            const productAllocation = allocationsData.find(alloc => alloc.sku === p.id);
            state.settings.marketplaces.forEach(mp => {
                const priceInfo = pricesData.find(pr => pr.product_sku === p.id && pr.marketplace_id === mp.id);
                hargaJual[mp.id] = priceInfo ? priceInfo.price : 0;
                stokAlokasi[mp.id] = productAllocation ? (productAllocation[mp.id] || 0) : 0;
            });
            return {
                sku: p.id, nama: p.product_name, warna: p.color, varian: p.variant,
                stokFisik: p.physical_stock, hpp: p.hpp, hargaJual: hargaJual, stokAlokasi: stokAlokasi,
                userId: p.userId
            };
        });
        
        state.transaksi = transactionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggal: doc.data().tanggal.toDate() }));
        state.biaya = expensesSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggal: doc.data().tanggal.toDate() }));
        state.keuanganLain = otherIncomesSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggal: doc.data().tanggal.toDate() }));
        state.retur = returnsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggal: doc.data().tanggal.toDate() }));
        state.produksi = productionSnap.docs.map(doc => {
            const data = doc.data();
            if (data.tanggalPembayaran && data.tanggalPembayaran.toDate) {
                data.tanggalPembayaran = data.tanggalPembayaran.toDate();
            }
            return { id: doc.id, ...data, tanggal: data.tanggal.toDate() };
        });
        state.gudangKain = fabricSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggalBeli: doc.data().tanggalBeli.toDate() }));
        
    } catch (error) {
        console.error("Error besar saat mengambil data dari Firebase:", error);
        alert("Gagal memuat data dari database.");
    } finally {
        isLoading.value = false;
    }
}

onMounted(() => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser.value = user;
            
            // Ambil data spesifik pengguna dari koleksi 'users'
            const userDocRef = doc(db, "users", user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                const now = new Date();

                // LOGIKA PENGUNCIAN FITUR
                if (userData.subscriptionStatus === 'trial' && now > userData.trialEndDate.toDate()) {
                    // Jika statusnya trial DAN masa trial sudah lewat
                    console.log("Masa trial pengguna telah berakhir.");
                    isLoading.value = false;
                    activePage.value = 'langganan'; // Kunci aplikasi dan arahkan ke halaman langganan
                } else {
                    // Jika status 'active' atau 'trial' yang masih valid
                    console.log("Pengguna terdeteksi, memuat data aplikasi...");
                    await loadAllDataFromFirebase();
                    if (state.settings.marketplaces.length > 0) {
                        uiState.activeCartChannel = state.settings.marketplaces[0].id;
                        state.settings.marketplaces.forEach(mp => {
                            state.carts[mp.id] = [];
                        });
                    }
                }
            } else {
                console.log("Data pengguna tidak ditemukan di koleksi 'users'.");
                isLoading.value = false;
            }

        } else {
            // Jika tidak ada pengguna yang login
            console.log("Tidak ada pengguna yang login.");
            currentUser.value = null;
            isLoading.value = false;
        }
    });
});

</script>

<template>
    <div v-if="!currentUser && !isLoading" class="flex items-center justify-center h-screen bg-slate-100">
            <div class="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-lg">
                <h2 class="text-2xl font-bold text-center text-slate-800">Login ke {{ state.settings.brandName }}</h2>
                <form @submit.prevent="handleLogin" class="space-y-4">
                    <div>
                        <label for="email" class="block text-sm font-medium text-slate-600">Alamat Email</label>
                        <input type="email" v-model="authForm.email" id="email" required class="w-full p-2 mt-1 border rounded-md">
                    </div>
                    <div>
                        <label for="password" class="block text-sm font-medium text-slate-600">Password</label>
                        <input type="password" v-model="authForm.password" id="password" required class="w-full p-2 mt-1 border rounded-md">
                    </div>
                    <div v-if="authForm.error" class="p-3 text-sm text-red-700 bg-red-100 rounded-lg">
                        {{ authForm.error }}
                    </div>
                    <div class="flex items-center justify-between gap-4">
                        <button type="button" @click="handleRegister" class="w-full py-2 px-4 text-sm font-medium text-indigo-600 bg-indigo-100 rounded-lg hover:bg-indigo-200">
                            Daftar Akun Baru
                        </button>
                        <button type="submit" class="w-full py-2 px-4 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
                            Login
                        </button>
                    </div>
                </form>
            </div>
        </div>

        
  <div v-if="currentUser">
    <div class="flex h-screen bg-slate-100">
      <!-- Sidebar -->
      <aside class="w-64 bg-slate-800 text-slate-200 flex-shrink-0 hidden md:flex md:flex-col">
        <div class="p-5 border-b border-slate-700">
            <h1 class="text-2xl font-bold text-white text-center">{{ state.settings.brandName }}</h1>
            <p class="text-xs text-slate-400 text-center">Pusat Kendali Bisnis</p>
        </div>
        <nav class="mt-4 flex-1 overflow-y-auto">
    <a href="#" @click.prevent="changePage('dashboard')" class="sidebar-link flex items-center py-3 px-5" :class="{ active: activePage === 'dashboard' }"><span class="mr-3 text-xl">📊</span> Dashboard</a>
    <a href="#" @click.prevent="changePage('transaksi')" class="sidebar-link flex items-center py-3 px-5" :class="{ active: activePage === 'transaksi' }"><span class="mr-3 text-xl">🛒</span> Kasir (POS)</a>
    <a href="#" @click.prevent="changePage('inventaris')" class="sidebar-link flex items-center py-3 px-5" :class="{ active: activePage === 'inventaris' }"><span class="mr-3 text-xl">📦</span> Inventaris</a>
    <a href="#" @click.prevent="changePage('harga-hpp')" class="sidebar-link flex items-center py-3 px-5" :class="{ active: activePage === 'harga-hpp' }"><span class="mr-3 text-xl">💲</span> Harga & HPP</a>
    <a href="#" @click.prevent="changePage('promosi')" class="sidebar-link flex items-center py-3 px-5" :class="{ active: activePage === 'promosi' }"><span class="mr-3 text-xl">🏷️</span> Promosi & Voucher</a>
    <a href="#" @click.prevent="changePage('produksi')" class="sidebar-link flex items-center py-3 px-5" :class="{ active: activePage === 'produksi' }"><span class="mr-3 text-xl">🏭</span> Produksi</a>
    <a href="#" @click.prevent="changePage('gudang-kain')" class="sidebar-link flex items-center py-3 px-5" :class="{ active: activePage === 'gudang-kain' }"><span class="mr-3 text-xl">🧵</span> Stok Kain</a>
    <a href="#" @click.prevent="changePage('keuangan')" class="sidebar-link flex items-center py-3 px-5" :class="{ active: activePage === 'keuangan' }"><span class="mr-3 text-xl">💰</span> Keuangan</a>
    <a href="#" @click.prevent="changePage('retur')" class="sidebar-link flex items-center py-3 px-5" :class="{ active: activePage === 'retur' }"><span class="mr-3 text-xl">↩️</span> Manajemen Retur</a>
    <a href="#" @click.prevent="changePage('pengaturan')" class="sidebar-link flex items-center py-3 px-5" :class="{ active: activePage === 'pengaturan' }"><span class="mr-3 text-xl">⚙️</span> Pengaturan</a>
    <a href="#" @click.prevent="changePage('langganan')" class="sidebar-link flex items-center py-3 px-5" :class="{ active: activePage === 'langganan' }"><span class="mr-3 text-xl">💎</span> Langganan</a>
    <a href="#" @click.prevent="changePage('panduan')" class="sidebar-link flex items-center py-3 px-5 mt-4 border-t border-slate-700" :class="{ active: activePage === 'panduan' }"><span class="mr-3 text-xl">❓</span> Panduan Aplikasi</a>
</nav>
      
      <div class="p-5 border-t border-slate-700 space-y-3">
    <a href="#" @click.prevent="changePage('tentang')" 
       class="w-full flex items-center justify-center text-sm bg-slate-700 text-slate-300 font-bold py-2 px-4 rounded-lg hover:bg-slate-600 transition-colors">
        <span class="mr-2">©️</span> Tentang Aplikasi
    </a>

    <div v-if="currentUser" class="text-center">
        
        <button @click="handleLogout" class="w-full bg-red-600 text-white font-bold py-1.5 px-3 rounded-lg hover:bg-red-700 transition-colors text-xs">
            Logout
        </button>
    </div>
</div>
  </aside>

      <!-- Main Content -->
      <main class="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
    
    <div v-if="isLoading" class="flex items-center justify-center h-full">
        <div class="text-center">
            <svg class="animate-spin h-10 w-10 text-indigo-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p class="mt-4 text-lg font-semibold text-slate-700">Memuat Data dari Database...</p>
        </div>
    </div>

    <div v-else>

    <div v-if="activePage === 'dashboard'">
      <div class="flex flex-wrap justify-between items-center mb-8 gap-4">
        <div>
            <h2 class="text-3xl font-bold text-slate-800">Dashboard Analitik</h2>
            
            <p class="text-slate-600 mt-1">Ringkasan performa bisnis Anda.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2 p-3 bg-white rounded-lg border">
    <select v-model="uiState.dashboardDateFilter" class="w-full sm:w-auto bg-white border border-slate-300 text-sm rounded-lg p-2.5 shadow-sm capitalize">
        <option value="today">hari ini</option>
        <option value="last_7_days">1 minggu terakhir</option>
        <option value="last_30_days">1 bulan terakhir</option>
        <option value="this_year">1 tahun terakhir</option>
        <option value="by_date_range">rentang tanggal</option>
        <option value="by_month_range">rentang bulan</option>
        <option value="by_year_range">rentang tahun</option>
        <option value="all_time">semua</option>
    </select>
    
    <div v-if="uiState.dashboardDateFilter === 'by_date_range'" class="flex items-center gap-2">
        <input type="date" v-model="uiState.dashboardStartDate" class="border-slate-300 text-sm rounded-lg p-2">
        <span>s/d</span>
        <input type="date" v-model="uiState.dashboardEndDate" class="border-slate-300 text-sm rounded-lg p-2">
    </div>

    <div v-if="uiState.dashboardDateFilter === 'by_month_range'" class="flex flex-wrap items-center gap-2">
        <select v-model.number="uiState.dashboardStartMonth" class="border-slate-300 text-sm rounded-lg p-2"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select>
        <input type="number" v-model.number="uiState.dashboardStartYear" class="w-24 border-slate-300 text-sm rounded-lg p-2" placeholder="Tahun">
        <span class="mx-2">s/d</span>
        <select v-model.number="uiState.dashboardEndMonth" class="border-slate-300 text-sm rounded-lg p-2"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select>
        <input type="number" v-model.number="uiState.dashboardEndYear" class="w-24 border-slate-300 text-sm rounded-lg p-2" placeholder="Tahun">
    </div>

    <div v-if="uiState.dashboardDateFilter === 'by_year_range'" class="flex items-center gap-2">
        <input type="number" v-model.number="uiState.dashboardStartYear" placeholder="Dari Tahun" class="w-28 border-slate-300 text-sm rounded-lg p-2">
        <span>s/d</span>
        <input type="number" v-model.number="uiState.dashboardEndYear" placeholder="Sampai Tahun" class="w-28 border-slate-300 text-sm rounded-lg p-2">
    </div>
</div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
    
    <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
        <div class="bg-indigo-100 text-indigo-600 p-3 rounded-lg flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
        </div>
        <div class="flex-1 min-w-0">
            <h3 class="text-sm font-medium text-slate-500 flex items-center">Saldo Kas Saat Ini <button @click="showKpiHelp('saldo-kas')" class="help-btn ml-2">?</button></h3>
            <p class="kpi-value text-2xl font-bold mt-1 text-indigo-600">{{ formatCurrency(dashboardKpis.saldoKas) }}</p>
        </div>
    </div>

    <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
        <div class="bg-blue-100 text-blue-600 p-3 rounded-lg flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
        </div>
        <div class="flex-1 min-w-0">
            <h3 class="text-sm font-medium text-slate-500 flex items-center">Omset Bersih <button @click="showKpiHelp('omset')" class="help-btn ml-2">?</button></h3>
            <p class="kpi-value text-2xl font-bold mt-1 text-blue-600">{{ formatCurrency(dashboardKpis.totalOmsetBersih) }}</p>
        </div>
    </div>

    <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
        <div class="bg-emerald-100 text-emerald-600 p-3 rounded-lg flex-shrink-0">
           <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <div class="flex-1 min-w-0">
            <h3 class="text-sm font-medium text-slate-500 flex items-center">Laba Kotor <button @click="showKpiHelp('laba-kotor')" class="help-btn ml-2">?</button></h3>
            <p class="kpi-value text-2xl font-bold mt-1 text-emerald-600">{{ formatCurrency(dashboardKpis.labaKotor) }}</p>
        </div>
    </div>

    <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
        <div class="bg-green-100 text-green-600 p-3 rounded-lg flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" /></svg>
        </div>
        <div class="flex-1 min-w-0">
            <h3 class="text-sm font-medium text-slate-500 flex items-center">Laba Bersih (Est.) <button @click="showKpiHelp('laba-bersih')" class="help-btn ml-2">?</button></h3>
            <p class="kpi-value text-2xl font-bold mt-1 text-green-600">{{ formatCurrency(dashboardKpis.labaBersihEst) }}</p>
        </div>
    </div>

    <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
        <div class="bg-orange-100 text-orange-600 p-3 rounded-lg flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
        </div>
        <div class="flex-1 min-w-0">
            <h3 class="text-sm font-medium text-slate-500 flex items-center">Biaya Operasional <button @click="showKpiHelp('biaya-operasional')" class="help-btn ml-2">?</button></h3>
            <p class="kpi-value text-2xl font-bold mt-1 text-orange-600">{{ formatCurrency(dashboardKpis.totalBiayaOperasional) }}</p>
        </div>
    </div>

    <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
        <div class="bg-cyan-100 text-cyan-600 p-3 rounded-lg flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
        </div>
        <div class="flex-1 min-w-0">
            <h3 class="text-sm font-medium text-slate-500 flex items-center">Total Unit Stok <button @click="showKpiHelp('total-stok')" class="help-btn ml-2">?</button></h3>
            <p class="kpi-value text-2xl font-bold mt-1 text-cyan-600">{{ formatNumber(dashboardKpis.totalUnitStok) }} pcs</p>
        </div>
    </div>

    <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
        <div class="bg-amber-100 text-amber-600 p-3 rounded-lg flex-shrink-0">
             <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
        </div>
        <div class="flex-1 min-w-0">
            <h3 class="text-sm font-medium text-slate-500 flex items-center">Total Nilai Stok (HPP) <button @click="showKpiHelp('nilai-stok')" class="help-btn ml-2">?</button></h3>
            <p class="kpi-value text-2xl font-bold mt-1 text-amber-600">{{ formatCurrency(dashboardKpis.totalNilaiStokHPP) }}</p>
        </div>
    </div>
    
    <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-start gap-4">
        <div class="bg-red-100 text-red-600 p-3 rounded-lg flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 15v-1a4 4 0 00-4-4H8m0 0l-3 3m3-3l3 3m0 0v-2a4 4 0 014-4h2" /></svg>
        </div>
        <div class="flex-1 min-w-0">
            <h3 class="text-sm font-medium text-slate-500 flex items-center">Total Nilai Retur <button @click="showKpiHelp('nilai-retur')" class="help-btn ml-2">?</button></h3>
            <p class="kpi-value text-2xl font-bold mt-1 text-red-600">{{ formatCurrency(dashboardKpis.totalNilaiRetur) }}</p>
        </div>
    </div>

</div>
      <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div class="lg:col-span-3 bg-white p-6 rounded-xl border"><h3 class="text-lg font-semibold text-slate-800 mb-4">Laba Kotor vs Biaya Operasional</h3><div class="chart-container"><canvas id="profitExpenseChart"></canvas></div></div>
          <div class="lg:col-span-2 bg-white p-6 rounded-xl border"><h3 class="text-lg font-semibold text-slate-800 mb-4">Penjualan per Channel</h3><div class="chart-container"><canvas id="salesChannelChart"></canvas></div></div>
      </div>
    </div>

    <div v-if="activePage === 'transaksi'">
    <div class="flex items-center gap-4 mb-1">
    <h2 class="text-3xl font-bold">Kasir (Point of Sale)</h2>
    <button @click="showModal('panduanPOS')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
        Informasi
    </button>
</div>
<p class="text-slate-600 mb-6">Scan barcode atau cari produk untuk memulai transaksi.</p>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div class="lg:col-span-2 space-y-8">
            <div class="relative sticky top-0 z-20">
                <div class="flex items-center gap-2">
                    <input type="text" v-model="uiState.posSearchQuery" @input="handlePosSearch" placeholder="SCAN BARCODE ATAU CARI PRODUK DI SINI..." class="w-full p-4 text-lg border-2 border-slate-300 rounded-lg shadow-inner" autocomplete="off">
                    <button @click="showModal('scannerHelp')" class="flex-shrink-0 bg-slate-200 h-14 w-14 flex items-center justify-center rounded-lg text-2xl hover:bg-slate-300">?</button>
                </div>
                <div v-if="uiState.posSearchRecommendations.length > 0" class="absolute w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                    <div v-for="p in uiState.posSearchRecommendations" :key="p.sku" @click="selectRecommendation(p)" class="p-3 hover:bg-slate-100 cursor-pointer border-b">
                        <p class="font-semibold">{{ p.nama }} - {{ p.varian }} ({{ p.warna }})</p>
                        <p class="text-xs text-slate-500 mt-1">SKU: {{ p.sku }} | Stok: {{ p.stokFisik }}</p>
                    </div>
                </div>
            </div>
            <div class="mt-4">
                <button @click="showModal('specialPrice')" class="w-full bg-amber-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-amber-600 transition-colors shadow">Atur Harga Spesial (Flash Sale)</button>
            </div>
            
            <div>
                <div class="flex flex-wrap justify-between items-center mb-4 gap-2">
                    <h3 class="text-xl font-semibold">Riwayat Transaksi</h3>
                    <div class="flex items-start gap-2">
    <div class="flex-grow">
        <select v-model="uiState.posDateFilter" class="w-full bg-white border border-slate-300 text-sm rounded-lg p-2.5 shadow-sm capitalize">
            <option value="today">hari ini</option>
            <option value="last_7_days">1 minggu terakhir</option>
            <option value="last_30_days">1 bulan terakhir</option>
            <option value="this_year">1 tahun terakhir</option>
            <option value="by_date_range">rentang tanggal</option>
            <option value="by_month_range">rentang bulan</option>
            <option value="by_year_range">rentang tahun</option>
            <option value="all_time">semua</option>
        </select>
        
        <div v-if="uiState.posDateFilter === 'by_date_range'" class="mt-2 flex items-center gap-2">
            <input type="date" v-model="uiState.posStartDate" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2">
            <span class="text-slate-500">s/d</span>
            <input type="date" v-model="uiState.posEndDate" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2">
        </div>
        
        <div v-if="uiState.posDateFilter === 'by_month_range'" class="mt-2 flex items-center gap-2">
            <select v-model.number="uiState.posStartMonth" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select>
            <input type="number" v-model.number="uiState.posStartYear" class="w-24 border-slate-300 text-sm rounded-lg p-2">
            <span class="mx-2">s/d</span>
            <select v-model.number="uiState.posEndMonth" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select>
            <input type="number" v-model.number="uiState.posEndYear" class="w-24 border-slate-300 text-sm rounded-lg p-2">
        </div>
        
        <div v-if="uiState.posDateFilter === 'by_year_range'" class="mt-2 flex items-center gap-2">
            <input type="number" v-model.number="uiState.posStartYear" placeholder="Dari Tahun" class="w-full border-slate-300 text-sm rounded-lg p-2">
            <span class="text-slate-500">s/d</span>
            <input type="number" v-model.number="uiState.posEndYear" placeholder="Sampai Tahun" class="w-full border-slate-300 text-sm rounded-lg p-2">
        </div>
    </div>
    <button @click="exportTransactionsToExcel" class="bg-blue-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-blue-700 text-sm h-[42px]">Export</button>
</div>
                </div>
                <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto max-h-96">
                    <table class="w-full text-sm text-left text-slate-500">
                        <thead class="text-xs text-slate-700 uppercase bg-slate-100 sticky top-0">
                            <tr>
                                <th class="px-6 py-3">ID</th>
                                <th class="px-6 py-3">Tanggal</th>
                                <th class="px-6 py-3">Channel</th>
                                <th class="px-6 py-3">Total</th>
                                <th class="px-6 py-3">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="filteredTransaksi.length === 0">
                                <td colspan="5" class="text-center py-4">Belum ada transaksi pada periode ini.</td>
                            </tr>
                            <tr v-for="trx in filteredTransaksi" :key="trx.id" class="border-b hover:bg-slate-50">
                                <td class="px-6 py-4 font-mono text-xs">{{ trx.id.slice(-6) }}</td>
                                <td class="px-6 py-4">{{ new Date(trx.tanggal).toLocaleDateString('id-ID') }}</td>
                                <td class="px-6 py-4">{{ trx.channel }}</td>
                                <td class="px-6 py-4 font-semibold">{{ formatCurrency(trx.total) }}</td>
                                <td class="px-6 py-4 space-x-3">
                                    <button @click="showModal('transactionDetail', trx)" class="font-semibold text-indigo-600 hover:underline">Detail</button>
                                    <button @click="deleteTransaction(trx.id)" class="font-semibold text-red-500 hover:underline">Hapus</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

        </div>

        <div class="lg:col-span-1 space-y-6">
            <div class="bg-white p-4 rounded-xl border">
                <label class="block text-sm font-medium text-slate-600 mb-1">Pilih Channel Penjualan</label>
                <select v-model="uiState.activeCartChannel" class="w-full p-2 border rounded-md">
                    <option v-for="mp in state.settings.marketplaces" :key="mp.id" :value="mp.id">{{ mp.name }}</option>
                </select>
            </div>
            <div class="bg-white p-6 rounded-xl border sticky top-6">
                <div class="text-center mb-4 pb-4 border-b">
                    <p class="font-semibold text-slate-700">{{ getMarketplaceById(uiState.activeCartChannel)?.name || 'Pilih Channel' }}</p>
                    <h2 class="text-2xl font-bold text-slate-800">{{ state.settings.brandName }}</h2>
                    <p class="text-sm text-slate-500">{{ new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }}</p>
                </div>
                <h3 class="text-lg font-bold mb-2 text-slate-800">Keranjang</h3>
                <div class="mb-4 max-h-60 overflow-y-auto pr-2">
                    <p v-if="activeCart.length === 0" class="text-center py-8 text-slate-500">Keranjang kosong</p>
                    <div v-for="item in activeCart" :key="item.sku" class="flex justify-between items-center py-3 border-b border-slate-100">
                        <div>
                            <p class="font-medium text-sm">{{ item.nama }} ({{ item.varian }})</p>
                            <p class="text-sm text-slate-500">{{ formatCurrency(item.hargaJualAktual) }} &times; {{item.qty}}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <button @click="updateCartItemQty(item.sku, -1)" class="w-6 h-6 rounded-full bg-red-100 text-red-700 font-bold flex items-center justify-center">-</button>
                            <span class="font-bold w-6 text-center">{{ item.qty }}</span>
                            <button @click="updateCartItemQty(item.sku, 1)" class="w-6 h-6 rounded-full bg-green-100 text-green-700 font-bold flex items-center justify-center">+</button>
                            <button @click="removeFromCart(item.sku)" class="ml-2 text-slate-400 hover:text-red-600 font-bold text-xl">&times;</button>
                        </div>
                    </div>
                </div>
                <div class="border-t border-slate-200 pt-4 space-y-2 text-sm">
                    <div class="flex justify-between"><span>Subtotal</span><span>{{ formatCurrency(cartSummary.subtotal) }}</span></div>
                    <div v-if="cartSummary.discount.totalDiscount > 0" class="flex justify-between text-green-600">
                        <span>{{ cartSummary.discount.description }}</span>
                        <span>-{{ formatCurrency(cartSummary.discount.totalDiscount) }}</span>
                    </div>
                    <div class="flex justify-between font-bold text-lg pt-2 mt-2"><span>Total Akhir</span><span>{{ formatCurrency(cartSummary.finalTotal) }}</span></div>
                    <div class="flex justify-between text-xs text-slate-500"><span>Jumlah Barang</span><span>{{ cartSummary.itemCount }}</span></div>
                </div>
                <button @click="confirmCompleteTransaction" :disabled="activeCart.length === 0" class="mt-6 w-full bg-indigo-600 text-white font-bold py-3 rounded-lg disabled:bg-slate-400 hover:bg-indigo-700 transition-colors">
                    Selesaikan Transaksi
                </button>
            </div>
        </div>
    </div>
</div>

    <div v-if="activePage === 'inventaris'">
    <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
            <h2 class="text-3xl font-bold text-slate-800">Manajemen Inventaris</h2>
            <p class="text-slate-500 mt-1">Kelompokkan produk berdasarkan nama untuk manajemen yang lebih mudah.</p>
        </div>
        <div class="flex gap-2">
    <button @click="showModal('addStockIn', { sku: '', qty: null, alasan: '' })" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors shadow">Stok Masuk</button>
    <button @click="showModal('addProduct', { sku: '', nama: '', warna: '', varian: '', hpp: null, hargaJualDefault: null })" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors shadow">Tambah Produk Baru</button>
</div>
    </div>

    <div class="mb-6 p-4 bg-white rounded-xl border"><div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div><label class="block text-sm font-medium mb-1">Cari Nama Produk</label><input type="text" v-model="uiState.inventorySearch" placeholder="Ketik nama produk..." class="w-full p-2 border rounded-md"></div>
        <div><label class="block text-sm font-medium mb-1">Filter Status Stok</label><select v-model="uiState.inventoryFilterStock" class="w-full p-2 border rounded-md"><option value="all">Semua Status</option><option value="aman">Stok Aman</option><option value="menipis">Stok Menipis</option><option value="habis">Stok Habis</option></select></div>
        <div><label class="block text-sm font-medium mb-1">Urutkan Berdasarkan</label><select v-model="uiState.inventorySort" class="w-full p-2 border rounded-md"><option value="nama-asc">Nama Produk (A-Z)</option><option value="nama-desc">Nama Produk (Z-A)</option><option value="stok-desc">Stok Terbanyak</option><option value="stok-asc">Stok Terendah</option></select></div>
    </div></div>

    <div class="space-y-4">
        <p v-if="inventoryProductGroups.length === 0" class="text-center py-12 text-slate-500">Produk tidak ditemukan.</p>
        <div v-for="group in inventoryProductGroups" :key="group.nama" class="bg-white border rounded-xl" :class="{ 'border-red-300': group.totalStock === 0 }">
            <div class="p-4 flex justify-between items-center cursor-pointer" @click="uiState.activeAccordion = uiState.activeAccordion === group.nama ? null : group.nama">
                <div class="flex items-center gap-4">
                    <div 
    class="w-10 h-10 rounded-full flex items-center justify-center" 
    :class="{
        'bg-green-100 text-green-600': group.totalStock > state.settings.minStok,
        'bg-yellow-100 text-yellow-600': group.totalStock > 0 && group.totalStock <= state.settings.minStok,
        'bg-red-100 text-red-600': group.totalStock === 0
    }">
    
    <svg v-if="group.totalStock > state.settings.minStok" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
    </svg>
    
    <svg v-else-if="group.totalStock > 0 && group.totalStock <= state.settings.minStok" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
    </svg>
    
    <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
    </svg>
</div>
                    <div>
                        <h3 class="text-lg font-bold text-slate-800">{{ group.nama }}</h3>
                        <p class="text-sm text-slate-500">Tersedia dalam {{ group.totalVariants }} varian</p>
                    </div>
                </div>
                <div class="flex items-center gap-6 text-right">
                    <div>
                        <p class="text-xs text-slate-500">Total Stok</p>
                        <p class="text-lg font-bold text-slate-800">{{ formatNumber(group.totalStock) }} pcs</p>
                    </div>
                    <div>
                        <p class="text-xs text-slate-500">Total Nilai Stok</p>
                        <p class="text-lg font-bold text-slate-800">{{ formatCurrency(group.totalNilaiStok) }}</p>
                    </div>
                    <div class="flex items-center gap-2">
                         <button @click.stop="removeProductVariant(group.variants.map(v => v.sku))" class="p-2 text-slate-400 hover:text-slate-700"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                         <div class="text-slate-400 transition-transform" :class="{ 'rotate-180': uiState.activeAccordion === group.nama }">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                         </div>
                    </div>
                </div>
            </div>
             <div class="inventory-variant-details" :style="{ maxHeight: uiState.activeAccordion === group.nama ? '1000px' : '0px' }">
                <div class="px-4 pb-4 overflow-x-auto">
    <table class="w-full text-left text-sm">
        <thead class="text-xs text-slate-500">
            <tr>
                <th class="px-2 py-2 font-medium">SKU</th>
                <th class="px-2 py-2 font-medium">NAMA PRODUK</th>
                <th class="px-2 py-2 font-medium">WARNA</th>
                <th class="px-2 py-2 font-medium">UKURAN</th>
                <th class="px-2 py-2 font-medium">STOK</th>
                <th class="px-2 py-2 font-medium text-right">AKSI</th>
            </tr>
        </thead>
        <tbody>
            <tr v-if="group.variants.length === 0">
                <td colspan="6" class="text-center p-4 text-slate-500">Tidak ada varian untuk produk ini.</td>
            </tr>
            <tr v-for="v in group.variants" :key="v.sku" class="border-t">
                <td class="px-2 py-3 font-mono">{{ v.sku }}</td>
                <td class="px-2 py-3 font-semibold text-slate-800">{{ v.nama }}</td>
                <td class="px-2 py-3">{{ v.warna }}</td>
                <td class="px-2 py-3">{{ v.varian }}</td>
                <td class="px-2 py-3 font-bold">{{ formatNumber(v.stokFisik) }}</td>
                <td class="px-2 py-3 text-right space-x-3 whitespace-nowrap">
                    <button @click.stop="removeProductVariant(v.sku)" class="font-semibold text-red-500 hover:underline">Hapus</button>
                    <button @click.stop="showModal('kelolaStok', { product: JSON.parse(JSON.stringify(v)), original: v })" class="font-semibold text-blue-500 hover:underline">Kelola Stok</button>
                    <button @click.stop="goToAturHarga(v.nama)" class="font-semibold text-green-500 hover:underline">Atur Harga</button>
                </td>
            </tr>
        </tbody>
    </table>
</div>
            </div>
        </div>
    </div>
</div>

    <div v-if="activePage === 'harga-hpp'">
    <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
            <h2 class="text-3xl font-bold text-slate-800">Pengaturan Harga Jual & HPP</h2>
            <p class="text-slate-600 mt-1">Atur modal (HPP) dan harga jual untuk setiap varian di semua channel.</p>
        </div>
        <button @click="saveData" :disabled="isSaving" class="bg-green-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-green-700 transition-colors shadow disabled:bg-green-400 disabled:cursor-not-allowed">
    <span v-if="isSaving">Menyimpan...</span>
    <span v-else>Simpan Semua Perubahan</span>
</button>
    </div>

    <div class="bg-white p-6 rounded-xl border">
        <div class="mb-6 max-w-lg">
            <label class="block text-sm font-medium text-slate-700 mb-1">Pilih Produk</label>
            <select v-model="uiState.hargaHppSelectedProduct" class="w-full p-3 border border-slate-300 rounded-md">
                <option value="">-- Pilih --</option>
                <option v-for="namaProduk in hargaHppProductNames" :key="namaProduk" :value="namaProduk">{{ namaProduk }}</option>
            </select>
        </div>

        <div class="space-y-4">
            <p v-if="!uiState.hargaHppSelectedProduct" class="text-center py-16 text-slate-500">Pilih produk di atas untuk mulai.</p>
            
            <div v-for="varian in hargaHppFilteredVariants" :key="varian.sku" class="bg-slate-50 border rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                <div class="md:col-span-1">
                    <p class="font-bold text-lg text-slate-800">{{ varian.warna }} - {{ varian.varian }}</p>
                    <p class="text-sm font-mono text-slate-500">{{ varian.sku }}</p>
                    <div class="mt-4">
                        <label class="block text-sm font-medium text-slate-700">HPP (Modal)</label>
                        <div class="relative mt-1">
                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">Rp</span>
                            <input type="text" :value="formatInputNumber(varian.hpp)" @input="varian.hpp = parseInputNumber($event.target.value)" class="w-full p-2 pl-8 pr-3 border border-slate-300 rounded-md text-right font-bold text-red-600">
                        </div>
                    </div>
                </div>

                <div class="md:col-span-2 space-y-3">
                    <div v-for="marketplace in state.settings.marketplaces" :key="marketplace.id" class="flex justify-between items-center">
                        <label class="text-sm text-slate-600">{{ marketplace.name }}</label>
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold px-2 py-0.5 rounded-full" 
                                  :class="{
                                    'bg-green-100 text-green-800': ((varian.hargaJual[marketplace.id] - varian.hpp) / varian.hargaJual[marketplace.id] * 100) >= 40, 
                                    'bg-yellow-100 text-yellow-800': ((varian.hargaJual[marketplace.id] - varian.hpp) / varian.hargaJual[marketplace.id] * 100) >= 20 && ((varian.hargaJual[marketplace.id] - varian.hpp) / varian.hargaJual[marketplace.id] * 100) < 40, 
                                    'bg-red-100 text-red-800': ((varian.hargaJual[marketplace.id] - varian.hpp) / varian.hargaJual[marketplace.id] * 100) < 20
                                  }">
                                {{ (varian.hargaJual[marketplace.id] && varian.hpp ? (((varian.hargaJual[marketplace.id] - varian.hpp) / varian.hargaJual[marketplace.id]) * 100) : 0).toFixed(1) }}%
                            </span>
                            <div class="relative w-36">
                                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">Rp</span>
                                <input type="text" :value="formatInputNumber(varian.hargaJual[marketplace.id])" @input="varian.hargaJual[marketplace.id] = parseInputNumber($event.target.value)" class="w-full p-2 pl-8 pr-3 border border-slate-300 rounded-md text-right font-semibold">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

    <div v-if="activePage === 'promosi'">
    <div class="flex items-center gap-4 mb-6">
    <h2 class="text-3xl font-bold">Manajemen Promosi & Voucher</h2>
    <button @click="showModal('panduanPromosi')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
        Informasi
    </button>
</div>
    <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm col-span-full">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
                <h4 class="text-lg font-semibold text-slate-800 border-b pb-2 mb-3">Promosi per Akun Penjualan</h4>
                <p class="text-sm text-slate-500 mb-4">Voucher ini berlaku untuk semua produk yang dijual di akun yang bersangkutan.</p>
                <div class="space-y-4">
                    <div v-for="channel in state.settings.marketplaces" :key="channel.id" class="p-4 border rounded-lg bg-slate-50">
                        <p class="font-semibold text-slate-700">{{ channel.name }}</p>
                        <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-xs font-medium text-slate-600">Voucher Ikuti Toko (%)</label>
                                <input type="number" placeholder="Contoh: 5" v-model.number="state.promotions.perChannel[channel.id].voucherToko" class="mt-1 w-full p-1.5 text-sm border-slate-300 rounded-md">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-slate-600">Voucher Semua Produk (Rp)</label>
                                <input type="number" placeholder="Contoh: 10000" v-model.number="state.promotions.perChannel[channel.id].voucherSemuaProduk" class="mt-1 w-full p-1.5 text-sm border-slate-300 rounded-md">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div>
                <h4 class="text-lg font-semibold text-slate-800 border-b pb-2 mb-3">Promosi Spesifik per Model Produk</h4>
                <p class="text-sm text-slate-500 mb-4">Atur diskon dan voucher yang hanya berlaku untuk model produk tertentu di setiap akun.</p>
                <div class="mb-4">
                    <label for="promo-model-filter" class="block text-sm font-medium text-slate-700">Pilih Model Produk</label>
                    <select v-model="uiState.promosiSelectedModel" id="promo-model-filter" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm">
                        <option value="">-- Pilih Model untuk Diatur --</option>
                        <option v-for="modelName in promosiProductModels" :key="modelName" :value="modelName">{{ modelName }}</option>
                    </select>
                </div>
                <div v-if="uiState.promosiSelectedModel" class="space-y-4">
                    <div v-for="channel in state.settings.marketplaces" :key="channel.id" class="p-4 border rounded-lg bg-slate-50">
                        <p class="font-semibold text-slate-700">{{ channel.name }}</p>
                        <div class="mt-2 space-y-3">
                            <div>
                                <label class="block text-xs font-medium text-slate-600">Voucher Produk Tertentu (%)</label>
                                <input type="number" placeholder="Contoh: 10" v-model.number="state.promotions.perModel[uiState.promosiSelectedModel][channel.id].voucherProduk" class="mt-1 w-full p-1.5 text-sm border-slate-300 rounded-md">
                                  </div>
                            <div>
                                <label class="block text-xs font-medium text-slate-600">Diskon Minimal Belanja Bertingkat</label>
                                <div class="space-y-2 mt-1">
                                    <div v-for="(tier, index) in state.promotions.perModel[uiState.promosiSelectedModel][channel.id].diskonBertingkat" :key="index" class="flex items-center gap-2">
                                        <input type="number" placeholder="Min. Belanja (Rp)" v-model.number="tier.min" class="w-full p-1.5 text-sm border-slate-300 rounded-md">
                                        <input type="number" placeholder="Diskon (%)" v-model.number="tier.diskon" class="w-full p-1.5 text-sm border-slate-300 rounded-md">
                                        <button @click="removePromotionTier(uiState.promosiSelectedModel, channel.id, index)" type="button" class="text-red-500 hover:text-red-700 text-xl font-bold">×</button>
                                    </div>
                                </div>
                                <button @click="addPromotionTier(uiState.promosiSelectedModel, channel.id)" type="button" class="mt-2 text-xs text-blue-600 hover:underline">+ Tambah Tingkatan</button>
                            </div>
                        </div>
                    </div>
                </div>
                <p v-else class="text-center text-slate-500 py-4">Pilih model produk di atas untuk melihat pengaturannya.</p>
            </div>
        </div>
         <div class="mt-6 border-t pt-4 flex justify-end">
            <button @click="saveData" :disabled="isSaving" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors shadow disabled:bg-green-400 disabled:cursor-not-allowed">
    <span v-if="isSaving">Menyimpan...</span>
    <span v-else>Simpan Semua Pengaturan Promosi</span>
</button>
        </div>
    </div>
</div>

<div v-if="activePage === 'produksi'">
    <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
            <h2 class="text-3xl font-bold">Manajemen Produksi</h2>
            <p class="text-slate-600">Lacak semua batch produksi maklun.</p>
        </div>
        <div class="flex flex-wrap gap-2">
    <button @click="showModal('analisisModel')" class="bg-white border border-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg hover:bg-slate-50">Analisis Model</button>
    <button @click="showModal('ringkasanJadi')" class="bg-white border border-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg hover:bg-slate-50">Ringkasan Jadi</button>
    <button @click="showModal('laporanStatus')" class="bg-white border border-slate-300 text-slate-700 font-bold py-2 px-4 rounded-lg hover:bg-slate-50">Laporan per Status</button>
    <button @click="showModal('laporanSemuanya')" class="bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-emerald-700">Laporan Semuanya</button>
    <button @click="showModal('addProduksi')" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 shadow">Buat Batch Produksi</button>
</div>
    </div>
    <div class="mb-6 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label for="produksi-search" class="block text-sm font-medium text-slate-700 mb-1">Cari (ID Batch / Pemaklun)</label>
                <input v-model="uiState.produksiSearch" type="text" id="produksi-search" placeholder="Ketik untuk mencari..." class="w-full p-2 border border-slate-300 rounded-md shadow-sm">
            </div>
            <div>
                <label for="produksi-filter-status" class="block text-sm font-medium text-slate-700 mb-1">Filter Status Proses</label>
                <select v-model="uiState.produksiFilterStatus" id="produksi-filter-status" class="w-full p-2 border border-slate-300 rounded-md shadow-sm">
                    <option value="all">Semua Status</option>
                    <option value="Dalam Proses">Dalam Proses</option>
                    <option value="Selesai">Selesai</option>
                    <option value="Revisi">Revisi</option>
                    <option value="Ditunda">Ditunda</option>
                </select>
            </div>
        </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <p v-if="filteredProduksiBatches.length === 0" class="md:col-span-2 lg:col-span-3 text-center py-12 text-slate-500">
            Batch produksi tidak ditemukan.
        </p>
        <div v-for="batch in filteredProduksiBatches" :key="batch.id" class="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col">
            <div class="p-5 flex-grow">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-bold text-lg text-slate-800">{{ batch.namaPemaklun }}</p>
                        <p class="text-sm font-mono text-slate-500">{{ batch.id }}</p>
                    </div>
                    <span class="text-xs font-semibold px-2.5 py-1 rounded-full"
                          :class="{
                            'bg-green-100 text-green-800': batch.statusProses === 'Selesai',
                            'bg-blue-100 text-blue-800': batch.statusProses === 'Dalam Proses',
                            'bg-yellow-100 text-yellow-800': batch.statusProses === 'Revisi',
                            'bg-gray-100 text-gray-800': batch.statusProses === 'Ditunda',
                          }">
                        {{ batch.statusProses }}
                    </span>
                </div>
                <div class="mt-4 pt-4 border-t space-y-2 text-sm">
                    <div class="flex justify-between">
                        <span class="text-slate-500">Tgl. Produksi:</span>
                        <span class="font-medium">{{ new Date(batch.tanggal).toLocaleDateString('id-ID') }}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Total Kuantitas Jadi:</span>
                        <span class="font-medium">{{ batch.totalQty }} pcs</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Total Biaya Material:</span>
                        <span class="font-medium">{{ formatCurrency(batch.totalBiayaMaterial) }}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-slate-500">Total Biaya Maklun:</span>
                        <span class="font-medium text-indigo-600">{{ formatCurrency(batch.totalHargaJasaMaklun) }}</span>
                    </div>
                </div>
            </div>
            <div class="p-3 bg-slate-50 border-t rounded-b-xl flex gap-2">
                <button @click="showModal('produksiDetail', batch)" class="flex-1 text-sm bg-white border border-slate-300 text-slate-700 font-bold py-2 px-3 rounded-lg hover:bg-slate-100">Detail</button>
                <button @click="showModal('editProduksi', batch)" class="flex-1 text-sm bg-white border border-slate-300 text-slate-700 font-bold py-2 px-3 rounded-lg hover:bg-slate-100">Edit</button>
                <button @click="deleteProduksiBatch(batch.id)" class="flex-1 text-sm bg-red-500 text-white font-bold py-2 px-3 rounded-lg hover:bg-red-600">Hapus</button>
            </div>
        </div>
    </div>
</div>
<div v-if="activePage === 'gudang-kain'">
    <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
            <h2 class="text-3xl font-bold text-slate-800">Stok Kain</h2>
            <p class="text-slate-500 mt-1">Manajemen stok bahan baku kain Anda.</p>
        </div>
        <button @click="showModal('addKain', { tanggalBeli: new Date().toISOString().split('T')[0] })" class="bg-indigo-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-indigo-700 shadow">
            + Tambah Stok Kain Baru
        </button>
    </div>

    <div class="mb-6 p-4 bg-white rounded-xl border">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium mb-1">Cari (Nama Kain, Warna, Toko)</label>
                <input type="text" v-model="uiState.gudangKainSearch" placeholder="Ketik untuk mencari..." class="w-full p-2 border rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium mb-1">Urutkan Berdasarkan</label>
                <select v-model="uiState.gudangKainSort" class="w-full p-2 border rounded-md">
                    <option value="tanggal-desc">Tanggal Beli (Terbaru)</option>
                    <option value="tanggal-asc">Tanggal Beli (Terlama)</option>
                    <option value="nama-asc">Nama Kain (A-Z)</option>
                    <option value="nama-desc">Nama Kain (Z-A)</option>
                    <option value="stok-desc">Sisa Yard (Terbanyak)</option>
                    <option value="stok-asc">Sisa Yard (Tersedikit)</option>
                </select>
            </div>
        </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table class="w-full text-sm text-left text-slate-500">
            <thead class="text-xs text-slate-700 uppercase bg-slate-50">
                <tr>
                    <th class="px-6 py-3">Tanggal Beli</th>
                    <th class="px-6 py-3">Nama Kain</th>
                    <th class="px-6 py-3">Toko</th>
                    <th class="px-6 py-3 text-center">Sisa Stok</th>
                    <th class="px-6 py-3 text-right">Harga/Yard</th>
                    <th class="px-6 py-3 text-center">Aksi</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                <tr v-if="filteredGudangKain.length === 0">
                    <td colspan="6" class="p-10 text-center text-slate-500">Tidak ada data kain yang cocok dengan filter.</td>
                </tr>
                <tr v-for="kain in filteredGudangKain" :key="kain.id" class="hover:bg-slate-50">
                    <td class="px-6 py-4 whitespace-nowrap">{{ new Date(kain.tanggalBeli).toLocaleDateString('id-ID') }}</td>
                    <td class="px-6 py-4">
                        <p class="font-semibold text-slate-800">{{ kain.namaKain }}</p>
                        <p class="text-xs text-slate-500">{{ kain.warna }}</p>
                    </td>
                    <td class="px-6 py-4">{{ kain.toko || '-' }}</td>
                    <td class="px-6 py-4 font-medium text-center">{{ kain.sisaYard }} Yard</td>
                    <td class="px-6 py-4 text-right font-medium text-green-600">{{ formatCurrency(kain.hargaBeliPerYard) }}</td>
                    <td class="px-6 py-4 text-center space-x-3">
                        <button @click="showModal('editKain', { ...kain, tanggalBeli: new Date(kain.tanggalBeli).toISOString().split('T')[0] })" class="text-xs bg-slate-100 font-bold py-1 px-2 rounded hover:bg-slate-200">Edit</button>
                        <button @click="deleteKain(kain.id)" class="text-xs text-red-500 hover:underline">Hapus</button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</div>
<div v-if="activePage === 'keuangan'">
    <h2 class="text-3xl font-bold mb-6">Manajemen Keuangan</h2>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">

        <div class="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div class="p-4 border-b bg-slate-50 rounded-t-xl">
                <div class="flex justify-between items-center">
                    <h3 class="text-lg font-semibold text-slate-800">Riwayat Pengeluaran</h3>
                    <div class="flex gap-2">
                        <button @click="exportKeuangan('pengeluaran')" class="bg-white border text-slate-700 font-bold py-1.5 px-3 rounded-md hover:bg-slate-100 text-sm">Export</button>
                        <button @click="showModal('addBiaya', { tanggal: new Date().toISOString().split('T')[0], kategori: '', jumlah: null, catatan: '' })" class="bg-rose-500 text-white font-bold py-1.5 px-3 rounded-md hover:bg-rose-600 text-sm">Tambah Baru</button>
                    </div>
                </div>
                <div class="mt-3">
    <select v-model="uiState.keuanganPengeluaranFilter" class="w-full bg-white border border-slate-300 text-sm rounded-lg p-2 shadow-sm capitalize">
        <option value="today">hari ini</option>
        <option value="last_7_days">1 minggu terakhir</option>
        <option value="last_30_days">1 bulan terakhir</option>
        <option value="this_year">1 tahun terakhir</option>
        <option value="by_date_range">rentang tanggal</option>
        <option value="by_month_range">rentang bulan</option>
        <option value="by_year_range">rentang tahun</option>
        <option value="all_time">semua</option>
    </select>
    <div v-if="uiState.keuanganPengeluaranFilter === 'by_date_range'" class="mt-2 flex items-center gap-2">
        <input type="date" v-model="uiState.keuanganPengeluaranStartDate" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2">
        <span>s/d</span>
        <input type="date" v-model="uiState.keuanganPengeluaranEndDate" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2">
    </div>
    <div v-if="uiState.keuanganPengeluaranFilter === 'by_month_range'" class="mt-2 flex items-center gap-2">
        <select v-model.number="uiState.keuanganPengeluaranStartMonth" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select>
        <input type="number" v-model.number="uiState.keuanganPengeluaranStartYear" class="w-24 border-slate-300 text-sm rounded-lg p-2">
        <span class="mx-2">s/d</span>
        <select v-model.number="uiState.keuanganPengeluaranEndMonth" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select>
        <input type="number" v-model.number="uiState.keuanganPengeluaranEndYear" class="w-24 border-slate-300 text-sm rounded-lg p-2">
    </div>
    <div v-if="uiState.keuanganPengeluaranFilter === 'by_year_range'" class="mt-2 flex items-center gap-2">
        <input type="number" v-model.number="uiState.keuanganPengeluaranStartYear" placeholder="Dari Tahun" class="w-full border-slate-300 text-sm rounded-lg p-2">
        <span class="text-slate-500">s/d</span>
        <input type="number" v-model.number="uiState.keuanganPengeluaranEndYear" placeholder="Sampai Tahun" class="w-full border-slate-300 text-sm rounded-lg p-2">
    </div>
</div>
            </div>
            <div class="relative max-h-[60vh] overflow-y-auto">
                <table class="w-full text-sm text-left text-slate-500">
                    <thead class="text-xs text-slate-700 uppercase bg-slate-100 sticky top-0">
                        <tr><th class="px-4 py-3">Detail</th><th class="px-4 py-3">Catatan</th><th class="px-4 py-3">Jumlah</th><th class="px-4 py-3 text-center">Aksi</th></tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        <tr v-if="filteredPengeluaran.length === 0"><td colspan="4" class="p-4 text-center text-slate-500">Tidak ada data.</td></tr>
                        <tr v-for="item in filteredPengeluaran" :key="item.id">
                            <td class="px-4 py-3">
                                <p class="font-semibold">{{ item.kategori }}</p>
                                <p class="text-xs text-slate-500">{{ new Date(item.tanggal).toLocaleDateString('id-ID') }}</p>
                            </td>
                            <td class="px-4 py-3 text-sm text-slate-600">
                                <span v-if="!item.catatan">-</span>
                                <span v-else-if="item.catatan.length <= 30">{{ item.catatan }}</span>
                                <div v-else class="flex items-center justify-between">
                                    <span>{{ item.catatan.substring(0, 30) }}...</span>
                                    <button @click="showModal('viewNote', { title: 'Catatan Pengeluaran', content: item.catatan })" class="ml-2 text-xs bg-slate-200 font-bold py-1 px-2 rounded hover:bg-slate-300 flex-shrink-0">Lihat</button>
                                </div>
                            </td>
                            <td class="px-4 py-3 font-medium text-red-600">{{ formatCurrency(item.jumlah) }}</td>
                            <td class="px-4 py-3 text-center">
                                <button @click="showModal('editBiaya', { ...item })" class="text-xs bg-slate-100 font-bold py-1 px-2 rounded hover:bg-slate-200">Edit</button>
                                <button @click="deleteBiaya(item.id)" class="text-xs text-red-500 ml-2 hover:underline">Hapus</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div class="p-4 border-b bg-slate-50 rounded-t-xl">
                <div class="flex justify-between items-center">
                    <h3 class="text-lg font-semibold text-slate-800">Riwayat Pemasukan</h3>
                    <div class="flex gap-2">
                        <button @click="exportKeuangan('pemasukan')" class="bg-white border text-slate-700 font-bold py-1.5 px-3 rounded-md hover:bg-slate-100 text-sm">Export</button>
                        <button @click="showModal('addPemasukan', { tanggal: new Date().toISOString().split('T')[0], tipe: 'Modal Masuk', jumlah: null, catatan: '' })" class="bg-sky-500 text-white font-bold py-1.5 px-3 rounded-md hover:bg-sky-600 text-sm">Tambah Baru</button>
                    </div>
                </div>
                 <div class="mt-3">
    <select v-model="uiState.keuanganPemasukanFilter" class="w-full bg-white border border-slate-300 text-sm rounded-lg p-2 shadow-sm capitalize">
        <option value="today">hari ini</option>
        <option value="last_7_days">1 minggu terakhir</option>
        <option value="last_30_days">1 bulan terakhir</option>
        <option value="this_year">1 tahun terakhir</option>
        <option value="by_date_range">rentang tanggal</option>
        <option value="by_month_range">rentang bulan</option>
        <option value="by_year_range">rentang tahun</option>
        <option value="all_time">semua</option>
    </select>
    <div v-if="uiState.keuanganPemasukanFilter === 'by_date_range'" class="mt-2 flex items-center gap-2">
        <input type="date" v-model="uiState.keuanganPemasukanStartDate" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2">
        <span>s/d</span>
        <input type="date" v-model="uiState.keuanganPemasukanEndDate" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2">
    </div>
    <div v-if="uiState.keuanganPemasukanFilter === 'by_month_range'" class="mt-2 flex items-center gap-2">
        <select v-model.number="uiState.keuanganPemasukanStartMonth" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select>
        <input type="number" v-model.number="uiState.keuanganPemasukanStartYear" class="w-24 border-slate-300 text-sm rounded-lg p-2">
        <span class="mx-2">s/d</span>
        <select v-model.number="uiState.keuanganPemasukanEndMonth" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select>
        <input type="number" v-model.number="uiState.keuanganPemasukanEndYear" class="w-24 border-slate-300 text-sm rounded-lg p-2">
    </div>
    <div v-if="uiState.keuanganPemasukanFilter === 'by_year_range'" class="mt-2 flex items-center gap-2">
        <input type="number" v-model.number="uiState.keuanganPemasukanStartYear" placeholder="Dari Tahun" class="w-full border-slate-300 text-sm rounded-lg p-2">
        <span class="text-slate-500">s/d</span>
        <input type="number" v-model.number="uiState.keuanganPemasukanEndYear" placeholder="Sampai Tahun" class="w-full border-slate-300 text-sm rounded-lg p-2">
    </div>
</div>
            </div>
            <div class="relative max-h-[60vh] overflow-y-auto">
                <table class="w-full text-sm text-left text-slate-500">
                    <thead class="text-xs text-slate-700 uppercase bg-slate-100 sticky top-0">
                        <tr>
                            <th class="px-4 py-3">Detail</th>
                            <th class="px-4 py-3">Catatan</th>
                            <th class="px-4 py-3">Jumlah</th>
                            <th class="px-4 py-3 text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        <tr v-if="filteredPemasukan.length === 0">
                            <td colspan="4" class="p-4 text-center text-slate-500">Tidak ada data.</td>
                        </tr>
                        <tr v-for="item in filteredPemasukan" :key="item.id">
                            <td class="px-4 py-3">
                                <p class="font-semibold">{{ item.tipe }}</p>
                                <p class="text-xs text-slate-500">{{ new Date(item.tanggal).toLocaleDateString('id-ID') }}</p>
                            </td>
                            <td class="px-4 py-3 text-sm text-slate-600">
                                <span v-if="!item.catatan">-</span>
                                <span v-else-if="item.catatan.length <= 30">{{ item.catatan }}</span>
                                <div v-else class="flex items-center justify-between">
                                    <span>{{ item.catatan.substring(0, 30) }}...</span>
                                    <button @click="showModal('viewNote', { title: 'Catatan Pemasukan', content: item.catatan })" class="ml-2 text-xs bg-slate-200 font-bold py-1 px-2 rounded hover:bg-slate-300 flex-shrink-0">Lihat</button>
                                </div>
                            </td>
                            <td class="px-4 py-3 font-medium" :class="item.tipe === 'Ambilan Pribadi' ? 'text-orange-600' : 'text-green-600'">{{ formatCurrency(item.jumlah) }}</td>
                            <td class="px-4 py-3 text-center">
                                <button @click="showModal('editPemasukan', { ...item })" class="text-xs bg-slate-100 font-bold py-1 px-2 rounded hover:bg-slate-200">Edit</button>
                                <button @click="deletePemasukan(item.id)" class="text-xs text-red-500 ml-2 hover:underline">Hapus</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        
    </div>
</div>

<div v-if="activePage === 'retur'">
    <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
    <div class="flex items-center gap-4">
        <h2 class="text-3xl font-bold text-slate-800">Manajemen Retur</h2>
        <button @click="showModal('panduanRetur')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
            Informasi
        </button>
    </div>
    <button @click="showModal('addRetur', { tanggal: new Date().toISOString().split('T')[0], channelId: '', items: [] })" class="bg-orange-500 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-orange-600 shadow transition-colors">
        Tambah Retur
    </button>
</div>

    <div class="mb-6 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div class="relative">
    <label for="retur-search" class="block text-sm font-medium text-slate-700 mb-1">Cari (ID Retur, SKU, Nama, Alasan)</label>
    <input 
        v-model="uiState.returPageSearchQuery"
        @input="handleReturPageSearch"
        type="text" 
        id="retur-search" 
        placeholder="Ketik untuk mencari data retur..." 
        class="w-full p-2 border border-slate-300 rounded-md shadow-sm"
        autocomplete="off"
    >
    
    <div v-if="uiState.returPageSearchRecommendations.length > 0" class="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
        <div 
            v-for="(rec, index) in uiState.returPageSearchRecommendations" 
            :key="index" 
            @click="selectReturPageRecommendation(rec)" 
            class="p-2 px-3 hover:bg-slate-100 cursor-pointer text-sm"
        >
            {{ rec }}
        </div>
    </div>
</div>
            <div>
    <label for="retur-date-filter" class="block text-sm font-medium text-slate-700 mb-1">Filter Berdasarkan Tanggal</label>
    <div class="flex items-center gap-2">
        <select v-model="uiState.returPageDateFilter" id="retur-date-filter" class="w-full p-2 border border-slate-300 rounded-md shadow-sm capitalize">
            <option value="today">hari ini</option>
            <option value="last_7_days">1 minggu terakhir</option>
            <option value="last_30_days">1 bulan terakhir</option>
            <option value="this_year">1 tahun terakhir</option>
            <option value="by_date_range">rentang tanggal</option>
            <option value="by_month_range">rentang bulan</option>
            <option value="by_year_range">rentang tahun</option>
            <option value="all_time">semua</option>
        </select>
         <button @click="exportReturToExcel" id="export-retur-btn" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 h-10 flex-shrink-0">Export</button>
    </div>
    <div v-if="uiState.returPageDateFilter === 'by_date_range'" class="mt-2 flex items-center gap-2">
        <input type="date" v-model="uiState.returPageStartDate" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2">
        <span>s/d</span>
        <input type="date" v-model="uiState.returPageEndDate" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2">
    </div>
    <div v-if="uiState.returPageDateFilter === 'by_month_range'" class="mt-2 flex items-center gap-2">
        <select v-model.number="uiState.returPageStartMonth" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select>
        <input type="number" v-model.number="uiState.returPageStartYear" class="w-24 border-slate-300 text-sm rounded-lg p-2">
        <span class="mx-2">s/d</span>
        <select v-model.number="uiState.returPageEndMonth" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select>
        <input type="number" v-model.number="uiState.returPageEndYear" class="w-24 border-slate-300 text-sm rounded-lg p-2">
    </div>
    <div v-if="uiState.returPageDateFilter === 'by_year_range'" class="mt-2 flex items-center gap-2">
        <input type="number" v-model.number="uiState.returPageStartYear" placeholder="Dari Tahun" class="w-full border-slate-300 text-sm rounded-lg p-2">
        <span class="text-slate-500">s/d</span>
        <input type="number" v-model.number="uiState.returPageEndYear" placeholder="Sampai Tahun" class="w-full border-slate-300 text-sm rounded-lg p-2">
    </div>
</div>
        </div>
    </div>

    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table class="w-full text-sm text-left text-slate-500">
            <thead class="text-xs text-slate-700 uppercase bg-slate-50">
                <tr>
                    <th class="px-6 py-3">Tanggal</th>
                    <th class="px-6 py-3">Asal Toko</th>
                    <th class="px-6 py-3">Produk</th>
                    <th class="px-6 py-3 text-center">Qty</th>
                    <th class="px-6 py-3">Alasan</th>
                    <th class="px-6 py-3">Tindak Lanjut</th>
                    <th class="px-6 py-3 text-center">Aksi</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
    <tr v-if="filteredRetur.length === 0">
        <td colspan="7" class="p-10 text-center text-slate-500">Tidak ada data retur yang sesuai dengan filter.</td>
    </tr>
    <tr v-for="(item, index) in filteredRetur" :key="`${item.returnDocId}-${item.sku}-${index}`" class="hover:bg-slate-50">
        <td class="px-6 py-4 whitespace-nowrap">{{ new Date(item.tanggal).toLocaleDateString('id-ID') }}</td>
        <td class="px-6 py-4">{{ getMarketplaceById(item.channelId)?.name || 'N/A' }}</td>
        <td class="px-6 py-4">
            <p class="font-semibold">{{ getProductBySku(item.sku)?.nama || 'Produk tidak ditemukan' }}</p>
            <p class="font-mono text-xs text-slate-500">{{ item.sku }}</p>
        </td>
        <td class="px-6 py-4 font-medium text-center">{{ item.qty }}</td>
        <td class="px-6 py-4">{{ item.alasan }}</td>
        <td class="px-6 py-4">
            <span class="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                  :class="{
                    'bg-blue-100 text-blue-800': item.tindakLanjut === 'Tukar Ukuran',
                    'bg-cyan-100 text-cyan-800': item.tindakLanjut === 'Tukar Warna',
                    'bg-green-100 text-green-800': item.tindakLanjut === 'Ganti Baru',
                    'bg-yellow-100 text-yellow-800': item.tindakLanjut === 'Refund',
                    'bg-purple-100 text-purple-800': item.tindakLanjut === 'Perbaiki',
                  }">
                {{ item.tindakLanjut }}
            </span>
        </td>
        <td class="px-6 py-4 text-center space-x-2">
            <button @click="showModal('editRetur', state.retur.find(r => r.id === item.returnDocId))" class="text-xs bg-slate-100 font-bold py-1 px-2 rounded hover:bg-slate-200">Edit</button>
            <button @click="deleteReturnItem(item)" class="text-xs text-red-500 hover:underline">Hapus</button>
        </td>
    </tr>
</tbody>
        </table>
    </div>
</div>

<div v-if="activePage === 'pengaturan'">
    <h2 class="text-3xl font-bold text-slate-800 mb-6">Pengaturan Aplikasi</h2>
    
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        <div class="lg:col-span-2 space-y-8">
            <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
    <h3 class="text-lg font-semibold text-slate-800 mb-4">Pengaturan Umum</h3>
    <div class="space-y-4">
        <div>
            <label class="flex items-center text-sm font-medium text-slate-700 mb-1">
                <svg class="w-4 h-4 mr-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                Nama Brand Anda
            </label>
            <input type="text" v-model="state.settings.brandName" class="w-full p-2 border border-slate-300 rounded-md">
        </div>
        <div>
            <label class="flex items-center text-sm font-medium text-slate-700 mb-1">
               <svg class="w-4 h-4 mr-2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Batas Stok Minimum Peringatan
            </label>
            <input type="number" v-model.number="state.settings.minStok" class="w-full p-2 border border-slate-300 rounded-md">
        </div>

        <div class="border-t pt-4 mt-4">
            <button @click="saveGeneralSettings" :disabled="isSavingSettings" class="w-full bg-indigo-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed">
                <span v-if="isSavingSettings">Menyimpan...</span>
                <span v-else>Simpan Perubahan</span>
            </button>
        </div>
    </div>
</div>

            <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-semibold text-slate-800">Model Baju Default (Produksi)</h3>
                    <button @click="addModelBaju" class="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">+ Tambah Model</button>
                </div>
                <div class="mb-4">
                    <input type="text" v-model="uiState.pengaturanModelBajuSearch" placeholder="Cari nama model..." class="w-full p-2 border border-slate-300 rounded-md">
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="text-left text-slate-500">
                            <tr>
                                <th class="p-2 font-medium">NAMA MODEL</th>
                                <th class="p-2 font-medium">YARD/BAJU</th>
                                <th class="p-2 font-medium">HARGA MAKLUN</th>
                                <th class="p-2 font-medium text-right">AKSI</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200">
                            <tr v-if="filteredModelBaju.length === 0">
                                <td colspan="4" class="p-4 text-center text-slate-500">Tidak ada model yang cocok.</td>
                            </tr>
                            <tr v-for="model in filteredModelBaju" :key="model.id">
                                <td class="p-3 font-semibold text-slate-700">{{ model.namaModel }}</td>
                                <td class="p-3">{{ model.yardPerBaju }} m</td>
                                <td class="p-3">{{ formatCurrency(model.hargaMaklun) }}</td>
                                <td class="p-3 text-right space-x-4">
                                    <button @click="showModal('editModelBaju', JSON.parse(JSON.stringify(model)))" class="font-semibold text-blue-500 hover:underline">Edit</button>
                                    <button @click="removeModelBaju(model.id)" class="text-red-500 hover:text-red-700">
                                        <svg class="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div> 

        <div class="lg:col-span-1">
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm">
         <div class="p-4 border-b">
            <div class="flex justify-between items-center mb-3">
                <h3 class="text-lg font-semibold text-slate-800">Pengaturan Marketplace</h3>
                <button @click="addMarketplace" class="bg-green-500 text-white font-bold py-1 px-3 rounded-md hover:bg-green-600 text-sm">Tambah</button>
            </div>
            <input type="text" v-model="uiState.pengaturanMarketplaceSearch" placeholder="Cari nama marketplace..." class="w-full p-2 border border-slate-300 rounded-md">
        </div>
        <div class="space-y-4 p-4 max-h-[65vh] overflow-y-auto">
            <p v-if="filteredMarketplaces.length === 0" class="text-center text-slate-500 py-4">Tidak ada marketplace yang cocok.</p>
            
            <div v-for="mp in filteredMarketplaces" :key="mp.id" class="p-4 border rounded-lg bg-white shadow-sm">
                <div class="flex justify-between items-start mb-3">
                    <h4 class="font-bold text-slate-800 text-base">{{ mp.name }}</h4>
                    <div class="flex items-center gap-4">
                        <button @click="showModal('editMarketplace', JSON.parse(JSON.stringify(mp)))" class="text-xs font-semibold text-blue-500 hover:underline">Edit</button>
                        <button @click="removeMarketplace(mp.id)" class="text-red-500 hover:text-red-700">
                             <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <span class="text-slate-500">Adm:</span><span class="text-right font-semibold">{{ mp.adm }}%</span>
                    <span class="text-slate-500">Program:</span><span class="text-right font-semibold">{{ mp.program }}%</span>
                    <span class="text-slate-500">Layanan:</span><span class="text-right font-semibold">{{ mp.layanan }}%</span>
                    <span class="text-slate-500">Komisi:</span><span class="text-right font-semibold">{{ mp.komisi }}%</span>
                    <span class="text-slate-500">Voucher:</span><span class="text-right font-semibold">{{ mp.voucher }}%</span>
                    <span class="text-slate-500">Per Pesanan:</span><span class="text-right font-semibold">{{ formatCurrency(mp.perPesanan) }}</span>
                </div>
            </div>
        </div>
    </div>
</div>
    </div>
</div>
<div v-if="activePage === 'panduan'">
    <div class="mb-8">
        <h2 class="text-4xl font-bold text-slate-800">Pusat Bantuan</h2>
        <p class="text-slate-500 mt-2 text-lg">Temukan jawaban dan panduan untuk memaksimalkan potensi bisnis Anda.</p>
    </div>

    <div class="space-y-8">
        <div v-for="panduan in panduanData" :key="panduan.title">
            <div class="grid grid-cols-12 gap-4">
                <div class="col-span-1 text-3xl pt-1">{{ panduan.icon }}</div>
                <div class="col-span-11">
                    <h3 class="text-xl font-semibold text-slate-800">{{ panduan.title }}</h3>
                    <p class="text-slate-500 text-sm italic">{{ panduan.subtitle }}</p>
                    <div class="mt-2 text-sm text-slate-600 leading-relaxed" v-html="panduan.content"></div>
                </div>
            </div>
        </div>
    </div>
</div>
<div v-if="activePage === 'tentang'">
    <div class="max-w-4xl mx-auto bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-sm">
        <h2 class="text-3xl font-bold text-slate-800 border-b pb-4 mb-6">Tentang Aplikasi Fashion OS</h2>

        <div class="space-y-8 text-slate-700 leading-relaxed">
            
            <section>
                <h3 class="text-xl font-semibold text-slate-800 mb-2">Kebijakan Privasi dan Keamanan Data</h3>
                <p>Kami menempatkan keamanan dan privasi data Anda sebagai prioritas tertinggi. Aplikasi Fashion OS ini dirancang sebagai sistem yang berjalan sepenuhnya di sisi klien (client-side) dengan koneksi langsung ke layanan Google Firebase milik Anda. </p>
                <ul class="list-disc list-inside mt-4 space-y-2">
                    <li><strong>Tidak Ada Server Perantara:</strong> Kami tidak memiliki server perantara yang menampung atau memproses data Anda. Semua informasi yang Anda masukkan—mulai dari data produk, transaksi, hingga keuangan—dikirim secara langsung dan aman dari browser Anda ke proyek Firebase pribadi Anda.</li>
                    <li><strong>Kepemilikan Data Penuh:</strong> Anda memiliki kontrol dan kepemilikan penuh atas data Anda. Data bisnis Anda tersimpan secara eksklusif di dalam infrastruktur Google Firebase yang Anda kelola sendiri. Kami, sebagai pengembang aplikasi, tidak memiliki akses sama sekali ke informasi sensitif tersebut.</li>
                    <li><strong>Enkripsi Standar Industri:</strong> Komunikasi antara aplikasi dan server Firebase dienkripsi menggunakan protokol HTTPS/TLS standar industri, memastikan data Anda terlindungi selama transit.</li>
                </ul>
                <p class="mt-4 text-sm text-slate-500 italic">Kami berkomitmen untuk menjaga kerahasiaan dan integritas data operasional bisnis Anda, memberikan Anda ketenangan pikiran untuk fokus pada pengembangan usaha Anda.</p>
            </section>

            <section>
                <h3 class="text-xl font-semibold text-slate-800 mb-2">Informasi Aplikasi</h3>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                    <div class="bg-slate-50 p-4 rounded-lg">
                        <p class="font-semibold text-slate-600">Versi Aplikasi</p>
                        <p>1.0.0 (Build 20250806)</p>
                    </div>
                    <div class="bg-slate-50 p-4 rounded-lg">
                        <p class="font-semibold text-slate-600">Tanggal Rilis</p>
                        <p>masih dalam pengembangan</p>
                    </div>
                    <div class="bg-slate-50 p-4 rounded-lg">
                        <p class="font-semibold text-slate-600">Dikembangkan oleh</p>
                        <p>Arrasyid</p>
                    </div>
                </div>
            </section>

            <section>
                <h3 class="text-xl font-semibold text-slate-800 mb-2">Hak Cipta</h3>
                <p class="text-sm">Hak Cipta © 2025 Arrasyid. Seluruh hak cipta dilindungi undang-undang. Dilarang memperbanyak atau mendistribusikan kembali sebagian atau seluruh konten dari aplikasi ini dalam bentuk apa pun tanpa izin tertulis dari pemilik hak cipta.</p>
            </section>

        </div>
    </div>
</div>
<div v-if="activePage === 'langganan'">
    <div class="max-w-4xl mx-auto text-center py-12">
        <h2 class="text-3xl font-bold text-slate-800">Masa Percobaan Anda Telah Berakhir</h2>
        <p class="text-slate-600 mt-4 mb-8 max-w-xl mx-auto">
            Pilih paket di bawah ini untuk melanjutkan akses ke semua fitur dan kembangkan bisnis Anda bersama Fashion OS.
        </p>
        
        <div class="flex flex-col md:flex-row gap-8 justify-center">
            <div class="p-8 border-2 border-indigo-600 rounded-xl shadow-lg w-full md:w-80">
                <h3 class="text-xl font-semibold">Paket Bulanan</h3>
                <p class="text-4xl font-bold my-4">Rp 50.000 <span class="text-base font-normal">/bulan</span></p>
                <ul class="text-left space-y-2 text-slate-600">
                    <li>✔️ Akses semua fitur</li>
                    <li>✔️ Dukungan prioritas</li>
                    <li>✔️ Update berkala</li>
                </ul>
                <button @click="handleSubscription('bulanan')" class="mt-8 w-full bg-indigo-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-indigo-700">
                    Pilih Paket Bulanan
                </button>
            </div>

            <div class="p-8 border rounded-xl w-full md:w-80">
                <h3 class="text-xl font-semibold">Paket Tahunan</h3>
                <p class="text-4xl font-bold my-4">Rp 500.000 <span class="text-base font-normal">/tahun</span></p>
                 <ul class="text-left space-y-2 text-slate-600">
                    <li>✔️ Akses semua fitur</li>
                    <li>✔️ Dukungan prioritas</li>
                    <li>✔️ Update berkala</li>
                    <li>💰 <span class="font-semibold">Diskon 2 bulan!</span></li>
                </ul>
                <button @click="handleSubscription('tahunan')" class="mt-8 w-full bg-slate-800 text-white font-bold py-3 px-8 rounded-lg hover:bg-slate-700">
                    Pilih Paket Tahunan
                </button>
            </div>
        </div>
    </div>
</div>
</div>
</main>
    </div>

    <!-- Modal System -->
    <div v-if="uiState.isModalVisible" @click.self="hideModal" class="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-xl p-6 max-w-7xl w-full max-h-[90vh] flex flex-col">
        <div v-if="uiState.modalType === 'kpiHelp'"><h3 class="text-xl font-bold mb-2">{{ uiState.modalData.title }}</h3><p class="text-sm text-slate-500 mb-4">{{ uiState.modalData.description }}</p><div class="bg-slate-100 p-4 rounded-lg"><p class="text-sm font-medium">Rumus:</p><p class="font-mono text-sm mt-1">{{ uiState.modalData.formula }}</p></div><div class="flex justify-end mt-6"><button @click="hideModal" class="bg-slate-300 py-2 px-4 rounded-lg">Mengerti</button></div></div>
        <div v-if="uiState.modalType === 'confirmTransaction'">
    <h3 class="text-2xl font-bold mb-4">Konfirmasi Transaksi</h3>
    <p class="text-slate-600 mb-4">Anda akan menyelesaikan transaksi untuk channel <span class="font-semibold text-slate-800">{{ uiState.modalData.channelName }}</span>.</p>
    <div class="bg-slate-50 p-4 rounded-lg space-y-2 text-sm">
        <div class="flex justify-between"><span>Subtotal:</span><span>{{ formatCurrency(uiState.modalData.subtotal) }}</span></div>
        <div v-if="uiState.modalData.discount.totalDiscount > 0" class="flex justify-between text-green-600">
            <span>Diskon ({{ uiState.modalData.discount.description }}):</span>
            <span>-{{ formatCurrency(uiState.modalData.discount.totalDiscount) }}</span>
        </div>
        <div class="flex justify-between text-lg font-bold pt-2 border-t mt-2">
            <span>Total Belanja:</span>
            <span>{{ formatCurrency(uiState.modalData.finalTotal) }}</span>
        </div>
    </div>
    <p class="mt-4 text-sm text-slate-600">Apakah Anda yakin ingin melanjutkan?</p>
    <div class="flex justify-end gap-3 mt-6">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Batal</button>
        <button @click="executeCompleteTransaction" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">Ya, Selesaikan</button>
    </div>
</div>
<div v-if="uiState.modalType === 'addProduct'">
    <h3 class="text-xl font-bold mb-2">Tambah Produk Baru</h3>
    <p class="text-sm text-slate-500 mb-4">Harga jual spesifik untuk tiap channel dapat diatur di halaman 'Harga & HPP' setelah produk ditambahkan.</p>
    <form @submit.prevent="submitAddProduct" class="space-y-4 overflow-y-auto max-h-[75vh] p-2">
        <div>
            <label for="product-sku" class="block text-sm font-medium text-slate-700">SKU (Stock Keeping Unit)</label>
            <input type="text" v-model="uiState.modalData.sku" id="product-sku" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm" placeholder="Contoh: TSH-BL-M001" required>
        </div>
        <div>
            <label for="product-name" class="block text-sm font-medium text-slate-700">Nama Produk</label>
            <input type="text" v-model="uiState.modalData.nama" id="product-name" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm" placeholder="Contoh: Kaos Polos" required>
        </div>
        <div>
            <label for="product-color" class="block text-sm font-medium text-slate-700">Warna</label>
            <input type="text" v-model="uiState.modalData.warna" id="product-color" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm" placeholder="Contoh: Hitam" required>
        </div>
         <div>
            <label for="product-variant" class="block text-sm font-medium text-slate-700">Varian (Ukuran/Model)</label>
            <input type="text" v-model="uiState.modalData.varian" id="product-variant" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm" placeholder="Contoh: M, L, XL" required>
        </div>
        <div>
            <label for="product-hpp" class="block text-sm font-medium text-slate-700">Harga Pokok Produksi (HPP)</label>
            <input type="number" v-model.number="uiState.modalData.hpp" id="product-hpp" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm" placeholder="Contoh: 55000" required>
        </div>
        <div>
            <label for="product-harga-jual" class="block text-sm font-medium text-slate-700">Harga Jual Default</label>
            <input type="number" v-model.number="uiState.modalData.hargaJualDefault" id="product-harga-jual" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm" placeholder="Contoh: 120000" required>
        </div>
        <div class="flex justify-end gap-3 mt-6">
            <button type="button" @click="hideModal" class="bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-400">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">Tambah Produk</button>
        </div>
    </form>
</div>

<div v-if="uiState.modalType === 'addStockIn'">
    <h3 class="text-xl font-bold mb-4">Tambah Stok Masuk</h3>
    <form @submit.prevent="submitAddStockIn" class="space-y-4">
        <div class="relative">
    <label for="stock-in-sku" class="block text-sm font-medium text-slate-700">Cari SKU Produk</label>
    <input 
        type="text" 
        v-model="uiState.modalData.sku" 
        @input="handleStockInSearch"
        id="stock-in-sku" 
        class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm" 
        placeholder="Ketik SKU atau Nama Produk..." 
        required 
        autocomplete="off"
    >
    <div v-if="uiState.stockInSearchRecommendations.length > 0" class="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
        <div 
            v-for="p in uiState.stockInSearchRecommendations" 
            :key="p.sku" 
            @click="selectStockInRecommendation(p)" 
            class="p-3 hover:bg-slate-100 cursor-pointer border-b last:border-b-0"
        >
            <p class="font-semibold text-slate-800">{{ p.nama }}</p>
            <p class="text-sm text-slate-500">
                {{ p.sku }} - {{ p.warna }} - {{ p.varian }} | <span class="font-medium">Stok: {{ p.stokFisik }}</span>
            </p>
        </div>
    </div>
</div>
        <div>
            <label for="stock-in-qty" class="block text-sm font-medium text-slate-700">Jumlah Stok Masuk</label>
            <input type="number" v-model.number="uiState.modalData.qty" id="stock-in-qty" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm" placeholder="Contoh: 50" required>
        </div>
        <div>
            <label for="stock-in-reason" class="block text-sm font-medium text-slate-700">Alasan Stok Masuk</label>
            <select v-model="uiState.modalData.alasan" id="stock-in-reason" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm" required>
                <option value="" disabled>Pilih Alasan</option>
                <option value="Produksi Selesai">Produksi Selesai</option>
                <option value="Retur dari Pelanggan">Retur dari Pelanggan</option>
                <option value="Penyesuaian Inventaris">Penyesuaian Inventaris</option>
                <option value="Lain-lain">Lain-lain</option>
            </select>
        </div>
        <div class="flex justify-end gap-3 mt-6">
            <button type="button" @click="hideModal" class="bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-400">Batal</button>
            <button type="submit" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700">Catat Stok Masuk</button>
        </div>
    </form>
</div>
<div v-if="uiState.modalType === 'transactionDetail' && transactionDetails">
    <div class="flex justify-between items-start mb-4">
        <div>
            <h3 class="text-2xl font-bold text-slate-800">Detail Transaksi</h3>
            <p class="text-sm text-slate-500 font-mono">{{ transactionDetails.id }}</p>
        </div>
        <div class="text-right">
            <p class="text-sm font-semibold text-slate-700">{{ new Date(transactionDetails.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }}</p>
            <p class="text-sm text-slate-500">{{ transactionDetails.channel }}</p>
        </div>
    </div>

    <div class="max-h-[65vh] overflow-y-auto -mx-6 px-6 py-4 border-t border-b">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div class="space-y-4">
                <div>
                    <h4 class="font-semibold text-slate-700 mb-2">Produk Terjual:</h4>
                    <ul class="space-y-2 text-sm text-slate-600">
                        <li v-for="item in transactionDetails.items" :key="item.sku" class="flex justify-between p-2 bg-slate-50 rounded-md">
                            <span>{{ item.qty }}x {{ getProductBySku(item.sku)?.nama || item.sku }}</span>
                            <span class="font-semibold">{{ formatCurrency(item.hargaJual * item.qty) }}</span>
                        </li>
                    </ul>
                </div>
                <div class="p-4 rounded-lg bg-indigo-50 border border-indigo-200 text-center">
                    <p class="text-sm font-semibold text-indigo-800">Estimasi Laba Bersih Transaksi Ini:</p>
                    <p class="text-3xl font-bold text-indigo-700 my-1">{{ formatCurrency(transactionDetails.labaBersih) }}</p>
                    <p class="text-xs text-indigo-600">(Total Belanja - Total HPP - Total Biaya Marketplace)</p>
                </div>
            </div>
            <div class="space-y-4">
                <div>
                    <h4 class="font-semibold text-slate-700 mb-2">Ringkasan Pembayaran:</h4>
                    <div class="bg-slate-50 p-3 rounded-lg space-y-1 text-sm">
                        <div class="flex justify-between"><span>Subtotal</span><span>{{ formatCurrency(transactionDetails.subtotal) }}</span></div>
                        <div v-if="transactionDetails.diskon.totalDiscount > 0" class="flex justify-between text-green-600">
                            <span>Diskon ({{ transactionDetails.diskon.description }})</span>
                            <span>-{{ formatCurrency(transactionDetails.diskon.totalDiscount) }}</span>
                        </div>
                        <div class="flex justify-between font-bold text-base border-t pt-2 mt-2"><span>Total Belanja</span><span>{{ formatCurrency(transactionDetails.total) }}</span></div>
                    </div>
                </div>
                <div>
                    <h4 class="font-semibold text-slate-700 mb-2">Rincian Biaya Marketplace:</h4>
                     <div class="bg-slate-50 p-3 rounded-lg space-y-1 text-sm">
                        <div class="flex justify-between"><span>Biaya Administrasi</span><span>{{ formatCurrency(transactionDetails.biaya.adm) }}</span></div>
                        <div class="flex justify-between"><span>Biaya Program</span><span>{{ formatCurrency(transactionDetails.biaya.program) }}</span></div>
                        <div class="flex justify-between"><span>Biaya Komisi</span><span>{{ formatCurrency(transactionDetails.biaya.komisi) }}</span></div>
                        <div class="flex justify-between"><span>Biaya Voucher</span><span>{{ formatCurrency(transactionDetails.biaya.voucher) }}</span></div>
                        <div class="flex justify-between"><span>Biaya per Pesanan</span><span>{{ formatCurrency(transactionDetails.biaya.perPesanan) }}</span></div>
                        <div class="flex justify-between font-bold text-base border-t pt-2 mt-2 text-red-600"><span>Total Biaya</span><span>-{{ formatCurrency(transactionDetails.totalBiayaMarketplace) }}</span></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
    <button @click="exportLaporanSemuaToExcel" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700">
        📄 Export ke Excel
    </button>
    <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">
        Tutup
    </button>
</div>
</div>
<div v-if="uiState.modalType === 'addKain' || uiState.modalType === 'editKain'">
    <h3 class="text-xl font-bold mb-4">{{ uiState.modalType === 'addKain' ? 'Tambah Stok Kain Baru' : 'Edit Data Kain' }}</h3>
    <form @submit.prevent="submitKain(uiState.modalType === 'editKain')" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium">Tanggal Beli</label>
                <input type="date" v-model="uiState.modalData.tanggalBeli" class="mt-1 w-full p-2 border rounded-md" required>
            </div>
            <div>
                <label class="block text-sm font-medium">Nama Kain</label>
                <input type="text" v-model="uiState.modalData.namaKain" placeholder="Contoh: Cotton Combed 30s" class="mt-1 w-full p-2 border rounded-md" required>
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium">Warna Kain</label>
                <input type="text" v-model="uiState.modalData.warna" placeholder="Contoh: Hitam Pekat" class="mt-1 w-full p-2 border rounded-md" required>
            </div>
            <div>
                <label class="block text-sm font-medium">Toko Pembelian</label>
                <input type="text" v-model="uiState.modalData.toko" placeholder="Contoh: Toko Kain Abadi" class="mt-1 w-full p-2 border rounded-md">
            </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium">Jumlah Beli (Yard)</label>
                <input type="number" step="0.1" v-model.number="uiState.modalData.sisaYard" placeholder="Contoh: 150.5" class="mt-1 w-full p-2 border rounded-md" required>
            </div>
            <div>
                <label class="block text-sm font-medium">Harga Beli per Yard (Rp)</label>
                <input type="number" v-model.number="uiState.modalData.hargaBeliPerYard" placeholder="Contoh: 25500" class="mt-1 w-full p-2 border rounded-md" required>
            </div>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan</button>
        </div>
    </form>
</div>
        <div v-if="uiState.modalType === 'scannerHelp'">
    <h3 class="text-2xl font-bold text-slate-800 mb-2">Panduan Alur Kerja Pemindaian Barcode</h3>
    <p class="text-slate-500 mb-6">Optimalkan kecepatan dan akurasi transaksi Anda dengan alur kerja pemindaian barcode yang efisien.</p>

    <div class="space-y-6 text-slate-700 p-2 overflow-y-auto max-h-[70vh]">
        <div class="p-5 bg-slate-50 rounded-lg border border-slate-200">
            <h4 class="font-semibold text-lg text-indigo-700">Metode 1: Pemindai Barcode Fisik (Direkomendasikan)</h4>
            <p class="mt-2 text-sm leading-relaxed">
                Ini adalah standar industri untuk kecepatan dan keandalan. Alur kerjanya dirancang untuk menjadi secepat kilat:
            </p>
            <ol class="list-decimal list-inside mt-3 space-y-2 text-sm">
                <li><strong>Aktivasi Kolom Pencarian:</strong> Cukup klik satu kali pada kolom pencarian utama untuk mengaktifkannya.</li>
                <li><strong>Pindai Barcode Produk:</strong> Arahkan pemindai ke barcode pada label produk.</li>
                <li><strong>Proses Otomatis:</strong> Sistem akan secara instan membaca SKU, menemukan produk yang cocok, dan secara otomatis menambahkannya ke dalam keranjang. Tidak ada pengetikan manual, tidak ada kesalahan.</li>
            </ol>
        </div>

        <div class="p-5 bg-slate-50 rounded-lg border border-slate-200">
            <h4 class="font-semibold text-lg text-indigo-700">Metode 2: Ponsel sebagai Pemindai Nirkabel</h4>
            <p class="mt-2 text-sm leading-relaxed">
                Untuk fleksibilitas atau sebagai solusi cadangan, Anda dapat mengubah ponsel cerdas Anda menjadi pemindai barcode yang terhubung ke komputer.
            </p>
            <ol class="list-decimal list-inside mt-3 space-y-2 text-sm">
                <li><strong>Instalasi Aplikasi:</strong> Unduh aplikasi pihak ketiga yang berfungsi sebagai jembatan, seperti <strong>"Barcode to PC"</strong> atau <strong>"Scanner Keyboard"</strong> di ponsel dan komputer Anda.</li>
                <li><strong>Hubungkan Perangkat:</strong> Pastikan ponsel dan komputer terhubung ke jaringan Wi-Fi yang sama, lalu ikuti instruksi aplikasi untuk menyinkronkannya.</li>
                <li><strong>Pindai dengan Kamera:</strong> Setelah terhubung, buka aplikasi di ponsel Anda dan gunakan kamera untuk memindai barcode. SKU akan dikirim secara nirkabel ke kolom pencarian di aplikasi kasir ini.</li>
            </ol>
        </div>
    </div>

    <div class="flex justify-end mt-6 pt-4 border-t">
        <button type="button" @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Mengerti</button>
    </div>
</div>

<div v-if="uiState.modalType === 'specialPrice'">
    <h3 class="text-2xl font-bold text-slate-800 mb-4">Atur Harga Spesial (Flash Sale)</h3>
    <div class="space-y-4">
        <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Pilih Channel Penjualan</label>
            <select v-model="uiState.specialPriceChannel" class="w-full p-2 border border-slate-300 rounded-md bg-white shadow-sm">
                <option v-for="channel in state.settings.marketplaces" :key="channel.id" :value="channel.id">
                    {{ channel.name }}
                </option>
            </select>
        </div>
        <div class="relative">
            <label class="block text-sm font-medium text-slate-700 mb-1">Cari Produk (SKU, Nama, Warna, Ukuran)</label>
            <input 
                type="text" 
                v-model="uiState.specialPriceSearch"
                @input="handleSpecialPriceSearch"
                placeholder="Ketik untuk mencari..."
                class="w-full p-2 border border-slate-300 rounded-md"
                autocomplete="off"
            >
            <div v-if="uiState.specialPriceRecommendations.length > 0" class="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                <div v-for="p in uiState.specialPriceRecommendations" :key="p.sku" @click="selectProductForSpecialPrice(p)" class="p-3 hover:bg-slate-100 cursor-pointer border-b last:border-b-0">
    <p class="font-semibold text-slate-800">{{ p.nama }}</p>
    <p class="text-xs text-slate-500">{{ p.sku }} - {{ p.warna }} - {{ p.varian }}</p>
</div>
            </div>
        </div>

        <div v-if="uiState.selectedProductForSpecialPrice" class="pt-4 border-t space-y-3">
            <div class="p-3 bg-indigo-50 rounded-lg">
                <p class="text-sm font-medium text-indigo-800">Produk Terpilih:</p>
                <p class="font-bold text-slate-800">{{ uiState.selectedProductForSpecialPrice.nama }} - {{ uiState.selectedProductForSpecialPrice.varian }}</p>
                <p class="text-xs text-slate-500">Harga Jual Normal: {{ formatCurrency(uiState.selectedProductForSpecialPrice.hargaJual[uiState.specialPriceChannel] || 0) }}</p>
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Masukkan Harga Spesial (Rp)</label>
                <input 
                    type="number" 
                    v-model.number="uiState.specialPriceInput"
                    placeholder="Contoh: 99000" 
                    class="w-full p-2 border border-indigo-300 rounded-md text-lg font-bold"
                >
            </div>
        </div>
    </div>
    <div class="flex justify-between items-center mt-6 pt-4 border-t">
        <button @click="showModal('manageSpecialPrices')" class="text-sm text-blue-600 hover:underline">Lihat & Hapus Harga Spesial</button>
        <div class="flex gap-3">
            <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
            <button @click="saveSpecialPrice" :disabled="!uiState.selectedProductForSpecialPrice || !uiState.specialPriceInput" class="bg-amber-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-amber-600 disabled:bg-amber-300 disabled:cursor-not-allowed">Simpan Harga</button>
        </div>
    </div>
</div>

<div v-if="uiState.modalType === 'manageSpecialPrices'">
    <h3 class="text-2xl font-bold text-slate-800 mb-4">Kelola Harga Spesial Aktif</h3>
    <p class="mb-4 text-sm text-slate-600">Channel: <span class="font-semibold">{{ state.settings.marketplaces.find(mp => mp.id === uiState.specialPriceChannel)?.name }}</span></p>

    <div class="max-h-[60vh] overflow-y-auto space-y-2 p-2 bg-slate-50 border rounded-md">
        <p v-if="!state.specialPrices[uiState.specialPriceChannel] || Object.keys(state.specialPrices[uiState.specialPriceChannel]).length === 0" class="text-center text-slate-500 p-4">
            Tidak ada harga spesial yang aktif untuk channel ini.
        </p>
        <div v-else v-for="(price, sku) in state.specialPrices[uiState.specialPriceChannel]" :key="sku" class="flex justify-between items-center p-3 bg-white border rounded-md shadow-sm">
    <div>
        <p class="font-semibold text-slate-800">{{ getProductBySku(sku)?.nama }} ({{ sku }})</p>
        <p class="text-sm text-slate-600 mt-1">
            Normal: <span class="line-through">{{ formatCurrency(getProductBySku(sku)?.hargaJual[uiState.specialPriceChannel] || 0) }}</span> -> <span class="font-bold text-green-600">Spesial: {{ formatCurrency(price) }}</span>
        </p>
    </div>
    <button @click="deleteSpecialPrice(uiState.specialPriceChannel, sku)" class="bg-red-100 text-red-700 font-semibold py-1 px-3 rounded-md hover:bg-red-200 text-sm">Hapus</button>
</div>
    </div>

    <div class="flex justify-end mt-6 pt-4 border-t">
        <button @click="showModal('specialPrice')" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Kembali</button>
    </div>
</div>

<div v-if="uiState.modalType === 'produksiDetail'">
    <h3 class="text-xl font-bold mb-4">Detail Batch Produksi: {{ uiState.modalData.id }}</h3>
    <div class="space-y-4 text-slate-700 max-h-[70vh] overflow-y-auto p-2 text-sm">
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 p-4 bg-slate-50 rounded-lg">
            <div>
                <p><strong>Tanggal Produksi:</strong> {{ new Date(uiState.modalData.tanggal).toLocaleDateString('id-ID') }}</p>
                <p><strong>Produk:</strong> {{ uiState.modalData.namaProduk }}</p>
                <p><strong>Pemaklun:</strong> {{ uiState.modalData.namaPemaklun }}</p>
                <p><strong>Kuantitas Jadi (Total):</strong> {{ produksiDetailComputed.totalAktualJadi }} pcs</p>
                <p><strong>Kuantitas Perbaikan (Total):</strong> {{ uiState.modalData.kuantitasPerbaikan || 0 }} pcs</p>
            </div>
            <div class="text-left md:text-right">
                <p><strong>Total Harga Jasa Maklun:</strong> {{ formatCurrency(uiState.modalData.totalHargaJasaMaklun) }}</p>
                <p><strong>Rata-rata Harga Jasa Maklun/Pcs:</strong> {{ formatCurrency(uiState.modalData.totalHargaJasaMaklun / (produksiDetailComputed.totalAktualJadi || 1)) }}</p>
                <p><strong>Total Biaya Material:</strong> {{ formatCurrency(uiState.modalData.totalBiayaMaterial) }}</p>
                <p><strong>Status Proses:</strong> <span class="font-semibold text-green-600">{{ uiState.modalData.statusProses }}</span></p>
                <p><strong>Admin:</strong> {{ uiState.modalData.admin }}</p>
            </div>
        </div>

        <div class="border-t pt-3 mt-3">
            <h4 class="text-lg font-semibold mb-2">Informasi Pembayaran</h4>
            <p><strong>Status Pembayaran:</strong> {{ uiState.modalData.statusPembayaran }}</p>
            <div v-if="uiState.modalData.statusPembayaran === 'Sudah Dibayar'">
                <p><strong>Jumlah Pembayaran:</strong> {{ formatCurrency(uiState.modalData.jumlahPembayaran) }}</p>
                <p><strong>Tanggal Pembayaran:</strong> {{ new Date(uiState.modalData.tanggalPembayaran).toLocaleDateString('id-ID') }}</p>
            </div>
        </div>

        <div class="border-t pt-3 mt-3">
            <h4 class="text-lg font-semibold mb-2">Detail Kain & Bahan</h4>
            <div v-if="!uiState.modalData.kainBahan || uiState.modalData.kainBahan.length === 0" class="text-slate-500">Tidak ada data kain.</div>
            <div v-for="(kb, index) in uiState.modalData.kainBahan" :key="index" class="mb-3 p-4 bg-slate-50 rounded-lg border">
                <p class="font-bold text-base text-slate-800">{{ kb.namaKain }}</p>
                <ul class="list-disc list-inside ml-4 text-slate-600 space-y-1 mt-2">
                    <li><strong>Model Baju:</strong> {{ state.settings.modelBaju.find(m => m.id === kb.modelBajuId)?.namaModel || 'N/A' }}</li>
                    <li><strong>Warna Kain:</strong> {{ kb.warnaKain || '-' }}</li>
                    <li><strong>Ukuran:</strong> {{ kb.ukuran || '-' }}</li>
                    <li><strong>Toko Kain:</strong> {{ kb.tokoKain || '-' }}</li>
                    <li><strong>Total Yard:</strong> {{ kb.totalYard || 0 }} yard @ {{ formatCurrency(kb.hargaKainPerYard || 0) }}/yard</li>
                    <li><strong>Yard/Baju:</strong> {{ kb.yardPerBaju || 0 }} yard/baju</li>
                    <li><strong>Target Qty:</strong> {{ Math.floor((kb.totalYard || 0) / (kb.yardPerBaju || 1)) }} pcs</li>
                    <li class="font-semibold text-slate-800"><strong>Aktual Jadi:</strong> {{ kb.aktualJadi || 0 }} pcs, Harga Maklun/Pcs: {{ formatCurrency(kb.hargaMaklunPerPcs || 0) }}</li>
                    <li v-if="kb.aktualJadiKombinasi > 0"><strong>Aktual Jadi Kombinasi:</strong> {{ kb.aktualJadiKombinasi }} pcs</li>
                </ul>
            </div>
        </div>
        
        <div class="border-t pt-3 mt-3">
            <h4 class="text-lg font-semibold mb-2">Catatan</h4>
            <p>{{ uiState.modalData.catatan || '-' }}</p>
        </div>
    </div>
    <div class="flex justify-end gap-3 mt-6 border-t pt-4">
      <button @click="printProduksiDetail(uiState.modalData)" class="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700">Cetak</button>
      <button @click="exportProduksiDetailToExcel(uiState.modalData)" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700">Export laporan</button>
      <button @click="hideModal" class="bg-slate-300 py-2 px-4 rounded-lg hover:bg-slate-400">Tutup</button>
    </div>
</div>

<div v-if="uiState.modalType === 'addBiaya' || uiState.modalType === 'editBiaya'">
    <h3 class="text-xl font-bold mb-4">{{ uiState.modalType === 'addBiaya' ? 'Tambah Pengeluaran Baru' : 'Edit Pengeluaran' }}</h3>
    <form @submit.prevent="submitBiaya(uiState.modalType === 'editBiaya')" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium">Tanggal</label>
                <input type="date" v-model="uiState.modalData.tanggal" class="mt-1 w-full p-2 border rounded-md" required>
            </div>
            <div>
                <label class="block text-sm font-medium">Kategori</label>
                <input type="text" v-model="uiState.modalData.kategori" placeholder="Contoh: Biaya Listrik" class="mt-1 w-full p-2 border rounded-md" required>
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium">Jumlah (Rp)</label>
            <input type="number" v-model.number="uiState.modalData.jumlah" placeholder="Contoh: 500000" class="mt-1 w-full p-2 border rounded-md" required>
        </div>
        <div>
            <label class="block text-sm font-medium">Catatan (Opsional)</label>
            <textarea v-model="uiState.modalData.catatan" rows="3" class="mt-1 w-full p-2 border rounded-md"></textarea>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan</button>
        </div>
    </form>
</div>

<div v-if="uiState.modalType === 'addPemasukan' || uiState.modalType === 'editPemasukan'">
    <h3 class="text-xl font-bold mb-4">{{ uiState.modalType === 'addPemasukan' ? 'Tambah Pemasukan Baru' : 'Edit Pemasukan' }}</h3>
    <form @submit.prevent="submitPemasukan(uiState.modalType === 'editPemasukan')" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium">Tanggal</label>
                <input type="date" v-model="uiState.modalData.tanggal" class="mt-1 w-full p-2 border rounded-md" required>
            </div>
            <div>
                <label class="block text-sm font-medium">Tipe Pemasukan</label>
                <input type="text" v-model="uiState.modalData.tipe" class="mt-1 w-full p-2 border rounded-md bg-slate-100 text-slate-700" readonly>
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium">Jumlah (Rp)</label>
            <input type="number" v-model.number="uiState.modalData.jumlah" placeholder="Contoh: 10000000" class="mt-1 w-full p-2 border rounded-md" required>
        </div>
        <div>
            <label class="block text-sm font-medium">Catatan (Opsional)</label>
            <textarea v-model="uiState.modalData.catatan" rows="3" class="mt-1 w-full p-2 border rounded-md"></textarea>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan</button>
        </div>
    </form>
</div>

<div v-if="uiState.modalType === 'viewNote'">
    <h3 class="text-xl font-bold mb-4">{{ uiState.modalData.title }}</h3>
    <div class="max-h-[60vh] overflow-y-auto p-4 bg-slate-50 rounded-lg border">
        <p class="text-slate-700 whitespace-pre-wrap">{{ uiState.modalData.content }}</p>
    </div>
    <div class="flex justify-end mt-6 border-t pt-4">
        <button @click="hideModal" class="bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-400">Tutup</button>
    </div>
</div>
<div v-if="uiState.modalType === 'ringkasanJadi'">
    <h3 class="text-xl font-bold mb-4">Ringkasan Total Aktual Jadi Kuantitas</h3>
    <div class="mb-4">
        <label for="ringkasan-status-filter" class="block text-sm font-medium text-slate-700 mb-1">Pilih Status Produksi</label>
        <select v-model="uiState.ringkasanStatusSelected" id="ringkasan-status-filter" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm">
            <option value="all">Semua Status</option>
            <option value="Selesai">Selesai</option>
            <option value="Dalam Proses">Dalam Proses</option>
            <option value="Revisi">Revisi</option>
            <option value="Ditunda">Ditunda</option>
        </select>
    </div>
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto max-h-[70vh]">
        <table class="w-full text-sm text-left text-slate-500">
            <thead class="text-xs text-slate-700 uppercase bg-slate-100 sticky top-0">
                <tr>
                    <th class="px-6 py-3">Tanggal</th>
                    <th class="px-6 py-3">Pemaklun</th>
                    <th class="px-6 py-3">Model Baju</th>
                    <th class="px-6 py-3">Nama Kain</th>
                    <th class="px-6 py-3">Warna</th>
                    <th class="px-6 py-3">Ukuran</th>
                    <th class="px-6 py-3 text-right">Total Aktual Jadi</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                <tr v-if="ringkasanJadiData.length === 0">
                    <td colspan="7" class="px-6 py-10 text-center text-slate-500">Tidak ada data untuk status ini.</td>
                </tr>
                <tr v-for="(item, index) in ringkasanJadiData" :key="index">
                    <td class="px-6 py-4">{{ new Date(item.tanggal).toLocaleDateString('id-ID') }}</td>
                    <td class="px-6 py-4">{{ item.pemaklun }}</td>
                    <td class="px-6 py-4 font-medium text-slate-800">{{ item.model }}</td>
                    <td class="px-6 py-4">{{ item.kain }}</td>
                    <td class="px-6 py-4">{{ item.warna }}</td>
                    <td class="px-6 py-4">{{ item.ukuran }}</td>
                    <td class="px-6 py-4 text-right font-bold">{{ item.total }} pcs</td>
                </tr>
            </tbody>
        </table>
    </div>
    <div class="flex justify-end mt-6 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-400">Tutup</button>
    </div>
</div>
<div v-if="uiState.modalType === 'addRetur' || uiState.modalType === 'editRetur'">
    <h3 class="text-xl font-bold mb-4">{{ uiState.modalType === 'addRetur' ? 'Tambah Data Retur' : 'Edit Data Retur' }}</h3>
    <form @submit.prevent="submitReturForm" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border">
            <div>
                <label class="block text-sm font-medium">Tanggal Retur</label>
                <input type="date" v-model="uiState.modalData.tanggal" class="mt-1 w-full p-2 border rounded-md" required>
            </div>
            <div>
                <label class="block text-sm font-medium">Asal Toko / Marketplace</label>
                <select v-model="uiState.modalData.channelId" class="mt-1 w-full p-2 border rounded-md" required>
                    <option disabled value="">-- Pilih Toko --</option>
                    <option v-for="mp in state.settings.marketplaces" :key="mp.id" :value="mp.id">{{ mp.name }}</option>
                </select>
            </div>
        </div>

        <div class="relative">
            <label class="block text-sm font-medium">Cari & Tambah Produk (SKU / Nama)</label>
            <input type="text" v-model="uiState.returSearchQuery" @input="handleReturSearch" placeholder="Ketik untuk mencari produk..." class="mt-1 w-full p-2 border rounded-md" autocomplete="off">
            <div v-if="uiState.returSearchRecommendations.length > 0" class="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                <div v-for="p in uiState.returSearchRecommendations" :key="p.sku" @click="selectReturRecommendation(p)" class="p-3 hover:bg-slate-100 cursor-pointer border-b last:border-b-0">
                    <p class="font-semibold text-slate-800">{{ p.nama }}</p>
                    <p class="text-sm text-slate-500">{{ p.sku }} - {{ p.warna }} - {{ p.varian }}</p>
                </div>
            </div>
        </div>

        <div class="space-y-3 max-h-[40vh] overflow-y-auto p-2 border-t border-b">
            <p v-if="!uiState.modalData.items || uiState.modalData.items.length === 0" class="text-center py-4 text-slate-500">Belum ada produk yang ditambahkan.</p>

            <div v-for="(item, index) in uiState.modalData.items" :key="index" class="p-4 border rounded-lg bg-white shadow-sm relative">
                <div class="mb-3 p-2 bg-slate-100 rounded-md">
                    <p class="text-xs font-medium text-slate-500">SKU Dipilih:</p>
                    <p class="font-semibold text-slate-800">{{ getProductBySku(item.sku)?.nama || 'Produk tidak ditemukan' }}</p>
                    <p class="font-mono text-xs text-slate-600">{{ item.sku }}</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                        <label class="block text-xs font-medium">Jumlah (Qty)</label>
                        <input type="number" v-model.number="item.qty" min="1" class="mt-1 w-full p-2 text-sm border rounded-md" required>
                    </div>
                    <div>
                        <label class="block text-xs font-medium">Alasan Retur</label>
                        <input type="text" v-model="item.alasan" class="mt-1 w-full p-2 text-sm border rounded-md">
                    </div>
                    <div>
                        <label class="block text-xs font-medium">Tindak Lanjut</label>
                        <select v-model="item.tindakLanjut" class="mt-1 w-full p-2 text-sm border rounded-md" required>
                            <option>Ganti Baru</option><option>Tukar Ukuran</option><option>Tukar Warna</option><option>Refund</option><option>Perbaiki</option>
                        </select>
                    </div>
                </div>
                <div class="mt-3 text-right">
                    <button @click="removeReturItem(index)" type="button" class="text-xs text-red-500 hover:underline font-semibold">Hapus Item Ini</button>
                </div>
            </div>
        </div>

        <div class="flex justify-end gap-3 pt-4 border-t">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan Data Retur</button>
        </div>
    </form>
</div>

<div v-if="uiState.modalType === 'kelolaStok'">
    <h3 class="text-xl font-bold text-slate-800 mb-1">Kelola Stok & Alokasi</h3>
    <p class="text-sm text-slate-500 mb-6" v-if="uiState.modalData.original">
        {{ uiState.modalData.original.nama }} ({{ uiState.modalData.original.sku }})
    </p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="space-y-2">
            <h4 class="font-semibold text-slate-700">Stok Master</h4>
            <div>
                <label class="block text-sm font-medium text-slate-600">Total Stok Fisik di Gudang</label>
                <input type="number" v-model.number="uiState.modalData.product.stokFisik" class="mt-1 w-full p-2 border border-slate-300 rounded-md font-bold text-lg">
            </div>
        </div>
        <div class="space-y-2">
            <h4 class="font-semibold text-slate-700">Alokasi Stok per Channel</h4>
            <div class="space-y-2">
                <div v-for="mp in state.settings.marketplaces" :key="mp.id" class="flex justify-between items-center">
                    <label class="text-sm text-slate-600">{{ mp.name }}</label>
                    <input type="number" v-model.number="uiState.modalData.product.stokAlokasi[mp.id]" class="w-28 p-1.5 border border-slate-300 rounded-md text-right">
                </div>
            </div>
            <div class="mt-4 pt-4 border-t text-sm space-y-2">
                <div class="flex justify-between items-center">
                    <span class="text-slate-500">Teralokasi:</span>
                    <span class="font-semibold text-slate-800 text-base">{{ modalStockSummary.teralokasi }}</span>
                </div>
                <div class="flex justify-between items-center" :class="modalStockSummary.belumTeralokasi < 0 ? 'text-red-500' : 'text-slate-800'">
                    <span class="text-slate-500">Belum Teralokasi:</span>
                    <span class="font-bold text-base">{{ modalStockSummary.belumTeralokasi }}</span>
                </div>
            </div>
        </div>
    </div>
    <div class="flex justify-end gap-3 mt-8 pt-4 border-t">
        <button type="button" @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Batal</button>
        <button type="button" @click="saveStockAllocation" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">Simpan Perubahan</button>
    </div>
</div>

<div v-if="uiState.modalType === 'editModelBaju'">
    <h3 class="text-xl font-bold mb-4">Edit Model Baju</h3>
    <form @submit.prevent="saveModelBajuEdit" class="space-y-4">
        <div>
            <label class="block text-sm font-medium text-slate-700">Nama Model</label>
            <input type="text" v-model="uiState.modalData.namaModel" class="mt-1 w-full p-2 border rounded-md">
        </div>
        <div>
            <label class="block text-sm font-medium text-slate-700">Kebutuhan Kain (Yard/Baju)</label>
            <input type="number" step="0.1" v-model.number="uiState.modalData.yardPerBaju" class="mt-1 w-full p-2 border rounded-md">
        </div>
        <div>
            <label class="block text-sm font-medium text-slate-700">Harga Jasa Maklun (Rp)</label>
            <input type="number" v-model.number="uiState.modalData.hargaMaklun" class="mt-1 w-full p-2 border rounded-md">
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Simpan Perubahan</button>
        </div>
    </form>
</div>

<div v-if="uiState.modalType === 'editMarketplace'">
    <h3 class="text-xl font-bold mb-4">Edit Marketplace</h3>
    <form @submit.prevent="saveMarketplaceEdit" class="space-y-4">
        <div>
            <label class="block text-sm font-medium text-slate-700">Nama Marketplace</label>
            <input type="text" v-model="uiState.modalData.name" class="mt-1 w-full p-2 border rounded-md">
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><label class="block text-sm font-medium">Adm (%)</label><input type="number" v-model.number="uiState.modalData.adm" class="w-full p-2 border rounded-md"></div>
            <div><label class="block text-sm font-medium">Program (%)</label><input type="number" v-model.number="uiState.modalData.program" class="w-full p-2 border rounded-md"></div>
            <div><label class="block text-sm font-medium">Layanan (%)</label><input type="number" v-model.number="uiState.modalData.layanan" class="w-full p-2 border rounded-md"></div>
            <div><label class="block text-sm font-medium">Komisi (%)</label><input type="number" v-model.number="uiState.modalData.komisi" class="w-full p-2 border rounded-md"></div>
            <div><label class="block text-sm font-medium">Voucher (%)</label><input type="number" v-model.number="uiState.modalData.voucher" class="w-full p-2 border rounded-md"></div>
            <div><label class="block text-sm font-medium">Per Pesanan (Rp)</label><input type="number" v-model.number="uiState.modalData.perPesanan" class="w-full p-2 border rounded-md"></div>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Simpan Perubahan</button>
        </div>
    </form>
</div>


<div v-if="uiState.modalType === 'addProduksi'">
    <div class="flex items-center gap-4 mb-4">
        <h3 class="text-xl font-bold">Buat Batch Produksi Baru</h3>
        <button @click.stop="showNestedModal('panduanProduksi')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
            Informasi
        </button>
    </div>
    <form @submit.prevent="submitNewProduksiBatch" class="space-y-4 overflow-y-auto max-h-[80vh] p-2">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-slate-700">Tanggal Produksi</label>
                <input type="date" v-model="uiState.newProduksiBatch.tanggal" class="mt-1 block w-full p-2 border rounded-md" required>
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-700">Nama Pemaklun</label>
                <input type="text" v-model="uiState.newProduksiBatch.namaPemaklun" class="mt-1 block w-full p-2 border rounded-md" placeholder="Contoh: Jahit Cepat Abadi" required>
            </div>
        </div>

        <div class="border-t pt-4">
            <h4 class="text-lg font-semibold mb-2">Detail Kain & Bahan</h4>
            <div class="space-y-4">
                <div v-for="(item, index) in uiState.newProduksiBatch.kainBahan" :key="index" class="p-4 border rounded-lg bg-slate-50 relative">
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
                        <div class="space-y-3">
                            <div class="grid grid-cols-2 gap-3">
                                <div><label class="block text-xs font-medium">Model Baju</label><select v-model="item.modelBajuId" @change="handleModelBajuChange(item)" class="mt-1 w-full p-2 text-sm border rounded-md bg-white"><option value="">Pilih Model</option><option v-for="model in state.settings.modelBaju" :key="model.id" :value="model.id">{{ model.namaModel }}</option></select></div>
                                <div><label class="block text-xs font-medium">Nama Kain</label><input v-model="item.namaKain" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Toko Kain</label><input v-model="item.tokoKain" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Warna Kain</label><input v-model="item.warnaKain" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Ukuran</label><input v-model="item.ukuran" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Total Yard</label><input v-model.number="item.totalYard" type="number" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Harga/Yard</label><input v-model.number="item.hargaKainPerYard" type="number" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Harga Maklun/Pcs</label><input v-model.number="item.hargaMaklunPerPcs" type="number" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div class="col-span-2"><label class="block text-xs font-medium">Biaya Alat-Alat (Rp)</label><input v-model.number="item.biayaAlat" type="number" placeholder="Plastik, kancing, dll." class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div class="col-span-2 space-y-2">
                                    <div>
                                        <label class="block text-xs font-medium">Aktual Jadi</label>
                                        <div class="flex items-center gap-2">
                                            <span class="bg-indigo-100 text-indigo-800 font-bold px-2 py-1 rounded-md text-xs">{{ item.idUnik }}</span>
                                            <input v-model.number="item.aktualJadi" type="number" class="w-full p-2 text-sm border rounded-md" placeholder="Jumlah jadi utama">
                                        </div>
                                    </div>
                                    <div>
                                        <label class="block text-xs font-medium">Aktual Jadi Kombinasi (pcs)</label>
                                        <div class="flex items-center gap-2">
                                            <span class="bg-purple-100 text-purple-800 font-bold px-2 py-1 rounded-md text-xs">{{ item.idUnik }}</span>
                                            <input v-model.number="item.aktualJadiKombinasi" type="number" class="w-full p-2 text-sm border rounded-md" placeholder="Jumlah jadi sampingan">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h5 class="font-semibold mb-2 text-center">Ringkasan Biaya Baris Ini</h5>
                            <div v-if="item.aktualJadi > 0" class="p-3 bg-slate-50 rounded-lg border text-sm">
                                <h6 class="font-semibold text-blue-700">Ringkasan Hasil Utama</h6>
                                <div class="flex justify-between mt-2"><span class="text-slate-600">Target Qty:</span><span class="font-medium">{{ calculateRowSummary(item).targetQty }} pcs</span></div>
                                <div class="flex justify-between font-bold" :class="calculateRowSummary(item).selisih < 0 ? 'text-red-500' : 'text-emerald-600'">
                                    <span>Selisih (Aktual - Target):</span>
                                    <span>{{ calculateRowSummary(item).selisih >= 0 ? '+' : '' }}{{ calculateRowSummary(item).selisih }} pcs</span>
                                </div>
                                <hr class="my-2">
                                <div class="flex justify-between"><span class="text-slate-600">Total Biaya Kain:</span><span class="font-medium">{{ formatCurrency(calculateRowSummary(item).totalBiayaKain) }}</span></div>
                                <div class="flex justify-between"><span class="text-slate-600">Total Biaya Maklun:</span><span class="font-medium">{{ formatCurrency(calculateRowSummary(item).totalBiayaMaklun) }}</span></div>
                                <div class="flex justify-between"><span class="text-slate-600">Total Biaya Alat:</span><span class="font-medium">{{ formatCurrency(calculateRowSummary(item).totalBiayaAlat) }}</span></div>
                                <div class="flex justify-between font-bold text-base text-red-600 border-t pt-2 mt-2">
                                    <span>HPP/Pcs (Termasuk Rugi):</span>
                                    <span>{{ formatCurrency(calculateRowSummary(item).hpp) }}</span>
                                </div>
                            </div>
                            <div v-else-if="item.aktualJadiKombinasi > 0" class="p-3 bg-purple-50 rounded-lg border border-purple-200 text-sm">
                                <h6 class="font-semibold text-purple-700">Ringkasan Hasil Kombinasi</h6>
                                <div class="flex justify-between mt-2"><span class="text-slate-600">Target Qty:</span><span class="font-medium">{{ calculateRowSummary(item).targetQty }} pcs</span></div>
                                <div class="flex justify-between font-bold" :class="calculateRowSummary(item).selisih < 0 ? 'text-red-500' : 'text-emerald-600'">
                                    <span>Selisih (Aktual - Target):</span>
                                    <span>{{ calculateRowSummary(item).selisih >= 0 ? '+' : '' }}{{ calculateRowSummary(item).selisih }} pcs</span>
                                </div>
                                <hr class="my-2">
                                <div class="flex justify-between"><span class="text-slate-600">Total Biaya Kain:</span><span class="font-medium">{{ formatCurrency(calculateRowSummary(item).totalBiayaKain) }}</span></div>
                                <div class="flex justify-between"><span class="text-slate-600">Total Biaya Maklun:</span><span class="font-medium">{{ formatCurrency(calculateRowSummary(item).totalBiayaMaklun) }}</span></div>
                                <div class="flex justify-between"><span class="text-slate-600">Total Biaya Alat:</span><span class="font-medium">{{ formatCurrency(calculateRowSummary(item).totalBiayaAlat) }}</span></div>
                                <div class="flex justify-between font-bold text-base text-red-600 border-t pt-2 mt-2">
                                    <span>HPP/Pcs (Termasuk Rugi):</span>
                                    <span>{{ formatCurrency(calculateRowSummary(item).hpp) }}</span>
                                </div>
                            </div>
                            <p v-else class="text-center text-slate-500 p-8">Isi data di formulir untuk melihat ringkasan biaya.</p>
                        </div>
                    </div>
                    <button v-if="uiState.newProduksiBatch.kainBahan && uiState.newProduksiBatch.kainBahan.length > 1" @click="removeKainBahanItem(uiState.newProduksiBatch, index)" type="button" class="absolute top-2 right-2 bg-red-500 text-white rounded-full h-5 w-5 text-xs flex items-center justify-center font-bold">×</button>
                </div>
            </div>
            <button @click="addKainBahanItem(uiState.newProduksiBatch)" type="button" class="mt-3 text-sm text-blue-600 hover:underline">+ Tambah Kain & Bahan Lain</button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4 mt-4">
            <div><label class="block text-sm font-medium text-slate-700">Status Pembayaran</label><select v-model="uiState.newProduksiBatch.statusPembayaran" class="w-full p-2 border rounded-md mt-1"><option>Belum Dibayar</option><option>Sudah Dibayar</option></select></div>
            <div v-if="uiState.newProduksiBatch.statusPembayaran === 'Sudah Dibayar'"><label class="block text-sm font-medium text-slate-700">Jumlah Pembayaran</label><input v-model.number="uiState.newProduksiBatch.jumlahPembayaran" type="number" class="w-full p-2 border rounded-md mt-1"></div>
            <div v-if="uiState.newProduksiBatch.statusPembayaran === 'Sudah Dibayar'"><label class="block text-sm font-medium text-slate-700">Tanggal Pembayaran</label><input v-model="uiState.newProduksiBatch.tanggalPembayaran" type="date" class="w-full p-2 border rounded-md mt-1"></div>
        </div>
        <div><label class="block text-sm font-medium text-slate-700">Catatan</label><textarea v-model="uiState.newProduksiBatch.catatan" rows="2" class="mt-1 block w-full p-2 border rounded-md"></textarea></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label class="block text-sm font-medium text-slate-700">Status Proses</label><select v-model="uiState.newProduksiBatch.statusProses" class="w-full p-2 border rounded-md mt-1"><option>Dalam Proses</option><option>Selesai</option><option>Revisi</option><option>Ditunda</option></select></div>
            <div><label class="block text-sm font-medium text-slate-700">Admin (Opsional)</label><input v-model="uiState.newProduksiBatch.orangMemproses" type="text" class="mt-1 block w-full p-2 border rounded-md"></div>
        </div>
        <div class="flex justify-end gap-3 mt-6 border-t pt-4">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan Batch Produksi</button>
        </div>
    </form>
</div>
<div v-if="uiState.nestedModalType === 'panduanProduksi'" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-3xl w-4/5 max-h-[90vh] flex flex-col">
        <div class="flex-shrink-0 pb-4 border-b">
            <h3 class="text-2xl font-bold text-slate-800">Panduan Penggunaan: Aktual Jadi vs. Aktual Jadi Kombinasi</h3>
            <p class="text-slate-500">Dokumen ini menjelaskan perbedaan fungsional untuk memastikan pencatatan biaya dan kuantitas yang akurat.</p>
        </div>

        <div class="flex-1 overflow-y-auto py-4 pr-2">
            <div class="space-y-6 text-slate-700 leading-relaxed">
                <div>
                    <h4 class="text-xl font-semibold">1. Aktual Jadi</h4>
                    <p class="mt-2">Gunakan kolom <strong>"Aktual Jadi"</strong> ketika satu produk (contoh: 1 baju) dibuat sepenuhnya dari satu jenis bahan kain utama.</p>
                    <p>Kolom ini berfungsi sebagai sumber data utama untuk perhitungan final. Semua biaya krusial dan jumlah total produk jadi akan dihitung berdasarkan input di sini.</p>
                    <ul class="list-disc list-inside space-y-1 mt-2">
                        <li><strong>Kapan digunakan:</strong> Produksi standar, seperti kaos yang seluruh bagiannya terbuat dari bahan yang sama dan warna yang sama.</li>
                        <li><strong>Peran:</strong> Menentukan jumlah akhir produk jadi dan menjadi dasar kalkulasi semua biaya produksi.</li>
                    </ul>
                </div>

                <div>
                    <h4 class="text-xl font-semibold">2. Aktual Jadi Kombinasi</h4>
                    <p class="mt-2">Gunakan kolom <strong>"Aktual Jadi Kombinasi"</strong> untuk mencatat penggunaan bahan kain sekunder atau tambahan dalam pembuatan satu produk yang sama.</p>
                    <p><strong>Aturan Penggunaan:</strong></p>
                    <ul class="list-disc list-inside space-y-1 mt-2">
                        <li><strong>Bahan Utama/Dominan:</strong> Data untuk bahan yang paling banyak digunakan (misalnya, kain untuk bagian badan baju) harus dimasukkan ke dalam kolom "Aktual Jadi".</li>
                        <li><strong>Bahan Sekunder:</strong> Data untuk bahan campuran / bahan yang sama tapi berbeda warna (misalnya, kain untuk bagian lengan) dimasukkan ke dalam kolom "Aktual Jadi Kombinasi".</li>
                    </ul>
                    <ul class="list-disc list-inside space-y-1 mt-2">
                        <li><strong>Kapan digunakan:</strong> Produksi produk dengan variasi bahan, seperti dikategori fashion dengan badan katun dan lengan rayon / bagian badan bahan katun dan tangan bahan bahan katun tapi warna yang membedakanya.</li>
                        <li><strong>Peran:</strong> Mencatat biaya material tambahan tanpa memengaruhi perhitungan utama untuk biaya jasa dan peralatan.</li>
                    </ul>
                </div>

                <div>
                    <h4 class="text-xl font-semibold">Peringatan Penting</h4>
                    <ul class="list-none space-y-2 mt-2">
                        <li class="p-3 bg-red-100 text-red-800 border-l-4 border-red-500">
                            <strong>❌ Jangan menggunakan kedua kolom sekaligus!</strong><br>
                            Pilih salah satu input ("Aktual Jadi" atau "Aktual Jadi Kombinasi") untuk setiap baris bahan. Jika Anda ingin menambah data retur dengan SKU yang sama, klik <strong>"+ Tambah Kain & Bahan Lain"</strong>.
                        </li>
                        <li class="p-3 bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500">
                            <strong>ℹ️ Catatan Penting untuk Sisa Kain:</strong><br>
                            Jika ada sisa kain yang belum terpotong, catat kode unik kain tersebut. Jika nanti sisa kain itu dipotong dan menjadi produk jadi, cari kode uniknya di halaman <strong>Edit Batch Produksi</strong> untuk menambahkan total hasil jadinya. Namun, jika sisa kain diarahkan untuk model lain, jangan jadikan kode uniknya sebagai acuan analisis selisih tertinggi, karena data tersebut tidak relevan untuk analisis batch awal.
                        </li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
            <button @click="hideNestedModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
        </div>
    </div>
</div>

<div v-if="uiState.modalType === 'editProduksi'">
    <h3 class="text-xl font-bold mb-4">Edit Batch Produksi: {{ uiState.editProduksiBatch.id }}</h3>
    <form @submit.prevent="submitEditProduksiBatch" class="space-y-4 overflow-y-auto max-h-[80vh] p-2">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-slate-700">Tanggal Produksi</label>
                <input type="date" v-model="uiState.editProduksiBatch.tanggal" class="mt-1 block w-full p-2 border rounded-md" required>
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-700">Nama Pemaklun</label>
                <input type="text" v-model="uiState.editProduksiBatch.namaPemaklun" class="mt-1 block w-full p-2 border rounded-md" required>
            </div>
        </div>
        
        <div class="border-t pt-4">
            <h4 class="text-lg font-semibold mb-2">Detail Kain & Bahan</h4>
            <div class="space-y-4">
                <div v-for="(item, index) in uiState.editProduksiBatch.kainBahan" :key="index" class="p-4 border rounded-lg bg-slate-50 relative">
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
                        <div class="space-y-3">
                            <div class="grid grid-cols-2 gap-3">
                                <div><label class="block text-xs font-medium">Model Baju</label><select v-model="item.modelBajuId" @change="handleModelBajuChange(item)" class="mt-1 w-full p-2 text-sm border rounded-md bg-white"><option value="">Pilih Model</option><option v-for="model in state.settings.modelBaju" :key="model.id" :value="model.id">{{ model.namaModel }}</option></select></div>
                                <div><label class="block text-xs font-medium">Nama Kain</label><input v-model="item.namaKain" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Toko Kain</label><input v-model="item.tokoKain" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Warna Kain</label><input v-model="item.warnaKain" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Ukuran</label><input v-model="item.ukuran" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Total Yard</label><input v-model.number="item.totalYard" type="number" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Harga/Yard</label><input v-model.number="item.hargaKainPerYard" type="number" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Harga Maklun/Pcs</label><input v-model.number="item.hargaMaklunPerPcs" type="number" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div class="col-span-2"><label class="block text-xs font-medium">Biaya Alat-Alat (Rp)</label><input v-model.number="item.biayaAlat" type="number" placeholder="Plastik, kancing, dll." class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div class="col-span-2 space-y-2">
    <div>
        <label class="block text-xs font-medium">Aktual Jadi</label>
        <div class="flex items-center gap-2">
            <span class="bg-indigo-100 text-indigo-800 font-bold px-2 py-1 rounded-md text-xs">{{ item.idUnik }}</span>
            <input v-model.number="item.aktualJadi" type="number" class="w-full p-2 text-sm border rounded-md" placeholder="Jumlah jadi utama">
        </div>
    </div>
    <div>
        <label class="block text-xs font-medium">Aktual Jadi Kombinasi (pcs)</label>
        <div class="flex items-center gap-2">
            <span class="bg-purple-100 text-purple-800 font-bold px-2 py-1 rounded-md text-xs">{{ item.idUnik }}</span>
            <input v-model.number="item.aktualJadiKombinasi" type="number" class="w-full p-2 text-sm border rounded-md" placeholder="Jumlah komponen pelengkap">
        </div>
    </div>
</div>
                            </div>
                        </div>

                        <div>
    <div class="p-4 bg-white rounded-lg space-y-2 text-sm h-full border sticky top-0">
        <h5 class="font-semibold mb-2 text-center">Ringkasan Biaya Baris Ini</h5>
        
        <div class="flex justify-between mt-2">
            <span class="text-slate-600">Target Qty:</span>
            <span class="font-medium">{{ calculateRowSummary(item).targetQty }} pcs</span>
        </div>
        <div class="flex justify-between font-bold" :class="calculateRowSummary(item).selisih < 0 ? 'text-red-500' : 'text-emerald-600'">
            <span>Selisih (Aktual - Target):</span>
            <span>{{ calculateRowSummary(item).selisih >= 0 ? '+' : '' }}{{ calculateRowSummary(item).selisih }} pcs</span>
        </div>
        <hr class="my-2">
        <div class="flex justify-between">
            <span class="text-slate-600">Total Biaya Kain:</span>
            <span class="font-medium">{{ formatCurrency((item.totalYard || 0) * (item.hargaKainPerYard || 0)) }}</span>
        </div>
        <div class="flex justify-between">
            <span class="text-slate-600">Total Biaya Maklun:</span>
            <span class="font-medium">{{ formatCurrency(calculateRowSummary(item).totalBiayaMaklun) }}</span>
        </div>
        <div class="flex justify-between">
            <span class="text-slate-600">Total Biaya Alat:</span>
            <span class="font-medium">{{ formatCurrency(calculateRowSummary(item).totalBiayaAlat) }}</span>
        </div>
        <div class="flex justify-between font-bold text-base text-red-600 border-t pt-2 mt-2">
            <span>HPP/Pcs (Termasuk Rugi):</span>
            <span>{{ formatCurrency(calculateRowSummary(item).hpp) }}</span>
        </div>
    </div>
</div>
                    </div>
                    <button v-if="uiState.editProduksiBatch.kainBahan && uiState.editProduksiBatch.kainBahan.length > 1" @click="removeKainBahanItem(uiState.editProduksiBatch, index)" type="button" class="absolute top-2 right-2 bg-red-500 text-white rounded-full h-5 w-5 text-xs flex items-center justify-center font-bold">×</button>
                </div>
            </div>
            <button @click="addKainBahanItem(uiState.editProduksiBatch)" type="button" class="mt-3 text-sm text-blue-600 hover:underline">+ Tambah Kain & Bahan Lain</button>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4 mt-4">
            <div><label class="block text-sm font-medium text-slate-700">Status Pembayaran</label><select v-model="uiState.editProduksiBatch.statusPembayaran" class="w-full p-2 border rounded-md mt-1"><option>Belum Dibayar</option><option>Sudah Dibayar</option></select></div>
            <div v-if="uiState.editProduksiBatch.statusPembayaran === 'Sudah Dibayar'"><label class="block text-sm font-medium text-slate-700">Jumlah Pembayaran</label><input v-model.number="uiState.editProduksiBatch.jumlahPembayaran" type="number" class="w-full p-2 border rounded-md mt-1"></div>
            <div v-if="uiState.editProduksiBatch.statusPembayaran === 'Sudah Dibayar'"><label class="block text-sm font-medium text-slate-700">Tanggal Pembayaran</label><input v-model="uiState.editProduksiBatch.tanggalPembayaran" type="date" class="w-full p-2 border rounded-md mt-1"></div>
        </div>
        <div><label class="block text-sm font-medium text-slate-700">Catatan</label><textarea v-model="uiState.editProduksiBatch.catatan" rows="2" class="mt-1 block w-full p-2 border rounded-md"></textarea></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><label class="block text-sm font-medium text-slate-700">Status Proses</label><select v-model="uiState.editProduksiBatch.statusProses" class="w-full p-2 border rounded-md mt-1"><option>Dalam Proses</option><option>Selesai</option><option>Revisi</option><option>Ditunda</option></select></div>
            <div><label class="block text-sm font-medium text-slate-700">Admin (Opsional)</label><input v-model="uiState.editProduksiBatch.orangMemproses" type="text" class="mt-1 block w-full p-2 border rounded-md"></div>
        </div>
        <div class="flex justify-end gap-3 mt-6 border-t pt-4">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan Perubahan</button>
        </div>
    </form>
</div>

<div v-if="uiState.modalType === 'analisisModel'">
    <h3 class="text-2xl font-bold mb-4 text-slate-800">🔍 Analisis Model Produksi</h3>
    <p class="text-slate-500 mb-6">Analisis efisiensi dan HPP rill untuk setiap hasil produksi.</p>
    
    <div class="mb-6 p-4 bg-slate-50 rounded-lg border">
    <label class="block text-sm font-medium text-slate-700 mb-1">Filter Analisis Selisih Tertinggi</label>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
            <select v-model="uiState.analisisModelFilter" class="w-full p-2 border rounded-md bg-white shadow-sm">
                <option value="none" disabled>-- Pilih Opsi Analisis --</option>
                <option value="all">Tampilkan Semua Data</option>
                <option value="model">Analisis per Model Baju</option>
            </select>
        </div>

        <div v-if="uiState.analisisModelFilter === 'model'">
            <select v-model="uiState.analisisModelSelectedModel" class="w-full p-2 border rounded-md bg-white shadow-sm">
                <option value="" disabled>-- Pilih Model Baju --</option>
                <option v-for="model in state.settings.modelBaju" :key="model.id" :value="model.id">{{ model.namaModel }}</option>
            </select>
        </div>

        <div v-if="uiState.analisisModelFilter === 'model' && uiState.analisisModelSelectedModel">
            <select v-model="uiState.analisisModelSelectedType" class="w-full p-2 border rounded-md bg-white shadow-sm">
                <option value="aktualJadi">Aktual Jadi</option>
                <option value="aktualJadiKombinasi">Aktual Jadi Kombinasi</option>
            </select>
        </div>
    </div>
</div>

    <div class="bg-white rounded-lg border shadow-sm overflow-x-auto max-h-[60vh]">
        <table class="w-full text-sm text-left text-slate-500">
            <thead class="text-xs text-slate-700 uppercase bg-slate-100 sticky top-0">
    <tr>
        <th class="px-4 py-3">Info Produksi</th>
        <th class="px-4 py-3">Toko Kain</th>
        <th class="px-4 py-3">Nama Kain</th>
        <th class="px-4 py-3">Warna</th>
        <th class="px-4 py-3">Ukuran</th>
        <th class="px-4 py-3 text-center">Target</th>
        <th class="px-4 py-3 text-center" :class="{ 'text-green-600': uiState.analisisModelSelectedType === 'aktualJadi', 'text-purple-600': uiState.analisisModelSelectedType === 'aktualJadiKombinasi' }">
    Aktual
</th>
        <th class="px-4 py-3 text-center bg-yellow-100 text-yellow-800">Selisih</th>
        <th class="px-4 py-3 text-right bg-red-100 text-red-800">HPP/Pcs</th>
    </tr>
</thead>
<tbody class="divide-y divide-slate-100">
    <tr v-if="analisisModelData.length === 0">
        <td colspan="9" class="p-10 text-center text-slate-500">Tidak ada data produksi yang cocok.</td>
    </tr>
    <tr v-for="(item, index) in analisisModelData" :key="index" class="hover:bg-slate-50">
        <td class="px-4 py-3">
            <p class="font-semibold text-slate-800">{{ item.modelNama }}</p>
            <p class="text-xs">{{ new Date(item.tanggal).toLocaleDateString('id-ID') }}</p>
            <p class="text-xs text-indigo-600">{{ item.namaPemaklun }}</p>
        </td>
        <td class="px-4 py-3">{{ item.tokoKain }}</td>
        <td class="px-4 py-3 font-medium">{{ item.namaKain }}</td>
        <td class="px-4 py-3">{{ item.warnaKain }}</td>
        <td class="px-4 py-3">{{ item.ukuran }}</td>
        <td class="px-4 py-3 text-center font-medium text-slate-700">{{ item.targetQty }} pcs</td>
        <td class="px-4 py-3 text-center font-semibold" :class="{ 'text-green-700': uiState.analisisModelSelectedType === 'aktualJadi', 'text-purple-700': uiState.analisisModelSelectedType === 'aktualJadiKombinasi' }">
    {{ item.aktualFinal || 0 }} pcs
</td>
        <td class="px-4 py-3 text-center font-bold text-lg" :class="item.selisih < 0 ? 'text-red-500' : 'text-emerald-600'">
            {{ item.selisih >= 0 ? '+' : '' }}{{ item.selisih }}
        </td>
        <td class="px-4 py-3 text-right font-bold text-red-600">{{ formatCurrency(item.hpp) }}</td>
    </tr>
</tbody>
        </table>
    </div>
    
    <div class="flex justify-end mt-6 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-400">Tutup</button>
    </div>
</div>

<div v-if="uiState.modalType === 'laporanStatus'">
    <h3 class="text-xl font-bold mb-4">Buat Laporan Detail Berdasarkan Status</h3>
    <div class="space-y-4">
        <div>
            <label for="report-status-select" class="block text-sm font-medium text-slate-700 mb-1">Pilih Status Produksi</label>
            <select v-model="uiState.laporanStatusSelected" id="report-status-select" class="mt-1 block w-full p-3 border border-slate-300 rounded-md shadow-sm">
                <option value="all">Semua Status</option>
                <option value="Dalam Proses">Dalam Proses</option>
                <option value="Selesai">Selesai</option>
                <option value="Revisi">Revisi</option>
                <option value="Ditunda">Ditunda</option>
            </select>
        </div>
    </div>
    <div class="flex justify-end gap-3 mt-6">
        <button type="button" @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Batal</button>
        <button type="button" @click="generateLaporanByStatus(uiState.laporanStatusSelected)" class="bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-700">Lihat Laporan</button>
    </div>
</div>

<div v-if="uiState.modalType === 'laporanStatusDetail'">
    <h3 class="text-xl font-bold mb-4">Laporan Detail Gabungan - Status: {{ uiState.laporanData.statusTerpilih }}</h3>
    
    <div class="p-4 mb-4 bg-blue-100 border border-blue-300 rounded-lg text-center">
        <p class="text-sm font-medium text-blue-800">Total Keseluruhan Biaya Maklun (Status: {{ uiState.laporanData.statusTerpilih }})</p>
        <p class="text-3xl font-bold text-blue-900">{{ formatCurrency(laporanTotalBiayaMaklun) }}</p>
    </div>

    <div class="max-h-[60vh] overflow-y-auto p-2 space-y-4 bg-slate-100 border rounded-md">
        <p v-if="uiState.laporanData.laporanPerStatus.length === 0" class="text-center py-8 text-slate-500">Tidak ada data untuk status ini.</p>
        
        <div v-for="batch in uiState.laporanData.laporanPerStatus" :key="batch.id" class="p-4 border rounded-lg bg-white shadow-sm">
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-bold text-indigo-700">ID Batch: {{ batch.id }} (Pemaklun: {{ batch.namaPemaklun }})</p>
                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full mt-1 inline-block"
                        :class="{
                            'bg-green-100 text-green-800': batch.statusProses === 'Selesai',
                            'bg-blue-100 text-blue-800': batch.statusProses === 'Dalam Proses',
                            'bg-yellow-100 text-yellow-800': batch.statusProses === 'Revisi',
                            'bg-gray-100 text-gray-800': batch.statusProses === 'Ditunda',
                        }">
                        {{ batch.statusProses }}
                    </span>
                </div>
                <div class="text-right">
                    <p class="text-sm text-slate-500">Subtotal Biaya Maklun</p>
                    <p class="font-bold text-lg text-green-600">{{ formatCurrency(batch.totalHargaJasaMaklun) }}</p>
                </div>
            </div>
            
            <div class="border-t mt-3 pt-3">
                <h5 class="font-semibold text-sm mb-2">Detail Kain & Bahan:</h5>
                <div class="space-y-2">
                    <div v-for="(kb, index) in batch.kainBahan" :key="index" class="text-xs p-3 bg-slate-50 rounded-md border">
                        <p class="font-semibold">{{ kb.namaKain }}</p>
                        <ul class="list-disc list-inside ml-4 text-slate-600 space-y-1 mt-1">
                            <li>Model Baju: {{ state.settings.modelBaju.find(m => m.id === kb.modelBajuId)?.namaModel || 'N/A' }}</li>
                            <li>Warna Kain: {{ kb.warnaKain || '-' }}</li>
                            <li>Ukuran: {{ kb.ukuran || '-' }}</li>
                            <li>Toko Kain: {{ kb.tokoKain || '-' }}</li>
                            <li>Total Yard: {{ kb.totalYard || 0 }} yard @ {{ formatCurrency(kb.hargaKainPerYard || 0) }}/yard</li>
                            <li>Yard/Baju: {{ kb.yardPerBaju || 0 }} yard/baju</li>
                            <li>Target Qty: {{ Math.floor((kb.totalYard || 0) / (kb.yardPerBaju || 1)) }} pcs</li>
                            <li class="font-medium text-slate-800">Aktual Jadi: {{ kb.aktualJadi || 0 }} pcs, Harga Maklun/Pcs: {{ formatCurrency(kb.hargaMaklunPerPcs || 0) }} <span class="font-bold text-blue-600">(Total: {{ formatCurrency((kb.aktualJadi || 0) * (kb.hargaMaklunPerPcs || 0)) }})</span></li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="border-t mt-3 pt-3">
                <h5 class="font-semibold text-sm mb-1">Catatan</h5>
                <p class="text-sm text-slate-600">{{ batch.catatan || '-' }}</p>
            </div>
        </div>
    </div>
    <div class="flex justify-end gap-3 mt-6 border-t pt-4">
        <button @click="exportGroupedProduksiToExcel()" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg">Export Laporan</button>
        <button @click="hideModal" class="bg-slate-300 py-2 px-4 rounded-lg">Tutup</button>
    </div>
</div>
<div v-if="uiState.modalType === 'panduanProduksi'" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-3xl w-4/5 max-h-[90vh] flex flex-col">
        <div class="flex-shrink-0 pb-4 border-b">
            <h3 class="text-2xl font-bold text-slate-800">Panduan Penggunaan: Aktual Jadi vs. Aktual Jadi Kombinasi</h3>
            <p class="text-slate-500">Dokumen ini menjelaskan perbedaan fungsional untuk memastikan pencatatan biaya dan kuantitas yang akurat.</p>
        </div>

        <div class="flex-1 overflow-y-auto py-4 pr-2">
            <div class="space-y-6 text-slate-700 leading-relaxed">
                <div>
                    <h4 class="text-xl font-semibold">1. Aktual Jadi</h4>
                    <p class="mt-2">Gunakan kolom <strong>"Aktual Jadi"</strong> ketika satu produk (contoh: 1 baju) dibuat sepenuhnya dari satu jenis bahan kain utama.</p>
                    <p>Kolom ini berfungsi sebagai sumber data utama untuk perhitungan final. Semua biaya krusial dan jumlah total produk jadi akan dihitung berdasarkan input di sini.</p>
                    <ul class="list-disc list-inside space-y-1 mt-2">
                        <li><strong>Kapan digunakan:</strong> Produksi standar, seperti kaos yang seluruh bagiannya terbuat dari bahan yang sama dan warna yang sama.</li>
                        <li><strong>Peran:</strong> Menentukan jumlah akhir produk jadi dan menjadi dasar kalkulasi semua biaya produksi.</li>
                    </ul>
                </div>

                <div>
                    <h4 class="text-xl font-semibold">2. Aktual Jadi Kombinasi</h4>
                    <p class="mt-2">Gunakan kolom <strong>"Aktual Jadi Kombinasi"</strong> untuk mencatat penggunaan bahan kain sekunder atau tambahan dalam pembuatan satu produk yang sama.</p>
                    <p><strong>Aturan Penggunaan:</strong></p>
                    <ul class="list-disc list-inside space-y-1 mt-2">
                        <li><strong>Bahan Utama/Dominan:</strong> Data untuk bahan yang paling banyak digunakan (misalnya, kain untuk bagian badan baju) harus dimasukkan ke dalam kolom "Aktual Jadi".</li>
                        <li><strong>Bahan Sekunder:</strong> Data untuk bahan campuran / bahan yang sama tapi berbeda warna (misalnya, kain untuk bagian lengan) dimasukkan ke dalam kolom "Aktual Jadi Kombinasi".</li>
                    </ul>
                    <ul class="list-disc list-inside space-y-1 mt-2">
                        <li><strong>Kapan digunakan:</strong> Produksi produk dengan variasi bahan, seperti dikategori fashion dengan badan katun dan lengan rayon / bagian badan bahan katun dan tangan bahan bahan katun tapi warna yang membedakanya.</li>
                        <li><strong>Peran:</strong> Mencatat biaya material tambahan tanpa memengaruhi perhitungan utama untuk biaya jasa dan peralatan.</li>
                    </ul>
                </div>

                <div>
                    <h4 class="text-xl font-semibold">Peringatan Penting</h4>
                    <ul class="list-none space-y-2 mt-2">
                        <li class="p-3 bg-red-100 text-red-800 border-l-4 border-red-500">
                            <strong>❌ Jangan menggunakan kedua kolom sekaligus!</strong><br>
                            Pilih salah satu input ("Aktual Jadi" atau "Aktual Jadi Kombinasi") untuk setiap baris bahan. Jika Anda ingin menambah data retur dengan SKU yang sama, klik <strong>"+ Tambah Kain & Bahan Lain"</strong>.
                        </li>
                        <li class="p-3 bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500">
                            <strong>ℹ️ Catatan Penting untuk Sisa Kain:</strong><br>
                            Jika ada sisa kain yang belum terpotong, catat kode unik kain tersebut. Jika nanti sisa kain itu dipotong dan menjadi produk jadi, cari kode uniknya di halaman <strong>Edit Batch Produksi</strong> untuk menambahkan total hasil jadinya. Namun, jika sisa kain diarahkan untuk model lain, jangan jadikan kode uniknya sebagai acuan analisis selisih tertinggi, karena data tersebut tidak relevan untuk analisis batch awal.
                        </li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
            <button @click="hideNestedModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
        </div>
    </div>
</div>
<div v-if="uiState.modalType === 'panduanPOS'">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Panduan Menggunakan Fitur Penjualan</h3>
        <p class="text-slate-500">Informasi penting mengenai alur kerja dan akurasi data penjualan.</p>
    </div>
    
    <div class="flex-1 overflow-y-auto py-4 pr-2">
        <div class="space-y-6 text-slate-700 leading-relaxed">
            <div>
                <h4 class="text-xl font-semibold">Alur Transaksi Dasar</h4>
                <p class="mt-2">Sebelum memulai transaksi, pastikan Anda telah memilih saluran penjualan yang sesuai.</p>
                <ul class="list-disc list-inside space-y-1 mt-2">
                    <li><strong>Pilih Saluran Penjualan:</strong> Di bagian atas halaman, tentukan terlebih dahulu toko mana yang akan menjadi saluran penjualan untuk transaksi yang akan Anda lakukan.</li>
                    <li><strong>Tambahkan Produk:</strong> Gunakan kolom "Scan Barcode atau Cari Produk di Sini" untuk menambahkan produk ke dalam keranjang. Anda bisa memindai label barcode produk, atau mengetik kode SKU/nama produk.</li>
                    <li><strong>Pencarian Otomatis:</strong> Sistem pencarian akan menampilkan rekomendasi produk secara otomatis saat Anda mengetik.</li>
                    <li><strong>Pilih & Tambahkan:</strong> Klik pada produk yang Anda inginkan dari hasil rekomendasi, dan produk tersebut akan langsung ditambahkan ke dalam keranjang belanja.</li>
                </ul>
            </div>
            
            <div>
                <h4 class="text-xl font-semibold">Penting: Alur Penjualan Online dan Akurasi Data</h4>
                <p class="mt-2">Untuk memastikan data yang akurat dan hasil yang maksimal, kami sangat menyarankan untuk mengikuti prinsip: <strong>Satu Resi = Satu Keranjang Belanja.</strong></p>
                <p>Alasan di balik prinsip ini sangatlah krusial:</p>
                <ul class="list-disc list-inside space-y-1 mt-2">
                    <li><strong>Konsistensi Promosi & Voucher:</strong> Setiap resi penjualan online memiliki perhitungan promosi dan voucher yang unik. Jika Anda menggabungkan beberapa resi dalam satu keranjang belanja, sistem akan mengalami kesulitan dalam menghitung biaya promosi dan voucher secara tepat, yang dapat mengakibatkan ketidaksesuaian data antara aplikasi ini dan platform online (seperti Shopee, TikTok, Lazada, dll.).</li>
                    <li><strong>Akurasi Laporan Keuangan:</strong> Ketidaksesuaian data promosi dan voucher akan memengaruhi hasil akhir manajemen keuangan Anda. Mengikuti alur satu resi per keranjang akan menjamin bahwa laporan keuangan yang Anda hasilkan selalu akurat dan konsisten.</li>
                </ul>
                <p class="mt-4 p-3 bg-red-100 text-red-800 border-l-4 border-red-500">
                    <strong>Catatan:</strong> Menggabungkan resi yang berbeda-beda dalam satu keranjang akan membuat perhitungan biaya promosi dan voucher menjadi tidak akurat, sehingga memengaruhi keseluruhan data manajemen keuangan Anda.
                </p>
            </div>
        </div>
    </div>

    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
    </div>
</div>
<div v-if="uiState.modalType === 'panduanPromosi'">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Panduan Manajemen Promosi & Voucher</h3>
        <p class="text-slate-500">Modul ini dirancang untuk membantu Anda mengelola strategi promosi dan voucher secara efektif.</p>
    </div>
    
    <div class="flex-1 overflow-y-auto py-4">
        <div class="space-y-4 text-slate-700 leading-relaxed">
            <h4 class="text-xl font-semibold">1. Manajemen Promosi Berdasarkan Model</h4>
            <p>Di halaman Manajemen Promosi & Voucher, Anda akan menemukan tabel untuk mengatur promosi.</p>
            <ul class="list-disc list-inside space-y-2">
                <li><strong>Pilih Model:</strong> Klik tabel "Pilih Model" untuk menentukan produk mana yang akan mendapatkan diskon. Pilihan model yang tersedia berasal dari data yang telah Anda tambahkan sebelumnya di halaman Manajemen Inventaris.</li>
                <li><strong>Tentukan Toko & Diskon:</strong> Tentukan toko mana yang akan mendapatkan diskon, dan pastikan nilai diskon yang Anda berikan konsisten dengan promosi di e-commerce seperti Shopee, TikTok, Lazada, atau platform online lainnya.</li>
                <li><strong>Diskon Bertingkat:</strong> Gunakan fitur "Tambah Tingkatan" untuk membuat diskon bertingkat dengan menentukan nilai belanja minimum yang diperlukan.</li>
                <li>Anda juga dapat memilih "Voucher Produk Tertentu (%)" untuk menetapkan diskon pada model yang telah Anda pilih.</li>
            </ul>

            <h4 class="text-xl font-semibold mt-6">2. Promosi Berdasarkan Akun Penjualan</h4>
            <p>Di samping tabel promosi, terdapat tabel "Promosi per Akun Penjualan". Di sini, Anda dapat menambahkan data berikut:</p>
            <ul class="list-disc list-inside space-y-2">
                <li><strong>Voucher Ikuti Toko (%):</strong> Voucher diskon untuk pelanggan yang mengikuti toko Anda.</li>
                <li><strong>Voucher Semua Produk (Rp):</strong> Voucher dengan nilai nominal yang berlaku untuk semua produk.</li>
            </ul>
            
            <h4 class="text-xl font-semibold mt-6">3. Integrasi dengan Kasir POS</h4>
            <p>Penting untuk diingat, semua data promosi yang Anda atur akan memengaruhi transaksi di halaman Kasir POS. Sistem akan secara otomatis bekerja dengan cara berikut:</p>
            <ul class="list-disc list-inside space-y-2">
                <li><strong>Rekomendasi Diskon Terbaik:</strong> Ketika transaksi berlangsung, sistem akan merekomendasikan dan menerapkan diskon dengan nilai tertinggi dari semua promosi dan voucher yang memenuhi syarat.</li>
            </ul>
        </div>
    </div>

    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
    </div>
</div>
<div v-if="uiState.modalType === 'panduanRetur'">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Panduan Manajemen Retur</h3>
        <p class="text-slate-500">Informasi penting mengenai alur kerja retur dan stok.</p>
    </div>
    
    <div class="flex-1 overflow-y-auto py-4">
        <div class="space-y-4 text-slate-700 leading-relaxed">
            <p>Pada modul Manajemen Retur, prosesnya dirancang untuk efisiensi dan akurasi stok.</p>
            <p><strong>Saat Anda berhasil menyimpan data retur</strong>, stok retur akan secara otomatis masuk ke halaman Manajemen Inventaris. Stok ini akan langsung teralokasi ke toko yang Anda tentukan di data retur, memastikan pembaruan inventaris yang **real-time**.</p>
            
            <p>Penting untuk diperhatikan mengenai proses pengeditan:</p>
            <p>Setelah data retur tersimpan, fitur edit tidak akan lagi memengaruhi jumlah stok di inventaris. Halaman Edit Retur hanya berfungsi untuk **menambahkan data retur baru** ke dalam tabel produk yang sama.</p>
            <p>Ketika Anda mengklik "Simpan Data Retur", stok akan terkirim dan data tersebut tidak dapat lagi diubah. Bahkan jika Anda menghapus data retur, stok yang sudah terkirim ke inventaris tidak akan berkurang. Ini menjamin integritas data stok yang telah dicatat.</p>
        </div>
    </div>

    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
    </div>
</div>
<div v-if="uiState.modalType === 'laporanSemuanya'">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Laporan Produksi Menyeluruh</h3>
        <p class="text-slate-500">Analisis semua data produksi dengan filter tanggal.</p>
    </div>

    <div class="flex-1 overflow-y-auto py-4 -mx-6 px-6">
        <div class="mb-4 p-4 bg-slate-50 rounded-lg border">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div class="lg:col-span-2">
                    <label class="block text-sm font-medium text-slate-700 mb-1">Filter Waktu</label>
                    <select v-model="uiState.laporanSemuaFilter" class="w-full p-2 border rounded-md capitalize bg-white shadow-sm">
                        <option value="today">Hari Ini</option>
                        <option value="last_7_days">1 Minggu Terakhir</option>
                        <option value="last_30_days">1 Bulan Terakhir</option>
                        <option value="this_year">1 Tahun Terakhir</option>
                        <option value="by_date_range">Rentang Tanggal</option>
                        <option value="by_month_range">Rentang Bulan</option>
                        <option value="by_year_range">Rentang Tahun</option>
                        <option value="all_time">Semua</option>
                    </select>
                </div>
                <div v-if="uiState.laporanSemuaFilter === 'by_date_range'" class="lg:col-span-2 grid grid-cols-2 gap-2">
                    <div><label class="block text-sm font-medium mb-1">Dari Tanggal</label><input type="date" v-model="uiState.laporanSemuaStartDate" class="w-full p-2 border rounded-md bg-white shadow-sm"></div>
                    <div><label class="block text-sm font-medium mb-1">Sampai Tanggal</label><input type="date" v-model="uiState.laporanSemuaEndDate" class="w-full p-2 border rounded-md bg-white shadow-sm"></div>
                </div>
                <div v-if="uiState.laporanSemuaFilter === 'by_month_range'" class="lg:col-span-4 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                     <div>
                        <label class="block text-xs font-medium">Dari Bulan</label>
                        <select v-model.number="uiState.laporanSemuaStartMonth" class="w-full p-2 border rounded-md bg-white shadow-sm"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select>
                    </div>
                     <div>
                        <label class="block text-xs font-medium">Tahun</label>
                        <input type="number" v-model.number="uiState.laporanSemuaStartYear" class="w-full p-2 border rounded-md bg-white shadow-sm">
                    </div>
                     <div>
                        <label class="block text-xs font-medium">Sampai Bulan</label>
                        <select v-model.number="uiState.laporanSemuaEndMonth" class="w-full p-2 border rounded-md bg-white shadow-sm"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select>
                    </div>
                     <div>
                        <label class="block text-xs font-medium">Tahun</label>
                        <input type="number" v-model.number="uiState.laporanSemuaEndYear" class="w-full p-2 border rounded-md bg-white shadow-sm">
                    </div>
                </div>
                <div v-if="uiState.laporanSemuaFilter === 'by_year_range'" class="lg:col-span-2 grid grid-cols-2 gap-2">
                    <div>
                        <label class="block text-sm font-medium mb-1">Dari Tahun</label>
                        <input type="number" v-model.number="uiState.laporanSemuaStartYear" placeholder="Tahun" class="w-full p-2 border rounded-md bg-white shadow-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium mb-1">Sampai Tahun</label>
                        <input type="number" v-model.number="uiState.laporanSemuaEndYear" placeholder="Tahun" class="w-full p-2 border rounded-md bg-white shadow-sm">
                    </div>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div class="p-4 bg-white rounded-lg border"><h4 class="text-sm font-medium text-slate-500">Total Baju Selesai</h4><p class="text-2xl font-bold mt-1 text-indigo-600">{{ formatNumber(laporanSemuaKpis.totalBajuSelesai) }} pcs</p></div>
            <div class="p-4 bg-white rounded-lg border"><h4 class="text-sm font-medium text-slate-500">Total Biaya Produksi</h4><p class="text-2xl font-bold mt-1 text-red-600">{{ formatCurrency(laporanSemuaKpis.totalBiaya) }}</p></div>
            <div class="p-4 bg-white rounded-lg border"><h4 class="text-sm font-medium text-slate-500">Rata-rata HPP/Pcs</h4><p class="text-2xl font-bold mt-1 text-emerald-600">{{ formatCurrency(laporanSemuaKpis.avgHpp) }}</p></div>
            <div class="p-4 bg-white rounded-lg border"><h4 class="text-sm font-medium text-slate-500">Total Batch Produksi</h4><p class="text-2xl font-bold mt-1 text-sky-600">{{ formatNumber(laporanSemuaKpis.totalBatch) }}</p></div>
        </div>
        
        <div class="bg-white rounded-lg border shadow-sm overflow-x-auto">
            <table class="w-full text-sm text-left text-slate-500">
                <tbody>
                    <tr v-if="laporanSemuanyaData.tableData.length === 0">
                        <td colspan="13" class="p-10 text-center text-slate-500">Tidak ada data produksi yang cocok dengan filter Anda.</td>
                    </tr>
                    <tr v-for="(item, index) in laporanSemuanyaData.tableData" :key="index" class="hover:bg-slate-50">
                        </tr>
                </tbody>
            </table>
        </div>

        </div>
    
    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="exportLaporanSemuaToExcel" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700">
            📄 Export ke Excel
        </button>
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">
            Tutup
        </button>
    </div>
</div>


      </div>
    </div>
  </div>
  
</template>

<style scoped>
body { font-family: 'Inter', sans-serif; }
.chart-container { position: relative; width: 100%; height: 320px; }
.sidebar-link { transition: all 0.2s; }
.sidebar-link.active { background-color: #4338ca; color: #f9fafb; }
.sidebar-link:not(.active):hover { background-color: #4f46e5; }
.kpi-card { transition: transform 0.2s, box-shadow 0.2s; border-color: #e2e8f0; }
.kpi-card:hover { transform: translateY(-4px); box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1); }
.kpi-value { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.help-btn { background-color: #e2e8f0; color: #475569; border-radius: 9999px; width: 1.25rem; height: 1.25rem; font-size: 0.75rem; font-weight: bold; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: background-color 0.2s; }
.help-btn:hover { background-color: #cbd5e1; }
.qty-btn { width: 1.75rem; height: 1.75rem; border-radius: 9999px; background-color: #e2e8f0; font-weight: bold; display: flex; align-items: center; justify-content: center; transition: background-color 0.2s; }
.inventory-group-header { transition: background-color 0.2s ease-in-out; }
.inventory-group-header:hover { background-color: #f8fafc; }
.inventory-variant-details { max-height: 0; overflow: hidden; transition: max-height 0.5s ease-in-out; }
.inventory-group-card.active .inventory-variant-details { max-height: 1000px; }
.inventory-group-header .arrow-icon { transition: transform 0.3s ease-in-out; }
.inventory-group-card.active .arrow-icon { transform: rotate(180deg); }
</style>