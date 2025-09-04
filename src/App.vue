<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import * as XLSX from 'xlsx'; // Import untuk fitur Export Excel

// Impor dari file konfigurasi Firebase Anda

import { db, auth } from './firebase.js'; 

// Impor fungsi-fungsi untuk Database (Firestore)
import { collection, doc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction, addDoc, onSnapshot, query, where, getDocs, getDoc } from 'firebase/firestore';
let onSnapshotListener = null;

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
const activePage = ref('dashboard');
const isLoading = ref(true);
const isSaving = ref(false); // Untuk tombol simpan umum
const isSavingSettings = ref(false); // Untuk tombol simpan di halaman Pengaturan
// Hapus baris 'const isSubscribing = ref(false);' yang lama
const isSubscribingMonthly = ref(false); // <-- TAMBAHKAN INI
const isSubscribingYearly = ref(false);  // <-- TAMBAHKAN INI
const currentUser = ref(null);

const isDashboardLocked = ref(true);
const dashboardPinInput = ref('');
const dashboardPinError = ref('');
const ADMIN_UID = '6m4bgRlZMDhL8niVyD4lZmGuarF3'; 

// Properti ini akan otomatis bernilai 'true' jika yang login adalah Anda (Admin)
const isAdmin = computed(() => {
  return currentUser.value && currentUser.value.uid === ADMIN_UID;
});

