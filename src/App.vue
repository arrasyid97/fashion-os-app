<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import * as XLSX from 'xlsx'; // Import untuk fitur Export Excel

// Impor dari file konfigurasi Firebase Anda

import { db, auth } from './firebase.js'; 

// Impor fungsi-fungsi untuk Database (Firestore)
import { collection, doc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction, addDoc, onSnapshot, query, where, getDocs, getDoc } from 'firebase/firestore';
let bulkSearchDebounceTimer = null;
// Impor fungsi-fungsi BARU untuk Autentikasii
import { 
    onAuthStateChanged, 
    signOut,
    GoogleAuthProvider, // <-- Impor Google Provider
    
    signInWithPopup, // <-- Impor signInWithPopup
    
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword 
} from "firebase/auth";

// --- STATE MANAGEMENT ---
const activePage = ref(localStorage.getItem('lastActivePage') || 'dashboard');
const isLoading = ref(true);
const isSaving = ref(false); // Untuk tombol simpan umum
const isSavingSettings = ref(false); // Untuk tombol simpan di halaman Pengaturan
// Hapus baris 'const isSubscribing = ref(false);' yang lama
const isSubscribingMonthly = ref(false); // <-- TAMBAHKAN INI
const isSubscribingYearly = ref(false);  // <-- TAMBAHKAN INI
const currentUser = ref(null);
const nomorWhatsAppAdmin = ref('6285691803476');
const activationCodeInput = ref('');
const activationCodeMessage = ref('');
const commissionPayouts = ref([]);
const commissions = ref([]);
const editedProducts = ref(new Set());
const markProductAsEdited = (productId) => {
  editedProducts.value.add(productId);
};
const activationCodes = ref([]);
const newActivationCode = ref('');
const state = reactive({
    settings: { 
        brandName: 'FASHION OS', 
        minStok: 10,
        marketplaces: [],
        modelProduk: [],
        categories: [],
        inflowCategories: [ // <-- TAMBAHKAN INI
          { id: 'INFLOW-1', name: 'Modal Masuk', description: 'Tambahan modal dari pemilik atau investor.' },
          { id: 'INFLOW-2', name: 'Pendapatan Lain', description: 'Pendapatan di luar penjualan produk.' },
        ],
    },
    produk: [],
    transaksi: [],
    keuangan: [],
    retur: [
    { id: 'RET-001', tanggal: '2025-07-21', sku: 'FSH-TSH-BL-M', qty: 1, alasan: 'Ukuran tidak sesuai', tindakLanjut: 'Tukar Ukuran', channelId: 'shopee-a' },
    { id: 'RET-002', tanggal: '2025-07-22', sku: 'FSH-KJM-NV-L', qty: 1, alasan: 'Cacat produksi', tindakLanjut: 'Refund', channelId: 'tiktok-shop' },
],
    carts: {},
    promotions: { perChannel: {}, perModel: {} },
    commissions: { perModel: {} },
    specialPrices: {},
    produksi: [],    // --- START: KODE BARU UNTUK STOK KAIN ---
    gudangKain: [],
    suppliers: [],
    purchaseOrders: [],
    voucherNotes: [],
    investor: [],
    bankAccounts: [],
    // --- END: KODE BARU UNTUK STOK KAIN ---
    transactionCounter: 0,
    pinProtection: {
            dashboard: true,
            profitDetails: true,
            incomeHistory: true,
            investmentPage: true,
        }
});


const uiState = reactive({
    activeAccordion: null,
    activeCartChannel: null,
    analisisModelLimit: 10,
    dashboardDateFilter: 'today',
    dashboardStartDate: '',
    dashboardEndDate: '',
    dashboardStartMonth: new Date().getMonth() + 1,
    dashboardEndMonth: new Date().getMonth() + 1,
    dashboardStartYear: new Date().getFullYear(),
    dashboardEndYear: new Date().getFullYear(),
    gudangKainSearch: '',
    gudangKainSort: 'tanggal-desc',
    editProduksiBatch: {
        produksiType: '',
        namastatus: '',
        kainBahan: []
    },
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
    laporanSemuaFilter: 'this_month',
    laporanSemuaStartDate: '',
    laporanSemuaEndDate: '',
    laporanSemuaBulan: new Date().getMonth() + 1,
    laporanSemuaTahun: new Date().getFullYear(),
    laporanSemuaStartMonth: new Date().getMonth() + 1,
    laporanSemuaEndMonth: new Date().getMonth() + 1,
    laporanSemuaStartYear: new Date().getFullYear(),
    laporanSemuaEndYear: new Date().getFullYear(),
    laporanSemuaCurrentPage: 1,
    laporanSemuaItemsPerPage: 5,
    analisisModelFilter: 'none',
    analisisModelSelectedModel: '',
    analisisModelSelectedType: 'aktualJadi',
    produksiFilterType: 'all',
    modalData: {},
    modalType: '',
    produksiWarnaRecommendations: [],
    produksiUkuranRecommendations: [],
    newProduksiBatch: {
        tanggal: new Date().toISOString().split('T')[0],
        produksiType: 'pemaklun', // Menambah properti ini
        namastatus: '', // Menambah properti ini
        statusProses: 'Dalam Proses',
        kainBahan: [{
            idUnik: '',
            modelProdukId: '',
            namaKain: '',
            tokoKain: '',
            warnaKain: '',
            ukuran: '',
            totalYard: null,
            hargaKainPerYard: null,
            yardPermodel: null,
            aktualJadi: null,
            aktualJadiLabelType: 'Aktual Jadi',
            hargaMaklunPerPcs: null,
            biayaAlat: null,
            aktualJadiKombinasi: null,
        }],
        statusPembayaran: 'Belum Dibayar',
        jumlahPembayaran: null,
        tanggalPembayaran: '',
        catatan: '',
        orangMemproses: '',
        
    },

    
    notesData: {},
    notesSearch: '',
    notesFilterType: 'all', // 'all', 'model', 'channel'
    notesFilterModel: '',
    notesFilterChannel: '',
    notesSortBy: 'endDate-asc',

    supplierModalData: {},
    activeSupplierView: 'list', // 'list' atau 'form' <-- TAMBAHKAN BARIS INI
    penerimaanBarangForm: { // <-- TAMBAHKAN OBJEK INI
        supplierId: null,
        supplierName: '',
        tanggal: new Date().toISOString().split('T')[0],
        produk: [],
        statusProses: 'Dalam Proses',
        statusPembayaran: 'Belum Dibayar',
        catatan: '',
    },

    exportFilter: 'all_time',
    exportStartDate: '',
    exportEndDate: '',
    exportStartMonth: new Date().getMonth() + 1,
    exportEndMonth: new Date().getMonth() + 1,
    exportStartYear: new Date().getFullYear(),
    exportEndYear: new Date().getFullYear(),
    
    pengaturanMarketplaceSearch: '',
    pengaturanModelProdukSearch: '',
    pos_scan_input: '', // Untuk input scan di halaman POS
    pos_order_id: '',   // Untuk menyimpan ID pesanan yang di-scan   
    posDateFilter: 'today',
    posStartDate: '',
    posEndDate: '',
    posBulan: new Date().getMonth() + 1,
    posTahun: new Date().getFullYear(),
    posStartMonth: new Date().getMonth() + 1,
    posEndMonth: new Date().getMonth() + 1,
    posStartYear: new Date().getFullYear(),
    posEndYear: new Date().getFullYear(),
    posSearchQuery: '',
    posSearchRecommendations: [],
    specialPriceChannel: null,
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
    selectedPlan: null,
    oldPin: '',
    newPin: '',
    confirmNewPin: '',
    pinError: '',

    isPemasukanLocked: true,       // Status terkunci untuk tabel pemasukan
    pemasukanPinInput: '',         // Untuk input PIN di halaman keuangan
    pemasukanPinError: '',         // Pesan error jika PIN salah

    isInvestasiLocked: true,     // Status terkunci untuk halaman investasi
    investasiPinInput: '',       // Untuk input PIN di halaman investasi
    investasiPinError: '',       // Pesan error jika PIN salah

    referralCodeInput: '',
    referralCodeApplied: false,
    referralCodeMessage: '',

adminVerificationIdInput: '',
adminVerificationResult: null,
isVerifying: false,
adminVerificationError: '',

selectedProductForPurchase: null,

hargaHppSelectedModelName: '',

purchaseOrderSearch: '',
    purchaseOrderStatusProsesFilter: 'all', // 'all', 'Dalam Proses', 'Selesai'
    purchaseOrderStatusBayarFilter: 'all', // 'all', 'Belum Dibayar', 'Proses Pembayaran', 'Sudah Dibayar'
    purchaseOrderSort: 'tanggal-desc', // 'total-desc', 'total-asc'
    purchaseOrderDateFilter: 'all_time',
    purchaseOrderStartDate: '',
    purchaseOrderEndDate: '',
    purchaseOrderStartMonth: new Date().getMonth() + 1,
    purchaseOrderEndMonth: new Date().getMonth() + 1,
    purchaseOrderStartYear: new Date().getFullYear(),
    purchaseOrderEndYear: new Date().getFullYear(),

    pengaturanTab: 'umum',
    isKeuanganInfoVisible: false,
    priceCalculator: {
    hpp: null,
    targetMargin: 0,
    selectedMarketplace: null,
    selectedModelName: null,
    result: null,
    paymentMethod: 'cash', 
      selectedBankAccountId: null,
      adminFee: 0
},
    allUsers: [],
    selectedUserForExport: null,
    isExportingUserData: false,
    newActivationCode: '',
    
    stockInSearchRecommendations: [],
    bulk_manual_input: '',       // Untuk kolom input manual
    bulk_scan_input: '',         // Untuk kolom input scanner otomatis
    bulk_recommendations: [],    // Rekomendasi untuk input manual
    last_processed_orders: [],
    bulk_order_queue: [],
    is_processing_scan: false,   // Mencegah scan ganda
    investorStatusFilter: 'aktif',
    investorPaymentFilter: 'all_time',
    investorPaymentStartMonth: new Date().getMonth() + 1,
    investorPaymentEndMonth: new Date().getMonth() + 1,
    investorPaymentStartYear: new Date().getFullYear(),
    investorPaymentEndYear: new Date().getFullYear(),
    investorPaymentSearch: '',

    isPinConfirmModalVisible: false,
    pinConfirmInput: '',
    pinConfirmError: '',
    pinActionToConfirm: null,
    posChannelFilter: 'all',

     laporanBagiHasil: {
        
        selectedInvestorId: null,
        month: new Date().getMonth() + 1, // Default bulan ini
        year: new Date().getFullYear(),   // Default tahun ini
        result: null // Untuk menyimpan hasil kalkulasi
    }

});

const dataFetched = reactive({
  products: false,
  transactions: false,
  production: false,
  finance: false,
  suppliers: false,
  returns: false,
  notes: false,
  // Tambahkan flag lain jika ada modul data besar lainnya
});

const loadDataForPage = async (pageName) => {
  if (!currentUser.value) return; // Pengaman utama: Jangan lakukan apa-apa jika user belum termuat
  const userId = currentUser.value.uid;

  // Logika Lazy Loading yang sudah ada, sekarang di dalam fungsi ini
  switch(pageName) {
    case 'dashboard':
      await fetchTransactionData(userId);
      await fetchFinanceData(userId);
      nextTick(renderCharts);
      break;
    case 'transaksi':
    case 'bulk_process':
      await fetchProductData(userId);
      await fetchTransactionData(userId);
      await fetchNotesData(userId);
      break;
    case 'inventaris':
    case 'harga-hpp':
      await fetchProductData(userId);
      break;
    case 'promosi':
        await fetchProductData(userId);
        await fetchNotesData(userId);
        break;
    case 'produksi':
      await fetchProductData(userId);
      await fetchProductionData(userId);
      break;
    case 'gudang-kain':
      await fetchProductionData(userId);
      break;
    case 'keuangan':
    case 'investasi':
      await fetchFinanceData(userId);
      break;
    case 'supplier':
        await fetchProductData(userId);
        await fetchSupplierData(userId);
        break;
    case 'retur':
        await fetchTransactionData(userId);
        await fetchReturnData(userId);
        await fetchProductData(userId);
        break;
  }
};

const unpaidCommissions = computed(() =>
    commissions.value.filter(c => c.status === 'unpaid')
        .sort((a, b) => new Date(b.createdAt.seconds * 1000) - new Date(a.createdAt.seconds * 1000))
);

const processingCommissions = computed(() =>
    commissions.value.filter(c => c.status === 'processing')
        .sort((a, b) => new Date(b.createdAt.seconds * 1000) - new Date(a.createdAt.seconds * 1000))
);

const paidCommissions = computed(() =>
    commissions.value.filter(c => c.status === 'paid')
);

const totalUnpaidCommission = computed(() =>
    unpaidCommissions.value.reduce((sum, c) => sum + c.commissionAmount, 0)
);

const totalProcessingCommission = computed(() =>
    processingCommissions.value.reduce((sum, c) => sum + c.commissionAmount, 0)
);

const totalPaidCommission = computed(() =>
    paidCommissions.value.reduce((sum, c) => sum + c.commissionAmount, 0)
);

const totalRevenue = computed(() =>
    totalPaidCommission.value + totalProcessingCommission.value + totalUnpaidCommission.value
);

const availableForWithdrawal = computed(() => totalUnpaidCommission.value);
const totalWithdrawn = computed(() => totalPaidCommission.value);


const isDashboardLocked = ref(true);
const dashboardPinInput = ref('');
const dashboardPinError = ref('');
const ADMIN_UID = '6m4bgRlZMDhL8niVyD4lZmGuarF3'; 
const hasLoadedInitialData = ref(false);
// Properti ini akan otomatis bernilai 'true' jika yang login adalah Anda (Admin)
const isAdmin = computed(() => {
  return currentUser.value && currentUser.value.uid === ADMIN_UID;
});

const parsePercentageInput = (value) => {
    if (typeof value !== 'string') return value;
    const cleaned = value.replace(',', '.').replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
};

const isSubscriptionActive = computed(() => {
    if (!currentUser.value || !currentUser.value.userData) {
        return false;
    }
    const status = currentUser.value.userData.subscriptionStatus;
    const trialEndDate = currentUser.value.userData.trialEndDate?.seconds * 1000;
    const subscriptionEndDate = currentUser.value.userData.subscriptionEndDate?.seconds * 1000;
    
    // Cek apakah status aktif DAN tanggal kedaluwarsa belum terlewati
    if (status === 'active' && subscriptionEndDate > Date.now()) {
        return true;
    }
    if (status === 'trial' && trialEndDate > Date.now()) {
        return true;
    }
    return false;
});

// Fungsi untuk mengambil daftar semua pengguna (hanya untuk Admin)
async function fetchAllUsers() {
    if (!isAdmin.value) return; // Hanya jalankan jika admin
    try {
        const usersCollection = collection(db, 'users');
        const userSnapshots = await getDocs(usersCollection);
        uiState.allUsers = userSnapshots.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Gagal mengambil daftar pengguna:", error);
        alert("Gagal mengambil daftar pengguna.");
    }
}

async function fetchCommissionPayouts() {
    if (!isAdmin.value) return;
    try {
        const payoutsQuery = query(
            collection(db, "keuangan"), 
            where("kategori", "==", "Pembayaran Komisi Mitra")
        );
        const snapshot = await getDocs(payoutsQuery);
        commissionPayouts.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => b.tanggal.toDate() - a.tanggal.toDate()); // Urutkan dari terbaru
    } catch (error) {
        console.error("Gagal mengambil riwayat pencairan komisi:", error);
        alert("Gagal mengambil riwayat pencairan komisi.");
    }
}

// Fungsi baru untuk membuat kode rujukan yang lebih profesional
function generatePartnerCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'PARTNER-';
    for (let i = 0; i < 5; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// Fungsi baru untuk menjadikan pengguna sebagai mitra
async function makeUserPartner(userId) {
    if (!confirm("Anda yakin ingin menjadikan pengguna ini sebagai mitra? Kode rujukan unik akan dibuat.")) {
        return;
    }

    try {
        const userRef = doc(db, "users", userId);
        const referralCode = generatePartnerCode();

        await updateDoc(userRef, {
            isPartner: true,
            referralCode: referralCode
        });

        // Perbarui state lokal
        const userInState = uiState.allUsers.find(u => u.uid === userId);
        if (userInState) {
            userInState.isPartner = true;
            userInState.referralCode = referralCode;
        }

        alert(`Pengguna berhasil menjadi mitra! Kode rujukan: ${referralCode}`);
    } catch (error) {
        console.error("Gagal menjadikan pengguna mitra:", error);
        alert("Gagal menjadikan pengguna mitra. Silakan coba lagi.");
    }
}

async function fetchActivationCodes() {
    if (!isAdmin.value) return;
    try {
        const codesCollection = collection(db, 'activation_codes');
        const snapshot = await getDocs(codesCollection);
        activationCodes.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (a.status === 'unused' ? -1 : 1) - (b.status === 'unused' ? -1 : 1)); // Urutkan yang 'unused' di atas
    } catch (error) {
        console.error("Gagal mengambil kode aktivasi:", error);
    }
}

async function deleteActivationCode(codeId) {
    if (!confirm('Anda yakin ingin menghapus kode aktivasi ini? Aksi ini tidak dapat dibatalkan.')) {
        return;
    }

    if (!isAdmin.value) {
        alert("Anda tidak memiliki izin untuk melakukan tindakan ini.");
        return;
    }

    try {
        await deleteDoc(doc(db, "activation_codes", codeId));

        // Perbarui state lokal untuk memperbarui UI
        activationCodes.value = activationCodes.value.filter(code => code.id !== codeId);

        alert(`Kode aktivasi "${codeId}" berhasil dihapus.`);
    } catch (error) {
        console.error("Gagal menghapus kode aktivasi:", error);
        alert("Gagal menghapus kode aktivasi. Silakan coba lagi.");
    }
}

// Fungsii untuk membuat kode aktivasi baru
async function createActivationCode() {
    if (!isAdmin.value) return;
    
    let codeToCreate = newActivationCode.value.trim();
    if (!codeToCreate) {
        // Jika input kosong, buat kode acak
        codeToCreate = `FOS-${Date.now().toString().slice(-6)}`;
    }

    try {
        isSaving.value = true;
        const codeRef = doc(db, "activation_codes", codeToCreate);
        const codeDoc = await getDoc(codeRef);

        if (codeDoc.exists()) {
            throw new Error("Kode ini sudah ada. Silakan gunakan kode lain.");
        }

        await setDoc(codeRef, {
            status: 'unused',
            createdAt: new Date()
        });
        
        // Tambahkan ke daftar lokal untuk update UI instan
        activationCodes.value.unshift({ id: codeToCreate, status: 'unused', createdAt: new Date() });
        newActivationCode.value = ''; // Kosongkan input
        alert(`Kode aktivasi "${codeToCreate}" berhasil dibuat!`);

    } catch (error) {
        console.error("Gagal membuat kode aktivasi:", error);
        alert(`Gagal: ${error.message}`);
    } finally {
        isSaving.value = false;
    }
}

async function updateReferralCode() {
    const user = uiState.modalData.user;
    const newCode = uiState.modalData.newReferralCode.trim();

    if (!user || !newCode) {
        return alert("Kode rujukan tidak boleh kosong.");
    }
    if (newCode.length < 5) {
        return alert("Kode rujukan harus memiliki minimal 5 karakter.");
    }

    try {
        isSaving.value = true;
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
            referralCode: newCode
        });

        // Update data di state lokal agar tampilan langsung berubah
        const userInState = uiState.allUsers.find(u => u.uid === user.uid);
        if (userInState) {
            userInState.referralCode = newCode;
        }

        hideModal();
        alert(`Kode rujukan untuk ${user.email} berhasil diubah menjadi ${newCode}`);
    } catch (error) {
        console.error("Gagal mengubah kode rujukan:", error);
        alert("Terjadi kesalahan saat mengubah kode rujukan.");
    } finally {
        isSaving.value = false;
    }
}

async function deleteInvestor(investorId) {
    if (!confirm("Anda yakin ingin menghapus data investor ini secara permanen? Aksi ini tidak dapat dibatalkan.")) {
        return;
    }
    try {
        await deleteDoc(doc(db, "investors", investorId));
        state.investor = state.investor.filter(inv => inv.id !== investorId);
        alert("Data investor berhasil dihapus.");
    } catch (error) {
        console.error("Error menghapus investor:", error);
        alert("Gagal menghapus data investor.");
    }
}

async function verifyCashoutRequest() {
    const withdrawalId = uiState.adminVerificationIdInput.trim();
    if (!withdrawalId) {
        uiState.adminVerificationError = 'ID Pencairan tidak boleh kosong.';
        return;
    }

    uiState.isVerifying = true;
    uiState.adminVerificationResult = null;
    uiState.adminVerificationError = '';

    try {
        // PERBAIKAN: Mencari di koleksi 'commissions' dengan status 'processing'
        const q = query(
            collection(db, "commissions"), 
            where("withdrawalId", "==", withdrawalId),
            where("status", "==", "processing") // Pastikan hanya yang sedang diproses
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            throw new Error(`Tidak ditemukan pengajuan yang sedang diproses dengan ID: ${withdrawalId}`);
        }

        // Hitung total dari semua komisi yang terkait dengan ID ini
        let totalAmount = 0;
        let transactionDetails = '';
        let requestDate = null;

        querySnapshot.forEach(doc => {
            const data = doc.data();
            totalAmount += data.commissionAmount;
            if (!requestDate) {
                requestDate = new Date(data.createdAt.seconds * 1000).toLocaleString('id-ID');
                transactionDetails = `Pengajuan dari: ${data.partnerEmail || data.referralCode}`;
            }
        });

        uiState.adminVerificationResult = {
            jumlah: totalAmount,
            tanggal: requestDate,
            catatan: transactionDetails
        };

    } catch (error) {
        uiState.adminVerificationError = error.message;
    } finally {
        uiState.isVerifying = false;
    }
}

function addProductFromSelection() {
    const selectedProduct = uiState.selectedProductForPurchase;
    if (!selectedProduct) return;

    // Cek apakah produk sudah ada di daftar
    const existingItem = uiState.penerimaanBarangForm.produk.find(
        (item) => item.sku === selectedProduct.sku
    );

    if (existingItem) {
        // Jika sudah ada, tambahkan kuantitasnya
        existingItem.qty = (existingItem.qty || 0) + 1;
    } else {
        // Jika belum ada, tambahkan produk baru ke daftar
        uiState.penerimaanBarangForm.produk.push({
            id: selectedProduct.id,
            sku: selectedProduct.sku,
            modelName: selectedProduct.nama,
            color: selectedProduct.warna,
            size: selectedProduct.varian,
            hargaJual: 0, // <-- BARIS INI YANG DIUBAH
            qty: 1,
            statusProses: 'Dalam Proses',
            statusPembayaran: 'Belum Dibayar',
            returReason: null,
        });
    }

    // Kosongkan pilihan setelah produk ditambahkan
    uiState.selectedProductForPurchase = null;
}

function showInvestorPaymentDetail(p) {
    // 'p' adalah objek data dari `filteredInvestorPayments` yang berisi semua detail
    const reportResult = {
        // Data utama
        investorName: p.investorName,
        period: p.period,
        profitSharePercentage: p.profitSharePercentage,
        investorShare: p.investorShare,
        companyShare: p.companyShare,
        paymentMethod: p.paymentMethod,
        bankDetails: p.bankDetails,
        adminFee: p.adminFee,
        totalPayment: p.totalPayment,
        
        // --- PERUBAHAN UTAMA: Meneruskan semua data detail ---
        omsetBersihPenjualan: p.omsetBersihPenjualan,
        omsetBersihDariRetur: p.omsetBersihDariRetur,
        omsetBersihFinal: p.omsetBersihFinal,
        totalHppTerjual: p.totalHppTerjual,
        totalHppRetur: p.totalHppRetur,
        hppTerjualFinal: p.hppTerjualFinal,
        labaKotor: p.labaKotor,
        biayaMarketplacePenjualan: p.biayaMarketplacePenjualan,
        biayaMarketplaceBatal: p.biayaMarketplaceBatal,
        totalBiayaTransaksi: p.totalBiayaTransaksi,
        totalBiayaOperasional: p.totalBiayaOperasional,
        labaBersih: p.labaBersihPeriode, // Menggunakan labaBersihPeriode sebagai laba bersih

        showPrintButton: true,
        showRecordButton: false 
    };
    showModal('laporanBagiHasilDetail', reportResult);
}

// FUNGSI BARU UNTUK MENGHAPUS RIWAYAT PEMBAYARAN
async function deleteInvestorPayment(paymentId) {
    if (!confirm("Anda yakin ingin menghapus riwayat pembayaran ini? Aksi ini tidak dapat dibatalkan.")) {
        return;
    }
    try {
        await deleteDoc(doc(db, "investor_payments", paymentId));
        state.investorPayments = state.investorPayments.filter(p => p.id !== paymentId);
        alert("Riwayat pembayaran berhasil dihapus.");
    } catch (error) {
        console.error("Error menghapus pembayaran investor:", error);
        alert("Gagal menghapus riwayat pembayaran.");
    }
}

function exportInvestorPayments() {
    if (state.investorPayments.length === 0) return alert("Tidak ada data untuk diekspor.");
    
    const dataToExport = state.investorPayments.map(p => ({
        "Tanggal Bayar": new Date(p.paymentDate),
        "Nama Investor": p.investorName,
        "Periode Laporan": p.period,
        "Laba Bersih Periode": p.labaBersihPeriode,
        "Persentase (%)": p.profitSharePercentage,
        "Bagian Investor (Rp)": p.investorShare,
        "Metode Bayar": p.paymentMethod,
        "Biaya Admin (Rp)": p.adminFee,
        "Total Dibayar (Rp)": p.totalPayment,
        "Bank Tujuan": p.bankDetails ? `${p.bankDetails.bankName} - ${p.bankDetails.accountNumber}` : 'N/A',
        "Atas Nama": p.bankDetails ? p.bankDetails.accountName : 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Riwayat Pembayaran Investor");
    worksheet["!cols"] = Array(11).fill({ wch: 25 });
    XLSX.writeFile(workbook, `Riwayat_Pembayaran_Investor_${new Date().toISOString().split('T')[0]}.xlsx`);
}

async function submitInvestorForm(isEditing) {
    if (!currentUser.value) return alert("Anda harus login.");
    const form = uiState.modalData;

    if (!form.name || !form.amount || !form.profitShare || !form.startDate) {
        return alert("Semua kolom wajib diisi.");
    }

    const dataToSave = {
        userId: currentUser.value.uid,
        name: form.name,
        amount: form.amount,
        profitShare: form.profitShare,
        startDate: new Date(form.startDate),
        status: form.status || 'aktif', // <-- BARIS BARU
    };

    try {
        if (isEditing) {
            const investorRef = doc(db, "investors", form.id);
            await updateDoc(investorRef, dataToSave);
            const index = state.investor.findIndex(inv => inv.id === form.id);
            if (index !== -1) {
                state.investor[index] = { id: form.id, ...dataToSave };
            }
            alert('Data investor berhasil diperbarui!');
        } else {
            const investorRef = await addDoc(collection(db, "investors"), dataToSave);
            state.investor.unshift({ id: investorRef.id, ...dataToSave });
            alert('Investor baru berhasil ditambahkan!');
        }
        hideModal();
    } catch (error) {
        console.error("Error menyimpan data investor:", error);
        alert("Gagal menyimpan data investor.");
    }
}

async function toggleInvestorStatus(investor) {
    const newStatus = investor.status === 'aktif' ? 'selesai' : 'aktif';
    if (!confirm(`Anda yakin ingin mengubah status investor "${investor.name}" menjadi "${newStatus}"?`)) return;

    try {
        const investorRef = doc(db, "investors", investor.id);
        await updateDoc(investorRef, { status: newStatus });
        
        // Update state lokal
        const invInState = state.investor.find(i => i.id === investor.id);
        if (invInState) {
            invInState.status = newStatus;
        }
        alert("Status investor berhasil diperbarui!");
    } catch (error) {
        console.error("Gagal mengubah status investor:", error);
        alert("Gagal mengubah status investor.");
    }
}

// Fungsi untuk mengekspor semua data milik satu pengguna
async function exportAllDataForUser(userId, userEmail, filterType, startDateStr, endDateStr, startMonth, endMonth, startYear, endYear) {
    if (!isAdmin.value) return;
    if (!userId) {
        alert("Silakan pilih pelanggan terlebih dahulu.");
        return;
    }
    
    let filterDescription = '';
    if (filterType !== 'all_time') {
        filterDescription = ` (${filterType})`;
    }
    
    if (!confirm(`Anda akan mengunduh data untuk ${userEmail} dengan filter ${filterDescription}. Lanjutkan?`)) {
        return;
    }

    uiState.isExportingUserData = true;
    try {
        const collectionsToExport = [
            'users', 'settings', 'promotions', 'products', 'product_prices',
            'stock_allocations', 'transactions', 'keuangan', 'production_batches',
            'returns', 'categories', 'fabric_stock', 'investors', 'investor_payments',
            'bank_accounts'
        ];

        const workbook = XLSX.utils.book_new();

        for (const collName of collectionsToExport) {
            let data = [];
            const hasTanggal = ['transactions', 'keuangan', 'production_batches', 'returns', 'investor_payments', 'fabric_stock'].includes(collName);

            const collectionsWithUserIdField = [
                'products', 'product_prices', 'stock_allocations', 'transactions', 'keuangan',
                'production_batches', 'returns', 'categories', 'fabric_stock',
                'investors', 'investor_payments', 'bank_accounts'
            ];

            const collectionsWithDocIdAsUserId = ['users', 'settings', 'promotions'];

            if (collectionsWithUserIdField.includes(collName)) {
                const q = query(collection(db, collName), where("userId", "==", userId));
                const snapshot = await getDocs(q);
                data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } else if (collectionsWithDocIdAsUserId.includes(collName)) {
                const docRef = doc(db, collName, userId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    data.push({ id: docSnap.id, ...docSnap.data() });
                }
            } else {
                const q = collection(db, collName);
                const snapshot = await getDocs(q);
                data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            }

            // Menerapkan filter tanggal hanya untuk koleksi yang relevan
            if (hasTanggal) {
                data = filterDataByDate(data, filterType, startDateStr, endDateStr, startMonth, endMonth, startYear, endYear);
            }

            if (data.length > 0) {
                let worksheetData = [];

                if (collName === 'transactions') {
                    // ... (logika kustom untuk transaksi) ...
                    worksheetData = data.map(trx => {
                        const totalHPP = (trx.items || []).reduce((sum, item) => sum + (item.hpp || 0) * item.qty, 0);
                        const totalBiayaMarketplace = trx.biaya?.total || 0;
                        const labaBersih = trx.total - totalHPP - totalBiayaMarketplace;

                        const rincianBiaya = (trx.biaya?.rincian || [])
                            .map(item => `${item.name}: ${formatCurrency(item.value)}`)
                            .join('; ');
                        
                        const itemTerjual = (trx.items || [])
                            .map(item => `${item.qty}x ${item.sku}`)
                            .join('; ');

                        return {
                            ID_Transaksi: trx.id,
                            Tanggal: trx.tanggal?.toDate ? trx.tanggal.toDate().toLocaleString('id-ID') : trx.tanggal,
                            Channel: trx.channel,
                            Item_Terjual: itemTerjual,
                            Subtotal: trx.subtotal,
                            Total_Akhir: trx.total,
                            Total_HPP: totalHPP,
                            Total_Biaya_Marketplace: totalBiayaMarketplace,
                            Estimasi_Laba_Bersih: labaBersih,
                            Rincian_Biaya: rincianBiaya,
                            Deskripsi_Diskon: trx.diskon?.description || '-',
                            Total_Diskon: trx.diskon?.totalDiscount || 0,
                            UserId: trx.userId
                        };
                    });
                } else if (collName === 'production_batches') {
                    // ... (logika kustom untuk production_batches) ...
                    worksheetData = data.flatMap(batch => (batch.kainBahan || []).map(item => {
                        const modelInfo = state.settings.modelProduk.find(m => m.id === item.modelProdukId) || {};
                        const totalBiayaKain = (item.totalYard || 0) * (item.hargaKainPerYard || 0);
                        const hargaJasaPerPcs = batch.produksiType === 'penjahit' ? (item.hargaJahitPerPcs || 0) : (item.hargaMaklunPerPcs || 0);
                        const totalBiayaJasa = (item.aktualJadi || 0) * hargaJasaPerPcs;
                        const totalBiayaAlat = (item.aktualJadi || 0) > 0 ? (item.biayaAlat || 0) : 0;
                        const totalBiayaProduksi = totalBiayaKain + totalBiayaJasa + totalBiayaAlat;
                        const totalKuantitas = (item.aktualJadi || 0) + (item.aktualJadiKombinasi || 0);
                        const hpp = totalKuantitas > 0 ? totalBiayaProduksi / totalKuantitas : 0;

                        return {
                            ID_Batch: batch.id,
                            Tanggal_Produksi: batch.tanggal?.toDate ? batch.tanggal.toDate() : batch.tanggal,
                            Jenis_Pekerja: batch.produksiType,
                            Nama_Pekerja: batch.namaStatus,
                            Status_Proses: batch.statusProses,
                            Model_Produk: modelInfo.namaModel || 'N/A',
                            Nama_Kain: item.namaKain,
                            Warna: item.warnaKain,
                            Ukuran: item.ukuran,
                            Qty_Jadi: item.aktualJadi,
                            Qty_Kombinasi: item.aktualJadiKombinasi,
                            Total_Yard: item.totalYard,
                            Harga_per_Yard: item.hargaKainPerYard,
                            Total_Biaya_Kain: totalBiayaKain,
                            Total_Biaya_Jasa: totalBiayaJasa,
                            Total_Biaya_Alat: totalBiayaAlat,
                            Total_Biaya_Produksi: totalBiayaProduksi,
                            HPP_per_Pcs: hpp,
                            Sudah_Masuk_Inventaris: item.isInventoried,
                            UserId: batch.userId
                        };
                    }));
                } else if (collName === 'returns') {
                    // ... (logika kustom untuk retur) ...
                    worksheetData = data.flatMap(returDoc => (returDoc.items || []).map(item => {
                        const product = getProductBySku(item.sku) || {};
                        const marketplace = getMarketplaceById(returDoc.channelId) || {};
                        return {
                            ID_Retur_Dokumen: returDoc.id,
                            Tanggal_Retur: returDoc.tanggal?.toDate ? returDoc.tanggal.toDate() : returDoc.tanggal,
                            ID_Transaksi_Asli: returDoc.originalTransactionId,
                            Asal_Marketplace: marketplace.name || 'N/A',
                            SKU_Produk: item.sku,
                            Nama_Produk: product.nama || 'N/A',
                            Jumlah_Retur: item.qty,
                            Alasan: item.alasan,
                            Tindak_Lanjut: item.tindakLanjut,
                            UserId: returDoc.userId
                        };
                    }));
                } else if (collName === 'keuangan') {
                    // ... (logika kustom untuk keuangan) ...
                    worksheetData = data.map(item => ({
                        ID: item.id,
                        Tanggal: item.tanggal?.toDate ? item.tanggal.toDate() : item.tanggal,
                        Jenis: item.jenis,
                        Kategori: item.kategori,
                        Jumlah: item.jumlah,
                        Catatan: item.catatan,
                        UserId: item.userId
                    }));
                } else {
                    worksheetData = JSON.parse(JSON.stringify(data));
                }

                const worksheet = XLSX.utils.json_to_sheet(worksheetData);
                XLSX.utils.book_append_sheet(workbook, worksheet, collName.substring(0, 31));
            }
        }

        const fileName = `Export_Data_${userEmail}${filterDescription}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(workbook, fileName);
        alert('Data berhasil diekspor!');

    } catch (error) {
        console.error("Gagal mengekspor data pelanggan:", error);
        alert("Terjadi kesalahan saat mengekspor data: " + error.message);
    } finally {
        uiState.isExportingUserData = false;
    }
}

const filteredVoucherNotes = computed(() => {
    let filtered = state.voucherNotes;
    
    // Filter berdasarkan tipe (model/channel)
    if (uiState.notesFilterType !== 'all') {
        filtered = filtered.filter(note => note.type === uiState.notesFilterType);
    }

    // Filter berdasarkan model produk
    if (uiState.notesFilterModel) {
        filtered = filtered.filter(note => note.modelName === uiState.notesFilterModel);
    }

    // Filter berdasarkan channel
    if (uiState.notesFilterChannel) {
        filtered = filtered.filter(note => note.channelId === uiState.notesFilterChannel);
    }

    // Filter berdasarkan pencarian
    const searchQuery = uiState.notesSearch.toLowerCase();
    if (searchQuery) {
        filtered = filtered.filter(note =>
            note.title.toLowerCase().includes(searchQuery) ||
            note.modelName?.toLowerCase().includes(searchQuery) ||
            note.channelName?.toLowerCase().includes(searchQuery) ||
            note.voucherType.toLowerCase().includes(searchQuery) // BARIS BARU UNTUK PENCARIAN
        );
    }
    
    // Filter berdasarkan jenis voucher yang dipilih di form Tambah Catatan
    if (uiState.notesData.voucherType) {
        filtered = filtered.filter(note => note.voucherType === uiState.notesData.voucherType);
    }

    // Mengurutkan berdasarkan tanggal berakhir (semakin dekat, semakin di atas)
    return filtered.sort((a, b) => {
        if (uiState.notesSortBy === 'endDate-asc') {
            return a.endDate.getTime() - b.endDate.getTime();
        }
        // Tambahkan logika pengurutan lain jika diperlukan
        return 0;
    });
});



const monthlyPrice = ref(350000);
const yearlyPrice = ref(4200000);
const discountedMonthlyPrice = ref(250000);
const discountedYearlyPrice = ref(2500000);

async function submitAddProduct() {
  const form = uiState.modalData;
  if (!form.sku || !form.nama || !form.modelId || !form.warna || !form.varian) {
    alert('SKU, Nama, Model produk, Warna, dan Varian wajib diisi.');
    return;
  }

  const skuFormatted = form.sku.toUpperCase().replace(/\s+/g, '-');
  const userId = currentUser.value.uid;

  try {
    const productsCollection = collection(db, "products");
    const q = query(productsCollection, where("sku", "==", skuFormatted), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      throw new Error(`Produk dengan SKU "${skuFormatted}" sudah terdaftar untuk akun Anda.`);
    }

    const newProductRef = doc(collection(db, "products"));

    const productData = {
      id: newProductRef.id,
      product_name: form.nama,
      model_id: form.modelId,
      color: form.warna || '',
      variant: form.varian || '',
      physical_stock: 0,
      hpp: 0,
      userId: userId,
      sku: skuFormatted
    };

    const batch = writeBatch(db);
    batch.set(newProductRef, productData);

    state.settings.marketplaces.forEach(channel => {
      const priceDocId = `${newProductRef.id}-${channel.id}`;
      const priceRef = doc(db, "product_prices", priceDocId);
      batch.set(priceRef, {
        product_id: newProductRef.id,
        product_sku: skuFormatted,
        marketplace_id: channel.id,
        price: 0,
        userId: userId
      });
    });

    await batch.commit();

    // Perbarui state lokal secara langsung
    state.produk.push({
      docId: newProductRef.id,
      sku: productData.sku,
      nama: productData.product_name,
      model_id: productData.model_id,
      warna: productData.color,
      varian: productData.variant,
      stokFisik: productData.physical_stock,
      hpp: productData.hpp,
      hargaJual: {},
      stokAlokasi: {},
      userId: productData.userId
    });

    alert(`Produk "${form.nama}" berhasil ditambahkan!`);
    hideModal();

  } catch (error) {
    console.error('Error menyimpan produk:', error);
    alert(`Gagal menyimpan produk: ${error.message}`);
  }
}


async function addSupplier() {
    if (!currentUser.value) return alert("Anda harus login.");
    const form = uiState.modalData;
    if (!form.name) return alert("Nama supplier tidak boleh kosong.");
    
    const dataToSave = { ...form, userId: currentUser.value.uid, products: [] };
    
    try {
        const docRef = await addDoc(collection(db, "suppliers"), dataToSave);
        state.suppliers.push({ id: docRef.id, ...dataToSave });
        hideModal();
        alert('Supplier baru berhasil ditambahkan!');
    } catch (error) {
        console.error("Gagal menambah supplier:", error);
        alert("Gagal menambah supplier. Silakan coba lagi.");
    }
}

async function updateSupplier() {
    if (!currentUser.value) return alert("Anda harus login.");
    const form = uiState.modalData;
    
    try {
        const supplierRef = doc(db, "suppliers", form.id);
        await updateDoc(supplierRef, { name: form.name, contact: form.contact });
        
        const index = state.suppliers.findIndex(s => s.id === form.id);
        if (index !== -1) {
            state.suppliers[index].name = form.name;
            state.suppliers[index].contact = form.contact;
        }
        
        hideModal();
        alert('Data supplier berhasil diperbarui!');
    } catch (error) {
        console.error("Gagal memperbarui supplier:", error);
        alert("Gagal memperbarui supplier. Silakan coba lagi.");
    }
}

async function deleteSupplier(supplierId) {
    if (!confirm("Anda yakin ingin menghapus supplier ini? Semua data produknya juga akan terhapus.")) {
        return;
    }
    
    try {
        await deleteDoc(doc(db, "suppliers", supplierId));
        state.suppliers = state.suppliers.filter(s => s.id !== supplierId);
        alert("Supplier berhasil dihapus.");
    } catch (error) {
        console.error("Gagal menghapus supplier:", error);
        alert("Gagal menghapus supplier. Silakan coba lagi.");
    }
}

async function addSupplierPayment() {
    if (!currentUser.value) return alert("Anda harus login.");
    
    const form = uiState.newPaymentData;
    const order = uiState.modalData;

    if (!form.amount || form.amount <= 0 || !form.date || !form.method) {
        return alert("Jumlah, tanggal, dan metode pembayaran wajib diisi.");
    }

    isSaving.value = true;
    try {
        const batch = writeBatch(db);
        const orderRef = doc(db, "purchase_orders", order.id);

        // Siapkan data pembayaran baru
        const newPayment = {
            amount: form.amount,
            date: new Date(form.date),
            method: form.method,
            notes: form.notes || ''
        };

        // Update data di pesanan
        const newPaymentHistory = [...(order.paymentHistory || []), newPayment];
        const newTotalPaid = newPaymentHistory.reduce((sum, p) => sum + p.amount, 0);
        
        let newStatus = 'Cicilan';
        if (newTotalPaid >= order.totalQtyValue) {
            newStatus = 'Lunas';
        }

        batch.update(orderRef, {
            paymentHistory: newPaymentHistory,
            dibayarkan: newTotalPaid,
            statusPembayaran: newStatus
        });

        // Buat catatan pengeluaran baru di 'keuangan'
        const expenseRef = doc(collection(db, "keuangan"));
        const expenseData = {
            tanggal: new Date(form.date),
            jenis: 'pengeluaran',
            kategori: 'Pembayaran Supplier',
            jumlah: form.amount,
            catatan: `Pembayaran untuk PO #${order.id.slice(-6)} ke ${order.supplierName}. Metode: ${form.method}.`,
            userId: currentUser.value.uid
        };
        batch.set(expenseRef, expenseData);

        await batch.commit();

        // Update state lokal
        const orderInState = state.purchaseOrders.find(o => o.id === order.id);
        if (orderInState) {
            orderInState.paymentHistory = newPaymentHistory;
            orderInState.dibayarkan = newTotalPaid;
            orderInState.statusPembayaran = newStatus;
        }
        state.keuangan.push({ id: expenseRef.id, ...expenseData });

        alert('Pembayaran berhasil dicatat!');
        hideModal();

    } catch (error) {
        console.error("Gagal menambah pembayaran:", error);
        alert("Gagal menambah pembayaran. Silakan coba lagi.");
    } finally {
        isSaving.value = false;
    }
}

async function addPurchaseOrderItemToInventory(item) {
    if (!currentUser.value) return alert("Anda harus login.");
    if (!confirm(`Anda yakin ingin memasukkan ${item.qty} pcs produk ${item.sku} ke inventaris? Stok akan bertambah.`)) {
        return;
    }

    const productInState = state.produk.find(p => p.sku === item.sku);
    if (!productInState) {
        return alert(`Error: Produk dengan SKU ${item.sku} tidak ditemukan di inventaris.`);
    }

    isSaving.value = true;
    try {
        const batch = writeBatch(db);
        
        const productRef = doc(db, "products", productInState.docId);
        const newStock = (productInState.stokFisik || 0) + (item.qty || 0);
        batch.update(productRef, { physical_stock: newStock });

        const orderRef = doc(db, "purchase_orders", item.orderId);
        const orderInState = state.purchaseOrders.find(o => o.id === item.orderId);
        
        const updatedProdukItems = JSON.parse(JSON.stringify(orderInState.produk));
        const itemToUpdate = updatedProdukItems.find(p => p.sku === item.sku && p.hargaJual === item.hargaJual && p.qty === item.qty && !p.isInventoried);
        
        if (itemToUpdate) {
            itemToUpdate.isInventoried = true;
        }
        batch.update(orderRef, { produk: updatedProdukItems });
        
        await batch.commit();

        productInState.stokFisik = newStock;
        const originalItemInOrder = orderInState.produk.find(p => p.sku === item.sku && p.hargaJual === item.hargaJual && p.qty === item.qty && !p.isInventoried);
        if (originalItemInOrder) {
            originalItemInOrder.isInventoried = true;
        }

        alert('Stok berhasil dimasukkan ke inventaris!');
    } catch (error) {
        console.error("Gagal memasukkan stok ke inventaris:", error);
        alert(`Gagal: ${error.message}`);
    } finally {
        isSaving.value = false;
    }
}

async function deletePurchaseOrder(orderId) {
    if (!confirm("Anda yakin ingin menghapus riwayat penerimaan barang ini? Aksi ini tidak dapat dibatalkan.")) {
        return;
    }

    try {
        await deleteDoc(doc(db, "purchase_orders", orderId));
        state.purchaseOrders = state.purchaseOrders.filter(order => order.id !== orderId);
        alert("Riwayat penerimaan barang berhasil dihapus.");
    } catch (error) {
        console.error("Gagal menghapus riwayat penerimaan barang:", error);
        alert("Gagal menghapus riwayat penerimaan barang. Silakan coba lagi.");
    }
}

function showEditPenerimaanBarangForm(order) {
    // Salin data pesanan yang dipilih ke formulir untuk diedit
    uiState.penerimaanBarangForm = JSON.parse(JSON.stringify(order));
    uiState.activeSupplierView = 'form';
}

function showPenerimaanBarangForm(supplier) {
    uiState.penerimaanBarangForm = {
    supplierId: supplier.id,
    supplierName: supplier.name,
    tanggal: new Date().toISOString().split('T')[0],
    produk: [],
    statusProses: 'Dalam Proses',
    statusPembayaran: 'Belum Dibayar',
    dibayarkan: 0, // <-- TAMBAHKAN INI
    tanggalPembayaran: '', // <-- TAMBAHKAN INI
    catatan: '',
};
    uiState.selectedProductForPurchase = null; // <-- TAMBAHKAN BARIS INI
    uiState.activeSupplierView = 'form';
}



function removeProductFromPenerimaanBarang(index) {
    uiState.penerimaanBarangForm.produk.splice(index, 1);
}

function hidePenerimaanBarangForm() {
    if (confirm('Yakin ingin membatalkan? Semua data yang belum disimpan akan hilang.')) {
        uiState.activeSupplierView = 'list';
    }
}

async function submitPenerimaanBarang() {
    if (!currentUser.value) return alert("Anda harus login.");
    const form = uiState.penerimaanBarangForm;
    
    // Perbaikan: Validasi tambahan
    if (form.produk.length === 0) {
        return alert("Daftar produk tidak boleh kosong.");
    }
    for (const p of form.produk) {
        if (!p.sku || p.qty === null || p.qty === undefined || p.hargaJual === null || p.hargaJual === undefined) {
            return alert("Setiap produk harus memiliki SKU, Harga Jual, dan Kuantitas yang valid.");
        }
    }

    // Perbaikan: Tentukan status pembayaran order secara keseluruhan
    let totalTagihan = form.produk.reduce((sum, p) => sum + (p.hargaJual || 0) * (p.qty || 0), 0);
let sudahDibayar = form.dibayarkan || 0;
let orderPaymentStatus = 'Belum Dibayar';

if (sudahDibayar > 0 && sudahDibayar < totalTagihan) {
    orderPaymentStatus = 'Cicilan';
} else if (sudahDibayar >= totalTagihan && totalTagihan > 0) {
    orderPaymentStatus = 'Lunas';
}

    let totalQtyValue = form.produk.reduce((sum, p) => sum + (p.hargaJual || 0) * (p.qty || 0), 0);
    
    // Perbaikan: Buat objek data secara eksplisit
    const dataToSave = {
        userId: currentUser.value.uid,
        supplierId: form.supplierId || null,
        supplierName: form.supplierName || 'N/A',
        tanggal: new Date(form.tanggal),
        produk: form.produk.map(p => ({
            id: p.id || null, 
            sku: p.sku || '',
            modelName: p.modelName || '',
            color: p.color || '',
            size: p.size || '',
            hargaJual: p.hargaJual || 0,
            qty: p.qty || 0,
            statusProses: p.statusProses || 'Dalam Proses',
            statusPembayaran: p.statusPembayaran || 'Belum Dibayar', // Simpan status per produk
            returReason: p.returReason || null,
        })),
        dibayarkan: form.dibayarkan || 0, // Simpan total yang sudah dibayarkan
        statusPembayaran: orderPaymentStatus, // Simpan status keseluruhan
        catatan: form.catatan || '',
        totalQtyValue,
        createdAt: new Date(),
    };

    try {
        let docRef;
        if (form.id) {
            const docToUpdate = doc(db, "purchase_orders", form.id);
            await updateDoc(docToUpdate, dataToSave);
            const index = state.purchaseOrders.findIndex(order => order.id === form.id);
            if (index !== -1) {
                state.purchaseOrders[index] = { id: form.id, ...dataToSave, tanggal: dataToSave.tanggal };
            }
            alert(`Pesanan berhasil diperbarui.`);
        } else {
            docRef = await addDoc(collection(db, "purchase_orders"), dataToSave);
            state.purchaseOrders.unshift({ id: docRef.id, ...dataToSave, tanggal: dataToSave.tanggal });
            alert(`Penerimaan barang berhasil dicatat dengan ID: ${docRef.id}`);
        }
        uiState.activeSupplierView = 'list';
    } catch (error) {
        console.error("Gagal menyimpan penerimaan barang:", error);
        alert(`Gagal menyimpan penerimaan barang. Detail: ${error.message}`);
    }
}

async function handleCashoutRequest() {
    const amountToWithdraw = totalUnpaidCommission.value;
    if (amountToWithdraw <= 0) return;
    const withdrawalId = `WDRW-${Date.now()}`;
    if (!confirm(`Anda akan mengajukan pencairan sebesar ${formatCurrency(amountToWithdraw)}. Lanjutkan?`)) return;

    isSaving.value = true;
    try {
        const idToken = await auth.currentUser.getIdToken(true);
        const response = await fetch('/api/request-cashout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({
                amountToWithdraw: amountToWithdraw,
                withdrawalId: withdrawalId,
                referralCode: currentUser.value.referralCode
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Error server.');

        // UI akan update otomatis via onSnapshot, cukup beri notif
        alert('Permintaan pencairan Anda telah berhasil diajukan dan sedang diproses.');

    } catch (error) {
        console.error('Error saat mencairkan komisi:', error);
        alert(`Gagal mengajukan pencairan: ${error.message}`);
    } finally {
        isSaving.value = false;
    }
}

async function proceedToPartnerPayment() {
    if (!currentUser.value) {
        return alert("Anda harus login.");
    }

    try {
        const priceToPay = 50000;
        const itemName = 'Biaya Pendaftaran Mitra Fashion OS';

        const response = await fetch('/api/create-mayar-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: priceToPay,
                item_name: itemName,
                customer_email: currentUser.value.email,
                callback_url: 'https://appfashion.id/api/mayar-webhook',
                redirect_url: `https://appfashion.id/langganan?status=success`,
                merchant_ref: `PARTNERREG-${currentUser.value.uid}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            }),
        });

        const data = await response.json();
        if (data.invoice_url) {
            window.location.href = data.invoice_url;
        } else {
            throw new Error('Gagal mendapatkan URL pembayaran dari Mayar.');
        }
    } catch (error) {
        console.error("Gagal memproses pendaftaran mitra:", error);
        alert(`Gagal memproses pendaftaran. Silakan coba lagi.\n\nError: ${error.message}`);
    }
}

function handlePosSubmit() {
    if (uiState.pos_order_id) {
        alert("Selesaikan transaksi saat ini terlebih dahulu!");
        uiState.pos_scan_input = '';
        return;
    }
    const scannedValue = uiState.pos_scan_input.trim();
    if (!scannedValue) return;

    const product = getProductBySku(scannedValue);

    if (product) {
        addProductToCart(product);
    } else if (activeCart.value.length > 0) {
        // Jika BUKAN produk DAN keranjang sudah terisi, anggap ini ID Pesanan
        uiState.pos_order_id = scannedValue;
    } else {
        alert(`SKU "${scannedValue}" tidak ditemukan.`);
    }
    
    uiState.posSearchRecommendations = [];
    uiState.pos_scan_input = '';
}


// PASTIKAN FUNGSI INI ADA (dari panduan sebelumnya)
function handlePosSearch() {
    const query = uiState.pos_scan_input.trim().toLowerCase();
    if (query.length < 2) {
        uiState.posSearchRecommendations = [];
        return;
    }
    uiState.posSearchRecommendations = state.produk
        .filter(p => `${p.sku} ${p.nama}`.toLowerCase().includes(query))
        .slice(0, 5);
}

// PASTIKAN FUNGSI INI ADA (dari panduan sebelumnya)
function selectPosRecommendation(product) {
    if (uiState.pos_order_id) {
        alert("Selesaikan transaksi saat ini terlebih dahulu!");
        return;
    }
    addProductToCart(product);
    uiState.pos_scan_input = '';
    uiState.posSearchRecommendations = [];
}

function handleBulkManualSearch() {
    clearTimeout(bulkSearchDebounceTimer);
    const query = uiState.bulk_manual_input.trim().toLowerCase();
    if (query.length < 2) {
        uiState.bulk_recommendations = [];
        return;
    }
    bulkSearchDebounceTimer = setTimeout(() => {
        // Filter produk seperti biasa
        const filteredProducts = state.produk
            .filter(p => `${p.sku} ${p.nama}`.toLowerCase().includes(query));
        
        // Tambahkan informasi nama model ke setiap produk hasil filter
        const recommendationsWithModel = filteredProducts.map(p => {
            const model = state.settings.modelProduk.find(m => m.id === p.model_id);
            return {
                ...p,
                modelNama: model ? model.namaModel : 'N/A'
            };
        });

        uiState.bulk_recommendations = recommendationsWithModel.slice(0, 5);
    }, 200);
}

// FUNGSI INTI UNTUK MENAMBAHKAN PRODUK KE ANTRIAN SEMENTARA
function addProductToBulkQueue(product) {
    if (!uiState.activeCartChannel) return alert("Pilih Channel Penjualan dulu.");
    
    // Bagian ini penting untuk mendefinisikan 'currentOrder'
    let currentOrder = uiState.bulk_order_queue.find(o => o.id.startsWith('TEMP-'));
    if (!currentOrder) {
        currentOrder = {
            id: `TEMP-${Date.now()}`,
            marketplaceOrderId: 'MENUNGGU RESI...',
            items: [],
            status: 'Sedang Diisi'
        };
        uiState.bulk_order_queue.unshift(currentOrder);
    }

    const specialPrice = state.specialPrices[uiState.activeCartChannel]?.[product.sku];
    const regularPrice = product.hargaJual?.[uiState.activeCartChannel] ?? 0;
    const finalPrice = specialPrice !== undefined ? specialPrice : regularPrice;
    
    // Logika komisi baru yang sudah kita tambahkan sebelumnya
    const commissionRate = product.commissions?.[uiState.activeCartChannel] || 0;

    const existingItem = currentOrder.items.find(item => item.sku === product.sku);
    if (existingItem) {
        existingItem.qty++;
        // Pastikan komisi juga di-update jika produk yang sama di-scan lagi
        existingItem.commissionRate = commissionRate;
    } else {
        // Menambahkan item baru lengkap dengan harga dan komisinya
        currentOrder.items.push({ ...product, qty: 1, hargaJualAktual: finalPrice, commissionRate: commissionRate });
    }
}

// FUNGSI SAAT MENG-KLIK REKOMENDASI MANUAL
function selectBulkRecommendation(product) {
    addProductToBulkQueue(product);
    uiState.bulk_manual_input = '';
    uiState.bulk_recommendations = [];
}

// FUNGSI UNTUK TOMBOL MANUAL "JADIKAN ID PESANAN"
function finalizeManualOrder() {
    const marketplaceOrderId = uiState.bulk_manual_input.trim();
    if (!marketplaceOrderId) {
        return alert("Ketik ID Pesanan di kolom input terlebih dahulu.");
    }
    
    let orderToFinalize = uiState.bulk_order_queue.find(o => o.id.startsWith('TEMP-'));
    
    if (orderToFinalize) {
        orderToFinalize.id = marketplaceOrderId;
        orderToFinalize.marketplaceOrderId = marketplaceOrderId;
        orderToFinalize.status = 'Mengantri';
        uiState.bulk_manual_input = ''; // Kosongkan input
        // Baris alert sudah dihapus dari sini
    } else {
        alert("Tidak ada produk dalam daftar untuk difinalisasi. Tambahkan produk terlebih dahulu.");
    }
}

function deleteQueuedOrder(index) {
    if (confirm("Anda yakin ingin menghapus pesanan ini dari antrian?")) {
        uiState.bulk_order_queue.splice(index, 1);
    }
}


// FUNGSI FINAL UNTUK MEMPROSES SEMUA PESANAN DI ANTRIAN
async function processBatchOrders() {
    const ordersToProcess = uiState.bulk_order_queue;
    if (ordersToProcess.length === 0) {
        return alert("Tidak ada pesanan di antrian untuk diproses.");
    }
    if (!confirm(`Anda akan memproses ${ordersToProcess.length} pesanan... Lanjutkan?`)) return;

    uiState.is_processing_scan = true;
    const marketplace = getMarketplaceById(uiState.activeCartChannel);
    let successCount = 0;
    const batch = writeBatch(db);
    
    try {
        const newTransactions = [];
        for (const order of ordersToProcess) {
            const subtotal = order.items.reduce((sum, item) => sum + (item.hargaJualAktual * item.qty), 0);
            const discount = calculateBestDiscount(order.items, uiState.activeCartChannel);
            const finalTotal = subtotal - discount.totalDiscount;
            let totalBiaya = 0;
            const biayaList = [];
            let totalKomisiProduk = 0;

for (const item of order.items) {
    // Dapatkan Nama Model dari item yang terjual
    const modelId = item.model_id; 
    const modelName = (state.settings.modelProduk.find(m => m.id === modelId)?.namaModel || item.nama).split(' ')[0];
    
    // Ambil tarif komisi dari state komisi per model
    const commissionRate = state.commissions.perModel[modelName]?.[uiState.activeCartChannel] || 0;

    if (commissionRate > 0) {
        totalKomisiProduk += (commissionRate / 100) * (item.hargaJualAktual * item.qty);
    }
}

if (totalKomisiProduk > 0) {
    biayaList.push({ name: 'Komisi Produk', value: totalKomisiProduk });
    totalBiaya += totalKomisiProduk;
}
            
            if (marketplace.adm > 0) { const val = (marketplace.adm / 100) * finalTotal; biayaList.push({ name: 'Administrasi', value: val }); totalBiaya += val; }
            if (marketplace.perPesanan > 0) { const val = marketplace.perPesanan; biayaList.push({ name: 'Per Pesanan', value: val }); totalBiaya += val; }
            if (marketplace.layanan > 0) { const val = (marketplace.layanan / 100) * finalTotal; biayaList.push({ name: 'Layanan Gratis Ongkir Xtra', value: val }); totalBiaya += val; }
            if (marketplace.programs && marketplace.programs.length > 0) { marketplace.programs.forEach(p => { if (p.rate > 0) { const val = (p.rate / 100) * finalTotal; biayaList.push({ name: p.name, value: val }); totalBiaya += val; } }); }

            const newTransactionData = {
                marketplaceOrderId: order.marketplaceOrderId,
                tanggal: new Date(),
                items: order.items.map(i => ({ sku: i.sku, qty: i.qty, hargaJual: i.hargaJualAktual, hpp: i.hpp })),
                subtotal, discount, total: finalTotal, channel: marketplace.name, channelId: uiState.activeCartChannel,
                biaya: { rincian: biayaList, total: totalBiaya },
                userId: currentUser.value.uid
            };

            const transactionRef = doc(collection(db, "transactions"));
            batch.set(transactionRef, newTransactionData);
            newTransactions.push({ ...newTransactionData, id: transactionRef.id });

            for (const item of order.items) {
                const productRef = doc(db, "products", item.docId);
                const productInState = state.produk.find(p => p.docId === item.docId);
                const newStock = (productInState.stokFisik || 0) - item.qty;
                if (newStock < 0) throw new Error(`Stok untuk ${item.sku} tidak cukup!`);
                batch.update(productRef, { physical_stock: newStock });
            }
            successCount++;
        }
        
        await batch.commit();

        // Perbarui state lokal secara langsung
        state.transaksi.unshift(...newTransactions);
        ordersToProcess.forEach(order => {
            order.items.forEach(item => {
                const productInState = state.produk.find(p => p.docId === item.docId);
                if (productInState) {
                    productInState.stokFisik -= item.qty;
                }
            });
        });

        alert(`Proses Selesai! ${successCount} pesanan berhasil diproses.`);
        uiState.bulk_order_queue = [];
    } catch (error) {
        alert(`Terjadi kesalahan: ${error.message}. Tidak ada pesanan yang diproses.`);
    } finally {
        uiState.is_processing_scan = false;
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

function showNotesModal() {
    // Reset semua state terkait modal sebelum menampilkan yang baru
    uiState.modalData = {};
    uiState.isModalVisible = true;
    
    // Tunda eksekusi sampai DOM diperbarui
    nextTick(() => {
        uiState.modalType = 'notesModal';
        // Reset form data setiap kali modal dibuka
        uiState.notesData = {
            type: 'model', // default
            voucherType: '',
            title: '',
            endDate: new Date().toISOString().split('T')[0],
            endHour: '23',
            endMinute: '59',
            modelName: '',
            channelId: ''
        };
    });
}

async function submitVoucherNote() {
    if (!currentUser.value) return alert("Anda harus login.");
    const form = uiState.notesData;

    if (!form.title || !form.endDate || !form.channelId || !form.voucherType) {
        return alert("Semua kolom wajib diisi.");
    }

    if (form.type === 'model' && !form.modelName) {
        return alert("Nama model produk wajib diisi.");
    }

    const endDateTime = new Date(`${form.endDate}T${form.endHour}:${form.endMinute}:00`);

    const dataToSave = {
        title: form.title,
        type: form.type,
        voucherType: form.voucherType,
        modelName: form.modelName || null,
        channelId: form.channelId,
        channelName: state.settings.marketplaces.find(c => c.id === form.channelId)?.name || 'N/A',
        endDate: endDateTime,
        createdAt: new Date(),
        userId: currentUser.value.uid,
    };

    try {
        const docRef = await addDoc(collection(db, "voucher_notes"), dataToSave);
        state.voucherNotes.push({ id: docRef.id, ...dataToSave, endDate: dataToSave.endDate });
        alert("Catatan voucher berhasil disimpan!");

        // --- PERUBAHAN UTAMA DI SINI ---
        // Baris hideModal() dihapus dan diganti dengan kode untuk mereset form
        uiState.notesData.title = '';
        uiState.notesData.endDate = new Date().toISOString().split('T')[0];
        uiState.notesData.endHour = '23';
        uiState.notesData.endMinute = '59';
        uiState.notesData.modelName = '';
        uiState.notesData.channelId = '';
        uiState.notesData.voucherType = '';
        uiState.notesData.type = 'model'; // Kembali ke default
        // --- AKHIR PERUBAHAN ---

    } catch (error) {
        console.error("Gagal menyimpan catatan:", error);
        alert("Gagal menyimpan catatan. Silakan coba lagi.");
    }
}

async function deleteVoucherNote(noteId) {
    if (!confirm("Anda yakin ingin menghapus catatan ini?")) return;
    try {
        await deleteDoc(doc(db, "voucher_notes", noteId));
        state.voucherNotes = state.voucherNotes.filter(note => note.id !== noteId);
        alert("Catatan berhasil dihapus.");
    } catch (error) {
        console.error("Gagal menghapus catatan:", error);
        alert("Gagal menghapus catatan.");
    }
}

async function findTransactionForReturn() {
    const orderId = uiState.modalData.transactionIdSearch.trim();
    if (!orderId) {
        return alert("Silakan scan resi atau masukkan ID Pesanan Marketplace.");
    }
    
    // Carii transaksii berdasarkan marketplaceOrderId
    const foundTrx = state.transaksi.find(t => t.marketplaceOrderId && t.marketplaceOrderId.toLowerCase() === orderId.toLowerCase());

    if (foundTrx) {
        uiState.modalData.foundTransaction = foundTrx;
        uiState.modalData.items = foundTrx.items.map(item => ({
            ...item,
            returnQty: item.qty,
            selected: true,
            alasan: '',
            tindakLanjut: 'Ganti Baru'
        }));
    } else {
        alert("Transaksi dengan ID Pesanan tersebut tidak ditemukan.");
        uiState.modalData.foundTransaction = null;
        uiState.modalData.items = [];
    }
}

async function handleSubscriptionMayar(plan) {
    if (!currentUser.value) {
        alert("Silakan login terlebih dahulu.");
        return;
    }

    let isSubscribingPlan = plan === 'bulanan' ? isSubscribingMonthly : isSubscribingYearly;
    if (isSubscribingPlan.value) {
        return;
    }
    isSubscribingPlan.value = true;

    // Logika untuk memeriksa apakah ada kode rujukan yang aktif
    const referredByCode = uiState.referralCodeApplied ? uiState.referralCodeInput : (currentUser.value?.userData?.referredBy || null);

    // --- AWAL PERBAIKAN UTAMA ---
    // Tentukan harga yang akan dibayar berdasarkan status kode rujukan
    let priceToPay;
    if (referredByCode) {
        // Jika ada kode rujukan, gunakan harga diskon
        priceToPay = plan === 'bulanan' ? discountedMonthlyPrice.value : discountedYearlyPrice.value;
    } else {
        // Jika tidak ada, gunakan harga normal
        priceToPay = plan === 'bulanan' ? monthlyPrice.value : yearlyPrice.value;
    }
    // --- AKHIR PERBAIKAN UTAMA ---

    try {
        if (referredByCode) {
            const pendingCommissionRef = doc(db, 'pending_commissions', currentUser.value.email);
            await setDoc(pendingCommissionRef, {
                referredByCode: referredByCode,
                timestamp: new Date(),
            }, { merge: true });
            console.log(`INFO: Data referral untuk ${currentUser.value.email} disimpan di Firestore.`);
        }

        const response = await fetch('/api/create-mayar-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: priceToPay, // <-- Menggunakan variabel harga yang sudah benar
                item_name: `Langganan Fashion OS - Paket ${plan === 'bulanan' ? 'Bulanan' : 'Tahunan'}`,
                customer_email: currentUser.value.email,
                callback_url: 'https://appfashion.id/api/mayar-webhook',
                redirect_url: `https://appfashion.id/langganan?status=success`,
                merchant_ref: `FASHIONOS-${currentUser.value.uid}-${Date.now()}-${plan}`,
            }),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || `Mayar API Error: ${response.status}`);
        }
        if (data.invoice_url) {
            window.location.href = data.invoice_url;
        } else {
            throw new Error('Gagal mendapatkan URL pembayaran dari Mayar.');
        }
    } catch (error) {
        console.error("Gagal memproses langganan Mayar:", error);
        alert(`Gagal memproses langganan. Silakan coba lagi.\n\nError: ${error.message}`);
    } finally {
        isSubscribingPlan.value = false;
    }
}

const voucherTokoMinBelanjaComputed = (channel) => computed({
    get() { 
        const promo = state.promotions.perChannel[channel.id]?.voucherToko;
        return promo?.minBelanja ? 'Rp ' + formatInputNumber(promo.minBelanja) : '';
    },
    set(newValue) {
        if (!state.promotions.perChannel[channel.id]) state.promotions.perChannel[channel.id] = {};
        if (!state.promotions.perChannel[channel.id].voucherToko || typeof state.promotions.perChannel[channel.id].voucherToko !== 'object') {
            state.promotions.perChannel[channel.id].voucherToko = {};
        }
        state.promotions.perChannel[channel.id].voucherToko.minBelanja = parseInputNumber(newValue);
    }
});

const voucherSemuaProdukMinBelanjaComputed = (channel) => computed({
    get() { 
        const promo = state.promotions.perChannel[channel.id]?.voucherSemuaProduk;
        return promo?.minBelanja ? 'Rp ' + formatInputNumber(promo.minBelanja) : '';
    },
    set(newValue) {
        if (!state.promotions.perChannel[channel.id]) state.promotions.perChannel[channel.id] = {};
        if (!state.promotions.perChannel[channel.id].voucherSemuaProduk || typeof state.promotions.perChannel[channel.id].voucherSemuaProduk !== 'object') {
            state.promotions.perChannel[channel.id].voucherSemuaProduk = {};
        }
        state.promotions.perChannel[channel.id].voucherSemuaProduk.minBelanja = parseInputNumber(newValue);
    }
});

const diskonMinBelanjaComputed = (modelName, channelId) => computed({
    get() { 
        return state.promotions.perModel[modelName]?.[channelId]?.minBelanja ? 'Rp ' + formatInputNumber(state.promotions.perModel[modelName][channelId].minBelanja) : '';
    },
    set(newValue) {
        if (!state.promotions.perModel[modelName]) {
            state.promotions.perModel[modelName] = {};
        }
        if (!state.promotions.perModel[modelName][channelId]) {
            state.promotions.perModel[modelName][channelId] = {};
        }
        state.promotions.perModel[modelName][channelId].minBelanja = parseInputNumber(newValue);
    }
});

const tieredMinComputed = (tier) => computed({
    get() { return tier.min ? 'Rp ' + formatInputNumber(tier.min) : ''; },
    set(newValue) { tier.min = parseInputNumber(newValue) || 0; }
});


async function saveChannelPromotions(channelId) {
    if (!currentUser.value) return alert("Anda harus login.");
    isSaving.value = true;
    try {
        const userId = currentUser.value.uid;
        const promotionsRef = doc(db, "promotions", userId);
        const channelPromoData = state.promotions.perChannel[channelId];

        // Hanya update data untuk channel yang spesifik ini
        await updateDoc(promotionsRef, {
            [`perChannel.${channelId}`]: JSON.parse(JSON.stringify(channelPromoData))
        });

        alert(`Pengaturan voucher untuk channel ini berhasil disimpan!`);
    } catch (error) {
        console.error("Gagal menyimpan promosi channel:", error);
        alert("Gagal menyimpan promosi channel.");
    } finally {
        isSaving.value = false;
    }
}

async function saveModelPromotions(modelName, channelId) {
    if (!currentUser.value) return alert("Anda harus login.");
    isSaving.value = true;
    try {
        const userId = currentUser.value.uid;
        const promotionsRef = doc(db, "promotions", userId);
        const modelPromoData = state.promotions.perModel[modelName]?.[channelId];

        if (modelPromoData) {
            // Hanya update data untuk model dan channel yang spesifik ini
            await updateDoc(promotionsRef, {
                [`perModel.${modelName}.${channelId}`]: JSON.parse(JSON.stringify(modelPromoData))
            });
            alert(`Promosi untuk model ${modelName} di channel ini berhasil disimpan!`);
        } else {
            alert('Tidak ada perubahan untuk disimpan.');
        }
    } catch (error) {
        console.error("Gagal menyimpan promosi model:", error);
        alert("Gagal menyimpan promosi model.");
    } finally {
        isSaving.value = false;
    }
}

async function applyReferralCode() {
    if (currentUser.value?.userData?.referredBy) {
        uiState.referralCodeMessage = "Anda sudah memiliki diskon rujukan.";
        return;
    }
    if (!uiState.referralCodeInput) {
        uiState.referralCodeMessage = "Kode rujukan tidak boleh kosong.";
        uiState.referralCodeApplied = false;
        return;
    }

    try {
        const usersCollection = collection(db, "users");
        const q = query(usersCollection, where("referralCode", "==", uiState.referralCodeInput));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const partnerDoc = querySnapshot.docs[0];
            if (partnerDoc.data().isPartner) {
                uiState.referralCodeApplied = true;
                uiState.referralCodeMessage = "Kode rujukan berhasil diterapkan! Harga paket akan disesuaikan.";
            } else {
                uiState.referralCodeMessage = "Kode rujukan tidak valid atau bukan milik mitra.";
                uiState.referralCodeApplied = false;
            }
        } else {
            uiState.referralCodeMessage = "Kode rujukan tidak valid atau tidak ditemukan.";
            uiState.referralCodeApplied = false;
        }
    } catch (error) {
        console.error("Error applying referral code:", error);
        uiState.referralCodeMessage = "Terjadi kesalahan saat memvalidasi kode.";
        uiState.referralCodeApplied = false;
    }
}


async function addCategory() {
    if (!currentUser.value) return alert("Anda harus login.");
    const form = uiState.nestedModalData;
    if (!form.name) return alert("Nama kategori tidak boleh kosong.");

    const newCategory = {
        id: `CAT-${Date.now()}`,
        name: form.name,
        description: form.description || '',
        userId: currentUser.value.uid,
    };
    try {
        const categoryRef = doc(db, "categories", newCategory.id);
        await setDoc(categoryRef, newCategory);

        // Langsung tambahkan kategori baru ke state lokal
        state.settings.categories.push(newCategory);

        alert('Kategori baru berhasil ditambahkan.');
        hideNestedModal();
    } catch (error) {
        console.error("Gagal menambahkan kategori:", error);
        alert("Gagal menambahkan kategori. Silakan coba lagi.");
    }
}

async function updateCategory() {
    if (!currentUser.value) return alert("Anda harus login.");
    const form = uiState.nestedModalData;
    if (!form.name) return alert("Nama kategori tidak boleh kosong.");

    try {
        const categoryRef = doc(db, "categories", form.id);
        await updateDoc(categoryRef, {
            name: form.name,
            description: form.description,
        });

        // Cari dan perbarui kategori di state lokal
        const index = state.settings.categories.findIndex(cat => cat.id === form.id);
        if (index !== -1) {
            state.settings.categories[index] = { ...form };
        }

        alert('Kategori berhasil diperbarui.');
        hideNestedModal();
    } catch (error) {
        console.error("Gagal memperbarui kategori:", error);
        alert("Gagal memperbarui kategori. Silakan coba lagi.");
    }
}

async function deleteCategory(categoryId) {
    if (!currentUser.value) return alert("Anda harus login.");
    if (!confirm('Anda yakin ingin menghapus kategori ini?')) return;
    try {
        const categoryRef = doc(db, "categories", categoryId);
        await deleteDoc(categoryRef);
        
        // Hapus data dari state lokal
        state.settings.categories = state.settings.categories.filter(cat => cat.id !== categoryId);

        alert('Kategori berhasil dihapus.');
    } catch (error) {
        console.error("Gagal menghapus kategori:", error);
        alert("Gagal menghapus kategori. Silakan coba lagi.");
    }
}

// GANTI SELURUH FUNGSI handleRegister INI
async function handleRegister() {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, authForm.email, authForm.password);
        const user = userCredential.user;
        const now = new Date();
        const userDocRef = doc(db, "users", user.uid);

        let newUserData = {
            email: user.email,
            subscriptionStatus: 'trial',
            subscriptionEndDate: null,
            trialEndDate: null,
            dashboardPin: authForm.dashboardPin || null,
            
            // --- BARIS BARU UNTUK PROGRAM KEMITRAAN ---
            isPartner: false, // Default: pengguna baru bukan mitra
            referralCode: null,
            referredBy: authForm.referredBy || null // <-- Ambil kode rujukan dari form jika ada
            // --- AKHIR BARIS BARU ---
        };
        
        if (authForm.activationCode) {
            const codeRef = doc(db, "activation_codes", authForm.activationCode);
            const codeDoc = await getDoc(codeRef);

            if (codeDoc.exists() && codeDoc.data().status === 'unused') {
                newUserData.subscriptionStatus = 'active';
                const nextMonth = new Date(now.setMonth(now.getMonth() + 1));
                newUserData.subscriptionEndDate = nextMonth;
                alert('Registrasi berhasil! Langganan Anda aktif selama 30 hari.');
                await updateDoc(codeRef, { status: 'used', usedBy: user.uid, usedAt: new Date() });
            } else {
                const threeDaysLater = new Date(now.setDate(now.getDate() + 3));
                newUserData.trialEndDate = threeDaysLater;
                alert('Kode aktivasi tidak valid atau sudah digunakan. Anda mendapatkan free trial selama 3 hari.');
            }
        } else {
            const threeDaysLater = new Date(now.setDate(now.getDate() + 3));
            newUserData.trialEndDate = threeDaysLater;
            alert('Registrasi berhasil! Anda mendapatkan free trial selama 3 hari.');
        }

        await setDoc(userDocRef, newUserData, { merge: true });
        authForm.error = '';
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            authForm.error = 'Alamat email ini sudah terdaftar. Silakan gunakan email lain atau login.';
        } else if (error.code === 'auth/invalid-email') {
            authForm.error = 'Format alamat email tidak valid.';
        } else if (error.code === 'auth/weak-password') {
            authForm.error = 'Kata sandi terlalu lemah. Minimal 6 karakter.';
        } else {
            authForm.error = 'Terjadi kesalahan saat mendaftar. Silakan coba lagi.';
        }
    }
}

async function handleLogin() {
    try {
        // [PERBAIKAN DI SINI]
        // Kita tidak perlu lagi menyimpan 'userCredential' karena
        // onAuthStateChanged akan menanganinya secara otomatis.
        await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
        
        // Baris `const user = userCredential.user;` sudah dihapus.
        // Baris `await handleAuth(user);` sudah dihapus.
        
        authForm.error = '';
        alert('Selamat datang kembali!');

    } catch (error) {
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            authForm.error = 'Email atau kata sandi salah.';
        } else {
            authForm.error = 'Terjadi kesalahan saat login.';
        }
    }
}

async function handleLogout() {
    await signOut(auth);
}

async function handleActivation() {
    if (!activationCodeInput.value) {
        activationCodeMessage.value = 'Kode tidak boleh kosong.';
        return;
    }
    if (!currentUser.value) {
        activationCodeMessage.value = 'Anda harus login untuk mengaktifkan kode.';
        return;
    }

    try {
        isSaving.value = true; // Menunjukkan proses sedang berjalan
        activationCodeMessage.value = 'Memvalidasi kode...';

        const codeRef = doc(db, "activation_codes", activationCodeInput.value);
        const codeDoc = await getDoc(codeRef);

        if (codeDoc.exists() && codeDoc.data().status === 'unused') {
            const userRef = doc(db, "users", currentUser.value.uid);
            const now = new Date();
            const nextMonth = new Date(new Date(now).setMonth(now.getMonth() + 1));
            
            const batch = writeBatch(db);
            // Update data pengguna
            batch.update(userRef, {
                subscriptionStatus: 'active',
                subscriptionEndDate: nextMonth,
                trialEndDate: null // Hapus masa trial jika ada
            });
            // Update status kode aktivasi
            batch.update(codeRef, {
                status: 'used',
                usedBy: currentUser.value.uid,
                usedAt: new Date()
            });

            await batch.commit();
            
            activationCodeMessage.value = '';
            alert('Aktivasi berhasil! Langganan Anda sekarang aktif selama 1 bulan.');
            // onAuthStateChanged akan otomatis memuat ulang data dan status langganan
        } else {
            throw new Error('Kode aktivasi tidak valid atau sudah digunakan.');
        }
    } catch (error) {
        activationCodeMessage.value = error.message;
    } finally {
        isSaving.value = false;
    }
}

// Metode untuk login dengan Google
async function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        // Cek apakah ini pengguna baru atau lama
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            // Jika pengguna baru, inisialisasi data dan berikan trial
            const now = new Date();
            // Perubahan di sini: dari 7 hari menjadi 3 hari
            const threeDaysLater = new Date(now.setDate(now.getDate() + 3));
            const newUserData = {
                email: user.email,
                subscriptionStatus: 'trial',
                subscriptionEndDate: null,
                trialEndDate: threeDaysLater,
            };
            await setDoc(userDocRef, newUserData);
            // Perubahan teks notifikasi di sini
            alert('Selamat datang! Anda mendapatkan free trial selama 3 hari.');
        } else {
            // Jika pengguna lama, tidak perlu melakukan apa-apa
            alert('Selamat datang kembali!');
        }
    } catch (error) {
        console.error("Error login dengan Google:", error);
        alert(error.message);
    }
}

const authForm = reactive({
    email: '',
    password: '',
    error: '',
    dashboardPin: '',
    activationCode: '',
    referredBy: ''
});

function addProgram() {
    const marketplace = uiState.modalData;
    if (marketplace) {
        if (!marketplace.programs) {
            marketplace.programs = [];
        }
        marketplace.programs.push({
            id: `program-${Date.now()}`,
            name: '',
            rate: 0
        });
    }
}
function removeProgram(programId) {
    const marketplace = uiState.modalData;
    if (marketplace && marketplace.programs) {
        const index = marketplace.programs.findIndex(p => p.id === programId);
        if (index !== -1) {
            marketplace.programs.splice(index, 1);
        }
    }
}

async function submitStockAdjustment() {
  const form = uiState.modalData;
  if (!form.sku || !form.qty || form.qty <= 0 || !form.alasan || !form.tipe) {
    alert('Semua kolom wajib diisi dan jumlah harus lebih dari 0.');
    return;
  }

  const skuToUpdate = form.sku.toUpperCase();
  const quantity = form.qty;
  const adjustmentType = form.tipe;
  let hppLoss = 0;

  try {
    const productsCollection = collection(db, "products");
    const q = query(productsCollection, where("sku", "==", skuToUpdate), where("userId", "==", currentUser.value.uid));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      throw new Error(`Produk dengan SKU "${skuToUpdate}" tidak ditemukan.`);
    }

    const productDocSnapshot = querySnapshot.docs[0];
    const productId = productDocSnapshot.id;
    const productRef = doc(db, "products", productId);
    const productInState = state.produk.find(p => p.docId === productId);

    await runTransaction(db, async (transaction) => {
      const productDoc = await transaction.get(productRef);
      const currentStock = productDoc.data().physical_stock || 0;
      let newStock;

      if (adjustmentType === 'penambahan') {
        newStock = currentStock + quantity;
      } else { // 'pengurangan'
        newStock = currentStock - quantity;
        if (newStock < 0) {
          throw new Error(`Stok tidak cukup. Stok saat ini: ${currentStock}, akan dikurangi: ${quantity}.`);
        }
        hppLoss = (productDoc.data().hpp || 0) * quantity;
      }

      transaction.update(productRef, { physical_stock: newStock });

      if (adjustmentType === 'pengurangan' && hppLoss > 0) {
        const expenseData = {
          kategori: 'Kerugian Stok',
          jumlah: hppLoss,
          catatan: `${form.alasan}: ${quantity} pcs x ${skuToUpdate}`,
          jenis: 'pengeluaran',
          userId: currentUser.value.uid,
          tanggal: new Date()
        };
        const expenseRef = doc(collection(db, "keuangan"));
        transaction.set(expenseRef, expenseData);
        state.keuangan.push({ id: expenseRef.id, ...expenseData });
      }
    });

    // Perbarui state lokal setelah transaksi selesai
    if (productInState) {
      if (adjustmentType === 'penambahan') {
        productInState.stokFisik += quantity;
      } else {
        productInState.stokFisik -= quantity;
      }
    }

    alert(`Stok untuk SKU ${skuToUpdate} berhasil disesuaikan.`);
    hideModal();

  } catch (error) {
    console.error("Error dalam transaksi penyesuaian stok:", error);
    alert(`Gagal memperbarui stok: ${error.message}`);
  }
}

let profitExpenseChart = null;
let salesChannelChart = null;


// --- UTILITY FUNCTIONS ---
const formatCurrency = (value) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0, // Tidak ada angka di belakang koma
        maximumFractionDigits: 0, // Angka akan dibulatkan
    }).format(value || 0);
};

const targetMarginComputed = computed({
    get() {
        if (uiState.priceCalculator.targetMargin) {
            // Menampilkan kembali dengan koma jika ada
            return uiState.priceCalculator.targetMargin.toString().replace('.', ',') + '%';
        }
        return '';
    },
    set(newValue) {
        // Mengizinkan koma sebagai input desimal dan mengubahnya menjadi titik
        const jsNumberString = newValue.toString().replace(/,/g, '.');
        // Membersihkan karakter selain angka dan titik
        const cleanedValue = jsNumberString.replace(/[^0-9.]/g, '');
        // Menggunakan parseFloat untuk membaca angka desimal
        const parsedValue = parseFloat(cleanedValue) || 0;
        uiState.priceCalculator.targetMargin = parsedValue;
    }
});

const admComputed = computed({
    get() { return uiState.modalData.adm ? uiState.modalData.adm + '%' : ''; },
    set(newValue) { uiState.modalData.adm = parsePercentageInput(newValue); }
});

const layananComputed = computed({
    get() { return uiState.modalData.layanan ? uiState.modalData.layanan + '%' : ''; },
    set(newValue) { uiState.modalData.layanan = parsePercentageInput(newValue); }
});
const programRateComputed = (program) => ({
    get value() {
        return program.rate ? program.rate + '%' : '';
    },
    setValue(newValue) {
        program.rate = parsePercentageInput(newValue);
    }
});


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
const dashboardFilteredData = computed(() => {
    // Memastikan state.keuangan dan state.transaksi adalah array, bahkan jika masih kosong
    const keuanganData = state.keuangan || [];
    const transaksiData = state.transaksi || [];

    const filteredKeuangan = filterDataByDate(
        keuanganData, 
        uiState.dashboardDateFilter, 
        uiState.dashboardStartDate, 
        uiState.dashboardEndDate,
        uiState.dashboardStartMonth,
        uiState.dashboardStartYear,
        uiState.dashboardEndMonth,
        uiState.dashboardEndYear
    );

    const filteredTransaksi = filterDataByDate(
        transaksiData, 
        uiState.dashboardDateFilter, 
        uiState.dashboardStartDate, 
        uiState.dashboardEndDate,
        uiState.dashboardStartMonth,
        uiState.dashboardStartYear,
        uiState.dashboardEndMonth,
        uiState.dashboardEndYear
    );

    const filteredRetur = filterDataByDate(
        state.retur, 
        uiState.dashboardDateFilter, 
        uiState.dashboardStartDate, 
        uiState.dashboardEndDate,
        uiState.dashboardStartMonth,
        uiState.dashboardStartYear,
        uiState.dashboardEndMonth,
        uiState.dashboardEndYear
    );

    return {
        transaksi: filteredTransaksi,
        keuangan: filteredKeuangan,
        retur: filteredRetur
    };
});

const investorLedger = computed(() => {
    if (!state.investor || state.investor.length === 0) {
        return [];
    }

    // 1. Filter investor berdasarkan status yang dipilih di UI
    const filteredInvestors = state.investor.filter(inv => {
        if (uiState.investorStatusFilter === 'semua') return true;
        return inv.status === uiState.investorStatusFilter;
    });

    // 2. Hitung total pembayaran dan ROI untuk setiap investor yang sudah difilter
    return filteredInvestors.map(inv => {
        const payments = state.investorPayments.filter(p => p.investorId === inv.id);
        const totalPayout = payments.reduce((sum, p) => sum + p.investorShare, 0);
        const roi = inv.amount > 0 ? (totalPayout / inv.amount) * 100 : 0;

        return {
            ...inv,
            totalPayout,
            roi
        };
    });
});

const filteredInvestorPayments = computed(() => {
    const payments = state.investorPayments || [];

    // Gunakan fungsi filterDataByDate untuk menyaring data berdasarkan tanggal
    let filteredData = filterDataByDate(
        payments.map(p => ({ ...p, tanggal: p.paymentDate })),
        uiState.investorPaymentFilter,
        null,
        null,
        uiState.investorPaymentStartMonth,
        uiState.investorPaymentStartYear,
        uiState.investorPaymentEndMonth,
        uiState.investorPaymentEndYear
    );

    // Filter berdasarkan pencarian jika ada
    const searchQuery = uiState.investorPaymentSearch.toLowerCase();
    if (searchQuery) {
        filteredData = filteredData.filter(p => 
            p.investorName.toLowerCase().includes(searchQuery) ||
            p.period.toLowerCase().includes(searchQuery) ||
            p.paymentMethod.toLowerCase().includes(searchQuery)
        );
    }
    
    return filteredData.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
});

// GANTI SELURUH COMPUTED PROPERTY INI
const dashboardKpis = computed(() => {
    const { transaksi = [], keuangan = [], retur = [] } = dashboardFilteredData.value || {};
    
    // --- 1. HITUNG TOTAL DARI TRANSAKSI PENJUALAN ---
    const totalOmsetKotorPenjualan = transaksi.reduce((sum, trx) => sum + (trx.subtotal || 0), 0);
    const totalDiskonPenjualan = transaksi.reduce((sum, trx) => sum + (trx.diskon?.totalDiscount || 0), 0);
    const totalHppTerjualPenjualan = transaksi.reduce((sum, trx) => sum + (trx.items || []).reduce((itemSum, item) => itemSum + (item.hpp || 0) * (item.qty || 0), 0), 0);
    const totalBiayaTransaksiPenjualan = transaksi.reduce((sum, trx) => sum + (trx.biaya?.total || 0), 0);

    // --- 2. HITUNG TOTAL DARI DATA RETUR ---
    let totalNilaiRetur_Net = 0;        // Uang yang kembali ke pelanggan (Net)
    let totalHppRetur = 0;            // Nilai HPP barang yang kembali
    let totalDiskonBatal = 0;         // Diskon yang dibatalkan karena retur
    let totalBiayaMarketplaceBatal = 0; // Biaya MP yang dibatalkan karena retur

    retur.forEach(returDoc => {
        (returDoc.items || []).forEach(item => {
            totalNilaiRetur_Net += (item.nilaiRetur || 0);
            totalDiskonBatal += (item.nilaiDiskon || 0);
            totalBiayaMarketplaceBatal += (item.biayaMarketplace || 0);
            const product = getProductBySku(item.sku);
            if (product) {
                totalHppRetur += (product.hpp || 0) * (item.qty || 0);
            }
        });
    });
    // Sesuai permintaan: Nilai retur kotor adalah nilai bersih ditambah diskon yang batal
    const totalNilaiRetur_Kotor = totalNilaiRetur_Net + totalDiskonBatal;

    // --- 3. HITUNG NILAI FINAL SETELAH DISESUAIKAN RETUR ---
    const finalOmsetKotor = totalOmsetKotorPenjualan - totalNilaiRetur_Kotor;
    const finalDiskon = totalDiskonPenjualan - totalDiskonBatal;
    const finalOmsetBersih = finalOmsetKotor - finalDiskon;
    const finalHppTerjual = totalHppTerjualPenjualan - totalHppRetur;
    const finalBiayaTransaksi = totalBiayaTransaksiPenjualan - totalBiayaMarketplaceBatal;
    
    // --- 4. HITUNG METRIK PROFITABILITAS FINAL ---
    const finalLabaKotor = finalOmsetBersih - finalHppTerjual;
    const totalBiayaOperasional = keuangan.filter(i => i.jenis === 'pengeluaran').reduce((sum, i) => sum + i.jumlah, 0);
    const finalLabaBersihOperasional = finalLabaKotor - totalBiayaOperasional - finalBiayaTransaksi;

    // --- 5. KALKULASI LAINNYA ---
    const totalPemasukanLain = keuangan.filter(i => i.jenis === 'pemasukan_lain').reduce((sum, i) => sum + i.jumlah, 0);
    const saldoKas = (totalOmsetKotorPenjualan - totalDiskonPenjualan - totalBiayaTransaksiPenjualan) - totalBiayaOperasional - totalNilaiRetur_Net + totalPemasukanLain;
    const totalUnitStok = (state.produk || []).reduce((sum, p) => sum + (p.stokFisik || 0), 0);
    const totalNilaiStokHPP = (state.produk || []).reduce((sum, p) => sum + ((p.stokFisik || 0) * (p.hpp || 0)), 0);

    // --- 6. KEMBALIKAN SEMUA NILAI FINAL KE TAMPILAN ---
    return {
        saldoKas,
        omsetBersih: finalOmsetBersih,
        labaKotor: finalLabaKotor,
        labaBersihOperasional: finalLabaBersihOperasional,
        totalBiayaOperasional,
        totalUnitStok,
        totalNilaiStokHPP,
        totalNilaiRetur: totalNilaiRetur_Kotor, // Menampilkan nilai retur kotor
        totalOmsetKotor: finalOmsetKotor,
        totalDiskon: finalDiskon,
        totalHppTerjual: finalHppTerjual,
        totalBiayaTransaksi: finalBiayaTransaksi,
    };
});
const namaKainHistory = computed(() => {
    const uniqueNames = new Set(state.gudangKain.map(k => k.namaKain).filter(Boolean));
    return Array.from(uniqueNames).sort();
});

const tokoKainHistory = computed(() => {
    const uniqueToko = new Set(state.gudangKain.map(k => k.toko).filter(Boolean));
    return Array.from(uniqueToko).sort();
});

const totalYardHistory = computed(() => {
    const uniqueYards = new Set(state.gudangKain.map(k => k.sisaYard).filter(y => y !== null));
    return Array.from(uniqueYards).sort((a, b) => a - b);
});

const hargaKainPerYardHistory = computed(() => {
    const uniqueHargas = new Set(state.gudangKain.map(k => k.hargaBeliPerYard).filter(h => h !== null));
    return Array.from(uniqueHargas).sort((a, b) => a - b);
});
const filteredTransaksi = computed(() => {
    let filteredData = filterDataByDate(
        state.transaksi, 
        uiState.posDateFilter, 
        uiState.posStartDate, 
        uiState.posEndDate,
        uiState.posStartMonth,
        uiState.posStartYear,
        uiState.posEndMonth,
        uiState.posEndYear
    );
    
    // BARIS BARUuu: Menambahkan filter berdasarkan channel jika sudah dipilih
    if (uiState.posChannelFilter && uiState.posChannelFilter !== 'all') {
        filteredData = filteredData.filter(trx => trx.channelId === uiState.posChannelFilter);
    }

    return filteredData.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
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
        // Ambil nama model konseptual (misal: "SALWA")
        const model = state.settings.modelProduk.find(m => m.id === product.model_id);
        const modelName = model ? model.namaModel.split(' ')[0] : 'N/A';

        if (!acc[modelName]) {
            acc[modelName] = {
                namaModel: modelName,
                variants: [],
                totalStock: 0,
                totalNilaiStok: 0,
            };
        }
        acc[modelName].variants.push(product);
        acc[modelName].totalStock += (product.stokFisik || 0);
        acc[modelName].totalNilaiStok += (product.stokFisik || 0) * (parseInputNumber(product.hpp) || 0);
        return acc;
    }, {});

    let productGroups = Object.values(grouped);

    const searchTerm = (uiState.inventorySearch || '').toLowerCase();
    const stockFilter = uiState.inventoryFilterStock;
    const minStock = state.settings.minStok;

    productGroups = productGroups.filter(group => {
        const matchesSearch = (group.namaModel || '').toLowerCase().includes(searchTerm) || 
                              group.variants.some(v => (v.sku || '').toLowerCase().includes(searchTerm) || (v.nama || '').toLowerCase().includes(searchTerm));
        if (!matchesSearch) return false;
        
        const totalStock = group.variants.reduce((sum, v) => sum + (v.stokFisik || 0), 0);
        if (stockFilter === 'all') return true;
        if (stockFilter === 'aman') return totalStock > minStock;
        if (stockFilter === 'menipis') return totalStock > 0 && totalStock <= minStock;
        if (stockFilter === 'habis') return totalStock === 0;
        return true;
    });

    productGroups.sort((a, b) => {
        switch (uiState.inventorySort) {
            case 'nama-desc': return b.namaModel.localeCompare(a.namaModel);
            case 'stok-desc': return b.totalStock - a.totalStock;
            case 'stok-asc': return a.totalStock - b.totalStock;
            case 'nama-asc': default: return a.namaModel.localeCompare(b.namaModel);
        }
    });
    
    // --- PERBAIKAN: SORTING VARIAN DI DALAM KELOMPOK ---
    const sizeOrder = {
        'xxs': 1, 'xs': 2, 's': 3, 'm': 4, 'l': 5, 'xl': 6, 'xxl': 7, 'xxxl': 8, 'xxxxl': 9, 'xxxxxl': 10,
        '27': 20, '28': 21, '29': 22, '30': 23, '31': 24, '32': 25, '33': 26, '34': 27, '35': 28, '36': 29, 
        '37': 30, '38': 31, '39': 32, '40': 33, '41': 34, '42': 35, '43': 36, '44': 37, '45': 38, '46': 39,
        'allsize': 90, 'satuukuran': 90
    };
    productGroups.forEach(group => {
        group.variants.sort((a, b) => {
            const colorCompare = (a.warna || '').localeCompare(b.warna || '');
            if (colorCompare !== 0) {
                return colorCompare;
            }
            const sizeA = sizeOrder[a.varian.toLowerCase()] || 999;
            const sizeB = sizeOrder[b.varian.toLowerCase()] || 999;
            return sizeA - sizeB;
        });
    });

    return productGroups;
});

const promosiProductModels = computed(() => {
  if (!sortedProduk.value) return [];
  // Mengambil nama model dasar dari setiap produk yang sudah terurut
  const modelNames = sortedProduk.value.map(product => {
    const model = state.settings.modelProduk.find(m => m.id === product.model_id);
    return model ? model.namaModel.split(' ')[0] : 'N/A';
  });
  // Mengembalikan daftar nama model yang unik dan terurut
  return Array.from(new Set(modelNames)).sort();
});

const filteredVoucherTypes = computed(() => {
    if (uiState.notesData.type === 'model') {
        return ['Voucher Produk Tertentu', 'Diskon Minimal Belanja Bertingkat'];
    }
    if (uiState.notesData.type === 'channel') {
        return ['Voucher Ikuti Toko', 'Voucher Semua Produk'];
    }
    return []; // Default, jika belum dipilih
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

const laporanTotalBiayaJasa = computed(() => {
    // Pastikan data batches sudah tersedia
    if (!uiState.laporanData.laporanPerStatus || uiState.laporanData.laporanPerStatus.length === 0) {
        return 0;
    }

    // Filter ulang batches berdasarkan jenis pekerja yang dipilih
    const filteredBatches = uiState.laporanData.laporanPerStatus.filter(batch => {
        const matchesType = uiState.produksiFilterType === 'all' || batch.produksiType === uiState.produksiFilterType;
        const matchesStatus = uiState.laporanData.statusTerpilih === 'Semua' || batch.statusProses === uiState.laporanData.statusTerpilih;
        return matchesType && matchesStatus;
    });

    // Kalkulasi total biaya Jasa berdasarkan item yang sudah difilter
    return filteredBatches.reduce((total, batch) => {
        // Cek jenis pekerja dari batch dan gunakan harga yang sesuai
        const hargaJasa = batch.produksiType === 'penjahit' ? 'hargaJahitPerPcs' : 'hargaMaklunPerPcs';
        const totalHargaJasaBatch = (batch.kainBahan || []).reduce((subtotal, item) => {
            return subtotal + ((item.aktualJadi || 0) * (item[hargaJasa] || 0));
        }, 0);
        return total + totalHargaJasaBatch;
    }, 0);
});


const filteredPengeluaran = computed(() => {
    const filteredData = state.keuangan.filter(item => item.jenis === 'pengeluaran');
    return filterDataByDate(
        filteredData, 
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
    const filteredData = state.keuangan.filter(item => item.jenis === 'pemasukan_lain');
    return filterDataByDate(
        filteredData, 
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

const isAnyProductPaymentInProgress = computed(() => {
    return uiState.penerimaanBarangForm.produk.some(p => p.statusPembayaran === 'Proses Pembayaran');
});

const totalYangHarusDibayarkan = computed(() => {
    return uiState.penerimaanBarangForm.produk.reduce((sum, p) => {
        return sum + (p.hargaJual || 0) * (p.qty || 0);
    }, 0);
});

const sisaPembayaran = computed(() => {
    return totalYangHarusDibayarkan.value - (uiState.penerimaanBarangForm.dibayarkan || 0);
});


const filteredMarketplaces = computed(() => {
    // Memberikan nilai default array kosong jika state.settings.marketplaces undefined
    const marketplacesData = state.settings.marketplaces || [];
    const query = uiState.pengaturanMarketplaceSearch.toLowerCase();
    if (!query) {
        return marketplacesData;
    }
    return marketplacesData.filter(mp => 
        (mp.name || '').toLowerCase().includes(query)
    );
});

// GANTI SELURUH COMPUTED PROPERTY INI
const filteredModelProduk = computed(() => {
    const modelProdukData = state.settings.modelProduk || [];
    const query = uiState.pengaturanModelProdukSearch.toLowerCase();

    const filteredModels = modelProdukData.filter(model =>
        (model.namaModel || '').toLowerCase().includes(query)
    );
    
    // Kita tidak lagi menggabungkan data produk, hanya menampilkan model itu sendiri
    return filteredModels;
});

const filteredProduksiBatches = computed(() => {
    if (!state.produksi) {
        return [];
    }

    let filteredData = state.produksi;

    // Filter berdasarkan jenis pekerja (Pemaklun/Penjahit)
    if (uiState.produksiFilterType && uiState.produksiFilterType !== 'all') {
        filteredData = filteredData.filter(batch => batch.produksiType === uiState.produksiFilterType);
    }
    
    // Filter berdasarkan status proses
    if (uiState.produksiFilterStatus !== 'all') {
        filteredData = filteredData.filter(batch => batch.statusProses === uiState.produksiFilterStatus);
    }

    // Filter berdasarkan pencarian
    const searchTerm = uiState.produksiSearch.toLowerCase();
    if (searchTerm) {
        filteredData = filteredData.filter(batch => 
            (batch.id || '').toLowerCase().includes(searchTerm) ||
            (batch.namaStatus && batch.namaStatus.toLowerCase().includes(searchTerm)) ||
            (batch.kainBahan || []).some(item =>
                (item.idUnik || '').toLowerCase().includes(searchTerm) ||
                (item.namaKain || '').toLowerCase().includes(searchTerm) ||
                (item.warnaKain || '').toLowerCase().includes(searchTerm) ||
                (item.ukuran || '').toLowerCase().includes(searchTerm)
            )
        );
    }

    return filteredData;
});

const sortedProduk = computed(() => {
    const products = [...state.produk];

    // Objek untuk menentukan urutan ukuran khusus (logis)
    const sizeOrder = {
        'xxs': 1, 'xs': 2, 's': 3, 'm': 4, 'l': 5, 'xl': 6, 'xxl': 7, 'xxxl': 8, 'xxxxl': 9, 'xxxxxl': 10,
        '27': 20, '28': 21, '29': 22, '30': 23, '31': 24, '32': 25, '33': 26, '34': 27, '35': 28, '36': 29,
        '37': 30, '38': 31, '39': 32, '40': 33, '41': 34, '42': 35, '43': 36, '44': 37, '45': 38, '46': 39,
        'allsize': 90, 'satuukuran': 90
    };

    // Fungsi perbandingan yang lebih cerdas
    function compareSizes(a, b) {
        const sizeA = (a || '').toLowerCase().trim();
        const sizeB = (b || '').toLowerCase().trim();
        
        // Menggunakan nilai numerik dari sizeOrder untuk urutan yang konsisten
        const orderA = sizeOrder[sizeA] || 999;
        const orderB = sizeOrder[sizeB] || 999;

        // Jika kedua ukuran ditemukan di sizeOrder, urutkan berdasarkan nilainya
        if (orderA !== 999 && orderB !== 999) {
            return orderA - orderB;
        }

        // Jika salah satu adalah angka murni (misal: "38"), urutkan secara numerik
        const numA = parseInt(sizeA, 10);
        const numB = parseInt(sizeB, 10);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA - numB;
        }
        
        // Jika tidak ada yang cocok, gunakan perbandingan string biasa
        return sizeA.localeCompare(sizeB);
    }

    // Lakukan pengurutan bertingkat
    return products.sort((a, b) => {
        // 1. Urutkan berdasarkan Nama Model
        const modelA = state.settings.modelProduk.find(m => m.id === a.model_id)?.namaModel || a.nama;
        const modelB = state.settings.modelProduk.find(m => m.id === b.model_id)?.namaModel || b.nama;
        const modelCompare = modelA.localeCompare(modelB);
        if (modelCompare !== 0) return modelCompare;

        // 2. Urutkan berdasarkan Warna
        const colorCompare = (a.warna || '').localeCompare(b.warna || '');
        if (colorCompare !== 0) return colorCompare;

        // 3. Urutkan berdasarkan Ukuran dengan fungsi perbandingan yang baru
        return compareSizes(a.varian, b.varian);
    });
});

const commissionModelComputed = (modelName, channelId) => computed({
    get() {
        return state.commissions.perModel[modelName]?.[channelId] ? state.commissions.perModel[modelName][channelId] + '%' : '';
    },
    set(newValue) {
        if (!state.commissions.perModel[modelName]) {
            state.commissions.perModel[modelName] = {};
        }
        // [PERBAIKAN SINI]: Set nilai PURE number, bukan string dengan '%'
        state.commissions.perModel[modelName][channelId] = parsePercentageInput(newValue);
    }
});


const filteredPurchaseOrders = computed(() => {
    let orders = [...state.purchaseOrders];

    // --- Terapkan Filter Waktu ---
    orders = filterDataByDate(
        orders.map(o => ({ ...o, tanggal: o.tanggal })),
        uiState.purchaseOrderDateFilter,
        uiState.purchaseOrderStartDate,
        uiState.purchaseOrderEndDate,
        uiState.purchaseOrderStartMonth,
        uiState.purchaseOrderStartYear,
        uiState.purchaseOrderEndMonth,
        uiState.purchaseOrderEndYear
    );

    // --- Terapkan Filter Nama Supplier & SKU ---
    const searchTerm = uiState.purchaseOrderSearch.toLowerCase();
    if (searchTerm) {
        orders = orders.filter(order =>
            order.supplierName.toLowerCase().includes(searchTerm) ||
            order.produk.some(item => item.sku.toLowerCase().includes(searchTerm))
        );
    }

    // --- Terapkan Filter Status Proses ---
    if (uiState.purchaseOrderStatusProsesFilter !== 'all') {
        orders = orders.filter(order => 
        (order.produk || []).some(p => p.statusProses === uiState.purchaseOrderStatusProsesFilter)
    );
}
    
    // --- Terapkan Filter Status Bayar ---
    if (uiState.purchaseOrderStatusBayarFilter !== 'all') {
        orders = orders.filter(order => order.statusPembayaran === uiState.purchaseOrderStatusBayarFilter);
    }

    // --- Terapkan Logika Pengurutan ---
    return orders.sort((a, b) => {
        switch (uiState.purchaseOrderSort) {
            case 'total-desc':
                return b.totalQtyValue - a.totalQtyValue;
            case 'total-asc':
                return a.totalQtyValue - b.totalQtyValue;
            default: // 'tanggal-desc'
                return new Date(b.tanggal) - new Date(a.tanggal);
        }
    });
});

const itemizedPurchaseHistory = computed(() => {
  // flatMap akan mengubah array pesanan menjadi array item produk yang rata
  return filteredPurchaseOrders.value.flatMap(order => 
    // Jika tidak ada produk di dalam pesanan, kembalikan array kosong
    (order.produk || []).map(item => ({
      ...item, // Ambil semua data dari item (nama, harga, qty, dll)
      orderId: order.id,
      tanggal: order.tanggal,
      supplierName: order.supplierName,
      // Kita simpan juga status dari pesanan induknya
      orderStatusProses: order.statusProses,
      orderStatusPembayaran: order.statusPembayaran
    }))
  );
});

const ringkasanJadiData = computed(() => {
    const summary = {};
    
    // Pertama, filter batches berdasarkan status dan jenis pekerja
    const filteredBatches = state.produksi.filter(batch => {
        const matchesStatus = uiState.ringkasanStatusSelected === 'all' || batch.statusProses === uiState.ringkasanStatusSelected;
        const matchesType = uiState.produksiFilterType === 'all' || batch.produksiType === uiState.produksiFilterType;
        return matchesStatus && matchesType;
    });
    
    // Kemudian, proses data dari batches yang sudah difilter
    filteredBatches.forEach(batch => {
        (batch.kainBahan || []).forEach(kb => {
            if (kb.aktualJadi > 0) {
                const modelName = state.settings.modelProduk.find(m => m.id === kb.modelProdukId)?.namaModel || 'N/A';
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
    const batch = uiState.modalType === 'editProduksi' ? uiState.editProduksiBatch : uiState.modalData;

    if (!batch || !batch.kainBahan) {
        return { ...batch, totalAktualJadi: 0 };
    }

    const total = batch.kainBahan.reduce((sum, item) => {
        return sum + (parseInt(item.aktualJadi, 10) || 0);
    }, 0);

    return {
        ...batch,
        totalAktualJadi: total
    };
});


const voucherTokoDiskonNominalComputed = (channel) => computed({
    get() {
        const promo = state.promotions.perChannel[channel.id]?.voucherToko;
        return promo?.diskonNominal ? formatInputNumber(promo.diskonNominal) : '';
    },
    set(newValue) {
        if (!state.promotions.perChannel[channel.id]) state.promotions.perChannel[channel.id] = {};
        if (!state.promotions.perChannel[channel.id].voucherToko) state.promotions.perChannel[channel.id].voucherToko = {};
        
        const nominal = parseInputNumber(newValue);
        state.promotions.perChannel[channel.id].voucherToko.diskonNominal = nominal > 0 ? nominal : null;
        // Otomatis kosongkan diskon rate jika nominal diisi
        if (nominal > 0) {
            state.promotions.perChannel[channel.id].voucherToko.diskonRate = null;
        }
    }
});

const voucherSemuaProdukDiskonNominalComputed = (channel) => computed({
    get() {
        const promo = state.promotions.perChannel[channel.id]?.voucherSemuaProduk;
        return promo?.diskonNominal ? formatInputNumber(promo.diskonNominal) : '';
    },
    set(newValue) {
        if (!state.promotions.perChannel[channel.id]) state.promotions.perChannel[channel.id] = {};
        if (!state.promotions.perChannel[channel.id].voucherSemuaProduk) state.promotions.perChannel[channel.id].voucherSemuaProduk = {};
        
        const nominal = parseInputNumber(newValue);
        state.promotions.perChannel[channel.id].voucherSemuaProduk.diskonNominal = nominal > 0 ? nominal : null;
        if (nominal > 0) {
            state.promotions.perChannel[channel.id].voucherSemuaProduk.diskonRate = null;
        }
    }
});

const diskonNominalComputed = (modelName, channelId) => computed({
    get() {
        const promo = state.promotions.perModel[modelName]?.[channelId];
        return promo?.diskonNominal ? formatInputNumber(promo.diskonNominal) : '';
    },
    set(newValue) {
        if (!state.promotions.perModel[modelName]) state.promotions.perModel[modelName] = {};
        if (!state.promotions.perModel[modelName][channelId]) state.promotions.perModel[modelName][channelId] = {};

        const nominal = parseInputNumber(newValue);
        state.promotions.perModel[modelName][channelId].diskonNominal = nominal > 0 ? nominal : null;
        if (nominal > 0) {
            state.promotions.perModel[modelName][channelId].diskonRate = null;
        }
    }
});

const tieredDiskonNominalComputed = (tier) => computed({
    get() { 
        return tier.diskonNominal ? formatInputNumber(tier.diskonNominal) : ''; 
    },
    set(newValue) { 
        const nominal = parseInputNumber(newValue);
        tier.diskonNominal = nominal > 0 ? nominal : null;
        if (nominal > 0) {
            tier.diskon = null;
        }
    }
});

// Perbarui computed property yang lama agar bisa mengosongkan nilai nominal
const voucherTokoDiskonRateComputedUpdated = (channel) => computed({
    get() {
        const promo = state.promotions.perChannel[channel.id]?.voucherToko;
        return promo?.diskonRate ? promo.diskonRate + '%' : '';
    },
    set(newValue) {
        if (!state.promotions.perChannel[channel.id]) state.promotions.perChannel[channel.id] = {};
        if (!state.promotions.perChannel[channel.id].voucherToko) state.promotions.perChannel[channel.id].voucherToko = {};
        
        const rate = parsePercentageInput(newValue);
        state.promotions.perChannel[channel.id].voucherToko.diskonRate = rate > 0 ? rate : null;
        if (rate > 0) {
            state.promotions.perChannel[channel.id].voucherToko.diskonNominal = null;
        }
    }
});

const voucherSemuaProdukDiskonRateComputedUpdated = (channel) => computed({
    get() {
        const promo = state.promotions.perChannel[channel.id]?.voucherSemuaProduk;
        return promo?.diskonRate ? promo.diskonRate + '%' : '';
    },
    set(newValue) {
        if (!state.promotions.perChannel[channel.id]) state.promotions.perChannel[channel.id] = {};
        if (!state.promotions.perChannel[channel.id].voucherSemuaProduk) state.promotions.perChannel[channel.id].voucherSemuaProduk = {};
        
        const rate = parsePercentageInput(newValue);
        state.promotions.perChannel[channel.id].voucherSemuaProduk.diskonRate = rate > 0 ? rate : null;
        if (rate > 0) {
            state.promotions.perChannel[channel.id].voucherSemuaProduk.diskonNominal = null;
        }
    }
});

const diskonRateComputedUpdated = (modelName, channelId) => computed({
    get() {
        const promo = state.promotions.perModel[modelName]?.[channelId];
        return promo?.diskonRate ? promo.diskonRate + '%' : '';
    },
    set(newValue) {
        if (!state.promotions.perModel[modelName]) state.promotions.perModel[modelName] = {};
        if (!state.promotions.perModel[modelName][channelId]) state.promotions.perModel[modelName][channelId] = {};

        const rate = parsePercentageInput(newValue);
        state.promotions.perModel[modelName][channelId].diskonRate = rate > 0 ? rate : null;
        if (rate > 0) {
            state.promotions.perModel[modelName][channelId].diskonNominal = null;
        }
    }
});

const tieredDiskonComputedUpdated = (tier) => computed({
    get() { 
        return tier.diskon ? tier.diskon + '%' : ''; 
    },
    set(newValue) { 
        const rate = parsePercentageInput(newValue);
        tier.diskon = rate > 0 ? rate : null;
        if (rate > 0) {
            tier.diskonNominal = null;
        }
    }
});

const laporanSemuanyaData = computed(() => {
    // Awalnya, ambil semua item produksi dari setiap batch
    let semuaItemProduksi = state.produksi.flatMap(batch =>
        (batch.kainBahan || []).map(kain => ({
            ...kain,
            batchId: batch.id,
            tanggal: batch.tanggal,
            namaStatus: batch.namaStatus, // Memastikan nama pekerja ada
            produksiType: batch.produksiType, // Memastikan jenis pekerja ada
            statusProses: batch.statusProses,
        }))
    );

    // Filter berdasarkan jenis pekerja yang dipilih
    if (uiState.produksiFilterType !== 'all') {
        semuaItemProduksi = semuaItemProduksi.filter(item => item.produksiType === uiState.produksiFilterType);
    }
    
    // Terapkan filter tanggal setelah filter jenis pekerja
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
        const modelInfo = state.settings.modelProduk.find(m => m.id === item.modelProdukId) || {};
        const totalBiayaKain = (item.totalYard || 0) * (item.hargaKainPerYard || 0);
        const hargaJasaPerPcs = item.produksiType === 'penjahit' ? (item.hargaJahitPerPcs || 0) : (item.hargaMaklunPerPcs || 0);
        
        // [PERBAIKAN KUNCI DI SINI]
        // Biaya Jasa dan Biaya Alat sekarang HANYA dihitung berdasarkan 'aktualJadi'
        const totalBiayaJasa = (item.aktualJadi || 0) * hargaJasaPerPcs;
        const totalBiayaAlat = (item.aktualJadi || 0) > 0 ? (item.biayaAlat || 0) : 0;
        
        const totalBiayaProduksi = totalBiayaKain + totalBiayaJasa + totalBiayaAlat;
        
        return {
            ...item,
            modelNama: modelInfo.namaModel || 'N/A',
            totalBiayaKain,
            totalBiayaMaklun: totalBiayaJasa,
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
        return { totalModelSelesai: 0, totalBiaya: 0, avgHpp: 0, totalBatch: 0 };
    }

    // [PERBAIKAN] Hanya menghitung dari 'aktualJadi' sesuai permintaan
    const totalModelSelesai = tableData.reduce((sum, item) => sum + (item.aktualJadi || 0), 0);

    const totalBiaya = tableData.reduce((sum, item) => sum + item.totalBiayaProduksi, 0);
    const avgHpp = totalModelSelesai > 0 ? totalBiaya / totalModelSelesai : 0;
    const totalBatch = new Set(tableData.map(item => item.batchId)).size;

    return { totalModelSelesai, totalBiaya, avgHpp, totalBatch };
});
const analisisModelData = computed(() => {
    console.log("--- MEMULAI ANALISIS ---");

    const dataPerKain = state.produksi.flatMap(batch =>
        (batch.kainBahan || []).map(kain => ({
            ...kain,
            batchId: batch.id,
            tanggal: batch.tanggal,
            namaStatus: batch.namaStatus,
            produksiType: batch.produksiType,
            statusProses: batch.statusProses,
        }))
    );
    console.log("1. Total item produksi yang ditemukan:", dataPerKain.length, dataPerKain);
    console.log("2. Filter yang sedang aktif:", { 
        filterMode: uiState.analisisModelFilter,
        selectedModelId: uiState.analisisModelSelectedModel, 
        workerType: uiState.produksiFilterType,
        actualType: uiState.analisisModelSelectedType
    });

    let filteredData = dataPerKain.filter(item => {
        const matchesType = uiState.produksiFilterType === 'all' || item.produksiType === uiState.produksiFilterType;
        const matchesModel = uiState.analisisModelFilter === 'all' || (uiState.analisisModelFilter === 'model' && item.modelProdukId === uiState.analisisModelSelectedModel);
        return matchesType && matchesModel;
    });
    console.log("3. Data setelah difilter berdasarkan Model & Jenis Status:", filteredData.length, filteredData);

    const processedData = filteredData.map(item => {
        const modelInfo = state.settings.modelProduk.find(m => m.id === item.modelProdukId) || {};
        const totalBiayaKain = (item.totalYard || 0) * (item.hargaKainPerYard || 0);
        const yardStandar = modelInfo.yardPerModel || 1;
        const hargaJasaPerPcs = item.produksiType === 'penjahit' ? (item.hargaJahitPerPcs || 0) : (item.hargaMaklunPerPcs || 0);
        const targetQty = Math.floor((item.totalYard || 0) / yardStandar);
        let aktualFinal = 0;
        let totalBiayaJasa = 0;
        let totalBiayaAlat = 0;
        if (uiState.analisisModelSelectedType === 'aktualJadi' && item.aktualJadi > 0) {
            aktualFinal = (item.aktualJadi || 0);
            totalBiayaJasa = aktualFinal * hargaJasaPerPcs;
            totalBiayaAlat = (item.biayaAlat || 0);
        } else if (uiState.analisisModelSelectedType === 'aktualJadiKombinasi' && item.aktualJadiKombinasi > 0) {
            aktualFinal = (item.aktualJadiKombinasi || 0);
            totalBiayaJasa = 0;
            totalBiayaAlat = 0;
        }
        const selisih = aktualFinal - targetQty;
        const totalBiayaProduksi = totalBiayaKain + totalBiayaJasa + totalBiayaAlat;
        const hpp = totalBiayaProduksi / (aktualFinal || 1);
        return {
            ...item,
            modelNama: modelInfo.namaModel || 'N/A',
            targetQty: targetQty,
            aktualFinal: aktualFinal,
            selisih: selisih,
            hpp: hpp,
        };
    });
    console.log("4. Data setelah diproses (sebelum filter aktual > 0):", processedData.length, processedData);
    
    const finalData = processedData.filter(item => item.aktualFinal > 0);
    console.log("5. Data FINAL yang akan ditampilkan di tabel:", finalData.length, finalData);

    const sortedData = finalData.sort((a, b) => a.selisih - b.selisih);
    const limit = parseInt(uiState.analisisModelLimit, 10);
    const finalResult = limit > 0 ? sortedData.slice(0, limit) : sortedData;
    console.log("--- ANALISIS SELESAI ---");
    return finalResult;
});

const kpiExplanations = {
    'saldo-kas': { title: 'Saldo Kas Saat Ini', description: 'Estimasi total uang tunai yang tersedia dari hasil seluruh operasi bisnis, setelah dikurangi pengeluaran dan penarikan pribadi, dan ditambah modal masuk.' },
    'omset-kotor': { title: 'Omset Kotor', description: 'Total pendapatan dari penjualan produk sebelum dikurangi diskon, biaya transaksi, atau retur. Ini adalah total harga jual semua produk yang laku.' },
    'omset-bersih': { title: 'Omset Bersih', description: 'Total pendapatan dari penjualan setelah dikurangi diskon, voucher, dan nilai produk yang diretur. Ini adalah nilai bersih uang yang masuk dari penjualan.' },
    'diskon': { title: 'Diskon', description: 'Total nilai semua diskon dan voucher yang diberikan kepada pelanggan pada periode ini. Angka ini mengurangi omset kotor.' },
    'laba-kotor': { title: 'Laba Kotor', description: 'Keuntungan yang didapatkan dari penjualan setelah dikurangi harga pokok produksi (HPP) produk yang terjual. Angka ini belum termasuk biaya operasional.' },
    'hpp-terjual': { title: 'Total HPP Terjual', description: 'Total biaya modal dari semua produk yang berhasil terjual. Nilai ini menjadi komponen utama untuk menghitung Laba Kotor.' },
    'biaya-transaksi': { title: 'Biaya Transaksi Marketplace', description: 'Total biaya yang dikenakan oleh platform e-commerce untuk setiap transaksi, seperti biaya admin, komisi, dan biaya program promosi. Nilai ini juga disesuaikan dengan retur.' },
    'biaya-operasional': { title: 'Biaya Operasional', description: 'Total semua biaya rutin bisnis yang tidak terkait langsung dengan transaksi, seperti gaji, sewa, listrik, dan biaya pemasaran. Data diambil dari pencatatan di halaman Manajemen Keuangan.' },
    'laba-bersih-operasional': { title: 'Laba Bersih', description: 'Angka ini adalah indikator keuntungan final. Dihitung dari Laba Kotor dikurangi semua Biaya Operasional dan Biaya Transaksi Marketplace.' },
    'total-unit-stok': { title: 'Total Unit Stok', description: 'Jumlah total fisik semua produk yang tersedia di gudang Anda.' },
    'nilai-stok': { title: 'Total Nilai Stok (HPP)', description: 'Total nilai moneter dari semua stok yang tersisa di gudang, dihitung berdasarkan Harga Pokok Produksi (HPP) per unit.' },
    // BARIS BARU DITAMBAHKAN
    'nilai-retur': { title: 'Total Nilai Retur', description: 'Jumlah total moneter dari semua produk yang dikembalikan oleh pelanggan. Nilai ini mengurangi Omset Kotor dan secara otomatis disesuaikan dari laporan keuangan.' },
};


// --- METHODS ---
async function saveData() {
    if (!currentUser.value) return alert("Anda harus login untuk menyimpan data.");

    // Cek jika ada perubahan pada produk. Jika tidak, kita anggap ini adalah penyimpanan pengaturan global.
    const hasProductChanges = editedProducts.value.size > 0;

    isSaving.value = true;
    try {
        const userId = currentUser.value.uid;
        const batch = writeBatch(db);

        // Bagian 1: Simpan Pengaturan Global (Settings, Promotions, Commissions)
        // Ini akan selalu berjalan saat tombol simpan ditekan dari halaman pengaturan.
        const settingsRef = doc(db, "settings", userId);
        batch.set(settingsRef, {
            brandName: state.settings.brandName,
            minStok: state.settings.minStok,
            marketplaces: JSON.parse(JSON.stringify(state.settings.marketplaces)),
            modelProduk: JSON.parse(JSON.stringify(state.settings.modelProduk)),
            // ... (tambahkan field settings lain jika ada)
        }, { merge: true });

        const promotionsRef = doc(db, "promotions", userId);
        batch.set(promotionsRef, {
            perChannel: JSON.parse(JSON.stringify(state.promotions.perChannel)),
            perModel: JSON.parse(JSON.stringify(state.promotions.perModel)),
        }, { merge: true });

        // --- INI BAGIAN PENTING YANG HILANG ---
        // Selalu simpan data komisi jika yang login adalah admin
        if (isAdmin.value) {
            const commissionsRef = doc(db, "commissions", userId);
            batch.set(commissionsRef, {
                perModel: state.commissions.perModel || {},
                userId: userId
            }, { merge: true });
        }
        // --- AKHIR BAGIAN PENTING ---

        // Bagian 2: Simpan Perubahan Produk yang Spesifik (jika ada)
        if (hasProductChanges) {
            for (const productId of editedProducts.value) {
                const product = state.produk.find(p => p.docId === productId);
                if (!product) continue;

                const productRef = doc(db, "products", product.docId);
                batch.update(productRef, { hpp: product.hpp });

                for (const marketplaceId in product.hargaJual) {
                    const priceDocId = `${product.docId}-${marketplaceId}`;
                    const priceRef = doc(db, "product_prices", priceDocId);
                    batch.set(priceRef, {
                        product_id: product.docId,
                        product_sku: product.sku,
                        marketplace_id: marketplaceId,
                        price: product.hargaJual[marketplaceId] || 0,
                        userId: userId
                    }, { merge: true });
                }
            }
        }
        
        await batch.commit();
        
        // Kosongkan daftar produk yang diedit setelah berhasil disimpan
        editedProducts.value.clear();
        
        alert('Perubahan berhasil disimpan!');

    } catch (error) {
        console.error("Gagal menyimpan data ke Firebase:", error);
        alert("Gagal menyimpan data. Cek console untuk detail.");
    } finally {
        isSaving.value = false;
    }
}


function unlockPemasukan() {
    if (uiState.pemasukanPinInput === state.settings.dashboardPin) {
        uiState.isPemasukanLocked = false;
        uiState.pemasukanPinError = '';
    } else {
        uiState.pemasukanPinError = 'PIN salah. Silakan coba lagi.';
        uiState.pemasukanPinInput = '';
    }
}

function requestPinForToggle(feature) {
    if (!state.settings.dashboardPin) {
        alert('Anda harus mengatur PIN utama terlebih dahulu di bagian "Ubah PIN Dasbor".');
        return;
    }
    uiState.pinActionToConfirm = feature; // Simpan fitur yg akan diubah (misal: 'dashboard')
    uiState.isPinConfirmModalVisible = true; // Tampilkan modal
}

async function confirmPinAndToggle() {
    if (uiState.pinConfirmInput !== state.settings.dashboardPin) {
        uiState.pinConfirmError = 'PIN yang Anda masukkan salah.';
        return;
    }

    const feature = uiState.pinActionToConfirm;
    if (feature && Object.prototype.hasOwnProperty.call(state.settings.pinProtection, feature)) {
        // Balikkan nilainya (dari true ke false, atau false ke true)
        state.settings.pinProtection[feature] = !state.settings.pinProtection[feature];
        
        // Simpan perubahan ke database
        await saveGeneralSettings(); 
        
        // Tutup modal dan reset
        uiState.isPinConfirmModalVisible = false;
        uiState.pinConfirmInput = '';
        uiState.pinConfirmError = '';
        uiState.pinActionToConfirm = null;
    }
}

async function submitBankAccount() {
    const form = uiState.modalData;
    if (!form.bankName || !form.accountNumber || !form.accountName) {
        return alert("Semua kolom wajib diisi.");
    }
    const dataToSave = { ...form, userId: currentUser.value.uid };

    try {
        const docRef = doc(db, "bank_accounts", dataToSave.id || `BANK-${Date.now()}`);
        await setDoc(docRef, dataToSave, { merge: true });

        // Update state lokal
        const index = state.bankAccounts.findIndex(b => b.id === docRef.id);
        if (index > -1) {
            state.bankAccounts[index] = { ...dataToSave, id: docRef.id };
        } else {
            state.bankAccounts.unshift({ ...dataToSave, id: docRef.id });
        }
        hideModal();
        alert("Rekening bank berhasil disimpan!");
    } catch (error) {
        console.error("Error saving bank account:", error);
        alert("Gagal menyimpan rekening bank.");
    }
}

// FUNGSI UNTUK MENGHAPUS REKENING BANK
async function deleteBankAccount(accountId) {
    if (!confirm("Anda yakin ingin menghapus rekening ini?")) return;
    try {
        await deleteDoc(doc(db, "bank_accounts", accountId));
        state.bankAccounts = state.bankAccounts.filter(b => b.id !== accountId);
        alert("Rekening bank berhasil dihapus.");
    } catch (error) {
        console.error("Error deleting bank account:", error);
        alert("Gagal menghapus rekening bank.");
    }
}

async function saveGeneralSettings() {
    if (!currentUser.value) return alert("Anda harus login untuk menyimpan pengaturan.");
    
    isSavingSettings.value = true;
    uiState.pinError = '';

    let newPinToSave = state.settings.dashboardPin;

    if (uiState.newPin) { 
        if (state.settings.dashboardPin && uiState.oldPin !== state.settings.dashboardPin) {
            uiState.pinError = 'PIN lama salah.';
            isSavingSettings.value = false;
            return;
        }
        if (uiState.newPin !== uiState.confirmNewPin) {
            uiState.pinError = 'PIN baru dan konfirmasi tidak cocok.';
            isSavingSettings.value = false;
            return;
        }
        if (uiState.newPin.length < 4 || uiState.newPin.length > 6) {
            uiState.pinError = 'PIN harus 4-6 karakter.';
            isSavingSettings.value = false;
            return;
        }
        newPinToSave = uiState.newPin;
    }

    try {
        const userId = currentUser.value.uid;
        const settingsRef = doc(db, "settings", userId);
        
        const dataToUpdate = {
            brandName: state.settings.brandName,
            minStok: state.settings.minStok,
            pinProtection: state.settings.pinProtection,
            // Menggunakan operator kondisional untuk memastikan nilai PIN tidak undefined
            // Jika newPinToSave ada, gunakan itu. Jika tidak, jangan masukkan field-nya.
            ...(newPinToSave !== undefined && { dashboardPin: newPinToSave }),
        };

        // Menggunakan setDoc dengan merge: true adalah cara teraman untuk partial update.
        // Ini akan menyimpan dataToUpdate sambil tetap mempertahankan field lain (misal: marketplaces, modelProduk)
        await setDoc(settingsRef, dataToUpdate, { merge: true });
        
        // Perbarui state lokal setelah berhasil
        state.settings.dashboardPin = newPinToSave;
        uiState.oldPin = '';
        uiState.newPin = '';
        uiState.confirmNewPin = '';
        
        alert('Pengaturan umum berhasil disimpan ke database!');

    } catch (error) {
        console.error("Gagal menyimpan pengaturan umum:", error);
        alert("Gagal menyimpan pengaturan umum. Silakan coba lagi.");
    } finally {
        isSavingSettings.value = false;
    }
}

async function confirmCashoutPayment(withdrawalId) {
    if (!confirm(`Anda yakin ingin mengonfirmasi pembayaran untuk ID: ${withdrawalId}?`)) return;

    uiState.isVerifying = true;
    uiState.adminVerificationError = '';
    try {
        const idToken = await auth.currentUser.getIdToken(true);
        const response = await fetch('/api/confirm-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify({ withdrawalId: withdrawalId })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);

        alert('Pembayaran berhasil dikonfirmasi! Status di halaman mitra akan terupdate.');
        uiState.adminVerificationResult = null;
        uiState.adminVerificationIdInput = '';

    } catch (error) {
        uiState.adminVerificationError = `Gagal konfirmasi: ${error.message}`;
    } finally {
        uiState.isVerifying = false;
    }
}

function generateBagiHasilReport() {
    const { selectedInvestorId, month, year } = uiState.laporanBagiHasil;
    
    if (!selectedInvestorId) {
        return alert("Silakan pilih investor terlebih dahulu.");
    }
    const investor = state.investor.find(inv => inv.id === selectedInvestorId);
    if (!investor) {
        return alert("Data investor tidak ditemukan.");
    }

    const filteredTransaksi = filterDataByDate(
        state.transaksi, 'by_month_range', null, null, month, year, month, year
    );
    const filteredKeuangan = filterDataByDate(
        state.keuangan, 'by_month_range', null, null, month, year, month, year
    );
    const filteredRetur = filterDataByDate(
        state.retur, 'by_month_range', null, null, month, year, month, year
    );

    const omsetKotorPenjualan = filteredTransaksi.reduce((sum, trx) => sum + (trx.subtotal || 0), 0);
    const diskonPenjualan = filteredTransaksi.reduce((sum, trx) => sum + (trx.diskon?.totalDiscount || 0), 0);
    const hppTerjualPenjualan = filteredTransaksi.reduce((sum, trx) => sum + (trx.items || []).reduce((itemSum, item) => itemSum + (item.hpp || 0) * (item.qty || 0), 0), 0);
    const biayaTransaksiPenjualan = filteredTransaksi.reduce((sum, trx) => sum + (trx.biaya?.total || 0), 0);

    let omsetBersihDariRetur = 0;
    let totalHppRetur = 0;
    let totalBiayaMarketplaceBatal = 0;

    filteredRetur.forEach(returDoc => {
        (returDoc.items || []).forEach(item => {
            omsetBersihDariRetur += (item.nilaiRetur || 0);
            totalBiayaMarketplaceBatal += (item.biayaMarketplace || 0);
            const product = getProductBySku(item.sku);
            if (product) {
                totalHppRetur += (product.hpp || 0) * item.qty;
            }
        });
    });

    const omsetBersihPenjualanFinal = omsetKotorPenjualan - diskonPenjualan;
    const omsetBersihFinal = omsetBersihPenjualanFinal - omsetBersihDariRetur;
    const hppTerjualFinal = hppTerjualPenjualan - totalHppRetur;
    const finalBiayaTransaksi = biayaTransaksiPenjualan - totalBiayaMarketplaceBatal;
    
    const labaKotor = omsetBersihFinal - hppTerjualFinal;

    // --- BARIS INI DIPERBARUI ---
    // Filter pengeluaran dan kecualikan catatan yang mengandung kata "Bagi hasil"
    const totalBiayaOperasional = filteredKeuangan
        .filter(i => 
            i.jenis === 'pengeluaran' && 
            !(i.catatan && i.catatan.toLowerCase().includes('bagi hasil'))
        )
        .reduce((sum, i) => sum + i.jumlah, 0);
    // --- AKHIR PERUBAIAN ---

    const labaBersih = labaKotor - totalBiayaOperasional - finalBiayaTransaksi;

    let investorShare = 0;
    let companyShare = 0;
    if (labaBersih > 0) {
        investorShare = labaBersih * (investor.profitShare / 100);
        companyShare = labaBersih - investorShare;
    }

    uiState.laporanBagiHasil.result = {
        investorName: investor.name,
        profitSharePercentage: investor.profitShare,
        period: `${new Date(0, month - 1).toLocaleString('id-ID', { month: 'long' })} ${year}`,
        omsetBersihPenjualan: omsetBersihPenjualanFinal,
        omsetBersihDariRetur,
        omsetBersihFinal,
        totalHppTerjual: hppTerjualPenjualan,
        totalHppRetur,
        hppTerjualFinal,
        labaKotor,
        biayaMarketplacePenjualan: biayaTransaksiPenjualan,
        biayaMarketplaceBatal: totalBiayaMarketplaceBatal,
        totalBiayaTransaksi: finalBiayaTransaksi,
        totalBiayaOperasional,
        labaBersih,
        investorShare,
        companyShare
    };
}

function changePage(pageName) {
    activePage.value = pageName;

    // Logika Kunci untuk Halaman Dashboard
    if (pageName === 'dashboard') {
        // Dasbor terkunci HANYA jika PIN ada DAN toggle-nya ON
        if (state.settings.dashboardPin && state.settings.pinProtection?.dashboard) {
            isDashboardLocked.value = true;
            dashboardPinInput.value = '';
            dashboardPinError.value = '';
        } else {
            isDashboardLocked.value = false;
        }
    } else {
        // Untuk halaman lain, pastikan lock screen dasbor tidak aktif
        isDashboardLocked.value = false;
    }

    // Logika Kunci untuk Halaman Keuangan (Riwayat Pemasukan)
    if (pageName === 'keuangan') {
        // Pemasukan terkunci HANYA jika PIN ada DAN toggle-nya ON
        if (state.settings.dashboardPin && state.settings.pinProtection?.incomeHistory) {
            uiState.isPemasukanLocked = true;
            uiState.pemasukanPinInput = '';
            uiState.pemasukanPinError = '';
        } else {
            uiState.isPemasukanLocked = false;
        }
    }

    // Logika Kunci untuk Halaman Investasi
    if (pageName === 'investasi') {
        // Investasi terkunci HANYA jika PIN ada DAN toggle-nya ON
        if (state.settings.dashboardPin && state.settings.pinProtection?.investmentPage) {
            uiState.isInvestasiLocked = true;
            uiState.investasiPinInput = '';
            uiState.investasiPinError = '';
        } else {
            uiState.isInvestasiLocked = false;
        }
    }
}
function unlockDashboard() {
  // Cek PIN yang dimasukkan dengan PIN yang sudah ada di state
  if (dashboardPinInput.value === state.settings.dashboardPin) {
    isDashboardLocked.value = false;
    dashboardPinError.value = '';
    // Simpan status terkunci ke localStorage (opsional, tapi disarankan)
    localStorage.setItem('isDashboardUnlocked', 'true');
  } else {
    dashboardPinError.value = 'PIN salah. Silakan coba lagi.';
  }
}

function unlockInvestasi() {
    if (uiState.investasiPinInput === state.settings.dashboardPin) {
        uiState.isInvestasiLocked = false;
        uiState.investasiPinError = '';
    } else {
        uiState.investasiPinError = 'PIN salah. Silakan coba lagi.';
        uiState.investasiPinInput = '';
    }
}



function showModal(type, data = {}) {
    // Reset data modal untuk memastikan tidak ada data lama yang bocor
    uiState.modalData = {};

    // Menggunakan nextTick untuk memastikan UI merespons reset sebelum data baru diisi
    nextTick(() => {
        uiState.modalType = type;
        uiState.isModalVisible = true; // Selalu set ke true untuk menampilkan container modal

        // Salin data dengan aman untuk menghindari referensi langsung
        if (data) {
             uiState.modalData = JSON.parse(JSON.stringify(data));
        }

        // Logika khusus untuk modal tertentu
        if (type === 'editMarketplace' && data) {
            if (!uiState.modalData.programs) {
                uiState.modalData.programs = [];
            }
        } else if (type === 'addProduksi') {
            if (!state.settings.modelProduk || state.settings.modelProduk.length === 0) {
                alert("Data 'Model Produk' belum dibuat. silahkan kehalaman pengaturan untuk menambahkan model produk.");
                hideModal(); // Langsung tutup lagi jika syarat tidak terpenuhi
                return;
            }
            setupNewProduksiBatch();
        } else if (type === 'editProduksi' && data) {
            setupEditProduksiBatch(data);
        } else if (type === 'editRetur' && data) {
            // Pastikan tanggal diformat dengan benar untuk input type="date"
            uiState.modalData.tanggal = new Date(data.tanggal).toISOString().split('T')[0];
        }
    });
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
        "Model Produk": item.modelNama,
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

function hideModal() {
    uiState.isModalVisible = false;
    uiState.modalType = '';
    uiState.modalData = {};
}

// TAMBAHKAN FUNGSI BARU INI
function hideKeuanganInfoModal() {
    uiState.isKeuanganInfoVisible = false;
}

function exportPurchaseOrdersToExcel() {
    const dataToExport = filteredPurchaseOrders.value.map(order => ({
        "ID Pesanan": order.id,
        "Tanggal": new Date(order.tanggal),
        "Nama Supplier": order.supplierName,
        "Total Nilai": order.totalQtyValue,
        "Status Proses": order.statusProses,
        "Status Pembayaran": order.statusPembayaran,
        "Jumlah Dibayarkan": order.dibayarkan || 0,
        "Sisa Pembayaran": order.totalQtyValue - (order.dibayarkan || 0)
    }));

    if (dataToExport.length === 0) {
        alert("Tidak ada data untuk diekspor.");
        return;
    }

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Riwayat Penerimaan Barang");
    worksheet["!cols"] = Array(8).fill({ wch: 20 });
    XLSX.writeFile(workbook, `Riwayat_Penerimaan_Barang_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function addProductToCart(product, qty = 1) {
    if (!uiState.activeCartChannel) { alert("Pilih channel penjualan."); return; }
    const cart = state.carts[uiState.activeCartChannel];
    const existingItem = cart.find(item => item.sku === product.sku);

    const specialPrice = state.specialPrices[uiState.activeCartChannel]?.[product.sku];
    const regularPrice = product.hargaJual?.[uiState.activeCartChannel] ?? Object.values(product.hargaJual)[0] ?? 0;
    const finalPrice = specialPrice !== undefined ? specialPrice : regularPrice;

    // --- [PERBAIKAN KUNCI DI SINI] ---
    // Mengambil komisi berdasarkan NAMA MODEL produk dari state global, bukan dari produk itu sendiri.
    const commissionRate = state.commissions.perModel[product.nama]?.[uiState.activeCartChannel] || 0;

    if (existingItem) {
        existingItem.qty += qty;
        existingItem.hargaJualAktual = finalPrice;
        existingItem.commissionRate = commissionRate; // Update komisi juga
    } else {
        // Saat menambahkan produk baru, sertakan commissionRate yang benar
        cart.push({ ...product, qty, hargaJualAktual: finalPrice, commissionRate: commissionRate });
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
function confirmCompleteTransaction() {
    if (!uiState.pos_order_id) {
        return alert("Harap scan resi atau masukkan ID Pesanan Marketplace terlebih dahulu.");
    }
    const marketplace = getMarketplaceById(uiState.activeCartChannel);
    if (!marketplace) {
        alert("Silakan pilih channel penjualan terlebih dahulu.");
        return;
    }
    showModal('confirmTransaction', { 
        channelName: marketplace.name, 
        orderId: uiState.pos_order_id, // Kirim orderId ke modal
        ...cartSummary.value 
    });
}
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
    if (!uiState.pos_order_id) {
        hideModal();
        alert("Gagal: ID Pesanan Marketplace belum di-scan. Silakan scan resi terlebih dahulu.");
        return;
    }

    const biayaList = [];
let totalBiaya = 0;

// --- [Langkah 1: Hitung Komisi Produk (Biaya Bisnis)] ---
let totalKomisiProduk = 0;

for (const item of activeCart.value) {
    const modelId = item.model_id; 
    const modelName = (state.settings.modelProduk.find(m => m.id === modelId)?.namaModel || item.nama).split(' ')[0];
    const commissionRate = state.commissions.perModel[modelName]?.[uiState.activeCartChannel] || 0;

    if (commissionRate > 0) {
        totalKomisiProduk += (commissionRate / 100) * (item.hargaJualAktual * item.qty);
    }
}

// Tambahkan Komisi ke Biaya Marketplace di Awal
if (totalKomisiProduk > 0) {
    biayaList.push({ name: 'Komisi Produk', value: totalKomisiProduk });
    totalBiaya += totalKomisiProduk;
}
    // --- [AKHIR PERUBAIAN] ---

    // Biaya Marketplace lainnya (baris 'marketplace.komisi' sudah dihapus)
    if (marketplace.adm > 0) { const val = (marketplace.adm / 100) * summary.finalTotal; biayaList.push({ name: 'Administrasi', value: val }); totalBiaya += val; }
    if (marketplace.perPesanan > 0) { const val = marketplace.perPesanan; biayaList.push({ name: 'Per Pesanan', value: val }); totalBiaya += val; }
    if (marketplace.layanan > 0) { const val = (marketplace.layanan / 100) * summary.finalTotal; biayaList.push({ name: 'Layanan Gratis Ongkir Xtra', value: val }); totalBiaya += val; }
    if (marketplace.programs && marketplace.programs.length > 0) { marketplace.programs.forEach(p => { if (p.rate > 0) { const val = (p.rate / 100) * summary.finalTotal; biayaList.push({ name: p.name, value: val }); totalBiaya += val; } }); }
    
    const newTransactionData = {
        marketplaceOrderId: uiState.pos_order_id,
        tanggal: new Date(),
        items: activeCart.value.map(i => ({ sku: i.sku, qty: i.qty, hargaJual: i.hargaJualAktual, hpp: i.hpp })),
        subtotal: summary.subtotal,
        diskon: summary.discount,
        total: summary.finalTotal,
        channel: marketplace.name,
        channelId: marketplace.id,
        biaya: { rincian: biayaList, total: totalBiaya },
        userId: currentUser.value.uid
    };

    try {
        const batch = writeBatch(db);
        const transactionRef = doc(collection(db, "transactions"));
        batch.set(transactionRef, newTransactionData);

        for (const item of activeCart.value) {
            const productRef = doc(db, "products", item.docId);
            const newStock = (item.stokFisik || 0) - item.qty;
            
            if (newStock < 0) {
                throw new Error(`Stok untuk produk ${item.nama} (${item.sku}) tidak mencukupi!`);
            }
            batch.update(productRef, { physical_stock: newStock });
        }

        await batch.commit();

        const finalTransactionForUI = { ...newTransactionData, id: transactionRef.id, tanggal: newTransactionData.tanggal.toISOString().split('T')[0] };
        state.transaksi.unshift(finalTransactionForUI);
        
        activeCart.value.forEach(item => {
            const productInState = state.produk.find(p => p.docId === item.docId);
            if (productInState) {
                productInState.stokFisik -= item.qty;
            }
        });
        
        state.carts[uiState.activeCartChannel] = [];
        uiState.pos_order_id = '';
        hideModal();
        alert("Transaksi berhasil disimpan ke Database!");

    } catch (error) {
        console.error("Error saat menyimpan transaksi:", error);
        alert(`Gagal menyimpan transaksi: ${error.message}`);
    }
}

function calculateBestDiscount(cart, channelId) {
    if (!cart || cart.length === 0) {
        return { totalDiscount: 0, description: 'Tidak ada diskon yang berlaku', rate: 0 };
    }

    const eligiblePromotions = [];
    const totalCartSubtotal = cart.reduce((sum, item) => sum + (item.hargaJualAktual * item.qty), 0);

    // 1. Kumpulkan promosi per channel
    const channelPromos = state.promotions.perChannel[channelId] || {};
    const voucherToko = channelPromos.voucherToko;
    if (voucherToko && totalCartSubtotal >= (voucherToko.minBelanja || 0)) {
        let discountValue = 0;
        let discountDesc = '';
        if (voucherToko.diskonNominal > 0) {
            discountValue = voucherToko.diskonNominal;
            discountDesc = `Voucher Ikuti Toko (${formatCurrency(discountValue)})`;
        } else if (voucherToko.diskonRate > 0) {
            discountValue = (voucherToko.diskonRate / 100) * totalCartSubtotal;
            discountDesc = `Voucher Ikuti Toko (${voucherToko.diskonRate}%)`;
        }
        if (discountValue > 0) {
            eligiblePromotions.push({ totalDiscount: discountValue, description: discountDesc, rate: voucherToko.diskonRate || 0 });
        }
    }

    const voucherSemuaProduk = channelPromos.voucherSemuaProduk;
    if (voucherSemuaProduk && totalCartSubtotal >= (voucherSemuaProduk.minBelanja || 0)) {
        let discountValue = 0;
        let discountDesc = '';
        if (voucherSemuaProduk.diskonNominal > 0) {
            discountValue = voucherSemuaProduk.diskonNominal;
            discountDesc = `Voucher Semua Produk (${formatCurrency(discountValue)})`;
        } else if (voucherSemuaProduk.diskonRate > 0) {
            discountValue = (voucherSemuaProduk.diskonRate / 100) * totalCartSubtotal;
            discountDesc = `Voucher Semua Produk (${voucherSemuaProduk.diskonRate}%)`;
        }
        if (discountValue > 0) {
            eligiblePromotions.push({ totalDiscount: discountValue, description: discountDesc, rate: voucherSemuaProduk.diskonRate || 0 });
        }
    }

    // 2. Kumpulkan promosi per model produk
    const allModelPromos = state.promotions.perModel || {};
    const itemsByModel = cart.reduce((acc, item) => {
        const modelInfo = state.settings.modelProduk.find(m => m.id === item.model_id);
        const modelName = modelInfo ? modelInfo.namaModel.split(' ')[0] : (item.nama || '').split(' ')[0];
        if (!acc[modelName]) {
            acc[modelName] = { subtotal: 0, qty: 0 };
        }
        acc[modelName].subtotal += item.hargaJualAktual * item.qty;
        acc[modelName].qty += item.qty;
        return acc;
    }, {});

    for (const modelName in itemsByModel) {
        const modelData = itemsByModel[modelName];
        const modelPromosForChannel = (allModelPromos[modelName] || {})[channelId] || {};
        
        // Cek Voucher Produk Tertentu
        if (modelPromosForChannel.minBelanja > 0 && modelData.subtotal >= modelPromosForChannel.minBelanja) {
            let discountValue = 0;
            let discountDesc = '';
            if (modelPromosForChannel.diskonNominal > 0) {
                discountValue = modelPromosForChannel.diskonNominal;
                discountDesc = `Voucher ${modelName} (${formatCurrency(discountValue)})`;
            } else if (modelPromosForChannel.diskonRate > 0) {
                discountValue = (modelPromosForChannel.diskonRate / 100) * modelData.subtotal;
                discountDesc = `Voucher ${modelName} (${modelPromosForChannel.diskonRate}%)`;
            }
            if (discountValue > 0) {
                eligiblePromotions.push({ totalDiscount: discountValue, description: discountDesc, rate: modelPromosForChannel.diskonRate || 0 });
            }
        }
        
        // Cek Diskon Bertingkat
        if (modelPromosForChannel.diskonBertingkat && modelPromosForChannel.diskonBertingkat.length > 0) {
            const sortedTiers = [...modelPromosForChannel.diskonBertingkat].sort((a, b) => (b.diskon || b.diskonNominal) - (a.diskon || a.diskonNominal));
            for (const tier of sortedTiers) {
                if (modelData.subtotal >= tier.min) {
                    let discountValue = 0;
                    let discountDesc = '';
                     if (tier.diskonNominal > 0) {
                        discountValue = tier.diskonNominal;
                        discountDesc = `Diskon Bertingkat ${modelName} (${formatCurrency(discountValue)})`;
                    } else if (tier.diskon > 0) {
                        discountValue = (tier.diskon / 100) * modelData.subtotal;
                        discountDesc = `Diskon Bertingkat ${modelName} (${tier.diskon}%)`;
                    }
                    if (discountValue > 0) {
                       eligiblePromotions.push({ totalDiscount: discountValue, description: discountDesc, rate: tier.diskon || 0 });
                    }
                }
            }
        }
    }

    // 3. Cari promosi terbaik dari semua yang terkumpul
    if (eligiblePromotions.length === 0) {
        return { totalDiscount: 0, description: 'Tidak ada diskon yang berlaku', rate: 0 };
    }
    
    // Cari promo dengan nilai diskon rupiah paling besar
    return eligiblePromotions.reduce((best, current) => {
        return current.totalDiscount > best.totalDiscount ? current : best;
    });
}

function calculateSellingPrice() {
    const { hpp, targetMargin, selectedMarketplace, selectedModelName } = uiState.priceCalculator;

    // TAMBAHKAN 1 BARIS INI untuk mengambil nama model dasar
    const baseModelName = selectedModelName ? selectedModelName.split(' ')[0] : null;

    // PERBARUI VALIDASI ini untuk menggunakan baseModelName
    if (!hpp || !selectedMarketplace || !baseModelName) {
        uiState.priceCalculator.result = null;
        return;
    }

    const mp = state.settings.marketplaces.find(m => m.id === selectedMarketplace);
    if (!mp) {
        uiState.priceCalculator.result = null;
        return;
    }

    // PERBARUI BARIS INI untuk menggunakan baseModelName
    const commissionRate = (state.commissions.perModel[baseModelName]?.[selectedMarketplace] || 0) / 100;

    const dummyProduct = {
        sku: 'calc-dummy',
        nama: baseModelName, // PERBARUI BARIS INI untuk menggunakan baseModelName
        hargaJualAktual: hpp * 2,
        qty: 1
    };
    const discountInfo = calculateBestDiscount([dummyProduct], selectedMarketplace);
    const bestDiscountRate = (discountInfo.rate || 0) / 100;

    const totalMarketplacePercentageFees = (mp.adm || 0) + (mp.layanan || 0);
    const perOrderFee = mp.perPesanan || 0;
    const targetProfitPercentage = (targetMargin || 0) / 100;

    const itemizedProgramFeesBase = (mp.programs || []).map(p => (parseFloat(p.rate) || 0) / 100);
    const totalProgramPercentage = itemizedProgramFeesBase.reduce((sum, rate) => sum + rate, 0);

    const allPercentageFees = (totalMarketplacePercentageFees / 100) + targetProfitPercentage + bestDiscountRate + totalProgramPercentage + commissionRate;
    
    const calculatedPrice = (hpp + perOrderFee) / (1 - allPercentageFees);

    const adminFee = calculatedPrice * (mp.adm || 0) / 100;
    const commission = calculatedPrice * commissionRate;
    const serviceFee = calculatedPrice * (mp.layanan || 0) / 100;
    const bestDiscount = calculatedPrice * bestDiscountRate;

    const itemizedProgramFees = (mp.programs || []).map(program => {
        const rate = parseFloat(program.rate) || 0;
        return { name: program.name, rate: rate, fee: calculatedPrice * (rate / 100) };
    });
    const totalProgramFeeValue = itemizedProgramFees.reduce((sum, item) => sum + item.fee, 0);

    const totalFees = adminFee + commission + serviceFee + totalProgramFeeValue + perOrderFee;
    const netProfit = calculatedPrice - hpp - bestDiscount - totalFees;
    const totalSemuaBiaya = hpp + bestDiscount + totalFees;
    const labaKotor = calculatedPrice - bestDiscount - hpp;

    uiState.priceCalculator.result = {
        calculatedPrice,
        totalFees,
        netProfit,
        bestDiscount,
        totalSemuaBiaya,
        labaKotor,
        bestDiscountRatePercentage: discountInfo.rate || 0,
        breakdown: {
            hpp,
            adminFee,
            admRate: mp.adm || 0,
            commission,
            komisiRate: commissionRate * 100,
            serviceFee,
            layananRate: mp.layanan || 0,
            programFee: itemizedProgramFees,
            perOrderFee
        }
    };
}

async function saveCommissionSettings() {
    if (!currentUser.value) {
        return alert("Aksi tidak diizinkan.");
    }

    isSaving.value = true;
    try {
        const userId = currentUser.value.uid;
        const commissionsRef = doc(db, "product_commissions", userId)
        
        // Langsung simpan state komisi saat ini ke database
        await setDoc(commissionsRef, {
            perModel: JSON.parse(JSON.stringify(state.commissions.perModel)) || {},
            userId: userId
        }, { merge: true });

        alert('Pengaturan komisi berhasil disimpan!');
        uiState.activeAccordion = null; // Menutup panel setelah simpan

    } catch (error) {
        console.error("Gagal menyimpan pengaturan komisi:", error);
        alert("Gagal menyimpan pengaturan komisi.");
    } finally {
        isSaving.value = false;
    }
}

async function recordBagiHasilPayment() {
    const report = uiState.laporanBagiHasil;
    const result = report.result;
    if (!result || result.investorShare <= 0) return alert("Tidak ada keuntungan.");

    // --- AWAL PERBAIKAN: Mengambilll data dari state yang benar ---
    const paymentMethod = report.paymentMethod; 
    const adminFee = paymentMethod === 'transfer' ? (report.adminFee || 0) : 0;
    const totalPengeluaran = result.investorShare + adminFee;
    let catatan = `Bagi hasil ${result.investorName} (${result.period}). Metode: ${paymentMethod}.`;
    
    if (paymentMethod === 'transfer') {
        if (!report.selectedBankAccountId) return alert("Pilih rekening tujuan transfer.");
        const bank = state.bankAccounts.find(b => b.id === report.selectedBankAccountId);
        catatan += ` Ke: ${bank.bankName} ${bank.accountNumber} a.n ${bank.accountName}.`;
        if (adminFee > 0) catatan += ` Biaya Admin: ${formatCurrency(adminFee)}.`;
    }
    // --- AKHIR PERBAIKAN ---

    if (!confirm(`Anda akan mencatat pengeluaran total sebesar ${formatCurrency(totalPengeluaran)}. Lanjutkan?`)) return;

    try {
        const batch = writeBatch(db);

        // 1. Catat di 'keuangan' (Pengeluaran umum)
        const keuanganData = {
            kategori: 'Bagi Hasil Investor',
            jumlah: totalPengeluaran,
            catatan: catatan,
            jenis: 'pengeluaran',
            userId: currentUser.value.uid,
            tanggal: new Date()
        };
        const keuanganRef = doc(collection(db, "keuangan"));
        batch.set(keuanganRef, keuanganData);

        // 2. Catat di 'investor_payments' (Riwayat khusus investor)
        const paymentData = {
            investorId: report.selectedInvestorId,
            investorName: result.investorName,
            period: result.period,
            labaBersihPeriode: result.labaBersih,
            profitSharePercentage: result.profitSharePercentage,
            investorShare: result.investorShare,
            companyShare: result.companyShare,
            paymentMethod: paymentMethod,
            adminFee: adminFee,
            totalPayment: totalPengeluaran,
            bankDetails: paymentMethod === 'transfer' ? state.bankAccounts.find(b => b.id === report.selectedBankAccountId) : null,
            paymentDate: new Date(),
            userId: currentUser.value.uid,
            omsetBersihPenjualan: result.omsetBersihPenjualan,
            omsetBersihDariRetur: result.omsetBersihDariRetur,
            omsetBersihFinal: result.omsetBersihFinal,
            totalHppTerjual: result.totalHppTerjual,
            totalHppRetur: result.totalHppRetur,
            hppTerjualFinal: result.hppTerjualFinal,
            labaKotor: result.labaKotor,
            biayaMarketplacePenjualan: result.biayaMarketplacePenjualan,
            biayaMarketplaceBatal: result.biayaMarketplaceBatal,
            totalBiayaTransaksi: result.totalBiayaTransaksi,
            totalBiayaOperasional: result.totalBiayaOperasional
        };
        const paymentRef = doc(collection(db, "investor_payments"));
        batch.set(paymentRef, paymentData);

        await batch.commit();

        // Update state lokal
        state.keuangan.push({ id: keuanganRef.id, ...keuanganData });
        state.investorPayments.push({ id: paymentRef.id, ...paymentData });

        alert('Pembayaran bagi hasil berhasil dicatat!');
        report.result = null; // Reset laporan
    } catch (error) {
        console.error("Gagal mencatat pembayaran:", error);
        alert("Gagal mencatat pembayaran.");
    }
}

function renderCharts() {
    if (profitExpenseChart) profitExpenseChart.destroy();
    if (salesChannelChart) salesChannelChart.destroy();
    
    // Gunakan nilai default array kosong untuk mencegah error
    const { transaksi = [], keuangan = [] } = dashboardFilteredData.value || {};
    const ctxProfit = document.getElementById('profitExpenseChart')?.getContext('2d');
    const ctxSales = document.getElementById('salesChannelChart')?.getContext('2d');
    
    if (!ctxProfit || !ctxSales) {
        return;
    }
    
    // --- GRAFIK 1: LABA KOTOR VS BIAYA OPERASIONAL ---
    const dates = [...new Set([
        ...transaksi.map(t => new Date(t.tanggal).toDateString()), 
        ...keuangan.map(b => new Date(b.tanggal).toDateString())
    ])].sort((a,b) => new Date(a) - new Date(b));

    const profitData = dates.map(d => transaksi.filter(t => new Date(t.tanggal).toDateString() === d).reduce((s, t) => s + (t.total - t.items.reduce((ts, i) => ts + (i.hpp || 0) * (i.qty || 0), 0)), 0));
    const expenseData = dates.map(d => keuangan.filter(b => new Date(b.tanggal).toDateString() === d && b.jenis === 'pengeluaran').reduce((s, b) => s + (b.jumlah || 0), 0));
    
    profitExpenseChart = new Chart(ctxProfit, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{ 
                label: 'Laba Kotor', 
                data: profitData, 
                borderColor: '#10b981', 
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                fill: true 
            }, { 
                label: 'Biaya Operasional', 
                data: expenseData, 
                borderColor: '#ef4444', 
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                fill: true 
            }] 
        }, 
        options: { responsive: true, maintainAspectRatio: false } 
    });
    
    // --- GRAFIK 2: PENJUALAN PER CHANNEL ---
    const salesByChannel = transaksi.reduce((acc, trx) => {
        acc[trx.channel] = (acc[trx.channel] || 0) + (trx.total || 0);
        return acc;
    }, {});
    
    salesChannelChart = new Chart(ctxSales, {
        type: 'doughnut',
        data: { 
            labels: Object.keys(salesByChannel), 
            datasets: [{ 
                data: Object.values(salesByChannel), 
                backgroundColor: ['#4f46e5', '#3b82f6', '#10b981', '#f97316', '#ef4444'] 
            }] 
        }, 
        options: { responsive: true, maintainAspectRatio: false } 
    });
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

// Logika untuk menghapus tingkatan diskon
function removePromotionTier(modelName, channelId, tierIndex) {
    if (state.promotions.perModel[modelName]?.[channelId]?.diskonBertingkat) {
        state.promotions.perModel[modelName][channelId].diskonBertingkat.splice(tierIndex, 1);
    }
}

function setupNewProduksiBatch() {
    uiState.newProduksiBatch = reactive({
        tanggal: new Date().toISOString().split('T')[0],
        produksiType: 'pemaklun',
        namaStatus: '',
        statusProses: 'Dalam Proses',
        kainBahan: [{
            idUnik: generateUniqueCode(),
            modelProdukId: '',
            sku: '', // Untuk produk terdaftar (aktual jadi)
            skuKombinasi: '', // <-- FIELD BARU DITAMBAHKAN
            namaKain: '',
            tokoKain: '',
            warnaKain: '',
            ukuran: '',
            totalYard: null,
            hargaKainPerYard: null,
            yardPerModel: null,
            aktualJadi: null,
            hargaMaklunPerPcs: null,
            hargaJahitPerPcs: null,
            biayaAlat: null,
            aktualJadiKombinasi: null,
            isInventoried: false,
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
    
    if (!newBatchData.namaStatus) { // <-- Menggunakan namaStatus untuk validasi
        return alert("Nama Pemaklun/Penjahit wajib diisi.");
    }
    
    let totalQty = 0;
    let totalBiayaMaterial = 0;
    let totalHargaJasa = 0;

    (newBatchData.kainBahan || []).forEach(item => {
        totalBiayaMaterial += (item.totalYard || 0) * (item.hargaKainPerYard || 0);
        totalQty += (item.aktualJadi || 0);
        
        const hargaJasaPerPcs = newBatchData.produksiType === 'penjahit' 
            ? (item.hargaJahitPerPcs || 0) 
            : (item.hargaMaklunPerPcs || 0);
        totalHargaJasa += (item.aktualJadi || 0) * hargaJasaPerPcs;
    });

    const batchId = `PROD-${Date.now()}`;
    
    const dataToSave = {
        ...newBatchData,
        id: batchId,
        totalQty,
        totalBiayaMaterial,
        totalHargaJasaMaklun: totalHargaJasa,
        tanggal: new Date(newBatchData.tanggal),
        userId: currentUser.value.uid,
    };
    
    try {
        const batchRef = doc(db, "production_batches", batchId);
        await setDoc(batchRef, dataToSave);

        state.produksi.unshift(dataToSave); 
        
        hideModal();
        alert('Batch produksi baru berhasil disimpan ke Database!');

    } catch (error) {
        console.error("Error menyimpan batch produksi baru:", error);
        alert("Gagal menyimpan batch produksi baru. Cek console.");
    }
}

function setupEditProduksiBatch(batch) {
    // Buat salinan data batch agar data asli di state tidak ikut berubah sebelum disimpan
    const dataForModal = JSON.parse(JSON.stringify(batch));
    
    // Pastikan properti dinamis ada, meskipun tidak ada di data database
    dataForModal.produksiType = dataForModal.produksiType || 'pemaklun';
    dataForModal.namaStatus = dataForModal.namaStatus || '';
    dataForModal.totalBiayaMaterial = dataForModal.totalBiayaMaterial || 0;
    dataForModal.totalHargaJasaMaklun = dataForModal.totalHargaJasaMaklun || 0;

    if (dataForModal.kainBahan && Array.isArray(dataForModal.kainBahan)) {
        dataForModal.kainBahan = dataForModal.kainBahan.map(item => {
            if (!item.idUnik) {
                item.idUnik = generateUniqueCode();
            }
            return {
                ...item,
                hargaMaklunPerPcs: item.hargaMaklunPerPcs || 0,
                biayaAlat: item.biayaAlat || 0,
                isInventoried: item.isInventoried || false,
            };
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
    dataToUpdate.produksiType = editedBatchData.produksiType;
    dataToUpdate.namaStatus = editedBatchData.namaStatus;
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

// KODE BARU

async function updateProductionInventoryStatus(batchId, itemIndex) {
    if (!currentUser.value) {
        alert("Anda harus login untuk mengelola inventaris.");
        return;
    }
    if (!confirm("Anda yakin ingin menandai item ini sebagai sudah masuk inventaris? Stok master akan bertambah.")) {
        return;
    }

    const originalBatch = state.produksi.find(b => b.id === batchId);
    if (!originalBatch) {
        alert("Batch tidak ditemukan.");
        return;
    }
    const itemToUpdate = originalBatch.kainBahan[itemIndex];

    try {
        const batch = writeBatch(db);
        const batchRef = doc(db, "production_batches", batchId);

        const matchingProduct = getProductBySku(itemToUpdate.sku);

        if (matchingProduct) {
            const productRef = doc(db, "products", matchingProduct.docId);
            const allocationRef = doc(db, "stock_allocations", matchingProduct.docId);

            const newStock = (matchingProduct.stokFisik || 0) + (itemToUpdate.aktualJadi || 0);

            const newKainBahan = JSON.parse(JSON.stringify(originalBatch.kainBahan));
            newKainBahan[itemIndex].isInventoried = true;
            batch.update(batchRef, { kainBahan: newKainBahan });

            batch.update(productRef, { physical_stock: newStock });

            const newAlokasi = {
                userId: currentUser.value.uid
            };
            state.settings.marketplaces.forEach(mp => {
                newAlokasi[mp.id] = (matchingProduct.stokAlokasi[mp.id] || 0);
            });
            batch.set(allocationRef, newAlokasi, { merge: true });

            await batch.commit();

            itemToUpdate.isInventoried = true;
            if (matchingProduct) {
                matchingProduct.stokFisik = newStock;
            }

            alert("Stok berhasil ditambahkan ke inventaris!");

        } else {
            throw new Error("Produk yang cocok tidak ditemukan di Inventaris. Harap tambahkan produk ini secara manual di halaman Manajemen Inventaris terlebih dahulu.");
        }
    } catch (error) {
        console.error("Error saat memperbarui status inventaris:", error);
        alert(`Gagal memperbarui status inventaris. Detail: ${error.message}`);
    }
}

function calculateRowSummary(item, batchType) {
    let batch;
    if (batchType === 'new') {
        batch = uiState.newProduksiBatch;
    } else if (batchType === 'edit') {
        batch = uiState.editProduksiBatch;
    } else {
        return { totalBiayaJasa: 0, totalBiayaAlat: 0 };
    }
    
    const modelInfo = state.settings.modelProduk.find(m => m.id === item.modelProdukId) || {};
    const totalYard = parseFloat(item.totalYard) || 0;
    const hargaKainPerYard = parseFloat(item.hargaKainPerYard) || 0;
    const aktualJadi = parseFloat(item.aktualJadi) || 0;
    const aktualJadiKombinasi = parseFloat(item.aktualJadiKombinasi) || 0;
    const hargaJahitPerPcs = parseFloat(item.hargaJahitPerPcs) || 0;
    const hargaMaklunPerPcs = parseFloat(item.hargaMaklunPerPcs) || 0;
    const biayaAlatInput = parseFloat(item.biayaAlat) || 0;
    const yardPerModel = parseFloat(item.yardPerModel) || (modelInfo.yardPerModel || 1);

    const totalBiayaKain = totalYard * hargaKainPerYard;
    
    let hargaJasa = 0;
    if (batch.produksiType === 'penjahit') {
        hargaJasa = hargaJahitPerPcs;
    } else {
        hargaJasa = hargaMaklunPerPcs;
    }

    const targetQty = yardPerModel > 0 ? Math.floor(totalYard / yardPerModel) : 0;
    
    let aktualFinal = aktualJadi > 0 ? aktualJadi : aktualJadiKombinasi;

    const totalBiayaJasa = aktualJadi * hargaJasa;
    const totalBiayaAlat = aktualJadi > 0 ? biayaAlatInput : 0;
    const selisih = aktualFinal - targetQty;
    const totalBiayaProduksi = totalBiayaKain + totalBiayaJasa + totalBiayaAlat;
    
    const hpp = totalBiayaProduksi / (aktualFinal || 1);
    const hppIdeal = targetQty > 0 ? totalBiayaProduksi / targetQty : hpp;
    const kerugianPerPcs = selisih < 0 && aktualFinal > 0 ? hpp - hppIdeal : 0;

    return {
        targetQty,
        selisih,
        totalBiayaKain,
        totalBiayaJasa,
        totalBiayaAlat,
        totalBiayaProduksi, // <-- DATA BARU UNTUK DITAMPILKAN
        hpp,
        hppIdeal,
        kerugianPerPcs
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
    // [PERBAIKAN 1] Logika untuk menentukan label dan nama yang benar
    const jenisPekerjaLabel = batch.produksiType === 'penjahit' ? 'Penjahit' : 'Pemaklun';
    const namaPekerja = batch.namaStatus || 'N/A';
    
    const printContent = `
        <style>
            @media print {
                @page { 
                    size: A4; 
                    margin: 20mm; 
                }
                body { 
                    -webkit-print-color-adjust: exact; 
                    print-color-adjust: exact;
                }
                /* Sembunyikan header dan footer default browser */
                @page {
                    @top-left { content: none; }
                    @top-right { content: none; }
                    @bottom-left { content: none; }
                    @bottom-right { content: none; }
                }
                header, footer { display: none; }
            }
            body { 
                font-family: Arial, sans-serif; 
                font-size: 11pt; 
            }
            h3, h4 { 
                margin: 0; 
                padding: 0; 
                color: #333;
            }
            .header { text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 10px; margin-bottom: 20px; }
            .info-section { margin-bottom: 20px; }
            .info-section p { margin: 4px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .total { font-weight: bold; }
            .text-right { text-align: right; }
        </style>
        <title>Detail Batch Produksi - ${batch.id}</title> <!-- [PERBAIKAN 2] Menghilangkan 'about:blank' -->
        <div class="header">
            <h3>Detail Batch Produksi: ${batch.id}</h3>
        </div>
        <div class="info-section">
            <p><strong>Tanggal:</strong> ${new Date(batch.tanggal).toLocaleDateString('id-ID')}</p>
            <!-- [PERBAIKAN 3] Menampilkan label dan nama yang sudah benar -->
            <p><strong>${jenisPekerjaLabel}:</strong> ${namaPekerja}</p>
            <p><strong>Status:</strong> ${batch.statusProses}</p>
        </div>
        <h4>Detail Produksi</h4>
        <table>
            <thead>
                <tr>
                    <th>Nama Produk</th> <!-- [PERBAIKAN 4] Kolom baru untuk nama produk -->
                    <th>Nama Kain</th>
                    <th>Warna</th>
                    <th>Ukuran</th>
                    <th class="text-right">Aktual Jadi</th>
                </tr>
            </thead>
            <tbody>
                ${(batch.kainBahan || []).map(kb => `
                    <tr>
                        <td>${state.settings.modelProduk.find(m => m.id === kb.modelProdukId)?.namaModel || 'N/A'}</td>
                        <td>${kb.namaKain || '-'}</td>
                        <td>${kb.warnaKain || '-'}</td>
                        <td>${kb.ukuran || '-'}</td>
                        <td class="text-right">${kb.aktualJadi || 0} pcs</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        
        <div style="margin-top: 25px;">
             <h4>Ringkasan Biaya</h4>
             <table>
                <tbody>
                    <tr><td>Total Kuantitas Jadi</td><td class="total text-right">${batch.totalQty} pcs</td></tr>
                    <tr><td>Total Biaya Material</td><td class="total text-right">${formatCurrency(batch.totalBiayaMaterial)}</td></tr>
                    <!-- [PERBAIKAN 5] Label biaya jasa dinamis -->
                    <tr><td>Total Biaya ${jenisPekerjaLabel}</td><td class="total text-right">${formatCurrency(batch.totalHargaJasaMaklun)}</td></tr>
                </tbody>
            </table>
        </div>
    `;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
}

function exportProduksiDetailToExcel(batch) {
    const dataForExcel = (batch.kainBahan || []).map(kb => {
        const modelName = state.settings.modelProduk.find(m => m.id === kb.modelProdukId)?.namaModel || 'N/A';
        return {
            "ID Batch": batch.id, "Tanggal Produksi": new Date(batch.tanggal), "Nama Pemaklun": batch.namaPemaklun,
            "Status Proses": batch.statusProses, "Nama Model Produk": modelName, "Nama Kain": kb.namaKain || '',
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
        const modelName = state.settings.modelProduk.find(m => m.id === kb.modelProdukId)?.namaModel || 'N/A';
        return {
            "ID Batch": batch.id, "Tanggal Produksi": new Date(batch.tanggal), "Nama Pemaklun": batch.namaPemaklun,
            "Status Proses": batch.statusProses, "Nama Model Produk": modelName, "Nama Kain": kb.namaKain || '',
            "Aktual Jadi (Pcs)": kb.aktualJadi || 0, "Harga Maklun/Pcs": kb.hargaMaklunPerPcs || 0,
        };
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Laporan Produksi ${status}`);
    worksheet["!cols"] = [ { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 20 } ];
    XLSX.writeFile(workbook, `Laporan_Produksi_${status}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

async function submitBiaya() {
    if (!currentUser.value) return alert("Anda harus login.");
    const form = uiState.modalData;

    // Validasi dasar
    if (!form.kategori || !form.jumlah) {
        return alert("Tanggal, Kategori, dan Jumlah Pokok wajib diisi.");
    }

    const paymentMethod = form.paymentMethod;
    const adminFee = paymentMethod === 'transfer' ? (form.adminFee || 0) : 0;
    const totalPengeluaran = form.jumlah + adminFee;
    let catatanLengkap = form.catatan || '';

    // Buat catatan otomatis berdasarkan metode pembayaran
    if (paymentMethod === 'transfer') {
        if (!form.selectedBankAccountId) return alert("Pilih rekening tujuan untuk transfer.");
        const bank = state.bankAccounts.find(b => b.id === form.selectedBankAccountId);
        let detailTransfer = `(Pembayaran via Transfer ke ${bank.bankName} - ${bank.accountNumber} a.n ${bank.accountName}`;
        if (adminFee > 0) {
            detailTransfer += `, Biaya Admin: ${formatCurrency(adminFee)}`;
        }
        detailTransfer += `)`;
        catatanLengkap = `${catatanLengkap} ${detailTransfer}`.trim();
    } else {
        catatanLengkap = `${catatanLengkap} (Pembayaran via Tunai)`.trim();
    }
    
    isLoading.value = true;
    try {
        const docRef = await addDoc(collection(db, "keuangan"), {
            kategori: form.kategori,
            jumlah: totalPengeluaran, // Simpan jumlah total (termasuk admin)
            catatan: catatanLengkap,
            jenis: 'pengeluaran',
            userId: currentUser.value.uid,
            tanggal: new Date(form.tanggal)
        });

        // Update state lokal
        state.keuangan.push({
            id: docRef.id,
            kategori: form.kategori,
            jumlah: totalPengeluaran,
            catatan: catatanLengkap,
            jenis: 'pengeluaran',
            tanggal: new Date(form.tanggal)
        });
        
        hideModal();
        alert('Data pengeluaran berhasil disimpan!');
    } catch (e) {
        console.error("Error menyimpan biaya:", e);
        alert("Gagal menyimpan data pengeluaran.");
    } finally {
        isLoading.value = false;
    }
}

async function deleteBiaya(id) {
    if (!currentUser.value) return alert("Anda harus login untuk mengelola biaya.");
    if (!confirm('Anda yakin ingin menghapus data pengeluaran ini?')) return;
    try {
        // PERBAIKAN: Hapus dari koleksi 'keuangan'
        await deleteDoc(doc(db, "keuangan", id)); 
        // Perbarui state lokal
        state.keuangan = state.keuangan.filter(b => b.id !== id);
        alert('Data pengeluaran berhasil dihapus.');
    } catch (error) {
        console.error("Error menghapus biaya:", error);
        alert("Gagal menghapus data pengeluaran.");
    }
}
async function submitPemasukan() {
    if (!currentUser.value) return alert("Anda harus login untuk mengelola pemasukan.");
    isLoading.value = true;
    try {
        const docRef = await addDoc(collection(db, "keuangan"), {
            kategori: uiState.modalData.kategori, // <-- GANTI DARI 'tipe'
            jumlah: uiState.modalData.jumlah,
            catatan: uiState.modalData.catatan,
            jenis: 'pemasukan_lain',
            userId: currentUser.value.uid,
            tanggal: new Date(uiState.modalData.tanggal)
        });

        // PERBAIKAN: Tambahkan data baru ke array lokal setelah berhasil
        state.keuangan.push({
            id: docRef.id,
            kategori: uiState.modalData.kategori, // <-- GANTI DARI 'tipe'
            jumlah: uiState.modalData.jumlah,
            catatan: uiState.modalData.catatan,
            jenis: 'pemasukan_lain',
            tanggal: new Date(uiState.modalData.tanggal)
        });

        hideModal();
        alert('Data pemasukan berhasil disimpan!');
    } catch (e) {
        console.error("Error menyimpan pemasukan:", e);
        alert("Gagal menyimpan data pemasukan.");
    } finally {
        isLoading.value = false;
    }
}

async function deletePemasukan(id) {
    if (!currentUser.value) return alert("Anda harus login untuk mengelola pemasukan.");
    if (!confirm('Anda yakin ingin menghapus data pemasukan ini?')) return;
    try {
        // PERBAIKAN: Hapus dari koleksi 'keuangan'
        await deleteDoc(doc(db, "keuangan", id)); 
        // Perbarui state lokal
        state.keuangan = state.keuangan.filter(p => p.id !== id);
        alert('Data pemasukan berhasil dihapus.');
    } catch (error) {
        console.error("Error menghapus pemasukan:", error);
        alert("Gagal menghapus data pemasukan.");
    }
}

async function addInflowCategory() {
    if (!currentUser.value) return alert("Anda harus login.");
    const form = uiState.nestedModalData;
    if (!form.name) return alert("Nama kategori tidak boleh kosong.");

    const newCategory = {
        id: `INFLOW-${Date.now()}`,
        name: form.name,
        description: form.description || '',
    };
    try {
        const userRef = doc(db, "users", currentUser.value.uid);
        const userDoc = await getDoc(userRef);
        const userData = userDoc.data();
        
        const updatedCategories = [...(userData.inflowCategories || []), newCategory];
        await updateDoc(userRef, { inflowCategories: updatedCategories });
        
        // Update state lokal
        state.settings.inflowCategories = updatedCategories;
        
        alert('Kategori pemasukan baru berhasil ditambahkan.');
        hideNestedModal();
    } catch (error) {
        console.error("Gagal menambahkan kategori pemasukan:", error);
        alert("Gagal menambahkan kategori pemasukan. Silakan coba lagi.");
    }
}

async function updateInflowCategory() {
    if (!currentUser.value) return alert("Anda harus login.");
    const form = uiState.nestedModalData;
    if (!form.name) return alert("Nama kategori tidak boleh kosong.");
    
    try {
        const userRef = doc(db, "users", currentUser.value.uid);
        const userDoc = await getDoc(userRef);
        const userData = userDoc.data();
        
        const updatedCategories = (userData.inflowCategories || []).map(cat => {
            if (cat.id === form.id) {
                return { ...cat, name: form.name, description: form.description };
            }
            return cat;
        });

        await updateDoc(userRef, { inflowCategories: updatedCategories });
        
        // Update state lokal
        const index = state.settings.inflowCategories.findIndex(cat => cat.id === form.id);
        if (index !== -1) {
            state.settings.inflowCategories[index] = { ...form, id: form.id };
        }

        alert('Kategori pemasukan berhasil diperbarui.');
        hideNestedModal();
    } catch (error) {
        console.error("Gagal memperbarui kategori pemasukan:", error);
        alert("Gagal memperbarui kategori pemasukan. Silakan coba lagi.");
    }
}

async function deleteInflowCategory(categoryId) {
    if (!currentUser.value) return alert("Anda harus login.");
    if (!confirm('Anda yakin ingin menghapus kategori ini?')) return;
    
    try {
        const userRef = doc(db, "users", currentUser.value.uid);
        const userDoc = await getDoc(userRef);
        const userData = userDoc.data();

        const updatedCategories = (userData.inflowCategories || []).filter(cat => cat.id !== categoryId);
        await updateDoc(userRef, { inflowCategories: updatedCategories });
        
        // Update state lokal
        state.settings.inflowCategories = updatedCategories;
        
        alert('Kategori pemasukan berhasil dihapus.');
    } catch (error) {
        console.error("Gagal menghapus kategori pemasukan:", error);
        alert("Gagal menghapus kategori pemasukan. Silakan coba lagi.");
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


// FUNGSI HAPUS RETUR (SEKARANG LEBIH SEDERHANA)

async function deleteReturnItem(itemToDelete) {
    if (!confirm(`Anda yakin ingin menghapus item retur ini? Stok akan disesuaikan kembali.`)) {
        return;
    }

    try {
        const returnDocRef = doc(db, "returns", itemToDelete.returnDocId);
        const productInState = state.produk.find(p => p.sku === itemToDelete.sku);
        if (!productInState) {
            throw new Error(`Produk dengan SKU ${itemToDelete.sku} tidak ditemukan di inventaris.`);
        }
        const productRef = doc(db, "products", productInState.docId);
        const allocationRef = doc(db, "stock_allocations", productInState.docId);

        await runTransaction(db, async (transaction) => {
            const returnDoc = await transaction.get(returnDocRef);
            const productDoc = await transaction.get(productRef);
            const allocationDoc = await transaction.get(allocationRef);

            if (!returnDoc.exists() || !productDoc.exists() || !allocationDoc.exists()) {
                throw new Error("Salah satu dokumen (retur, produk, atau alokasi) tidak ditemukan.");
            }

            const currentStock = productDoc.data().physical_stock || 0;
            const newStock = currentStock - itemToDelete.qty;
            const currentAllocations = allocationDoc.data() || {};
            const newChannelStock = (currentAllocations[itemToDelete.channelId] || 0) - itemToDelete.qty;

            if (newStock < 0 || newChannelStock < 0) {
                throw new Error(`Gagal menghapus retur karena akan membuat stok produk (${itemToDelete.sku}) menjadi minus.`);
            }

            transaction.update(productRef, { physical_stock: newStock });
            const updatedAllocations = { ...currentAllocations, [itemToDelete.channelId]: newChannelStock };
            transaction.set(allocationRef, updatedAllocations, { merge: true });

            const newItems = (returnDoc.data().items || []).filter(item => 
                !(item.sku === itemToDelete.sku && item.alasan === itemToDelete.alasan && item.tindakLanjut === itemToDelete.tindakLanjut)
            );

            if (newItems.length === 0) {
                transaction.delete(returnDocRef);
            } else {
                transaction.update(returnDocRef, { items: newItems });
            }
        });

        // Perbarui state lokal secara langsung
        productInState.stokFisik -= itemToDelete.qty;
        productInState.stokAlokasi[itemToDelete.channelId] -= itemToDelete.qty;
        state.retur = state.retur.filter(r => r.id !== itemToDelete.returnDocId || (r.id === itemToDelete.returnDocId && r.items.length > 1));

        alert('Item retur berhasil dihapus dan stok inventaris telah disesuaikan.');

    } catch (error) {
        console.error("Error menghapus item retur:", error);
        alert(`Gagal menghapus item retur: ${error.message}`);
    }
}

async function submitReturForm() {
    if (!currentUser.value) return alert("Anda harus login.");
    const form = uiState.modalData;
    const selectedItems = form.items.filter(item => item.selected && item.returnQty > 0);

    if (!form.foundTransaction || selectedItems.length === 0) {
        alert('Harap cari transaksi dan pilih minimal satu item untuk diretur.');
        return;
    }

    try {
        const batch = writeBatch(db);
        const trxAsli = form.foundTransaction;

        const dataToSave = {
            tanggal: new Date(),
            channelId: trxAsli.channelId,
            originalTransactionId: trxAsli.id,
            items: selectedItems.map(item => {
                const porsiItem = (item.hargaJual * item.returnQty) / (trxAsli.subtotal || 1);
                const nilaiDiskon = (trxAsli.diskon?.totalDiscount || 0) * porsiItem;
                const biayaMarketplace = (trxAsli.biaya?.total || 0) * porsiItem;
                return {
                    sku: item.sku,
                    qty: item.returnQty,
                    nilaiRetur: item.hargaJual * item.returnQty - nilaiDiskon,
                    nilaiDiskon: nilaiDiskon,
                    biayaMarketplace: biayaMarketplace,
                    alasan: item.alasan || '',
                    tindakLanjut: item.tindakLanjut || 'Ganti Baru'
                };
            }),
            userId: currentUser.value.uid
        };

        const returnRef = doc(collection(db, "returns"));
        batch.set(returnRef, dataToSave);

        for (const item of dataToSave.items) {
            const productInState = getProductBySku(item.sku);
            if (productInState) {
                const newStockFisik = productInState.stokFisik + item.qty;
                const productRef = doc(db, "products", productInState.docId);
                const allocationRef = doc(db, "stock_allocations", productInState.docId);
                
                batch.update(productRef, { physical_stock: newStockFisik });
                const newAlokasi = { ...productInState.stokAlokasi };
                newAlokasi[trxAsli.channelId] = (newAlokasi[trxAsli.channelId] || 0) + item.qty;
                batch.set(allocationRef, newAlokasi, { merge: true });
            }
        }
        
        await batch.commit();

        // Perbarui state lokal secara langsung
        state.retur.unshift({ id: returnRef.id, ...dataToSave, tanggal: dataToSave.tanggal.toDate() });
        for (const item of selectedItems) {
            const productInState = state.produk.find(p => p.sku === item.sku);
            if (productInState) {
                productInState.stokFisik += item.returnQty;
                productInState.stokAlokasi[trxAsli.channelId] += item.returnQty;
            }
        }

        alert(`Data retur untuk pesanan ${trxAsli.marketplaceOrderId} berhasil disimpan! Stok telah dikembalikan.`);
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

function printInvestorPaymentDetailed(data) {
    const printContent = `
        <style>
            body { font-family: sans-serif; margin: 20px; font-size: 12px; }
            h3, h4 { margin: 0; padding: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { padding: 6px; text-align: left; }
            .header { text-align: center; border-bottom: 1px solid #ccc; padding-bottom: 10px; margin-bottom: 15px; }
            .section { margin-top: 20px; }
            .section-title { font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 8px; font-size: 14px; }
            .summary-table td { border: 1px solid #eee; }
            .summary-table .label { font-weight: bold; }
            .total { font-weight: bold; font-size: 1.1em; }
        </style>
        <div class="header">
            <h3>Laporan Bagi Hasil Investor</h3>
            <p>${data.investorName} - Periode ${data.period}</p>
        </div>
        <div class="section">
            <h4 class="section-title">Perhitungan Laba Bersih</h4>
            <table class="summary-table">
                <tr><td>Omset Bersih Penjualan</td><td style="text-align:right;">${formatCurrency(data.omsetBersihPenjualan)}</td></tr>
                <tr><td>(-) Omset Bersih dari Retur</td><td style="text-align:right;">-${formatCurrency(data.omsetBersihDariRetur)}</td></tr>
                <tr class="total"><td>Total Omset Bersih</td><td style="text-align:right;">${formatCurrency(data.omsetBersihFinal)}</td></tr>
                <tr><td>(-) HPP Terjual</td><td style="text-align:right;">-${formatCurrency(data.hppTerjualFinal)}</td></tr>
                <tr class="total"><td>LABA KOTOR</td><td style="text-align:right;">${formatCurrency(data.labaKotor)}</td></tr>
                <tr><td>(-) Total Biaya Marketplace</td><td style="text-align:right;">-${formatCurrency(data.totalBiayaTransaksi)}</td></tr>
                <tr><td>(-) Biaya Operasional</td><td style="text-align:right;">-${formatCurrency(data.totalBiayaOperasional)}</td></tr>
                <tr class="total" style="background-color: #f0f0f0;"><td>LABA BERSIH PERIODE</td><td style="text-align:right;">${formatCurrency(data.labaBersih)}</td></tr>
            </table>
        </div>
        <div class="section">
            <h4 class="section-title">Pembagian Hasil</h4>
            <table class="summary-table">
                <tr class="total" style="background-color: #e6f7ff;">
                    <td>Bagian Investor (${data.profitSharePercentage}%)</td>
                    <td style="text-align:right;">${formatCurrency(data.investorShare)}</td>
                </tr>
                <tr><td>Bagian Perusahaan</td><td style="text-align:right;">${formatCurrency(data.companyShare)}</td></tr>
            </table>
        </div>
    `;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
}

async function addMarketplace() {
    if (!currentUser.value) return alert("Anda harus login.");

    const newMarketplace = {
        id: `marketplace-${Date.now()}`,
        name: 'Marketplace Baru',
        adm: 0, program: 0, layanan: 0, perPesanan: 0, voucher: 0,
    };

    state.settings.marketplaces.push(newMarketplace);

    if (!state.promotions.perChannel[newMarketplace.id]) {
        state.promotions.perChannel[newMarketplace.id] = { voucherToko: null, voucherSemuaProduk: null };
    }
    
    // Perbarui data marketplaces di database secara langsung
    try {
        const userId = currentUser.value.uid;
        const settingsRef = doc(db, "settings", userId);
        
        // Cukup perbarui satu field 'marketplaces', tidak seluruh dokumen
        await updateDoc(settingsRef, {
            marketplaces: state.settings.marketplaces,
        });

        alert('Marketplace baru berhasil ditambahkan dan disimpan!');
    } catch(error) {
        console.error("Gagal menyimpan perubahan marketplace:", error);
        alert(`Gagal menyimpan data: ${error.message}`);
    }
}

async function removeMarketplace(marketplaceId) {
    if (!currentUser.value) return alert("Anda harus login.");
    if (!confirm('Anda yakin ingin menghapus marketplace ini?')) return;

    const index = state.settings.marketplaces.findIndex(mp => mp.id === marketplaceId);
    if (index > -1) {
        // Hapus marketplace dari array lokal
        state.settings.marketplaces.splice(index, 1);
        
        try {
            const userId = currentUser.value.uid;
            const settingsRef = doc(db, "settings", userId);
            
            // Lakukan update dokumen yang sangat spesifik
            await updateDoc(settingsRef, {
                marketplaces: state.settings.marketplaces,
            });
            
            // Hapus juga data promosi yang mungkin ada di perChannel dan perModel
            // agar data tidak 'menggantung' di database.
            // ini opsional, tetapi merupakan praktik terbaik
            if (state.promotions.perChannel[marketplaceId]) {
                delete state.promotions.perChannel[marketplaceId];
                // Hapus data promosi dari Firestore juga jika ada
                const promotionsRef = doc(db, "promotions", userId);
                await updateDoc(promotionsRef, {
                    perChannel: state.promotions.perChannel,
                });
            }

            alert('Marketplace berhasil dihapus dan perubahan telah disimpan.');
        } catch(error) {
            alert(`Gagal menyimpan data: ${error.message}`);
        }
    }
}

async function saveMarketplaceEdit() {
    if (!currentUser.value) return alert("Anda harus login.");
    
    const editedMarketplace = uiState.modalData;
    const index = state.settings.marketplaces.findIndex(mp => mp.id === editedMarketplace.id);
    
    if (index !== -1) {
        state.settings.marketplaces[index] = editedMarketplace;
    }
    
    try {
        const userId = currentUser.value.uid;
        const settingsRef = doc(db, "settings", userId);
        
        // Cukup perbarui satu field 'marketplaces', tidak seluruh dokumen
        await updateDoc(settingsRef, {
            marketplaces: state.settings.marketplaces,
        });

        hideModal();
        alert('Perubahan marketplace berhasil disimpan.');
    } catch(error) {
        console.error("Gagal menyimpan perubahan marketplace:", error);
        alert(`Gagal menyimpan data: ${error.message}`);
    }
}

async function saveSettingsData() {
    if (!currentUser.value) return alert("Anda harus login.");
    isSaving.value = true;
    try {
        const userId = currentUser.value.uid;
        const settingsRef = doc(db, "settings", userId);
        
        // Cukup ambil data yang relevan dari state
        const settingsData = {
            brandName: state.settings.brandName,
            minStok: state.settings.minStok,
            marketplaces: JSON.parse(JSON.stringify(state.settings.marketplaces)),
            modelProduk: JSON.parse(JSON.stringify(state.settings.modelProduk)),
            pinProtection: state.settings.pinProtection,
            dashboardPin: state.settings.dashboardPin,
            userId: userId
        };
        
        await setDoc(settingsRef, settingsData, { merge: true });
        
        console.log('Pengaturan berhasil disimpan ke Firestore!');
        
    } catch (error) {
        console.error("Gagal menyimpan pengaturan:", error);
        throw new Error("Gagal menyimpan data ke Firebase.");
    } finally {
        isSaving.value = false;
    }
}

async function addModelProduk() {
    if (!currentUser.value) return alert("Anda harus login.");
    const newModel = {
        id: `MODEL-${Date.now()}`,
        namaModel: 'Model Baru',
        warna: '',
        ukuran: '',
        yardPerModel: 0,
        hargaMaklun: 0,
        hargaJahit: 0,
    };
    state.settings.modelProduk.push(newModel);
    await saveData();
    alert('Model Produk baru berhasil ditambahkan.');
}

async function removeModelProduk(modelId) {
    if (!currentUser.value) return alert("Anda harus login.");
    if (!confirm('Anda yakin ingin menghapus model Produk ini?')) return;

    const index = state.settings.modelProduk.findIndex(m => m.id === modelId);
    if (index > -1) {
        state.settings.modelProduk.splice(index, 1);
        await saveData(); // Panggil saveData untuk menyimpan
        alert('Model Produk berhasil dihapus.');
    }
}

async function saveModelProdukEdit() {
    if (!currentUser.value) return alert("Anda harus login.");
    const editedModel = uiState.modalData;
    const index = state.settings.modelProduk.findIndex(model => model.id === editedModel.id);
    if (index !== -1) {
        state.settings.modelProduk[index] = {
            ...editedModel,
            hargaJahit: editedModel.hargaJahit || 0,
            warna: editedModel.warna || '',
            ukuran: editedModel.ukuran || ''
        };
    }
    
    // Perbarui data modelProduk di database secara langsung
    try {
        const userId = currentUser.value.uid;
        const settingsRef = doc(db, "settings", userId);
        
        // Cukup perbarui satu field 'modelProduk', tidak seluruh dokumen
        await updateDoc(settingsRef, {
            modelProduk: state.settings.modelProduk,
        });

        alert('Perubahan model Produk berhasil disimpan.');
        hideModal();
    } catch (error) {
        console.error("Gagal menyimpan perubahan model produk:", error);
        alert(`Gagal menyimpan perubahan model produk: ${error.message}`);
    }
}

async function saveStockAllocation() {
    if (!currentUser.value) return alert("Anda harus login untuk menyimpan perubahan.");
    const { product, original } = uiState.modalData;
    const userId = currentUser.value.uid;

    const cleanAllocationData = JSON.parse(JSON.stringify(product.stokAlokasi));
    
    try {
        const batch = writeBatch(db);

        // Operasi 1: Update stok fisik di koleksi 'products'
        const productRef = doc(db, "products", original.docId); // <-- PERBAIKAN: Gunakan original.docId
        batch.update(productRef, { physical_stock: product.stokFisik });
        
        // Operasi 2: Simpan/Update data alokasi di koleksi 'stock_allocations'
        const allocationRef = doc(db, "stock_allocations", original.docId); // <-- PERBAIKAN: Gunakan original.docId
        batch.set(allocationRef, { ...cleanAllocationData, userId: userId });

        await batch.commit();

        const targetProduct = state.produk.find(p => p.docId === original.docId);
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

async function deleteGroup(variants) {
    if (!confirm(`Anda yakin ingin menghapus SEMUA ${variants.length} varian produk ini?`)) {
        return;
    }

    if (!currentUser.value) {
        alert("Anda harus login.");
        return;
    }

    const userId = currentUser.value.uid;
    const batch = writeBatch(db);
    let successCount = 0;
    const failedSkus = [];

    variants.forEach(variant => {
        if (variant.userId !== userId) {
            failedSkus.push(variant.sku);
            return;
        }

        const productRef = doc(db, "products", variant.docId);
        batch.delete(productRef);
        const allocationRef = doc(db, "stock_allocations", variant.docId);
        batch.delete(allocationRef);

        state.settings.marketplaces.forEach(mp => {
            const priceDocId = `${variant.docId}-${mp.id}`;
            const priceRef = doc(db, "product_prices", priceDocId);
            batch.delete(priceRef);
        });
        successCount++;
    });

    try {
        await batch.commit();

        // Perbarui state lokal secara langsung
        const deletedDocIds = variants.map(v => v.docId);
        state.produk = state.produk.filter(p => !deletedDocIds.includes(p.docId));
        
        alert(`Berhasil menghapus ${successCount} varian.`);
    } catch (error) {
        console.error("Gagal menghapus grup produk:", error);
        alert(`Gagal menghapus produk: ${error.message}`);
    }
}

async function removeProductVariant(productId) {
    if (!confirm(`Anda yakin ingin menghapus varian produk ini? Aksi ini tidak dapat dibatalkan.`)) {
        return;
    }
    if (!currentUser.value) {
        alert("Anda harus login.");
        return;
    }
    const userId = currentUser.value.uid;

    try {
        const batch = writeBatch(db);
        const productInState = state.produk.find(p => p.docId === productId);
        if (!productInState || productInState.userId !== userId) {
            throw new Error("Anda tidak memiliki izin untuk menghapus produk ini.");
        }

        const productRef = doc(db, "products", productId);
        batch.delete(productRef);
        const allocationRef = doc(db, "stock_allocations", productId);
        batch.delete(allocationRef);

        state.settings.marketplaces.forEach(mp => {
            const priceDocId = `${productId}-${mp.id}`;
            const priceRef = doc(db, "product_prices", priceDocId);
            batch.delete(priceRef);
        });

        await batch.commit();
        
        // Perbarui state lokal secara langsung
        state.produk = state.produk.filter(p => p.docId !== productId);

        alert(`Varian produk berhasil dihapus.`);
    } catch (error) {
        console.error(`Error menghapus produk ID: ${productId}:`, error);
        alert(`Gagal menghapus produk: ${error.message}`);
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
    const totalBiayaMarketplace = (trx.biaya?.total || 0); // Mengambil total yang sudah dihitung
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
        content: `
            <p>Dashboard adalah kokpit utama operasional Anda. Halaman ini menyajikan denyut nadi bisnis secara visual dan intuitif untuk pengambilan keputusan yang cepat dan berbasis data.</p>
            <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>Indikator Kinerja Utama (KPI):</strong> Pantau metrik fundamental seperti Omset Bersih, Laba Kotor, Biaya Operasional, dan Laba Bersih secara <i>real-time</i>. Semua kalkulasi sudah secara otomatis menyesuaikan dengan data penjualan dan retur.</li>
                <li><strong>Analisis Periodik:</strong> Gunakan filter waktu yang fleksibel (harian, rentang tanggal kustom, rentang bulan) untuk mengevaluasi kinerja dan menemukan tren musiman.</li>
                <li><strong>Visualisasi Data:</strong> Grafik interaktif memberikan gambaran jernih mengenai kanal penjualan paling produktif dan perbandingan antara Laba Kotor dengan Biaya Operasional dari waktu ke waktu.</li>
            </ul>
        `
    },
    {
        icon: '🛒',
        title: 'Kasir (Point of Sale)',
        subtitle: 'Akurasi dan Kontrol Penuh untuk Setiap Transaksi.',
        content: `
            <p>Halaman Kasir dirancang untuk memproses <strong>satu pesanan per satu waktu</strong> dengan tingkat akurasi dan kontrol tertinggi. Alur ini ideal untuk memverifikasi setiap detail pesanan sebelum finalisasi, penjualan langsung, atau saat volume pesanan tidak terlalu tinggi.</p>
            <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>Prinsip "Satu Resi = Satu Keranjang":</strong> Setelah ID Pesanan (resi) di-scan atau dimasukkan, keranjang akan terkunci. Ini adalah fitur keamanan untuk memastikan tidak ada produk yang salah masuk ke pesanan yang salah.</li>
                <li><strong>Input Fleksibel:</strong> Mendukung input via barcode scanner atau pencarian manual. Sistem pencarian cerdas akan memberikan rekomendasi otomatis saat Anda mengetik SKU atau nama produk.</li>
                <li><strong>Alur Kerja:</strong> Tambahkan semua produk ke keranjang, masukkan ID pesanan, lalu selesaikan transaksi untuk menyimpannya.</li>
            </ul>
        `
    },
    {
        icon: '⚡️',
        title: 'Proses Massal (Smart Scan)',
        subtitle: 'Efisiensi Maksimal untuk Volume Pesanan Tinggi.',
        content: `
            <p>Halaman ini adalah solusi untuk efisiensi tertinggi saat volume pesanan sedang melonjak, seperti saat <i>event campaign</i>. Tujuannya adalah memproses banyak pesanan dengan interaksi minimal.</p>
            <div class="mt-4 p-4 border bg-slate-50 rounded-lg">
                <h4 class="font-semibold text-indigo-700">Alur Kerja #1: Otomatis dengan Scanner</h4>
                <p class="text-xs mt-1">Gunakan kolom input <strong>"KHUSUS SCANNER (Otomatis)"</strong> untuk kecepatan maksimal.</p>
                <ol class="list-decimal list-inside mt-2 space-y-1 text-sm">
                    <li><strong>Scan Produk:</strong> Pindai barcode pada produk pertama untuk pesanan A. Produk akan masuk ke pesanan sementara.</li>
                    <li><strong>Scan Produk Berikutnya:</strong> Jika pesanan A memiliki lebih dari satu produk, lanjutkan scan semua produknya.</li>
                    <li><strong>Scan Resi Pengiriman:</strong> Setelah semua produk untuk pesanan A di-scan, langsung scan resinya.</li>
                    <li><strong>Finalisasi Otomatis:</strong> Sistem akan otomatis memfinalisasi pesanan A dan menambahkannya ke "Antrian Pesanan". Anda bisa langsung lanjut scan produk untuk pesanan B tanpa perlu klik apapun.</li>
                </ol>
            </div>
            <div class="mt-3 p-4 border bg-slate-50 rounded-lg">
                <h4 class="font-semibold text-indigo-700">Alur Kerja #2: Input Manual</h4>
                 <p class="text-xs mt-1">Gunakan kolom input <strong>"Input Manual"</strong> jika tidak menggunakan scanner.</p>
                <ol class="list-decimal list-inside mt-2 space-y-1 text-sm">
                    <li><strong>Ketik & Pilih Produk:</strong> Ketik SKU atau nama produk, lalu klik pada rekomendasi yang muncul untuk menambahkannya ke pesanan sementara.</li>
                    <li><strong>Ketik ID Pesanan:</strong> Setelah semua produk ditambahkan, ketik ID Pesanan (resi) di kolom yang sama.</li>
                    <li><strong>Finalisasi Manual:</strong> Klik tombol <strong>"Jadikan ID Pesanan"</strong>. Pesanan akan difinalisasi dan masuk ke "Antrian Pesanan".</li>
                </ol>
            </div>
             <div class="mt-3 p-4 border bg-green-50 rounded-lg">
                <h4 class="font-semibold text-green-700">Langkah Terakhir: Proses Semua Antrian</h4>
                <p class="text-sm mt-1">Setelah semua pesanan terkumpul di antrian, klik tombol <strong>"Proses Semua Antrian"</strong>. Sistem akan menyimpan semua pesanan di antrian ke dalam Riwayat Transaksi dan secara otomatis memotong stok inventaris dalam satu kali operasi.</li>
            </div>
        `
    },
    {
        icon: '📦',
        title: 'Manajemen Inventaris',
        subtitle: 'Kendalikan Stok Fisik dan Alokasi Digital Secara Terpusat.',
        content: `
            <p>Modul ini memisahkan dua konsep kunci untuk kontrol stok yang superior dan mencegah <i>overselling</i>.</p>
            <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>Stok Fisik:</strong> Jumlah total produk yang secara nyata ada di gudang Anda. Ini adalah satu-satunya sumber kebenaran (<i>single source of truth</i>). Nilai ini hanya berubah saat ada stok masuk, penjualan, atau retur.</li>
                <li><strong>Alokasi Stok:</strong> "Jatah" stok yang Anda putuskan untuk ditampilkan di setiap marketplace. Anda bisa mengalokasikan 100 pcs ke Shopee dan 50 pcs ke Tokopedia dari total 150 stok fisik. Sistem akan memperingatkan jika total alokasi melebihi stok fisik.</li>
                <li><strong>Manajemen Stok:</strong> Lakukan penyesuaian stok, catat stok masuk, dan pantau produk berdasarkan status stok (<strong>Aman</strong>, <strong>Menipis</strong>, atau <strong>Habis</strong>) yang ditentukan oleh "Batas Stok Minimum" di Pengaturan.</li>
            </ul>
        `
    },
    {
        icon: '💲',
        title: 'Harga, HPP & Promosi',
        subtitle: 'Arsitektur Profitabilitas untuk Setiap Produk Anda.',
        content: `
            <p>Profitabilitas bukanlah kebetulan, melainkan hasil dari sebuah desain. Di sinilah Anda merancang fondasi keuntungan untuk setiap item yang Anda jual.</p>
            <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>Input HPP Presisi:</strong> Masukkan Harga Pokok Penjualan (HPP) sebagai biaya modal murni untuk setiap varian produk.</li>
                <li><strong>Strategi Harga Dinamis:</strong> Atur harga jual yang berbeda untuk setiap marketplace, termasuk <strong>Harga Spesial (Flash Sale)</strong> per produk per channel.</li>
                <li><strong>Manajemen Promosi Cerdas:</strong> Atur promosi berlapis, mulai dari <strong>Voucher Toko</strong> (berlaku untuk semua produk di satu channel) hingga <strong>Diskon Bertingkat</strong> yang spesifik untuk model produk tertentu.</li>
                <li><strong>Kalkulator Harga Cerdas:</strong> Gunakan kalkulator untuk secara otomatis menentukan harga jual ideal berdasarkan HPP, semua biaya marketplace, diskon, dan target margin profit yang Anda inginkan.</li>
            </ul>
        `
    },
    {
        icon: '🏭',
        title: 'Manajemen Produksi',
        subtitle: 'Visibilitas Penuh dari Bahan Baku hingga Produk Jadi.',
        content: `
            <p>Ubah proses produksi yang kompleks menjadi alur kerja yang transparan dan terukur. Lacak setiap perintah kerja sebagai sebuah <strong>Batch Produksi</strong> yang terkontrol.</p>
            <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>Pembedaan Jasa:</strong> Sistem membedakan antara jasa <strong>Pemaklun</strong> dan <strong>Penjahit</strong>, memungkinkan pencatatan biaya yang lebih akurat sesuai dengan jenis pekerjaan.</li>
                <li><strong>Pencatatan Detail:</strong> Catat setiap bahan kain yang digunakan, lengkap dengan kode unik, total yard, dan biaya jasa yang sesuai.</li>
                <li><strong>Aktual Jadi vs. Kombinasi:</strong> Bedakan antara hasil produksi dari bahan utama (<strong>Aktual Jadi</strong>) dan bahan sekunder/tambahan (<strong>Aktual Jadi Kombinasi</strong>) untuk akurasi biaya material.</li>
                <li><strong>Analisis Efisiensi:</strong> Fitur <strong>Analisis Model</strong> secara otomatis menyorot batch yang hasilnya di bawah atau di atas target, membantu Anda mengidentifikasi efisiensi penjahit atau pemaklun.</li>
                <li><strong>Integrasi Inventaris:</strong> Masukkan produk yang telah selesai produksi ke dalam stok fisik hanya dengan satu klik dari halaman laporan.</li>
            </ul>
        `
    },
    {
        icon: '🧵',
        title: 'Gudang Stok Kain',
        subtitle: 'Manajemen Aset Bahan Baku sebagai Fondasi Produksi.',
        content: `
            <p>Setiap produksi yang hebat dimulai dari bahan baku yang terkelola dengan baik. Modul ini adalah fondasi dari seluruh alur produksi Anda.</p>
            <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>Pencatatan Terpusat:</strong> Catat setiap pembelian kain baru, lengkap dengan nama, warna, sisa yard, asal toko, dan harga beli per yard.</li>
                <li><strong>Kontrol Stok Bahan:</strong> Dapatkan gambaran jelas mengenai sisa stok setiap jenis kain yang Anda miliki secara <i>real-time</i>.</li>
                <li><strong>Integrasi Cerdas:</strong> Data di sini menjadi referensi cerdas (<i>autocomplete</i>) saat Anda membuat Batch Produksi baru, memastikan konsistensi dan akurasi data.</li>
            </ul>
        `
    },
    {
        icon: '💰',
        title: 'Manajemen Keuangan',
        subtitle: 'Pencatatan Arus Kas Operasional untuk Laba Bersih Akurat.',
        content: `
            <p>Kesehatan bisnis tidak hanya diukur dari penjualan. Halaman ini berfungsi sebagai buku kas digital untuk semua arus uang di luar transaksi produk.</p>
            <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>Catat Pengeluaran:</strong> Dokumentasikan setiap <strong>biaya operasional</strong>—mulai dari gaji, listrik, hingga pemasaran—untuk mendapatkan gambaran biaya bisnis yang sebenarnya.</li>
                <li><strong>Catat Pemasukan Lain:</strong> Lacak <strong>pemasukan non-penjualan</strong> seperti suntikan modal dari investor atau pendapatan lain di luar penjualan utama.</li>
                <li><strong>Akurasi Laba Bersih:</strong> Data dari modul inilah yang menyempurnakan kalkulasi Laba Bersih di Dashboard, memberikan Anda angka keuntungan akhir yang paling akurat.</li>
            </ul>
        `
    },
     {
        icon: '🤝',
        title: 'Manajemen Investor',
        subtitle: 'Transparansi dan Pertumbuhan Melalui Permodalan Eksternal.',
        content: `
            <p>Kelola semua aktivitas yang berkaitan dengan permodalan dari investor secara profesional dan transparan.</p>
            <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>Pencatatan Terpusat:</strong> Catat setiap investor, jumlah modal, tanggal mulai, dan persentase bagi hasil yang disepakati.</li>
                <li><strong>Pelacakan Kinerja:</strong> Pantau total bagi hasil yang telah dibayarkan dan lihat metrik kunci seperti <strong>ROI (Return on Investment)</strong> secara real-time.</li>
                <li><strong>Laporan Otomatis:</strong> Buat laporan bagi hasil yang detail dan akurat untuk periode manapun hanya dengan beberapa klik, lengkap dengan rincian perhitungan laba bersih pada periode tersebut.</li>
            </ul>
        `
    },
    {
        icon: '↩️',
        title: 'Manajemen Retur',
        subtitle: 'Mengubah Keluhan Menjadi Peningkatan Kualitas dan Loyalitas.',
        content: `
            <p>Kelola setiap pengembalian produk bukan sebagai masalah, tetapi sebagai kesempatan untuk meningkatkan kualitas layanan Anda.</p>
            <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>Pencatatan Berbasis Transaksi:</strong> Cari transaksi asli berdasarkan ID Pesanan untuk mencatat retur, memastikan data yang akurat.</li>
                <li><strong>Penyesuaian Otomatis:</strong> Saat retur disimpan, stok fisik akan otomatis bertambah di inventaris. Seluruh metrik di dasbor (omset, HPP, biaya, laba) juga akan disesuaikan secara otomatis untuk periode yang relevan.</li>
                <li><strong>Integritas Data:</strong> Untuk menjaga keakuratan histori, data retur yang sudah tersimpan tidak dapat diedit. Kesalahan input harus diperbaiki dengan menghapus retur dan membuat penyesuaian stok manual jika diperlukan.</li>
            </ul>
        `
    },
    {
        icon: '⚙️',
        title: 'Pengaturan',
        subtitle: 'Cetak Biru dan Fondasi Digital untuk Operasional Bisnis.',
        content: `
            <p>Halaman ini adalah "ruang mesin" dari aplikasi Anda. Ketepatan data di sini akan menentukan akurasi kalkulasi di seluruh sistem.</p>
            <ul class="list-disc list-inside mt-2 space-y-1">
                <li><strong>Struktur Biaya Marketplace:</strong> Definisikan semua kanal penjualan beserta struktur biayanya (admin, komisi, program, dll.) agar perhitungan laba per transaksi selalu akurat.</li>
                <li><strong>Model Produk Default:</strong> Tetapkan "resep" standar produksi Anda. Data seperti kebutuhan kain dan harga jasa (maklun/jahit) di sini akan menjadi acuan utama di modul Produksi.</li>
                <li><strong>Manajemen Rekening:</strong> Daftarkan rekening bank Anda untuk pencatatan pembayaran yang lebih rapi, baik untuk biaya operasional maupun bagi hasil investor.</li>
                <li><strong>Keamanan PIN Fleksibel:</strong> Atur PIN utama Anda dan aktifkan atau nonaktifkan kunci keamanan untuk setiap halaman sensitif (Dashboard, Keuangan, Investasi) sesuai kebutuhan Anda.</li>
            </ul>
        `
    },
];

// [KODE BARUu] State untuk mengelola accordion di halaman panduan
const panduanAccordion = ref(null);


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
      const productInState = state.produk.find(p => p.sku === item.sku);
      if (productInState) {
        const newStock = (productInState.stokFisik || 0) + item.qty;
        const productRef = doc(db, "products", productInState.docId);
        batch.update(productRef, { physical_stock: newStock });
        
        // Perbarui state lokal
        productInState.stokFisik += item.qty;
      }
    }

    await batch.commit();

    // Hapus transaksi dari state lokal setelah berhasil
    state.transaksi = state.transaksi.filter(trx => trx.id !== transactionId);

    alert("Transaksi berhasil dihapus dan stok telah dikembalikan.");

  } catch (error) {
    console.error("Error saat menghapus transaksi:", error);
    alert("Gagal menghapus transaksi dari database.");
  }
}


function handleModelProdukChange() {
    const selectedModel = state.settings.modelProduk.find(
        model => model.id === uiState.modalData.modelId
    );
    if (selectedModel) {
        // Mengisi otomatis Nama, Warna, dan Ukuran
        uiState.modalData.nama = selectedModel.namaModel || '';
        uiState.modalData.warna = selectedModel.warna || '';
        uiState.modalData.varian = selectedModel.ukuran || '';
    } else {
        // Mengosongkan field jika pilihan dihapus
        uiState.modalData.nama = '';
        uiState.modalData.warna = '';
        uiState.modalData.varian = '';
    }
}

function handleProductSkuChange(item) {
    const selectedProduct = state.produk.find(p => p.sku === item.sku);
    if (selectedProduct) {
        // --- Logika yang sudah ada ---
        item.warnaKain = selectedProduct.warna;
        item.ukuran = selectedProduct.varian;
        item.modelProdukId = selectedProduct.model_id;

        // --- LOGIKA BARU UNTUK HARGA OTOMATIS ---
        const selectedModel = state.settings.modelProduk.find(m => m.id === selectedProduct.model_id);
        if (selectedModel) {
            // Cek jenis jasa yang dipilih di form utama
            const batchType = uiState.modalType === 'addProduksi' ? uiState.newProduksiBatch.produksiType : uiState.editProduksiBatch.produksiType;

            if (batchType === 'penjahit') {
                item.hargaJahitPerPcs = selectedModel.hargaJahit || 0;
                item.hargaMaklunPerPcs = null; // Kosongkan harga maklun
            } else { // 'pemaklun'
                item.hargaMaklunPerPcs = selectedModel.hargaMaklun || 0;
                item.hargaJahitPerPcs = null; // Kosongkan harga jahit
            }
        }
        // --- AKHIR DARI LOGIKA BARU ---
    }
}

function addKainBahanItem(batch) {
    if (!batch.kainBahan) {
        batch.kainBahan = [];
    }
    batch.kainBahan.push({
        idUnik: generateUniqueCode(), // <-- BARIS BARU: Tambahkan kode unik
        modelProdukId: '',
        namaKain: '',
        tokoKain: '',
        warnaKain: '',
        ukuran: '',
        totalYard: null,
        hargaKainPerYard: null,
        yardPerModel: null,
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

watch(dashboardFilteredData, () => { if (activePage.value === 'dashboard') nextTick(renderCharts); });
watch(() => uiState.activeCartChannel, (newChannel) => { if (newChannel && !state.carts[newChannel]) state.carts[newChannel] = []; });
watch(() => uiState.promosiSelectedModel, (newModel) => {
  if (newModel) {
    if (!state.promotions.perModel[newModel]) {
      state.promotions.perModel[newModel] = {};
    }
    state.settings.marketplaces.forEach(channel => {
      if (!state.promotions.perModel[newModel][channel.id]) {
        state.promotions.perModel[newModel][channel.id] = { minBelanja: null, diskonRate: null, diskonBertingkat: [] };
      }
    });
  }
});

watch(() => uiState.bulk_scan_input, async (newValue) => {
    const scannedValue = newValue.trim();
    if (!scannedValue || !uiState.activeCartChannel) {
        // Jika input kosong atau channel belum dipilih, abaikan.
        return;
    }

    // Tunda eksekusi utama untuk memastikan nilai baru sudah dirender di input
    await nextTick();
    const product = getProductBySku(scannedValue);

    if (product) {
        // Jika yang di-scan adalah produk, tambahkan ke pesanan yang sedang aktif
        addProductToBulkQueue(product);
    } else {
        // Jika bukan produk, ini pasti resi. Cari pesanan yang sedang diisi dan finalisasi.
        let orderToFinalize = uiState.bulk_order_queue.find(o => o.id.startsWith('TEMP-'));
        if (orderToFinalize) {
            orderToFinalize.id = scannedValue;
            orderToFinalize.marketplaceOrderId = scannedValue;
            orderToFinalize.status = 'Mengantri';
        }
    }
    
    // --- PERUBAHAN UTAMA DI SINI ---
    // Gunakan setTimeout untuk memberi jeda sebelum mengosongkan kolom input
    setTimeout(() => {
        uiState.bulk_scan_input = '';
    }, 200); // Jeda 200 milidetik (0.2 detik)
});

watch(() => uiState.notesData.type, () => {
    uiState.notesData.voucherType = '';
});

watch(() => uiState.pengaturanTab, (newTab) => {
    if (newTab === 'admin' && isAdmin.value) {
        // Efisien: Hanya panggil data pengguna jika belum ada.
        if (uiState.allUsers.length === 0) {
            fetchAllUsers();
        }

        // Selalu Update: Panggil data komisi setiap kali tab dibuka agar data selalu baru.
        fetchCommissionPayouts();
        fetchActivationCodes();
    }
});



let unsubscribe = () => {}; 

const setupListeners = async (userId) => {
  unsubscribe(); // Hentikan listener lama

  // Listener untuk settings (real-time)
  const settingsListener = onSnapshot(doc(db, "settings", userId), (docSnap) => {
    if (docSnap.exists()) {
      const settingsData = docSnap.data();
      Object.assign(state.settings, settingsData);
    }
  }, (error) => { console.error("Error fetching settings:", error); });

  // Listener untuk komisi mitra (real-time jika dia adalah mitra)
  let commissionsListener = () => {};
  if (currentUser.value?.isPartner) {
    const commissionsQuery = query(
      collection(db, 'commissions'),
      where('partnerId', '==', currentUser.value.uid)
    );
    commissionsListener = onSnapshot(commissionsQuery, (snapshot) => {
      commissions.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    });
  }

  // Panggil data inti yang dibutuhkan segera
  await fetchCoreData(userId);

  // Fungsi untuk menghentikan listener saat logout
  unsubscribe = () => {
    settingsListener();
    commissionsListener();
  };
};

const fetchCoreData = async (userId) => {
  try {
    // BARIS BARU: Tambahkan 'commissionsSnap'
    const [settingsSnap, promotionsSnap, commissionsSnap] = await Promise.all([
      getDoc(doc(db, "settings", userId)),
      getDoc(doc(db, "promotions", userId)),
      getDoc(doc(db, "product_commissions", userId)), // BARIS BARU: Ambil data dari koleksi BARU
    ]);

    if (settingsSnap.exists()) {
      const settingsData = settingsSnap.data();
      Object.assign(state.settings, settingsData);
      if (!state.settings.pinProtection) {
        state.settings.pinProtection = { dashboard: true, incomeHistory: true, investmentPage: true };
      }
    }

    if (promotionsSnap.exists()) {
      const promoData = promotionsSnap.data();
      state.promotions.perChannel = promoData.perChannel || {};
      state.promotions.perModel = promoData.perModel || {};
    }

    // BLOK BARU: Proses data komisi yang sudah dimuat
    if (commissionsSnap.exists()) {
        const commsData = commissionsSnap.data();
        state.commissions.perModel = commsData.perModel || {};
    } else {
        // Jika belum ada data komisi, pastikan objeknya ada
        state.commissions.perModel = {};
    }

  } catch (error) {
    console.error("Error fetching core data:", error);
  }
};

// Fungsi khusus untuk data produk, harga, dan alokasi
const fetchProductData = async (userId) => {
  if (dataFetched.products) return; // Jangan fetch ulang jika sudah ada
  console.log("Fetching product data...");
  try {
    const [productsSnap, pricesSnap, allocationsSnap] = await Promise.all([
      getDocs(query(collection(db, "products"), where("userId", "==", userId))),
      getDocs(query(collection(db, 'product_prices'), where("userId", "==", userId))),
      getDocs(query(collection(db, 'stock_allocations'), where("userId", "==", userId))),
    ]);
    
    const pricesData = pricesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const allocationsData = allocationsSnap.docs.map(doc => ({ sku: doc.id, ...doc.data() }));

    state.produk = productsSnap.docs.map(docSnap => {
      const p = { id: docSnap.id, ...docSnap.data() };
      const hargaJual = {};
      const stokAlokasi = {};
      const productAllocation = allocationsData.find(alloc => alloc.sku === p.id);
      (state.settings.marketplaces || []).forEach(mp => {
        const priceInfo = pricesData.find(pr => pr.product_id === p.id && pr.marketplace_id === mp.id);
        hargaJual[mp.id] = priceInfo ? priceInfo.price : 0;
        stokAlokasi[mp.id] = productAllocation ? (productAllocation[mp.id] || 0) : 0;
      });
      return {
        docId: p.id,
        sku: p.sku,
        nama: p.product_name,
        model_id: p.model_id,
        warna: p.color,
        varian: p.variant,
        stokFisik: p.physical_stock,
        hpp: p.hpp,
        hargaJual,
        stokAlokasi,
        userId: p.userId
      };
    });
    dataFetched.products = true;
  } catch (error) {
    console.error("Error fetching product data:", error);
  }
};

// Fungsi khusus untuk data transaksi dan retur
const fetchTransactionData = async (userId) => {
  if (dataFetched.transactions) return;
  console.log("Fetching transaction data...");
  try {
    const [transactionsSnap] = await Promise.all([
        getDocs(query(collection(db, "transactions"), where("userId", "==", userId))),
    ]);
    state.transaksi = transactionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggal: doc.data().tanggal?.toDate() }));
    dataFetched.transactions = true;
  } catch(error) {
    console.error("Error fetching transaction data:", error);
  }
};

const fetchReturnData = async (userId) => {
    if (dataFetched.returns) return;
    console.log("Fetching return data...");
    try {
        const [returnsSnap] = await Promise.all([
            getDocs(query(collection(db, "returns"), where("userId", "==", userId))),
        ]);
        state.retur = returnsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggal: doc.data().tanggal?.toDate() }));
        dataFetched.returns = true;
    } catch(error) {
        console.error("Error fetching return data:", error);
    }
};

// Fungsi khusus untuk data produksi
const fetchProductionData = async (userId) => {
  if (dataFetched.production) return;
  console.log("Fetching production data...");
  try {
    const [productionSnap, fabricSnap] = await Promise.all([
      getDocs(query(collection(db, "production_batches"), where("userId", "==", userId))),
      getDocs(query(collection(db, "fabric_stock"), where("userId", "==", userId))),
    ]);
    state.produksi = productionSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggal: doc.data().tanggal?.toDate() }));
    state.gudangKain = fabricSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggalBeli: doc.data().tanggalBeli?.toDate() }));
    dataFetched.production = true;
  } catch (error) {
    console.error("Error fetching production data:", error);
  }
};

// Fungsi khusus untuk data keuangan dan investor
const fetchFinanceData = async (userId) => {
    if (dataFetched.finance) return;
    console.log("Fetching finance data...");
    try {
        const [keuanganSnap, investorsSnap, bankAccountsSnap, investorPaymentsSnap] = await Promise.all([
            getDocs(query(collection(db, "keuangan"), where("userId", "==", userId))),
            getDocs(query(collection(db, "investors"), where("userId", "==", userId))),
            getDocs(query(collection(db, "bank_accounts"), where("userId", "==", userId))),
            getDocs(query(collection(db, "investor_payments"), where("userId", "==", userId))),
        ]);
        state.keuangan = keuanganSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggal: doc.data().tanggal?.toDate() }));
        state.investor = investorsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), startDate: doc.data().startDate?.toDate() }));
        state.bankAccounts = bankAccountsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        state.investorPayments = investorPaymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), paymentDate: doc.data().paymentDate?.toDate() }));
        dataFetched.finance = true;
    } catch (error) {
        console.error("Error fetching finance data:", error);
    }
};

// Fungsi khusus untuk data supplier dan purchase order
const fetchSupplierData = async (userId) => {
    if (dataFetched.suppliers) return;
    console.log("Fetching supplier data...");
    try {
        const [suppliersSnap, purchaseOrdersSnap] = await Promise.all([
            getDocs(query(collection(db, "suppliers"), where("userId", "==", userId))),
            getDocs(query(collection(db, "purchase_orders"), where("userId", "==", userId))),
        ]);
        state.suppliers = suppliersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        state.purchaseOrders = purchaseOrdersSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggal: doc.data().tanggal?.toDate() }));
        dataFetched.suppliers = true;
    } catch (error) {
        console.error("Error fetching supplier data:", error);
    }
};

// Fungsi khusus untuk catatan voucher
const fetchNotesData = async (userId) => {
    if (dataFetched.notes) return;
    console.log("Fetching notes data...");
    try {
        const [notesSnap] = await Promise.all([
            getDocs(query(collection(db, "voucher_notes"), where("userId", "==", userId))),
        ]);
        state.voucherNotes = notesSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), endDate: doc.data().endDate?.toDate() }));
        dataFetched.notes = true;
    } catch(error) {
        console.error("Error fetching notes data:", error);
    }
};

onMounted(() => {
  onAuthStateChanged(auth, async (user) => {
    isLoading.value = true;
    hasLoadedInitialData.value = false;
    
    // Reset status data yang sudah di-fetch setiap kali auth berubah
    Object.keys(dataFetched).forEach(key => dataFetched[key] = false);

    if (user) {
      const userDocSnap = await getDoc(doc(db, 'users', user.uid));
      const userData = userDocSnap.exists() ? userDocSnap.data() : {};
      currentUser.value = { ...user, userData };
      
      await setupListeners(user.uid);
      loadDataForPage(activePage.value);
      // Pindahkan changePage ke dalam watcher agar data halaman pertama dimuat
      // changePage(localStorage.getItem('lastActivePage') || 'dashboard');
    } else {
      currentUser.value = null;
      activePage.value = 'login';
      unsubscribe();
    }
    isLoading.value = false;
    hasLoadedInitialData.value = true;
  });
});

watch(activePage, (newPage) => {
    localStorage.setItem('lastActivePage', newPage);
    loadDataForPage(newPage);
});

</script>

<template>
    <div v-if="!currentUser && !isLoading" class="relative min-h-screen flex items-center justify-center bg-slate-900 overflow-hidden">
    
    <video autoplay muted loop playsinline class="absolute inset-0 w-full h-full object-cover z-0 opacity-40">
        <source src="/wallpaper.mp4?v=2" type="video/mp4"> 
        Browser Anda tidak mendukung tag video.
    </video>

    <div class="relative z-10 p-8 sm:p-10 bg-white/80 backdrop-blur-md rounded-3xl shadow-2xl w-full max-w-md text-center animate-fade-in-up">
        <h2 class="text-3xl font-bold text-gray-800 mb-2">Selamat Datang di</h2>
        <p class="text-indigo-600 text-xl font-semibold mb-8">{{ state.settings.brandName }}</p>

        <button @click="signInWithGoogle" class="w-full flex items-center justify-center bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold py-3 px-4 rounded-xl shadow-sm transition-all duration-300 transform hover:scale-105 mb-6">
            <img src="https://www.vectorlogo.zone/logos/google/google-icon.svg" alt="Google logo" class="w-6 h-6 mr-3">
            Login dengan Google
        </button>

        <div class="flex items-center my-6">
            <hr class="flex-grow border-gray-300">
            <span class="px-4 text-gray-500 text-sm">Atau</span>
            <hr class="flex-grow border-gray-300">
        </div>

        <form @submit.prevent="activePage === 'login' ? handleLogin() : handleRegister()" class="space-y-5">
            <div>
                <label for="email" class="sr-only">Alamat Email</label>
                <input type="email" id="email" v-model="authForm.email" placeholder="Alamat Email" required
                       class="w-full p-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-gray-800 shadow-sm transition-all duration-200">
            </div>
            <div>
                <label for="password" class="sr-only">Password</label>
                <input type="password" id="password" v-model="authForm.password" placeholder="Password" required
                       class="w-full p-3 border border-gray-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-gray-800 shadow-sm transition-all duration-200">
            </div>
            
            <div v-if="activePage === 'register'">
                <label for="activation-code" class="sr-only">Kode Aktivasi (Opsional)</label>
                <input type="text" v-model="authForm.activationCode" id="activation-code" class="w-full p-3 border border-gray-300 rounded-xl" placeholder="Kode Aktivasi (Opsional)">
            </div>

            <p v-if="authForm.error" class="text-red-600 text-sm pt-1">{{ authForm.error }}</p>

            <button type="submit" class="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition-colors duration-300 transform hover:scale-105 shadow-lg shadow-indigo-600/30">
                <span v-if="activePage === 'login'">Login</span>
                <span v-else>Daftar Akun Baru</span>
            </button>
        </form>

        <div class="mt-6 text-sm">
            <p class="mt-3 text-gray-600">
                <span v-if="activePage === 'login'">Belum Punya Akun?</span>
                <span v-else>Sudah Punya Akun?</span>
                <button @click.prevent="changePage(activePage === 'login' ? 'register' : 'login')" class="text-indigo-600 hover:text-indigo-800 font-semibold transition-colors duration-200">
                    <span v-if="activePage === 'login'">Daftar Sekarang</span>
                    <span v-else>Login</span>
                </button>
            </p>
        </div>
    </div>
</div>
        
  <div v-if="currentUser">
    <div class="flex h-screen bg-slate-100">
      <!-- Sidebar -->
      <aside class="w-64 bg-gray-900 text-gray-300 flex-shrink-0 hidden md:flex md:flex-col">
    <div class="h-16 flex items-center justify-center px-4 border-b border-gray-700/50">
        <h1 class="text-xl font-bold text-white tracking-wider">{{ state.settings.brandName }}</h1>
    </div>
    
    <div class="flex-1 flex flex-col overflow-y-auto">
        <nav class="flex-1 px-2 py-4 space-y-1">
            <a href="#" @click.prevent="changePage('dashboard')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'dashboard' }">
                <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                Dashboard
            </a>
            <a href="#" @click.prevent="changePage('transaksi')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'transaksi' }">
                <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                Kasir (POS)
            </a>
            <a href="#" @click.prevent="changePage('bulk_process')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'bulk_process' }">
                <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Proses Massal
            </a>
            <a href="#" @click.prevent="changePage('inventaris')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'inventaris' }">
                <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4M4 7s0 4 8 4 8-4 8-4"/></svg>
                Inventaris
            </a>
            <a href="#" @click.prevent="changePage('harga-hpp')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'harga-hpp' }">
                <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01"/></svg>
                Harga & HPP
            </a>
            <a href="#" @click.prevent="changePage('promosi')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'promosi' }">
                <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 8v-3c0-1.105.895-2 2-2z"/></svg>
                Promosi
            </a>
            <a href="#" @click.prevent="changePage('produksi')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'produksi' }">
                <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>
                Produksi
            </a>
            <a href="#" @click.prevent="changePage('supplier')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'supplier' }">
    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.412 9.45 5 8 5c-4.418 0-8 2.5-8 5s3.582 5 8 5c1.45 0 2.832-.412 4-1.253M12 6.253c1.168.841 2.55 1.253 4 1.253 4.418 0 8-2.5 8-5s-3.582-5-8-5c-1.45 0-2.832.412-4 1.253" />
    </svg>
    Manajemen Supplier
</a>
            <a href="#" @click.prevent="changePage('gudang-kain')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'gudang-kain' }">
                <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121M12 12l2.879 2.879M12 12L9.121 14.879M12 12L14.879 9.121M12 12L19 5"/></svg>
                Stok Kain
            </a>
            <a href="#" @click.prevent="changePage('keuangan')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'keuangan' }">
                <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                Keuangan
            </a>
            <a href="#" @click.prevent="changePage('retur')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'retur' }">
                <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 15v-1a4 4 0 00-4-4H8m0 0l-3 3m3-3l3 3m0 0v-2a4 4 0 014-4h2"/></svg>
                Manajemen Retur
            </a>
            <a href="#" @click.prevent="changePage('investasi')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'investasi' }">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M17 9.5a.5.5 0 01.5.5v2a.5.5 0 01-.5.5h-2a.5.5 0 01-.5-.5v-2a.5.5 0 01.5-.5h2zM17 14.5a.5.5 0 01.5.5v2a.5.5 0 01-.5.5h-2a.5.5 0 01-.5-.5v-2a.5.5 0 01.5-.5h2zM5 9.5a.5.5 0 01.5.5v2a.5.5 0 01-.5.5h-2a.5.5 0 01-.5-.5v-2a.5.5 0 01.5-.5h2zM5 14.5a.5.5 0 01.5.5v2a.5.5 0 01-.5.5h-2a.5.5 0 01-.5-.5v-2a.5.5 0 01.5-.5h2zM11 9.5a.5.5 0 01.5.5v2a.5.5 0 01-.5.5h-2a.5.5 0 01-.5-.5v-2a.5.5 0 01.5-.5h2zM11 14.5a.5.5 0 01.5.5v2a.5.5 0 01-.5.5h-2a.5.5 0 01-.5-.5v-2a.5.5 0 01.5-.5h2z"/>
                </svg>
                Investasi
            </a>
            <a v-if="currentUser.isPartner" href="#" @click.prevent="changePage('mitra')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'mitra' }">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Dashboard Mitra
            </a>
            <a href="#" @click.prevent="changePage('pengaturan')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'pengaturan' }">
                <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.82 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.82 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.82-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.82-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                Pengaturan
            </a>
        </nav>
        
        <div class="mt-auto p-2">
            <hr class="border-gray-700 mx-2 my-2">
            <a href="#" @click.prevent="changePage('langganan')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'langganan' }">
                <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v1h-14v-1zM14 11h-4a1 1 0 00-1 1v2a1 1 0 001 1h4a1 1 0 001-1v-2a1 1 0 00-1-1zM5 19h14a2 2 0 002-2v-5H3v5a2 2 0 002 2z"/></svg>
                Langganan
            </a>
            <a href="#" @click.prevent="changePage('barcode-generator')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'barcode-generator' }">
    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m-4-12h8M7 16h10" />
    </svg>
    Panduan Barcode
</a>
            <a href="#" @click.prevent="changePage('panduan')" class="sidebar-link text-sm" :class="{ 'sidebar-link-active': activePage === 'panduan' }">
                <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.546-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Panduan Aplikasi
            </a>
            <a href="#" @click.prevent="changePage('tentang')" class="sidebar-link text-sm" :class="{ 'sidebar-link-active': activePage === 'tentang' }">
                <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Tentang Aplikasi
            </a>
            <button @click="handleLogout" class="w-full mt-2 sidebar-link hover:bg-red-500/20 hover:text-red-400">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
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
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">

        <div v-if="state.settings.dashboardPin && isDashboardLocked" class="flex items-center justify-center h-full animate-fade-in">
            <div class="bg-white/70 backdrop-blur-sm p-8 rounded-2xl shadow-xl border text-center max-w-sm w-full">
                 <div class="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-6 mx-auto">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                 </div>
                <h3 class="text-xl font-bold text-slate-800 mb-2">Dashboard Terkunci</h3>
                <p class="text-sm text-slate-600 mb-4">Masukkan PIN keamanan Anda untuk melihat data dashboard.</p>
                <form @submit.prevent="unlockDashboard" class="w-full">
                    <input type="password" v-model="dashboardPinInput" placeholder="••••" class="w-full p-2 border border-slate-300 rounded-md text-center text-lg mb-2">
                    <p v-if="dashboardPinError" class="text-red-500 text-xs mb-2">{{ dashboardPinError }}</p>
                    <button type="submit" class="mt-2 w-full bg-indigo-600 text-white font-bold py-2.5 rounded-lg hover:bg-indigo-700 transition-colors">Buka Dashboard</button>
                </form>
            </div>
        </div>
        
        <div v-else class="max-w-7xl mx-auto">
            <div class="flex flex-wrap justify-between items-center mb-8 gap-4 animate-fade-in-up">
                <div class="flex items-center gap-4">
                    <h2 class="text-3xl font-bold text-slate-800">Dashboard Analitik</h2>
                    <button @click="showModal('dashboardKpiInfo')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
                        Informasi
                    </button>
                </div>
                <div class="flex flex-wrap items-center gap-2 p-3 bg-white/70 backdrop-blur-sm rounded-lg border shadow-sm">
                    <select v-model="uiState.dashboardDateFilter" class="w-full sm:w-auto bg-white border-slate-300 text-sm rounded-lg p-2.5 capitalize">
                        <option value="today">hari ini</option>
                        <option value="last_7_days">7 hari terakhir</option>
                        <option value="last_30_days">30 hari terakhir</option>
                        <option value="this_year">tahun ini</option>
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
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div class="kpi-card bg-white/70 backdrop-blur-sm p-5 rounded-xl border border-slate-200 shadow-xl relative animate-fade-in-up" style="animation-delay: 100ms;">
                    <div class="flex items-start gap-4">
                        <div class="bg-blue-100 text-blue-600 p-3 rounded-lg flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-slate-500">Saldo Kas Saat Ini</h3>
                            <p class="kpi-value text-2xl font-bold mt-1 text-blue-600">{{ formatCurrency(dashboardKpis.saldoKas) }}</p>
                        </div>
                    </div>
                    <button @click="showModal('kpiHelp', kpiExplanations['saldo-kas'])" class="help-icon-button">?</button>
                </div>
                <div class="kpi-card bg-white/70 backdrop-blur-sm p-5 rounded-xl border border-slate-200 shadow-xl relative animate-fade-in-up" style="animation-delay: 200ms;">
                     <div class="flex items-start gap-4">
                        <div class="bg-green-100 text-green-600 p-3 rounded-lg flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-slate-500">Omset Bersih</h3>
                            <p class="kpi-value text-2xl font-bold mt-1 text-green-600">{{ formatCurrency(dashboardKpis.omsetBersih) }}</p>
                        </div>
                    </div>
                    <button @click="showModal('kpiHelp', kpiExplanations['omset-bersih'])" class="help-icon-button">?</button>
                </div>
                <div class="kpi-card bg-white/70 backdrop-blur-sm p-5 rounded-xl border border-slate-200 shadow-xl relative animate-fade-in-up" style="animation-delay: 300ms;">
                    <div class="flex items-start gap-4">
                        <div class="bg-emerald-100 text-emerald-600 p-3 rounded-lg flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-slate-500">Laba Kotor</h3>
                            <p class="kpi-value text-2xl font-bold mt-1 text-emerald-600">{{ formatCurrency(dashboardKpis.labaKotor) }}</p>
                        </div>
                    </div>
                    <button @click="showModal('kpiHelp', kpiExplanations['laba-kotor'])" class="help-icon-button">?</button>
                </div>
                <div class="kpi-card bg-white/70 backdrop-blur-sm p-5 rounded-xl border border-slate-200 shadow-xl relative animate-fade-in-up" style="animation-delay: 400ms;">
                    <div class="flex items-start gap-4">
                        <div class="bg-indigo-100 text-indigo-600 p-3 rounded-lg flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" /></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-slate-500">Laba Bersih</h3>
                            <p class="kpi-value text-2xl font-bold mt-1 text-indigo-600">{{ formatCurrency(dashboardKpis.labaBersihOperasional) }}</p>
                        </div>
                    </div>
                    <button @click="showModal('kpiHelp', kpiExplanations['laba-bersih-operasional'])" class="help-icon-button">?</button>
                </div>
                <div class="kpi-card bg-white/70 backdrop-blur-sm p-5 rounded-xl border border-slate-200 shadow-lg relative animate-fade-in-up" style="animation-delay: 500ms;">
                    <div class="flex items-start gap-4">
                        <div class="bg-blue-100 text-blue-600 p-3 rounded-lg flex-shrink-0">
                           <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zM7 9h14M7 13h14M7 17h14" /></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-slate-500">Omset Kotor</h3>
                            <p class="kpi-value text-2xl font-bold mt-1 text-blue-600">{{ formatCurrency(dashboardKpis.totalOmsetKotor) }}</p>
                        </div>
                    </div>
                    <button @click="showModal('kpiHelp', kpiExplanations['omset-kotor'])" class="help-icon-button">?</button>
                </div>
                <div class="kpi-card bg-white/70 backdrop-blur-sm p-5 rounded-xl border border-slate-200 shadow-lg relative animate-fade-in-up" style="animation-delay: 600ms;">
                    <div class="flex items-start gap-4">
                        <div class="bg-red-100 text-red-600 p-3 rounded-lg flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-slate-500">Diskon</h3>
                            <p class="kpi-value text-2xl font-bold mt-1 text-red-600">-{{ formatCurrency(dashboardKpis.totalDiskon) }}</p>
                        </div>
                    </div>
                    <button @click="showModal('kpiHelp', kpiExplanations['diskon'])" class="help-icon-button">?</button>
                </div>
                <div class="kpi-card bg-white/70 backdrop-blur-sm p-5 rounded-xl border border-slate-200 shadow-lg relative animate-fade-in-up" style="animation-delay: 700ms;">
                    <div class="flex items-start gap-4">
                        <div class="bg-yellow-100 text-yellow-600 p-3 rounded-lg flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12H5m0 0l4-4m-4 4l4 4m6-10h4m0 0l-4-4m4 4l-4 4" /></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-slate-500">Total HPP Terjual</h3>
                            <p class="kpi-value text-2xl font-bold mt-1 text-yellow-600">-{{ formatCurrency(dashboardKpis.totalHppTerjual) }}</p>
                        </div>
                    </div>
                    <button @click="showModal('kpiHelp', kpiExplanations['hpp-terjual'])" class="help-icon-button">?</button>
                </div>
                <div class="kpi-card bg-white/70 backdrop-blur-sm p-5 rounded-xl border border-slate-200 shadow-lg relative animate-fade-in-up" style="animation-delay: 800ms;">
                    <div class="flex items-start gap-4">
                        <div class="bg-purple-100 text-purple-600 p-3 rounded-lg flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-slate-500">Biaya Transaksi</h3>
                            <p class="kpi-value text-2xl font-bold mt-1 text-purple-600">-{{ formatCurrency(dashboardKpis.totalBiayaTransaksi) }}</p>
                        </div>
                    </div>
                    <button @click="showModal('kpiHelp', kpiExplanations['biaya-transaksi'])" class="help-icon-button">?</button>
                </div>
                <div class="kpi-card bg-white/70 backdrop-blur-sm p-5 rounded-xl border border-slate-200 shadow-lg relative animate-fade-in-up" style="animation-delay: 900ms;">
                    <div class="flex items-start gap-4">
                        <div class="bg-orange-100 text-orange-600 p-3 rounded-lg flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zM7 9h14M7 13h14M7 17h14" /></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-slate-500">Biaya Operasional</h3>
                            <p class="kpi-value text-2xl font-bold mt-1 text-orange-600">-{{ formatCurrency(dashboardKpis.totalBiayaOperasional) }}</p>
                        </div>
                    </div>
                    <button @click="showModal('kpiHelp', kpiExplanations['biaya-operasional'])" class="help-icon-button">?</button>
                </div>
                <div class="kpi-card bg-white/70 backdrop-blur-sm p-5 rounded-xl border border-slate-200 shadow-lg relative animate-fade-in-up" style="animation-delay: 1000ms;">
                    <div class="flex items-start gap-4">
                        <div class="bg-cyan-100 text-cyan-600 p-3 rounded-lg flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-slate-500">Total Unit Stok</h3>
                            <p class="kpi-value text-2xl font-bold mt-1 text-cyan-600">{{ formatNumber(dashboardKpis.totalUnitStok) }} pcs</p>
                        </div>
                    </div>
                    <button @click="showModal('kpiHelp', kpiExplanations['total-unit-stok'])" class="help-icon-button">?</button>
                </div>
                <div class="kpi-card bg-white/70 backdrop-blur-sm p-5 rounded-xl border border-slate-200 shadow-lg relative animate-fade-in-up" style="animation-delay: 1100ms;">
                    <div class="flex items-start gap-4">
                        <div class="bg-amber-100 text-amber-600 p-3 rounded-lg flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-slate-500">Total Nilai Stok (HPP)</h3>
                            <p class="kpi-value text-2xl font-bold mt-1 text-amber-600">{{ formatCurrency(dashboardKpis.totalNilaiStokHPP) }}</p>
                        </div>
                    </div>
                    <button @click="showModal('kpiHelp', kpiExplanations['nilai-stok'])" class="help-icon-button">?</button>
                </div>
                <div class="kpi-card bg-white/70 backdrop-blur-sm p-5 rounded-xl border border-slate-200 shadow-lg relative animate-fade-in-up" style="animation-delay: 1200ms;">
                    <div class="flex items-start gap-4">
                        <div class="bg-red-100 text-red-600 p-3 rounded-lg flex-shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 15v-1a4 4 0 00-4-4H8m0 0l-3 3m3-3l3 3m0 0v-2a4 4 0 014-4h2" /></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-slate-500">Total Nilai Retur</h3>
                            <p class="kpi-value text-2xl font-bold mt-1 text-red-600">-{{ formatCurrency(dashboardKpis.totalNilaiRetur) }}</p>
                        </div>
                    </div>
                    <button @click="showModal('kpiHelp', kpiExplanations['nilai-retur'])" class="help-icon-button">?</button>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div class="lg:col-span-3 bg-white/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 1300ms;">
                    <h3 class="text-lg font-semibold text-slate-800 mb-4">Laba Kotor vs Biaya Operasional</h3>
                    <div class="chart-container">
                        <canvas id="profitExpenseChart"></canvas>
                    </div>
                </div>
                <div class="lg:col-span-2 bg-white/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 1400ms;">
                    <h3 class="text-lg font-semibold text-slate-800 mb-4">Penjualan per Channel</h3>
                    <div class="chart-container">
                        <canvas id="salesChannelChart"></canvas>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

    <div v-if="activePage === 'transaksi'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">
        <div class="max-w-7xl mx-auto">

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
                <div class="lg:col-span-2 space-y-8">
                    <div class="animate-fade-in-up">
                        <div class="flex items-center gap-4">
                            <h2 class="text-3xl font-bold text-slate-800">Kasir (Point of Sale)</h2>
                            <button @click="showModal('panduanPOS')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
                                Panduan
                            </button>
                        </div>
                        <p class="text-slate-500 mt-1">Scan atau ketik produk, lalu scan atau ketik ID Resi untuk menyelesaikan transaksi.</p>
                    </div>

                    <div class="relative z-20 bg-white/70 backdrop-blur-sm p-4 rounded-xl border shadow-lg animate-fade-in-up" style="animation-delay: 100ms;">
                        <label class="block text-sm font-medium text-slate-700 mb-1">Scan / Cari di Sini</label>
                        <div class="relative flex items-center gap-2">
                            <form @submit.prevent="handlePosSubmit" class="flex-grow">
                                <input type="text" v-model="uiState.pos_scan_input" @input="handlePosSearch" :disabled="!uiState.activeCartChannel || !!uiState.pos_order_id" :placeholder="uiState.activeCartChannel ? 'Scan/Ketik Produk atau Resi...' : 'Pilih channel dulu...'" :class="{'bg-slate-100 cursor-not-allowed': !!uiState.pos_order_id}" class="w-full p-4 text-lg border-2 border-slate-300 rounded-lg shadow-inner" autocomplete="off">
                                <div v-if="uiState.posSearchRecommendations.length > 0" class="absolute w-full mt-1 bg-white border rounded-lg shadow-lg">
                                    <div v-for="p in uiState.posSearchRecommendations" :key="p.sku" @click="selectPosRecommendation(p)" class="p-3 hover:bg-slate-100 cursor-pointer border-b">
                                        <p class="font-semibold">{{ p.nama }} - {{ p.varian }}</p>
                                        <p class="text-xs text-slate-500">SKU: {{ p.sku }}</p>
                                    </div>
                                </div>
                            </form>
                            <button @click="handlePosSubmit" :disabled="activeCart.length === 0 || !uiState.pos_scan_input || !!uiState.pos_order_id" class="bg-indigo-600 text-white font-bold py-4 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400">
                                Jadikan ID Pesanan
                            </button>
                        </div>
                        <div v-if="uiState.pos_order_id" class="mt-3 p-2 bg-green-50 text-green-800 rounded-md border border-green-200">
                            <span class="text-sm font-semibold">ID Pesanan Tercatat:</span>
                            <span class="font-mono ml-2">{{ uiState.pos_order_id }}</span>
                            <span class="text-xs italic ml-2">(Keranjang terkunci)</span>
                        </div>
                    </div>

                    <div class="bg-white/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 200ms;">
                        <div class="bg-white/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 200ms;">
    <div class="flex flex-wrap justify-between items-center mb-4 pb-4 border-b border-slate-200/80">
        <h3 class="text-xl font-semibold text-slate-800">Riwayat Transaksi</h3>
        <div class="flex items-center gap-2">
            <select v-model="uiState.posDateFilter" class="w-full bg-white border border-slate-300 text-sm rounded-lg p-2.5 shadow-sm capitalize">
                <option value="today">hari ini</option>
                <option value="last_7_days">7 hari terakhir</option>
                <option value="last_30_days">30 hari terakhir</option>
                <option value="this_year">tahun ini</option>
                <option value="by_date_range">rentang tanggal</option>
                <option value="by_month_range">rentang bulan</option>
                <option value="by_year_range">rentang tahun</option>
                <option value="all_time">semua</option>
            </select>
            <select v-model="uiState.posChannelFilter" class="w-full bg-white border border-slate-300 text-sm rounded-lg p-2.5 shadow-sm capitalize">
                <option value="all">Semua Channel</option>
                <option v-for="mp in state.settings.marketplaces" :key="mp.id" :value="mp.id">{{ mp.name }}</option>
            </select>
            <button @click="exportTransactionsToExcel" class="bg-blue-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-blue-700 text-sm h-[42px] flex-shrink-0">Export</button>
        </div>
    </div>
    <div class="mb-4 space-y-2">
        <div v-if="uiState.posDateFilter === 'by_date_range'" class="flex items-center gap-2 animate-fade-in">
            <input type="date" v-model="uiState.posStartDate" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2">
            <span>s/d</span>
            <input type="date" v-model="uiState.posEndDate" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2">
        </div>
        <div v-if="uiState.posDateFilter === 'by_month_range'" class="flex items-center gap-2 animate-fade-in">
            <select v-model.number="uiState.posStartMonth" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2">
                <option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option>
            </select>
            <input type="number" v-model.number="uiState.posStartYear" placeholder="Tahun" class="w-24 border-slate-300 text-sm rounded-lg p-2">
            <span>s/d</span>
            <select v-model.number="uiState.posEndMonth" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2">
                <option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option>
            </select>
            <input type="number" v-model.number="uiState.posEndYear" placeholder="Tahun" class="w-24 border-slate-300 text-sm rounded-lg p-2">
        </div>
        <div v-if="uiState.posDateFilter === 'by_year_range'" class="flex items-center gap-2 animate-fade-in">
            <input type="number" v-model.number="uiState.posStartYear" placeholder="Dari Tahun" class="w-full border-slate-300 text-sm rounded-lg p-2">
            <span>s/d</span>
            <input type="number" v-model.number="uiState.posEndYear" placeholder="Sampai Tahun" class="w-full border-slate-300 text-sm rounded-lg p-2">
        </div>
    </div>
</div>
                        <div class="overflow-x-auto max-h-96">
                            <table class="w-full text-sm text-left text-slate-500">
                                <thead class="text-xs text-slate-700 uppercase bg-slate-100/50 sticky top-0">
                                    <tr>
                                        <th class="px-6 py-3">ID Pesanan</th>
                                        <th class="px-6 py-3">Tanggal</th>
                                        <th class="px-6 py-3">Channel</th>
                                        <th class="px-6 py-3">Total</th>
                                        <th class="px-6 py-3">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-200/50">
                                    <tr v-if="filteredTransaksi.length === 0">
                                        <td colspan="5" class="text-center py-4">Belum ada transaksi pada periode ini.</td>
                                    </tr>
                                    <tr v-for="trx in filteredTransaksi" :key="trx.id" class="hover:bg-slate-50/50">
                                        <td class="px-6 py-4 font-mono text-xs">{{ trx.marketplaceOrderId || trx.id.slice(-6) }}</td>
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

                <div class="lg:col-span-1 bg-white/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-slate-200 lg:sticky lg:top-8 animate-fade-in-up" style="animation-delay: 300ms;">
                    <div class="mb-4">
                        <label class="block text-sm font-medium text-slate-700 mb-1">Pilih Channel Penjualan</label>
                        <select v-model="uiState.activeCartChannel" @change="uiState.pos_order_id = ''; state.carts[uiState.activeCartChannel] = []" class="w-full p-2 border border-slate-300 rounded-md shadow-sm">
                            <option v-for="mp in state.settings.marketplaces" :key="mp.id" :value="mp.id">{{ mp.name }}</option>
                        </select>
                    </div>

                    <div class="text-center mb-4 pb-4 border-b border-slate-200/80">
                        <p class="font-semibold text-slate-700">{{ getMarketplaceById(uiState.activeCartChannel)?.name || 'Pilih Channel' }}</p>
                        <h2 class="text-2xl font-bold text-slate-800">{{ state.settings.brandName }}</h2>
                        <p class="text-sm text-slate-500">{{ new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) }}</p>
                    </div>

                    <h3 class="text-lg font-bold mb-2 text-slate-800">Keranjang</h3>
                    <div class="mb-4 max-h-60 overflow-y-auto pr-2">
                        <p v-if="activeCart.length === 0" class="text-center py-8 text-slate-500">Keranjang kosong</p>
                        <div v-for="item in activeCart" :key="item.sku" class="flex justify-between items-center py-3 border-b border-slate-200/50 animate-fade-in">
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
                    
                    <div class="border-t border-slate-200/80 pt-4 space-y-2 text-sm">
                        <div class="flex justify-between"><span>Subtotal</span><span>{{ formatCurrency(cartSummary.subtotal) }}</span></div>
                        <div v-if="cartSummary.discount.totalDiscount > 0" class="flex justify-between text-green-600">
                            <span>{{ cartSummary.discount.description }}</span>
                            <span>-{{ formatCurrency(cartSummary.discount.totalDiscount) }}</span>
                        </div>
                        <div class="flex justify-between font-bold text-lg pt-2 mt-2"><span>Total Akhir</span><span>{{ formatCurrency(cartSummary.finalTotal) }}</span></div>
                        <div class="flex justify-between text-xs text-slate-500"><span>Jumlah Barang</span><span>{{ cartSummary.itemCount }}</span></div>
                    </div>
                    
                    <button @click="confirmCompleteTransaction" :disabled="activeCart.length === 0 || !isSubscriptionActive" class="mt-6 w-full bg-indigo-600 text-white font-bold py-3 rounded-lg disabled:bg-slate-400 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/30">
    Selesaikan Transaksi
</button>
                </div>
            </div>
        </div>
    </div>
</div>

<div v-if="activePage === 'bulk_process'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">
        <div class="max-w-7xl mx-auto">

            <div class="flex flex-wrap justify-between items-center gap-4 mb-8 animate-fade-in-up">
                <div>
                    <h2 class="text-3xl font-bold text-slate-800">Smart Scan (Proses Super Cepat)</h2>
                    <p class="text-slate-500 mt-1">Proses pesanan bervolume tinggi dengan cepat dan akurat.</p>
                </div>
                <button @click="showModal('panduanBulkProcess')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
                    Panduan
                </button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
                <div class="lg:col-span-1 bg-white/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-slate-200 lg:sticky lg:top-8 animate-fade-in-up" style="animation-delay: 100ms;">
                    <div class="space-y-6">
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-2">1. Pilih Channel Penjualan</label>
                            <select v-model="uiState.activeCartChannel" @change="uiState.bulk_order_queue = []" class="w-full p-2 border border-slate-300 rounded-md shadow-sm">
                                <option :value="null" disabled>-- Pilih Channel --</option>
                                <option v-for="mp in state.settings.marketplaces" :key="mp.id" :value="mp.id">{{ mp.name }}</option>
                            </select>
                        </div>

                        <div class="border-t pt-6">
                            <label class="block text-sm font-semibold text-slate-700 mb-2">2. Input Manual (Tanpa Scanner)</label>
                            <div class="relative">
                                <input type="text" v-model="uiState.bulk_manual_input" @input="handleBulkManualSearch" :disabled="!uiState.activeCartChannel" placeholder="Ketik SKU atau ID Pesanan..." class="w-full p-3 text-lg border-2 border-slate-300 rounded-lg" autocomplete="off">
                                <div v-if="uiState.bulk_recommendations.length > 0" class="absolute w-full mt-1 bg-white border rounded-lg shadow-lg z-10">
                                    <div v-for="p in uiState.bulk_recommendations" :key="p.sku" @click="selectBulkRecommendation(p)" class="p-3 hover:bg-slate-100 cursor-pointer border-b">
                                        <p class="font-semibold text-sm">{{ p.sku }}</p>
                                        <p class="text-xs text-slate-500 mt-1">{{ p.modelNama }} - {{ p.warna }} - {{ p.varian }}</p>
                                    </div>
                                </div>
                            </div>
                            <button @click="finalizeManualOrder" :disabled="!uiState.bulk_order_queue.find(o => o.id.startsWith('TEMP-')) || !uiState.bulk_manual_input || !isSubscriptionActive" class="mt-2 w-full bg-indigo-600 text-white font-bold py-2 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400">
    Jadikan ID Pesanan
</button>
                        </div>

                        <div class="border-t pt-6">
                            <label class="block text-sm font-semibold text-slate-700 mb-2">3. KHUSUS SCANNER (Otomatis)</label>
                            <input type="text" v-model="uiState.bulk_scan_input" :disabled="!uiState.activeCartChannel" placeholder="Scan Produk -> Scan Resi" class="w-full p-3 text-lg border-2 border-dashed border-green-500 rounded-lg">
                        </div>
                    </div>
                </div>

                <div class="lg:col-span-2 bg-white/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 200ms;">
                    <div class="flex justify-between items-center mb-4 pb-4 border-b border-slate-200/80">
                        <h3 class="text-xl font-semibold text-slate-800">Antrian Pesanan untuk Diproses ({{ uiState.bulk_order_queue.length }})</h3>
                        <button @click="processBatchOrders" :disabled="uiState.bulk_order_queue.length === 0 || !isSubscriptionActive" class="bg-green-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-green-700 disabled:bg-slate-400 disabled:shadow-none shadow">
    Proses Semua Antrian
</button>
                    </div>
                    <div class="space-y-3 max-h-[70vh] overflow-y-auto p-2 -mr-2">
                        <p v-if="uiState.bulk_order_queue.length === 0" class="text-center py-16 text-slate-400">
                            Tidak ada pesanan di antrian.
                        </p>
                        <div v-for="(order, index) in uiState.bulk_order_queue" :key="order.id" class="p-4 border rounded-lg animate-fade-in" :class="order.status === 'Mengantri' ? 'bg-white shadow-sm' : 'bg-yellow-50/50 border-yellow-300'">
                            <div class="flex justify-between items-start">
                                <div>
                                    <p class="font-bold" :class="order.status === 'Mengantri' ? 'text-indigo-700' : 'text-yellow-700'">
                                        ID Pesanan: {{ order.marketplaceOrderId }}
                                    </p>
                                </div>
                                <div class="flex gap-2">
                                    <button @click="deleteQueuedOrder(index)" class="text-xs font-semibold text-red-600 hover:underline">Hapus</button>
                                </div>
                            </div>
                            <div class="mt-2 border-t border-slate-200/80 pt-2">
                                <ul class="text-xs space-y-1 text-slate-600">
                                    <li v-for="item in order.items" :key="item.sku">
                                        <strong>{{ item.qty }}x</strong> {{ getProductBySku(item.sku)?.nama }} ({{item.sku}})
                                        <div class="pl-4 text-slate-500">Model: {{ state.settings.modelProduk.find(m => m.id === getProductBySku(item.sku)?.model_id)?.namaModel || 'N/A' }}, Warna: {{ getProductBySku(item.sku)?.warna }}, Ukuran: {{ getProductBySku(item.sku)?.varian }}</div>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

    <div v-if="activePage === 'inventaris'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">
        <div class="max-w-7xl mx-auto">

            <div class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up">
                
                <div class="flex flex-wrap justify-between items-center gap-4 mb-6 pb-6 border-b border-slate-200">
                    <div class="flex items-center gap-4">
    <div>
        <h2 class="text-3xl font-bold text-slate-800">Manajemen Inventaris</h2>
        <p class="text-slate-500 mt-1">Kelola semua produk, varian, dan stok Anda secara terpusat.</p>
    </div>
    <button @click="showModal('inventarisInfo')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2 flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
        Informasi
    </button>
</div>
                    <div class="flex flex-wrap items-center gap-3">
                        <button @click="showModal('addStockIn', { sku: '', qty: null, tipe: 'penambahan', alasan: 'Penyesuaian Inventaris' })" class="bg-yellow-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-yellow-600 transition-colors shadow" :disabled="!isSubscriptionActive">
    Penyesuaian Stok
</button>
                        <button @click="showModal('addProduct', { sku: '', nama: '', warna: '', varian: '', hpp: null, hargaJualDefault: null })" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors shadow" :disabled="!isSubscriptionActive">+ Tambah Produk Baru</button>
                    </div>
                </div>

                <div class="mb-6 p-4 bg-slate-50/50 rounded-xl border">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Cari Nama Produk</label>
                            <input type="text" v-model="uiState.inventorySearch" placeholder="Ketik nama produk..." class="w-full p-2 border border-slate-300 rounded-md shadow-sm">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Filter Status Stok</label>
                            <select v-model="uiState.inventoryFilterStock" class="w-full p-2 border border-slate-300 rounded-md shadow-sm">
                                <option value="all">Semua Status</option>
                                <option value="aman">Stok Aman</option>
                                <option value="menipis">Stok Menipis</option>
                                <option value="habis">Stok Habis</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-slate-700 mb-1">Urutkan Berdasarkan</label>
                            <select v-model="uiState.inventorySort" class="w-full p-2 border border-slate-300 rounded-md shadow-sm">
                                <option value="nama-asc">Nama Produk (A-Z)</option>
                                <option value="nama-desc">Nama Produk (Z-A)</option>
                                <option value="stok-desc">Stok Terbanyak</option>
                                <option value="stok-asc">Stok Terendah</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left">
    <thead class="text-xs text-slate-700 uppercase bg-slate-100/50">
        <tr>
            <th class="px-6 py-3 font-semibold">Nama Model</th>
            <th class="px-6 py-3 font-semibold">SKU</th>
            <th class="px-6 py-3 font-semibold">Warna</th>
            <th class="px-6 py-3 font-semibold">Ukuran</th>
            <th class="px-6 py-3 font-semibold text-center">Stok</th>
            <th class="px-6 py-3 font-semibold text-right">Nilai Stok (HPP)</th>
            <th class="px-6 py-3 font-semibold text-center">Aksi</th>
        </tr>
    </thead>
    <tbody>
        <tr v-if="inventoryProductGroups.length === 0">
            <td colspan="7" class="text-center py-12 text-slate-500">Produk tidak ditemukan.</td>
        </tr>
        <template v-for="group in inventoryProductGroups" :key="group.namaModel">
            <tr class="bg-slate-50/50 border-b border-t border-slate-200/80 cursor-pointer hover:bg-slate-100/70" @click="uiState.activeAccordion = uiState.activeAccordion === group.namaModel ? null : group.namaModel">
                <td class="px-6 py-4 font-bold text-slate-800">
                    <div class="flex items-center">
                        <svg class="w-4 h-4 mr-2 transition-transform duration-300" :class="{ 'rotate-90': uiState.activeAccordion === group.namaModel }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                        <div>
                            {{ group.namaModel }}
                            <span class="block text-xs font-normal text-slate-500">{{ group.variants.length }} varian</span>
                        </div>
                    </div>
                </td>
                <td colspan="3"></td>
                <td class="px-6 py-3 text-center">
                    <span class="font-bold text-base text-slate-800">{{ formatNumber(group.totalStock) }}</span>
                    <span class="text-xs"> pcs</span>
                </td>
                <td class="px-6 py-3 text-right font-bold text-base text-slate-800">{{ formatCurrency(group.totalNilaiStok) }}</td>
                <td class="px-6 py-3 text-center">
                    <button @click.stop="deleteGroup(group.variants)" class="p-2 text-red-400 hover:text-red-700" title="Hapus Grup Produk & Semua Variannya" :disabled="!isSubscriptionActive">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </td>
            </tr>

            <template v-if="uiState.activeAccordion === group.namaModel">
                <tr v-for="v in group.variants" :key="v.docId" class="border-b border-slate-200/50 hover:bg-slate-100/70 animate-fade-in">
                    <td class="px-6 py-3 pl-12 text-slate-600">{{ v.nama }}</td>
                    <td class="px-6 py-3 font-mono text-xs">{{ v.sku }}</td>
                    <td class="px-6 py-3 text-slate-600">{{ v.warna }}</td>
                    <td class="px-6 py-3 text-slate-600">{{ v.varian }}</td>
                    <td class="px-6 py-3 text-center">
                        <span class="stock-badge" :class="{
                            'stock-safe': v.stokFisik > state.settings.minStok,
                            'stock-low': v.stokFisik > 0 && v.stokFisik <= state.settings.minStok,
                            'stock-empty': v.stokFisik === 0
                        }">
                            {{ formatNumber(v.stokFisik) }} pcs
                        </span>
                    </td>
                    <td class="px-6 py-3 text-right text-slate-600">{{ formatCurrency(v.stokFisik * (v.hpp || 0)) }}</td>
                    <td class="px-6 py-3 text-center space-x-3 whitespace-nowrap text-xs">
                        <button @click.stop="removeProductVariant(v.docId)" class="font-semibold text-red-500 hover:underline" :disabled="!isSubscriptionActive">Hapus</button>
                        <button @click.stop="showModal('kelolaStok', { product: JSON.parse(JSON.stringify(v)), original: v })" class="font-semibold text-blue-500 hover:underline">Kelola Stok</button>
                        <button @click.stop="goToAturHarga(v.nama)" class="font-semibold text-green-500 hover:underline">Atur Harga</button>
                    </td>
                </tr>
            </template>
        </template>
    </tbody>
</table>
                </div>
            </div>

        </div>
    </div>
</div>

    <div v-if="activePage === 'harga-hpp'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">
        <div class="max-w-7xl mx-auto">
            
            <div class="flex flex-wrap justify-between items-center gap-4 mb-8 animate-fade-in-up">
                <div>
                    <h2 class="text-3xl font-bold text-slate-800">Pengaturan Harga, HPP & Komisi</h2>
                    <p class="text-slate-500 mt-1">Atur profitabilitas untuk setiap varian produk di semua channel penjualan.</p>
                </div>
                <div class="flex gap-3">
                    <button @click="showModal('priceCalculator')" class="bg-white border border-slate-300 text-slate-700 font-bold py-2.5 px-5 rounded-lg hover:bg-slate-100 shadow-sm transition-colors" :disabled="!isSubscriptionActive">
                        Kalkulator Harga
                    </button>
                    <button @click="saveData" :disabled="isSaving || !isSubscriptionActive" class="bg-green-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-green-700 transition-colors shadow disabled:bg-green-400 disabled:shadow-none">
                        <span v-if="isSaving">Menyimpan...</span>
                        <span v-else>Simpan Semua Perubahan</span>
                    </button>
                </div>
            </div>

            <div class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 100ms;">
                
                <h3 class="text-xl font-semibold text-slate-800 border-b border-slate-200/80 pb-3 mb-4">Daftar Produk</h3>

                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left">
                        <thead class="text-xs text-slate-700 uppercase bg-slate-100/50">
                            <tr>
                                <th class="px-6 py-3 font-semibold">Nama Model</th>
                                <th class="px-6 py-3 font-semibold">SKU</th>
                                <th class="px-6 py-3 font-semibold">Warna</th>
                                <th class="px-6 py-3 font-semibold">Ukuran</th>
                                <th class="px-6 py-3 font-semibold text-center" style="width: 250px;">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="inventoryProductGroups.length === 0">
                                <td colspan="5" class="text-center py-12 text-slate-500">Produk tidak ditemukan.</td>
                            </tr>
                            
                            <template v-for="group in inventoryProductGroups" :key="group.namaModel">
                                <tr 
                                    class="bg-slate-50/50 border-b border-t border-slate-200/80 cursor-pointer hover:bg-slate-100/70" 
                                    @click="uiState.activeAccordion = uiState.activeAccordion === group.namaModel ? null : group.namaModel"
                                >
                                    <td class="px-6 py-4 font-bold text-slate-800">
                                        <div class="flex items-center">
                                            <svg class="w-4 h-4 mr-2 transition-transform duration-300" :class="{ 'rotate-90': uiState.activeAccordion === group.namaModel }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                                            <div>
                                                {{ group.namaModel }}
                                                <span class="block text-xs font-normal text-slate-500">{{ group.variants.length }} varian</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td colspan="3"></td>
                                    <td class="px-6 py-3 text-center">
                                        <button 
                                            @click.stop="uiState.activeAccordion = (uiState.activeAccordion === `komisi-${group.namaModel}` ? null : `komisi-${group.namaModel}`)"
                                            class="font-semibold text-blue-600 hover:underline px-2 py-1 rounded-md bg-blue-50"
                                            :class="{'bg-blue-200': uiState.activeAccordion === `komisi-${group.namaModel}`}"
                                        >
                                            Atur Komisi
                                        </button>
                                    </td>
                                </tr>

                                <tr v-if="uiState.activeAccordion === `komisi-${group.namaModel}`" class="animate-fade-in">
                                    <td colspan="5" class="p-6 bg-blue-50/50 border-b-2 border-blue-400/50">
                                        <div class="space-y-3">
                                            <h4 class="text-sm font-bold text-slate-700">Pengaturan Komisi Mitra untuk Model: {{ group.namaModel }}</h4>
                                            <p class="text-xs text-slate-500">Komisi ini akan diterapkan ke **semua varian** dalam model ini dan dibayarkan kepada mitra yang mereferensikan pengguna yang membeli produk ini.</p>
                                            <div class="space-y-2">
                                                <div v-for="marketplace in state.settings.marketplaces" :key="marketplace.id" class="flex items-center justify-between">
                                                    <label class="text-sm font-medium text-slate-600">{{ marketplace.name }}</label>
                                                    <div class="relative w-32">
                                                        <input 
    type="text" 
    v-model="commissionModelComputed(group.namaModel, marketplace.id).value"
    @input="markProductAsEdited(group.variants[0].docId)" 
    class="w-full p-1.5 pr-7 border border-slate-300 rounded-md text-right text-sm font-semibold" 
    placeholder="0"
>
                                                        <span class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="mt-4 flex justify-end">
                                            <button @click.stop="saveCommissionSettings()" 
    type="button" 
    class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-400"
    :disabled="isSaving || !isSubscriptionActive"
>
    <span v-if="isSaving">Menyimpan Komisi...</span>
    <span v-else>Simpan & Tutup</span>
</button>
                                        </div>
                                    </td>
                                </tr>
                                
                                <template v-if="uiState.activeAccordion === group.namaModel || group.variants.some(v => uiState.activeAccordion === `harga-${v.sku}`)">
                                    
                                    <template v-for="v in group.variants" :key="v.docId">
                                        
                                        <tr 
                                            class="border-b border-slate-200/50 hover:bg-slate-100/70 animate-fade-in"
                                            :class="{ 'bg-slate-100': uiState.activeAccordion === `harga-${v.sku}` }"
                                        >
                                            <td class="px-6 py-3 pl-12 text-slate-600">{{ v.nama }}</td>
                                            <td class="px-6 py-3 font-mono text-xs">{{ v.sku }}</td>
                                            <td class="px-6 py-3 text-slate-600">{{ v.warna }}</td>
                                            <td class="px-6 py-3 text-slate-600">{{ v.varian }}</td>
                                            <td class="px-6 py-3 text-center space-x-3 whitespace-nowrap text-xs">
                                                
                                                <button 
                                                    @click.stop="uiState.activeAccordion = (uiState.activeAccordion === `harga-${v.sku}` ? group.namaModel : `harga-${v.sku}`)"
                                                    class="font-semibold text-indigo-600 hover:underline px-2 py-1 rounded-md bg-indigo-50"
                                                >
                                                    Atur Harga
                                                </button>
                                                
                                                <button 
                                                    @click.stop="removeProductVariant(v.docId)" 
                                                    class="font-semibold text-red-500 hover:underline px-2 py-1 rounded-md bg-red-50" 
                                                    :disabled="!isSubscriptionActive"
                                                >
                                                    Hapus
                                                </button>
                                                
                                            </td>
                                        </tr>

                                        <tr v-if="uiState.activeAccordion === `harga-${v.sku}`" class="animate-fade-in">
                                            <td colspan="5" class="p-6 bg-indigo-50/50 border-b-2 border-indigo-400/50">
                                                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                    
                                                    <div>
                                                        <h4 class="text-sm font-bold text-slate-700 mb-2">HPP (Harga Pokok Produksi)</h4>
                                                        <div class="relative mt-1">
                                                            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">Rp</span>
                                                            <input 
    type="text" 
    :value="formatInputNumber(v.hpp)" 
    @input="v.hpp = parseInputNumber($event.target.value); markProductAsEdited(v.docId)" 
    class="w-full p-2 pl-8 pr-3 border border-slate-300 rounded-md text-right font-bold text-red-600"
>
                                                        </div>
                                                    </div>
                                                    
                                                    <div class="md:col-span-2 space-y-3">
                                                        <h4 class="text-sm font-bold text-slate-700 mb-2">Harga Jual per Channel</h4>
                                                        <div v-for="marketplace in state.settings.marketplaces" :key="marketplace.id" class="flex justify-between items-center">
                                                            <label class="text-sm text-slate-600">{{ marketplace.name }}</label>
                                                            <div class="flex items-center gap-2">
                                                                <span class="text-xs font-bold px-2 py-0.5 rounded-full w-20 text-center"
                                                                    :class="{
                                                                        'bg-green-100 text-green-800': ((v.hargaJual[marketplace.id] - v.hpp) / v.hargaJual[marketplace.id] * 100) >= 40,
                                                                        'bg-yellow-100 text-yellow-800': ((v.hargaJual[marketplace.id] - v.hpp) / v.hargaJual[marketplace.id] * 100) >= 20 && ((v.hargaJual[marketplace.id] - v.hpp) / v.hargaJual[marketplace.id] * 100) < 40,
                                                                        'bg-red-100 text-red-800': ((v.hargaJual[marketplace.id] - v.hpp) / v.hargaJual[marketplace.id] * 100) < 20
                                                                    }">
                                                                    {{ (v.hargaJual[marketplace.id] && v.hpp && v.hargaJual[marketplace.id] > 0 ? (((v.hargaJual[marketplace.id] - v.hpp) / v.hargaJual[marketplace.id]) * 100) : 0).toFixed(1) }}% Margin
                                                                </span>
                                                                <div class="relative w-36">
                                                                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">Rp</span>
                                                                    <input 
    type="text" 
    :value="formatInputNumber(v.hargaJual[marketplace.id])" 
    @input="v.hargaJual[marketplace.id] = parseInputNumber($event.target.value); markProductAsEdited(v.docId)" 
    class="w-full p-2 pl-8 pr-3 border border-slate-300 rounded-md text-right font-semibold"
>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div class="mt-4 flex justify-end">
                                                    <button @click.stop="saveData().then(() => uiState.activeAccordion = group.namaModel)" type="button" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-400">
                                                        <span v-if="isSaving">Menyimpan Harga...</span>
                                                        <span v-else>Simpan & Tutup</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        
                                    </template>
                                </template>

                                <tr v-if="uiState.activeAccordion === `komisi-${group.namaModel}`"></tr>
                            </template>
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    </div>
</div>

    <div v-if="activePage === 'promosi'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">
        <div class="max-w-7xl mx-auto">
            <div class="flex flex-wrap justify-between items-center gap-4 mb-8 animate-fade-in-up">
                <div class="flex items-center gap-4">
    <div>
        <h2 class="text-3xl font-bold text-slate-800">Manajemen Promosi & Voucher</h2>
        <p class="text-slate-500 mt-1">Atur semua diskon dan voucher untuk setiap model produk.</p>
    </div>
    <button @click="showModal('panduanPromosi')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
        Informasi
    </button>
</div>
                <div class="flex gap-3">
    <button @click="showModal('voucherUmum')" class="bg-purple-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-purple-700 transition-colors shadow">
        Atur Voucher Umum
    </button>
    <button @click="showNotesModal" class="bg-indigo-100 text-indigo-700 font-bold py-2.5 px-5 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fill-rule="evenodd" d="M4 5a2 2 0 012-2h-2a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2h-2a1 1 0 01-1-1V2a1 1 0 10-2 0v1H9a1 1 0 00-1 1v1H6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" clip-rule="evenodd" /></svg>
        Catatan
    </button>
</div>
            </div>

            <div class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 100ms;">
                <h3 class="text-xl font-semibold text-slate-800 border-b border-slate-200/80 pb-3 mb-4">Daftar Model Produk</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left">
                        <thead class="text-xs text-slate-700 uppercase bg-slate-100/50">
                            <tr>
                                <th class="px-6 py-3 font-semibold">Nama Model</th>
                                <th class="px-6 py-3 font-semibold">Varian</th>
                                <th class="px-6 py-3 font-semibold text-center" style="width: 250px;">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="inventoryProductGroups.length === 0">
                                <td colspan="3" class="text-center py-12 text-slate-500">Produk tidak ditemukan.</td>
                            </tr>
                            <template v-for="group in inventoryProductGroups" :key="group.namaModel">
                                <tr class="bg-slate-50/50 border-b border-t border-slate-200/80 cursor-pointer hover:bg-slate-100/70" @click="uiState.activeAccordion = uiState.activeAccordion === group.namaModel ? null : group.namaModel">
                                    <td class="px-6 py-4 font-bold text-slate-800">
                                        <div class="flex items-center">
                                            <svg class="w-4 h-4 mr-2 transition-transform duration-300" :class="{ 'rotate-90': uiState.activeAccordion === group.namaModel || uiState.activeAccordion === 'voucher-spesifik-' + group.namaModel }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                                            <div>
                                                {{ group.namaModel }}
                                                <span class="block text-xs font-normal text-slate-500">{{ group.variants.length }} varian</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td></td>
                                    <td class="px-6 py-3 text-center">
                                        <button @click.stop="uiState.activeAccordion = (uiState.activeAccordion === 'voucher-spesifik-' + group.namaModel ? group.namaModel : 'voucher-spesifik-' + group.namaModel)" class="font-semibold text-blue-600 hover:underline px-2 py-1 rounded-md bg-blue-50">
                                            Atur Voucher Spesifik
                                        </button>
                                    </td>
                                </tr>
                                <tr v-if="uiState.activeAccordion === 'voucher-spesifik-' + group.namaModel" class="animate-fade-in">
    <td colspan="3" class="p-4 bg-blue-50/50 border-b-2 border-blue-200">
        <div class="space-y-4">
            <h4 class="text-sm font-bold text-slate-700">Pengaturan Voucher Spesifik untuk Model: {{ group.namaModel }}</h4>
            <p class="text-xs text-slate-500 -mt-3">Diskon ini akan berlaku untuk semua varian di dalam model {{ group.namaModel }}.</p>
            <div v-for="channel in state.settings.marketplaces" :key="channel.id" class="p-3 border border-slate-200 rounded-lg bg-white shadow-sm">
    <p class="font-semibold text-slate-700 mb-3">{{ channel.name }}</p>
    <div class="mt-3">
        <label class="block text-xs font-medium text-slate-600">Voucher Produk Tertentu</label>
        <div class="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500 font-semibold">
           <span class="pl-1">Min. Belanja (Rp)</span>
           <span class="pl-1">Diskon (%)</span>
           <span class="pl-1">Diskon (Rp)</span>
        </div>
        <div class="grid grid-cols-3 gap-2">
            <input type="text" v-model="diskonMinBelanjaComputed(group.namaModel, channel.id).value" class="w-full p-1.5 text-sm border border-slate-300 rounded-md">
            <input type="text" v-model="diskonRateComputedUpdated(group.namaModel, channel.id).value" class="w-full p-1.5 text-sm border border-slate-300 rounded-md">
            <input type="text" v-model="diskonNominalComputed(group.namaModel, channel.id).value" class="w-full p-1.5 text-sm border border-slate-300 rounded-md">
        </div>
    </div>
    <div class="mt-3">
        <label class="block text-xs font-medium text-slate-600">Diskon Minimal Belanja Bertingkat</label>
        <div class="mt-2 grid grid-cols-[1fr,1fr,1fr,auto] gap-2 text-xs text-slate-500 font-semibold">
            <span class="pl-1">Min. Belanja (Rp)</span>
            <span class="pl-1">Diskon (%)</span>
            <span class="pl-1">Diskon (Rp)</span>
        </div>
        <div class="space-y-2">
           <div v-for="(tier, index) in state.promotions.perModel[group.namaModel]?.[channel.id]?.diskonBertingkat" :key="index" class="grid grid-cols-[1fr,1fr,1fr,auto] items-center gap-2">
                <input type="text" v-model="tieredMinComputed(tier).value" class="w-full p-1.5 text-sm border border-slate-300 rounded-md">
                <input type="text" v-model="tieredDiskonComputedUpdated(tier).value" class="w-full p-1.5 text-sm border border-slate-300 rounded-md">
                <input type="text" v-model="tieredDiskonNominalComputed(tier).value" class="w-full p-1.5 text-sm border border-slate-300 rounded-md">
                <button @click="removePromotionTier(group.namaModel, channel.id, index)" type="button" class="text-red-500 hover:text-red-700 text-xl font-bold">×</button>
            </div>
        </div>
        <button @click="addPromotionTier(group.namaModel, channel.id)" type="button" class="mt-2 text-xs text-blue-600 hover:underline">+ Tambah Tingkatan</button>
    </div>
    <div class="flex justify-end mt-4 pt-3 border-t">
         <button @click="saveModelPromotions(group.namaModel, channel.id)" :disabled="isSaving" class="bg-green-600 text-white font-bold text-xs py-1 px-3 rounded-md hover:bg-green-700 disabled:bg-green-300">
            Simpan Perubahan {{channel.name}}
        </button>
    </div>
</div>
        </div>
    </td>
</tr>
                                <template v-if="uiState.activeAccordion === group.namaModel">
                                    <tr v-for="v in group.variants" :key="v.docId" class="border-b border-slate-200/50 hover:bg-slate-100/70 animate-fade-in">
                                        <td class="px-6 py-3 pl-12 text-slate-600">{{ v.nama }}</td>
                                        <td class="px-6 py-3 text-slate-600">{{ v.varian }}</td>
                                        <td class="px-6 py-3"></td>
                                    </tr>
                                </template>
                            </template>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>

<div v-if="activePage === 'produksi'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">
        <div class="max-w-7xl mx-auto">

            <div class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up">
                
                <div class="flex flex-wrap justify-between items-center gap-4 mb-6 pb-6 border-b border-slate-200">
                    <div class="flex items-center gap-4">
    <div>
        <h2 class="text-3xl font-bold text-slate-800">Manajemen Produksi</h2>
        <p class="text-slate-500 mt-1">Lacak semua batch produksi, mulai dari bahan baku hingga produk jadi.</p>
    </div>
    <button @click="showModal('produksiInfo')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2 flex-shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
        Informasi
    </button>
</div>
                    <button @click="showModal('addProduksi')" class="bg-indigo-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-indigo-700 shadow transition-colors" :disabled="!isSubscriptionActive">
    + Buat Batch Produksi
</button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div class="bg-slate-50/50 p-4 rounded-xl border">
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Laporan & Analisis</label>
                        <div class="flex flex-wrap gap-2">
                            <button @click="showModal('analisisModel')" class="flex-1 text-sm bg-white border border-slate-300 text-slate-700 font-bold py-2 px-3 rounded-lg hover:bg-slate-100">Analisis Model</button>
                            <button @click="showModal('ringkasanJadi')" class="flex-1 text-sm bg-white border border-slate-300 text-slate-700 font-bold py-2 px-3 rounded-lg hover:bg-slate-100">Ringkasan Jadi</button>
                            <button @click="showModal('laporanStatus')" class="flex-1 text-sm bg-white border border-slate-300 text-slate-700 font-bold py-2 px-3 rounded-lg hover:bg-slate-100">Laporan per Status</button>
                            <button @click="showModal('laporanSemuanya')" class="flex-1 text-sm bg-emerald-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-emerald-700">Laporan Semuanya</button>
                        </div>
                    </div>
                    <div class="bg-slate-50/50 p-4 rounded-xl border">
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Filter & Pencarian batch produksi / kode aktual</label>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input v-model="uiState.produksiSearch" type="text" placeholder="Cari..." class="w-full p-2 border border-slate-300 rounded-md shadow-sm">
                            <select v-model="uiState.produksiFilterType" class="w-full p-2 border border-slate-300 rounded-md shadow-sm">
                                <option value="all">Semua Jenis</option>
                                <option value="pemaklun">Pemaklun</option>
                                <option value="penjahit">Penjahit</option>
                            </select>
                            <select v-model="uiState.produksiFilterStatus" class="w-full p-2 border border-slate-300 rounded-md shadow-sm">
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
                    <p v-if="filteredProduksiBatches.length === 0" class="md:col-span-2 lg:col-span-3 text-center py-16 text-slate-500">
                        Batch produksi tidak ditemukan.
                    </p>
                    <div v-for="(batch, index) in filteredProduksiBatches" :key="batch.id" 
                         class="bg-white/80 border border-slate-200 rounded-2xl shadow-lg flex flex-col transform hover:-translate-y-1 transition-all duration-300 animate-fade-in-up"
                         :style="{ animationDelay: `${index * 50}ms` }">
                        <div class="p-5 flex-grow">
                            <div class="flex justify-between items-start">
                                <div>
                                    <p class="font-bold text-lg text-slate-800">
                                        {{ batch.produksiType === 'penjahit' ? 'Penjahit' : 'Pemaklun' }}: {{ batch.namaStatus }}
                                    </p>
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
                            <div class="mt-4 pt-4 border-t border-slate-200/80 space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span class="text-slate-500">Tgl. Produksi:</span>
                                    <span class="font-medium">{{ new Date(batch.tanggal).toLocaleDateString('id-ID') }}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-slate-500">Total Kuantitas Jadi:</span>
                                    <span class="font-medium">{{ batch.totalQty || 0 }} pcs</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-slate-500">Total Biaya Material:</span>
                                    <span class="font-medium">{{ formatCurrency(batch.totalBiayaMaterial) }}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-slate-500">Total Biaya Jasa:</span>
                                    <span class="font-medium text-indigo-600">{{ formatCurrency(
                                        (batch.kainBahan || []).reduce((sum, item) => sum + (item.aktualJadi || 0) * (batch.produksiType === 'penjahit' ? (item.hargaJahitPerPcs || 0) : (item.hargaMaklunPerPcs || 0)), 0)
                                    ) }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="p-3 bg-slate-50/50 border-t border-slate-200/80 rounded-b-2xl flex gap-2">
                            <button @click="showModal('produksiDetail', batch)" class="flex-1 text-sm bg-white border border-slate-300 text-slate-700 font-bold py-2 px-3 rounded-lg hover:bg-slate-100">Detail</button>
                            <button @click="showModal('editProduksi', batch)" class="flex-1 text-sm bg-white border border-slate-300 text-slate-700 font-bold py-2 px-3 rounded-lg hover:bg-slate-100" :disabled="!isSubscriptionActive">Edit</button>
                            <button @click="deleteProduksiBatch(batch.id)" class="flex-1 text-sm bg-red-500 text-white font-bold py-2 px-3 rounded-lg hover:bg-red-600" :disabled="!isSubscriptionActive">Hapus</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<div v-if="activePage === 'gudang-kain'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">
        <div class="max-w-7xl mx-auto">

            <div class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up">
                
                <div class="flex flex-wrap justify-between items-center gap-4 mb-6 pb-6 border-b border-slate-200">
                    <div>
                        <h2 class="text-3xl font-bold text-slate-800">Manajemen Gudang Kain</h2>
                        <p class="text-slate-500 mt-1">Kelola semua aset bahan baku kain untuk produksi Anda.</p>
                    </div>
                    <button @click="showModal('addKain', { tanggalBeli: new Date().toISOString().split('T')[0] })" class="bg-indigo-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-indigo-700 shadow transition-colors" :disabled="!isSubscriptionActive">
    + Tambah Stok Kain Baru
</button>
                </div>

                <div class="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Cari (Nama Kain, Warna, Toko)</label>
                        <input type="text" v-model="uiState.gudangKainSearch" placeholder="Ketik untuk mencari..." class="w-full p-2 border border-slate-300 rounded-md shadow-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Urutkan Berdasarkan</label>
                        <select v-model="uiState.gudangKainSort" class="w-full p-2 border border-slate-300 rounded-md shadow-sm">
                            <option value="tanggal-desc">Tanggal Beli (Terbaru)</option>
                            <option value="tanggal-asc">Tanggal Beli (Terlama)</option>
                            <option value="nama-asc">Nama Kain (A-Z)</option>
                            <option value="nama-desc">Nama Kain (Z-A)</option>
                            <option value="stok-desc">Sisa Yard (Terbanyak)</option>
                            <option value="stok-asc">Sisa Yard (Tersedikit)</option>
                        </select>
                    </div>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left text-slate-500">
                        <thead class="text-xs text-slate-700 uppercase bg-slate-100/50">
                            <tr>
                                <th class="px-6 py-3">Tanggal Beli</th>
                                <th class="px-6 py-3">Nama Kain</th>
                                <th class="px-6 py-3">Toko</th>
                                <th class="px-6 py-3 text-center">Sisa Stok</th>
                                <th class="px-6 py-3 text-right">Harga/Yard</th>
                                <th class="px-6 py-3 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200/50">
                            <tr v-if="filteredGudangKain.length === 0">
                                <td colspan="6" class="p-10 text-center text-slate-500">Tidak ada data kain yang cocok dengan filter.</td>
                            </tr>
                            <tr v-for="kain in filteredGudangKain" :key="kain.id" class="hover:bg-slate-50/50">
                                <td class="px-6 py-4 whitespace-nowrap">{{ new Date(kain.tanggalBeli).toLocaleDateString('id-ID') }}</td>
                                <td class="px-6 py-4">
                                    <p class="font-semibold text-slate-800">{{ kain.namaKain }}</p>
                                    <p class="text-xs text-slate-500">{{ kain.warna }}</p>
                                </td>
                                <td class="px-6 py-4">{{ kain.toko || '-' }}</td>
                                <td class="px-6 py-4 text-center">
                                    <span class="text-xs font-bold px-3 py-1 rounded-full"
                                          :class="{
                                            'bg-green-100 text-green-800': kain.sisaYard >= 50,
                                            'bg-yellow-100 text-yellow-800': kain.sisaYard < 50 && kain.sisaYard > 10,
                                            'bg-red-100 text-red-800': kain.sisaYard <= 10
                                          }">
                                        {{ kain.sisaYard }} Yard
                                    </span>
                                </td>
                                <td class="px-6 py-4 text-right font-medium text-green-600">{{ formatCurrency(kain.hargaBeliPerYard) }}</td>
                                <td class="px-6 py-4 text-center space-x-3">
                                    <button @click="showModal('editKain', { ...kain, tanggalBeli: new Date(kain.tanggalBeli).toISOString().split('T')[0] })" class="text-xs bg-slate-100 font-bold py-1 px-2 rounded hover:bg-slate-200" :disabled="!isSubscriptionActive">Edit</button>
                                    <button @click="deleteKain(kain.id)" class="text-xs text-red-500 hover:underline" :disabled="!isSubscriptionActive">Hapus</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>

<div v-if="activePage === 'keuangan'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">
        <div class="max-w-7xl mx-auto">

            <div class="mb-8 animate-fade-in-up">
                <div class="flex items-center gap-4">
                    <h2 class="text-3xl font-bold text-slate-800">Manajemen Keuangan</h2>
                    <button @click="uiState.isKeuanganInfoVisible = true" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
                        Informasi
                    </button>
                </div>
                <p class="text-slate-500 mt-1">Catat dan lacak semua arus kas operasional bisnis Anda di luar transaksi penjualan.</p>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                
                <div class="bg-white/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 100ms;">
                    <div class="flex justify-between items-center mb-4 pb-4 border-b border-slate-200/80">
                        <h3 class="text-xl font-semibold text-slate-800">Riwayat Pengeluaran</h3>
                        <button @click="showModal('addBiaya', { tanggal: new Date().toISOString().split('T')[0], kategori: '', jumlah: null, catatan: '', paymentMethod: 'transfer', selectedBankAccountId: null, adminFee: 0 })" class="bg-rose-500 text-white font-bold py-1.5 px-3 rounded-md hover:bg-rose-600 text-sm shadow" :disabled="!isSubscriptionActive">Tambah Baru</button>
                    </div>
                    <div class="p-4 border-b border-slate-200/80 mb-4">
                        <div class="flex items-start gap-2">
                            <div class="flex-grow">
                                <select v-model="uiState.keuanganPengeluaranFilter" class="w-full bg-white border border-slate-300 text-sm rounded-lg p-2.5 shadow-sm capitalize">
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
                                    <span class="text-slate-500">s/d</span>
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
                            <button @click="exportKeuangan('pengeluaran')" class="bg-white border text-slate-700 font-bold py-2.5 px-4 rounded-lg hover:bg-slate-100 text-sm h-[42px] shadow-sm">Export</button>
                        </div>
                    </div>
                    <div class="overflow-y-auto max-h-[60vh]">
                        <table class="w-full text-sm text-left text-slate-500">
                            <thead class="text-xs text-slate-700 uppercase bg-slate-100/50 sticky top-0">
                                <tr><th class="px-4 py-3">Detail</th><th class="px-4 py-3">Catatan</th><th class="px-4 py-3 text-right">Jumlah</th><th class="px-4 py-3 text-center">Aksi</th></tr>
                            </thead>
                            <tbody class="divide-y divide-slate-200/50">
                                <tr v-if="filteredPengeluaran.length === 0"><td colspan="4" class="p-4 text-center text-slate-500">Tidak ada data.</td></tr>
                                <tr v-for="item in filteredPengeluaran" :key="item.id" class="hover:bg-slate-50/50">
                                    <td class="px-4 py-3 align-top">
                                        <p class="font-semibold text-slate-800">{{ item.kategori }}</p>
                                        <p class="text-xs">{{ new Date(item.tanggal).toLocaleDateString('id-ID') }}</p>
                                    </td>
                                    <td class="px-4 py-3 text-xs align-top">{{ item.catatan || '-' }}</td>
                                    <td class="px-4 py-3 font-semibold text-red-600 text-right align-top">{{ formatCurrency(item.jumlah) }}</td>
                                    <td class="px-4 py-3 text-center align-top">
                                        <button @click="deleteBiaya(item.id)" class="text-xs text-red-500 hover:underline" :disabled="!isSubscriptionActive">Hapus</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="bg-white/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 200ms;">
                    <div v-if="uiState.isPemasukanLocked" class="flex flex-col items-center justify-center min-h-[400px] animate-fade-in">
                        <div class="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-6 mx-auto">
                           <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        </div>
                        <h3 class="text-xl font-bold text-slate-800 mb-2">Riwayat Pemasukan Terkunci</h3>
                        <p class="text-sm text-slate-600 mb-4">Masukkan PIN untuk melihat data.</p>
                        <form @submit.prevent="unlockPemasukan" class="max-w-xs w-full">
                            <input type="password" v-model="uiState.pemasukanPinInput" placeholder="••••" class="w-full p-2 border rounded-md text-center text-lg mb-2">
                            <p v-if="uiState.pemasukanPinError" class="text-red-500 text-xs mb-2">{{ uiState.pemasukanPinError }}</p>
                            <button type="submit" class="mt-2 w-full bg-indigo-600 text-white font-bold py-2.5 rounded-lg hover:bg-indigo-700">Buka</button>
                        </form>
                    </div>
                    
                    <div v-else class="animate-fade-in">
                        <div class="flex justify-between items-center mb-4 pb-4 border-b border-slate-200/80">
                            <h3 class="text-xl font-semibold text-slate-800">Riwayat Pemasukan</h3>
                            <div class="flex gap-2">
                                <button @click="showModal('addPemasukan', { tanggal: new Date().toISOString().split('T')[0], kategori: 'Modal Masuk', jumlah: null, catatan: '' })" class="bg-sky-500 text-white font-bold py-1.5 px-3 rounded-md hover:bg-sky-600 text-sm shadow" :disabled="!isSubscriptionActive">Tambah Baru</button>
                                <button @click="showNestedModal('manageInflowCategories')" class="bg-slate-100 p-1 text-slate-600 rounded-md hover:bg-slate-200" title="Kelola Kategori">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.82 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.82 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.82-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.82-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="p-4 border-b border-slate-200/80 mb-4">
                            <div class="flex items-start gap-2">
                                <div class="flex-grow">
                                    <select v-model="uiState.keuanganPemasukanFilter" class="w-full bg-white border border-slate-300 text-sm rounded-lg p-2.5 shadow-sm capitalize">
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
                                        <span class="text-slate-500">s/d</span>
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
                                <button @click="exportKeuangan('pemasukan')" class="bg-white border text-slate-700 font-bold py-2.5 px-4 rounded-lg hover:bg-slate-100 text-sm h-[42px] shadow-sm">Export</button>
                            </div>
                        </div>
                        <div class="overflow-y-auto max-h-[60vh]">
                            <table class="w-full text-sm text-left text-slate-500">
                                <thead class="text-xs text-slate-700 uppercase bg-slate-100/50 sticky top-0">
                                    <tr><th class="px-4 py-3">Detail</th><th class="px-4 py-3">Catatan</th><th class="px-4 py-3 text-right">Jumlah</th><th class="px-4 py-3 text-center">Aksi</th></tr>
                                </thead>
                                <tbody class="divide-y divide-slate-200/50">
                                    <tr v-if="filteredPemasukan.length === 0"><td colspan="4" class="p-4 text-center text-slate-500">Tidak ada data.</td></tr>
                                    <tr v-for="item in filteredPemasukan" :key="item.id" class="hover:bg-slate-50/50">
                                        <td class="px-4 py-3 align-top">
                                            <p class="font-semibold text-slate-800">{{ item.kategori }}</p>
                                            <p class="text-xs">{{ new Date(item.tanggal).toLocaleDateString('id-ID') }}</p>
                                        </td>
                                        <td class="px-4 py-3 text-xs align-top">{{ item.catatan || '-' }}</td>
                                        <td class="px-4 py-3 font-semibold text-green-600 text-right align-top">{{ formatCurrency(item.jumlah) }}</td>
                                        <td class="px-4 py-3 text-center align-top">
                                            <button @click="deletePemasukan(item.id)" class="text-xs text-red-500 hover:underline" :disabled="!isSubscriptionActive">Hapus</button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="uiState.isKeuanganInfoVisible" class="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4 animate-fade-in">
                <div class="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full animate-fade-in-up">
                    <div class="flex justify-between items-start pb-4 border-b">
                        <h3 class="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <svg class="w-6 h-6 text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
                            Informasi & Logika
                        </h3>
                    </div>
                    <div class="space-y-4 text-slate-700 py-4">
                        <p class="text-sm text-slate-600">Halaman ini berfungsi sebagai buku kas digital Anda. Setiap data yang Anda masukkan di sini akan secara langsung memengaruhi metrik di Dashboard Analitik.</p>
                        <div class="space-y-4">
                            <div class="p-4 bg-slate-50 rounded-lg">
                                <p class="font-semibold text-slate-700">Pemasukan & Pengeluaran</p>
                                <p class="text-sm text-slate-500 mt-1">Data dari tabel ini akan diperhitungkan dalam kalkulasi **Saldo Kas** di dasbor.</p>
                            </div>
                            <div class="p-4 bg-slate-50 rounded-lg">
                                <p class="font-semibold text-slate-700">Kategori Pengeluaran</p>
                                <p class="text-sm text-slate-500 mt-1">Semua data di sini akan diklasifikasikan sebagai **Biaya Operasional**, yang digunakan untuk menghitung **Laba Bersih** di dasbor.</p>
                            </div>
                        </div>
                    </div>
                    <div class="flex justify-end gap-3 pt-4 border-t">
                        <button @click="hideKeuanganInfoModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<div v-if="activePage === 'investasi'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">

        <div v-if="uiState.isInvestasiLocked" class="flex items-center justify-center h-full animate-fade-in">
            <div class="bg-white/70 backdrop-blur-sm p-8 rounded-2xl shadow-xl border text-center max-w-sm w-full">
                 <div class="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-6 mx-auto">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                 </div>
                <h3 class="text-xl font-bold text-slate-800 mb-2">Halaman Terkunci</h3>
                <p class="text-sm text-slate-600 mb-4">Masukkan PIN keamanan Anda untuk mengakses data investor.</p>
                <form @submit.prevent="unlockInvestasi" class="w-full">
                    <input type="password" v-model="uiState.investasiPinInput" placeholder="••••" class="w-full p-2 border border-slate-300 rounded-md text-center text-lg mb-2">
                    <p v-if="uiState.investasiPinError" class="text-red-500 text-xs mb-2">{{ uiState.investasiPinError }}</p>
                    <button type="submit" class="mt-2 w-full bg-indigo-600 text-white font-bold py-2.5 rounded-lg hover:bg-indigo-700 transition-colors">Buka Halaman</button>
                </form>
            </div>
        </div>
        
        <div v-else class="max-w-7xl mx-auto">
            <div class="mb-8 animate-fade-in-up">
                <div class="flex items-center gap-4">
    <h2 class="text-3xl font-bold text-slate-800">Manajemen Investasi</h2>
    <button @click="showModal('investorInfo')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
        Informasi
    </button>
</div>
                <p class="text-slate-500 mt-1">Kelola data investor, laporan bagi hasil, dan riwayat pembayaran.</p>
            </div>

            <div class="space-y-8">
                <div class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 100ms;">
                    <div class="flex flex-wrap justify-between items-center gap-4 mb-4">
                        <h3 class="text-xl font-bold text-slate-800">Daftar Investor</h3>
                        <div class="flex items-center gap-4">
                             <select v-model="uiState.investorStatusFilter" class="p-2 border border-slate-300 rounded-md bg-white shadow-sm text-sm">
                                <option value="aktif">Hanya Aktif</option>
                                <option value="selesai">Hanya Selesai</option>
                                <option value="semua">Tampilkan Semua</option>
                            </select>
                            <button @click="showModal('addInvestor', { name: '', amount: null, profitShare: null, startDate: new Date().toISOString().split('T')[0], status: 'aktif' })" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 shadow transition-colors text-sm" :disabled="!isSubscriptionActive">
    + Tambah Investor
</button>
                        </div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm text-left text-slate-500">
                            <thead class="text-xs text-slate-700 uppercase bg-slate-50/50">
                                <tr>
                                    <th class="px-6 py-3">Nama Investor</th>
                                    <th class="px-6 py-3 text-center">Status</th>
                                    <th class="px-6 py-3 text-right">Modal Masuk</th>
                                    <th class="px-6 py-3 text-right">Total Bagi Hasil</th>
                                    <th class="px-6 py-3 text-right">ROI</th>
                                    <th class="px-6 py-3 text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-200/50">
                                <tr v-if="investorLedger.length === 0">
                                    <td colspan="6" class="p-10 text-center text-slate-500">Tidak ada data investor yang cocok dengan filter.</td>
                                </tr>
                                <tr v-for="inv in investorLedger" :key="inv.id" class="hover:bg-slate-50/50">
                                    <td class="px-6 py-4">
                                        <p class="font-semibold text-slate-800">{{ inv.name }}</p>
                                        <p class="text-xs text-slate-500">Bagi Hasil: {{ inv.profitShare }}% | Mulai: {{ new Date(inv.startDate).toLocaleDateString('id-ID') }}</p>
                                    </td>
                                    <td class="px-6 py-4 text-center">
                                        <span class="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                                                :class="inv.status === 'aktif' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'">
                                            {{ inv.status }}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 text-right font-medium text-slate-600">{{ formatCurrency(inv.amount) }}</td>
                                    <td class="px-6 py-4 text-right font-semibold text-green-600">{{ formatCurrency(inv.totalPayout) }}</td>
                                    <td class="px-6 py-4 text-right font-bold" :class="inv.roi >= 100 ? 'text-emerald-600' : 'text-amber-600'">
                                        {{ inv.roi.toFixed(1) }}%
                                    </td>
                                    <td class="px-6 py-4 text-center space-x-2 whitespace-nowrap">
                                        <button @click="toggleInvestorStatus(inv)" class="text-xs bg-slate-100 font-bold py-1 px-2 rounded hover:bg-slate-200">Ubah Status</button>
                                        <button @click="showModal('editInvestor', inv)" class="text-xs bg-slate-100 font-bold py-1 px-2 rounded hover:bg-slate-200" :disabled="!isSubscriptionActive">Edit</button>
                                        <button v-if="inv.status === 'selesai'" @click="deleteInvestor(inv.id)" class="text-xs bg-red-100 text-red-700 font-bold py-1 px-2 rounded hover:bg-red-200" :disabled="!isSubscriptionActive">
    Hapus
</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 200ms;">
                    <h3 class="text-xl font-bold text-slate-800 mb-4">Laporan Bagi Hasil Investor</h3>
                    <div class="p-4 bg-slate-50/50 rounded-xl border shadow-sm mb-6">
                         <form @submit.prevent="generateBagiHasilReport" class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <div class="md:col-span-2">
                                <label class="block text-sm font-medium text-slate-700 mb-1">Pilih Investor</label>
                                <select v-model="uiState.laporanBagiHasil.selectedInvestorId" class="w-full p-2 border border-slate-300 rounded-md">
                                    <option :value="null" disabled>-- Pilih Investor --</option>
                                    <option v-for="inv in (state.investor || [])" :key="inv.id" :value="inv.id">{{ inv.name }}</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Bulan</label>
                                <select v-model.number="uiState.laporanBagiHasil.month" class="w-full p-2 border border-slate-300 rounded-md">
                                    <option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Tahun</label>
                                <input type="number" v-model.number="uiState.laporanBagiHasil.year" class="w-full p-2 border border-slate-300 rounded-md">
                            </div>
                            <div class="md:col-span-4">
                                <button type="submit" class="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors">
                                    Buat Laporan
                                </button>
                            </div>
                        </form>
                    </div>
                    <div v-if="uiState.laporanBagiHasil.result" class="p-6 bg-white rounded-xl border-2 border-indigo-500 shadow-lg animate-fade-in">
                        <div class="border-b pb-4 mb-4">
                            <h3 class="text-xl font-bold text-slate-800">Laporan Bagi Hasil untuk {{ uiState.laporanBagiHasil.result.investorName }}</h3>
                            <p class="text-slate-600">Periode: <span class="font-semibold">{{ uiState.laporanBagiHasil.result.period }}</span></p>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                            <div class="space-y-2 p-4 bg-indigo-50 rounded-lg">
                                <h4 class="font-bold text-base mb-2">Pembagian Hasil</h4>
                                <div v-if="uiState.laporanBagiHasil.result.labaBersih > 0">
                                    <div class="flex justify-between"><span>Bagian Investor ({{ uiState.laporanBagiHasil.result.profitSharePercentage }}%)</span><span class="font-bold text-xl text-green-700">{{ formatCurrency(uiState.laporanBagiHasil.result.investorShare) }}</span></div>
                                    <div class="flex justify-between mt-2"><span>Bagian Perusahaan</span><span class="font-medium">{{ formatCurrency(uiState.laporanBagiHasil.result.companyShare) }}</span></div>
                                    <div class="mt-6 pt-4 border-t space-y-3">
                                        <div><label class="block text-sm font-medium">Metode Pembayaran</label><select v-model="uiState.laporanBagiHasil.paymentMethod" class="mt-1 w-full p-2 border rounded-md"><option value="transfer">Transfer Bank</option><option value="cash">Tunai (Cash)</option></select></div>
                                        <div v-if="uiState.laporanBagiHasil.paymentMethod === 'transfer'"><label class="block text-sm font-medium">Rekening Tujuan</label><select v-model="uiState.laporanBagiHasil.selectedBankAccountId" class="mt-1 w-full p-2 border rounded-md" required><option :value="null" disabled>-- Pilih Rekening --</option><option v-for="acc in state.bankAccounts" :key="acc.id" :value="acc.id">{{ acc.bankName }} - {{ acc.accountNumber }} ({{ acc.accountName }})</option></select></div>
                                        <div v-if="uiState.laporanBagiHasil.paymentMethod === 'transfer'"><label class="block text-sm font-medium">Biaya Admin Transfer (jika ada)</label><input type="number" v-model.number="uiState.laporanBagiHasil.adminFee" class="mt-1 w-full p-2 border rounded-md" placeholder="Contoh: 6500"></div>
                                    </div>
                                    <div class="flex justify-end items-center gap-3 pt-4 border-t mt-4">
                                        <button type="button" @click="uiState.laporanBagiHasil.result = null" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
                                        <button type="button" @click="recordBagiHasilPayment" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700" :disabled="!isSubscriptionActive">Catat Pembayaran Bagi Hasil</button>
                                    </div>
                                </div>
                                <div v-else class="text-center py-8"><p class="font-semibold text-slate-700">Tidak ada keuntungan pada periode ini.</p></div>
                            </div>
                            <div class="space-y-2 p-4 bg-slate-50 rounded-lg">
                                <h4 class="font-bold text-base mb-2">Perhitungan Laba Bersih</h4>
                                <div class="flex justify-between"><span>Omset Bersih Penjualan</span> <span class="font-medium text-green-600">{{ formatCurrency(uiState.laporanBagiHasil.result.omsetBersihPenjualan) }}</span></div>
                                <div class="flex justify-between"><span>(-) Omset Bersih dari Retur</span> <span class="font-medium text-red-600">-{{ formatCurrency(uiState.laporanBagiHasil.result.omsetBersihDariRetur) }}</span></div>
                                <div class="flex justify-between font-semibold border-t pt-1"><span>= Total Omset Bersih</span> <span>{{ formatCurrency(uiState.laporanBagiHasil.result.omsetBersihFinal) }}</span></div>
                                <div class="flex justify-between mt-3"><span>(-) HPP Terjual</span> <span class="font-medium text-red-600">-{{ formatCurrency(uiState.laporanBagiHasil.result.totalHppTerjual) }}</span></div>
                                <div class="flex justify-between"><span>(-) HPP dari Retur</span> <span class="font-medium text-red-600">-{{ formatCurrency(uiState.laporanBagiHasil.result.totalHppRetur) }}</span></div>
                                <div class="flex justify-between font-semibold border-t pt-1"><span>= Total HPP</span> <span class="text-red-600">-{{ formatCurrency(uiState.laporanBagiHasil.result.hppTerjualFinal) }}</span></div>
                                <div class="flex justify-between font-bold border-t-2 pt-2 mt-2"><span>LABA KOTOR</span> <span>{{ formatCurrency(uiState.laporanBagiHasil.result.labaKotor) }}</span></div>
                                <div class="flex justify-between mt-3"><span>(-) Biaya Marketplace (Penjualan)</span> <span class="font-medium text-red-600">-{{ formatCurrency(uiState.laporanBagiHasil.result.biayaMarketplacePenjualan) }}</span></div>
                                <div class="flex justify-between"><span>(-) Biaya Marketplace (dari Retur)</span> <span class="font-medium text-red-600">-{{ formatCurrency(uiState.laporanBagiHasil.result.biayaMarketplaceBatal) }}</span></div>
                                <div class="flex justify-between font-semibold border-t pt-1"><span>= Total Biaya Marketplace</span> <span class="text-red-600">-{{ formatCurrency(uiState.laporanBagiHasil.result.totalBiayaTransaksi) }}</span></div>
                                <div class="flex justify-between mt-2">
                                    <span class="flex items-center gap-2">(-) Biaya Operasional <button @click="showModal('biayaOperasionalHelp')" type="button" class="w-5 h-5 rounded-full flex items-center justify-center bg-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-300">?</button></span> 
                                    <span class="font-medium text-red-600">-{{ formatCurrency(uiState.laporanBagiHasil.result.totalBiayaOperasional) }}</span>
                                </div>
                                <div class="flex justify-between font-bold text-lg text-indigo-700 border-t-2 pt-2 mt-2">
                                    <div class="flex items-center gap-2"><span>LABA BERSIH</span><button @click="showModal('labaBersihHelp')" type="button" class="w-5 h-5 rounded-full flex items-center justify-center bg-indigo-100 text-indigo-600 font-bold text-sm hover:bg-indigo-200">?</button></div>
                                    <span>{{ formatCurrency(uiState.laporanBagiHasil.result.labaBersih) }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 300ms;">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-bold text-slate-800">Riwayat Pembayaran Investor</h3>
                        <button @click="exportInvestorPayments" class="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">Export</button>
                    </div>
                    <div class="mb-6 p-4 bg-slate-50/50 rounded-xl border shadow-sm">
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                            <div>
                                <label class="block text-sm font-medium mb-1">Filter Periode</label>
                                <select v-model="uiState.investorPaymentFilter" class="w-full bg-white border-slate-300 text-sm rounded-lg p-2.5 capitalize">
                                    <option value="all_time">Semua</option>
                                    <option value="by_month_range">Bulan & Tahun</option>
                                    <option value="by_year_range">Rentang Tahun</option>
                                </select>
                            </div>
                            <div v-if="uiState.investorPaymentFilter === 'by_month_range'" class="lg:col-span-2 grid grid-cols-2 gap-2 items-end">
                                <div>
                                    <label class="block text-xs font-medium mb-1">Dari Bulan</label>
                                    <select v-model.number="uiState.investorPaymentStartMonth" class="w-full p-2 border rounded-md bg-white shadow-sm">
                                        <option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium mb-1">Tahun</label>
                                    <input type="number" v-model.number="uiState.investorPaymentStartYear" class="w-full p-2 border rounded-md bg-white shadow-sm">
                                </div>
                                <div>
                                    <label class="block text-xs font-medium mb-1">Sampai Bulan</label>
                                    <select v-model.number="uiState.investorPaymentEndMonth" class="w-full p-2 border rounded-md bg-white shadow-sm">
                                        <option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs font-medium mb-1">Tahun</label>
                                    <input type="number" v-model.number="uiState.investorPaymentEndYear" class="w-full p-2 border rounded-md bg-white shadow-sm">
                                </div>
                            </div>
                            <div v-if="uiState.investorPaymentFilter === 'by_year_range'" class="lg:col-span-2 grid grid-cols-2 gap-2">
                                <div>
                                    <label class="block text-sm font-medium mb-1">Dari Tahun</label>
                                    <input type="number" v-model.number="uiState.investorPaymentStartYear" placeholder="Tahun" class="w-full p-2 border rounded-md bg-white shadow-sm">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium mb-1">Sampai Tahun</label>
                                    <input type="number" v-model.number="uiState.investorPaymentEndYear" placeholder="Tahun" class="w-full p-2 border rounded-md bg-white shadow-sm">
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">Cari Investor</label>
                                <input type="text" v-model="uiState.investorPaymentSearch" placeholder="Cari nama investor..." class="w-full p-2 border rounded-md bg-white shadow-sm">
                            </div>
                        </div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm text-left text-slate-500">
                            <thead class="text-xs text-slate-700 uppercase bg-slate-50/50">
                                <tr>
                                    <th class="px-6 py-3">Tanggal</th>
                                    <th class="px-6 py-3">Investor</th>
                                    <th class="px-6 py-3">Periode</th>
                                    <th class="px-6 py-3 text-right">Jumlah Dibayar</th>
                                    <th class="px-6 py-3">Metode</th>
                                    <th class="px-6 py-3 text-center">Aksi</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-200/50">
                                <tr v-if="filteredInvestorPayments.length === 0">
                                    <td colspan="6" class="p-10 text-center text-slate-500">Belum ada riwayat pembayaran yang sesuai dengan filter.</td>
                                </tr>
                                <tr v-for="p in filteredInvestorPayments" :key="p.id" class="hover:bg-slate-50/50">
                                    <td class="px-6 py-4">{{ new Date(p.paymentDate).toLocaleDateString('id-ID') }}</td>
                                    <td class="px-6 py-4 font-semibold">{{ p.investorName }}</td>
                                    <td class="px-6 py-4">{{ p.period }}</td>
                                    <td class="px-6 py-4 text-right font-medium text-green-600">{{ formatCurrency(p.totalPayment) }}</td>
                                    <td class="px-6 py-4 capitalize">{{ p.paymentMethod }}</td>
                                    <td class="px-6 py-4 text-center space-x-3">
                                        <button @click="showInvestorPaymentDetail(p)" class="text-xs font-semibold text-indigo-600 hover:underline">Detail</button>
                                        <button @click="deleteInvestorPayment(p.id)" class="text-xs font-semibold text-red-500 hover:underline">Hapus</button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

    </div>
</div>

<div v-if="activePage === 'barcode-generator'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">
        <div class="max-w-4xl mx-auto">
            <div class="text-center mb-12 animate-fade-in-up">
                <h2 class="text-3xl md:text-4xl font-extrabold text-slate-800">
                    <span class="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Panduan Mencetak Barcode</span>
                </h2>
                <p class="text-lg text-slate-600 mt-4 max-w-2xl mx-auto">
                    Ikuti panduan lengkap ini untuk mencetak label barcode produk Anda menggunakan aplikasi pihak ketiga.
                </p>
            </div>
            <div class="space-y-10">
                <div class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 100ms;">
                    <h3 class="text-2xl font-bold text-indigo-700 mb-4">Bagian 1: Persiapan Awal Kertas & Kalibrasi Printer</h3>
                    <div class="space-y-6">
                        <div>
                            <h4 class="text-xl font-bold text-slate-800 mb-2">Langkah 1: Membeli Kertas Label</h4>
                            <p class="text-slate-700">
                                Sebelum memulai, pastikan Anda telah membeli kertas label khusus barcode. Anda bisa mencarinya di marketplace dengan kata kunci **"label thermal 33x15mm 2 line"**. Panduan ini menggunakan ukuran tersebut sebagai contoh, namun Anda bisa menyesuaikan pengaturan di aplikasi atau PC jika Anda menggunakan ukuran lain.
                            </p>
                        </div>
                        <div>
                            <h4 class="text-xl font-bold text-slate-800 mb-2">Langkah 2: Mengkalibrasi Printer</h4>
                            <p class="text-slate-700">
                                Kalibrasi penting untuk memastikan printer mengenali ukuran kertas dan mencetak dengan presisi.
                            </p>
                            <ul class="list-disc list-inside ml-4 space-y-2 text-slate-700 mt-2">
                                <li>
                                    <p class="font-bold">Untuk Printer Xprinter XP-D4601B:</p>
                                    <ol class="list-decimal list-inside ml-4">
                                        <li>Matikan printer (posisi **OFF**).</li>
                                        <li>Tekan dan tahan tombol bulat di atas printer, lalu hidupkan printer (posisi **ON**).</li>
                                        <li>Jangan lepas tombol sampai lampu indikator berkedip merah sebanyak **lima kali**. Setelah itu, lepaskan tombol.</li>
                                        <li>Printer akan menyesuaikan diri. Untuk menguji, tekan tombol bulat satu kali. Jika printer mengeluarkan satu baris dengan dua label kosong, kalibrasi berhasil.</li>
                                    </ol>
                                </li>
                                <li>
                                    <p class="font-bold">Untuk Printer Lain:</p>
                                    <p>Silakan cari panduan kalibrasi di Google atau YouTube sesuai merek dan model printer Anda.</p>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 200ms;">
                    <h3 class="text-2xl font-bold text-indigo-700 mb-4">Bagian 2: Pengaturan di Aplikasi "Print Label"</h3>
                    <div class="space-y-6">
                        <div>
                            <h4 class="text-xl font-bold text-slate-800 mb-2">Langkah 1: Menginstal Aplikasi</h4>
                            <ol class="list-decimal list-inside space-y-2 text-slate-700">
                                <li>Cari aplikasi **"Print Label"** di Google Play Store.</li>
                                <li>Jika tidak dapat diinstal, coba cari dan instal dari **GetApps**.</li>
                            </ol>
                        </div>
                        <div>
                            <h4 class="text-xl font-bold text-slate-800 mb-2">Langkah 2: Menghubungkan ke Printer</h4>
                            <ol class="list-decimal list-inside space-y-2 text-slate-700">
                                <li>Di layar utama, klik **ikon gambar printer** di pojok kanan atas.</li>
                                <li>Pada halaman **"Set bluetooth connection"**, klik tombol **"Search"**.</li>
                                <li>Setelah nama printer Anda muncul, klik nama tersebut untuk menghubungkannya.</li>
                            </ol>
                        </div>
                        <div>
                            <h4 class="text-xl font-bold text-slate-800 mb-2">Langkah 3: Mengatur Ukuran Label</h4>
                            <ol class="list-decimal list-inside space-y-2 text-slate-700">
                                <li>Kembali ke menu utama dan klik **"New Label"**.</li>
                                <li>Pilih **"Gap paper"** dan **"Rectangle"**. Atur **Width** menjadi **33** mm dan **Height** menjadi **15** mm (sesuaikan jika kertas Anda berbeda).</li>
                                <li>Klik tombol **"NEW LABEL"**.</li>
                            </ol>
                        </div>
                        <div>
                            <h4 class="text-xl font-bold text-slate-800 mb-2">Langkah 4: Menambahkan Barcode</h4>
                            <ol class="list-decimal list-inside space-y-2 text-slate-700">
                                <li>Di halaman editor, klik ikon **"BarCode"** di bagian bawah.</li>
                                <li>Edit konten teks di bawah barcode dengan **SKU** produk Anda.</li>
                            </ol>
                        </div>
                        <div>
                            <h4 class="text-xl font-bold text-slate-800 mb-2">Langkah 5: Meninjau dan Mencetak</h4>
                            <ol class="list-decimal list-inside space-y-2 text-slate-700">
                                <li>Klik **"Print"**, lalu atur **"Print direction"** (0 atau 180) dan **"Print density"** (misalnya, 5).</li>
                                <li>Atur **"Number of prints"** sesuai jumlah salinan yang Anda inginkan, lalu klik **"OK"**.</li>
                            </ol>
                        </div>
                    </div>
                </div>

                <div class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 700ms;">
                    <h3 class="text-2xl font-bold text-indigo-700 mb-4">Bagian 3: Jika Hasil Cetak Tidak Pas</h3>
                    <p class="text-slate-600 mb-4">
                        Jika hasil cetak masih kurang presisi, Anda perlu mengatur ulang konfigurasi printer langsung dari PC atau laptop Anda.
                    </p>
                    <ol class="list-decimal list-inside space-y-4 text-slate-700">
                        <li>
                            <p class="font-bold">Buka Pengaturan Printer:</p>
                            <ul class="list-disc list-inside ml-4">
                                <li>Pada PC atau laptop Anda, buka menu **Bluetooth & devices**.</li>
                                <li>Pilih perangkat printer Anda, lalu klik **Printer properties** atau **Printing preferences**.</li>
                            </ul>
                        </li>
                        <li>
                            <p class="font-bold">Atur Ukuran Kertas di Tab "Page Setup":</p>
                            <ul class="list-disc list-inside ml-4">
                                <li>Pilih tab **Page Setup**, lalu klik tombol **New**.</li>
                                <li>Beri nama **Label_33x15mm** di kolom **Stock Name**.</li>
                                <li>Di bagian **Label size**, atur **Width** menjadi **33.0 mm** dan **Height** menjadi **15.0 mm**.</li>
                                <li>Di bagian **Exposed liner width**, atur kolom **Left** dan **Right** menjadi **2.0 mm**.</li>
                                <li>Klik **OK**.</li>
                            </ul>
                        </li>
                        <li>
                            <p class="font-bold">Atur Tipe Kertas di Tab "Stock":</p>
                            <ul class="list-disc list-inside ml-4">
                                <li>Pilih tab **Stock**.</li>
                                <li>Di bagian **Media Settings**, atur **Method** menjadi **Direct Thermal** dan **Type** menjadi **Labels with gaps**.</li>
                                <li>Atur **Gap Height** menjadi **2.0 mm** dan **Gap Offset** menjadi **0.0 mm**.</li>
                                <li>Di bagian **Media Handling**, atur **Post-Print Action** ke **Tear Off** dan **Feed Offset** ke **0.0 mm**.</li>
                            </ul>
                        </li>
                        <li>
                            <p class="font-bold">Simpan Pengaturan:</p>
                            <ul class="list-disc list-inside ml-4">
                                <li>Di bagian bawah, pastikan kotak **"Use current printer settings"** sudah dicentang.</li>
                                <li>Klik **Apply**, lalu klik **OK**.</li>
                            </ul>
                        </li>
                    </ol>
                    <p class="text-sm font-semibold text-red-600 mt-6">
                        Catatan: Disarankan memiliki printer khusus untuk cetak barcode dan printer terpisah untuk mencetak resi pengiriman agar lebih efisien dan nyaman.
                    </p>
                </div>
            </div>
        </div>
    </div>
</div>

<div v-if="activePage === 'retur'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">
        <div class="max-w-7xl mx-auto">
            
            <div class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up">
                
                <div class="flex flex-wrap justify-between items-center gap-4 mb-6 pb-6 border-b border-slate-200">
                    <div>
                        <h2 class="text-3xl font-bold text-slate-800">Manajemen Retur</h2>
                        <p class="text-slate-500 mt-1">Lacak dan kelola semua pengembalian produk dari pelanggan.</p>
                    </div>
                    <div class="flex items-center gap-4">
                         <button @click="showModal('panduanRetur')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
                            Informasi
                        </button>
                        <button @click="showModal('addRetur', { tanggal: new Date().toISOString().split('T')[0], transactionIdSearch: '', foundTransaction: null, items: [] })" class="bg-orange-500 text-white font-bold py-2 px-5 rounded-lg hover:bg-orange-600 shadow transition-colors" :disabled="!isSubscriptionActive">
    + Tambah Retur
</button>
                    </div>
                </div>

                <div class="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
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

                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left text-slate-500">
                        <thead class="text-xs text-slate-700 uppercase bg-slate-100/50">
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
                        <tbody class="divide-y divide-slate-200/50">
                            <tr v-if="filteredRetur.length === 0">
                                <td colspan="7" class="p-10 text-center text-slate-500">Tidak ada data retur yang sesuai dengan filter.</td>
                            </tr>
                            <tr v-for="(item, index) in filteredRetur" :key="`${item.returnDocId}-${item.sku}-${index}`" class="hover:bg-slate-50/50">
                                <td class="px-6 py-4 whitespace-nowrap">{{ new Date(item.tanggal).toLocaleDateString('id-ID') }}</td>
                                <td class="px-6 py-4">{{ getMarketplaceById(item.channelId)?.name || 'N/A' }}</td>
                                <td class="px-6 py-4">
                                    <p class="font-semibold text-slate-800">{{ getProductBySku(item.sku)?.nama || 'Produk tidak ditemukan' }}</p>
                                    <p class="font-mono text-xs text-slate-500">{{ item.sku }}</p>
                                </td>
                                <td class="px-6 py-4 font-medium text-center">{{ item.qty }}</td>
                                <td class="px-6 py-4">{{ item.alasan }}</td>
                                <td class="px-6 py-4">
                                    <span class="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                                          :class="{
                                              'bg-yellow-100 text-yellow-800': item.tindakLanjut === 'Refund',
                                              'bg-green-100 text-green-800': item.tindakLanjut === 'Ganti Baru',
                                              'bg-blue-100 text-blue-800': item.tindakLanjut === 'Tukar Ukuran',
                                              'bg-cyan-100 text-cyan-800': item.tindakLanjut === 'Tukar Warna',
                                              'bg-purple-100 text-purple-800': item.tindakLanjut === 'Perbaiki',
                                          }">
                                        {{ item.tindakLanjut }}
                                    </span>
                                </td>
                                <td class="px-6 py-4 text-center space-x-2">
                                    <button @click="deleteReturnItem(item)" class="text-xs text-red-500 hover:underline" :disabled="!isSubscriptionActive">Hapus</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>

<div v-if="activePage === 'mitra'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">
        
        <div v-if="currentUser && !currentUser.isPartner" class="flex items-center justify-center h-full animate-fade-in">
            <div class="bg-white p-8 rounded-2xl shadow-xl border text-center max-w-md">
                <h3 class="text-2xl font-bold text-slate-800 mb-4">Jadilah Mitra & Dapatkan Penghasilan</h3>
                <p class="text-slate-600 mb-6">Dapatkan komisi dari setiap pelanggan yang Anda ajak. Jadilah bagian dari tim kami untuk mengembangkan Fashion OS bersama.</p>
                <button @click="showModal('registerPartner')" class="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/30">
                    Daftar Menjadi Mitra
                </button>
            </div>
        </div>
        
        <div v-else-if="currentUser && currentUser.isPartner" class="max-w-7xl mx-auto">
            <div class="flex justify-between items-center mb-8 animate-fade-in-up">
    <div>
        <h2 class="text-3xl font-bold text-slate-800">Dashboard Mitra</h2>
        <p class="text-slate-500 mt-1">Pantau kinerja dan penghasilan Anda di sini.</p>
    </div>
    <a :href="`https://wa.me/${nomorWhatsAppAdmin}`" target="_blank" class="bg-green-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-600 transition-colors shadow-lg flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.487 5.235 3.487 8.413 0 6.557-5.338 11.892-11.894 11.892-1.99 0-3.903-.52-5.687-1.475L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.886-.001 2.267.655 4.398 1.905 6.344l-1.332 4.869 4.869-1.332z"/></svg>
        Hubungi Admin
    </a>
</div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
                <!-- Kolom Kode Rujukan -->
                <div class="bg-white/70 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-slate-200 animate-fade-in-up flex flex-col justify-center" style="animation-delay: 100ms;">
                    <h4 class="text-sm font-medium text-slate-500">Kode Rujukan Anda</h4>
                    <p class="font-mono font-bold text-indigo-600 mt-2 break-all" :style="{ fontSize: 'clamp(1rem, 1.8vw, 1.5rem)' }">{{ currentUser.referralCode }}</p>
                </div>

                <!-- Kolom Total Pendapatan -->
                <div class="bg-white/70 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-slate-200 flex items-start gap-4 animate-fade-in-up" style="animation-delay: 200ms;">
                    <div class="bg-indigo-100 text-indigo-600 p-3 rounded-lg flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                    </div>
                    <div class="min-w-0">
                        <h4 class="text-sm font-medium text-slate-500">Total Pendapatan</h4>
                        <p class="font-bold text-slate-800 mt-1" :style="{ fontSize: 'clamp(1rem, 1.8vw, 1.5rem)' }">{{ formatCurrency(totalRevenue) }}</p>
                    </div>
                </div>

                <!-- Kolom Tersedia untuk Dicairkan -->
                <div class="bg-white/70 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-slate-200 flex items-start gap-4 animate-fade-in-up" style="animation-delay: 300ms;">
                    <div class="bg-green-100 text-green-600 p-3 rounded-lg flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <div class="min-w-0">
                        <h4 class="text-sm font-medium text-slate-500">Tersedia Dicairkan</h4>
                        <p class="font-bold text-green-600 mt-1" :style="{ fontSize: 'clamp(1rem, 1.8vw, 1.5rem)' }">{{ formatCurrency(availableForWithdrawal) }}</p>
                    </div>
                </div>
                
                <!-- Kolom Sedang Diproses -->
                <div class="bg-white/70 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-slate-200 flex items-start gap-4 animate-fade-in-up" style="animation-delay: 400ms;">
                    <div class="bg-yellow-100 text-yellow-600 p-3 rounded-lg flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div class="min-w-0">
                        <h4 class="text-sm font-medium text-slate-500">Sedang Diproses</h4>
                        <p class="font-bold text-yellow-600 mt-1" :style="{ fontSize: 'clamp(1rem, 1.8vw, 1.5rem)' }">{{ formatCurrency(totalProcessingCommission) }}</p>
                    </div>
                </div>

                <!-- Kolom Sudah Dicairkan -->
                <div class="bg-white/70 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-slate-200 flex items-start gap-4 animate-fade-in-up" style="animation-delay: 500ms;">
                    <div class="bg-cyan-100 text-cyan-600 p-3 rounded-lg flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div class="min-w-0">
                        <h4 class="text-sm font-medium text-slate-500">Sudah Dicairkan</h4>
                        <p class="font-bold text-slate-800 mt-1" :style="{ fontSize: 'clamp(1rem, 1.8vw, 1.5rem)' }">{{ formatCurrency(totalWithdrawn) }}</p>
                    </div>
                </div>
            </div>
            
            <div class="bg-white/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 600ms;">
                 <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-semibold text-slate-800">Riwayat Komisi (Siap Dicairkan)</h3>
                    <button @click="handleCashoutRequest" :disabled="totalUnpaidCommission === 0 || isSaving" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg text-sm shadow-lg shadow-green-500/20 hover:bg-green-700 transition-colors disabled:bg-slate-400 disabled:shadow-none">
                        <span v-if="isSaving">Mengajukan...</span>
                        <span v-else>Cairkan Semua Komisi</span>
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left text-slate-500">
                         <thead class="text-xs text-slate-700 uppercase bg-slate-50/50">
                            <tr>
                                <th class="px-6 py-3">Tanggal</th>
                                <th class="px-6 py-3">Pelanggan Rujukan</th>
                                <th class="px-6 py-3 text-right">Jumlah Komisi</th>
                                <th class="px-6 py-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200/50">
                            <tr v-if="unpaidCommissions.length === 0">
                                <td colspan="4" class="p-10 text-center text-slate-500">Tidak ada komisi yang siap dicairkan.</td>
                            </tr>
                            <tr v-for="com in unpaidCommissions" :key="com.id" class="hover:bg-slate-50/50">
                                <td class="px-6 py-4">{{ new Date(com.createdAt.seconds * 1000).toLocaleDateString('id-ID') }}</td>
                                <td class="px-6 py-4">{{ com.referredUserEmail }}</td>
                                <td class="px-6 py-4 text-right font-bold text-green-600">{{ formatCurrency(com.commissionAmount) }}</td>
                                <td class="px-6 py-4 text-center">
                                    <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 capitalize">{{ com.status }}</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="mt-8 bg-white/70 backdrop-blur-sm p-6 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 700ms;">
                 <h3 class="text-lg font-semibold text-slate-800 mb-4">Pencairan Sedang Diproses</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left text-slate-500">
                        <thead class="text-xs text-slate-700 uppercase bg-slate-50/50">
    <tr>
        <th class="px-6 py-3">Tanggal Pengajuan</th>
        <th class="px-6 py-3">ID Pencairan</th> <th class="px-6 py-3">Pelanggan Rujukan</th>
        <th class="px-6 py-3 text-right">Jumlah Komisi</th>
        <th class="px-6 py-3 text-center">Status</th>
    </tr>
</thead>
                        <tbody class="divide-y divide-slate-200/50">
                            <tr v-if="processingCommissions.length === 0">
                                <td colspan="4" class="p-10 text-center text-slate-500">Tidak ada pencairan yang sedang diproses.</td>
                            </tr>
                            <tr v-for="com in processingCommissions" :key="com.id" class="hover:bg-slate-50/50">
    <td class="px-6 py-4">{{ new Date(com.createdAt.seconds * 1000).toLocaleDateString('id-ID') }}</td>
    <td class="px-6 py-4 font-mono text-xs">{{ com.withdrawalId }}</td> <td class="px-6 py-4">{{ com.referredUserEmail }}</td>
    <td class="px-6 py-4 text-right font-bold text-yellow-600">{{ formatCurrency(com.commissionAmount) }}</td>
    <td class="px-6 py-4 text-center">
        <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">Processing</span>
    </td>
</tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>

<div v-if="activePage === 'pengaturan'" class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">
    <div class="max-w-7xl mx-auto">
        
        <div class="mb-8 animate-fade-in-up">
            <h2 class="text-3xl font-bold text-slate-800">Pengaturan Aplikasi</h2>
            <p class="text-slate-500 mt-1">Kelola semua konfigurasi inti untuk bisnis Anda di sini.</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
            
            <div class="lg:col-span-1 bg-white/70 backdrop-blur-sm p-4 rounded-2xl shadow-lg border border-slate-200 lg:sticky lg:top-8 animate-fade-in-up" style="animation-delay: 100ms;">
                <h3 class="text-xl font-bold text-slate-800 mb-4 px-3">Pengaturan</h3>
                <ul class="space-y-1 text-base font-medium">
                    <li>
                        <button @click="uiState.pengaturanTab = 'umum'" class="w-full flex items-center gap-3 text-left p-3 rounded-lg transition-colors font-semibold" :class="{'bg-indigo-600 text-white shadow': uiState.pengaturanTab === 'umum', 'hover:bg-slate-100 text-slate-700': uiState.pengaturanTab !== 'umum'}">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z" /></svg>
                            Pengaturan Umum
                        </button>
                    </li>
                    <li>
                        <button @click="uiState.pengaturanTab = 'marketplace'" class="w-full flex items-center gap-3 text-left p-3 rounded-lg transition-colors font-semibold" :class="{'bg-indigo-600 text-white shadow': uiState.pengaturanTab === 'marketplace', 'hover:bg-slate-100 text-slate-700': uiState.pengaturanTab !== 'marketplace'}">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" /></svg>
                            Aturan Marketplace
                        </button>
                    </li>
                    <li>
                        <button @click="uiState.pengaturanTab = 'modelproduk'" class="w-full flex items-center gap-3 text-left p-3 rounded-lg transition-colors font-semibold" :class="{'bg-indigo-600 text-white shadow': uiState.pengaturanTab === 'modelproduk', 'hover:bg-slate-100 text-slate-700': uiState.pengaturanTab !== 'modelproduk'}">
                           <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" /></svg>
                            Model Produk
                        </button>
                    </li>
                    <li>
                        <button @click="uiState.pengaturanTab = 'rekening'" class="w-full flex items-center gap-3 text-left p-3 rounded-lg transition-colors font-semibold" :class="{'bg-indigo-600 text-white shadow': uiState.pengaturanTab === 'rekening', 'hover:bg-slate-100 text-slate-700': uiState.pengaturanTab !== 'rekening'}">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13h1v2H4v-2z" clip-rule="evenodd" /></svg>
                            Rekening Bank
                        </button>
                    </li>
                    <li v-if="isAdmin">
                        <button @click="uiState.pengaturanTab = 'admin'" class="w-full flex items-center gap-3 text-left p-3 rounded-lg transition-colors font-semibold" :class="{'bg-indigo-600 text-white shadow': uiState.pengaturanTab === 'admin', 'hover:bg-slate-100 text-slate-700': uiState.pengaturanTab !== 'admin'}">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.545 2.917A5.996 5.996 0 0010 18a5.996 5.996 0 004.545-2.083A5 5 0 0012 11z" clip-rule="evenodd" /></svg>
                            Admin
                        </button>
                    </li>
                </ul>
            </div>

            <div class="lg:col-span-3">
                <div class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-lg border border-slate-200 animate-fade-in-up" style="animation-delay: 200ms;">
                    
                    <div v-if="uiState.pengaturanTab === 'umum'" class="animate-fade-in">
                        <h3 class="text-xl font-bold text-slate-800 mb-6">Informasi Dasar & Keamanan</h3>
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Nama Brand Anda</label>
                                <input type="text" v-model="state.settings.brandName" class="w-full p-2 border border-slate-300 rounded-md">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-slate-700 mb-1">Batas Stok Minimum Peringatan</label>
                                <input type="number" v-model.number="state.settings.minStok" class="w-full p-2 border border-slate-300 rounded-md">
                            </div>
                        </div>
                        <div class="border-t pt-4 mt-6">
                            <h4 class="font-semibold text-slate-700 mb-2">Aktifkan Kunci PIN</h4>
                            <p class="text-xs text-slate-500 mb-4">Pilih bagian mana saja yang ingin Anda amankan menggunakan PIN.</p>
                            <div class="space-y-3">
                                <div class="flex justify-between items-center p-3 bg-slate-50 rounded-lg border">
                                    <span class="font-medium text-sm text-slate-800">Kunci Halaman Dashboard</span>
                                    <button @click="requestPinForToggle('dashboard')" class="w-14 h-7 rounded-full flex items-center transition-colors px-1" :class="state.settings.pinProtection?.dashboard ? 'bg-indigo-600' : 'bg-slate-300'">
                                        <span class="w-5 h-5 bg-white rounded-full shadow-md transition-transform" :class="{ 'transform translate-x-7': state.settings.pinProtection?.dashboard }"></span>
                                    </button>
                                </div>
                                <div class="flex justify-between items-center p-3 bg-slate-50 rounded-lg border">
                                    <span class="font-medium text-sm text-slate-800">Kunci Tabel Riwayat Pemasukan</span>
                                    <button @click="requestPinForToggle('incomeHistory')" class="w-14 h-7 rounded-full flex items-center transition-colors px-1" :class="state.settings.pinProtection?.incomeHistory ? 'bg-indigo-600' : 'bg-slate-300'">
                                        <span class="w-5 h-5 bg-white rounded-full shadow-md transition-transform" :class="{ 'transform translate-x-7': state.settings.pinProtection?.incomeHistory }"></span>
                                    </button>
                                </div>
                                <div class="flex justify-between items-center p-3 bg-slate-50 rounded-lg border">
                                    <span class="font-medium text-sm text-slate-800">Kunci Halaman Investasi</span>
                                    <button @click="requestPinForToggle('investmentPage')" class="w-14 h-7 rounded-full flex items-center transition-colors px-1" :class="state.settings.pinProtection?.investmentPage ? 'bg-indigo-600' : 'bg-slate-300'">
                                        <span class="w-5 h-5 bg-white rounded-full shadow-md transition-transform" :class="{ 'transform translate-x-7': state.settings.pinProtection?.investmentPage }"></span>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="border-t pt-4 mt-6">
                            <h4 class="font-semibold text-slate-700 mb-2">
                                <span v-if="state.settings.dashboardPin">Ubah PIN Dasbor</span>
                                <span v-else>Buat PIN Dasbor Baru</span>
                            </h4>
                            <div class="space-y-2">
                                <div v-if="state.settings.dashboardPin">
                                    <label class="block text-sm font-medium text-slate-700">PIN Lama</label>
                                    <input type="password" v-model="uiState.oldPin" placeholder="Masukkan PIN lama" class="w-full p-2 border border-slate-300 rounded-md">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-slate-700">PIN Baru</label>
                                    <input type="password" v-model="uiState.newPin" placeholder="Masukkan PIN baru" class="w-full p-2 border border-slate-300 rounded-md">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-slate-700">Konfirmasi PIN Baru</label>
                                    <input type="password" v-model="uiState.confirmNewPin" placeholder="Ketik ulang PIN baru" class="w-full p-2 border border-slate-300 rounded-md">
                                </div>
                                <p v-if="uiState.pinError" class="text-sm text-red-500">{{ uiState.pinError }}</p>
                            </div>
                        </div>
                        <div class="flex justify-end pt-4 border-t mt-6">
                            <button @click="saveGeneralSettings" :disabled="isSavingSettings || !isSubscriptionActive" class="bg-indigo-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-400">
    <span v-if="isSavingSettings">Menyimpan...</span>
    <span v-else>Simpan Perubahan</span>
</button>
                        </div>
                    </div>

                    <div v-if="uiState.pengaturanTab === 'marketplace'" class="animate-fade-in">
    <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-slate-800">Daftar Marketplace</h3>
        <button @click="addMarketplace" class="bg-green-500 text-white font-bold py-1 px-3 rounded-md hover:bg-green-600 text-sm" :disabled="!isSubscriptionActive">Tambah</button>
    </div>
    <div class="mb-4">
        <input type="text" v-model="uiState.pengaturanMarketplaceSearch" placeholder="Cari nama marketplace..." class="w-full p-2 border border-slate-300 rounded-md">
    </div>
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead class="text-left text-slate-500">
                <tr>
                    <th class="p-2 font-medium">NAMA</th>
                    <th class="p-2 font-medium">ADMIN</th>
                    <th class="p-2 font-medium">LAYANAN G XTRA</th>
                    <th class="p-2 font-medium">PER PESANAN</th>
                    <th class="p-2 font-medium">PROGRAM</th> <th class="p-2 font-medium text-right">AKSI</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
                <tr v-if="filteredMarketplaces.length === 0">
                    <td colspan="6" class="p-4 text-center text-slate-500">Tidak ada marketplace yang cocok.</td>
                </tr>
                <tr v-for="mp in (filteredMarketplaces || [])" :key="mp.id">
                    <td class="p-3 font-semibold text-slate-700">{{ mp.name }}</td>
                    <td class="p-3">{{ mp.adm || 0 }}%</td>
                    <td class="p-3">{{ mp.layanan || 0 }}%</td>
                    <td class="p-3">{{ formatCurrency(mp.perPesanan || 0) }}</td>
                    <td class="p-3">{{ (mp.programs || []).length }} Program</td> <td class="p-3 text-right space-x-4">
                        <button @click="showModal('editMarketplace', JSON.parse(JSON.stringify(mp)))" class="font-semibold text-blue-500 hover:underline" :disabled="!isSubscriptionActive">Edit</button>
                        <button @click="removeMarketplace(mp.id)" class="text-red-500 hover:text-red-700" :disabled="!isSubscriptionActive">
    <svg class="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
</button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
    <div class="flex justify-end pt-4 border-t mt-6">
        <button @click="saveSettingsData" :disabled="isSaving || !isSubscriptionActive" class="bg-green-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-400 disabled:shadow-none">
    <span v-if="isSaving">Menyimpan...</span>
    <span v-else>Simpan Perubahan</span>
</button>
    </div>
</div>
                    
                    <div v-if="uiState.pengaturanTab === 'modelproduk'" class="animate-fade-in">
    <div class="flex justify-between items-center mb-4">
        <div class="flex items-center gap-4">
    <h3 class="text-xl font-bold text-slate-800">Daftar Model Produk</h3>
    <button @click="showModal('modelProdukInfo')" class="bg-indigo-100 text-indigo-700 font-bold py-1 px-3 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
        </svg>
        Informasi
    </button>
</div>
        <button @click="addModelProduk" class="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm" :disabled="!isSubscriptionActive">+ Tambah Model</button>
    </div>
    <div class="mb-4">
        <input type="text" v-model="uiState.pengaturanModelProdukSearch" placeholder="Cari nama model..." class="w-full p-2 border border-slate-300 rounded-md">
    </div>

    <div class="overflow-x-auto" style="max-height: 50vh;">
        <table class="w-full text-sm">
            <thead class="text-left text-slate-500">
                <tr>
                    <th class="p-2 font-medium">NAMA MODEL</th>
                    <th class="p-2 font-medium">WARNA</th>
                    <th class="p-2 font-medium">UKURAN</th>
                    <th class="p-2 font-medium">YARD</th>
                    <th class="p-2 font-medium">HARGA MAKLUN</th>
                    <th class="p-2 font-medium">HARGA JAHIT</th>
                    <th class="p-2 font-medium text-right">AKSI</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
                <tr v-if="filteredModelProduk.length === 0">
                    <td colspan="5" class="p-4 text-center text-slate-500">Tidak ada model yang cocok.</td>
                </tr>
                <tr v-for="model in filteredModelProduk" :key="model.id">
                    <td class="p-3 font-semibold text-slate-700">{{ model.namaModel }}</td>
                    <td class="p-3">{{ model.warna }}</td>
                    <td class="p-3">{{ model.ukuran }}</td>
                    <td class="p-3">{{ model.yardPerModel || 0 }} y</td>
                    <td class="p-3">{{ formatCurrency(model.hargaMaklun || 0) }}</td>
                    <td class="p-3">{{ formatCurrency(model.hargaJahit || 0) }}</td>
                    <td class="p-3 text-right space-x-4">
                        <button @click="showModal('editModelProduk', JSON.parse(JSON.stringify(model)))" class="font-semibold text-blue-500 hover:underline" :disabled="!isSubscriptionActive">Edit</button>
                        <button @click="removeModelProduk(model.id)" class="text-red-500 hover:text-red-700" :disabled="!isSubscriptionActive">
    <svg class="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
</button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
    <div class="flex justify-end pt-4 border-t mt-6">
        <button @click="saveSettingsData" :disabled="isSaving || !isSubscriptionActive" class="bg-green-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-400 disabled:shadow-none">
    <span v-if="isSaving">Menyimpan...</span>
    <span v-else>Simpan Perubahan</span>
</button>
    </div>
</div>
                    
                    <div v-if="uiState.pengaturanTab === 'rekening'" class="animate-fade-in">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-xl font-bold text-slate-800">Daftar Rekening Bank</h3>
                            <button @click="showModal('addBankAccount', { bankName: '', accountNumber: '', accountName: '' })" class="bg-green-500 text-white font-bold py-1 px-3 rounded-md hover:bg-green-600 text-sm" :disabled="!isSubscriptionActive">Tambah</button>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead class="text-left text-slate-500">
                                    <tr>
                                        <th class="p-2 font-medium">NAMA BANK</th>
                                        <th class="p-2 font-medium">NO. REKENING</th>
                                        <th class="p-2 font-medium">ATAS NAMA</th>
                                        <th class="p-2 font-medium text-right">AKSI</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-200">
                                    <tr v-if="state.bankAccounts.length === 0">
                                        <td colspan="4" class="p-4 text-center text-slate-500">Belum ada rekening tersimpan.</td>
                                    </tr>
                                    <tr v-for="acc in (state.bankAccounts || [])" :key="acc.id">
                                        <td class="p-3 font-semibold text-slate-700">{{ acc.bankName }}</td>
                                        <td class="p-3">{{ acc.accountNumber }}</td>
                                        <td class="p-3">{{ acc.accountName }}</td>
                                        <td class="p-3 text-right space-x-4">
                                            <button @click="showModal('editBankAccount', acc)" class="font-semibold text-blue-500 hover:underline" :disabled="!isSubscriptionActive">Edit</button>
                                            <button @click="deleteBankAccount(acc.id)" class="text-red-500 hover:text-red-700 font-semibold" :disabled="!isSubscriptionActive">Hapus</button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div v-if="uiState.pengaturanTab === 'admin' && isAdmin" class="animate-fade-in">
    <div class="space-y-6">
        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 class="text-lg font-semibold text-slate-800 mb-4">Kelola Akun Mitra</h3>
            <p class="text-sm text-slate-500 mb-4">
                Pilih pengguna di bawah ini untuk menjadikannya mitra. Kode rujukan unik akan dibuat otomatis.
            </p>
            <div class="overflow-x-auto max-h-96">
    <table class="w-full text-sm">
        <thead class="text-left text-slate-500 bg-slate-100 sticky top-0">
            <tr>
                <th class="p-2 font-medium">Email Pengguna</th>
                <th class="p-2 font-medium text-center">Status Mitra</th>
                <th class="p-2 font-medium text-center">Kode Rujukan</th>
                <th class="p-2 font-medium text-right">Aksi</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
            <tr v-if="uiState.allUsers.length === 0">
                <td colspan="4" class="p-4 text-center text-slate-500">Tidak ada pengguna terdaftar.</td>
            </tr>
            <tr v-for="user in uiState.allUsers" :key="user.uid" class="hover:bg-slate-50">
                <td class="p-3">{{ user.email }}</td>
                <td class="p-3 text-center">
                    <span v-if="user.isPartner" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">Ya</span>
                    <span v-else class="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800">Tidak</span>
                </td>
                <td class="p-3 text-center font-mono text-sm">
                    {{ user.referralCode || '-' }}
                </td>
                <td class="p-3 text-right space-x-2">
                    <button v-if="!user.isPartner" @click="makeUserPartner(user.uid)" class="bg-indigo-600 text-white font-bold py-1 px-3 rounded-md hover:bg-indigo-700 text-xs">
                        Jadikan Mitra
                    </button>
                    <div v-else class="inline-flex items-center gap-2">
                        <button @click="showModal('editReferralCode', { user: user, newReferralCode: user.referralCode })" class="bg-blue-100 text-blue-800 font-bold py-1 px-3 rounded-md hover:bg-blue-200 text-xs">
                            Edit
                        </button>
                        <button @click="showModal('viewNote', { title: 'Kode Rujukan Mitra', content: user.referralCode })" class="bg-slate-200 text-slate-800 font-bold py-1 px-3 rounded-md hover:bg-slate-300 text-xs">
                            Lihat Kode
                        </button>
                    </div>
                </td>
            </tr>
        </tbody>
    </table>
</div>
        </div>

        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 class="text-lg font-semibold text-slate-800 mb-4">Export Data Pelanggan</h3>
            <p class="text-sm text-slate-500 mb-4">Pilih pelanggan dan rentang waktu untuk mengunduh semua data mereka.</p>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-slate-700">Pilih Pelanggan</label>
                    <select v-model="uiState.selectedUserForExport" class="mt-1 w-full p-2 border rounded-md">
                        <option :value="null" disabled>-- Daftar Pelanggan --</option>
                        <option v-for="user in uiState.allUsers" :key="user.uid" :value="user">
                            {{ user.email }}
                        </option>
                    </select>
                </div>
                <div>
    <label class="block text-sm font-medium text-slate-700 mb-1">Filter Waktu</label>
    <select v-model="uiState.exportFilter" class="w-full p-2 border rounded-md capitalize bg-white shadow-sm">
        <option value="today">Hari Ini</option>
        <option value="last_7_days">7 Hari Terakhir</option>
        <option value="last_30_days">30 Hari Terakhir</option>
        <option value="this_year">Tahun Ini</option>
        <option value="by_date_range">Rentang Tanggal</option>
        <option value="by_month_range">Rentang Bulan</option>
        <option value="by_year_range">Rentang Tahun</option>
        <option value="all_time">Semua</option>
    </select>
</div>
<div v-if="uiState.exportFilter === 'by_date_range'" class="mt-2 grid grid-cols-2 gap-2 animate-fade-in">
    <div><label class="block text-xs font-medium mb-1">Dari Tanggal</label><input type="date" v-model="uiState.exportStartDate" class="w-full p-2 border rounded-md bg-white shadow-sm"></div>
    <div><label class="block text-xs font-medium mb-1">Sampai Tanggal</label><input type="date" v-model="uiState.exportEndDate" class="w-full p-2 border rounded-md bg-white shadow-sm"></div>
</div>
<div v-if="uiState.exportFilter === 'by_month_range'" class="mt-2 grid grid-cols-4 gap-2 animate-fade-in">
    <div><label class="block text-xs font-medium">Dari</label><select v-model.number="uiState.exportStartMonth" class="w-full p-2 border rounded-md bg-white shadow-sm"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select></div>
    <div><label class="block text-xs font-medium">Tahun</label><input type="number" v-model.number="uiState.exportStartYear" class="w-full p-2 border rounded-md bg-white shadow-sm"></div>
    <div><label class="block text-xs font-medium">Sampai</label><select v-model.number="uiState.exportEndMonth" class="w-full p-2 border rounded-md bg-white shadow-sm"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select></div>
    <div><label class="block text-xs font-medium">Tahun</label><input type="number" v-model.number="uiState.exportEndYear" class="w-full p-2 border rounded-md bg-white shadow-sm"></div>
</div>
<div v-if="uiState.exportFilter === 'by_year_range'" class="mt-2 grid grid-cols-2 gap-2 animate-fade-in">
    <div><label class="block text-xs font-medium mb-1">Dari Tahun</label><input type="number" v-model.number="uiState.exportStartYear" placeholder="Tahun" class="w-full p-2 border rounded-md bg-white shadow-sm"></div>
    <div><label class="block text-xs font-medium mb-1">Sampai Tahun</label><input type="number" v-model.number="uiState.exportEndYear" placeholder="Tahun" class="w-full p-2 border rounded-md bg-white shadow-sm"></div>
</div>
                <button @click="exportAllDataForUser(
    uiState.selectedUserForExport?.uid, 
    uiState.selectedUserForExport?.email, 
    uiState.exportFilter, 
    uiState.exportStartDate, 
    uiState.exportEndDate, 
    uiState.exportStartMonth, 
    uiState.exportEndMonth, 
    uiState.exportStartYear, 
    uiState.exportEndYear
)" :disabled="!uiState.selectedUserForExport || uiState.isExportingUserData" class="w-full bg-blue-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed">
                    <span v-if="uiState.isExportingUserData">Mengekspor Data...</span>
                    <span v-else>Export Data Pelanggan</span>
                </button>
            </div>
        </div>
        
        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 class="text-lg font-semibold text-slate-800 mb-4">Riwayat Pengajuan Pencairan Komisi (Semua Mitra)</h3>
            <div class="overflow-x-auto max-h-96">
                <table class="w-full text-sm">
                    <thead class="text-left text-slate-500 bg-slate-100 sticky top-0">
                        <tr>
                            <th class="p-3 font-medium">TANGGAL</th>
                            <th class="p-3 font-medium">DETAIL PENCAIRAN</th>
                            <th class="p-3 font-medium text-right">JUMLAH</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        <tr v-if="commissionPayouts.length === 0">
                            <td colspan="3" class="p-4 text-center text-slate-500">Belum ada riwayat pencairan.</td>
                        </tr>
                        <tr v-for="payout in commissionPayouts" :key="payout.id">
                            <td class="p-3 whitespace-nowrap">{{ new Date(payout.tanggal.seconds * 1000).toLocaleDateString('id-ID') }}</td>
                            <td class="p-3">
                                <p class="font-semibold text-slate-700">{{ payout.catatan }}</p>
                            </td>
                            <td class="p-3 text-right font-bold text-green-600">
                                {{ formatCurrency(payout.jumlah) }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 class="text-lg font-semibold text-slate-800 mb-4">Kelola Kode Aktivasi</h3>
            <p class="text-sm text-slate-500 mb-4">
                Buat kode sekali pakai untuk pengguna yang membeli di luar aplikasi (misalnya Shopee).
            </p>
            <div class="flex gap-2 mb-6">
                <input type="text" v-model="newActivationCode" placeholder="Ketik kode kustom (opsional)" class="w-full p-2 border border-slate-300 rounded-md shadow-sm">
                <button @click="createActivationCode" :disabled="isSaving" class="bg-indigo-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400">
                    <span v-if="isSaving">...</span>
                    <span v-else>Buat Kode</span>
                </button>
            </div>
            <div class="overflow-x-auto max-h-96">
    <table class="w-full text-sm">
        <thead class="text-left text-slate-500 bg-slate-100 sticky top-0">
            <tr>
                <th class="p-3 font-medium">KODE AKTIVASI</th>
                <th class="p-3 font-medium text-center">STATUS</th>
                <th class="p-3 font-medium">DIGUNAKAN OLEH</th>
                <th class="p-3 font-medium text-right">AKSI</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
            <tr v-if="activationCodes.length === 0">
                <td colspan="4" class="p-4 text-center text-slate-500">Belum ada kode aktivasi yang dibuat.</td>
            </tr>
            <tr v-for="code in activationCodes" :key="code.id">
                <td class="p-3 font-mono text-indigo-600">{{ code.id }}</td>
                <td class="p-3 text-center">
                    <span class="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                          :class="code.status === 'unused' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'">
                        {{ code.status }}
                    </span>
                </td>
                <td class="p-3 text-slate-500">{{ code.usedByEmail || '-' }}</td>
                <td class="p-3 text-right">
                    <button @click="deleteActivationCode(code.id)" class="text-red-500 hover:text-red-700">
                        <svg class="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>
                </td>
            </tr>
        </tbody>
    </table>
</div>
        </div>

        <!-- 👇👇 BLOK VERIFIKASI YANG SUDAH DIPERBAIKI 👇👇 -->
        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mt-6">
            <h3 class="text-lg font-semibold text-slate-800 mb-4">Verifikasi Pencairan Komisi Mitra</h3>
            <p class="text-sm text-slate-500 mb-4">
                Masukkan ID Pencairan dari email untuk memverifikasi jumlah yang benar.
            </p>
            <form @submit.prevent="verifyCashoutRequest" class="flex gap-2">
                <input 
                    type="text" 
                    v-model="uiState.adminVerificationIdInput" 
                    placeholder="Contoh: WDRW-17..." 
                    class="w-full p-2 border border-slate-300 rounded-md shadow-sm font-mono"
                >
                <button 
                    type="submit" 
                    :disabled="uiState.isVerifying" 
                    class="bg-indigo-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400"
                >
                    <span v-if="uiState.isVerifying">...</span>
                    <span v-else>Verifikasi</span>
                </button>
            </form>

            <div v-if="uiState.adminVerificationResult" class="mt-4 p-4 bg-green-50 border-l-4 border-green-500 text-green-800 animate-fade-in">
                <p class="font-bold text-lg">✅ Verifikasi Berhasil</p>
                <div class="mt-2 space-y-1 text-sm">
                    <p><strong>Jumlah Asli:</strong> <span class="text-2xl font-bold">{{ formatCurrency(uiState.adminVerificationResult.jumlah) }}</span></p>
                    <p><strong>Tanggal Pengajuan:</strong> {{ uiState.adminVerificationResult.tanggal }}</p>
                    <p><strong>Detail:</strong> {{ uiState.adminVerificationResult.catatan }}</p>
                </div>
                <button @click="confirmCashoutPayment(uiState.adminVerificationIdInput)" class="mt-4 w-full bg-green-600 text-white font-bold py-2 rounded-lg hover:bg-green-700">
                    Konfirmasi Pembayaran Selesai
                </button>
            </div>
            <div v-if="uiState.adminVerificationError" class="mt-4 p-4 bg-red-50 border-l-4 border-red-500 text-red-800 animate-fade-in">
                <p class="font-bold text-lg">❌ Gagal Verifikasi</p>
                <p class="text-sm mt-1">{{ uiState.adminVerificationError }}</p>
            </div>
        </div>
        
    </div>
</div>

                    </div>
                </div>
            </div>
        </div>
    </div>


<div v-if="activePage === 'panduan'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">
        <div class="max-w-5xl mx-auto">
            
            <div class="text-center mb-12 animate-fade-in-up">
                <h2 class="text-4xl md:text-5xl font-extrabold text-slate-800">
                    <span class="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Pusat Panduan Aplikasi</span>
                </h2>
                <p class="text-lg text-slate-600 mt-4 max-w-3xl mx-auto">
                    Panduan komprehensif untuk membantu Anda menguasai setiap fitur dan memaksimalkan potensi bisnis Anda.
                </p>
            </div>

            <div class="space-y-4">
                <div v-for="(panduan, index) in panduanData" :key="panduan.title" 
                     class="bg-white/70 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl animate-fade-in-up"
                     :style="{ animationDelay: `${200 + index * 100}ms` }">
                    
                    <div @click="panduanAccordion = panduanAccordion === panduan.title ? null : panduan.title" 
                         class="flex items-center gap-4 p-5 cursor-pointer">
                        <div class="text-3xl flex-shrink-0">{{ panduan.icon }}</div>
                        <div class="flex-1">
                            <h3 class="text-lg font-semibold text-slate-800">{{ panduan.title }}</h3>
                            <p class="text-sm text-slate-500">{{ panduan.subtitle }}</p>
                        </div>
                        <svg class="w-6 h-6 text-slate-400 flex-shrink-0 transition-transform duration-300" 
                             :class="{ 'rotate-180': panduanAccordion === panduan.title }" 
                             fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </div>

                    <div class="accordion-content" :class="{ 'open': panduanAccordion === panduan.title }">
                        <div class="panduan-content p-5 pt-0 pl-16 text-slate-600 leading-relaxed prose prose-sm max-w-none" v-html="panduan.content"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
<div v-if="activePage === 'tentang'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">
        <div class="max-w-4xl mx-auto">
            
            <div class="text-center mb-12 animate-fade-in-up">
                <h2 class="text-4xl md:text-5xl font-extrabold text-slate-800">
                    <span class="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Tentang Fashion OS</span>
                </h2>
                <p class="text-lg text-slate-600 mt-4 max-w-2xl mx-auto">
                    Dibangun dengan privasi, keamanan, dan pertumbuhan bisnis Anda sebagai prioritas utama.
                </p>
            </div>

            <div class="bg-white/70 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-slate-200 mb-8 animate-fade-in-up" style="animation-delay: 200ms;">
                <h3 class="text-2xl font-bold text-slate-800 mb-6 text-center">Privasi & Keamanan Data Anda</h3>
                <ul class="space-y-6">
                    <li class="flex items-start gap-4">
                        <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                             <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                        </div>
                        <div>
                            <h4 class="font-semibold text-slate-800">Arsitektur Data Langsung</h4>
                            <p class="text-sm text-slate-600 mt-1">
                                Aplikasi ini dirancang agar data operasional Anda (penjualan, produk, keuangan) dikirim **langsung dari browser Anda ke database**.Untuk Pihak Pengembang aplikasi tidak memiliki server perantara yang menyimpan atau melihat data sensitif Anda.
                            </p>
                        </div>
                    </li>
                    <li class="flex items-start gap-4">
                        <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        </div>
                        <div>
                            <h4 class="font-semibold text-slate-800">Kontrol Penuh di Tangan Anda</h4>
                            <p class="text-sm text-slate-600 mt-1">
                                Akun Anda terhubung ke database terpusat yang dikelola oleh kami, namun setiap data **selalu ditandai dengan ID unik milik Anda**. Sistem keamanan kami memastikan bahwa Anda hanya bisa mengakses data Anda sendiri, dan kami sebagai pengembang **tidak memiliki akses untuk melihat isi data pribadi setiap pengguna.**
                            </p>
                        </div>
                    </li>
                    <li class="flex items-start gap-4">
                        <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                        </div>
                        <div>
                            <h4 class="font-semibold text-slate-800">Standar Keamanan Tinggi</h4>
                            <p class="text-sm text-slate-600 mt-1">
                                Setiap transmisi data dilindungi oleh enkripsi HTTPS/TLS, protokol keamanan canggih yang sama seperti yang digunakan oleh lembaga perbankan global.
                            </p>
                        </div>
                    </li>
                </ul>
            </div>
            <div class="bg-white/70 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up" style="animation-delay: 300ms;">
                 <h3 class="text-2xl font-bold text-slate-800 mb-6 text-center">Informasi Aplikasi</h3>
                 <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <p class="font-semibold text-slate-600">Dikembangkan oleh</p>
                        <p class="text-slate-800">Arrasyid</p>
                    </div>
                    <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <p class="font-semibold text-slate-600">Informasi Kontak</p>
                        <p><a href="mailto:fashion234oss@gmail.com" class="text-blue-600 hover:underline">fashion234oss@gmail.com</a></p>
                    </div>
                    <div class="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <p class="font-semibold text-slate-600">Versi Aplikasi</p>
                        <p class="text-slate-800">1.0.0 (Build 20250903)</p>
                    </div>
                </div>
            </div>

        </div>
    </div>
</div>

<div v-if="activePage === 'supplier'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8">
        <div class="max-w-7xl mx-auto">

            <div v-show="uiState.activeSupplierView !== 'form'" class="animate-fade-in-up">
                
                <div class="flex flex-wrap justify-between items-center gap-4 mb-8">
                    <div>
                        <h2 class="text-3xl font-bold text-slate-800">Manajemen Supplier</h2>
                        <p class="text-slate-500 mt-1">Kelola data supplier dan riwayat pesanan pembelian Anda.</p>
                    </div>
                    <div class="flex items-center gap-3">
                        <button 
                            v-if="uiState.activeSupplierView === 'produkList'" 
                            @click="uiState.activeSupplierView = 'list'" 
                            class="bg-white border border-slate-300 text-slate-700 font-bold py-2.5 px-5 rounded-lg hover:bg-slate-100 shadow-sm transition-colors"
                        >
                            &laquo; Kembali ke Daftar Supplier
                        </button>
                        <button 
                            v-if="uiState.activeSupplierView === 'list'" 
                            @click="uiState.activeSupplierView = 'produkList'" 
                            class="bg-white border border-slate-300 text-slate-700 font-bold py-2.5 px-5 rounded-lg hover:bg-slate-100 shadow-sm transition-colors"
                        >
                            Lihat Produk Supplier
                        </button>
                        <button 
                            @click="showModal('addSupplier', { name: '', contact: '' })" 
                            class="bg-indigo-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-indigo-700 shadow transition-colors" 
                            :disabled="!isSubscriptionActive"
                        >
                            + Tambah Supplier Baru
                        </button>
                    </div>
                </div>

                <div 
                    v-show="uiState.activeSupplierView === 'list'" 
                    class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200 mb-8"
                >
                    <h3 class="text-xl font-bold text-slate-800 mb-4 pb-4 border-b">Daftar Supplier</h3>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm text-left text-slate-500">
                            <thead class="text-xs text-slate-700 uppercase bg-slate-100/50">
                                <tr>
                                    <th class="px-6 py-3">Nama Supplier</th>
                                    <th class="px-6 py-3">Kontak</th>
                                    <th class="px-6 py-3 text-right" style="width: 250px;">Aksi</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-200/50">
                                <tr v-if="state.suppliers.length === 0">
                                    <td colspan="3" class="p-10 text-center text-slate-500">Tidak ada data supplier.</td>
                                </tr>
                                <tr v-for="supplier in state.suppliers" :key="supplier.id" class="hover:bg-slate-50/50">
                                    <td class="px-6 py-4 font-semibold text-slate-800">{{ supplier.name }}</td>
                                    <td class="px-6 py-4">{{ supplier.contact || '-' }}</td>
                                    <td class="px-6 py-4 text-right space-x-3 whitespace-nowrap" style="width: 250px;">
                                        <button @click="showPenerimaanBarangForm(supplier)" class="font-semibold text-green-500 hover:underline" :disabled="!isSubscriptionActive">Buat Pesanan</button>
                                        <button @click="showModal('editSupplier', JSON.parse(JSON.stringify(supplier)))" class="font-semibold text-blue-500 hover:underline" :disabled="!isSubscriptionActive">Edit</button>
                                        <button @click="deleteSupplier(supplier.id)" class="text-red-500 hover:text-red-700" :disabled="!isSubscriptionActive">
                                            <svg class="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div 
                    v-show="uiState.activeSupplierView === 'list'" 
                    class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200"
                >
                    <h3 class="text-xl font-bold text-slate-800 mb-4 pb-4 border-b">Riwayat Penerimaan Barang</h3>
                    <div class="p-4 bg-slate-50/50 rounded-xl border shadow-sm mb-6">
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                            <div>
                                <label class="block text-sm font-medium mb-1">Cari Supplier / SKU</label>
                                <input type="text" v-model="uiState.purchaseOrderSearch" placeholder="Ketik nama supplier atau SKU..." class="w-full p-2 border rounded-md bg-white shadow-sm">
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">Filter Status Proses</label>
                                <select v-model="uiState.purchaseOrderStatusProsesFilter" class="w-full p-2 border rounded-md bg-white shadow-sm">
                                    <option value="all">Semua Status</option>
                                    <option value="Dalam Proses">Dalam Proses</option>
                                    <option value="Selesai">Selesai</option>
                                    <option value="Revisi">Revisi</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">Filter Status Bayar</label>
                                <select v-model="uiState.purchaseOrderStatusBayarFilter" class="w-full p-2 border rounded-md bg-white shadow-sm">
                                    <option value="all">Semua Status</option>
                                    <option value="Belum Dibayar">Belum Dibayar</option>
                                    <option value="Proses Pembayaran">Proses Pembayaran</option>
                                    <option value="Sudah Dibayar">Sudah Dibayar</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium mb-1">Urutkan</label>
                                <select v-model="uiState.purchaseOrderSort" class="w-full p-2 border rounded-md bg-white shadow-sm">
                                    <option value="tanggal-desc">Tanggal (Terbaru)</option>
                                    <option value="tanggal-asc">Tanggal (Terlama)</option>
                                    <option value="total-desc">Total Nilai (Tertinggi)</option>
                                    <option value="total-asc">Total Nilai (Terendah)</option>
                                </select>
                            </div>
                            <div class="lg:col-span-4">
                                <label class="block text-sm font-medium mb-1">Filter Waktu</label>
                                <div class="flex flex-wrap items-center gap-2">
                                    <select v-model="uiState.purchaseOrderDateFilter" class="flex-grow bg-white border-slate-300 text-sm rounded-lg p-2.5 shadow-sm capitalize">
                                        <option value="all_time">Semua Waktu</option>
                                        <option value="today">Hari Ini</option>
                                        <option value="last_7_days">7 Hari Terakhir</option>
                                        <option value="last_30_days">30 Hari Terakhir</option>
                                        <option value="this_year">Tahun Ini</option>
                                        <option value="by_month_range">Rentang Bulan</option>
                                        <option value="by_year_range">Rentang Tahun</option>
                                    </select>
                                    <div v-if="uiState.purchaseOrderDateFilter === 'by_month_range'" class="flex flex-wrap items-center gap-2">
                                        <select v-model.number="uiState.purchaseOrderStartMonth" class="border-slate-300 text-sm rounded-lg p-2"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select>
                                        <input type="number" v-model.number="uiState.purchaseOrderStartYear" class="w-24 border-slate-300 text-sm rounded-lg p-2" placeholder="Tahun">
                                        <span class="mx-2">s/d</span>
                                        <select v-model.number="uiState.purchaseOrderEndMonth" class="border-slate-300 text-sm rounded-lg p-2"><option v-for="m in 12" :key="m" :value="m">{{ new Date(0, m - 1).toLocaleString('id-ID', { month: 'long' }) }}</option></select>
                                        <input type="number" v-model.number="uiState.purchaseOrderEndYear" class="w-24 border-slate-300 text-sm rounded-lg p-2" placeholder="Tahun">
                                    </div>
                                    <div v-if="uiState.purchaseOrderDateFilter === 'by_year_range'" class="flex items-center gap-2">
                                        <input type="number" v-model.number="uiState.purchaseOrderStartYear" placeholder="Dari Tahun" class="w-full border-slate-300 text-sm rounded-lg p-2">
                                        <span>s/d</span>
                                        <input type="number" v-model.number="uiState.purchaseOrderEndYear" placeholder="Sampai Tahun" class="w-full border-slate-300 text-sm rounded-lg p-2">
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="lg:col-span-4 flex justify-end">
                            <button @click="exportPurchaseOrdersToExcel" class="bg-green-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-green-700 text-sm h-[42px] flex-shrink-0" :disabled="!isSubscriptionActive">
                                Export ke Excel
                            </button>
                        </div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm text-left text-slate-500">
                            <thead class="text-xs text-slate-700 uppercase bg-slate-100/50">
                                <tr>
                                    <th class="px-4 py-3">Tanggal</th>
                                    <th class="px-4 py-3">Supplier</th>
                                    <th class="px-4 py-3">Produk</th>
                                    <th class="px-4 py-3 text-right">Harga</th>
                                    <th class="px-4 py-3 text-center">Jumlah Barang</th>
                                    <th class="px-4 py-3 text-right">Total Nilai Barang</th>
                                    <th class="px-4 py-3">Status Proses</th>
                                    <th class="px-4 py-3">Status Bayar</th>
                                    <th class="px-4 py-3">Retur</th>
                                    <th class="px-4 py-3 text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-200/50">
                                <tr v-if="itemizedPurchaseHistory.length === 0">
                                    <td colspan="10" class="p-10 text-center text-slate-500">Belum ada riwayat penerimaan barang.</td>
                                </tr>
                                <tr v-for="(item, index) in itemizedPurchaseHistory" :key="`${item.orderId}-${index}`" class="hover:bg-slate-50/50">
    <td class="px-4 py-3">{{ new Date(item.tanggal).toLocaleDateString('id-ID') }}</td>
    <td class="px-4 py-3 font-semibold text-slate-800">{{ item.supplierName }}</td>
    <td class="px-4 py-3">
        <p class="font-semibold">{{ item.modelName }}</p>
        <p class="text-xs">{{ item.sku }} ({{ item.color }} / {{ item.size }})</p>
    </td>
    <td class="px-4 py-3 text-right">{{ formatCurrency(item.hargaJual) }}</td>
    <td class="px-4 py-3 text-center font-medium">{{ item.qty }}</td>
    <td class="px-4 py-3 text-right font-bold text-green-600">{{ formatCurrency(item.hargaJual * item.qty) }}</td>
    <td class="px-4 py-3">{{ item.statusProses }}</td>
    <td class="px-4 py-3 text-center">
        <span class="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
              :class="{
                'bg-green-100 text-green-800': item.orderStatusPembayaran === 'Lunas',
                'bg-yellow-100 text-yellow-800': item.orderStatusPembayaran === 'Cicilan',
                'bg-red-100 text-red-800': item.orderStatusPembayaran === 'Belum Dibayar',
              }">
            {{ item.orderStatusPembayaran }}
        </span>
    </td>
    <td class="px-4 py-3">{{ item.returReason || 'Tidak Retur' }}</td>

    <td class="px-4 py-3 text-right space-x-3 whitespace-nowrap">
        <button 
            v-if="item.orderStatusPembayaran !== 'Lunas'" 
            @click="showModal('supplierPayment', filteredPurchaseOrders.find(o => o.id === item.orderId))" 
            class="font-semibold text-green-500 hover:underline">
            Bayar/Cicil
        </button>
        <button @click="showModal('viewPurchaseOrder', JSON.parse(JSON.stringify(filteredPurchaseOrders.find(o => o.id === item.orderId))))" class="font-semibold text-indigo-500 hover:underline">Detail</button>
        <button @click="showEditPenerimaanBarangForm(filteredPurchaseOrders.find(o => o.id === item.orderId))" class="font-semibold text-blue-500 hover:underline">Edit</button>
        <button @click="deletePurchaseOrder(item.orderId)" class="text-red-500 hover:text-red-700">
            <svg class="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
        </button>
    </td>
    </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div v-show="uiState.activeSupplierView === 'produkList'" class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200">
                    <h3 class="text-xl font-bold text-slate-800 mb-4 pb-4 border-b">Riwayat Produk dari Supplier</h3>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm text-left text-slate-500">
                            <thead class="text-xs text-slate-700 uppercase bg-slate-100/50">
                                <tr>
                                    <th class="px-4 py-3">Tanggal</th>
                                    <th class="px-4 py-3">Supplier</th>
                                    <th class="px-4 py-3">Produk</th>
                                    <th class="px-4 py-3 text-right">Harga Beli</th>
                                    <th class="px-4 py-3 text-center">Qty</th>
                                    <th class="px-4 py-3 text-center">Status Inventaris</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-200/50">
                                <tr v-if="itemizedPurchaseHistory.length === 0">
                                    <td colspan="6" class="p-10 text-center text-slate-500">Belum ada riwayat penerimaan barang.</td>
                                </tr>
                                <tr v-for="(item, index) in itemizedPurchaseHistory" :key="`${item.orderId}-${index}`" class="hover:bg-slate-50/50">
                                    <td class="px-4 py-3">{{ new Date(item.tanggal).toLocaleDateString('id-ID') }}</td>
                                    <td class="px-4 py-3 font-semibold text-slate-800">{{ item.supplierName }}</td>
                                    <td class="px-4 py-3">
                                        <p class="font-semibold">{{ item.modelName }}</p>
                                        <p class="text-xs">{{ item.sku }} ({{ item.color }} / {{ item.size }})</p>
                                    </td>
                                    <td class="px-4 py-3 text-right">{{ formatCurrency(item.hargaJual) }}</td>
                                    <td class="px-4 py-3 text-center font-medium">{{ item.qty }}</td>
                                    <td class="px-4 py-3 text-center">
                                        <span v-if="item.isInventoried" class="text-green-600 font-bold flex items-center justify-center text-xs">
                                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
                                            Sudah Masuk
                                        </span>
                                        <button 
                                            v-else 
                                            @click="addPurchaseOrderItemToInventory(item)" 
                                            class="bg-blue-600 text-white font-bold text-xs py-1 px-3 rounded-md hover:bg-blue-700" 
                                            :disabled="!isSubscriptionActive"
                                        >
                                            Masukkan ke Inventaris
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div v-if="uiState.activeSupplierView === 'form'" class="animate-fade-in-up">
                <div class="flex justify-between items-center mb-8">
                    <div>
                        <h2 class="text-3xl font-bold text-slate-800">Penerimaan Barang</h2>
                        <p class="text-slate-500 mt-1">Buat pesanan baru dari supplier: <span class="font-semibold">{{ uiState.penerimaanBarangForm.supplierName }}</span></p>
                    </div>
                </div>

                <div class="bg-white/70 backdrop-blur-sm p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200">
                    <form @submit.prevent="submitPenerimaanBarang" class="space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label class="block text-sm font-medium">Tanggal</label>
                                <input type="date" v-model="uiState.penerimaanBarangForm.tanggal" class="mt-1 w-full p-2 border rounded-md" required>
                            </div>
                            <div>
                                <label class="block text-sm font-medium">Catatan</label>
                                <input type="text" v-model="uiState.penerimaanBarangForm.catatan" class="mt-1 w-full p-2 border rounded-md">
                            </div>
                            <div class="relative">
                                <label class="block text-sm font-medium">Pilih Produk</label>
                                <div class="flex gap-2">
                                    <select v-model="uiState.selectedProductForPurchase" class="mt-1 w-full p-2 border rounded-md" :class="{'text-slate-400': !uiState.selectedProductForPurchase}" required>
                                        <option :value="null" disabled>-- Pilih Produk Inventaris --</option>
                                        <option v-for="product in state.produk" :key="product.sku" :value="product">{{ product.nama }} ({{ product.sku }})</option>
                                    </select>
                                    <button @click.prevent="addProductFromSelection" type="button" class="bg-indigo-600 text-white font-bold px-4 rounded-lg flex-shrink-0" :disabled="!uiState.selectedProductForPurchase">+ Tambah</button>
                                </div>
                            </div>
                        </div>

                        <div class="mt-8">
                            <h4 class="text-lg font-bold mb-2">Daftar Produk Pesanan</h4>
                            <div class="overflow-x-auto max-h-96">
                                <table class="w-full text-sm text-left text-slate-500">
                                    <thead class="text-xs text-slate-700 uppercase bg-slate-100/50 sticky top-0">
                                        <tr>
                                            <th class="px-4 py-3">Produk</th>
                                            <th class="px-4 py-3 text-right">Harga Jual</th>
                                            <th class="px-4 py-3 text-center">Qty</th>
                                            <th class="px-4 py-3 text-right">Total</th>
                                            <th class="px-4 py-3">Status Proses</th>
                                            <th class="px-4 py-3">Status Bayar</th>
                                            <th class="px-4 py-3">Retur</th>
                                            <th class="px-4 py-3">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-if="uiState.penerimaanBarangForm.produk.length === 0">
                                            <td colspan="8" class="p-4 text-center text-slate-500">Daftar pesanan kosong.</td>
                                        </tr>
                                        <tr v-for="(p, index) in uiState.penerimaanBarangForm.produk" :key="p.sku">
                                            <td class="px-4 py-3">
                                                <p class="font-semibold text-slate-800">{{ p.nama }}</p>
                                                <p class="text-xs">{{ p.sku }} ({{ p.warna }} / {{ p.varian }})</p>
                                            </td>
                                            <td class="px-4 py-3">
                                                <input type="number" v-model.number="p.hargaJual" class="w-full p-1 border rounded-md text-sm text-right">
                                            </td>
                                            <td class="px-4 py-3">
                                                <input type="number" v-model.number="p.qty" class="w-20 p-1 border rounded-md text-sm text-center">
                                            </td>
                                            <td class="px-4 py-3 text-right font-bold text-indigo-600">
                                                {{ formatCurrency(p.hargaJual * p.qty) }}
                                            </td>
                                            <td class="px-4 py-3">
                                                <select v-model="p.statusProses" class="w-full p-1 border rounded-md text-xs">
                                                    <option>Dalam Proses</option>
                                                    <option>Selesai</option>
                                                    <option>Revisi</option>
                                                </select>
                                            </td>
                                            <td class="px-4 py-3">
                                                <select v-model="p.statusPembayaran" class="w-full p-1 border rounded-md text-xs">
                                                    <option>Belum Dibayar</option>
                                                    <option>Proses Pembayaran</option>
                                                    <option>Sudah Dibayar</option>
                                                </select>
                                            </td>
                                            <td class="px-4 py-3">
                                                <select v-model="p.returReason" class="w-full p-1 border rounded-md text-xs">
                                                    <option :value="null">Tidak Retur</option>
                                                    <option>Cacat</option>
                                                    <option>Salah Warna</option>
                                                    <option>Salah Ukuran</option>
                                                </select>
                                            </td>
                                            <td class="px-4 py-3">
                                                <button @click.prevent="removeProductFromPenerimaanBarang(index)" type="button" class="text-red-500 hover:underline text-xs">Hapus</button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="mt-4 p-4 border rounded-lg bg-slate-50">
    <h4 class="text-base font-semibold mb-2">Informasi Pembayaran</h4>
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div>
            <label class="block text-sm font-medium">Total Tagihan</label>
            <p class="font-bold text-lg text-indigo-600">{{ formatCurrency(totalYangHarusDibayarkan) }}</p>
        </div>
        <div>
            <label class="block text-sm font-medium">Dibayarkan (DP)</label>
            <input type="number" v-model.number="uiState.penerimaanBarangForm.dibayarkan" class="mt-1 w-full p-2 border rounded-md text-right" placeholder="0">
        </div>
         <div>
            <label class="block text-sm font-medium">Tgl. Bayar</label>
            <input type="date" v-model="uiState.penerimaanBarangForm.tanggalPembayaran" class="mt-1 w-full p-2 border rounded-md">
        </div>
        <div>
            <label class="block text-sm font-medium">Sisa Tagihan</label>
            <p class="font-bold text-lg text-red-600">{{ formatCurrency(sisaPembayaran) }}</p>
        </div>
    </div>
</div>

                        <div class="flex justify-end gap-3 mt-8 pt-4 border-t">
                            <button @click.prevent="hidePenerimaanBarangForm" type="button" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
                            <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan Penerimaan</button>
                        </div>
                    </form>
                </div>
            </div>
            
        </div>
    </div>
</div>

<div v-if="activePage === 'langganan'">
    <div class="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-indigo-100 p-4 sm:p-8 flex items-center justify-center">

        <div v-if="currentUser?.userData?.subscriptionStatus === 'active' && new Date(currentUser.userData.subscriptionEndDate?.seconds * 1000) > Date.now()" class="w-full max-w-4xl animate-fade-in">
            <div class="bg-white p-8 sm:p-12 rounded-2xl shadow-2xl border border-green-200 flex flex-col items-center">
                <div class="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h2 class="text-3xl font-bold text-slate-800 mb-2">Langganan Anda Aktif! 🎉</h2>
                <p class="text-slate-600 mb-6 max-w-xl text-center">
                    Selamat, Anda memiliki akses penuh ke semua fitur premium kami.
                </p>
                <div class="bg-green-50 text-green-800 px-6 py-4 rounded-lg w-full text-center border border-green-200">
                    <p class="text-lg font-semibold">Status Langganan: Aktif</p>
                    <p v-if="currentUser?.userData?.subscriptionEndDate" class="text-sm mt-1">
                        Berakhir pada: {{ new Date(currentUser.userData.subscriptionEndDate.seconds * 1000).toLocaleString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
                    </p>
                </div>
            </div>
        </div>
        
        <div v-else-if="currentUser?.userData?.subscriptionStatus === 'trial' && new Date(currentUser.userData.trialEndDate?.seconds * 1000) > Date.now()" class="w-full max-w-4xl animate-fade-in">
            <div class="bg-white p-8 sm:p-12 rounded-2xl shadow-2xl border border-blue-200 flex flex-col items-center">
                <div class="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h2 class="text-3xl font-bold text-slate-800 mb-2">Masa Uji Coba Gratis Anda Aktif!</h2>
                <p class="text-slate-600 mb-6 max-w-xl text-center">
                    Nikmati semua fitur premium selama masa uji coba. Untuk melanjutkan setelahnya, silakan pilih paket langganan.
                </p>
                <div class="bg-blue-50 text-blue-800 px-6 py-4 rounded-lg w-full text-center border border-blue-200">
                    <p class="text-lg font-semibold">Status: Uji Coba (Trial)</p>
                    <p v-if="currentUser?.userData?.trialEndDate" class="text-sm mt-1">
                        Berakhir pada: {{ new Date(currentUser.userData.trialEndDate.seconds * 1000).toLocaleString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
                    </p>
                </div>
            </div>
        </div>
        
        <div v-else class="max-w-5xl mx-auto text-center">
            <h2 class="text-4xl md:text-5xl font-extrabold text-slate-800 animate-fade-in-up">
                <span class="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Mulai Langganan Anda</span>
            </h2>
            <p class="text-lg text-slate-600 mt-4 mb-10 max-w-2xl mx-auto animate-fade-in-up" style="animation-delay: 100ms;">
                Pilih paket di bawah ini atau masukkan kode aktivasi jika Anda sudah melakukan pembayaran di luar aplikasi.
            </p>

            <div class="max-w-xl mx-auto mb-8 p-6 rounded-xl border-2 border-dashed border-green-400 bg-white/70 backdrop-blur-sm text-left animate-fade-in-up" style="animation-delay: 200ms;">
                <h3 class="text-lg font-semibold text-green-700">Punya Kode Aktivasi? (Dari Shopee, dll.)</h3>
                <p class="text-sm text-slate-600 mb-2">
                    Jika Anda sudah membayar, masukkan kode aktivasi yang Anda terima di sini untuk mengaktifkan langganan Anda.
                </p>
                <div class="flex gap-2">
                    <input type="text" v-model="activationCodeInput" class="w-full p-2 border bg-white/50 border-slate-300 rounded-md text-slate-800 placeholder-slate-400" placeholder="Masukkan Kode Aktivasi...">
                    <button @click.prevent="handleActivation" :disabled="isSaving" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-400">
                        <span v-if="isSaving && activationCodeMessage">...</span>
                        <span v-else>Aktifkan</span>
                    </button>
                </div>
                <p v-if="activationCodeMessage" class="mt-2 text-xs font-medium text-red-600">
                    {{ activationCodeMessage }}
                </p>
            </div>
            
            <div class="max-w-xl mx-auto mb-12 p-6 rounded-xl border border-dashed border-indigo-300 bg-white/70 backdrop-blur-sm text-left animate-fade-in-up" style="animation-delay: 300ms;">
                <h3 class="text-lg font-semibold text-indigo-700">Punya Kode Rujukan? (Untuk Diskon)</h3>
                <p v-if="!currentUser?.userData?.referredBy" class="text-sm text-slate-600 mb-2">
                    Silahkan masukan kodenya.
                </p>
                <div v-if="!currentUser?.userData?.referredBy" class="flex gap-2">
    <input type="text" v-model="uiState.referralCodeInput" class="w-full p-2 border bg-white/50 border-slate-300 rounded-md text-slate-800 placeholder-slate-400">
    <button @click.prevent="applyReferralCode" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors">Terapkan</button>
</div>
                <p v-if="uiState.referralCodeMessage" class="mt-2 text-xs font-medium" :class="uiState.referralCodeApplied ? 'text-green-600' : 'text-red-500'">
                    {{ uiState.referralCodeMessage }}
                </p>
                <p v-if="currentUser?.userData?.referredBy" class="text-sm text-green-600 font-medium">
                    Selamat! Diskon rujukan sudah berlaku selamanya untuk akun Anda.
                </p>
            </div>
            
            <div class="flex flex-col md:flex-row items-center justify-center gap-8">
                <div class="bg-white p-8 rounded-2xl shadow-lg border w-full md:w-96 transform hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 animate-fade-in-up" style="animation-delay: 400ms;">
                    <h3 class="text-xl font-semibold text-slate-800">Paket Bulanan</h3>
                    <div v-if="uiState.referralCodeApplied || currentUser?.userData?.referredBy" class="my-4">
                        <p class="text-2xl font-bold line-through text-slate-400">{{ formatCurrency(monthlyPrice) }}</p>
                        <p class="text-4xl font-bold text-green-600">{{ formatCurrency(discountedMonthlyPrice) }} <span class="text-base font-normal text-slate-500">/bulan</span></p>
                    </div>
                    <p v-else class="text-4xl font-bold my-4 text-slate-900">
                        {{ formatCurrency(monthlyPrice) }} <span class="text-base font-normal text-slate-500">/bulan</span>
                    </p>
                    <ul class="text-left space-y-3 text-slate-600 mt-6">
                        <li class="flex items-center gap-3"><svg class="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>Akses semua fitur</li>
                        <li class="flex items-center gap-3"><svg class="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>Dukungan prioritas</li>
                        <li class="flex items-center gap-3"><svg class="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>Update berkala</li>
                    </ul>
                    <button @click="handleSubscriptionMayar('bulanan')" :disabled="isSubscribingMonthly" class="mt-8 w-full border border-indigo-600 text-indigo-600 font-bold py-3 px-8 rounded-lg hover:bg-indigo-50 transition-colors disabled:bg-slate-200 disabled:text-slate-500 disabled:border-slate-200">
                        <span v-if="isSubscribingMonthly">Memproses...</span>
                        <span v-else>Pilih Paket Bulanan</span>
                    </button>
                </div>

                <div class="relative bg-white p-8 rounded-2xl shadow-2xl border-2 border-indigo-500 w-full md:w-96 transform hover:-translate-y-2 hover:shadow-indigo-200 transition-all duration-300 animate-fade-in-up" style="animation-delay: 500ms;">
                    <div class="absolute top-0 right-6 -mt-3 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Paling Hemat</div>
                    <h3 class="text-xl font-semibold text-slate-800">Paket Tahunan</h3>
                    <div v-if="uiState.referralCodeApplied || currentUser?.userData?.referredBy" class="my-4">
                        <p class="text-2xl font-bold line-through text-slate-400">{{ formatCurrency(yearlyPrice) }}</p>
                        <p class="text-4xl font-bold text-green-600">{{ formatCurrency(discountedYearlyPrice) }} <span class="text-base font-normal text-slate-500">/tahun</span></p>
                    </div>
                    <p v-else class="text-4xl font-bold my-4 text-slate-900">
                        {{ formatCurrency(yearlyPrice) }} <span class="text-base font-normal text-slate-500">/tahun</span>
                    </p>
                    <ul class="text-left space-y-3 text-slate-600 mt-6">
                        <li class="flex items-center gap-3"><svg class="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>Akses semua fitur</li>
                        <li class="flex items-center gap-3"><svg class="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>Dukungan prioritas</li>
                        <li class="flex items-center gap-3"><svg class="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>Update berkala</li>
                        <li class="flex items-center gap-3 font-semibold text-green-600"><svg class="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Diskon setara 2 bulan!</li>
                    </ul>
                    <button @click="handleSubscriptionMayar('tahunan')" :disabled="isSubscribingYearly" class="mt-8 w-full bg-indigo-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/30 disabled:bg-slate-400 disabled:shadow-none">
                         <span v-if="isSubscribingYearly">Memproses...</span>
                        <span v-else>Pilih Paket Tahunan</span>
                    </button>
                </div>
            </div>
        </div>

    </div>
</div>

</div>
</main>
    </div>

    <!-- Modal System -->
     
    <div v-if="uiState.isModalVisible" class="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-start justify-center p-20">        


<div v-if="uiState.modalType === 'viewPurchaseOrder'" class="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-start justify-center p-20">
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-5xl w-full h-full md:max-h-[90vh] flex flex-col">
        <h3 class="text-xl font-bold mb-4">Detail Penerimaan Barang</h3>
        
        <div class="flex-1 overflow-y-auto pr-2">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mb-6">
                <div>
                    <p class="text-sm text-slate-500">ID Pesanan:</p>
                    <p class="font-mono text-sm font-semibold text-slate-800">{{ uiState.modalData.id }}</p>
                </div>
                <div>
                    <p class="text-sm text-slate-500">Supplier:</p>
                    <p class="font-bold text-lg text-indigo-600">{{ uiState.modalData.supplierName }}</p>
                </div>
                <div>
                    <p class="text-sm text-slate-500">Tanggal:</p>
                    <p class="font-semibold">{{ new Date(uiState.modalData.tanggal).toLocaleDateString('id-ID') }}</p>
                </div>
                <div>
                    <p class="text-sm text-slate-500">Total Nilai QTY:</p>
                    <p class="font-bold text-lg text-green-600">{{ formatCurrency(uiState.modalData.totalQtyValue) }}</p>
                </div>
            </div>
    
            <div v-if="uiState.modalData.statusPembayaran === 'Proses Pembayaran'" class="md:col-span-2">
                <h4 class="text-base font-semibold mb-2 mt-4 border-t pt-4">Status Pembayaran Parsial</h4>
                <div class="grid grid-cols-3 gap-4">
                    <div>
                        <label class="block text-sm font-medium">Total Tagihan</label>
                        <p class="font-bold text-lg text-indigo-600">{{ formatCurrency(uiState.modalData.totalQtyValue) }}</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium">Sudah Dibayarkan</label>
                        <p class="font-bold text-lg">{{ formatCurrency(uiState.modalData.dibayarkan) }}</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium">Sisa Pembayaran</label>
                        <p class="font-bold text-lg text-red-600">{{ formatCurrency(uiState.modalData.totalQtyValue - uiState.modalData.dibayarkan) }}</p>
                    </div>
                </div>
            </div>
            <h4 class="text-lg font-bold mt-4 mb-2">Daftar Produk</h4>
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left text-slate-500">
                    <thead class="text-xs text-slate-700 uppercase bg-slate-100/50 sticky top-0">
                        <tr>
                            <th class="px-4 py-3">Produk</th>
                            <th class="px-4 py-3 text-right">Harga Jual</th>
                            <th class="px-4 py-3 text-center">Qty</th>
                            <th class="px-4 py-3">Status Proses</th>
                            <th class="px-4 py-3">Status Bayar</th>
                            <th class="px-4 py-3">Retur</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(p, index) in uiState.modalData.produk" :key="index">
                            <td class="px-4 py-3">
                                <p class="font-semibold text-slate-800">{{ p.modelName }}</p>
                                <p class="text-xs">{{ p.sku }} ({{ p.color }} / {{ p.size }})</p>
                            </td>
                            <td class="px-4 py-3 text-right">{{ formatCurrency(p.hargaJual) }}</td>
                            <td class="px-4 py-3 text-center">{{ p.qty }}</td>
                            <td class="px-4 py-3">{{ p.statusProses }}</td>
                            <td class="px-4 py-3">{{ p.statusPembayaran }}</td>
                            <td class="px-4 py-3">{{ p.returReason || 'Tidak Retur' }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
            <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg">Tutup</button>
        </div>
    </div>
</div>

<div v-if="uiState.modalType === 'notesModal'" class="bg-white rounded-lg shadow-xl p-6 max-w-5xl w-full h-full md:max-h-[90vh] flex flex-col">
        <div class="flex-shrink-0 pb-4 border-b">
            <h3 class="text-2xl font-bold text-slate-800">Catatan Masa Berakhir Voucher</h3>
            <p class="text-slate-500 mt-1">Lacak masa berlaku voucher agar promosi tidak terlewat.</p>
        </div>
        <div class="flex-1 overflow-y-auto py-4 pr-2 space-y-6">
            <div class="p-4 bg-slate-50 rounded-lg border">
                <form @submit.prevent="submitVoucherNote" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <h4 class="col-span-full font-semibold text-lg text-indigo-700">Tambah Catatan Baru</h4>
                    <div>
                        <label class="block text-sm font-medium">Tipe Voucher</label>
                        <select v-model="uiState.notesData.type" class="mt-1 w-full p-2 border rounded-md">
                            <option value="model">Per Model Produk</option>
                            <option value="channel">Per Akun Penjualan</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium">Jenis Voucher</label>
                        <select v-model="uiState.notesData.voucherType" class="mt-1 w-full p-2 border rounded-md" required>
    <option value="" disabled>-- Pilih Jenis Voucher --</option>
    <option v-for="type in filteredVoucherTypes" :key="type" :value="type">
        {{ type }}
    </option>
</select>
                    </div>
                    <template v-if="uiState.notesData.voucherType">
                        <div v-if="uiState.notesData.type === 'model'">
                            <label class="block text-sm font-medium">Pilih Model Produk</label>
                            <select v-model="uiState.notesData.modelName" class="mt-1 w-full p-2 border rounded-md" required>
                                <option value="">-- Pilih Model --</option>
                                <option v-for="model in promosiProductModels" :key="model" :value="model">{{ model }}</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium">Pilih Akun Penjualan</label>
                            <select v-model="uiState.notesData.channelId" class="mt-1 w-full p-2 border rounded-md" required>
                                <option value="">-- Pilih Channel --</option>
                                <option v-for="channel in state.settings.marketplaces" :key="channel.id" :value="channel.id">{{ channel.name }}</option>
                            </select>
                        </div>
                    </template>
                    <div>
                        <label class="block text-sm font-medium">Nama Voucher</label>
                        <input type="text" v-model="uiState.notesData.title" class="mt-1 w-full p-2 border rounded-md" required>
                    </div>
                    <div class="grid grid-cols-3 gap-2">
                        <div>
                            <label class="block text-sm font-medium">Tgl Berakhir</label>
                            <input type="date" v-model="uiState.notesData.endDate" class="mt-1 w-full p-2 border rounded-md" required>
                        </div>
                        <div>
                            <label class="block text-sm font-medium">Jam</label>
                            <input type="number" v-model.number="uiState.notesData.endHour" min="0" max="23" class="mt-1 w-full p-2 border rounded-md" required>
                        </div>
                        <div>
                            <label class="block text-sm font-medium">Menit</label>
                            <input type="number" v-model.number="uiState.notesData.endMinute" min="0" max="59" class="mt-1 w-full p-2 border rounded-md" required>
                        </div>
                    </div>
                    <div class="col-span-full flex justify-end">
                        <button type="submit" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">Simpan Catatan</button>
                    </div>
                </form>
            </div>
            <div class="p-4 bg-white rounded-lg border">
                <h4 class="font-semibold text-lg text-slate-800 mb-4">Daftar Catatan Voucher</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div>
                        <label class="block text-sm font-medium">Cari</label>
                        <input type="text" v-model="uiState.notesSearch" placeholder="Cari model/channel..." class="mt-1 w-full p-2 border rounded-md">
                    </div>
                    <div>
                        <label class="block text-sm font-medium">Filter Tipe</label>
                        <select v-model="uiState.notesFilterType" class="mt-1 w-full p-2 border rounded-md">
                            <option value="all">Semua Tipe</option>
                            <option value="model">Per Model</option>
                            <option value="channel">Per Akun</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium">Filter Model</label>
                        <select v-model="uiState.notesFilterModel" class="mt-1 w-full p-2 border rounded-md">
                            <option value="">Semua Model</option>
                            <option v-for="model in promosiProductModels" :key="model" :value="model">{{ model }}</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-medium">Filter Akun</label>
                        <select v-model="uiState.notesFilterChannel" class="mt-1 w-full p-2 border rounded-md">
                            <option value="">Semua Akun</option>
                            <option v-for="channel in state.settings.marketplaces" :key="channel.id" :value="channel.id">{{ channel.name }}</option>
                        </select>
                    </div>
                </div>
                <div class="overflow-x-auto max-h-[40vh]">
                    <table class="min-w-full text-sm text-left text-slate-500">
                        <thead class="text-xs text-slate-700 uppercase bg-slate-100/50 sticky top-0">
                            <tr>
                                <th class="px-4 py-3">Voucher</th>
                                <th class="px-4 py-3">Berakhir pada</th>
                                <th class="px-4 py-3">Tipe</th>
                                <th class="px-4 py-3">Detail</th>
                                <th class="px-4 py-3 text-center">Aksi</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200/50">
                            <tr v-if="filteredVoucherNotes.length === 0">
                                <td colspan="5" class="p-4 text-center text-slate-500">Tidak ada catatan voucher.</td>
                            </tr>
                            <tr v-for="note in filteredVoucherNotes" :key="note.id" class="hover:bg-slate-50/50">
                                <td class="px-4 py-3 font-semibold text-slate-800">{{ note.title }}</td>
                                <td class="px-4 py-3 whitespace-nowrap">{{ new Date(note.endDate).toLocaleString('id-ID') }}</td>
                                <td class="px-4 py-3 capitalize">{{ note.type }}</td>
                                <td class="px-4 py-3">{{ note.modelName || note.channelName }}</td>
                                <td class="px-4 py-3 text-center">
                                    <button @click="deleteVoucherNote(note.id)" class="text-red-500 hover:underline text-xs font-bold">Hapus</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
            <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
        </div>
    </div>
    
    

<div v-if="uiState.nestedModalType === 'hppCalculationInfo'" class="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full">
        <div v-if="uiState.nestedModalData.topic === 'ideal'">
            <h3 class="text-lg font-bold text-slate-800 mb-2">Apa itu HPP Ideal/Pcs?</h3>
            <p class="text-sm text-slate-600">Ini adalah biaya modal per produk jika hasil produksi **sesuai dengan target** (tidak ada selisih).</p>
            <p class="font-mono text-xs mt-2 bg-slate-100 p-2 rounded">Rumus: Total Biaya Produksi / Target Qty</p>
        </div>
        <div v-if="uiState.nestedModalData.topic === 'loss'">
            <h3 class="text-lg font-bold text-slate-800 mb-2">Apa itu Kerugian/Pcs?</h3>
            <p class="text-sm text-slate-600">Ini adalah **tambahan biaya modal** yang dibebankan ke setiap produk jadi karena adanya selisih (hasil produksi lebih sedikit dari target). Biaya dari produk yang gagal dibuat "ditanggung" oleh produk yang berhasil dibuat.</p>
            <p class="font-mono text-xs mt-2 bg-slate-100 p-2 rounded">Rumus: HPP Final - HPP Ideal</p>
        </div>
        <div v-if="uiState.nestedModalData.topic === 'final'">
            <h3 class="text-lg font-bold text-slate-800 mb-2">Apa itu HPP Final/Pcs?</h3>
            <p class="text-sm text-slate-600">Ini adalah **biaya modal riil** untuk setiap produk yang berhasil dibuat, sudah termasuk menanggung biaya kerugian dari produk yang gagal diproduksi.</p>
            <p class="font-mono text-xs mt-2 bg-slate-100 p-2 rounded">Rumus: Total Biaya Produksi / Aktual Jadi</p>
        </div>
        <div class="flex justify-end mt-4 pt-4 border-t">
            <button @click="hideNestedModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Mengerti</button>
        </div>
    </div>
</div>

<div v-if="uiState.modalType === 'addSupplier' || uiState.modalType === 'editSupplier'" class="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-start justify-center p-20">
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full h-full md:max-h-[50vh] flex flex-col">
        <h3 class="text-xl font-bold mb-4">{{ uiState.modalType === 'addSupplier' ? 'Tambah Supplier Baru' : 'Edit Supplier' }}</h3>
        <form @submit.prevent="uiState.modalType === 'addSupplier' ? addSupplier() : updateSupplier()" class="space-y-4">
            <div>
                <label class="block text-sm font-medium">Nama Supplier</label>
                <input type="text" v-model="uiState.modalData.name" class="mt-1 w-full p-2 border rounded-md" required>
            </div>
            <div>
                <label class="block text-sm font-medium">Kontak (Opsional)</label>
                <input type="text" v-model="uiState.modalData.contact" class="mt-1 w-full p-2 border rounded-md" placeholder="Contoh: 0812xxxxxx">
            </div>
            <div class="flex justify-end gap-3 pt-4 border-t mt-4">
                <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
                <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg" :disabled="!isSubscriptionActive">Simpan</button>
            </div>
        </form>
    </div>
</div>



<div v-if="uiState.modalType === 'inventarisInfo'" class="bg-white rounded-lg shadow-xl p-6 max-w-5xl w-full h-full md:max-h-[90vh] flex flex-col">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Panduan Manajemen Inventaris</h3>
        <p class="text-slate-500 mt-1">Pusat kendali untuk semua data produk dan stok Anda.</p>
    </div>
    
    <div class="flex-1 overflow-y-auto py-4 pr-2">
        <div class="space-y-6 text-slate-700 leading-relaxed">
            
            <div class="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h4 class="font-semibold text-lg text-indigo-700">Konsep Kunci: Stok Fisik vs. Alokasi Stok</h4>
                <p class="mt-1 text-sm">
                    Untuk mencegah *overselling* (menjual barang yang stoknya habis), sistem ini membedakan dua jenis stok:
                </p>
                <ul class="list-disc list-inside ml-4 mt-2 space-y-3 text-sm">
                    <li>
                        <strong>Stok Fisik:</strong> Ini adalah **sumber kebenaran utama**. Angka ini menunjukkan jumlah total produk yang secara nyata ada di gudang Anda. Stok ini hanya berubah saat ada penjualan, retur, atau penyesuaian manual.
                        <br>
                        <em>Analogi: Total air di dalam sebuah tandon utama.</em>
                    </li>
                    <li>
                        <strong>Alokasi Stok:</strong> Ini adalah "jatah" stok yang Anda putuskan untuk **ditampilkan** di setiap marketplace. Anda bisa mengalokasikan stok secara berbeda untuk setiap toko.
                        <br>
                        <em>Analogi: Jumlah air yang Anda tuang dari tandon utama ke dalam botol-botol terpisah (Botol Shopee, Botol Tokopedia, dll). Total air di semua botol tidak bisa melebihi air di tandon.</em>
                    </li>
                </ul>
            </div>

            <div class="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h4 class="font-semibold text-lg text-indigo-700">Fungsi Tombol Utama</h4>
                 <ul class="list-disc list-inside ml-4 mt-2 space-y-2 text-sm">
                    <li><strong>+ Tambah Produk Baru:</strong> Gunakan tombol ini untuk mendaftarkan produk atau varian baru ke dalam sistem untuk **pertama kalinya**. Produk yang baru dibuat akan memiliki stok awal 0.</li>
                    <li><strong>Penyesuaian Stok:</strong> Gunakan tombol ini untuk mengubah jumlah stok secara manual di luar transaksi normal. Ini penting untuk:
                        <ul>
                            <li>- Mencatat stok awal saat pertama kali input produk.</li>
                            <li>- Menyesuaikan stok setelah melakukan stok opname.</li>
                            <li>- Mencatat barang hilang atau rusak (pengurangan stok).</li>
                        </ul>
                    </li>
                </ul>
            </div>
             <div class="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h4 class="font-semibold text-lg text-indigo-700">Filter & Pencarian</h4>
                <p class="mt-1 text-sm">
                    Gunakan panel filter untuk menemukan produk dengan cepat berdasarkan **Nama Produk** atau **Status Stok** (Aman, Menipis, Habis) yang batasnya Anda atur sendiri di halaman Pengaturan.
                </p>
            </div>
        </div>
    </div>

    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Mengerti</button>
    </div>
</div>

<div v-if="uiState.modalType === 'produksiInfo'" class="bg-white rounded-lg shadow-xl p-6 max-w-5xl w-full h-full md:max-h-[90vh] flex flex-col">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Panduan Halaman Manajemen Produksi</h3>
        <p class="text-slate-500 mt-1">Pusat kendali untuk melacak, menganalisis, dan mengelola seluruh alur kerja produksi Anda.</p>
    </div>
    
    <div class="flex-1 overflow-y-auto py-4 pr-2">
        <div class="space-y-6 text-slate-700 leading-relaxed">
            
            <div class="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h4 class="font-semibold text-lg text-indigo-700">Laporan & Analisis</h4>
                <p class="mt-1 text-sm">
                    Ini adalah pusat intelijen bisnis untuk operasional produksi Anda. Setiap tombol di sini menyajikan data dari sudut pandang yang berbeda untuk membantu Anda mengambil keputusan yang lebih baik.
                </p>
                <ul class="list-disc list-inside ml-4 mt-2 space-y-3 text-sm">
                    <li><strong>Analisis Model:</strong> Alat paling kuat untuk mengukur efisiensi. Fitur ini membandingkan **Target Kuantitas** (berdasarkan standar yard) dengan **Aktual Jadi** untuk setiap item produksi, lalu menyorot mana yang paling untung (selisih positif) dan mana yang paling rugi (selisih negatif). Gunakan ini untuk mengevaluasi kinerja pemaklun atau penjahit.</li>
                    <li><strong>Ringkasan Jadi:</strong> Menampilkan rekapitulasi total kuantitas produk yang sudah jadi, dikelompokkan berdasarkan model, kain, warna, dan ukuran. Cocok untuk melihat ringkasan cepat hasil produksi.</li>
                    <li><strong>Laporan per Status:</strong> Memungkinkan Anda memfilter dan melihat semua batch produksi berdasarkan statusnya (misal, tampilkan semua yang "Selesai" untuk proses pembayaran, atau semua yang "Dalam Proses" untuk pemantauan).</li>
                    <li><strong>Laporan Semuanya:</strong> Tampilan master yang menggabungkan semua detail dari setiap item di semua batch produksi ke dalam satu tabel besar. Ini adalah sumber data utama untuk ekspor ke Excel dan analisis mendalam.</li>
                </ul>
            </div>

            <div class="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h4 class="font-semibold text-lg text-indigo-700">Filter & Pencarian</h4>
                <p class="mt-1 text-sm">
                    Gunakan panel ini untuk menemukan batch produksi spesifik dengan cepat.
                </p>
                 <ul class="list-disc list-inside ml-4 mt-2 space-y-1 text-sm">
                    <li><strong>Kolom Cari:</strong> Masukkan ID Batch, kode unik item (misal: 12ABC), nama pemaklun/penjahit, atau nama bahan untuk menemukan data yang relevan.</li>
                    <li><strong>Filter Jenis & Status:</strong> Persempit pencarian Anda berdasarkan jenis jasa (Pemaklun/Penjahit) dan status proses produksi saat ini.</li>
                </ul>
            </div>
            
        </div>
    </div>

    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Mengerti</button>
    </div>
</div>        

<div v-if="uiState.modalType === 'modelProdukInfo'" class="bg-white rounded-lg shadow-xl p-6 max-w-5xl w-full h-full md:max-h-[90vh] flex flex-col">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Panduan Pengisian Data Model Produk</h3>
    </div>
    
    <div class="flex-1 overflow-y-auto py-4 pr-2">
        <div class="space-y-6 text-slate-700 leading-relaxed">
            
            <div class="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <h4 class="font-semibold text-lg text-indigo-700">Aturan Pengisian Nama Model</h4>
                <p class="mt-1">
                    Silakan klik **"+ Tambah Model"**, lalu edit. Pastikan untuk mengisi **Nama Model** dengan format yang konsisten.
                </p>
                <p class="mt-2 text-sm font-semibold">
                    Mengisi data ini dengan benar akan sangat mempermudah Anda saat menambahkan produk baru di halaman **Inventaris**, karena Anda hanya perlu memilih model yang sudah ada dan beberapa kolom akan terisi otomatis.
                </p>
                
                <div class="mt-3 p-3 bg-indigo-100 border border-indigo-200 rounded-md">
                    <p class="font-semibold">Contoh Pengisian: Format Size (Huruf)</p>
                    <ul class="list-disc list-inside mt-1 text-sm">
                        <li><strong>Nama Model:</strong> <code>MADINA HITAM M</code></li>
                        <li><strong>Kolom Warna:</strong> <code>HITAM</code></li>
                        <li><strong>Kolom Ukuran:</strong> <code>M</code></li>
                    </ul>
                </div>
                <div class="mt-2 p-3 bg-indigo-100 border border-indigo-200 rounded-md">
                    <p class="font-semibold">Contoh Pengisian: Format No. (Angka)</p>
                    <ul class="list-disc list-inside mt-1 text-sm">
                        <li><strong>Nama Model:</strong> <code>MADINA HITAM NO.6</code></li>
                        <li><strong>Kolom Warna:</strong> <code>HITAM</code></li>
                        <li><strong>Kolom Ukuran:</strong> <code>NO.6</code></li>
                    </ul>
                </div>
            </div>

            <div class="p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
                <h4 class="font-semibold text-lg text-yellow-800">Perhatian untuk Kebutuhan Kain (Yard/Model)</h4>
                <p class="mt-1">
                    Pastikan Anda memasukkan data yard dengan benar, karena angka ini akan sangat memengaruhi perhitungan di Halaman Produksi.
                </p>
                <p class="mt-2 text-sm">
                    Kalkulasi **Target Qty** di dalam form "Buat Batch Produksi" dihitung secara otomatis berdasarkan rumus:
                </p>
                <div class="mt-2 p-2 bg-white text-center font-mono text-slate-800 rounded">
                    Target Qty = Total Yard Kain / Yard per Model
                </div>
            </div>

            <div class="p-4 bg-cyan-50 border border-cyan-200 rounded-lg">
                <h4 class="font-semibold text-lg text-cyan-800">Aturan Pengisian Harga Jasa</h4>
                <ul class="list-disc list-inside mt-2 space-y-2 text-sm">
                    <li><strong>Harga Maklun:</strong> Silakan isi dengan harga jasa maklun. Harga ini akan otomatis terisi saat Anda membuat batch produksi baru dengan jenis jasa "Pemaklun".</li>
                    <li><strong>Harga Jahit:</strong> Silakan isi dengan harga jahit yang sudah disepakati langsung dengan penjahit. Harga ini akan otomatis terisi saat Anda memilih jenis jasa "Penjahit" di form batch produksi.</li>
                </ul>
            </div>

        </div>
    </div>

    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Mengerti</button>
    </div>
</div>        

<div v-if="uiState.modalType === 'panduanPromosi'" class="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full h-full md:max-h-[90vh] flex flex-col">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Panduan Manajemen Promosi & Voucher</h3>
        <p class="text-slate-500 mt-1">Pahami struktur promosi berlapis untuk mengoptimalkan profitabilitas.</p>
    </div>
    
    <div class="flex-1 overflow-y-auto py-4 pr-2">
        <div class="space-y-6 text-slate-700 leading-relaxed prose">
            <p>Sistem promosi dirancang untuk memberikan fleksibilitas maksimum dalam strategi harga Anda. Ada dua tingkatan promosi utama yang bisa Anda atur, dan keduanya akan dibandingkan secara otomatis untuk menemukan diskon terbaik saat transaksi terjadi.</p>
            
            <h4 class="text-lg font-semibold mt-4 mb-2">1. Promosi Per Akun Penjualan (Berlaku Global)</h4>
            <div class="p-4 bg-indigo-50 rounded-lg border border-indigo-200 text-sm">
                <p>Ini adalah promosi yang berlaku untuk **semua produk** yang dijual di satu channel marketplace. Cocok untuk strategi diskon umum.</p>
                <ul class="list-disc list-inside ml-4 mt-2 space-y-1">
                    <li>**Voucher Ikuti Toko**: Diskon persentase yang diberikan kepada pelanggan baru yang mengikuti toko Anda.</li>
                    <li>**Voucher Semua Produk**: Diskon persentase yang berlaku untuk semua item di keranjang belanja.</li>
                </ul>
            </div>
            
            <h4 class="text-lg font-semibold mt-4 mb-2">2. Promosi Spesifik Per Model Produk (Berlaku Terbatas)</h4>
            <div class="p-4 bg-green-50 rounded-lg border border-green-200 text-sm">
                <p>Ini adalah promosi yang hanya berlaku untuk **varian produk dari model tertentu**. Strategi ini sangat efektif untuk promosi produk unggulan atau produk baru.</p>
                <ul class="list-disc list-inside ml-4 mt-2 space-y-1">
                    <li>**Voucher Produk Tertentu**: Diskon persentase khusus untuk model produk yang Anda pilih.</li>
                    <li>**Diskon Bertingkat**: Memberikan diskon yang berbeda berdasarkan jumlah minimal belanja.</li>
                </ul>
            </div>

            <h4 class="text-lg font-semibold mt-6 mb-2 text-red-700">Catatan Penting: Prioritas Voucher dan Batasan Penggunaan</h4>
            <div class="p-4 bg-red-50 rounded-lg border border-red-200 text-sm">
                <p>Sistem promosi di aplikasi ini dirancang untuk secara otomatis memilih dan menerapkan **voucher dengan nilai diskon terbaik** untuk setiap transaksi. Namun, untuk memastikan data Anda selalu sinkron dengan laporan dari marketplace (seperti Shopee atau TikTok), ada satu detail penting yang perlu Anda perhatikan:</p>
                
                <p class="mt-2">Beberapa jenis voucher, seperti **"Voucher Ikuti Toko"**, hanya dapat digunakan **satu kali per pelanggan** di platform marketplace.</p>
                
                <p class="mt-2">Untuk mencegah ketidakcocokan data, Anda memiliki dua opsi saat mengatur voucher ini:</p>
                <ol class="list-decimal list-inside ml-4 mt-2 space-y-1">
                    <li>**Berikan Nilai Diskon Paling Rendah**: Masukkan nilai diskon yang lebih kecil pada kolom **"Voucher Ikuti Toko"** dibandingkan dengan voucher lainnya. Dengan cara ini, aplikasi akan memprioritaskan voucher lain yang nilainya lebih besar.</li>
                    <li>**Kosongkan Nilai Diskon**: Jika Anda tidak ingin menggunakan "Voucher Ikuti Toko" dalam kalkulasi otomatis sama sekali, Anda bisa mengosongkan nilai diskonnya.</li>
                </ol>
            </div>
            </div>
    </div>
    
    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
    </div>
</div>

<div v-if="uiState.modalType === 'editReferralCode'" class="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full">
    <h3 class="text-xl font-bold mb-2">Edit Kode Rujukan</h3>
    <p v-if="uiState.modalData.user" class="text-sm text-slate-500 mb-4">Mengubah kode untuk: <span class="font-semibold">{{ uiState.modalData.user.email }}</span></p>
    
    <form @submit.prevent="updateReferralCode">
        <div>
            <label class="block text-sm font-medium text-slate-700">Kode Rujukan Baru</label>
            <input 
                type="text" 
                v-model="uiState.modalData.newReferralCode" 
                class="mt-1 w-full p-2 border rounded-md font-mono text-lg" 
                required
            >
            <p class="text-xs text-slate-500 mt-1">Gunakan huruf besar dan angka. Minimal 5 karakter.</p>
        </div>
        
        <div class="flex justify-end gap-3 pt-6 border-t mt-4">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" :disabled="isSaving" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-indigo-400">
                <span v-if="isSaving">Menyimpan...</span>
                <span v-else>Simpan Perubahan</span>
            </button>
        </div>
    </form>
</div>

<div v-if="uiState.modalType === 'registerPartner'" class="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full">
    <h3 class="text-xl font-bold mb-4">Daftar Menjadi Mitra</h3>
    <div class="space-y-4">
        <p class="text-sm text-slate-600">Untuk menjadi mitra, Anda akan dikenakan biaya pendaftaran satu kali sebesar Rp 50.000. Biaya ini akan kami gunakan untuk mendukung program dan operasional kami.</p>
        <p class="text-sm font-semibold text-slate-800">Manfaat menjadi mitra:</p>
        <ul class="list-disc list-inside ml-4 text-sm text-slate-600">
            <li>Dapatkan komisi berkelanjutan dari setiap pelanggan yang Anda ajak.</li>
            <li>Akses ke dashboard khusus untuk melacak komisi Anda secara real-time.</li>
            <li>Mendukung pengembangan aplikasi yang lebih baik.</li>
        </ul>
        <p class="mt-4 text-xs font-semibold text-red-600">Setelah pembayaran, Anda akan menerima kode rujukan unik.</p>
    </div>
    <div class="flex justify-end gap-3 pt-6 border-t mt-4">
        <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
        <button @click="proceedToPartnerPayment" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg">Lanjut ke Pembayaran</button>
    </div>
</div>

        <div v-if="uiState.modalType === 'dashboardKpiInfo'" class="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full h-full md:max-h-[90vh] flex flex-col">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Memahami Dampak Retur pada Laporan Keuangan</h3>
        <p class="text-slate-500 mt-1">Penjelasan singkat tentang bagaimana setiap data retur memengaruhi metrik di dashboard.</p>
    </div>
    <div class="flex-1 overflow-y-auto py-4 pr-2 space-y-6 text-slate-700 leading-relaxed">
        <p>
            Ketika Anda menambahkan data retur di halaman **Manajemen Retur**, sistem secara otomatis menganggap pesanan tersebut sebagai **gagal** atau **dibatalkan**. Hal ini memicu penyesuaian otomatis pada semua metrik keuangan di dashboard analitik Anda untuk memastikan data yang ditampilkan selalu akurat.
        </p>
        
        <div class="p-4 bg-slate-50 rounded-lg">
            <h4 class="font-bold text-lg text-indigo-700">Dampak Langsung pada Metrik Utama</h4>
            <ul class="list-disc list-inside ml-4 mt-2 space-y-2 text-sm">
                <li>
                    <strong>Omset Kotor & Omset Bersih:</strong> Nilai harga jual dari produk yang diretur akan **dikurangi** dari total omset Anda.
                </li>
                <li>
                    <strong>Diskon:</strong> Jumlah diskon atau voucher yang sebelumnya teralokasi pada produk yang diretur juga akan **dibatalkan** dan dikurangi dari total diskon.
                </li>
                <li>
                    <strong>Biaya Transaksi Marketplace:</strong> Biaya yang dibebankan oleh platform e-commerce (seperti biaya admin, komisi) untuk produk yang diretur akan **dihilangkan** dan dikurangi dari total biaya.
                </li>
                <li>
                    <strong>Laba Kotor & Laba Bersih:</strong> Karena Omset Kotor dan Omset Bersih berkurang, maka nilai **Laba Kotor** dan **Laba Bersih** juga akan **terpengaruh dan ikut berkurang** secara proporsional.
                </li>
            </ul>
        </div>
        
        <p>
            Dengan alur kerja ini, Anda tidak perlu lagi melakukan koreksi manual pada laporan keuangan. Cukup catat data retur, dan sistem akan mengurus sisanya, sehingga data di dashboard Anda selalu mencerminkan kondisi bisnis yang sebenarnya.
        </p>

    </div>
    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
    </div>
</div>

        <div v-if="uiState.modalType === 'kpiHelp'" class="bg-white rounded-lg shadow-xl p-6 max-w-xl w-full">
    <div class="flex justify-between items-center pb-4 border-b mb-4">
        <h3 class="text-xl font-bold text-slate-800">{{ uiState.modalData?.title || 'Informasi' }}</h3>
    </div>
    <div class="space-y-4 text-slate-700">
        <div v-if="uiState.modalData?.description">
            <p class="text-sm italic">{{ uiState.modalData.description }}</p>
        </div>
        <div v-if="uiState.modalData?.formula">
            <p class="text-xs font-medium text-slate-700">Rumus:</p>
            <p class="font-mono text-sm mt-1 bg-slate-200 p-2 rounded-md">{{ uiState.modalData.formula }}</p>
        </div>
    </div>
    <div class="flex justify-end mt-6 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-300 py-2 px-4 rounded-lg">Tutup</button>
    </div>
</div>

<div v-if="uiState.modalType === 'panduanStockAdjustment'" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full max-h-[90vh] flex flex-col">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Panduan Fitur Penyesuaian Stok</h3>
        <p class="text-slate-500">Memahami alur kerja untuk menjaga akurasi data inventaris dan keuangan.</p>
    </div>
    
    <div class="flex-1 overflow-y-auto py-4 pr-2">
        <div class="space-y-6 text-slate-700 leading-relaxed prose">
            
            <div class="p-4 bg-slate-50 rounded-lg">
                <h4 class="text-lg font-semibold text-indigo-700">Tujuan Fitur Ini</h4>
                <p class="mt-1 text-sm">
                    Fitur <strong>Penyesuaian Stok</strong> adalah alat vital untuk memastikan data stok di dalam sistem selalu 100% sama dengan jumlah stok fisik di gudang Anda. Fitur ini digunakan untuk mencatat semua perubahan stok yang terjadi di luar alur penjualan normal.
                </p>
            </div>

            <div class="p-4 bg-slate-50 rounded-lg">
                <h4 class="text-lg font-semibold text-indigo-700">1. Penambahan Stok (+)</h4>
                <p class="mt-1 text-sm">Pilih tipe ini untuk <strong>menambah</strong> jumlah stok fisik. Gunakan untuk kasus seperti:</p>
                <ul class="list-disc list-inside space-y-1 mt-2 text-sm">
                    <li><strong>Stok Awal:</strong> Saat pertama kali memasukkan data produk ke dalam sistem.</li>
                    <li><strong>Hasil Produksi:</strong> Jika Anda tidak menggunakan tombol "+ Masukkan ke Inventaris" di halaman laporan produksi.</li>
                    <li><strong>Penyesuaian Inventaris:</strong> Ketika hasil stok opname menemukan jumlah fisik lebih banyak daripada yang tercatat di sistem.</li>
                </ul>
                <p class="mt-3 text-xs text-slate-500"><strong>Catatan:</strong> Untuk retur dari pelanggan, sangat direkomendasikan menggunakan halaman <strong>Manajemen Retur</strong> agar kalkulasi keuangan di dasbor lebih akurat.</p>
            </div>

            <div class="p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
                <h4 class="text-lg font-semibold text-yellow-800">2. Pengurangan Stok (-)</h4>
                 <p class="mt-1 text-sm text-yellow-900">Pilih tipe ini untuk <strong>mengurangi</strong> jumlah stok fisik. Ini adalah fitur krusial untuk mencatat kerugian.</p>
                <ul class="list-disc list-inside space-y-1 mt-2 text-sm">
                    <li><strong>Barang Hilang atau Rusak:</strong> Ketika produk hilang dari gudang atau rusak sehingga tidak bisa dijual.</li>
                    <li><strong>Digunakan untuk Sampel:</strong> Ketika produk diambil untuk keperluan promosi, foto, atau sampel.</li>
                    <li><strong>Penyesuaian Inventaris:</strong> Ketika hasil stok opname menemukan jumlah fisik lebih sedikit daripada yang tercatat.</li>
                </ul>
                <div class="mt-4 p-3 bg-red-100 text-red-800 border-l-4 border-red-500">
                    <p class="font-bold">PENTING: Dampak Finansial Otomatis</p>
                    <p class="mt-2 text-sm">Setiap kali Anda melakukan <strong>Pengurangan Stok</strong>, sistem akan secara otomatis membuat catatan <strong>pengeluaran</strong> baru di halaman <strong>Manajemen Keuangan</strong> dengan kategori "Kerugian Stok". Nilai kerugian yang dicatat adalah <strong>Jumlah Stok Hilang dikalikan dengan HPP (Harga Pokok)</strong> produk tersebut. Ini memastikan laporan laba rugi Anda tetap akurat.</p>
                </div>
            </div>
        </div>
    </div>

    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Mengerti</button>
    </div>
</div>

<div v-if="uiState.modalType === 'investorInfo'" class="bg-white rounded-lg shadow-xl p-6 max-w-6xl w-full h-full md:max-h-[90vh] flex flex-col">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Informasi Halaman Manajemen Investor</h3>
        <p class="text-slate-500">Panduan untuk mengelola modal, melacak profitabilitas, dan memahami metrik kunci.</p>
    </div>
    
    <div class="flex-1 overflow-y-auto py-4 pr-2">
        <div class="space-y-6 text-slate-700 leading-relaxed prose">
            
            <div class="p-4 bg-slate-50 rounded-lg">
                <h4 class="text-lg font-semibold text-indigo-700">Tujuan Halaman Ini</h4>
                <p class="mt-1 text-sm">
                    Halaman Manajemen Investor adalah pusat kendali Anda untuk semua aktivitas yang berkaitan dengan permodalan eksternal. Tujuannya adalah memberikan transparansi penuh atas kinerja setiap investasi, memastikan akuntabilitas, dan memfasilitasi pembagian hasil yang adil dan akurat.
                </p>
                <ul class="list-disc list-inside space-y-1 mt-2 text-sm">
                    <li><strong>Pencatatan Terpusat:</strong> Mencatat setiap investor, jumlah modal yang ditanamkan, dan persentase bagi hasil yang disepakati.</li>
                    <li><strong>Pelacakan Kinerja:</strong> Memantau total bagi hasil yang telah dibayarkan kepada setiap investor.</li>
                    <li><strong>Kalkulasi Otomatis:</strong> Menghitung dan menyajikan laporan bagi hasil secara otomatis berdasarkan kinerja bisnis pada periode tertentu.</li>
                </ul>
            </div>

            <div class="p-4 bg-slate-50 rounded-lg">
                <h4 class="text-lg font-semibold text-indigo-700">Memahami ROI (Return on Investment)</h4>
                <p class="mt-1 text-sm">
                    <strong>ROI</strong> adalah metrik kinerja fundamental yang digunakan untuk mengevaluasi efisiensi atau profitabilitas sebuah investasi. Sederhananya, ROI menjawab pertanyaan: <strong>"Dari setiap rupiah yang diinvestasikan, berapa rupiah yang telah kembali sebagai bagi hasil?"</strong>
                </p>
                <p class="mt-2 text-sm">
                    Ini adalah indikator utama kesehatan sebuah investasi. Semakin tinggi persentase ROI, semakin efisien modal tersebut menghasilkan pengembalian.
                </p>
                <div class="mt-3 p-3 bg-indigo-100 text-indigo-800 border-l-4 border-indigo-500 text-sm">
                    <p class="font-bold">Formula di Aplikasi Ini:</p>
                    <p class="mt-2 font-mono text-center">
                        ROI = (Total Bagi Hasil Diterima / Modal Awal) x 100%
                    </p>
                </div>
                <p class="mt-3 text-sm">
                    <strong>Contoh Mudah:</strong> Bayangkan seorang investor menanamkan modal <strong>Rp 10.000.000</strong>. Setelah beberapa periode, ia telah menerima total bagi hasil sebesar <strong>Rp 2.500.000</strong>. Maka, ROI-nya saat ini adalah (Rp 2.500.000 / Rp 10.000.000) x 100% = <strong>25%</strong>. Ini berarti investasi tersebut telah mengembalikan 25% dari modal awalnya dalam bentuk keuntungan.
                </p>
            </div>
        </div>
    </div>

    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
    </div>
</div>

<div v-if="uiState.modalType === 'biayaOperasionalHelp'" class="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full">
    <div class="flex justify-between items-center pb-3 border-b mb-4">
        <h3 class="text-xl font-bold text-slate-800 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-indigo-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
            Informasi Perhitungan Biaya Operasional
        </h3>
    </div>
    <div class="space-y-4 text-slate-700">
        <p class="text-sm">
            Angka <strong>Biaya Operasional</strong> yang ditampilkan di sini adalah total dari semua pengeluaran yang tercatat di halaman <strong>Manajemen Keuangan</strong> selama periode laporan yang dipilih.
        </p>
        <div class="p-3 bg-yellow-50 text-yellow-800 border-l-4 border-yellow-400 text-sm">
            <p class="font-semibold">Penting:</p>
            <p class="mt-1">
                Untuk menjaga akurasi perhitungan bagi hasil, setiap transaksi pengeluaran yang catatannya berisi frasa <strong>"Bagi hasil"</strong> secara otomatis <strong>dikecualikan</strong> dan tidak akan dihitung ke dalam total Biaya Operasional pada laporan ini.
            </p>
        </div>
        <p class="text-sm">
            Ini memastikan bahwa pembayaran bagi hasil dari periode sebelumnya tidak membebani perhitungan laba bersih untuk periode saat ini.
        </p>
    </div>
    <div class="flex justify-end mt-6 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Mengerti</button>
    </div>
</div>

<div v-if="uiState.modalType === 'addBankAccount' || uiState.modalType === 'editBankAccount'" class="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full">
    <h3 class="text-xl font-bold mb-4">{{ uiState.modalType === 'addBankAccount' ? 'Tambah Rekening' : 'Edit Rekening' }}</h3>
    <form @submit.prevent="submitBankAccount" class="space-y-4">
        <div>
            <label class="block text-sm font-medium">Nama Bank</label>
            <input type="text" v-model="uiState.modalData.bankName" class="mt-1 w-full p-2 border rounded-md" required placeholder="Contoh: BCA">
        </div>
        <div>
            <label class="block text-sm font-medium">Nomor Rekening</label>
            <input type="text" v-model="uiState.modalData.accountNumber" class="mt-1 w-full p-2 border rounded-md" required placeholder="Contoh: 1234567890">
        </div>
        <div>
            <label class="block text-sm font-medium">Atas Nama</label>
            <input type="text" v-model="uiState.modalData.accountName" class="mt-1 w-full p-2 border rounded-md" required placeholder="Contoh: John Doe">
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t mt-4">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan</button>
        </div>
    </form>
</div>

<div v-if="uiState.modalType === 'laporanBagiHasilDetail'" class="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full max-h-[90vh] flex flex-col">
    <div id="print-area-investor" class="print-content">
        <div class="flex-shrink-0 pb-4 border-b">
            <h3 class="text-xl font-bold text-slate-800">Detail Laporan Bagi Hasil</h3>
            <p class="text-slate-600">Investor: <span class="font-semibold">{{ uiState.modalData.investorName }}</span></p>
            <p class="text-slate-600">Periode: <span class="font-semibold">{{ uiState.modalData.period }}</span></p>
        </div>
        <div class="flex-1 overflow-y-auto py-4 pr-2">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                
                <div class="space-y-2 p-4 bg-indigo-50 rounded-lg">
                    <h4 class="font-bold text-base mb-2">Pembagian Hasil</h4>
                    <div v-if="uiState.modalData.labaBersih > 0">
                        <div class="flex justify-between"><span>Bagian Investor ({{ uiState.modalData.profitSharePercentage }}%)</span><span class="font-bold text-xl text-green-700">{{ formatCurrency(uiState.modalData.investorShare) }}</span></div>
                        <div class="flex justify-between mt-2"><span>Bagian Perusahaan</span><span class="font-medium">{{ formatCurrency(uiState.modalData.companyShare) }}</span></div>
                        <div class="mt-6 pt-4 border-t space-y-3">
                            <div><label class="block text-sm font-medium">Metode Pembayaran</label><p class="mt-1 font-semibold capitalize">{{ uiState.modalData.paymentMethod }}</p></div>
                            <div v-if="uiState.modalData.paymentMethod === 'transfer'">
                                <p class="text-xs text-slate-500 mt-1">Detail Bank:</p>
                                <p class="text-sm font-medium">Nama Bank: {{ uiState.modalData.bankDetails?.bankName }}</p>
                                <p class="text-sm font-medium">No. Rek: {{ uiState.modalData.bankDetails?.accountNumber }}</p>
                                <p class="text-sm font-medium">Atas Nama: {{ uiState.modalData.bankDetails?.accountName }}</p>
                                <p v-if="uiState.modalData.adminFee > 0" class="text-xs text-red-500 mt-2">Biaya Admin: {{ formatCurrency(uiState.modalData.adminFee) }}</p>
                            </div>
                        </div>
                    </div>
                    <div v-else class="text-center py-8"><p class="font-semibold text-slate-700">Tidak ada keuntungan pada periode ini.</p></div>
                </div>

                <div class="space-y-2 p-4 bg-slate-50 rounded-lg">
    <h4 class="font-bold text-base mb-2">Perhitungan Laba Bersih</h4>
    
    <div class="flex justify-between"><span>Omset Bersih Penjualan</span> <span class="font-medium text-green-600">{{ formatCurrency(uiState.modalData.omsetBersihPenjualan) }}</span></div>
    <div class="flex justify-between"><span>(-) Omset Bersih dari Retur</span> <span class="font-medium text-red-600">{{ formatCurrency(uiState.modalData.omsetBersihDariRetur) }}</span></div>
    <div class="flex justify-between font-semibold border-t pt-1"><span>= Total Omset Bersih</span> <span>{{ formatCurrency(uiState.modalData.omsetBersihFinal) }}</span></div>
    
    <div class="flex justify-between mt-3"><span>(-) HPP Terjual</span> <span class="font-medium text-red-600">{{ formatCurrency(uiState.modalData.totalHppTerjual) }}</span></div>
    <div class="flex justify-between"><span>(-) HPP dari Retur</span> <span class="font-medium text-red-600">{{ formatCurrency(uiState.modalData.totalHppRetur) }}</span></div>
    <div class="flex justify-between font-semibold border-t pt-1"><span>= Total HPP</span> <span class="text-red-600">{{ formatCurrency(uiState.modalData.hppTerjualFinal) }}</span></div>

    <div class="flex justify-between font-bold border-t-2 pt-2 mt-2"><span>LABA KOTOR</span> <span>{{ formatCurrency(uiState.modalData.labaKotor) }}</span></div>
    
    <div class="flex justify-between mt-3"><span>(-) Biaya Marketplace (Penjualan)</span> <span class="font-medium text-red-600">{{ formatCurrency(uiState.modalData.biayaMarketplacePenjualan) }}</span></div>
    <div class="flex justify-between"><span>(-) Biaya Marketplace (dari Retur)</span> <span class="font-medium text-red-600">{{ formatCurrency(uiState.modalData.biayaMarketplaceBatal) }}</span></div>
    <div class="flex justify-between font-semibold border-t pt-1"><span>= Total Biaya Marketplace</span> <span class="text-red-600">{{ formatCurrency(uiState.modalData.totalBiayaTransaksi) }}</span></div>
    
    <div class="flex justify-between mt-2">
        <span class="flex items-center gap-2">
            (-) Biaya Operasional
            <button @click="showModal('biayaOperasionalHelp')" type="button" class="w-5 h-5 rounded-full flex items-center justify-center bg-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-300">?</button>
        </span> 
        <span class="font-medium text-red-600">{{ formatCurrency(uiState.modalData.totalBiayaOperasional) }}</span>
    </div>
    
    <div class="flex justify-between font-bold text-lg text-indigo-700 border-t-2 pt-2 mt-2">
        <div class="flex items-center gap-2">
            <span>LABA BERSIH</span>
            <button @click="showModal('labaBersihHelp')" type="button" class="w-5 h-5 rounded-full flex items-center justify-center bg-indigo-100 text-indigo-600 font-bold text-sm hover:bg-indigo-200">?</button>
        </div>
        <span>{{ formatCurrency(uiState.modalData.labaBersih) }}</span>
    </div>
</div>

            </div>
        </div>
    </div>
    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t no-print">
        <button type="button" @click="printInvestorPaymentDetailed(uiState.modalData)" class="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700">Cetak Struk</button>
        <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
    </div>
</div>

        <div v-if="uiState.modalType === 'confirmTransaction'" class="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full h-full md:max-h-[40vh] flex flex-col">
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
<div v-if="uiState.modalType === 'addProduct'" class="bg-white rounded-lg shadow-xl p-6 max-w-3xl w-full h-full md:max-h-[120vh] flex flex-col">
    <h3 class="text-xl font-bold mb-2">Tambah Produk Baru</h3>
    <p class="text-sm text-slate-500 mb-4">Harga jual spesifik untuk tiap channel dapat diatur di halaman 'Harga & HPP' setelah produk ditambahkan.</p>
    <form @submit.prevent="submitAddProduct" class="space-y-4 overflow-y-auto max-h-[75vh] p-2">
        <div>
            <label for="product-sku" class="block text-sm font-medium text-slate-700">SKU (Stock Keeping Unit)</label>
            <input type="text" v-model="uiState.modalData.sku" id="product-sku" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm" placeholder="Contoh: TSH-BL-M001" required>
        </div>
        
        <div>
            <label for="product-model" class="block text-sm font-medium text-slate-700">Model Produk</label>
            <div v-if="state.settings.modelProduk.length === 0" class="mt-1 p-3 bg-red-100 text-red-800 border-l-4 border-red-500 rounded-lg shadow-sm">
                <p class="font-semibold mb-1">Peringatan:</p>
                <p class="text-sm">Anda belum memiliki data model Produk. Silakan tambahkan di halaman **Pengaturan** terlebih dahulu.</p>
                <a href="#" @click.prevent="changePage('pengaturan'); hideModal();" class="mt-2 inline-block text-red-700 font-bold hover:underline">
                    Buka Halaman Pengaturan &raquo;
                </a>
            </div>
            <select v-else v-model="uiState.modalData.modelId" @change="handleModelProdukChange()" id="product-model" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm" required>
    <option value="">-- Pilih Model --</option>
    <option v-for="model in state.settings.modelProduk" :key="model.id" :value="model.id">{{ model.namaModel }}</option>
</select>
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
        
        <div class="flex justify-end gap-3 mt-15">
            <button type="button" @click="hideModal" class="bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-400">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">Tambah Produk</button>
        </div>
    </form>
</div>

<div v-if="uiState.modalType === 'addInvestor' || uiState.modalType === 'editInvestor'" class="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full">
    <h3 class="text-xl font-bold mb-4">{{ uiState.modalType === 'addInvestor' ? 'Tambah Investor Baru' : 'Edit Data Investor' }}</h3>
    <form @submit.prevent="submitInvestorForm(uiState.modalType === 'editInvestor')" class="space-y-4">
        <div>
            <label class="block text-sm font-medium">Nama Investor</label>
            <input type="text" v-model="uiState.modalData.name" class="mt-1 w-full p-2 border rounded-md" required>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium">Jumlah Investasi (Rp)</label>
                <input type="number" v-model.number="uiState.modalData.amount" class="mt-1 w-full p-2 border rounded-md" required>
            </div>
            <div>
                <label class="block text-sm font-medium">Persentase Bagi Hasil (%)</label>
                <input type="number" v-model.number="uiState.modalData.profitShare" class="mt-1 w-full p-2 border rounded-md" required>
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium">Tanggal Mulai Investasi</label>
            <input type="date" v-model="uiState.modalData.startDate" class="mt-1 w-full p-2 border rounded-md" required>
        </div>

        <div>
            <label class="block text-sm font-medium">Status Investor</label>
            <select v-model="uiState.modalData.status" class="mt-1 w-full p-2 border rounded-md">
                <option value="aktif">Aktif</option>
                <option value="selesai">Selesai</option>
            </select>
        </div>

        <div class="flex justify-end gap-3 pt-4 border-t mt-4">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan</button>
        </div>
    </form>
</div>

<div v-if="uiState.modalType === 'labaBersihHelp'" class="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full">
    <div class="flex justify-between items-center pb-3 border-b mb-4">
        <h3 class="text-xl font-bold text-slate-800">Definisi & Rumus Laba Bersih</h3>
    </div>
    <div class="space-y-4 text-slate-700">
        <p class="text-sm">
            <strong>Laba Bersih</strong> adalah keuntungan final yang didapat setelah mengurangi semua biaya dari pendapatan. Angka ini adalah indikator paling penting dari profitabilitas bisnis Anda pada periode yang dipilih.
        </p>
        <div>
            <p class="text-xs font-medium text-slate-600">Rumus yang Digunakan:</p>
            <p class="font-mono text-sm mt-1 bg-slate-100 p-3 rounded-md border text-center">
                Laba Kotor - (Total Biaya Marketplace + Total Biaya Operasional)
            </p>
        </div>
        <div class="text-sm space-y-2 pt-2 border-t">
             <div class="flex justify-between">
                <span class="text-slate-500">Laba Kotor</span>
                <span class="font-semibold text-green-600">{{ formatCurrency(uiState.laporanBagiHasil.result.labaKotor) }}</span>
            </div>
             <div class="flex justify-between">
                <span class="text-slate-500">(-) Biaya Marketplace</span>
                <span class="font-semibold text-red-600">{{ formatCurrency(uiState.laporanBagiHasil.result.totalBiayaTransaksi) }}</span>
            </div>
             <div class="flex justify-between">
                <span class="text-slate-500">(-) Biaya Operasional</span>
                <span class="font-semibold text-red-600">{{ formatCurrency(uiState.laporanBagiHasil.result.totalBiayaOperasional) }}</span>
            </div>
        </div>
    </div>
    <div class="flex justify-end mt-6 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Mengerti</button>
    </div>
</div>

<div v-if="uiState.modalType === 'panduanBulkProcess'" class="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full h-full md:max-h-[90vh] flex flex-col">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Panduan Fitur Proses Massal</h3>
        <p class="text-slate-500">Alur kerja yang dirancang untuk kecepatan dan efisiensi saat volume pesanan tinggi.</p>
    </div>
    
    <div class="flex-1 overflow-y-auto py-4 pr-2">
        <div class="space-y-6 text-slate-700 leading-relaxed prose">
            <p>Halaman Proses Massal adalah solusi untuk efisiensi tertinggi. Halaman ini menyediakan dua alur kerja yang berbeda untuk melayani pengguna dengan atau tanpa barcode scanner.</p>
            
            <div class="p-4 border rounded-lg bg-slate-50">
                <h4 class="text-lg font-semibold text-indigo-700">Alur Kerja #1: Khusus Scanner (Super Cepat & Otomatis)</h4>
                <p class="mt-1 text-sm text-slate-500"><em>Gunakan kolom input <strong>"KHUSUS SCANNER (Otomatis)"</strong>.</em></p>
                <p class="mt-2 text-sm">Alur ini dirancang untuk kecepatan maksimal tanpa klik. Sistem cerdas akan membedakan produk dan resi berdasarkan urutan scan:</p>
                <ol class="list-decimal list-inside space-y-1 mt-2 text-sm">
                    <li><strong>Scan Produk:</strong> Pindai barcode pada produk. Item akan otomatis ditambahkan ke "Daftar Produk yang Sedang di-Scan".</li>
                    <li><strong>Scan Produk Berikutnya (jika ada):</strong> Jika pesanan multi-item, lanjutkan scan semua produknya.</li>
                    <li><strong>Scan Resi Pengiriman:</strong> Setelah semua produk untuk satu pesanan di-scan, langsung scan resinya.</li>
                    <li><strong>Proses Otomatis:</strong> Sistem akan langsung memproses pesanan tersebut dan menambahkannya ke "Riwayat Proses Terakhir". Layar siap untuk pesanan berikutnya.</li>
                </ol>
            </div>

            <div class="p-4 border rounded-lg bg-slate-50">
                <h4 class="text-lg font-semibold text-slate-700">Alur Kerja #2: Input Manual (Tanpa Scanner)</h4>
                 <p class="mt-1 text-sm text-slate-500"><em>Gunakan kolom input <strong>"Input Manual"</strong>.</em></p>
                <p class="mt-2 text-sm">Alur ini memberikan kontrol penuh bagi pengguna yang mengetik manual:</p>
                <ol class="list-decimal list-inside space-y-1 mt-2 text-sm">
                    <li><strong>Ketik SKU/Nama Produk:</strong> Saat Anda mengetik, daftar rekomendasi akan muncul. Klik produk yang benar untuk menambahkannya ke "Daftar Produk yang Sedang di-Scan".</li>
                    <li><strong>Ulangi untuk Produk Lain (jika ada):</strong> Tambahkan semua produk untuk satu pesanan ke dalam daftar.</li>
                    <li><strong>Ketik ID Pesanan (Resi):</strong> Setelah semua produk ada di daftar, ketik ID Pesanan dari resi ke dalam kolom yang sama.</li>
                    <li><strong>Proses Pesanan:</strong> Klik tombol <strong>"Proses Pesanan Ini"</strong>. Pesanan akan difinalisasi dan ditambahkan ke "Riwayat Proses Terakhir".</li>
                </ol>
            </div>

            <div class="mt-4 p-3 bg-green-50 text-green-800 border-l-4 border-green-500 text-sm">
                <p class="font-bold">Pilih Alur Kerja Anda</p>
                <p class="mt-2">Kedua metode di atas akan menghasilkan data transaksi yang sama akuratnya. Gunakan metode yang paling sesuai dengan peralatan dan kenyamanan Anda.</p>
            </div>
        </div>
    </div>

    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
    </div>
</div>

<div v-if="uiState.modalType === 'addStockIn'" class="bg-white rounded-lg shadow-xl p-6 max-w-3xl w-full max-h-[90vh] flex flex-col">
    <div class="flex items-center gap-4 mb-4">
        <h3 class="text-xl font-bold">Buat Penyesuaian Stok</h3>
        <button @click="showModal('panduanStockAdjustment')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
            Informasi
        </button>
    </div>
    
    <form @submit.prevent="submitStockAdjustment" class="flex flex-col h-full space-y-4">
        <div>
            <label class="block text-sm font-medium text-slate-700">Tipe Penyesuaian</label>
            <select v-model="uiState.modalData.tipe" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm" required>
                <option value="penambahan">Penambahan Stok (+)</option>
                <option value="pengurangan">Pengurangan Stok (-)</option>
            </select>
        </div>

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
                    <p class="text-sm text-slate-500">{{ p.sku }} - {{ p.warna }} - {{ p.varian }} | <span class="font-medium">Stok: {{ p.stokFisik }}</span></p>
                </div>
            </div>
        </div>

        <div>
            <label for="stock-in-qty" class="block text-sm font-medium text-slate-700">Jumlah (Pcs)</label>
            <input type="number" v-model.number="uiState.modalData.qty" id="stock-in-qty" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm" placeholder="Contoh: 50" required>
        </div>

        <div>
            <label for="stock-in-reason" class="block text-sm font-medium text-slate-700">Alasan Penyesuaian</label>
            <select v-model="uiState.modalData.alasan" id="stock-in-reason" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm" required>
                <option value="" disabled>-- Pilih Alasan --</option>
                <template v-if="uiState.modalData.tipe === 'penambahan'">
                    <option value="Stok Awal">Stok Awal</option>
                    <option value="Hasil Produksi">Hasil Produksi</option>
                    <option value="Retur dari Pelanggan">Retur dari Pelanggan</option>
                    <option value="Penyesuaian Inventaris">Penyesuaian Inventaris (+)</option>
                </template>
                <template v-else>
                    <option value="Barang Hilang">Barang Hilang</option>
                    <option value="Barang Rusak">Barang Rusak</option>
                    <option value="Digunakan untuk Sampel">Digunakan untuk Sampel</option>
                    <option value="Penyesuaian Inventaris">Penyesuaian Inventaris (-)</option>
                </template>
                <option value="Lain-lain">Lain-lain</option>
            </select>
        </div>
        
        <div class="flex justify-end gap-3 mt-auto pt-4 border-t">
            <button type="button" @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Batal</button>
            <button type="submit" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700">Simpan Penyesuaian</button>
        </div>
    </form>
</div>

<div v-if="uiState.nestedModalType === 'panduanStockIn'" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-3xl w-4/5 max-h-[90vh] flex flex-col">
        <div class="flex-shrink-0 pb-4 border-b">
            <h3 class="text-2xl font-bold text-slate-800">Panduan Penambahan Stok Inventaris</h3>
            <p class="text-slate-500">Memahami alur yang tepat untuk menjaga keakuratan data stok.</p>
        </div>

        <div class="flex-1 overflow-y-auto py-4 pr-2">
            <div class="space-y-6 text-slate-700 leading-relaxed">
                <div>
                    <h4 class="text-xl font-semibold">1. Penambahan Stok dari Produksi</h4>
                    <p class="mt-2">Ketika produk baru selesai diproduksi, penambahan stok harus dilakukan melalui halaman **Laporan Detail Gabungan**. Caranya:</p>
                    <ul class="list-disc list-inside space-y-1 mt-2">
                        <li>Kunjungi halaman **Produksi** dan klik **Laporan Detail Gabungan**.</li>
                        <li>Temukan item yang sudah selesai dan klik tombol **"+ Masukkan ke Inventaris"**.</li>
                        <li>**Penting:** Proses ini akan secara otomatis menambahkan stok ke inventaris master Anda.</li>
                    </ul>
                </div>

                <div>
                    <h4 class="text-xl font-semibold">2. Penambahan Stok Manual</h4>
                    <p class="mt-2">Halaman **Tambah Stok Masuk** ini digunakan untuk penambahan stok manual di luar proses produksi. Ini termasuk: </p>
                    <ul class="list-disc list-inside space-y-1 mt-2">
                        <li>Penyesuaian inventaris karena kesalahan pencatatan.</li>
                        <li>Penambahan stok dari sumber lain yang tidak melalui proses produksi di aplikasi ini.</li>
                    </ul>
                    <p class="mt-4 p-3 bg-red-100 text-red-800 border-l-4 border-red-500">
                        <strong>Perhatian:</strong> Pastikan Anda tidak menggunakan fitur ini untuk mencatat hasil produksi. Penggunaan yang tidak tepat dapat menyebabkan data stok menjadi tidak akurat.
                    </p>
                </div>
            </div>
        </div>

        <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
            <button @click="hideNestedModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
        </div>
    </div>
</div>

<div v-if="uiState.modalType === 'transactionDetail' && transactionDetails" class="bg-white rounded-lg shadow-xl p-6 max-w-5xl w-full h-full md:max-h-[85vh] flex flex-col">
    <div class="flex justify-between items-start pb-4 border-b">
        <div>
            <h3 class="text-2xl font-bold text-slate-800">Detail Transaksi</h3>
            <p class="text-sm text-slate-500 font-mono">{{ transactionDetails.id }}</p>
        </div>
        <div class="text-right">
            <p class="text-sm font-semibold text-slate-700">{{ new Date(transactionDetails.tanggal).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }}</p>
            <p class="text-base font-bold text-indigo-600">{{ transactionDetails.channel }}</p>
        </div>
    </div>

    <div class="flex-1 overflow-y-auto pt-6 -mx-6 px-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div class="space-y-4">
                <div class="bg-slate-50 p-4 rounded-xl border">
                    <h4 class="font-semibold text-slate-700 mb-2 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 text-indigo-500" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13h6v2H4v-2z" clip-rule="evenodd" /></svg>
                        Produk Terjual
                    </h4>
                    <ul class="divide-y divide-slate-200">
                        <li v-for="item in transactionDetails.items" :key="item.sku" class="py-3 flex justify-between items-center text-sm">
                            <div class="font-medium text-slate-800">
                                {{ item.qty }}x {{ getProductBySku(item.sku)?.nama || item.sku }}
                            </div>
                            <span class="font-semibold text-right">{{ formatCurrency(item.hargaJual * item.qty) }}</span>
                        </li>
                    </ul>
                </div>
                
                <div v-if="uiState.isProfitLocked" class="p-6 rounded-xl border-2 border-dashed border-slate-400 bg-slate-50 text-center flex flex-col justify-center h-full">
                    <h4 class="font-semibold text-slate-700">Estimasi Laba Bersih Terkunci</h4>
                    <p class="text-sm text-slate-500 mt-1 mb-4">Masukkan PIN untuk melihat profitabilitas transaksi ini.</p>
                    <form @submit.prevent="unlockProfitDetail" class="max-w-xs mx-auto w-full">
                        <input 
                            type="password" 
                            v-model="uiState.profitPinInput" 
                            placeholder="••••" 
                            class="w-full p-2 border rounded-md text-center text-lg mb-2"
                        >
                        <p v-if="uiState.profitPinError" class="text-red-500 text-xs mb-2">{{ uiState.profitPinError }}</p>
                        <button type="submit" class="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg hover:bg-indigo-700">
                            Buka
                        </button>
                    </form>
                </div>
                
                <div class="p-6 rounded-xl border-2 border-indigo-400 bg-indigo-50 text-center shadow-md">
    <p class="text-sm font-medium text-indigo-800">Estimasi Laba Bersih Transaksi Ini:</p>
    <p class="text-3xl font-extrabold text-indigo-700 my-1">{{ formatCurrency(transactionDetails.labaBersih) }}</p>
    <p class="text-xs text-indigo-600 font-medium">(Omset Bersih - HPP Terjual - Total Biaya Marketplace)</p>
</div>
            </div>

            <div class="space-y-4">
                <div class="bg-slate-50 p-4 rounded-xl border">
                    <h4 class="font-semibold text-slate-700 mb-2 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 text-green-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clip-rule="evenodd" /></svg>
                        Ringkasan Laba Rugi
                    </h4>
                    <ul class="space-y-1 text-sm">
                        <li class="flex justify-between">
                            <span class="text-slate-600">Omset Kotor</span>
                            <span class="font-semibold">{{ formatCurrency(transactionDetails.subtotal) }}</span>
                        </li>
                        <li v-if="transactionDetails.diskon && transactionDetails.diskon.totalDiscount > 0" class="flex justify-between text-green-600">
                            <span class="text-sm">Diskon ({{ transactionDetails.diskon.description || 'N/A' }})</span>
                            <span class="font-semibold">-{{ formatCurrency(transactionDetails.diskon.totalDiscount) }}</span>
                        </li>
                        <li class="flex justify-between font-bold border-t pt-2 mt-2">
                            <span>Omset Bersih</span>
                            <span>{{ formatCurrency(transactionDetails.total) }}</span>
                        </li>
                        <li class="flex justify-between pt-2">
                            <span class="text-slate-600">HPP Terjual</span>
                            <span class="text-red-600 font-semibold">-{{ formatCurrency(transactionDetails.totalHPP) }}</span>
                        </li>
                        <li class="flex justify-between font-bold border-t pt-2 mt-2">
                            <span>Laba Kotor</span>
                            <span>{{ formatCurrency(transactionDetails.total - transactionDetails.totalHPP) }}</span>
                        </li>
                    </ul>
                </div>

                <div class="bg-slate-50 p-4 rounded-xl border">
                    <h4 class="font-semibold text-slate-700 mb-2 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>
                        Biaya Marketplace
                    </h4>
                    <ul v-if="transactionDetails.biaya && transactionDetails.biaya.rincian" class="space-y-1 text-sm">
                        <li class="flex justify-between font-bold text-red-600">
                            <span>Total Biaya</span>
                            <span>-{{ formatCurrency(transactionDetails.biaya.total) }}</span>
                        </li>
                        <template v-for="(item, index) in transactionDetails.biaya.rincian" :key="index">
                            <li class="flex justify-between text-xs text-slate-600">
                                <span>- {{ item.name }}</span>
                                <span>{{ formatCurrency(item.value) }}</span>
                            </li>
                        </template>
                    </ul>
                    <p v-else class="text-xs text-slate-500 italic text-center py-4">Tidak ada rincian biaya marketplace.</p>
                </div>
            </div>
        </div>
    </div>

    <div class="flex-shrink-0 flex justify-end gap-3 mt-6 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">
            Tutup
        </button>
    </div>
</div>
<div v-if="uiState.modalType === 'addKain' || uiState.modalType === 'editKain'" class="bg-white rounded-lg shadow-xl p-6 max-w-5xl w-full h-full md:max-h-[50vh] flex flex-col">
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
        <div class="flex justify-end gap-3 pt-14 border-t">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan</button>
        </div>
    </form>
</div>
        <div v-if="uiState.modalType === 'scannerHelp'" class="bg-white rounded-lg shadow-xl p-6 max-w-6xl w-full h-full md:max-h-[90vh] flex flex-col">
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

    <div class="flex justify-end mt-6 pt-12 border-t">
        <button type="button" @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Mengerti</button>
    </div>
</div>

<div v-if="uiState.modalType === 'specialPrice'" class="bg-white rounded-lg shadow-xl p-6 max-w-5xl w-full h-full md:max-h-[60vh] flex flex-col">
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
    <div class="flex justify-between items-center mt-6 pt-6 border-t">
        <button @click="showModal('manageSpecialPrices')" class="text-sm text-blue-600 hover:underline">Lihat & Hapus Harga Spesial</button>
        <div class="flex gap-3">
            <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
            <button @click="saveSpecialPrice" :disabled="!uiState.selectedProductForSpecialPrice || !uiState.specialPriceInput" class="bg-amber-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-amber-600 disabled:bg-amber-300 disabled:cursor-not-allowed">Simpan Harga</button>
        </div>
    </div>
</div>

<div v-if="uiState.modalType === 'manageSpecialPrices'" class="bg-white rounded-lg shadow-xl p-6 max-w-7xl w-full h-full md:max-h-[90vh] flex flex-col">
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

<div v-if="uiState.modalType === 'produksiDetail'" class="bg-white rounded-lg shadow-xl p-6 max-w-6xl w-full h-full md:max-h-[90vh] flex flex-col">
    <h3 class="text-xl font-bold mb-4">Detail Batch Produksi: {{ uiState.modalData.id }}</h3>
    <div class="space-y-4 text-slate-700 max-h-[70vh] overflow-y-auto p-2 text-sm">
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 p-4 bg-slate-50 rounded-lg">
            <div>
                <p><strong>Tanggal Produksi:</strong> {{ new Date(uiState.modalData.tanggal).toLocaleDateString('id-ID') }}</p>
                <p><strong>{{ uiState.modalData.produksiType === 'penjahit' ? 'Penjahit' : 'Pemaklun' }}:</strong> {{ uiState.modalData.namaStatus }}</p>
                <p><strong>Kuantitas Jadi (Total):</strong> {{ produksiDetailComputed.totalAktualJadi }} pcs</p>
                <p><strong>Kuantitas Perbaikan (Total):</strong> {{ uiState.modalData.kuantitasPerbaikan || 0 }} pcs</p>
            </div>
            <div class="text-left md:text-right">
                <p><strong>Total Harga Jasa {{ uiState.modalData.produksiType === 'penjahit' ? 'Jahit' : 'Maklun' }}:</strong> {{ formatCurrency(uiState.modalData.totalHargaJasaMaklun) }}</p>
                <p><strong>Rata-rata Harga Jasa {{ uiState.modalData?.produksiType === 'penjahit' ? 'Jahit' : 'Maklun' }}/Pcs:</strong> {{ formatCurrency(uiState.modalData?.totalHargaJasaMaklun / (produksiDetailComputed?.totalAktualJadi || 1)) }}</p>
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
                    <li><strong>Model Produk:</strong> {{ state.settings.modelProduk.find(m => m.id === kb.modelProdukId)?.namaModel || 'N/A' }}</li>
                    <li><strong>Warna Kain:</strong> {{ kb.warnaKain || '-' }}</li>
                    <li><strong>Ukuran:</strong> {{ kb.ukuran || '-' }}</li>
                    <li><strong>Toko Kain:</strong> {{ kb.tokoKain || '-' }}</li>
                    <li><strong>Total Yard:</strong> {{ kb.totalYard || 0 }} yard @ {{ formatCurrency(kb.hargaKainPerYard || 0) }}/yard</li>
                    <li><strong>Yard/Model:</strong> {{ kb.yardPerModel || 0 }} yard/Model</li>
                    <li><strong>Target Qty:</strong> {{ Math.floor((kb.totalYard || 0) / (kb.yardPerModel || 1)) }} pcs</li>
                    <li class="font-semibold text-slate-800"><strong>Aktual Jadi:</strong> {{ kb.aktualJadi || 0 }} pcs, Harga {{ uiState.modalData.produksiType === 'penjahit' ? 'Jahit' : 'Maklun' }}/Pcs: {{ formatCurrency(uiState.modalData.produksiType === 'penjahit' ? (kb.hargaJahitPerPcs || 0) : (kb.hargaMaklunPerPcs || 0)) }}</li>
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

<div v-if="uiState.modalType === 'addBiaya' || uiState.modalType === 'editBiaya'" class="bg-white rounded-lg shadow-xl p-6 max-w-3xl w-full">
    <h3 class="text-xl font-bold mb-4">{{ uiState.modalType === 'addBiaya' ? 'Tambah Pengeluaran Baru' : 'Edit Pengeluaran' }}</h3>
    <form @submit.prevent="submitBiaya" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium">Tanggal</label>
                <input type="date" v-model="uiState.modalData.tanggal" class="mt-1 w-full p-2 border rounded-md" required>
            </div>
            <div>
                <label class="block text-sm font-medium">Kategori</label>
                <div class="flex items-center gap-2 mt-1">
                    <select v-model="uiState.modalData.kategori" class="w-full p-2 border rounded-md" required>
                        <option value="" disabled>-- Pilih Kategori --</option>
                        <option v-for="cat in state.settings.categories" :key="cat.id" :value="cat.name">{{ cat.name }}</option>
                    </select>
                    <button type="button" @click="showNestedModal('manageCategories')" class="bg-slate-100 p-2 text-slate-600 rounded-md hover:bg-slate-200" title="Kelola Kategori">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.82 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.82 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.82-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.82-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium">Jumlah Pokok Pengeluaran (Rp)</label>
            <input type="number" v-model.number="uiState.modalData.jumlah" placeholder="Contoh: 500000" class="mt-1 w-full p-2 border rounded-md" required>
        </div>
        
        <div class="pt-4 border-t space-y-4">
             <div>
                <label class="block text-sm font-medium">Metode Pembayaran</label>
                <select v-model="uiState.modalData.paymentMethod" class="mt-1 w-full p-2 border rounded-md">
                    <option value="transfer">Transfer Bank</option>
                    <option value="cash">Tunai (Cash)</option>
                </select>
            </div>
            <div v-if="uiState.modalData.paymentMethod === 'transfer'" class="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                <div>
                    <label class="block text-sm font-medium">Rekening Tujuan</label>
                    <select v-model="uiState.modalData.selectedBankAccountId" class="mt-1 w-full p-2 border rounded-md" required>
                        <option :value="null" disabled>-- Pilih Rekening --</option>
                        <option v-for="acc in state.bankAccounts" :key="acc.id" :value="acc.id">{{ acc.bankName }} - {{ acc.accountNumber }}</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium">Biaya Admin Transfer (jika ada)</label>
                    <input type="number" v-model.number="uiState.modalData.adminFee" class="mt-1 w-full p-2 border rounded-md" placeholder="Contoh: 6500">
                </div>
            </div>
        </div>

        <div>
            <label class="block text-sm font-medium">Catatan (Opsional)</label>
            <textarea v-model="uiState.modalData.catatan" rows="2" class="mt-1 w-full p-2 border rounded-md"></textarea>
        </div>
        
        <div class="p-3 bg-slate-100 rounded-md flex justify-between items-center text-lg font-bold">
            <span>Total Pengeluaran Akan Dicatat:</span>
            <span class="text-indigo-600">{{ formatCurrency((uiState.modalData.jumlah || 0) + (uiState.modalData.paymentMethod === 'transfer' ? (uiState.modalData.adminFee || 0) : 0)) }}</span>
        </div>

        <div class="flex justify-end gap-3 pt-4 border-t">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan</button>
        </div>
    </form>
</div>

<div v-if="uiState.modalType === 'addPemasukan' || uiState.modalType === 'editPemasukan'">
    <div class="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
        <div class="bg-white rounded-lg shadow-xl p-6 max-w-3xl w-full max-h-[90vh] flex flex-col">
            <h3 class="text-xl font-bold mb-4">{{ uiState.modalType === 'addPemasukan' ? 'Tambah Pemasukan Baru' : 'Edit Pemasukan' }}</h3>
            <form @submit.prevent="submitPemasukan" class="space-y-4">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium">Tanggal</label>
                        <input type="date" v-model="uiState.modalData.tanggal" class="mt-1 w-full p-2 border rounded-md" required>
                    </div>
                    <div>
                        <label class="block text-sm font-medium">Kategori Pemasukan</label>
                        <div class="flex items-center gap-2 mt-1">
                            <select v-model="uiState.modalData.kategori" class="w-full p-2 border rounded-md" required>
                                <option value="" disabled>-- Pilih Kategori --</option>
                                <option v-for="cat in state.settings.inflowCategories" :key="cat.id" :value="cat.name">{{ cat.name }}</option>
                            </select>
                            <button type="button" @click="showNestedModal('manageInflowCategories')" class="bg-slate-100 p-2 text-slate-600 rounded-md hover:bg-slate-200" title="Kelola Kategori">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.82 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.82 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.82-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.82-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                </svg>
                            </button>
                        </div>
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
    </div>
</div>

<div v-if="uiState.nestedModalType === 'manageInflowCategories'" class="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-xl w-full max-h-[90vh] flex flex-col">
        <div class="flex justify-between items-center pb-4 border-b">
            <h3 class="text-xl font-bold">Kelola Kategori Pemasukan</h3>
            <button @click="showNestedModal('addInflowCategory', { name: '', description: '' })" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 text-sm">
                + Tambah Kategori
            </button>
        </div>
        <div class="flex-1 overflow-y-auto py-4">
            <table class="w-full text-sm text-left text-slate-500">
                <thead class="text-xs text-slate-700 uppercase bg-slate-50 sticky top-0">
                    <tr>
                        <th class="px-4 py-3">Nama Kategori</th>
                        <th class="px-4 py-3">Deskripsi</th>
                        <th class="px-4 py-3 text-center">Aksi</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    <tr v-if="state.settings.inflowCategories.length === 0">
                        <td colspan="3" class="p-4 text-center text-slate-500">Tidak ada kategori pemasukan.</td>
                    </tr>
                    <tr v-for="cat in state.settings.inflowCategories" :key="cat.id" class="hover:bg-slate-50">
                        <td class="px-4 py-3 font-semibold text-slate-800">{{ cat.name }}</td>
                        <td class="px-4 py-3">{{ cat.description || '-' }}</td>
                        <td class="px-4 py-3 text-center space-x-3">
                            <button @click="showNestedModal('editInflowCategory', JSON.parse(JSON.stringify(cat)))" class="text-xs bg-slate-100 font-bold py-1 px-2 rounded hover:bg-slate-200">Edit</button>
                            <button @click="deleteInflowCategory(cat.id)" class="text-xs text-red-500 hover:underline">Hapus</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="flex-shrink-0 flex justify-end gap-3 pt-4 border-t">
            <button @click="hideNestedModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Selesai</button>
        </div>
    </div>
</div>

<div v-if="uiState.nestedModalType === 'addInflowCategory' || uiState.nestedModalType === 'editInflowCategory'" class="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
        <h3 class="text-xl font-bold mb-4">{{ uiState.nestedModalType === 'addInflowCategory' ? 'Tambah Kategori Baru' : 'Edit Kategori' }}</h3>
        <form @submit.prevent="uiState.nestedModalType === 'addInflowCategory' ? addInflowCategory() : updateInflowCategory()">
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium">Nama Kategori</label>
                    <input type="text" v-model="uiState.nestedModalData.name" class="mt-1 w-full p-2 border rounded-md" required>
                </div>
                <div>
                    <label class="block text-sm font-medium">Deskripsi</label>
                    <textarea v-model="uiState.nestedModalData.description" rows="2" class="mt-1 w-full p-2 border rounded-md"></textarea>
                </div>
            </div>
            <div class="flex justify-end gap-3 mt-6 border-t pt-4">
                <button type="button" @click="hideNestedModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
                <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan</button>
            </div>
        </form>
    </div>
</div>

<div v-if="uiState.isModalVisible && uiState.nestedModalType === 'manageCategories'" class="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-start justify-center p-20">
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-xl w-full h-full md:max-h-[60vh] flex flex-col">
        <div class="flex justify-between items-center pb-4 border-b">
            <h3 class="text-xl font-bold">Kelola Kategori Pengeluaran</h3>
            <button @click="showNestedModal('addCategory', { name: '', description: '' })" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 text-sm">
                + Tambah Kategori
            </button>
        </div>
        <div class="flex-1 overflow-y-auto py-4">
            <table class="w-full text-sm text-left text-slate-500">
                <thead class="text-xs text-slate-700 uppercase bg-slate-50 sticky top-0">
                    <tr>
                        <th class="px-4 py-3">Nama Kategori</th>
                        <th class="px-4 py-3">Deskripsi</th>
                        <th class="px-4 py-3 text-center">Aksi</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    <tr v-if="state.settings.categories.length === 0">
                        <td colspan="3" class="p-4 text-center text-slate-500">Tidak ada kategori.</td>
                    </tr>
                    <tr v-for="cat in state.settings.categories" :key="cat.id" class="hover:bg-slate-50">
                        <td class="px-4 py-3 font-semibold text-slate-800">{{ cat.name }}</td>
                        <td class="px-4 py-3">{{ cat.description || '-' }}</td>
                        <td class="px-4 py-3 text-center space-x-3">
                            <button @click="showNestedModal('editCategory', JSON.parse(JSON.stringify(cat)))" class="text-xs bg-slate-100 font-bold py-1 px-2 rounded hover:bg-slate-200">Edit</button>
                            <button @click="deleteCategory(cat.id)" class="text-xs text-red-500 hover:underline">Hapus</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="flex-shrink-0 flex justify-end gap-3 pt-4 border-t">
            <button @click="hideNestedModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Selesai</button>
        </div>
    </div>
</div>
<div v-if="uiState.isModalVisible && (uiState.nestedModalType === 'addCategory' || uiState.nestedModalType === 'editCategory')" class="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
        <h3 class="text-xl font-bold mb-4">{{ uiState.nestedModalType === 'addCategory' ? 'Tambah Kategori Baru' : 'Edit Kategori' }}</h3>
        <form @submit.prevent="uiState.nestedModalType === 'addCategory' ? addCategory() : updateCategory()">
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium">Nama Kategori</label>
                    <input type="text" v-model="uiState.nestedModalData.name" class="mt-1 w-full p-2 border rounded-md" required>
                </div>
            </div>
            <div class="flex justify-end gap-3 mt-6 border-t pt-4">
                <button type="button" @click="hideNestedModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
                <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan</button>
            </div>
        </form>
    </div>
</div>

<div v-if="uiState.modalType === 'viewNote'" class="bg-white rounded-lg shadow-xl p-6 max-w-7xl w-full h-full md:max-h-[30vh] flex flex-col">
    <h3 class="text-xl font-bold mb-4">{{ uiState.modalData.title }}</h3>
    <div class="max-h-[60vh] overflow-y-auto p-4 bg-slate-50 rounded-lg border">
        <p class="text-slate-700 whitespace-pre-wrap">{{ uiState.modalData.content }}</p>
    </div>
    <div class="flex justify-end mt-6 border-t pt-4">
        <button @click="hideModal" class="bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-400">Tutup</button>
    </div>
</div>
<div v-if="uiState.modalType === 'ringkasanJadi'" class="bg-white rounded-lg shadow-xl p-6 max-w-6xl w-full h-full md:max-h-[90vh] flex flex-col">
    <h3 class="text-xl font-bold mb-4">Ringkasan Total Aktual Jadi Kuantitas</h3>
    <div class="mb-4 flex gap-4">
        <div>
            <label for="ringkasan-status-filter" class="block text-sm font-medium text-slate-700 mb-1">Pilih Status Produksi</label>
            <select v-model="uiState.ringkasanStatusSelected" id="ringkasan-status-filter" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm">
                <option value="all">Semua Status</option>
                <option value="Selesai">Selesai</option>
                <option value="Dalam Proses">Dalam Proses</option>
                <option value="Revisi">Revisi</option>
                <option value="Ditunda">Ditunda</option>
            </select>
        </div>
        <!-- Filter jenis Status baru -->
        <div>
            <label for="ringkasan-Status-filter" class="block text-sm font-medium text-slate-700 mb-1">Pilih Jenis Status</label>
            <select v-model="uiState.produksiFilterType" id="ringkasan-Status-filter" class="mt-1 block w-full p-2 border rounded-md bg-white shadow-sm">
                <option value="all">Semua Jenis Status</option>
                <option value="pemaklun">Pemaklun</option>
                <option value="penjahit">Penjahit</option>
            </select>
        </div>
    </div>
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto max-h-[70vh]">
        <table class="w-full text-sm text-left text-slate-500">
            <thead class="text-xs text-slate-700 uppercase bg-slate-100 sticky top-0">
                <tr>
                    <th class="px-6 py-3">Tanggal</th>
                    <th class="px-6 py-3">Model Produk</th>
                    <th class="px-6 py-3">Nama Kain</th>
                    <th class="px-6 py-3">Warna</th>
                    <th class="px-6 py-3">Ukuran</th>
                    <th class="px-6 py-3 text-right">Total Aktual Jadi</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                <tr v-if="ringkasanJadiData.length === 0">
                    <td colspan="6" class="px-6 py-10 text-center text-slate-500">Tidak ada data untuk status ini.</td>
                </tr>
                <tr v-for="(item, index) in ringkasanJadiData" :key="index">
                    <td class="px-6 py-4 font-semibold text-slate-800">{{ new Date(item.tanggal).toLocaleDateString('id-ID') }}</td>
                    <td class="px-6 py-4 font-semibold text-slate-800">{{ item.model }}</td>
                    <td class="px-6 py-4 font-semibold text-slate-800">{{ item.kain }}</td>
                    <td class="px-6 py-4 font-semibold text-slate-800">{{ item.warna }}</td>
                    <td class="px-6 py-4 font-semibold text-slate-800">{{ item.ukuran }}</td>
                    <td class="px-6 py-4 text-right font-bold text-indigo-700">{{ item.total }} pcs</td>
                </tr>
            </tbody>
        </table>
    </div>
    <div class="flex justify-end mt-6 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-400">Tutup</button>
    </div>
</div>

<div v-if="uiState.modalType === 'addRetur'" class="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full h-full md:max-h-[90vh] flex flex-col">
    <h3 class="text-xl font-bold mb-4">Tambah Data Retur dari Transaksi</h3>
    
    <div class="p-4 bg-slate-50 rounded-lg border flex flex-col md:flex-row gap-2 items-end">
        <div class="flex-grow w-full">
            <label class="block text-sm font-medium">1. Scan Resi atau Masukkan ID Pesanan Marketplace</label>
            <input type="text" v-model="uiState.modalData.transactionIdSearch" placeholder="Cari ID dari riwayat transaksi atau resi..." class="mt-1 w-full p-2 border rounded-md">
        </div>
        <button @click="findTransactionForReturn" type="button" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 w-full md:w-auto">
            Cari Transaksi
        </button>
    </div>

    <div v-if="uiState.modalData.foundTransaction" class="flex-1 overflow-y-auto mt-4 pt-4 border-t">
        <div class="mb-4 p-3 bg-green-50 text-green-800 rounded-md border border-green-200">
            <p><strong>Transaksi Ditemukan:</strong> {{ uiState.modalData.foundTransaction.marketplaceOrderId }}</p>
            <p class="text-sm"><strong>Tanggal:</strong> {{ new Date(uiState.modalData.foundTransaction.tanggal).toLocaleDateString('id-ID') }} | <strong>Channel:</strong> {{ uiState.modalData.foundTransaction.channel }}</p>
        </div>

        <h4 class="font-semibold mb-2">2. Pilih Produk yang Diretur:</h4>
        <div class="space-y-3 max-h-[40vh] overflow-y-auto p-2">
            <div v-for="(item, index) in uiState.modalData.items" :key="index" class="p-3 border rounded-lg bg-white shadow-sm">
                <div class="flex items-start gap-4">
                    <input type="checkbox" v-model="item.selected" class="mt-1 h-5 w-5">
                    <div class="flex-grow">
                        <p class="font-semibold">{{ getProductBySku(item.sku)?.nama || item.sku }}</p>
                        <p class="text-xs text-slate-500">SKU: {{ item.sku }} | Harga Jual Asli: {{ formatCurrency(item.hargaJual) }}</p>
                        
                        <div v-if="item.selected" class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 animate-fade-in">
                            <div>
                                <label class="block text-xs font-medium">Qty Retur</label>
                                <input type="number" v-model.number="item.returnQty" class="mt-1 w-full p-1.5 text-xs border rounded-md" :max="item.qty" min="1">
                            </div>
                            <div>
                                <label class="block text-xs font-medium">Alasan</label>
                                <input type="text" v-model="item.alasan" class="mt-1 w-full p-1.5 text-xs border rounded-md">
                            </div>
                            <div>
                                <label class="block text-xs font-medium">Tindak Lanjut</label>
                                <select v-model="item.tindakLanjut" class="mt-1 w-full p-1.5 text-xs border rounded-md">
                                    <option>Ganti Baru</option><option>Tukar Ukuran</option><option>Tukar Warna</option><option>Refund</option><option>Perbaiki</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="flex justify-end gap-3 pt-4 border-t mt-auto">
        <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
        <button type="button" @click="submitReturForm" class="bg-indigo-600 text-white py-2 px-4 rounded-lg" :disabled="!isSubscriptionActive">Simpan Data Retur</button>
    </div>
</div>

<div v-if="uiState.modalType === 'kelolaStok'" class="bg-white rounded-lg shadow-xl p-6 max-w-5xl w-full h-full md:max-h-[60vh] flex flex-col">
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
            
            <div v-if="state.settings.marketplaces.length === 0" class="p-4 bg-yellow-100 text-yellow-800 border border-yellow-300 rounded-md">
                <p class="font-semibold mb-2">Peringatan:</p>
                <p class="text-sm">Anda belum memiliki marketplace untuk mengalokasikan stok. Silakan tambahkan data marketplace di halaman <a href="#" @click.prevent="changePage('pengaturan')" class="underline font-bold">Pengaturan</a> terlebih dahulu.</p>
            </div>

            <div v-else class="space-y-2 max-h-60 overflow-y-auto pr-2">
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

<div v-if="uiState.modalType === 'editModelProduk' || uiState.modalType === 'addModelProduk'" class="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-start justify-center p-20">
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full h-full md:max-h-[85vh] flex flex-col">
        <h3 class="text-xl font-bold mb-4">{{ uiState.modalType === 'addModelProduk' ? 'Tambah Model Produk Baru' : 'Edit Model Produk' }}</h3>
        <form @submit.prevent="uiState.modalType === 'addModelProduk' ? addModelProduk() : saveModelProdukEdit()" class="space-y-4 overflow-y-auto pr-2">
            <div>
                <label class="block text-sm font-medium text-slate-700">Nama Model</label>
                <input type="text" v-model="uiState.modalData.namaModel" class="mt-1 w-full p-2 border rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-700">Warna</label>
                <input type="text" v-model="uiState.modalData.warna" class="mt-1 w-full p-2 border rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-700">Ukuran</label>
                <input type="text" v-model="uiState.modalData.ukuran" class="mt-1 w-full p-2 border rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-700">Kebutuhan Kain (Yard/Model)</label>
                <input type="number" step="0.1" v-model.number="uiState.modalData.yardPerModel" class="mt-1 w-full p-2 border rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-700">Harga Jasa Maklun (Rp)</label>
                <input type="number" v-model.number="uiState.modalData.hargaMaklun" class="mt-1 w-full p-2 border rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-700">Harga Jasa Jahit (Rp)</label>
                <input type="number" v-model.number="uiState.modalData.hargaJahit" class="mt-1 w-full p-2 border rounded-md">
            </div>
            <div class="flex justify-end gap-3 pt-6 border-t mt-6">
                <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
                <button type="submit" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg" :disabled="!isSubscriptionActive">Simpan Perubahan</button>
            </div>
        </form>
    </div>
</div>


<div v-if="uiState.modalType === 'editMarketplace'" class="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full h-full md:max-h-[70vh] flex flex-col">
    <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-slate-800">Edit Marketplace</h3>
        <button @click="uiState.isProgramInfoModalVisible = true" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
            Informasi
        </button>
    </div>
    <form @submit.prevent="saveMarketplaceEdit" class="space-y-4 overflow-y-auto pr-2">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
                <label class="block text-sm font-medium text-slate-700">Nama Marketplace</label>
                <input type="text" v-model="uiState.modalData.name" class="mt-1 w-full p-2 border rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium">Administrasi (%)</label>
                <input type="text" v-model="admComputed" class="w-full p-2 border rounded-md">
            </div>
            <div>
                <label class="block text-sm font-medium">Layanan Gratis Ongkir Xtra (%)</label>
                <input type="text" v-model="layananComputed" class="w-full p-2 border rounded-md">
            </div>
            <div>
                
                <label class="block text-sm font-medium">Per Pesanan (Rp)</label>
                <input type="number" v-model.number="uiState.modalData.perPesanan" class="w-full p-2 border rounded-md">
            </div>
        </div>

        <div class="space-y-2 mt-6">
            <h4 class="font-semibold text-slate-700 mb-2">Program Marketplace</h4>
            <div v-for="(program, index) in uiState.modalData.programs" :key="program.id || index" class="flex items-center gap-2 mb-2">
                <input type="text" v-model="program.name" placeholder="Nama Program" class="w-full p-2 border rounded-md text-sm">
                
                <input type="text" :value="programRateComputed(program).value" @input="programRateComputed(program).setValue($event.target.value)" placeholder="Rate (%)" class="w-24 p-2 border rounded-md text-sm text-right">
                
                <button type="button" @click="removeProgram(program.id)" class="text-red-500 hover:text-red-700 text-xl font-bold">×</button>
            </div>
            <button type="button" @click="addProgram()" class="mt-2 text-xs text-blue-600 hover:underline">+ Tambah Program</button>
        </div>
    </form>
    <div class="flex-shrink-0 flex justify-end gap-3 pt-4 border-t mt-4">
        <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
        <button type="submit" @click="saveMarketplaceEdit" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg" :disabled="!isSubscriptionActive">Simpan Perubahan</button>
    </div>
</div>

<div v-if="uiState.isProgramInfoModalVisible" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full">
        <div class="flex justify-between items-start pb-4 border-b">
            <h3 class="text-xl font-bold text-slate-800 flex items-center gap-2">
                <svg class="w-6 h-6 text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
                Informasi Biaya Program
            </h3>
        </div>
        <div class="space-y-4 text-slate-700 py-4">
            <p class="text-sm text-slate-600">
                **Biaya Program** adalah biaya tambahan yang dikenakan oleh platform e-commerce (seperti Shopee, Tokopedia, TikTok Shop) ketika Anda berpartisipasi dalam program promosi khusus.
            </p>
            <p class="text-sm text-slate-600">
                Memasukkan biaya ini dengan benar dan **sangat penting** untuk memastikan kalkulasi laba bersih Anda akurat. Biaya ini berbeda dengan biaya administrasi atau komisi standar.
            </p>
            <div class="space-y-2 mt-4">
                <div class="p-4 bg-slate-50 rounded-lg">
                    <p class="font-semibold text-slate-700">Contoh Biaya Program:</p>
                    <ul class="list-disc list-inside ml-4 mt-1 text-sm text-slate-600">
                        <li>**Live Xtra:** Biaya khusus untuk program Live.</li>
                        <li>**Cashback Xtra:** Biaya untuk program cashback.</li>
                        <li>**Program Lainya:** Biaya untuk acara promosi Lainya.</li>
                    </ul>
                </div>
            </div>
            <p class="mt-4 text-sm text-slate-600 font-semibold">
                Anda dapat menemukan rincian biaya ini di laporan keuangan atau detail penjualan di setiap platform e-commerce.
            </p>
        </div>
        <div class="flex justify-end gap-3 pt-4 border-t">
            <button @click="uiState.isProgramInfoModalVisible = false" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
        </div>
    </div>
</div>

<div v-if="uiState.modalType === 'addProduksi'" class="bg-white rounded-lg shadow-xl p-6 max-w-6xl w-full h-full md:max-h-[100vh] flex flex-col">
    <div class="flex items-center gap-4 mb-4">
        <h3 class="text-xl font-bold">Buat Batch Produksi Baru</h3>
        <button @click.stop="showNestedModal('panduanProduksi')" type="button" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
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
                <label class="block text-sm font-medium text-slate-700">Jenis Jasa</label>
                <select v-model="uiState.newProduksiBatch.produksiType" class="mt-1 block w-full p-2 border rounded-md" required>
                    <option value="pemaklun">Pemaklun</option>
                    <option value="penjahit">Penjahit</option>
                </select>
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium text-slate-700">{{ uiState.newProduksiBatch.produksiType === 'penjahit' ? 'Nama Penjahit' : 'Nama Pemaklun' }}</label>
            <input type="text" v-model="uiState.newProduksiBatch.namaStatus" class="mt-1 block w-full p-2 border rounded-md" :placeholder="uiState.newProduksiBatch.produksiType === 'penjahit' ? 'Contoh: Ibu Ranti' : 'Contoh: Jahit Cepat Abadi'" required>
        </div>
        
        <div class="border-t pt-4">
            <h4 class="text-lg font-semibold mb-2">Detail Bahan Produksi</h4>
            <div class="space-y-4">
                <div v-for="(item, index) in uiState.newProduksiBatch.kainBahan" :key="index" class="p-4 border rounded-lg bg-slate-50 relative">
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
                        <div class="space-y-3">
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-medium">Model Produk</label>
                                    <select v-model="item.modelProdukId" @change="handleModelProdukChange(item)" class="mt-1 w-full p-2 text-sm border rounded-md bg-white">
                                        <option value="">Pilih Model</option>
                                        <option v-for="model in state.settings.modelProduk" :key="model.id" :value="model.id">{{ model.namaModel }}</option>
                                    </select>
                                </div>
                                
                                <div v-if="item.modelProdukId">
                                    <label class="block text-xs font-medium">SKU Produk (Untuk Aktual Jadi)</label>
                                    <select v-if="state.produk.filter(p => p.model_id === item.modelProdukId).length > 0" v-model="item.sku" @change="handleProductSkuChange(item)" class="mt-1 w-full p-2 text-sm border rounded-md bg-white">
                                        <option value="">-- Pilih SKU Terdaftar --</option>
                                        <option v-for="product in state.produk.filter(p => p.model_id === item.modelProdukId)" :key="product.sku" :value="product.sku">
                                            {{ product.sku }} - {{ product.varian }}
                                        </option>
                                    </select>
                                     <div v-else class="mt-1 p-2 text-sm text-red-700 bg-red-100 border border-red-300 rounded-md">
                                        <p class="mb-2">Tidak ada produk.</p>
                                        <a href="#" @click.prevent="activePage = 'inventaris'" class="font-semibold underline">Tambah Produk</a>
                                    </div>
                                </div>

                                <div class="col-span-2">
                                    <label class="block text-xs font-medium">SKU Kombinasi (Tulis Manual)</label>
                                    <input type="text" v-model="item.skuKombinasi" placeholder="Misal: Lengan Merah" class="mt-1 w-full p-2 text-sm border rounded-md">
                                </div>

                                <div><label class="block text-xs font-medium">Nama Kain</label><input list="namaKainHistory" v-model="item.namaKain" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <datalist id="namaKainHistory"><option v-for="name in namaKainHistory" :key="name" :value="name"></option></datalist>
                                <div><label class="block text-xs font-medium">Toko Kain</label><input list="tokoKainHistory" v-model="item.tokoKain" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <datalist id="tokoKainHistory"><option v-for="toko in tokoKainHistory" :key="toko" :value="toko"></option></datalist>
                                <div><label class="block text-xs font-medium">Warna Kain</label><input v-model="item.warnaKain" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Ukuran</label><input v-model="item.ukuran" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Total Yard</label><input list="totalYardHistory" v-model.number="item.totalYard" type="number" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <datalist id="totalYardHistory"><option v-for="yard in totalYardHistory" :key="yard" :value="yard"></option></datalist>
                                <div><label class="block text-xs font-medium">Harga/Yard</label><input list="hargaKainPerYardHistory" v-model.number="item.hargaKainPerYard" type="number" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <datalist id="hargaKainPerYardHistory"><option v-for="harga in hargaKainPerYardHistory" :key="harga" :value="harga"></option></datalist>
                                <div v-if="uiState.newProduksiBatch.produksiType === 'penjahit'">
                                    <label class="block text-xs font-medium">Harga Jahit/Pcs</label>
                                    <input v-model.number="item.hargaJahitPerPcs" type="number" class="mt-1 w-full p-2 text-sm border rounded-md">
                                </div>
                                <div v-else>
                                    <label class="block text-xs font-medium">Harga Maklun/Pcs</label>
                                    <input v-model.number="item.hargaMaklunPerPcs" type="number" class="mt-1 w-full p-2 text-sm border rounded-md">
                                </div>
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
        <span class="font-medium">{{ calculateRowSummary(item, 'new')?.targetQty || 0 }} pcs</span>
    </div>
    <div class="flex justify-between font-bold" :class="calculateRowSummary(item, 'new')?.selisih < 0 ? 'text-red-500' : 'text-emerald-600'">
        <span>Selisih (Aktual - Target):</span>
        <span>{{ (calculateRowSummary(item, 'new')?.selisih >= 0 ? '+' : '') + (calculateRowSummary(item, 'new')?.selisih || 0) }} pcs</span>
    </div>
    <hr class="my-2">
    <div class="flex justify-between">
        <span class="text-slate-600">Total Biaya Kain:</span>
        <span class="font-medium">{{ formatCurrency(calculateRowSummary(item, 'new')?.totalBiayaKain || 0) }}</span>
    </div>
    <div class="flex justify-between">
        <span class="text-slate-600">Total Biaya {{ uiState.newProduksiBatch.produksiType === 'penjahit' ? 'Jahit' : 'Maklun' }}:</span>
        <span class="font-medium">{{ formatCurrency(calculateRowSummary(item, 'new')?.totalBiayaJasa || 0) }}</span>
    </div>
    <div class="flex justify-between">
        <span class="text-slate-600">Total Biaya Alat:</span>
        <span class="font-medium">{{ formatCurrency(calculateRowSummary(item, 'new')?.totalBiayaAlat || 0) }}</span>
    </div>
    <div class="flex justify-between font-bold text-slate-800 border-t pt-1 mt-1">
        <span>Total Biaya Produksi:</span>
        <span>{{ formatCurrency(calculateRowSummary(item, 'new')?.totalBiayaProduksi || 0) }}</span>
    </div>
    <div class="border-t pt-2 mt-2 space-y-1">
        <div class="flex justify-between text-sm">
            <span class="flex items-center gap-1 text-slate-600">
                HPP Ideal/Pcs
                <button @click.stop="showNestedModal('hppCalculationInfo', { topic: 'ideal' })" type="button" class="help-icon-button-sm">?</button>
            </span>
            <span class="font-medium">{{ formatCurrency(calculateRowSummary(item, 'new')?.hppIdeal || 0) }}</span>
        </div>
        <div class="flex justify-between text-sm" v-if="calculateRowSummary(item, 'new')?.selisih < 0">
            <span class="flex items-center gap-1 text-slate-600">
                Kerugian/Pcs
                <button @click.stop="showNestedModal('hppCalculationInfo', { topic: 'loss' })" type="button" class="help-icon-button-sm">?</button>
            </span>
            <span class="font-medium text-red-500">+ {{ formatCurrency(calculateRowSummary(item, 'new')?.kerugianPerPcs || 0) }}</span>
        </div>
        <div class="flex justify-between font-bold text-base text-red-600 border-t pt-1 mt-1">
            <span class="flex items-center gap-1">
                HPP Final/Pcs
                <button @click.stop="showNestedModal('hppCalculationInfo', { topic: 'final' })" type="button" class="help-icon-button-sm">?</button>
            </span>
            <span>{{ formatCurrency(calculateRowSummary(item, 'new')?.hpp || 0) }}</span>
        </div>
    </div>
</div>
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
        <div class="flex justify-end gap-3 mt-6 border-t pt-7">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan Batch Produksi</button>
        </div>
    </form>
</div>

<div v-if="uiState.modalType === 'editProduksi'" class="bg-white rounded-lg shadow-xl p-6 max-w-6xl w-full h-full md:max-h-[90vh] flex flex-col">
    <h3 class="text-xl font-bold mb-4">Edit Batch Produksi: {{ uiState.editProduksiBatch?.id }}</h3>
    <form @submit.prevent="submitEditProduksiBatch" class="space-y-4 overflow-y-auto max-h-[90vh] p-2">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-slate-700">Tanggal Produksi</label>
                <input type="date" v-model="uiState.editProduksiBatch.tanggal" class="mt-1 block w-full p-2 border rounded-md" required>
            </div>
            <div>
                <label class="block text-sm font-medium text-slate-700">Jenis Jasa</label>
                <select v-model="uiState.editProduksiBatch.produksiType" class="mt-1 block w-full p-2 border rounded-md" required>
                    <option value="pemaklun">Pemaklun</option>
                    <option value="penjahit">Penjahit</option>
                </select>
            </div>
        </div>
        <div>
            <label class="block text-sm font-medium text-slate-700">{{ uiState.editProduksiBatch.produksiType === 'penjahit' ? 'Nama Penjahit' : 'Nama Pemaklun' }}</label>
            <input type="text" v-model="uiState.editProduksiBatch.namaStatus" class="mt-1 block w-full p-2 border rounded-md" required>
        </div>
        
        <div class="border-t pt-4">
            <h4 class="text-lg font-semibold mb-2">Detail Bahan Produksi</h4>
            <div class="space-y-4">
                <div v-for="(item, index) in uiState.editProduksiBatch?.kainBahan" :key="index" class="p-4 border rounded-lg bg-slate-50 relative">
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
                        <div class="space-y-3">
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-medium">Model Produk</label>
                                    <select v-model="item.modelProdukId" @change="handleModelProdukChange(item)" class="mt-1 w-full p-2 text-sm border rounded-md bg-white">
                                        <option value="">Pilih Model</option>
                                        <option v-for="model in state.settings.modelProduk" :key="model.id" :value="model.id">{{ model.namaModel }}</option>
                                    </select>
                                </div>
                                
                                <div v-if="item.modelProdukId">
                                    <label class="block text-xs font-medium">SKU Produk (Untuk Aktual Jadi)</label>
                                    <select v-model="item.sku" @change="handleProductSkuChange(item)" class="mt-1 w-full p-2 text-sm border rounded-md bg-white">
                                        <option value="">-- Pilih SKU Terdaftar --</option>
                                        <option v-for="product in state.produk.filter(p => p.model_id === item.modelProdukId)" :key="product.sku" :value="product.sku">
                                            {{ product.sku }} - {{ product.varian }}
                                        </option>
                                    </select>
                                </div>
                                <div class="col-span-2">
                                    <label class="block text-xs font-medium">SKU Kombinasi (Tulis Manual)</label>
                                    <input type="text" v-model="item.skuKombinasi" placeholder="Misal: Lengan Merah" class="mt-1 w-full p-2 text-sm border rounded-md">
                                </div>
                                <div><label class="block text-xs font-medium">Nama Kain</label><input list="namaKainHistory" v-model="item.namaKain" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <datalist id="namaKainHistory"><option v-for="name in namaKainHistory" :key="name" :value="name"></option></datalist>
                                <div><label class="block text-xs font-medium">Toko Kain</label><input list="tokoKainHistory" v-model="item.tokoKain" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <datalist id="tokoKainHistory"><option v-for="toko in tokoKainHistory" :key="toko" :value="toko"></option></datalist>
                                <div><label class="block text-xs font-medium">Warna Kain</label><input v-model="item.warnaKain" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Ukuran</label><input v-model="item.ukuran" type="text" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <div><label class="block text-xs font-medium">Total Yard</label><input list="totalYardHistory" v-model.number="item.totalYard" type="number" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <datalist id="totalYardHistory"><option v-for="yard in totalYardHistory" :key="yard" :value="yard"></option></datalist>
                                <div><label class="block text-xs font-medium">Harga/Yard</label><input list="hargaKainPerYardHistory" v-model.number="item.hargaKainPerYard" type="number" class="mt-1 w-full p-2 text-sm border rounded-md"></div>
                                <datalist id="hargaKainPerYardHistory"><option v-for="harga in hargaKainPerYardHistory" :key="harga" :value="harga"></option></datalist>
                                <div v-if="uiState.editProduksiBatch.produksiType === 'penjahit'">
                                    <label class="block text-xs font-medium">Harga Jahit/Pcs</label>
                                    <input v-model.number="item.hargaJahitPerPcs" type="number" class="mt-1 w-full p-2 text-sm border rounded-md">
                                </div>
                                <div v-else>
                                    <label class="block text-xs font-medium">Harga Maklun/Pcs</label>
                                    <input v-model.number="item.hargaMaklunPerPcs" type="number" class="mt-1 w-full p-2 text-sm border rounded-md">
                                </div>
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
        <span class="font-medium">{{ calculateRowSummary(item, 'edit')?.targetQty || 0 }} pcs</span>
    </div>
    <div class="flex justify-between font-bold" :class="calculateRowSummary(item, 'edit')?.selisih < 0 ? 'text-red-500' : 'text-emerald-600'">
        <span>Selisih (Aktual - Target):</span>
        <span>{{ (calculateRowSummary(item, 'edit')?.selisih >= 0 ? '+' : '') + (calculateRowSummary(item, 'edit')?.selisih || 0) }} pcs</span>
    </div>
    <hr class="my-2">
    <div class="flex justify-between">
        <span class="text-slate-600">Total Biaya Kain:</span>
        <span class="font-medium">{{ formatCurrency(calculateRowSummary(item, 'edit')?.totalBiayaKain || 0) }}</span>
    </div>
    <div class="flex justify-between">
        <span class="text-slate-600">Total Biaya {{ uiState.editProduksiBatch.produksiType === 'penjahit' ? 'Jahit' : 'Maklun' }}:</span>
        <span class="font-medium">{{ formatCurrency(calculateRowSummary(item, 'edit')?.totalBiayaJasa || 0) }}</span>
    </div>
    <div class="flex justify-between">
        <span class="text-slate-600">Total Biaya Alat:</span>
        <span class="font-medium">{{ formatCurrency(calculateRowSummary(item, 'edit')?.totalBiayaAlat || 0) }}</span>
    </div>
    <div class="flex justify-between font-bold text-slate-800 border-t pt-1 mt-1">
        <span>Total Biaya Produksi:</span>
        <span>{{ formatCurrency(calculateRowSummary(item, 'edit')?.totalBiayaProduksi || 0) }}</span>
    </div>
    <div class="border-t pt-2 mt-2 space-y-1">
        <div class="flex justify-between text-sm">
            <span class="flex items-center gap-1 text-slate-600">
                HPP Ideal/Pcs
                <button @click.stop="showNestedModal('hppCalculationInfo', { topic: 'ideal' })" type="button" class="help-icon-button-sm">?</button>
            </span>
            <span class="font-medium">{{ formatCurrency(calculateRowSummary(item, 'edit')?.hppIdeal || 0) }}</span>
        </div>
        <div class="flex justify-between text-sm" v-if="calculateRowSummary(item, 'edit')?.selisih < 0">
            <span class="flex items-center gap-1 text-slate-600">
                Kerugian/Pcs
                <button @click.stop="showNestedModal('hppCalculationInfo', { topic: 'loss' })" type="button" class="help-icon-button-sm">?</button>
            </span>
            <span class="font-medium text-red-500">+ {{ formatCurrency(calculateRowSummary(item, 'edit')?.kerugianPerPcs || 0) }}</span>
        </div>
        <div class="flex justify-between font-bold text-base text-red-600 border-t pt-1 mt-1">
            <span class="flex items-center gap-1">
                HPP Final/Pcs
                <button @click.stop="showNestedModal('hppCalculationInfo', { topic: 'final' })" type="button" class="help-icon-button-sm">?</button>
            </span>
            <span>{{ formatCurrency(calculateRowSummary(item, 'edit')?.hpp || 0) }}</span>
        </div>
    </div>
</div>
                        </div>
                    </div>
                    <button v-if="uiState.editProduksiBatch.kainBahan.length > 1" @click="removeKainBahanItem(uiState.editProduksiBatch, index)" type="button" class="absolute top-2 right-2 bg-red-500 text-white rounded-full h-5 w-5 text-xs flex items-center justify-center font-bold">×</button>
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

<div v-if="uiState.nestedModalType === 'panduanProduksi'" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-3xl w-4/5 max-h-[90vh] flex flex-col">
        <div class="flex-shrink-0 pb-4 border-b">
            <h3 class="text-2xl font-bold text-slate-800">Panduan Form Produksi</h3>
            <p class="text-slate-500">Penjelasan fungsional untuk memastikan pencatatan biaya dan kuantitas yang akurat.</p>
        </div>

        <div class="flex-1 overflow-y-auto py-4 pr-2">
            <div class="space-y-6 text-slate-700 leading-relaxed prose max-w-none">
                
                <div>
                    <h4 class="text-xl font-semibold">Memahami Kolom SKU</h4>
                    <p class="mt-2">Form ini memiliki dua jenis kolom SKU untuk menangani produk utama dan produk kombinasi secara terpisah.</p>
                    <ul class="list-disc list-inside space-y-2 mt-2 text-sm">
                        <li>
                            <strong>SKU Produk (Untuk Aktual Jadi):</strong> Gunakan dropdown ini untuk memilih SKU produk akhir yang <strong>sudah terdaftar di Manajemen Inventaris</strong>. Stok dari SKU inilah yang akan bertambah ketika Anda menekan tombol "+ Masukkan ke Inventaris". Wajib diisi untuk bahan utama.
                        </li>
                        <li>
                            <strong>SKU Kombinasi (Tulis Manual):</strong> Gunakan kolom teks ini untuk memberi nama pada bahan komponen atau kombinasi (contoh: "Lengan Merah", "Kerah Putih"). Data ini <strong>tidak terhubung ke inventaris</strong> dan hanya berfungsi untuk pencatatan biaya bahan tambahan pada produk akhir.
                        </li>
                    </ul>
                </div>

                <div>
                    <h4 class="text-xl font-semibold">Aktual Jadi vs. Aktual Jadi Kombinasi</h4>
                    <p class="mt-2">Gunakan kolom <strong>"Aktual Jadi"</strong> ketika satu produk (contoh: 1 ModelProduk) dibuat sepenuhnya dari satu jenis bahan kain utama. Kolom ini berfungsi sebagai sumber data utama untuk perhitungan final. Semua biaya krusial (jasa, alat) dan jumlah total produk jadi akan dihitung berdasarkan input di sini.</p>
                    <ul class="list-disc list-inside mt-2 space-y-1 text-sm">
                        <li><strong>Kapan digunakan:</strong> Produksi standar, seperti kaos yang seluruh bagiannya terbuat dari bahan dan warna yang sama.</li>
                        <li><strong>Peran:</strong> Menentukan jumlah akhir produk jadi dan menjadi dasar kalkulasi semua biaya produksi.</li>
                    </ul>
                    <p class="mt-3">Gunakan kolom <strong>"Aktual Jadi Kombinasi"</strong> untuk mencatat penggunaan bahan kain sekunder atau tambahan dalam pembuatan satu produk yang sama.</p>
                    <ul class="list-disc list-inside mt-2 space-y-1 text-sm">
                        <li><strong>Bahan Utama/Dominan:</strong> Data untuk bahan yang paling banyak digunakan (misalnya, kain untuk bagian badan) harus dimasukkan ke dalam kolom "Aktual Jadi".</li>
                        <li><strong>Bahan Sekunder:</strong> Data untuk bahan campuran (misalnya, kain untuk bagian lengan) dimasukkan ke dalam kolom "Aktual Jadi Kombinasi".</li>
                        <li><strong>Kapan digunakan:</strong> Produksi produk dengan variasi bahan, seperti kemeja dengan badan katun dan lengan rayon.</li>
                        <li><strong>Peran:</strong> Mencatat biaya material tambahan tanpa memengaruhi perhitungan utama untuk biaya jasa dan peralatan.</li>
                    </ul>
                </div>

                <div>
                    <h4 class="text-xl font-semibold">Peringatan Penting</h4>
                    <ul class="list-none space-y-2 mt-2">
                        <li class="p-3 bg-red-100 text-red-800 border-l-4 border-red-500">
                            <strong>❌ Jangan menggunakan kedua kolom ("Aktual Jadi" dan "Aktual Jadi Kombinasi") sekaligus dalam satu baris bahan!</strong><br>
                            Pilih salah satu. Jika Anda butuh mencatat keduanya untuk satu produk, klik "+ Tambah Kain & Bahan Lain" untuk membuat baris baru.
                        </li>
                        <li class="p-3 bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500">
                            <strong>ℹ️ Catatan Penting untuk Sisa Kain:</strong><br>
                            Jika ada sisa kain yang belum terpotong, catat kode unik kain tersebut. Jika nanti sisa kain itu dipotong dan menjadi produk jadi, cari batch produksi ini di halaman utama dan klik "Edit" untuk memperbarui jumlah hasil jadinya. Namun, jika sisa kain diarahkan untuk model lain, jangan jadikan kode uniknya sebagai acuan analisis selisih tertinggi, karena data tersebut tidak relevan untuk analisis batch awal.
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



<div v-if="uiState.modalType === 'analisisModel'" class="bg-white rounded-lg shadow-xl p-6 max-w-6xl w-full h-full md:max-h-[90vh] flex flex-col">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">🔍 Analisis Model Produksi</h3>
        <p class="text-slate-500">Analisis efisiensi dan HPP rill untuk setiap hasil produksi.</p>
    </div>

    <div class="flex-1 overflow-y-auto py-4 pr-2">
        <div class="mb-6 p-4 bg-slate-50 rounded-lg border">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-1">Opsi Analisis</label>
                    <select v-model="uiState.analisisModelFilter" class="w-full p-2 border rounded-md bg-white shadow-sm">
                        <option value="none" disabled>-- Pilih Opsi Analisis --</option>
                        <option value="all">Tampilkan Semua Data</option>
                        <option value="model">Analisis per Model</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-1">Jenis Status</label>
                    <select v-model="uiState.produksiFilterType" class="w-full p-2 border rounded-md bg-white shadow-sm">
                        <option value="all">Semua Jenis Status</option>
                        <option value="pemaklun">Pemaklun</option>
                        <option value="penjahit">Penjahit</option>
                    </select>
                </div>
                <div v-if="uiState.analisisModelFilter === 'model'">
                    <label class="block text-sm font-medium text-slate-700 mb-1">Pilih Model Produk</label>
                    <select v-model="uiState.analisisModelSelectedModel" class="w-full p-2 border rounded-md bg-white shadow-sm">
    <option value="" disabled>-- Pilih Model Produk --</option>
    <option v-for="model in state.settings.modelProduk" :key="model.id" :value="model.id">{{ model.namaModel }}</option>
</select>
                </div>
                <div v-if="uiState.analisisModelFilter === 'model' && uiState.analisisModelSelectedModel">
                    <label class="block text-sm font-medium text-slate-700 mb-1">Tipe Aktual Jadi</label>
                    <select v-model="uiState.analisisModelSelectedType" class="w-full p-2 border rounded-md bg-white shadow-sm">
                        <option value="aktualJadi">Aktual Jadi</option>
                        <option value="aktualJadiKombinasi">Aktual Jadi Kombinasi</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-1">Tampilkan Top</label>
                    <div class="relative">
                        <input type="number" v-model.number="uiState.analisisModelLimit" placeholder="Jumlah data" class="w-full p-2 border rounded-md bg-white shadow-sm">
                        <span class="absolute top-1/2 right-3 -translate-y-1/2 text-slate-500 text-xs">baris</span>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="bg-white rounded-lg border shadow-sm flex-1 overflow-y-auto">
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
                            <p class="text-xs text-indigo-600">
                                {{ item.produksiType === 'penjahit' ? 'Penjahit' : 'Pemaklun' }}: {{ item.namaStatus }}
                            </p>
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
    </div>
    
    <div class="flex-shrink-0 flex justify-end gap-3 mt-6 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-400">Tutup</button>
    </div>
</div>

<div v-if="uiState.modalType === 'laporanStatus'" class="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full h-full md:max-h-[30vh] flex flex-col">
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
    <div class="flex justify-end gap-3 mt-12">
        <button type="button" @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Batal</button>
        <button type="button" @click="generateLaporanByStatus(uiState.laporanStatusSelected)" class="bg-cyan-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-cyan-700">Lihat Laporan</button>
    </div>
</div>

<div v-if="uiState.modalType === 'laporanStatusDetail'" class="bg-white rounded-lg shadow-xl p-6 max-w-6xl w-full h-full md:max-h-[90vh] flex flex-col">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Laporan Detail Gabungan - Status: {{ uiState.laporanData.statusTerpilih }}</h3>
    </div>
    
    <div class="flex-1 overflow-y-auto py-4 pr-2">
        <div class="mb-4">
            <label for="laporan-Status-filter" class="block text-sm font-medium text-slate-700 mb-1">Pilih Jenis Jasa</label>
            <select v-model="uiState.produksiFilterType" id="laporan-Status-filter" class="w-full p-2 border rounded-md bg-white shadow-sm">
                <option value="all">Semua Jenis Jasa</option>
                <option value="pemaklun">Pemaklun</option>
                <option value="penjahit">Penjahit</option>
            </select>
        </div>

        <div class="p-4 mb-4 bg-blue-100 border border-blue-300 rounded-lg text-center">
            <p class="text-sm font-medium text-blue-800">Total Keseluruhan Biaya {{ uiState.produksiFilterType === 'all' ? 'Jasa Produksi' : uiState.produksiFilterType === 'penjahit' ? 'Jahit' : 'Maklun' }} (Status: {{ uiState.laporanData.statusTerpilih }})</p>
            <p class="text-3xl font-bold text-blue-900">{{ formatCurrency(laporanTotalBiayaJasa) }}</p>
        </div>

        <div class="space-y-4">
            <p v-if="uiState.laporanData.laporanPerStatus.length === 0" class="text-center py-8 text-slate-500">Tidak ada data untuk status ini.</p>
            
            <div v-for="batch in uiState.laporanData.laporanPerStatus.filter(b => uiState.produksiFilterType === 'all' || b.produksiType === uiState.produksiFilterType)" :key="batch.id" class="p-4 border rounded-lg bg-white shadow-sm">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="font-bold text-indigo-700">ID Batch: {{ batch.id }} ({{ batch.produksiType === 'penjahit' ? 'Penjahit' : 'Pemaklun' }}: {{ batch.namaStatus }})</p>
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
                        <p class="text-sm text-slate-500">Subtotal Biaya {{ batch.produksiType === 'penjahit' ? 'Jahit' : 'Maklun' }}</p>
                        <p class="font-bold text-lg text-green-600">{{ formatCurrency(
                            (batch.kainBahan || []).reduce((subtotal, item) => subtotal + (item.aktualJadi || 0) * (batch.produksiType === 'penjahit' ? (item.hargaJahitPerPcs || 0) : (item.hargaMaklunPerPcs || 0)), 0)
                        ) }}</p>
                    </div>
                </div>
                
                <div class="border-t mt-3 pt-3">
                    <h5 class="font-semibold text-sm mb-2">Detail Produksi:</h5>
                    <div class="space-y-2">
                        <div v-for="(kb, index) in batch.kainBahan" :key="index" class="text-xs p-3 bg-slate-50 rounded-md border flex items-center justify-between">
                            <div>
                                <p class="font-semibold">{{ kb.namaKain }}</p>
                                <ul class="list-disc list-inside ml-4 text-slate-600 space-y-1 mt-1">
                                    <li>Model Produk: {{ state.settings.modelProduk.find(m => m.id === kb.modelProdukId)?.namaModel || 'N/A' }}</li>
                                    <li>Warna Kain: {{ kb.warnaKain || '-' }}</li>
                                    <li>Ukuran: {{ kb.ukuran || '-' }}</li>
                                    <li>Qty Jadi: {{ kb.aktualJadi || 0 }} pcs</li>
                                </ul>
                            </div>
                            <div class="flex-shrink-0 text-right">
                                <span v-if="kb.isInventoried" class="text-green-600 font-bold flex items-center text-xs">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
                                    Sudah Masuk Inventaris
                                </span>
                                <button v-if="!kb.isInventoried && kb.aktualJadi > 0" @click="updateProductionInventoryStatus(batch.id, index)" class="bg-indigo-600 text-white font-bold py-1 px-3 rounded-lg hover:bg-indigo-700 text-sm" :disabled="!isSubscriptionActive">
    + Masukkan ke Inventaris
</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="border-t mt-3 pt-3">
                    <h5 class="font-semibold text-sm mb-1">Catatan</h5>
                    <p class="text-sm text-slate-600">{{ batch.catatan || '-' }}</p>
                </div>
            </div>
        </div>
    </div>
    
    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="exportGroupedProduksiToExcel()" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg">Export Laporan</button>
        <button @click="hideModal" class="bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-400">Tutup</button>
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
                    <p class="mt-2">Gunakan kolom <strong>"Aktual Jadi"</strong> ketika satu produk (contoh: 1 ModelProduk) dibuat sepenuhnya dari satu jenis bahan kain utama.</p>
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
                        <li><strong>Bahan Utama/Dominan:</strong> Data untuk bahan yang paling banyak digunakan (misalnya, kain untuk bagian badan Model Produk) harus dimasukkan ke dalam kolom "Aktual Jadi".</li>
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
<div v-if="uiState.modalType === 'panduanPOS'" class="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full h-full md:max-h-[90vh] flex flex-col">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Panduan Fitur Kasir (Point of Sale)</h3>
        <p class="text-slate-500">Alur Kerja untuk Transaksi Tunggal yang Akurat dan Fleksibel.</p>
    </div>
    
    <div class="flex-1 overflow-y-auto py-4 pr-2">
        <div class="space-y-6 text-slate-700 leading-relaxed prose">
            <p>Halaman Kasir dirancang untuk memproses <strong>satu pesanan per satu waktu</strong> dengan tingkat akurasi dan kontrol tertinggi. Alur ini ideal untuk memverifikasi setiap detail pesanan sebelum finalisasi.</p>
            
            <h4 class="text-lg font-semibold mt-4 mb-2">Alur Kerja Hybrid (Manual & Scanner)</h4>
            <p>Sistem input tunggal kami dirancang untuk melayani semua jenis pengguna secara efisien:</p>
            <ol class="list-decimal list-inside space-y-2 mt-2">
                <li><strong>Mulai Scan/Ketik Produk:</strong> Produk yang di-scan atau dipilih dari rekomendasi akan langsung masuk ke keranjang.</li>
                <li><strong>Scan/Ketik ID Pesanan:</strong> Setelah semua produk masuk keranjang, scan resi atau ketik ID Pesanan lalu tekan <strong>Enter</strong> atau klik tombol <strong>"Jadikan ID Pesanan"</strong>. ID akan tercatat dan keranjang akan terkunci.</li>
                <li><strong>Verifikasi Akhir:</strong> Periksa kembali isi keranjang, total harga, dan ID Pesanan yang sudah tercatat.</li>
                <li><strong>Selesaikan Transaksi:</strong> Klik tombol finalisasi untuk menyimpan transaksi. Setelah berhasil, halaman akan siap untuk pesanan berikutnya.</li>
            </ol>

            <div class="mt-4 p-3 bg-indigo-50 text-indigo-800 border-l-4 border-indigo-500 text-sm">
                <p class="font-bold">Prinsip Utama Halaman Ini</p>
                <p class="mt-2">Halaman ini memegang teguh prinsip <strong>"Satu Resi = Satu Keranjang"</strong>. Mengunci keranjang setelah ID Pesanan dimasukkan adalah fitur keamanan untuk memastikan tidak ada produk yang salah masuk ke pesanan yang salah.</p>
            </div>
        </div>
    </div>

    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
    </div>
</div>

<div v-if="uiState.modalType === 'panduanRetur'" class="bg-white rounded-xl shadow-xl p-6 max-w-4xl w-full h-full md:max-h-[70vh] flex flex-col">
    <div class="flex-shrink-0 pb-4 mb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Panduan Manajemen Retur</h3>
        <p class="text-slate-500 mt-1">Pahami alur kerja dan logika stok untuk proses retur yang akurat.</p>
    </div>
    
    <div class="flex-1 overflow-y-auto pr-2 text-slate-700">
        <p class="mb-4">Modul ini dirancang untuk membantu Anda mencatat pengembalian produk dari pelanggan dan secara otomatis menyesuaikan stok di inventaris Anda.</p>
        
        <div class="mt-2 p-4 bg-indigo-50 rounded-lg">
            <h4 class="font-bold text-lg text-indigo-700 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 15v-1a4 4 0 00-4-4H8m0 0l-3 3m3-3l3 3m0 0v-2a4 4 0 014-4h2" /></svg>
                Alur Kerja Otomatis
            </h4>
            <ul class="list-disc list-inside ml-4 mt-2 space-y-1 text-sm">
                <li>Ketika Anda mencatat retur, sistem akan mengembalikan stok ke **Inventaris Fisik Global** dan **alokasi stok di toko asalnya**.</li>
                <li>Ini memastikan produk yang dikembalikan siap dijual kembali di platform yang sama.</li>
            </ul>
        </div>
        
        <div class="mt-4 p-4 bg-yellow-50 rounded-lg">
            <h4 class="font-bold text-lg text-yellow-800 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                Peringatan Penting
            </h4>
            <ul class="list-disc list-inside ml-4 mt-2 space-y-1 text-sm">
                <li>**Pembatalan Data:** Data retur yang sudah disimpan tidak dapat diubah (diedit). Hapus data yang salah dan catat ulang jika diperlukan.</li>
                <li>**Penghapusan & Dampak Stok:** Menghapus data retur akan secara otomatis **mengurangi stok fisik dan alokasi stok** yang sebelumnya ditambahkan.</li>
            </ul>
        </div>
    </div>
    
    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
    </div>
</div>

<div v-if="uiState.modalType === 'priceCalculator'" class="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full h-full md:max-h-[85vh] flex flex-col">
    <h3 class="text-2xl font-bold text-slate-800 mb-4 border-b pb-4">Kalkulator Harga Jual</h3>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1 overflow-hidden">
        
        <div class="flex flex-col space-y-4">
            <h4 class="text-lg font-semibold text-slate-700">1. Masukkan Data</h4>
            <form @submit.prevent="calculateSellingPrice" class="space-y-4">
                <div>
                    <label class="block text-sm font-medium">Harga Pokok Penjualan (HPP)</label>
                    <input type="number" v-model.number="uiState.priceCalculator.hpp" class="mt-1 w-full p-2 border rounded-md" required placeholder="Contoh: 50000">
                </div>
                <div>
                    <label class="block text-sm font-medium">Pilih Marketplace</label>
                    <select v-model="uiState.priceCalculator.selectedMarketplace" class="w-full p-2 border rounded-md" required>
                        <option value="" disabled>-- Pilih Marketplace --</option>
                        <option v-for="mp in state.settings.marketplaces" :key="mp.id" :value="mp.id">{{ mp.name }}</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium">Pilih Model Produk (untuk diskon)</label>
                    <select v-model="uiState.priceCalculator.selectedModelName" class="w-full p-2 border rounded-md" required>
                        <option value="" disabled>-- Pilih Model --</option>
                        <option v-for="modelName in promosiProductModels" :key="modelName" :value="modelName">{{ modelName }}</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium">Target Keuntungan (%)</label>
                    <input type="text" v-model="targetMarginComputed" class="mt-1 w-full p-2 border rounded-md" placeholder="Contoh: 30%">
                </div>
                
                <div class="pt-4">
                    <button type="submit" class="w-full bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors shadow-md">
                        Hitung Harga
                    </button>
                </div>
            </form>
        </div>

        <div class="flex flex-col overflow-y-auto pr-2">
            <h4 class="text-lg font-semibold text-slate-700">2. Hasil Perhitungan</h4>
            <div v-if="!uiState.priceCalculator.result" class="flex-1 flex items-center justify-center bg-slate-50 rounded-lg mt-4">
                <p class="text-slate-500">Hasil akan muncul di sini...</p>
            </div>
            <div v-else class="mt-4 space-y-6">
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div class="p-4 bg-green-50 rounded-lg border border-green-200">
                        <p class="text-slate-600">Harga Jual Ideal</p>
                        <p class="text-2xl font-bold text-green-700">{{ formatCurrency(uiState.priceCalculator.result.calculatedPrice) }}</p>
                    </div>
                    <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <p class="text-slate-600">Estimasi Laba Bersih</p>
                        <p class="text-2xl font-bold text-blue-700">{{ formatCurrency(uiState.priceCalculator.result.netProfit) }}</p>
                    </div>
                </div>

                <div class="space-y-4">
                    <div class="p-4 bg-slate-50 rounded-lg">
                        <p class="font-semibold text-slate-700">Pendapatan & Modal</p>
                        <ul class="mt-2 text-sm text-slate-600 space-y-1">
                            <li class="flex justify-between"><span>Harga Jual</span><span class="font-medium text-green-600">{{ formatCurrency(uiState.priceCalculator.result.calculatedPrice) }}</span></li>
                             <li class="flex justify-between">
                                <span>Diskon Otomatis ({{ uiState.priceCalculator.result.bestDiscountRatePercentage }}%)</span>
                                <span class="text-red-600">-{{ formatCurrency(uiState.priceCalculator.result.bestDiscount) }}</span>
                            </li>
                            <li class="flex justify-between"><span>HPP (Modal)</span><span class="text-red-600">-{{ formatCurrency(uiState.priceCalculator.result.breakdown.hpp) }}</span></li>
                            <li class="flex justify-between font-bold border-t pt-1 mt-1"><span>Laba Kotor</span><span>{{ formatCurrency(uiState.priceCalculator.result.labaKotor) }}</span></li>
                        </ul>
                    </div>

                    <div class="p-4 bg-slate-50 rounded-lg">
                        <p class="font-semibold text-slate-700">Rincian Biaya Marketplace</p>
                        <ul class="mt-2 text-sm text-slate-600 space-y-1">
                            <li class="flex justify-between"><span>Biaya Admin ({{ uiState.priceCalculator.result.breakdown.admRate }}%)</span><span>-{{ formatCurrency(uiState.priceCalculator.result.breakdown.adminFee) }}</span></li>
                            <li class="flex justify-between"><span>Biaya Komisi ({{ uiState.priceCalculator.result.breakdown.komisiRate }}%)</span><span>-{{ formatCurrency(uiState.priceCalculator.result.breakdown.commission) }}</span></li>
                            <li class="flex justify-between"><span>Biaya Layanan G XTRA ({{ uiState.priceCalculator.result.breakdown.layananRate }}%)</span><span>-{{ formatCurrency(uiState.priceCalculator.result.breakdown.serviceFee) }}</span></li>
                             <li v-for="program in uiState.priceCalculator.result.breakdown.programFee" :key="program.name" class="flex justify-between">
                                <span>- {{ program.name }} ({{ program.rate }}%)</span>
                                <span>-{{ formatCurrency(program.fee) }}</span>
                            </li>
                            <li class="flex justify-between"><span>Biaya Per Pesanan</span><span>-{{ formatCurrency(uiState.priceCalculator.result.breakdown.perOrderFee) }}</span></li>
                            <li class="flex justify-between font-bold text-red-600 border-t pt-1 mt-1">
                                <span>Total Biaya Marketplace</span>
                                <span>-{{ formatCurrency(uiState.priceCalculator.result.totalFees) }}</span>
                            </li>
                        </ul>
                    </div>
                     <div class="p-3 bg-blue-100 rounded-lg text-center">
                         <p class="text-xs text-blue-700">Estimasi Laba Bersih = Laba Kotor - Total Biaya Marketplace</p>
                         <p class="text-lg font-bold text-blue-800">{{formatCurrency(uiState.priceCalculator.result.labaKotor)}} - {{formatCurrency(uiState.priceCalculator.result.totalFees)}} = {{formatCurrency(uiState.priceCalculator.result.netProfit)}}</p>
                     </div>
                </div>
            </div>
        </div>
    </div>
     <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
    </div>
</div>

<div v-if="uiState.modalType === 'laporanSemuanya'" class="bg-white rounded-lg shadow-xl p-6 max-w-7xl w-full h-full md:max-h-[90vh] flex flex-col">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Laporan Produksi Menyeluruh</h3>
        <p class="text-slate-500">Analisis semua data produksi dengan filter tanggal.</p>

        <div class="mb-4 p-4 bg-slate-50 rounded-lg border mt-4">
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
                
                <div class="lg:col-span-2">
                    <label class="block text-sm font-medium text-slate-700 mb-1">Pilih Jenis Status</label>
                    <select v-model="uiState.produksiFilterType" class="w-full p-2 border rounded-md bg-white shadow-sm">
                        <option value="all">Semua Jenis Status</option>
                        <option value="pemaklun">Pemaklun</option>
                        <option value="penjahit">Penjahit</option>
                    </select>
                </div>
            </div>
        </div>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div class="p-4 bg-white rounded-lg border"><h4 class="text-sm font-medium text-slate-500">Total Produk Selesai</h4><p class="text-2xl font-bold mt-1 text-indigo-600">{{ formatNumber(laporanSemuaKpis.totalModelSelesai) }} pcs</p></div>
            <div class="p-4 bg-white rounded-lg border"><h4 class="text-sm font-medium text-slate-500">Total Biaya Produksi</h4><p class="text-2xl font-bold mt-1 text-red-600">{{ formatCurrency(laporanSemuaKpis.totalBiaya) }}</p></div>
            <div class="p-4 bg-white rounded-lg border"><h4 class="text-sm font-medium text-slate-500">Rata-rata HPP/Pcs</h4><p class="text-2xl font-bold mt-1 text-emerald-600">{{ formatCurrency(laporanSemuaKpis.avgHpp) }}</p></div>
            <div class="p-4 bg-white rounded-lg border"><h4 class="text-sm font-medium text-slate-500">Total Batch Produksi</h4><p class="text-2xl font-bold mt-1 text-sky-600">{{ formatNumber(laporanSemuaKpis.totalBatch) }}</p></div>
        </div>
    </div>

    <div class="bg-white rounded-lg border shadow-sm flex-1 overflow-y-auto">
        <table class="w-full text-sm text-left text-slate-500">
            <thead class="text-xs text-slate-700 uppercase bg-slate-100 sticky top-0">
                <tr>
                    <th class="px-6 py-3">Tanggal</th>
                    <th class="px-6 py-3">Batch ID</th>
                    <th class="px-6 py-3">Jenis Status (Nama)</th>
                    <th class="px-6 py-3">Status</th>
                    <th class="px-6 py-3">Kain</th>
                    <th class="px-6 py-3 text-right">Qty Jadi</th>
                    <th class="px-6 py-3 text-right">Biaya Total</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
                <tr v-if="laporanSemuanyaData.tableData.length === 0">
                    <td colspan="7" class="p-10 text-center text-slate-500">Tidak ada data produksi yang cocok dengan filter Anda.</td>
                </tr>
                <tr v-for="(item, index) in laporanSemuanyaData.tableData" :key="index" class="hover:bg-slate-50">
                    <td class="px-6 py-4 whitespace-nowrap">{{ new Date(item.tanggal).toLocaleDateString('id-ID') }}</td>
                    <td class="px-6 py-4 font-mono text-xs">{{ item.batchId }}</td>
                    <td class="px-6 py-4 font-medium capitalize">{{ item.produksiType }} ({{ item.namaStatus }})</td>
                    <td class="px-6 py-4">
                        <span class="text-xs font-semibold px-2 py-0.5 rounded-full"
                                :class="{
                                    'bg-green-100 text-green-800': item.statusProses === 'Selesai',
                                    'bg-blue-100 text-blue-800': item.statusProses === 'Dalam Proses',
                                    'bg-yellow-100 text-yellow-800': item.statusProses === 'Revisi',
                                    'bg-gray-100 text-gray-800': item.statusProses === 'Ditunda',
                                }">
                            {{ item.statusProses }}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        <p class="font-semibold text-slate-800">{{ item.namaKain }}</p>
                        <p class="text-xs text-slate-500">{{ item.warnaKain || '-' }} ({{ item.ukuran || '-' }})</p>
                    </td>
                    <td class="px-6 py-4 text-right font-medium">{{ item.aktualJadi || 0 }} pcs</td>
                    <td class="px-6 py-4 text-right font-bold">{{ formatCurrency(item.totalBiayaProduksi) }}</td>
                </tr>
            </tbody>
        </table>
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
  
    <div v-if="uiState.nestedModalType === 'manageInflowCategories'" class="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-xl w-full max-h-[90vh] flex flex-col">
        <div class="flex justify-between items-center pb-4 border-b">
            <h3 class="text-xl font-bold">Kelola Kategori Pemasukan</h3>
            <button @click="showNestedModal('addInflowCategory', { name: '', description: '' })" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 text-sm">
                + Tambah Kategori
            </button>
        </div>
        <div class="flex-1 overflow-y-auto py-4">
            <table class="w-full text-sm text-left text-slate-500">
                <thead class="text-xs text-slate-700 uppercase bg-slate-50 sticky top-0">
                    <tr>
                        <th class="px-4 py-3">Nama Kategori</th>
                        <th class="px-4 py-3">Deskripsi</th>
                        <th class="px-4 py-3 text-center">Aksi</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    <tr v-if="state.settings.inflowCategories.length === 0">
                        <td colspan="3" class="p-4 text-center text-slate-500">Tidak ada kategori pemasukan.</td>
                    </tr>
                    <tr v-for="cat in state.settings.inflowCategories" :key="cat.id" class="hover:bg-slate-50">
                        <td class="px-4 py-3 font-semibold text-slate-800">{{ cat.name }}</td>
                        <td class="px-4 py-3">{{ cat.description || '-' }}</td>
                        <td class="px-4 py-3 text-center space-x-3">
                            <button @click="showNestedModal('editInflowCategory', JSON.parse(JSON.stringify(cat)))" class="text-xs bg-slate-100 font-bold py-1 px-2 rounded hover:bg-slate-200">Edit</button>
                            <button @click="deleteInflowCategory(cat.id)" class="text-xs text-red-500 hover:underline">Hapus</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="flex-shrink-0 flex justify-end gap-3 pt-4 border-t">
            <button @click="hideNestedModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Selesai</button>
        </div>
    </div>
</div>

<div v-if="uiState.nestedModalType === 'addInflowCategory' || uiState.nestedModalType === 'editInflowCategory'" class="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
        <h3 class="text-xl font-bold mb-4">{{ uiState.nestedModalType === 'addInflowCategory' ? 'Tambah Kategori Baru' : 'Edit Kategori' }}</h3>
        <form @submit.prevent="uiState.nestedModalType === 'addInflowCategory' ? addInflowCategory() : updateInflowCategory()">
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium">Nama Kategori</label>
                    <input type="text" v-model="uiState.nestedModalData.name" class="mt-1 w-full p-2 border rounded-md" required>
                </div>
                <div>
                    <label class="block text-sm font-medium">Deskripsi</label>
                    <textarea v-model="uiState.nestedModalData.description" rows="2" class="mt-1 w-full p-2 border rounded-md"></textarea>
                </div>
            </div>
            <div class="flex justify-end gap-3 mt-6 border-t pt-4">
                <button type="button" @click="hideNestedModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
                <button type="submit" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan</button>
            </div>
        </form>
    </div>
</div>
  
<div v-if="uiState.isPinConfirmModalVisible" class="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
        <h3 class="text-lg font-bold text-slate-800 mb-2">Konfirmasi Aksi</h3>
        <p class="text-sm text-slate-600 mb-4">Untuk melanjutkan, masukkan PIN keamanan Anda.</p>
        <form @submit.prevent="confirmPinAndToggle">
            <input 
                type="password" 
                v-model="uiState.pinConfirmInput" 
                placeholder="Masukkan PIN" 
                class="w-full p-2 border rounded-md text-center text-lg mb-2"
            >
            <p v-if="uiState.pinConfirmError" class="text-red-500 text-xs mb-2">{{ uiState.pinConfirmError }}</p>
            <div class="flex justify-end gap-3 mt-6 pt-4 border-t">
                <button type="button" @click="uiState.isPinConfirmModalVisible = false" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
                <button type="submit" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Konfirmasi</button>
            </div>
        </form>
    </div>
</div>

<div v-if="uiState.modalType === 'voucherUmum'" class="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full h-full md:max-h-[70vh] flex flex-col">
        <div class="flex-shrink-0 pb-4 border-b">
            <h3 class="text-2xl font-bold text-slate-800">Pengaturan Voucher Umum (Per Channel)</h3>
            <p class="text-slate-500 mt-1">Pengaturan ini berlaku untuk semua produk di setiap channel penjualan.</p>
        </div>
        
        <div class="flex-1 overflow-y-auto py-4 pr-2 space-y-4">
            <div v-for="channel in state.settings.marketplaces" :key="channel.id" class="p-4 border border-slate-200 rounded-lg bg-slate-50 shadow-sm">
    <p class="font-semibold text-slate-700 mb-4 text-lg">{{ channel.name }}</p>
    
    <div class="mt-3">
        <label class="block text-sm font-medium text-slate-600">Voucher Ikuti Toko</label>
        <div class="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500 font-semibold">
            <span class="pl-1">Min. Belanja (Rp)</span>
            <span class="pl-1">Diskon (%)</span>
            <span class="pl-1">Diskon (Rp)</span>
        </div>
        <div class="grid grid-cols-3 gap-2">
            <input type="text" v-model="voucherTokoMinBelanjaComputed(channel).value" class="w-full p-1.5 text-sm border border-slate-300 rounded-md">
            <input type="text" v-model="voucherTokoDiskonRateComputedUpdated(channel).value" class="w-full p-1.5 text-sm border border-slate-300 rounded-md">
            <input type="text" v-model="voucherTokoDiskonNominalComputed(channel).value" class="w-full p-1.5 text-sm border border-slate-300 rounded-md">
        </div>
    </div>

    <div class="mt-4">
        <label class="block text-sm font-medium text-slate-600">Voucher Semua Produk</label>
        <div class="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500 font-semibold">
            <span class="pl-1">Min. Belanja (Rp)</span>
            <span class="pl-1">Diskon (%)</span>
            <span class="pl-1">Diskon (Rp)</span>
        </div>
        <div class="grid grid-cols-3 gap-2">
            <input type="text" v-model="voucherSemuaProdukMinBelanjaComputed(channel).value" class="w-full p-1.5 text-sm border border-slate-300 rounded-md">
            <input type="text" v-model="voucherSemuaProdukDiskonRateComputedUpdated(channel).value" class="w-full p-1.5 text-sm border border-slate-300 rounded-md">
            <input type="text" v-model="voucherSemuaProdukDiskonNominalComputed(channel).value" class="w-full p-1.5 text-sm border border-slate-300 rounded-md">
        </div>
    </div>

    <div class="flex justify-end mt-4 pt-3 border-t">
        <button @click="saveChannelPromotions(channel.id)" :disabled="isSaving" class="bg-green-600 text-white font-bold text-xs py-1 px-3 rounded-md hover:bg-green-700 disabled:bg-green-300">
            Simpan Perubahan {{channel.name}}
        </button>
    </div>
</div>
        </div>

        <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
            <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
        </div>
    </div>
<div v-if="uiState.modalType === 'supplierPayment'" class="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full h-full md:max-h-[90vh] flex flex-col">
    <div class="flex-shrink-0 pb-4 border-b">
        <h3 class="text-2xl font-bold text-slate-800">Detail Pembayaran Pesanan</h3>
        <p class="text-slate-500 mt-1">Pesanan untuk: <span class="font-semibold">{{ uiState.modalData.supplierName }}</span> | ID: #{{ uiState.modalData.id.slice(-6) }}</p>
    </div>
    
    <div class="flex-1 overflow-y-auto py-4 pr-2 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="space-y-4">
            <h4 class="font-semibold text-lg text-slate-700">Ringkasan & Riwayat</h4>
            <div class="p-4 bg-slate-50 rounded-lg border text-sm space-y-2">
                <div class="flex justify-between"><span>Total Tagihan:</span><span class="font-bold text-lg text-indigo-600">{{ formatCurrency(uiState.modalData.totalQtyValue) }}</span></div>
                <div class="flex justify-between"><span>Sudah Dibayar:</span><span class="font-medium text-green-600">{{ formatCurrency(uiState.modalData.dibayarkan) }}</span></div>
                <div class="flex justify-between font-bold border-t pt-2 mt-2"><span>Sisa Tagihan:</span><span class="text-red-600">{{ formatCurrency(uiState.modalData.totalQtyValue - uiState.modalData.dibayarkan) }}</span></div>
            </div>
            <div class="border-t pt-4">
                <p class="font-medium mb-2">Riwayat Cicilan:</p>
                <p v-if="!uiState.modalData.paymentHistory || uiState.modalData.paymentHistory.length === 0" class="text-xs text-slate-500 text-center py-4">Belum ada riwayat pembayaran.</p>
                <ul v-else class="space-y-2 max-h-48 overflow-y-auto">
                    <li v-for="(payment, index) in uiState.modalData.paymentHistory" :key="index" class="flex justify-between items-center text-xs p-2 bg-white border rounded-md">
                        <div>
                            <p class="font-semibold">{{ formatCurrency(payment.amount) }}</p>
                            <p class="text-slate-500">{{ new Date(payment.date.seconds * 1000).toLocaleDateString('id-ID') }} ({{ payment.method }})</p>
                        </div>
                    </li>
                </ul>
            </div>
        </div>

        <div class="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <form @submit.prevent="addSupplierPayment" class="space-y-4">
                 <h4 class="font-semibold text-lg text-slate-700">Tambah Pembayaran Baru</h4>
                 <div>
                    <label class="block text-sm font-medium">Jumlah Dibayar (Rp)</label>
                    <input type="number" v-model.number="uiState.newPaymentData.amount" class="mt-1 w-full p-2 border rounded-md" required>
                 </div>
                 <div>
                    <label class="block text-sm font-medium">Tanggal Bayar</label>
                    <input type="date" v-model="uiState.newPaymentData.date" class="mt-1 w-full p-2 border rounded-md" required>
                 </div>
                 <div>
                    <label class="block text-sm font-medium">Metode Pembayaran</label>
                    <select v-model="uiState.newPaymentData.method" class="mt-1 w-full p-2 border rounded-md" required>
                        <option>Transfer</option><option>Tunai</option><option>Lainnya</option>
                    </select>
                 </div>
                 <div>
                    <label class="block text-sm font-medium">Catatan (Opsional)</label>
                    <textarea v-model="uiState.newPaymentData.notes" rows="2" class="mt-1 w-full p-2 border rounded-md"></textarea>
                 </div>
                 <div class="pt-4 border-t">
                    <button type="submit" :disabled="isSaving" class="w-full bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 disabled:bg-green-400">
                        <span v-if="isSaving">Menyimpan...</span>
                        <span v-else>+ Tambah & Catat Pembayaran</span>
                    </button>
                 </div>
            </form>
        </div>
    </div>

    <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-4 border-t">
        <button @click="hideModal" class="bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg hover:bg-slate-300">Tutup</button>
    </div>
</div>    
</div>
</template>

<style scoped>
.help-icon-button {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #f1f5f9;
    color: #64748b;
    font-weight: bold;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease-in-out;
}
.help-icon-button:hover {
    background-color: #6366f1;
    color: white;
    transform: scale(1.1);
}
.sidebar-link {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-weight: 500;
    color: #9ca3af;
    transition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
}
.sidebar-link:hover {
    background-color: #374151;
    color: #ffffff;
}
.sidebar-link-active {
    background-image: linear-gradient(to right, #4f46e5, #6d28d9);
    color: #ffffff;
    font-weight: 600;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
}
.chart-container {
    position: relative;
    width: 100%;
    height: 320px;
}
.kpi-card {
    transition: transform 0.2s, box-shadow 0.2s;
    border-color: #e2e8f0;
}
.kpi-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
}
.stock-badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
    font-weight: 600;
    font-size: 0.8rem;
    line-height: 1;
}
.stock-safe {
    background-color: #dcfce7;
    color: #166534;
}
.stock-low {
    background-color: #fef3c7;
    color: #92400e;
}
.stock-empty {
    background-color: #fee2e2;
    color: #991b1b;
}
.accordion-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.5s ease-in-out;
}
.accordion-content.open {
    max-height: 1000px;
}
.panduan-content ul {
    list-style-position: outside;
    padding-left: 1.5rem;
}
.panduan-content li {
    margin-bottom: 0.5rem;
}
.barcode-page-grid {
    display: grid;
    grid-template-columns: 400px 1fr;
    gap: 2rem;
    height: calc(100vh - 120px);
}
.barcode-settings-panel {
    background: #f8fafc;
    padding: 1.5rem;
    border-radius: 0.75rem;
    border: 1px solid #e2e8f0;
    overflow-y: auto;
    height: 100%;
}
.barcode-preview-area {
    background: #f1f5f9;
    padding: 1.5rem;
    border-radius: 0.75rem;
    overflow: auto;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: flex-start;
}
.preview-sheet {
    background: white;
    display: grid;
    padding: 1mm;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    justify-content: center;
}
.label-box {
    background: white;
    padding: 1.5mm;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: stretch;
    overflow: hidden;
    border: 1px dashed #e2e8f0;
}
.label-box p {
    margin: 0;
    line-height: 1.2;
    flex-shrink: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.label-box .barcode-svg {
    flex-grow: 1;
    width: 100%;
    min-height: 10px;
}
@keyframes fade-in-up {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
.animate-fade-in-up {
    animation: fade-in-up 0.6s ease-out forwards;
    opacity: 0;
}
@keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
}
.animate-fade-in {
    animation: fade-in 0.5s ease-in-out;
}
@keyframes fade-in-scale {
    from {
        opacity: 0;
        transform: scale(0.9);
    }
    to {
        opacity: 1;
        transform: scale(1);
    }
}
.animate-fade-in-scale {
    animation: fade-in-scale 0.7s ease-out forwards;
    opacity: 0;
}

/* --- Kode Cetak yang Diperbaiki --- */
.help-icon-button-sm {
    width: 1rem;
    height: 1rem;
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #e2e8f0;
    color: #475569;
    font-weight: bold;
    font-size: 0.65rem;
    line-height: 1;
    cursor: pointer;
    transition: all 0.2s ease-in-out;
    flex-shrink: 0;
}
.help-icon-button-sm:hover {
    background-color: #4f46e5;
    color: white;
}
</style>