const parsePercentageInput = (value) => {
    if (typeof value !== 'string') return value;
    const cleaned = value.replace(',', '.').replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
};

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
    specialPrices: {},
    produksi: [],    // --- START: KODE BARU UNTUK STOK KAIN ---
    gudangKain: [],
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
const monthlyPrice = ref(200000);
const yearlyPrice = ref(2000000);
async function submitAddProduct() {
    const form = uiState.modalData;
    if (!form.sku || !form.nama || !form.modelId || !form.warna || !form.varian || !form.hpp || !form.hargaJualDefault) {
        alert('SKU, Nama, Model produk, Warna, Varian, HPP, dan Harga Jual Default wajib diisi.');
        return;
    }

    const skuFormatted = form.sku.toUpperCase().replace(/\s+/g, '-');
    const userId = currentUser.value.uid;

    try {
        // PERUBAHAN 1: Cek duplikat SKU HANYA untuk pengguna ini
        const productsCollection = collection(db, "products");
        const q = query(productsCollection, where("sku", "==", skuFormatted), where("userId", "==", userId));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            throw new Error(`Produk dengan SKU "${skuFormatted}" sudah terdaftar untuk akun Anda.`);
        }
        
        // PERUBAHAN 2: Biarkan Firestore membuat ID dokumen unik secara otomatis
        const newProductRef = doc(collection(db, "products")); 

        const productData = {
            id: newProductRef.id,
            product_name: form.nama,
            model_id: form.modelId,
            color: form.warna || '',
            variant: form.varian || '',
            physical_stock: 0,
            hpp: form.hpp,
            userId: userId,
            sku: skuFormatted // <-- Simpan SKU asli sebagai field data
        };

        const batch = writeBatch(db);
        batch.set(newProductRef, productData);

        state.settings.marketplaces.forEach(channel => {
            const priceDocId = `${newProductRef.id}-${channel.id}`;
            const priceRef = doc(db, "product_prices", priceDocId);
            batch.set(priceRef, {
                product_id: newProductRef.id, // Referensi ke ID produk baru
                product_sku: skuFormatted,
                marketplace_id: channel.id,
                price: form.hargaJualDefault,
                userId: userId
            });
        });

        await batch.commit();

        alert(`Produk "${form.nama}" berhasil ditambahkan!`);
        await loadAllDataFromFirebase();
        hideModal();

    } catch (error) {
        console.error('Error menyimpan produk:', error);
        alert(`Gagal menyimpan produk: ${error.message}`);
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
    
    // Cari pesanan yang sedang aktif di antrian (yang belum punya ID Resi)
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

    const existingItem = currentOrder.items.find(item => item.sku === product.sku);
    if (existingItem) {
        existingItem.qty++;
    } else {
        currentOrder.items.push({ ...product, qty: 1, hargaJualAktual: finalPrice });
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
        for (const order of ordersToProcess) {
            const subtotal = order.items.reduce((sum, item) => sum + (item.hargaJualAktual * item.qty), 0);
            const discount = calculateBestDiscount(order.items, uiState.activeCartChannel);
            const finalTotal = subtotal - discount.totalDiscount;

            let totalBiaya = 0;
            const biayaList = [];
            if (marketplace.adm > 0) { const val = (marketplace.adm / 100) * finalTotal; biayaList.push({ name: 'Administrasi', value: val }); totalBiaya += val; }
            if (marketplace.komisi > 0) { const val = (marketplace.komisi / 100) * finalTotal; biayaList.push({ name: 'Komisi', value: val }); totalBiaya += val; }
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
            
            for (const item of order.items) {
                // ▼▼▼ PERBAIKAN DI SINI: Gunakan item.docId, bukan item.sku ▼▼▼
                const productRef = doc(db, "products", item.docId);
                const productInState = state.produk.find(p => p.docId === item.docId);
                const newStock = (productInState.stokFisik || 0) - item.qty;
                if (newStock < 0) throw new Error(`Stok untuk ${item.sku} tidak cukup!`);
                batch.update(productRef, { physical_stock: newStock });
            }
            successCount++;
        }
        
        await batch.commit();

        await loadAllDataFromFirebase();
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

async function findTransactionForReturn() {
    const orderId = uiState.modalData.transactionIdSearch.trim();
    if (!orderId) {
        return alert("Silakan scan resi atau masukkan ID Pesanan Marketplace.");
    }
    
    // Cari transaksi berdasarkan marketplaceOrderId
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

async function handleSubscriptionMidtrans(plan) {
    if (!currentUser.value) {
        alert("Silakan login terlebih dahulu.");
        return;
    }

    let isSubscribingPlan;
    if (plan === 'bulanan') {
        isSubscribingPlan = isSubscribingMonthly;
    } else {
        isSubscribingPlan = isSubscribingYearly;
    }

    if (isSubscribingPlan.value) {
        console.log("Pembayaran sedang diproses, mohon tunggu.");
        return;
    }
    
    isSubscribingPlan.value = true;

    // --- PERBAIKAN DI SINI ---
    // Gunakan variabel harga yang sudah kita deklarasikan
    const priceToPay = plan === 'bulanan' ? monthlyPrice.value : yearlyPrice.value;

    const transactionDetails = {
        order_id: `${currentUser.value.uid.substring(0, 8)}-${Date.now()}`,
        gross_amount: priceToPay, // <-- Gunakan variabel di sini
    };
    const customerDetails = {
        first_name: currentUser.value.displayName || 'Pelanggan',
        email: currentUser.value.email,
    };
    const itemDetails = [{
        id: `plan-${plan}`,
        price: priceToPay, // <-- Gunakan variabel di sini
        quantity: 1,
        name: `Langganan ${plan === 'bulanan' ? 'Bulanan' : 'Tahunan'}`,
    }];
    // --- AKHIR PERBAIKAN ---

    try {
        const response = await fetch('/api/create-midtrans-snap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transaction_details: transactionDetails,
                customer_details: customerDetails,
                item_details: itemDetails,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server responded with status ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (data.snapToken) {
            window.snap.pay(data.snapToken, {
                onSuccess: async function(result) {
                    console.log('Payment success:', result);
                    alert("Pembayaran Berhasil! Langganan Anda akan segera aktif.");

                    const now = new Date();
                    const endDate = plan === 'bulanan'
                        ? new Date(now.setMonth(now.getMonth() + 1))
                        : new Date(now.setFullYear(now.getFullYear() + 1));
                    
                    currentUser.value.userData = {
                        ...currentUser.value.userData,
                        subscriptionStatus: 'active',
                        subscriptionEndDate: endDate,
                    };

                    try {
                        const updateResponse = await fetch('/api/update-subscription', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userId: currentUser.value.uid,
                                plan: plan,
                                paymentStatus: 'active',
                            }),
                        });
                        if (updateResponse.ok) {
                            console.log('Status langganan berhasil diperbarui di database.');
                            await loadAllDataFromFirebase();
                            activePage.value = 'dashboard';
                        } else {
                            const errorData = await updateResponse.json();
                            console.error('Gagal memperbarui status langganan:', errorData);
                            alert('Pembayaran berhasil, tetapi gagal memperbarui status di database. Silakan hubungi admin.');
                        }
                    } catch (error) {
                        console.error('Error saat memanggil API update-subscription:', error);
                        alert('Terjadi kesalahan. Silakan hubungi admin.');
                    } finally {
                        if (plan === 'bulanan') isSubscribingMonthly.value = false;
                        else isSubscribingYearly.value = false;
                    }
                },
                onPending: function(result) {
                    console.log('Payment pending:', result);
                    alert("Pembayaran Anda menunggu konfirmasi. Silakan selesaikan pembayaran.");
                    if (plan === 'bulanan') isSubscribingMonthly.value = false;
                    else isSubscribingYearly.value = false;
                },
                onError: function(result) {
                    console.log('Payment error:', result);
                    alert("Pembayaran gagal. Silakan coba lagi.");
                    if (plan === 'bulanan') isSubscribingMonthly.value = false;
                    else isSubscribingYearly.value = false;
                },
                onClose: function() {
                    console.log('Pop-up pembayaran ditutup.');
                    if (plan === 'bulanan') isSubscribingMonthly.value = false;
                    else isSubscribingYearly.value = false;
                }
            });
        } else {
            throw new Error(data.message || 'Gagal mendapatkan snapToken.');
        }
    } catch (error) {
        console.error("Gagal memproses langganan Midtrans:", error);
        alert(`Gagal memproses langganan. Silakan coba lagi. Error: ${error.message}`);
    } finally {
        if (plan === 'bulanan') isSubscribingMonthly.value = false;
        else isSubscribingYearly.value = false;
    }
}

const voucherTokoComputed = (channel) => computed({
    get() { return state.promotions.perChannel[channel.id]?.voucherToko ? state.promotions.perChannel[channel.id].voucherToko + '%' : ''; },
    set(newValue) {
        if (!state.promotions.perChannel[channel.id]) {
            state.promotions.perChannel[channel.id] = {};
        }
        state.promotions.perChannel[channel.id].voucherToko = parsePercentageInput(newValue);
    }
});
const voucherSemuaProdukComputed = (channel) => computed({
    get() { return state.promotions.perChannel[channel.id]?.voucherSemuaProduk ? state.promotions.perChannel[channel.id].voucherSemuaProduk + '%' : ''; },
    set(newValue) {
        if (!state.promotions.perChannel[channel.id]) {
            state.promotions.perChannel[channel.id] = {};
        }
        state.promotions.perChannel[channel.id].voucherSemuaProduk = parsePercentageInput(newValue);
    }
});
const voucherProdukComputed = (modelName, channelId) => computed({
    get() { return state.promotions.perModel[modelName]?.[channelId]?.voucherProduk ? state.promotions.perModel[modelName][channelId].voucherProduk + '%' : ''; },
    set(newValue) {
        if (!state.promotions.perModel[modelName]) {
            state.promotions.perModel[modelName] = {};
        }
        if (!state.promotions.perModel[modelName][channelId]) {
            state.promotions.perModel[modelName][channelId] = {};
        }
        state.promotions.perModel[modelName][channelId].voucherProduk = parsePercentageInput(newValue);
    }
});
const tieredMinComputed = (tier) => computed({
    get() { return tier.min ? 'Rp ' + formatInputNumber(tier.min) : ''; },
    set(newValue) { tier.min = parseInputNumber(newValue) || 0; }
});
const tieredDiskonComputed = (tier) => computed({
    get() { return tier.diskon ? tier.diskon + '%' : ''; },
    set(newValue) { tier.diskon = parsePercentageInput(newValue); }
});

async function activateSubscriptionWithCode() {
    const code = authForm.activationCode;
    if (!code) {
        alert("Kode aktivasi tidak boleh kosong.");
        return;
    }

    try {
        const codeRef = doc(db, "activation_codes", code);
        const codeDoc = await getDoc(codeRef);

        if (codeDoc.exists() && codeDoc.data().status === 'unused') {
            const userRef = doc(db, "users", currentUser.value.uid);
            const now = new Date();
            const nextMonth = new Date(now.setMonth(now.getMonth() + 1));

            // PERBAIKAN: Gunakan `setDoc` dengan `merge: true`
            // Ini akan menambahkan/mengupdate data langganan tanpa menghapus data PIN yang sudah ada
            await setDoc(userRef, {
                subscriptionStatus: 'active',
                subscriptionEndDate: nextMonth,
                trialEndDate: null
            }, { merge: true }); // <--- BARIS PENTING DITAMBAHKAN

            await updateDoc(codeRef, { status: 'used', usedBy: currentUser.value.uid, usedAt: new Date() });
            
            alert('Langganan Anda berhasil diaktifkan selama 30 hari!');
            activePage.value = 'dashboard';
        } else {
            alert('Kode aktivasi tidak valid atau sudah digunakan.');
        }
    } catch (error) {
        console.error("Error mengaktifkan langganan:", error);
        alert(`Terjadi kesalahan: ${error.message}`);
    }
}

async function handleAuth(user) {
    currentUser.value = user;

    try {
        const userDocRef = doc(db, "users", user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            currentUser.value.userData = userData;
            state.settings.dashboardPin = userData.dashboardPin || '';

            const now = new Date();
            const endDate = userData.subscriptionEndDate?.toDate();
            const trialDate = userData.trialEndDate?.toDate();

            const isSubscriptionValid = (userData.subscriptionStatus === 'active' && endDate && now <= endDate) ||
                                         (userData.subscriptionStatus === 'trial' && trialDate && now <= trialDate);

            if (isSubscriptionValid) {
                await loadAllDataFromFirebase();
                const storedPage = localStorage.getItem('lastActivePage');
                activePage.value = (storedPage && storedPage !== 'login' && storedPage !== 'langganan') ? storedPage : 'dashboard';
            } else {
                activePage.value = 'langganan';
            }
        } else {
            console.error("Data user tidak ditemukan di Firestore. Mengarahkan ke logout.");
            handleLogout();
        }
    } catch (error) {
        console.error("Gagal memuat data user:", error);
        alert("Gagal memuat data user. Silakan coba lagi.");
        handleLogout();
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

        // --- BARIS PERBAIKAN: Menambahkan data baru ke state lokal
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
        
        // --- BARIS PERBAIKAN: Menghapus data dari state lokal
        state.settings.categories = state.settings.categories.filter(cat => cat.id !== categoryId);

        alert('Kategori berhasil dihapus.');
        // Tidak perlu memanggil hideNestedModal karena modal sudah ditutup
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
            dashboardPin: authForm.dashboardPin || null // <-- Ambil PIN dari form register
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
                // Perubahan di sini: dari 7 hari menjadi 3 hari
                const threeDaysLater = new Date(now.setDate(now.getDate() + 3));
                newUserData.trialEndDate = threeDaysLater;
                // Perubahan teks notifikasi di sini
                alert('Kode aktivasi tidak valid atau sudah digunakan. Anda mendapatkan free trial selama 3 hari.');
            }
        } else {
            // Perubahan di sini: dari 7 hari menjadi 3 hari
            const threeDaysLater = new Date(now.setDate(now.getDate() + 3));
            newUserData.trialEndDate = threeDaysLater;
            // Perubahan teks notifikasi di sini
            alert('Registrasi berhasil! Anda mendapatkan free trial selama 3 hari.');
        }

        // SIMPAN PIN BARU BERSAMAAN DENGAN DATA PENGGUNA BARU
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
        const userCredential = await signInWithEmailAndPassword(auth, authForm.email, authForm.password);
        const user = userCredential.user;
        authForm.error = '';

        alert('Selamat datang kembali!');
        
        // Panggil fungsi pemuatan dan navigasi utama di sini
        await handleAuth(user);

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
    activationCode: ''
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

    try {
        // ▼▼▼ PERUBAHAN UTAMA DI SINI ▼▼▼
        // 1. Cari produk berdasarkan SKU dan userId untuk mendapatkan ID dokumen yang sebenarnya
        const productsCollection = collection(db, "products");
        const q = query(productsCollection, where("sku", "==", skuToUpdate), where("userId", "==", currentUser.value.uid));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            // Jika tidak ada produk yang cocok, lempar error
            throw new Error(`Produk dengan SKU "${skuToUpdate}" tidak ditemukan.`);
        }
        
        // 2. Ambil ID dokumen yang benar dari hasil pencarian
        const productDocSnapshot = querySnapshot.docs[0];
        const productId = productDocSnapshot.id;
        const productRef = doc(db, "products", productId); // Gunakan ID yang benar untuk referensi
        
        let hppLoss = 0;

        await runTransaction(db, async (transaction) => {
            const productDoc = await transaction.get(productRef); // get() sekarang menggunakan referensi yang benar
            // Kita tidak perlu memeriksa 'exists()' lagi karena sudah diperiksa di atas
            
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
        });

        // Jika ini adalah pengurangan stok & ada kerugian, catat sebagai pengeluaran
        if (adjustmentType === 'pengurangan' && hppLoss > 0) {
            const expenseData = {
                kategori: 'Kerugian Stok',
                jumlah: hppLoss,
                catatan: `${form.alasan}: ${quantity} pcs x ${skuToUpdate}`,
                jenis: 'pengeluaran',
                userId: currentUser.value.uid,
                tanggal: new Date()
            };
            await addDoc(collection(db, "keuangan"), expenseData);
        }

        await loadAllDataFromFirebase();
        alert(`Stok untuk SKU ${skuToUpdate} berhasil disesuaikan.`);
        hideModal();

    } catch (error) {
        console.error("Error dalam transaksi penyesuaian stok:", error);
        alert(`Gagal memperbarui stok: ${error.message}`);
    }
}

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



let profitExpenseChart = null;
let salesChannelChart = null;


// --- UTILITY FUNCTIONS ---
const formatCurrency = (value) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0, // <-- DIUBAH MENJADI 1
        maximumFractionDigits: 1, // <-- DIUBAH MENJADI 1
    }).format(value || 0);
};

const targetMarginComputed = computed({
    get() {
        // Tampilkan nilai dengan simbol % di input
        return uiState.priceCalculator.targetMargin ? uiState.priceCalculator.targetMargin + '%' : '';
    },
    set(newValue) {
        // Hapus simbol % dan pastikan nilai yang disimpan adalah angka
        const parsedValue = parseInt(newValue.replace(/[^0-9]/g, '')) || 0;
        uiState.priceCalculator.targetMargin = parsedValue;
    }
});

const admComputed = computed({
    get() { return uiState.modalData.adm ? uiState.modalData.adm + '%' : ''; },
    set(newValue) { uiState.modalData.adm = parsePercentageInput(newValue); }
});
const komisiComputed = computed({
    get() { return uiState.modalData.komisi ? uiState.modalData.komisi + '%' : ''; },
    set(newValue) { uiState.modalData.komisi = parsePercentageInput(newValue); }
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
    
    // BARIS BARU: Menambahkan filter berdasarkan channel jika sudah dipilih
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
    // Memberikan nilai default array kosong jika state.settings.modelProduk undefined
    const modelProdukData = state.settings.modelProduk || [];
    const query = uiState.pengaturanModelProdukSearch.toLowerCase();
    if (!query) {
        return modelProdukData;
    }
    return modelProdukData.filter(model => 
        (model.namaModel || '').toLowerCase().includes(query)
    );
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
    isSaving.value = true;
    try {
        const userId = currentUser.value.uid;
        const batch = writeBatch(db);

        // Simpan semua pengaturan
        const settingsRef = doc(db, "settings", userId);
        const settingsData = {
            brandName: state.settings.brandName,
            minStok: state.settings.minStok,
            marketplaces: JSON.parse(JSON.stringify(state.settings.marketplaces)),
            modelProduk: JSON.parse(JSON.stringify(state.settings.modelProduk)),
            categories: JSON.parse(JSON.stringify(state.settings.categories)),
            inflowCategories: JSON.parse(JSON.stringify(state.settings.inflowCategories)),
            userId: userId
        };
        batch.set(settingsRef, settingsData);

        // --- AWAL PERBAIKAN: Memastikan data promosi tidak kosong sebelum disimpan ---
        const promotionsRef = doc(db, "promotions", userId);
        const promotionsData = {
            perChannel: state.promotions.perChannel || {},
            perModel: state.promotions.perModel || {},
            userId: userId
        };
        batch.set(promotionsRef, JSON.parse(JSON.stringify(promotionsData)));
        // --- AKHIR PERBAIKAN ---

        // Simpan HPP & Harga Jual
        for (const product of state.produk) {
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
                });
            }
        }
        await batch.commit();
        
        // Memuat ulang data dari database setelah berhasil disimpan
        await loadAllDataFromFirebase();
        
        console.log('Perubahan berhasil disimpan ke Database!');
        alert('Semua perubahan berhasil disimpan!');

    } catch (error) {
        console.error("Gagal menyimpan data ke Firebase:", error);
        alert("Gagal menyimpan data. Cek console untuk detail.");
    } finally {
        isSaving.value = false;
    }
}

async function generateAndSaveCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let newCode = '';
    for (let i = 0; i < 8; i++) {
        newCode += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    try {
        // 'db' sudah tersedia dari inisialisasi Firebase Anda
        const codeRef = doc(db, "activation_codes", newCode);
        await setDoc(codeRef, {
            createdAt: new Date(),
            status: 'unused',
            generatedBy: currentUser.value.uid // Melacak siapa yang membuat
        });

        uiState.newActivationCode = newCode;
        alert(`Kode aktivasi baru berhasil dibuat: ${newCode}`);
    } catch (error) {
        console.error("Gagal membuat kode aktivasi:", error);
        alert("Gagal membuat kode aktivasi. Cek console.");
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

    const isPinSet = !!state.settings.dashboardPin;
    let newPinToSave = state.settings.dashboardPin;

    if (uiState.newPin) {
        if (isPinSet && uiState.oldPin !== state.settings.dashboardPin) {
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
            dashboardPin: newPinToSave,
            pinProtection: state.settings.pinProtection,
            userId: userId
        };

        // SIMPAN DATA PENGATURAN UMUM KE DATABASE
        await setDoc(settingsRef, dataToUpdate, { merge: true });
        
        // Perbarui state lokal setelah berhasil
        state.settings.dashboardPin = newPinToSave;
        uiState.oldPin = '';
        uiState.newPin = '';
        uiState.confirmNewPin = '';
        
        alert('Pengaturan umum berhasil disimpan ke database!');

    } catch (error) {
        console.error("Gagal menyimpan pengaturan umum:", error);
        alert("Gagal menyimpan pengaturan umum.");
    } finally {
        isSavingSettings.value = false;
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
        // Ini menangani semua jenis data kecuali yang butuh perlakuan khusus
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
                alert("Data 'Model Produk' belum selesai dimuat. Coba lagi sesaat.");
                hideModal();
                return;
            }
            setupNewProduksiBatch();
        } else if (type === 'editProduksi' && data) {
            setupEditProduksiBatch(data);
        } else if (type === 'editRetur' && data) {
            uiState.modalData.tanggal = new Date(data.tanggal).toISOString().split('T')[0];
        }
        
        // Modal 'investorInfo' dan 'kpiHelp' tidak memerlukan data khusus, 
        // sehingga mereka akan langsung bekerja dengan benar sekarang.
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
    if (marketplace.adm > 0) { const val = (marketplace.adm / 100) * summary.finalTotal; biayaList.push({ name: 'Administrasi', value: val }); totalBiaya += val; }
    if (marketplace.komisi > 0) { const val = (marketplace.komisi / 100) * summary.finalTotal; biayaList.push({ name: 'Komisi', value: val }); totalBiaya += val; }
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
            // ▼▼▼ PERBAIKAN DI SINI: Gunakan item.docId, bukan item.sku ▼▼▼
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
            const productInState = state.produk.find(p => p.docId === item.docId); // Cari berdasarkan docId
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
    if (!cart || cart.length === 0) return { totalDiscount: 0, description: '', rate: 0 };

    const promotions = [];
    const cartSubtotal = cart.reduce((sum, item) => sum + (item.hargaJualAktual * item.qty), 0);

    // 1. Kumpulkan semua promosi per-channel (Voucher Ikuti Toko, dll)
    const channelPromos = state.promotions.perChannel[channelId] || {};
    if (channelPromos.voucherToko > 0) {
        promotions.push({
            totalDiscount: (channelPromos.voucherToko / 100) * cartSubtotal,
            description: `Voucher Ikuti Toko (${channelPromos.voucherToko}%)`,
            rate: channelPromos.voucherToko
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

    for (const modelName in itemsByModel) { // <-- PERHATIKAN PEMBUKA { INI
        const modelData = itemsByModel[modelName];
        const modelPromosForChannel = (allModelPromos[modelName] || {})[channelId] || {};

        if (modelPromosForChannel.voucherProduk > 0) {
            promotions.push({
                totalDiscount: (modelPromosForChannel.voucherProduk / 100) * modelData.subtotal,
                description: `Voucher ${modelName} (${modelPromosForChannel.voucherProduk}%)`,
                rate: modelPromosForChannel.voucherProduk
            });
        }

        if (modelPromosForChannel.diskonBertingkat && modelPromosForChannel.diskonBertingkat.length > 0) {
            const sortedTiers = [...modelPromosForChannel.diskonBertingkat].sort((a, b) => b.min - a.min);
            for (const tier of sortedTiers) {
                if (modelData.subtotal >= tier.min) {
                    promotions.push({
                        totalDiscount: (tier.diskon / 100) * modelData.subtotal,
                        description: `Diskon ${modelName} ${tier.diskon}%`,
                        rate: tier.diskon
                    });
                    break;
                }
            }
        }
    } // <-- DAN PASTIKAN PENUTUP } INI ADA

    // 3. Cari promosi terbaik dari semua yang terkumpul
    if (promotions.length === 0) {
        return { totalDiscount: 0, description: '', rate: 0 };
    }
    return promotions.reduce((best, current) => {
        return current.totalDiscount > best.totalDiscount ? current : best;
    }, { totalDiscount: 0, description: '', rate: 0 });
}

function calculateSellingPrice() {
    const { hpp, targetMargin, selectedMarketplace, selectedModelName } = uiState.priceCalculator;

    if (!hpp || !selectedMarketplace || !selectedModelName) {
        uiState.priceCalculator.result = null;
        return;
    }

    const mp = state.settings.marketplaces.find(m => m.id === selectedMarketplace);
    if (!mp) {
        uiState.priceCalculator.result = null;
        return;
    }

    const dummyProduct = {
        sku: 'calc-dummy',
        nama: selectedModelName,
        hargaJualAktual: hpp * 2,
        qty: 1
    };
    const discountInfo = calculateBestDiscount([dummyProduct], selectedMarketplace);
    const bestDiscountRate = (discountInfo.rate || 0) / 100;

    const totalMarketplacePercentageFees = (mp.adm || 0) + (mp.komisi || 0) + (mp.layanan || 0);
    const perOrderFee = mp.perPesanan || 0;
    const targetProfitPercentage = targetMargin / 100;

    const itemizedProgramFeesBase = (mp.programs || []).map(p => (parseFloat(p.rate) || 0) / 100);
    const totalProgramPercentage = itemizedProgramFeesBase.reduce((sum, rate) => sum + rate, 0);

    const allPercentageFees = (totalMarketplacePercentageFees / 100) + targetProfitPercentage + bestDiscountRate + totalProgramPercentage;
    
    const calculatedPrice = (hpp + perOrderFee) / (1 - allPercentageFees);

    const adminFee = calculatedPrice * (mp.adm || 0) / 100;
    const commission = calculatedPrice * (mp.komisi || 0) / 100;
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
        bestDiscountRatePercentage: discountInfo.rate || 0, // <-- TAMBAHAN BARU
        breakdown: {
            hpp,
            adminFee,
            admRate: mp.adm || 0, // <-- TAMBAHAN BARU
            commission,
            komisiRate: mp.komisi || 0, // <-- TAMBAHAN BARU
            serviceFee,
            layananRate: mp.layanan || 0, // <-- TAMBAHAN BARU
            programFee: itemizedProgramFees,
            perOrderFee
        }
    };
}

async function recordBagiHasilPayment() {
    const report = uiState.laporanBagiHasil;
    const result = report.result;
    if (!result || result.investorShare <= 0) return alert("Tidak ada keuntungan.");

    // --- AWAL PERBAIKAN: Mengambil data dari state yang benar ---
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
function removePromotionTier(modelName, channelId, tierIndex) {
    if (state.promotions.perModel[modelName]?.[channelId]?.diskonBertingkat) {
        state.promotions.perModel[modelName][channelId].diskonBertingkat.splice(tierIndex, 1);
    }
}
function setupNewProduksiBatch() {
    uiState.newProduksiBatch = reactive({
        tanggal: new Date().toISOString().split('T')[0],
        produksiType: 'pemaklun',
        namaStatus: '', // <-- DIUBAH KEMBALI KE namaStatus
        statusProses: 'Dalam Proses',
        kainBahan: [{
            idUnik: generateUniqueCode(),
            modelProdukId: '',
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
async function updateProductionInventoryStatus(batchId, itemIndex) {
    if (!currentUser.value) {
        alert("Anda harus login untuk mengelola inventaris.");
        return;
    }
    if (!confirm("Anda yakin ingin menandai item ini sebagai sudah masuk inventaris? Stok master akan bertambah.")) {
        return;
    }
    
    // Temukan batch dan item yang akan diperbarui di state lokal
    const originalBatch = uiState.laporanData.laporanPerStatus.find(b => b.id === batchId);
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
            const productRef = doc(db, "products", matchingProduct.sku);
            const newStock = (matchingProduct.stokFisik || 0) + (itemToUpdate.aktualJadi || 0);
            
            const totalAlokasi = Object.values(matchingProduct.stokAlokasi || {}).reduce((sum, val) => sum + val, 0);
            const sisaStokFisik = newStock - totalAlokasi;
            if (sisaStokFisik < 0) {
                alert(`Stok master akan minus jika ditambahkan. Jumlah aktual jadi (${itemToUpdate.aktualJadi}) lebih kecil dari total alokasi yang sudah ada (${totalAlokasi})`);
                return;
            }
            
            // Perbarui dokumen batch di Firestore
            const newKainBahan = JSON.parse(JSON.stringify(originalBatch.kainBahan));
            newKainBahan[itemIndex].isInventoried = true;
            batch.update(batchRef, { kainBahan: newKainBahan });

            // Perbarui stok fisik di Firestore
            batch.update(productRef, { physical_stock: newStock });

            // Perbarui stok alokasi di Firestore
            const allocationsCollection = collection(db, "stock_allocations");
            const allocationRef = doc(allocationsCollection, matchingProduct.sku);
            const newAlokasi = {};
            state.settings.marketplaces.forEach(mp => {
                newAlokasi[mp.id] = (matchingProduct.stokAlokasi[mp.id] || 0);
            });
            batch.set(allocationRef, newAlokasi, { merge: true });

            await batch.commit();

            // --- BARIS PENTING: PERBARUI STATE LOKAL SECARA LANGSUNG ---
            // Setelah operasi batch berhasil, update status isInventoried di state
            itemToUpdate.isInventoried = true;

            // Jika produk master juga butuh diperbarui, lakukan di sini
            if (matchingProduct) {
                matchingProduct.stokFisik = newStock;
            }

            alert("Stok berhasil ditambahkan ke inventaris!");
            
            // Tidak perlu memanggil loadAllDataFromFirebase() karena state sudah diperbarui
            // Jika Anda ingin memuat ulang data di seluruh aplikasi, panggil saja
            // await loadAllDataFromFirebase();
            
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
    
    // Pastikan item memiliki properti yang relevan
    const modelInfo = state.settings.modelProduk.find(m => m.id === item.modelProdukId) || {};
    const totalYard = parseFloat(item.totalYard) || 0;
    const hargaKainPerYard = parseFloat(item.hargaKainPerYard) || 0;
    const aktualJadi = parseFloat(item.aktualJadi) || 0;
    const aktualJadiKombinasi = parseFloat(item.aktualJadiKombinasi) || 0;
    const hargaJahitPerPcs = parseFloat(item.hargaJahitPerPcs) || 0;
    const hargaMaklunPerPcs = parseFloat(item.hargaMaklunPerPcs) || 0;
    const biayaAlatInput = parseFloat(item.biayaAlat) || 0; // Ambil nilai asli dari input
    const yardPerModel = parseFloat(item.yardPerModel) || (modelInfo.yardPerModel || 1);

    const totalBiayaKain = totalYard * hargaKainPerYard;
    
    let hargaJasa = 0;
    if (batch.produksiType === 'penjahit') {
        hargaJasa = hargaJahitPerPcs;
    } else {
        hargaJasa = hargaMaklunPerPcs;
    }

    const targetQty = Math.floor(totalYard / yardPerModel);
    
    let aktualFinal = 0;
    if (aktualJadi > 0) {
        aktualFinal = aktualJadi;
    } else if (aktualJadiKombinasi > 0) {
        aktualFinal = aktualJadiKombinasi;
    }

    const totalBiayaJasa = aktualJadi * hargaJasa;
    
    // [PERBAIKAN KUNCI DI SINI] Biaya Alat sekarang juga hanya dihitung berdasarkan 'aktualJadi'
    const totalBiayaAlat = aktualJadi > 0 ? biayaAlatInput : 0;

    const selisih = aktualFinal - targetQty;
    const totalBiayaProduksi = totalBiayaKain + totalBiayaJasa + totalBiayaAlat;
    const hpp = totalBiayaProduksi / (aktualFinal || 1);
    
    return {
        targetQty,
        selisih,
        totalBiayaKain,
        totalBiayaJasa,
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

        // ▼▼▼ PERBAIKAN UTAMA DI SINI ▼▼▼
        // 1. Cari produk lengkap di state lokal menggunakan SKU untuk mendapatkan docId-nya
        const productInState = state.produk.find(p => p.sku === itemToDelete.sku);

        // 2. Jika produk tidak ditemukan di state, hentikan proses
        if (!productInState) {
            throw new Error(`Produk dengan SKU ${itemToDelete.sku} tidak ditemukan di inventaris.`);
        }
        
        // 3. Gunakan docId yang benar untuk referensi ke database
        const productRef = doc(db, "products", productInState.docId);
        const allocationRef = doc(db, "stock_allocations", productInState.docId);

        await runTransaction(db, async (transaction) => {
            const returnDoc = await transaction.get(returnDocRef);
            const productDoc = await transaction.get(productRef);
            const allocationDoc = await transaction.get(allocationRef);

            if (!returnDoc.exists() || !productDoc.exists() || !allocationDoc.exists()) {
                throw new Error("Salah satu dokumen (retur, produk, atau alokasi) tidak ditemukan.");
            }

            // Kurangi stok karena retur dibatalkan
            const currentStock = productDoc.data().physical_stock || 0;
            const newStock = currentStock - itemToDelete.qty;
            const currentAllocations = allocationDoc.data() || {};
            const newChannelStock = (currentAllocations[itemToDelete.channelId] || 0) - itemToDelete.qty;

            if (newStock < 0 || newChannelStock < 0) {
                throw new Error(`Gagal menghapus retur karena akan membuat stok produk (${itemToDelete.sku}) menjadi minus.`);
            }

            // Update dokumen di database
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

        await loadAllDataFromFirebase();
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
                }
            }),
            userId: currentUser.value.uid
        };

        const returnRef = doc(collection(db, "returns"));
        batch.set(returnRef, dataToSave);

        // Mengembalikan stok ke inventaris fisik DAN alokasi stok channel
        for (const item of dataToSave.items) {
            // ▼▼▼ PERBAIKAN DI SINI ▼▼▼
            const productInState = getProductBySku(item.sku);
            if (productInState) {
                // Perbarui stok fisik menggunakan docId yang benar
                const newStockFisik = productInState.stokFisik + item.qty;
                const productRef = doc(db, "products", productInState.docId); // Gunakan docId
                batch.update(productRef, { physical_stock: newStockFisik });
                
                // Perbarui alokasi stok menggunakan docId yang benar
                const allocationRef = doc(db, "stock_allocations", productInState.docId); // Gunakan docId
                const newAlokasi = { ...productInState.stokAlokasi };
                newAlokasi[trxAsli.channelId] = (newAlokasi[trxAsli.channelId] || 0) + item.qty;
                batch.set(allocationRef, newAlokasi, { merge: true });
            }
        }
        
        await batch.commit();
        await loadAllDataFromFirebase();

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
        adm: 0, program: 0, layanan: 0, perPesanan: 0, komisi: 0, voucher: 0,
    };

    state.settings.marketplaces.push(newMarketplace);

    if (!state.promotions.perChannel[newMarketplace.id]) {
        state.promotions.perChannel[newMarketplace.id] = { voucherToko: null, voucherSemuaProduk: null };
    }

    try {
        await saveSettingsData(); // <-- PERUBAHAN DI SINI
        alert('Marketplace baru berhasil ditambahkan dan disimpan!');
    } catch (error) {
        alert("Gagal menyimpan data.");
    }
}

async function removeMarketplace(marketplaceId) {
    if (!currentUser.value) return alert("Anda harus login.");
    if (!confirm('Anda yakin ingin menghapus marketplace ini?')) return;

    const index = state.settings.marketplaces.findIndex(mp => mp.id === marketplaceId);
    if (index > -1) {
        state.settings.marketplaces.splice(index, 1);
        try {
            await saveSettingsData(); // <-- PERUBAHAN DI SINI
            alert('Marketplace berhasil dihapus dan perubahan telah disimpan.');
        } catch(error) {
            alert("Gagal menyimpan data.");
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
        await saveSettingsData(); // <-- PERUBAHAN DI SINI
        hideModal();
        alert('Perubahan marketplace berhasil disimpan.');
    } catch(error) {
        alert("Gagal menyimpan data.");
    }
}

async function saveSettingsData() {
    if (!currentUser.value) return alert("Anda harus login.");
    isSaving.value = true;
    try {
        const userId = currentUser.value.uid;
        const settingsRef = doc(db, "settings", userId);
        
        // Siapkan hanya data yang relevan dari state
        const settingsData = {
            brandName: state.settings.brandName,
            minStok: state.settings.minStok,
            marketplaces: JSON.parse(JSON.stringify(state.settings.marketplaces)),
            modelProduk: JSON.parse(JSON.stringify(state.settings.modelProduk)),
            userId: userId
            // Kita tidak menyertakan data lain yang tidak relevan di sini
        };
        
        // Simpan data ke Firestore
        await setDoc(settingsRef, settingsData, { merge: true });
        
        // Tidak perlu alert di sini karena fungsi pemanggil sudah punya
        
    } catch (error) {
        console.error("Gagal menyimpan pengaturan:", error);
        // Lemparkan error agar fungsi pemanggil tahu ada masalah
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
        yardPerModel: 0,
        hargaMaklun: 0,
        hargaJahit: 0, // Tambahkan properti ini
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
        // Pastikan properti hargaJahit juga tersimpan
        state.settings.modelProduk[index] = { ...editedModel, hargaJahit: editedModel.hargaJahit || 0 };
    }
    await saveData();
    hideModal();
    alert('Perubahan model Produk berhasil disimpan.');
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

async function removeProductVariant(productId) {
    if (!confirm(`Anda yakin ingin menghapus varian produk ini? Aksi ini tidak dapat dibatalkan.`)) {
        return;
    }
    if (!currentUser.value) {
        alert("Anda harus login.");
        return;
    }

    try {
        const batch = writeBatch(db);

        // Hapus dokumen produk utama
        const productRef = doc(db, "products", productId);
        batch.delete(productRef);

        // Hapus dokumen alokasi stok
        const allocationRef = doc(db, "stock_allocations", productId);
        batch.delete(allocationRef);

        // Hapus semua dokumen harga terkait
        // ▼▼▼ PERUBAHAN KUNCI ADA DI SINI ▼▼▼
        const pricesQuery = query(
            collection(db, "product_prices"), 
            where("product_id", "==", productId),
            where("userId", "==", currentUser.value.uid) // <-- BARIS INI DITAMBAHKAN
        );
        const pricesSnapshot = await getDocs(pricesQuery);
        pricesSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        // Hapus dari state lokal
        state.produk = state.produk.filter(p => p.docId !== productId);
        // Tidak perlu alert di sini agar tidak muncul berulang kali saat hapus grup

    } catch (error) {
        console.error(`Error menghapus produk ID: ${productId}:`, error);
        alert(`Gagal menghapus produk: ${error.message}`);
        throw error;
    }
}

async function deleteGroup(variants) {
    if (!confirm(`Anda yakin ingin menghapus SEMUA ${variants.length} varian produk ini?`)) {
        return;
    }

    let successCount = 0;
    const failedSkus = [];

    for (const variant of variants) {
        try {
            // ▼▼▼ PERBAIKAN DI SINI: Gunakan 'variant.docId' bukan 'variant.sku' ▼▼▼
            await removeProductVariant(variant.docId); 
            successCount++;
        } catch (error) {
            failedSkus.push(variant.sku);
        }
    }

    if (failedSkus.length === 0) {
        alert(`Berhasil menghapus semua ${successCount} varian.`);
    } else {
        alert(`Berhasil menghapus ${successCount} varian. Gagal menghapus: ${failedSkus.join(', ')}.`);
    }
    // Muat ulang data hanya jika ada yang gagal, untuk sinkronisasi
    if(failedSkus.length > 0) {
        await loadAllDataFromFirebase();
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

// [KODE BARU] State untuk mengelola accordion di halaman panduan
const panduanAccordion = ref(null);

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

        // Hapus dokumen transaksi itu sendiri
        const transactionRef = doc(db, "transactions", transactionId);
        batch.delete(transactionRef);

        // Kembalikan stok untuk setiap item dalam transaksi
        for (const item of trxToDelete.items) {
            // ▼▼▼ PERBAIKAN DI SINI ▼▼▼
            // 1. Cari produk lengkap di state lokal menggunakan SKU
            const productInState = state.produk.find(p => p.sku === item.sku);
            
            if (productInState) {
                // 2. Gunakan docId yang benar dari produk yang ditemukan untuk referensi
                const productRef = doc(db, "products", productInState.docId); 
                const newStock = (productInState.stokFisik || 0) + item.qty;
                batch.update(productRef, { physical_stock: newStock });
            }
        }

        await batch.commit();

        // Update state lokal setelah berhasil
        trxToDelete.items.forEach(item => {
            const productInState = state.produk.find(p => p.sku === item.sku);
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


function handleModelProdukChange(item) {
    const selectedModel = state.settings.modelProduk.find(m => m.id === item.modelProdukId);
    if (selectedModel) {
        // BARIS KUNCI: Set properti yang relevan
        item.yardPerModel = selectedModel.yardPerModel;
        item.hargaMaklunPerPcs = selectedModel.hargaMaklun;
        item.hargaJahitPerPcs = selectedModel.hargaJahit;
        
        
        // Kosongkan SKU agar pengguna memilih ulang
        item.sku = '';
        item.warnaKain = '';
        item.ukuran = '';
    } else {
        item.yardPerModel = null;
        item.hargaMaklunPerPcs = null;
        item.hargaJahitPerPcs = null;
        
    }
}
function handleProductSkuChange(item) {
    const selectedProduct = state.produk.find(p => p.sku === item.sku);
    if (selectedProduct) {
        
        item.warnaKain = selectedProduct.warna;
        item.ukuran = selectedProduct.varian;
        item.modelProdukId = selectedProduct.model_id;
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

watch(() => uiState.pengaturanTab, (newTab) => {
    if (newTab === 'admin' && isAdmin.value && uiState.allUsers.length === 0) {
        fetchAllUsers();
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
        const collectionsToFetch = [
            getDoc(doc(db, "settings", userId)),
            getDoc(doc(db, "promotions", userId)),
            getDocs(query(collection(db, "products"), where("userId", "==", userId))),
            getDocs(query(collection(db, 'product_prices'), where("userId", "==", userId))),
            getDocs(query(collection(db, 'stock_allocations'), where("userId", "==", userId))),
            getDocs(query(collection(db, "transactions"), where("userId", "==", userId))),
            getDocs(query(collection(db, "keuangan"), where("userId", "==", userId))),
            getDocs(query(collection(db, "returns"), where("userId", "==", userId))),
            getDocs(query(collection(db, "production_batches"), where("userId", "==", userId))),
            getDocs(query(collection(db, "fabric_stock"), where("userId", "==", userId))),
            getDocs(query(collection(db, "categories"), where("userId", "==", userId))),
            getDocs(query(collection(db, "investors"), where("userId", "==", userId))),
            getDocs(query(collection(db, "bank_accounts"), where("userId", "==", userId))), // <-- Tambahan baru
            getDocs(query(collection(db, "investor_payments"), where("userId", "==", userId))) // <-- Tambahan baru
        ];

        const results = await Promise.all(collectionsToFetch.map(p => p.catch(e => e)));

        const [
            settingsSnap, promotionsSnap, productsSnap, pricesSnap, allocationsSnap,
            transactionsSnap, keuanganSnap, returnsSnap, productionSnap, fabricSnap,
            categoriesSnap, investorsSnap, bankAccountsSnap, investorPaymentsSnap
        ] = results;

        // Cek jika ada error fundamental (misal: aturan keamanan)
        const firstError = results.find(res => res instanceof Error);
        if (firstError) {
            console.error("Salah satu query gagal:", firstError);
            throw new Error("Gagal mengambil data. Periksa aturan keamanan Firestore Anda.");
        }
        
        // Proses data seperti biasa...
        if (settingsSnap.exists()) {
            Object.assign(state.settings, settingsSnap.data());
            if (!state.settings.pinProtection) {
                state.settings.pinProtection = {
                    dashboard: true,
                    incomeHistory: true,
                    investmentPage: true,
                };
            }
        }
        
        // TAMBAHKAN INI UNTUK MEMASTIKAN KATEGORI PEMASUKAN JUGA DIUPDATE
        const userDocRef = doc(db, "users", userId);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            state.settings.inflowCategories = userData.inflowCategories || [];
        }
        if (promotionsSnap.exists()) {
            Object.assign(state.promotions, promotionsSnap.data());
        }

        const pricesData = pricesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const allocationsData = allocationsSnap.docs.map(doc => ({ sku: doc.id, ...doc.data() }));
        
        state.produk = productsSnap.docs.map(docSnap => {
    const p = { id: docSnap.id, ...docSnap.data() };
    const hargaJual = {};
    const stokAlokasi = {};
    // Perbaikan: Cari alokasi berdasarkan ID dokumen
    const productAllocation = allocationsData.find(alloc => alloc.sku === p.id); 
    (state.settings.marketplaces || []).forEach(mp => {
        // Perbaikan: Cari harga berdasarkan ID produk
        const priceInfo = pricesData.find(pr => pr.product_id === p.id && pr.marketplace_id === mp.id); 
        hargaJual[mp.id] = priceInfo ? priceInfo.price : 0;
        stokAlokasi[mp.id] = productAllocation ? (productAllocation[mp.id] || 0) : 0;
    });
    return {
        docId: p.id,                // <-- BARU: Simpan ID asli dokumen
        sku: p.sku,                 // <-- DIPERBAIKI: Ambil SKU dari field data
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
        
        state.transaksi = transactionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggal: doc.data().tanggal?.toDate() }));
        state.keuangan = keuanganSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggal: doc.data().tanggal?.toDate() }));
        state.investor = investorsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), startDate: doc.data().startDate?.toDate() }));
        state.bankAccounts = bankAccountsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        state.investorPayments = investorPaymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), paymentDate: doc.data().paymentDate?.toDate() }));
        state.retur = returnsSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggal: doc.data().tanggal?.toDate() }));
        state.produksi = productionSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggal: doc.data().tanggal?.toDate() }));
        state.gudangKain = fabricSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), tanggalBeli: doc.data().tanggalBeli?.toDate() }));
        state.settings.categories = categoriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    } catch (error) {
        console.error("Error besar saat memuat data dari Firebase:", error);
        alert("Gagal memuat data dari database. Mohon periksa koneksi internet atau aturan keamanan Anda.");
        handleLogout();
    } finally {
        isLoading.value = false;
    }
}

// GANTI SELURUH KODE di dalam onMounted DENGAN KODE INI
onMounted(() => {
    // Panggil listener onAuthStateChanged saat komponen dimuat
    onAuthStateChanged(auth, async (user) => {
        isLoading.value = true;

        if (user) {
            // Jika pengguna login, muat data pengguna dan listener real-time
            currentUser.value = user;

            try {
                const userDocRef = doc(db, "users", user.uid);

                // Hentikan listener sebelumnya jika ada, untuk menghindari duplikasi
                if (onSnapshotListener) {
                    onSnapshotListener();
                }

                // BUAT LISTENER REAL-TIME untuk dokumen pengguna
                onSnapshotListener = onSnapshot(userDocRef, async (userDocSnap) => {
                    if (userDocSnap.exists()) {
                        const userData = userDocSnap.data();
                        currentUser.value.userData = userData;
                        state.settings.dashboardPin = userData.dashboardPin || '';

                        const now = new Date();
                        const endDate = userData.subscriptionEndDate?.toDate();
                        const trialDate = userData.trialEndDate?.toDate();

                        const isSubscriptionValid = (userData.subscriptionStatus === 'active' && endDate && now <= endDate) ||
                                                    (userData.subscriptionStatus === 'trial' && trialDate && now <= trialDate);

                        if (isSubscriptionValid) {
                            // PENTING: Muat semua data lain setelah memastikan langganan valid
                            await loadAllDataFromFirebase();
                            const storedPage = localStorage.getItem('lastActivePage');
                            
                            // [PERBAIKAN KUNCI ADA DI SINI]
                            // Kita tidak lagi mengatur activePage.value secara langsung.
                            // Kita memanggil changePage() agar semua logika kunci ikut berjalan.
                            const pageToLoad = (storedPage && storedPage !== 'login' && storedPage !== 'langganan') ? storedPage : 'dashboard';
                            changePage(pageToLoad);

                        } else {
                            activePage.value = 'langganan';
                        }
                    } else {
                        console.error("Data user tidak ditemukan di Firestore. Mengarahkan ke logout.");
                        handleLogout();
                    }
                    isLoading.value = false;
                });
            } catch (error) {
                console.error("Gagal memuat data user:", error);
                alert("Gagal memuat data user. Silakan coba lagi.");
                isLoading.value = false;
                handleLogout();
            }
        } else {
            // Logika logout
            if (onSnapshotListener) {
                onSnapshotListener();
                onSnapshotListener = null;
            }
            currentUser.value = null;
            activePage.value = 'login';
            isLoading.value = false;
        }
    });
});
// Aktifkan kembali watcher ini untuk menyimpan halaman aktif ke localStorage
watch(activePage, (newPage) => {
    localStorage.setItem('lastActivePage', newPage);
});

</script>

<template>
    <!-- JIKA PENGGUNA SUDAH LOGIN, TAMPILKAN APLIKASI UTAMA -->
    <div v-if="currentUser" class="flex h-screen bg-slate-100">
        <!-- Sidebar -->
        <aside class="w-64 bg-gray-900 text-gray-300 flex-shrink-0 hidden md:flex md:flex-col">
            <div class="h-16 flex items-center justify-center px-4 border-b border-gray-700/50">
                <h1 class="text-xl font-bold text-white tracking-wider">{{ state.settings.brandName }}</h1>
            </div>
            <div class="flex-1 flex flex-col overflow-y-auto">
                <nav class="flex-1 px-2 py-4 space-y-1">
                    <a href="#" @click.prevent="changePage('dashboard')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'dashboard' }">Dashboard</a>
                    <a href="#" @click.prevent="changePage('transaksi')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'transaksi' }">Kasir (POS)</a>
                    <a href="#" @click.prevent="changePage('bulk_process')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'bulk_process' }">Proses Massal</a>
                    <a href="#" @click.prevent="changePage('inventaris')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'inventaris' }">Inventaris</a>
                    <a href="#" @click.prevent="changePage('harga-hpp')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'harga-hpp' }">Harga & HPP</a>
                    <a href="#" @click.prevent="changePage('promosi')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'promosi' }">Promosi</a>
                    <a href="#" @click.prevent="changePage('produksi')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'produksi' }">Produksi</a>
                    <a href="#" @click.prevent="changePage('gudang-kain')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'gudang-kain' }">Stok Kain</a>
                    <a href="#" @click.prevent="changePage('keuangan')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'keuangan' }">Keuangan</a>
                    <a href="#" @click.prevent="changePage('retur')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'retur' }">Manajemen Retur</a>
                    <a href="#" @click.prevent="changePage('investasi')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'investasi' }">Investasi</a>
                    <a href="#" @click.prevent="changePage('pengaturan')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'pengaturan' }">Pengaturan</a>
                    <a href="#" @click.prevent="changePage('langganan')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'langganan' }">Langganan</a>
                </nav>
                <div class="mt-auto p-2">
                    <button @click="handleLogout" class="w-full mt-2 sidebar-link hover:bg-red-500/20 hover:text-red-400">Logout</button>
                </div>
            </div>
        </aside>

        <!-- Main Content (Seluruh isi aplikasi Anda yang lama ada di sini) -->
        <main class="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
            <!-- ... (semua v-if untuk setiap halaman seperti dashboard, inventaris, dll, tetap di sini) ... -->
        </main>
    </div>

    <!-- JIKA PENGGUNA BELUM LOGIN -->
    <div v-else>
        <!-- Tampilkan Form Login/Register jika activePage adalah 'login' atau 'register' -->
        <div v-if="activePage === 'login' || activePage === 'register'">
            <div class="flex items-center justify-center h-screen bg-slate-100 p-4">
                <div class="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-8 sm:p-12 space-y-8 animate-fade-in">
                    <div class="text-center">
                        <h2 class="text-4xl font-extrabold text-slate-800">{{ activePage === 'login' ? 'Selamat Datang Kembali' : 'Buat Akun Baru' }}</h2>
                        <p class="mt-2 text-2xl font-bold text-indigo-600">Fashion OS</p>
                    </div>
                    <!-- Form Login/Register Anda yang lama -->
                    <form @submit.prevent="activePage === 'login' ? handleLogin() : handleRegister()" class="space-y-6">
                        <!-- ... (semua input email, password, dll) ... -->
                        <div class="mt-6 space-y-3">
                            <button type="submit" class="w-full py-3.5 rounded-xl shadow-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">
                                <span v-if="activePage === 'login'">Login</span>
                                <span v-else>Daftar Akun Baru</span>
                            </button>
                            <p class="text-center text-sm text-slate-600">
                                <button type="button" @click="activePage = (activePage === 'login' ? 'register' : 'login')" class="text-indigo-600 hover:underline">
                                    <span v-if="activePage === 'login'">Belum Punya Akun? Daftar</span>
                                    <span v-else>Sudah Punya Akun? Login</span>
                                </button>
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- Tampilkan Landing Page jika tidak sedang login/register -->
        <div v-else>
            <!-- Navigasi -->
            <nav class="bg-white/80 backdrop-blur-md shadow-sm fixed w-full z-10">
                <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="flex justify-between items-center h-16">
                        <div class="flex-shrink-0">
                            <h1 class="text-2xl font-bold text-slate-800">Fashion OS</h1>
                        </div>
                        <div class="hidden sm:block sm:ml-6">
                            <div class="flex space-x-4">
                                <button @click="activePage = 'login'" class="text-slate-600 hover:bg-slate-100 px-3 py-2 rounded-md text-sm font-medium">Login</button>
                                <button @click="activePage = 'register'" class="bg-indigo-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-indigo-700">Daftar Gratis</button>
                            </div>
                        </div>
                    </div>
                </div>
            </nav>

            <!-- Konten Landing Page -->
            <main class="pt-16">
                <!-- ... (semua section hero, fitur, harga dari landing page) ... -->
            </main>
            
            <!-- Footer -->
            <footer class="bg-slate-800 text-white">
                <div class="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 text-center">
                    <p>&copy; 2025 Fashion OS. All rights reserved.</p>
                </div>
            </footer>
        </div>
    </div>
</template>

<style scoped>


.help-icon-button {
  position: absolute;
  top: 0.5rem; /* 8px */
  right: 0.5rem; /* 8px */
  width: 1.25rem; /* 20px */
  height: 1.25rem; /* 20px */
  border-radius: 9999px; /* rounded-full */
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f1f5f9; /* slate-100 */
  color: #64748b; /* slate-500 */
  font-weight: bold;
  font-size: 0.875rem; /* text-sm */
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.help-icon-button:hover {
  background-color: #6366f1; /* indigo-500 */
  color: white;
  transform: scale(1.1);
}


/* Gaya Sidebar Baru yang Profesional */
.sidebar-link {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-weight: 500;
    color: #9ca3af; /* gray-400 */
    transition: background-color 0.2s ease-in-out, color 0.2s ease-in-out;
}

.sidebar-link:hover {
    background-color: #374151; /* gray-700 */
    color: #ffffff;
}

.sidebar-link-active {
    background-image: linear-gradient(to right, #4f46e5, #6d28d9); /* gradasi indigo -> violet */
    color: #ffffff;
    font-weight: 600;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
}

/* Style dasar untuk komponen lain */
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
    background-color: #dcfce7; /* green-100 */
    color: #166534; /* green-800 */
}

.stock-low {
    background-color: #fef3c7; /* yellow-100 */
    color: #92400e; /* yellow-800 */
}

.stock-empty {
    background-color: #fee2e2; /* red-100 */
    color: #991b1b; /* red-800 */
}


.accordion-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.5s ease-in-out;
}
.accordion-content.open {
    max-height: 1000px; /* Cukup besar untuk menampung konten */
}

/* Styling untuk konten di dalam v-html */
.panduan-content ul {
    list-style-position: outside;
    padding-left: 1.5rem;
}
.panduan-content li {
    margin-bottom: 0.5rem;
}

</style>