<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import * as XLSX from 'xlsx'; // Import untuk fitur Export Excel

// Impor dari file konfigurasi Firebase Anda

import { db, auth } from './firebase.js'; 

// Impor fungsi-fungsi untuk Database (Firestore)
import { collection, doc, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction, addDoc, onSnapshot, query, where, getDocs, getDoc } from 'firebase/firestore';
let onSnapshotListener = null;
let commissionsListener = null;
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

const commissions = ref([]);
const totalUnpaidCommission = computed(() => {
    return commissions.value.filter(c => c.status === 'unpaid').reduce((sum, c) => sum + c.amount, 0);
});

const totalPaidCommission = computed(() => {
    return commissions.value.filter(c => c.status === 'paid').reduce((sum, c) => sum + c.amount, 0);
});

const unpaidCommissions = computed(() => {
    return commissions.value.filter(c => c.status === 'unpaid').sort((a, b) => new Date(b.createdAt.seconds * 1000) - new Date(a.createdAt.seconds * 1000));
});



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


const currentTime = ref('');
let intervalId = null;

const updateTime = () => {
    const now = new Date();
    
    // Pisahkan format tanggal
    const datePart = new Intl.DateTimeFormat('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'Asia/Jakarta'
    }).format(now);
    
    // Pisahkan format waktu (jam, menit, detik)
    const timePart = new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Jakarta'
    }).format(now);

    // Gabungkan tanggal dan waktu tanpa kata "pukul"
    currentTime.value = `${datePart} ${timePart}`;
};

onMounted(() => {
    updateTime(); // Perbarui waktu saat komponen dimuat
    intervalId = setInterval(updateTime, 1000); // Perbarui setiap detik
});

onUnmounted(() => { // <-- PINDAHKAN KE SINI
    clearInterval(intervalId); // Hentikan pembaruan saat komponen dilepas
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
    commissions: { perModel: {} },
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

const monthlyPrice = ref(350000);
const yearlyPrice = ref(4200000);
const discountedMonthlyPrice = ref(250000);
const discountedYearlyPrice = ref(2500000);

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



async function cashoutCommission() {
    if (!confirm(`Anda akan mencairkan komisi sebesar ${formatCurrency(totalUnpaidCommission.value)}. Lanjutkan?`)) return;

    try {
        isSaving.value = true;
        const batch = writeBatch(db);
        const now = new Date();

        // Tandaii semua komisi 'unpaid' menjadi 'paid'
        commissions.value.filter(c => c.status === 'unpaid').forEach(c => {
            const commissionRef = doc(db, "commissions", c.id);
            batch.update(commissionRef, { status: 'paid', paidDate: now });
        });

        // Catat pengeluaran di koleksi 'keuangan'
        const expenseData = {
            kategori: 'Pembayaran Komisi Mitra',
            jumlah: totalUnpaidCommission.value,
            catatan: `Pembayaran komisi untuk mitra ${currentUser.value.referralCode}`,
            jenis: 'pengeluaran',
            userId: currentUser.value.uid,
            tanggal: now
        };
        const keuanganRef = doc(collection(db, "keuangan"));
        batch.set(keuanganRef, expenseData);

        await batch.commit();
        alert('Permintaan pencairan komisi berhasil dicatat!');
        hideModal();
    } catch (error) {
        console.error('Error saat mencairkan komisi:', error);
        alert('Gagal mencairkan komisi. Silakan coba lagi.');
    } finally {
        isSaving.value = false;
    }
}

async function proceedToPartnerPayment() {
    if (!currentUser.value) return alert("Anda harus login.");

    try {
        const priceToPay = 50000; // Biaya pendaftaran mitra
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
    merchant_ref: `PARTNERREG-${currentUser.value.uid}-${Date.now()}-${Math.floor(Math.random() * 10000)}`, // <-- Kode yang diperbaiki
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
        for (const order of ordersToProcess) {
            const subtotal = order.items.reduce((sum, item) => sum + (item.hargaJualAktual * item.qty), 0);
            const discount = calculateBestDiscount(order.items, uiState.activeCartChannel);
            const finalTotal = subtotal - discount.totalDiscount;

            let totalBiaya = 0;
            const biayaList = [];

            // --- [PERUBAIAN 2: Kalkulasi Biaya Komisi Baru] ---
            // Menghitung total komisi dari setiap item di dalam antrian pesanan
            let totalKomisi = 0;
            for (const item of order.items) {
                if (item.commissionRate > 0) {
                    totalKomisi += (item.commissionRate / 100) * (item.hargaJualAktual * item.qty);
                }
            }
            if (totalKomisi > 0) {
                biayaList.push({ name: 'Komisi Produk', value: totalKomisi });
                totalBiaya += totalKomisi;
            }
            // --- [AKHIR PERUBAIAN 2] ---

            // Biaya Marketplace lainnya (baris 'marketplace.komisi' sudah dihapus)
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
    
    // Cari transaksii berdasarkan marketplaceOrderId
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

    let priceToPay = plan === 'bulanan' ? monthlyPrice.value : yearlyPrice.value;
    const isReferred = uiState.referralCodeApplied || currentUser.value?.userData?.referredBy;
    if (isReferred) {
        priceToPay = plan === 'bulanan' ? 250000 : 3000000;
    }
    const itemName = `Langganan Fashion OS - Paket ${plan === 'bulanan' ? 'Bulanan' : 'Tahunan'}`;
    const referredByCode = isReferred ? uiState.referralCodeInput : null;

    try {
        // --- AWAL PERBAIKAN: Pasang pendengar event sebelum membuka pembayaran ---
        const handleMayarMessage = (event) => {
            // Filter keamanan: Pastikan pesan berasal dari Mayar
            if (event.origin !== 'https://app.mayar.id' && event.origin !== 'https://mayar.id') {
                return;
            }

            console.log('Menerima pesan dari iFrame Mayar:', event.data);

            // Cek sinyal sukses dari Mayar (kemungkinan formatnya seperti ini)
            if (event.data && (event.data.event === 'payment.success' || event.data.status === 'SUCCESS')) {
                console.log('Sinyal pembayaran sukses terdeteksi! Melakukan redirect...');
                
                // Hapus pendengar agar tidak berjalan lagi
                window.removeEventListener('message', handleMayarMessage);
                
                // Lakukan redirect secara manual dari aplikasi kita
                window.location.href = `https://appfashion.id/langganan?status=success`;
            }
        };

        window.addEventListener('message', handleMayarMessage, false);
        // --- AKHIR PERBAIKAN ---

        let finalCallbackUrl = 'https://appfashion.id/api/mayar-webhook';
        if (referredByCode) {
            finalCallbackUrl += `?refCode=${referredByCode}`;
        }

        const response = await fetch('/api/create-mayar-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                amount: priceToPay,
                item_name: itemName,
                customer_email: currentUser.value.email,
                callback_url: finalCallbackUrl,
                redirect_url: `https://appfashion.id/langganan?status=success`,
                merchant_ref: `FASHIONOS-${currentUser.value.uid}-${Date.now()}-${plan}`,
            }),
        });

        const data = await response.json();
        if (!response.ok) {
            // Jika gagal, hapus pendengar yang sudah dipasang
            window.removeEventListener('message', handleMayarMessage);
            throw new Error(data.message || `Mayar API Error: ${response.status}`);
        }
        if (data.invoice_url) {
            window.location.href = data.invoice_url;
        } else {
            // Jika gagal, hapus pendengar yang sudah dipasang
            window.removeEventListener('message', handleMayarMessage);
            throw new Error('Gagal mendapatkan URL pembayaran dari Mayar.');
        }
    } catch (error) {
        console.error("Gagal memproses langganan Mayar:", error);
        alert(`Gagal memproses langganan. Silakan coba lagi.\n\nError: ${error.message}`);
        isSubscribingPlan.value = false; // Pastikan loading state berhenti jika ada error
    }
    // 'finally' block tidak lagi dibutuhkan di sini karena state diatur oleh event listener atau error handling
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


const commissionModelComputed = (modelName, channelId) => computed({
    get() {
        return state.commissions.perModel[modelName]?.[channelId] ? state.commissions.perModel[modelName][channelId] + '%' : '';
    },
    set(newValue) {
        if (!state.commissions.perModel[modelName]) {
            state.commissions.perModel[modelName] = {};
        }
        state.commissions.perModel[modelName][channelId] = parsePercentageInput(newValue);
    }
});


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
            // Kitaa tidak perlu memeriksa 'exists()' lagi karena sudah diperiksa di atas
            
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

    referralCodeInput: '',
    referralCodeApplied: false,
    referralCodeMessage: '',

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

        const promotionsRef = doc(db, "promotions", userId);
        const promotionsData = {
            perChannel: state.promotions.perChannel || {},
            perModel: state.promotions.perModel || {},
            userId: userId
        };
        batch.set(promotionsRef, JSON.parse(JSON.stringify(promotionsData)));

        // --- [KODE BARU DITAMBAHKAN] ---
        // Menyimpan data komisi per model
        const commissionsRef = doc(db, "commissions", userId);
        const commissionsData = {
            perModel: state.commissions.perModel || {},
            userId: userId
        };
        batch.set(commissionsRef, JSON.parse(JSON.stringify(commissionsData)));
        // --- [AKHIR KODE BARU] ---

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
                }, { merge: true });
            }
        }
        await batch.commit();
        
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

        // Logika khususs untuk modal tertentu
        if (type === 'editMarketplace' && data) {
            if (!uiState.modalData.programs) {
                uiState.modalData.programs = [];
            }
        } else if (type === 'addProduksi') {
            if (!state.settings.modelProduk || state.settings.modelProduk.length === 0) {
                alert("Data 'Model Produk' belum dibuat. silahkan kehalaman pengaturan untuk menambahkan model produk.");
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

    // --- [PERUBAIAN: Kalkulasi Biaya Komisi Baru] ---
    // Menghitung total komisi dari setiap item di keranjang
    let totalKomisi = 0;
    for (const item of activeCart.value) {
        if (item.commissionRate > 0) {
            // Komisi dihitung dari harga jual aktual item dikali kuantitasnya
            totalKomisi += (item.commissionRate / 100) * (item.hargaJualAktual * item.qty);
        }
    }
    if (totalKomisi > 0) {
        biayaList.push({ name: 'Komisi Produk', value: totalKomisi });
        totalBiaya += totalKomisi;
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

    // --- [PERUBAIAN 1: Mengambil Data Komisi yang Benar] ---
    // Mengambil komisi berdasarkan Model Produk dan Marketplace yang dipilih
    const commissionRate = (state.commissions.perModel[selectedModelName]?.[selectedMarketplace] || 0) / 100;

    const dummyProduct = {
        sku: 'calc-dummy',
        nama: selectedModelName,
        hargaJualAktual: hpp * 2, // Harga dummy untuk kalkulasi diskon
        qty: 1
    };
    const discountInfo = calculateBestDiscount([dummyProduct], selectedMarketplace);
    const bestDiscountRate = (discountInfo.rate || 0) / 100;

    // --- [PERUBAIAN 2: Menghapus Komisi Lama dari Kalkulasi] ---
    // 'mp.komisi' sudah tidak digunakan di sini
    const totalMarketplacePercentageFees = (mp.adm || 0) + (mp.layanan || 0);
    const perOrderFee = mp.perPesanan || 0;
    const targetProfitPercentage = (targetMargin || 0) / 100;

    const itemizedProgramFeesBase = (mp.programs || []).map(p => (parseFloat(p.rate) || 0) / 100);
    const totalProgramPercentage = itemizedProgramFeesBase.reduce((sum, rate) => sum + rate, 0);

    // --- [PERUBAIAN 3: Menambahkan Komisi Baru ke Total Biaya Persentase] ---
    const allPercentageFees = (totalMarketplacePercentageFees / 100) + targetProfitPercentage + bestDiscountRate + totalProgramPercentage + commissionRate;
    
    const calculatedPrice = (hpp + perOrderFee) / (1 - allPercentageFees);

    // --- [PERUBAIAN 4: Menghitung & Menampilkan Rincian Komisi Baru] ---
    const adminFee = calculatedPrice * (mp.adm || 0) / 100;
    const commission = calculatedPrice * commissionRate; // Menghitung nilai komisi dalam Rupiah
    const serviceFee = calculatedPrice * (mp.layanan || 0) / 100;
    const bestDiscount = calculatedPrice * bestDiscountRate;

    const itemizedProgramFees = (mp.programs || []).map(program => {
        const rate = parseFloat(program.rate) || 0;
        return { name: program.name, rate: rate, fee: calculatedPrice * (rate / 100) };
    });
    const totalProgramFeeValue = itemizedProgramFees.reduce((sum, item) => sum + item.fee, 0);

    const totalFees = adminFee + commission + serviceFee + totalProgramFeeValue + perOrderFee; // Menambahkan 'commission' ke total biaya
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
            commission, // Menampilkan nilai komisi baru
            komisiRate: commissionRate * 100, // Menampilkan persentase komisi baru
            serviceFee,
            layananRate: mp.layanan || 0,
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
        adm: 0, program: 0, layanan: 0, perPesanan: 0, voucher: 0,
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
        // --- [PERUBAHAN 1: Menambahkan 'commissions' untuk diambil] ---
        const collectionsToFetch = [
            getDoc(doc(db, "settings", userId)),
            getDoc(doc(db, "promotions", userId)),
            getDoc(doc(db, "commissions", userId)), // <-- BARIS BARU DITAMBAHKAN
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
            getDocs(query(collection(db, "bank_accounts"), where("userId", "==", userId))),
            getDocs(query(collection(db, "investor_payments"), where("userId", "==", userId)))
        ];

        const results = await Promise.all(collectionsToFetch.map(p => p.catch(e => e)));

        // --- [PERUBAHAN 2: Menambahkan variabel 'commissionsSnap'] ---
        const [
            settingsSnap, promotionsSnap, commissionsSnap, productsSnap, pricesSnap, allocationsSnap,
            transactionsSnap, keuanganSnap, returnsSnap, productionSnap, fabricSnap,
            categoriesSnap, investorsSnap, bankAccountsSnap, investorPaymentsSnap
        ] = results;

        const firstError = results.find(res => res instanceof Error);
        if (firstError) {
            console.error("Salah satu query gagal:", firstError);
            throw new Error("Gagal mengambil data. Periksa aturan keamanan Firestore Anda.");
        }
        
        if (settingsSnap.exists()) {
            Object.assign(state.settings, settingsSnap.data());
            if (!state.settings.pinProtection) {
                state.settings.pinProtection = { dashboard: true, incomeHistory: true, investmentPage: true, };
            }
        }
        
        const userDocRef = doc(db, "users", userId);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            state.settings.inflowCategories = userData.inflowCategories || [];
        }
        if (promotionsSnap.exists()) {
            Object.assign(state.promotions, promotionsSnap.data());
        }

        // --- [PERUBAHAN 3: Memproses data komisi yang baru diambil] ---
        if (commissionsSnap && commissionsSnap.exists()) {
            Object.assign(state.commissions, commissionsSnap.data());
        }
        // --- [AKHIR PERUBAHAN 3] ---

        const pricesData = pricesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const allocationsData = allocationsSnap.docs.map(doc => ({ sku: doc.id, ...doc.data() }));
        
        // --- [PERUBAHAN 4: Menghapus logika komisi lama dari data produk] ---
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
                // Properti 'commissions' dihapus dari sini karena sekarang dikelola secara global
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
    updateTime();
    intervalId = setInterval(updateTime, 1000);

    onAuthStateChanged(auth, (user) => {
        isLoading.value = true;

        if (onSnapshotListener) {
            onSnapshotListener();
            onSnapshotListener = null;
        }
        if (commissionsListener) {
            commissionsListener();
            commissionsListener = null;
        }

        if (user) {
            currentUser.value = user;
            const userDocRef = doc(db, "users", user.uid);

            onSnapshotListener = onSnapshot(userDocRef, async (userDocSnap) => {
                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    currentUser.value.userData = userData;
                    state.settings.dashboardPin = userData.dashboardPin || '';

                    currentUser.value.isPartner = userData.isPartner || false;
                    currentUser.value.referralCode = userData.referralCode || null;

                    const now = new Date();
                    const endDate = userData.subscriptionEndDate?.toDate();
                    const trialDate = userData.trialEndDate?.toDate();

                    const isSubscriptionValid = (userData.subscriptionStatus === 'active' && endDate && now <= endDate) ||
                                                (userData.subscriptionStatus === 'trial' && trialDate && now <= trialDate);

                    if (isSubscriptionValid) {
                        if (state.produk.length === 0 || activePage.value === 'langganan') {
                            await loadAllDataFromFirebase();
                        }

                        if (currentUser.value.isPartner && currentUser.value.referralCode) {
                            const commissionsQuery = query(
                                collection(db, 'commissions'),
                                where('referredByUserId', '==', currentUser.value.referralCode)
                            );
                            commissionsListener = onSnapshot(commissionsQuery, (snapshot) => {
                                const fetchedCommissions = [];
                                snapshot.forEach(doc => {
                                    fetchedCommissions.push({ id: doc.id, ...doc.data() });
                                });
                                commissions.value = fetchedCommissions;
                            });
                        }

                        const storedPage = localStorage.getItem('lastActivePage');
                        const pageToLoad = (storedPage && storedPage !== 'login' && storedPage !== 'langganan') ? storedPage : 'dashboard';
                        changePage(pageToLoad);
                    } else {
                        activePage.value = 'langganan';
                    }
                } else {
                    console.error("Dokumen pengguna tidak ditemukan di Firestore. Melakukan logout.");
                    handleLogout();
                }
                isLoading.value = false;
            }, (error) => {
                console.error("Gagal mendengarkan data pengguna:", error);
                alert("Gagal memuat data pengguna. Silakan coba lagi.");
                isLoading.value = false;
                handleLogout();
            });
        } else {
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
    <div v-if="!currentUser && !isLoading" class="flex items-center justify-center h-screen bg-slate-100 p-4">
    <div class="w-full max-w-lg bg-white rounded-3xl shadow-2xl p-8 sm:p-12 space-y-8 animate-fade-in">
        <div class="text-center">
            <h2 class="text-4xl font-extrabold text-slate-800">Selamat Datang di</h2>
            <p class="mt-2 text-2xl font-bold text-indigo-600">{{ state.settings.brandName }}</p>
        </div>

        <div class="space-y-4">
            <button type="button" @click="signInWithGoogle" class="w-full flex items-center justify-center py-3.5 px-4 rounded-xl shadow-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors">
                <img src="https://www.vectorlogo.zone/logos/google/google-icon.svg" alt="Google" class="w-6 h-6 mr-3">
                Login dengan Google
            </button>
        </div>

        <div class="relative py-4">
            <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-slate-300"></div>
            </div>
            <div class="relative flex justify-center text-sm text-slate-500">
                <span class="bg-white px-2">Atau</span>
            </div>
        </div>

        <form @submit.prevent="activePage === 'login' ? handleLogin() : handleRegister()" class="space-y-6">
            <div>
                <label for="email" class="block text-sm font-medium text-slate-700">Alamat Email</label>
                <input type="email" v-model="authForm.email" id="email" required class="mt-1 block w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors">
            </div>
            <div>
                <label for="password" class="block text-sm font-medium text-slate-700 mt-4">Password</label>
                <input type="password" v-model="authForm.password" id="password" required class="mt-1 block w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors">
            </div>
            
            <div v-if="activePage === 'register'">
    <label for="activation-code" class="block text-sm font-medium text-slate-700 mt-4">Kode Aktivasi (Opsional)</label>
    <input type="text" v-model="authForm.activationCode" id="activation-code" class="mt-1 block w-full px-4 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors">
    <p class="mt-2 text-xs text-slate-500">Masukkan kode aktivasi untuk mendapatkan langganan premium.</p>
</div>
            <div v-if="authForm.error" class="p-3 mt-4 text-sm text-red-700 bg-red-100 rounded-md border border-red-300">
                {{ authForm.error }}
            </div>
            <div id="recaptcha-container"></div>
            
            <div class="mt-6 space-y-3">
                <button type="submit" class="w-full py-3.5 rounded-xl shadow-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 transition-colors">
                    <span v-if="activePage === 'login'">Login</span>
                    <span v-else>Daftar Akun Baru</span>
                </button>
                <p class="text-center text-sm text-slate-600">
                    <button type="button" @click="changePage(activePage === 'login' ? 'register' : 'login')" class="text-indigo-600 hover:underline transition-colors">
                        <span v-if="activePage === 'login'">Belum Punya Akun? Daftar</span>
                        <span v-else>Sudah Punya Akun? Login</span>
                    </button>
                </p>
            </div>
        </form>
    </div>
</div>
        
  <div v-if="currentUser">
    <div class="flex h-screen bg-slate-100">
      <!-- Sidebar -->
      <aside class="w-64 bg-gray-900 text-gray-300 flex-shrink-0 hidden md:flex md:flex-col">
    <div class="h-16 flex items-center justify-center px-4 border-b border-gray-700/50">
        <h1 class="text-xl font-bold text-white tracking-wider">{{ state.settings.brandName }}</h1>
    </div>
    <div class="p-4 text-center text-cyan-400 font-bold text-sm">
    {{ currentTime }}
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
            <a href="#" @click.prevent="changePage('langganan')" class="sidebar-link" :class="{ 'sidebar-link-active': activePage === 'langganan' }">
                <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v1h-14v-1zM14 11h-4a1 1 0 00-1 1v2a1 1 0 001 1h4a1 1 0 001-1v-2a1 1 0 00-1-1zM5 19h14a2 2 0 002-2v-5H3v5a2 2 0 002 2z"/></svg>
                Langganan
            </a>
        </nav>
        
        <div class="mt-auto p-2">
            <hr class="border-gray-700 mx-2 my-2">
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
    <div v-if="state.settings.dashboardPin && isDashboardLocked" class="flex items-center justify-center h-screen p-4">
        <div class="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full text-center">
            <h3 class="text-xl font-bold text-slate-800 mb-4">Dasbor Terkunci</h3>
            <p class="text-sm text-slate-600 mb-4">Masukkan PIN untuk melihat data dasbor.</p>
            <form @submit.prevent="unlockDashboard">
                <input type="password" v-model="dashboardPinInput" placeholder="Masukkan PIN" class="w-full p-2 border rounded-md text-center text-lg mb-2">
                <p v-if="dashboardPinError" class="text-red-500 text-xs mb-2">{{ dashboardPinError }}</p>
                <button type="submit" class="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg">Buka Dasbor</button>
            </form>
        </div>
    </div>
    
    <div v-else>
        <div class="flex flex-wrap justify-between items-center mb-8 gap-4">
            <div class="flex items-center gap-4">
                <h2 class="text-3xl font-bold text-slate-800">Dashboard Analitik</h2>
                <button @click="showModal('dashboardKpiInfo')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
                    Informasi
                </button>
            </div>
            <div class="flex flex-wrap items-center gap-2 p-3 bg-white rounded-lg border shadow-sm">
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
            <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative">
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
            <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative">
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
            <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative">
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
            <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative">
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
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative">
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
            <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative">
                <div class="flex items-start gap-4">
                    <div class="bg-red-100 text-red-600 p-3 rounded-lg flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="text-sm font-medium text-slate-500">Diskon</h3>
                        <p class="kpi-value text-2xl font-bold mt-1 text-red-600">{{ formatCurrency(dashboardKpis.totalDiskon) }}</p>
                    </div>
                </div>
                <button @click="showModal('kpiHelp', kpiExplanations['diskon'])" class="help-icon-button">?</button>
            </div>
            <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative">
                <div class="flex items-start gap-4">
                    <div class="bg-yellow-100 text-yellow-600 p-3 rounded-lg flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12H5m0 0l4-4m-4 4l4 4m6-10h4m0 0l-4-4m4 4l-4 4" /></svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="text-sm font-medium text-slate-500">Total HPP Terjual</h3>
                        <p class="kpi-value text-2xl font-bold mt-1 text-yellow-600">{{ formatCurrency(dashboardKpis.totalHppTerjual) }}</p>
                    </div>
                </div>
                <button @click="showModal('kpiHelp', kpiExplanations['hpp-terjual'])" class="help-icon-button">?</button>
            </div>
            <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative">
                <div class="flex items-start gap-4">
                    <div class="bg-purple-100 text-purple-600 p-3 rounded-lg flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="text-sm font-medium text-slate-500">Biaya Transaksi Marketplace</h3>
                        <p class="kpi-value text-2xl font-bold mt-1 text-purple-600">{{ formatCurrency(dashboardKpis.totalBiayaTransaksi) }}</p>
                    </div>
                </div>
                <button @click="showModal('kpiHelp', kpiExplanations['biaya-transaksi'])" class="help-icon-button">?</button>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative">
                <div class="flex items-start gap-4">
                    <div class="bg-orange-100 text-orange-600 p-3 rounded-lg flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zM7 9h14M7 13h14M7 17h14" /></svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="text-sm font-medium text-slate-500">Biaya Operasional</h3>
                        <p class="kpi-value text-2xl font-bold mt-1 text-orange-600">{{ formatCurrency(dashboardKpis.totalBiayaOperasional) }}</p>
                    </div>
                </div>
                <button @click="showModal('kpiHelp', kpiExplanations['biaya-operasional'])" class="help-icon-button">?</button>
            </div>
            <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative">
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
            <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative">
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
            <div class="kpi-card bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative">
                <div class="flex items-start gap-4">
                    <div class="bg-red-100 text-red-600 p-3 rounded-lg flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 15v-1a4 4 0 00-4-4H8m0 0l-3 3m3-3l3 3m0 0v-2a4 4 0 014-4h2" /></svg>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="text-sm font-medium text-slate-500">Total Nilai Retur</h3>
                        <p class="kpi-value text-2xl font-bold mt-1 text-red-600">{{ formatCurrency(dashboardKpis.totalNilaiRetur) }}</p>
                    </div>
                </div>
                <button @click="showModal('kpiHelp', kpiExplanations['nilai-retur'])" class="help-icon-button">?</button>
            </div>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div class="lg:col-span-3 bg-white p-6 rounded-xl border">
                <h3 class="text-lg font-semibold text-slate-800 mb-4">Laba Kotor vs Biaya Operasional</h3>
                <div class="chart-container">
                    <canvas id="profitExpenseChart"></canvas>
                </div>
            </div>
            <div class="lg:col-span-2 bg-white p-6 rounded-xl border">
                <h3 class="text-lg font-semibold text-slate-800 mb-4">Penjualan per Channel</h3>
                <div class="chart-container">
                    <canvas id="salesChannelChart"></canvas>
                </div>
            </div>
        </div>
    </div>
</div>

    <div v-if="activePage === 'transaksi'">
    <div class="flex items-center gap-4">
    <h2 class="text-3xl font-bold">Kasir (Point of Sale)</h2>
    <button @click="showModal('panduanPOS')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
        Panduan
    </button>
</div>
    <p class="text-slate-600 mb-6">Scan atau ketik produk (lalu Enter/klik), lalu scan atau ketik ID Resi (lalu Enter/klik tombol).</p>
    
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div class="lg:col-span-2 space-y-8">
            
            <div class="bg-white p-4 rounded-xl border shadow-sm sticky top-4 z-20">
                <label class="block text-sm font-medium text-slate-700 mb-1">Scan / Cari di Sini</label>
                <div class="relative flex items-center gap-2">
                    <form @submit.prevent="handlePosSubmit" class="flex-grow">
                        <input type="text" 
                               v-model="uiState.pos_scan_input"
                               @input="handlePosSearch"
                               :disabled="!uiState.activeCartChannel || !!uiState.pos_order_id"
                               :placeholder="uiState.activeCartChannel ? 'Scan/Ketik Produk atau Resi...' : 'Pilih channel dulu...'"
                               :class="{'bg-slate-100 cursor-not-allowed': !!uiState.pos_order_id}"
                               class="w-full p-4 text-lg border-2 border-slate-300 rounded-lg shadow-inner" 
                               autocomplete="off">
                        
                        <div v-if="uiState.posSearchRecommendations.length > 0" class="absolute w-full mt-1 bg-white border rounded-lg shadow-lg z-10">
                            <div v-for="p in uiState.posSearchRecommendations" :key="p.sku" @click="selectPosRecommendation(p)" class="p-3 hover:bg-slate-100 cursor-pointer border-b">
                                <p class="font-semibold">{{ p.nama }} - {{ p.varian }}</p>
                                <p class="text-xs text-slate-500">SKU: {{ p.sku }}</p>
                            </div>
                        </div>
                    </form>
                    
                    <button @click="handlePosSubmit" 
                            :disabled="activeCart.length === 0 || !uiState.pos_scan_input || !!uiState.pos_order_id" 
                            class="bg-indigo-600 text-white font-bold py-4 px-4 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400">
                        Jadikan ID Pesanan
                    </button>
                </div>
                
                <div v-if="uiState.pos_order_id" class="mt-3 p-2 bg-green-50 text-green-800 rounded-md border border-green-200">
                    <span class="text-sm font-semibold">ID Pesanan Tercatat:</span>
                    <span class="font-mono ml-2">{{ uiState.pos_order_id }}</span>
                    <span class="text-xs italic ml-2">(Keranjang terkunci. Selesaikan transaksi untuk memulai yang baru)</span>
                </div>
            </div>

            <div>
                <div class="flex flex-wrap justify-between items-center mb-4 gap-2">
    <h3 class="text-xl font-semibold">Riwayat Transaksi</h3>
    <div class="flex items-start gap-2">
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
        <select v-model="uiState.posChannelFilter" class="w-full bg-white border border-slate-300 text-sm rounded-lg p-2.5 shadow-sm capitalize">
            <option value="all">Semua Channel</option>
            <option v-for="mp in state.settings.marketplaces" :key="mp.id" :value="mp.id">{{ mp.name }}</option>
        </select>
        <button @click="exportTransactionsToExcel" class="bg-blue-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-blue-700 text-sm h-[42px]">Export</button>
    </div>
</div>
                <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto max-h-96">
                    <table class="w-full text-sm text-left text-slate-500">
                        <thead class="text-xs text-slate-700 uppercase bg-slate-100 sticky top-0">
                            <tr>
                                <th class="px-6 py-3">ID Pesanan</th>
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

        <div class="lg:col-span-1 space-y-6">
             <div class="bg-white p-4 rounded-xl border">
                <label class="block text-sm font-medium text-slate-600 mb-1">Pilih Channel Penjualan</label>
                <select v-model="uiState.activeCartChannel" @change="uiState.pos_order_id = ''; state.carts[uiState.activeCartChannel] = []" class="w-full p-2 border rounded-md">
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

<div v-if="activePage === 'bulk_process'">
    <div class="flex items-center gap-4">
        <h2 class="text-3xl font-bold text-slate-800">Smart Scan (Proses Super Cepat)</h2>
        <button @click="showModal('panduanBulkProcess')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
            Panduan
        </button>
    </div>
    <p class="text-slate-500 mt-1 mb-6">Pilih metode input yang sesuai dengan perangkat Anda.</p>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div class="lg:col-span-1 space-y-4">
            <div class="bg-white p-4 rounded-xl border">
                <label class="block text-sm font-medium text-slate-600 mb-1">1. Pilih Channel Penjualan</label>
                <select v-model="uiState.activeCartChannel" @change="uiState.bulk_order_queue = []" class="w-full p-2 border rounded-md">
                    <option :value="null" disabled>-- Pilih Channel --</option>
                    <option v-for="mp in state.settings.marketplaces" :key="mp.id" :value="mp.id">{{ mp.name }}</option>
                </select>
            </div>

            <div class="bg-white p-4 rounded-xl border sticky top-4 space-y-4">
                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-1">Input Manual (Tanpa Scanner)</label>
                    <div class="relative">
                        <input type="text" 
                               v-model="uiState.bulk_manual_input" 
                               @input="handleBulkManualSearch"
                               :disabled="!uiState.activeCartChannel" 
                               placeholder="Ketik SKU atau ID Pesanan..." 
                               class="w-full p-3 text-lg border-2 rounded-lg" 
                               autocomplete="off">
                        
                        <div v-if="uiState.bulk_recommendations.length > 0" class="absolute w-full mt-1 bg-white border rounded-lg shadow-lg z-10">
    <div v-for="p in uiState.bulk_recommendations" :key="p.sku" @click="selectBulkRecommendation(p)" class="p-3 hover:bg-slate-100 cursor-pointer border-b">
        <p class="font-semibold text-sm">{{ p.sku }}</p>
        <p class="text-xs text-slate-500 mt-1">{{ p.modelNama }} - {{ p.warna }} - {{ p.varian }}</p>
    </div>
</div>
                    </div>
                    <button @click="finalizeManualOrder" 
                            :disabled="!uiState.bulk_order_queue.find(o => o.id.startsWith('TEMP-')) || !uiState.bulk_manual_input"
                            class="mt-2 w-full bg-indigo-600 text-white font-bold py-2 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400">
                        Jadikan ID Pesanan
                    </button>
                </div>

                <hr>

                <div>
                    <label class="block text-sm font-medium text-slate-700 mb-1">KHUSUS SCANNER (Otomatis)</label>
                    <input type="text" 
                           v-model="uiState.bulk_scan_input" 
                           :disabled="!uiState.activeCartChannel" 
                           placeholder="Scan Produk -> Scan Resi" 
                           class="w-full p-3 text-lg border-2 border-dashed border-green-500 rounded-lg">
                </div>
            </div>
        </div>

        <div class="lg:col-span-2 bg-white p-6 rounded-xl border">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-semibold">Antrian Pesanan untuk Diproses ({{ uiState.bulk_order_queue.length }})</h3>
                <button @click="processBatchOrders" :disabled="uiState.bulk_order_queue.length === 0" class="bg-green-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
                    Proses Semua Antrian
                </button>
            </div>
            <div class="space-y-3 max-h-[70vh] overflow-y-auto p-2">
                 <p v-if="uiState.bulk_order_queue.length === 0" class="text-center py-16 text-slate-400">
                    Tidak ada pesanan di antrian.
                </p>
                <div v-for="(order, index) in uiState.bulk_order_queue" :key="order.id" class="p-4 border rounded-lg" :class="order.status === 'Mengantri' ? 'bg-white shadow-sm' : 'bg-yellow-50'">
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
                    <div class="mt-2 border-t pt-2">
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

    <div v-if="activePage === 'inventaris'">
    <div class="flex flex-wrap justify-between items-center mb-6">
        <div>
            <h2 class="text-3xl font-bold text-slate-800">Manajemen Inventaris</h2>
            <p class="text-slate-500 mt-1">Kelompokkan produk berdasarkan nama untuk manajemen yang lebih mudah.</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
            <button @click="showModal('addStockIn', { sku: '', qty: null, tipe: 'penambahan', alasan: 'Penyesuaian Inventaris' })" class="bg-yellow-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-yellow-600 transition-colors shadow">Penyesuaian Stok</button>
            <button @click="showModal('addProduct', { sku: '', nama: '', warna: '', varian: '', hpp: null, hargaJualDefault: null })" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors shadow">Tambah Produk Baru</button>
        </div>
    </div>

    <div class="mb-6 p-4 bg-white rounded-xl border shadow-sm">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
                <label class="block text-sm font-medium mb-1">Cari Nama Produk</label>
                <input type="text" v-model="uiState.inventorySearch" placeholder="Ketik nama produk..." class="w-full p-2 border rounded-md shadow-sm">
            </div>
            <div>
                <label class="block text-sm font-medium mb-1">Filter Status Stok</label>
                <select v-model="uiState.inventoryFilterStock" class="w-full p-2 border rounded-md shadow-sm">
                    <option value="all">Semua Status</option>
                    <option value="aman">Stok Aman</option>
                    <option value="menipis">Stok Menipis</option>
                    <option value="habis">Stok Habis</option>
                </select>
            </div>
            <div>
                <label class="block text-sm font-medium mb-1">Urutkan Berdasarkan</label>
                <select v-model="uiState.inventorySort" class="w-full p-2 border rounded-md shadow-sm">
                    <option value="nama-asc">Nama Produk (A-Z)</option>
                    <option value="nama-desc">Nama Produk (Z-A)</option>
                    <option value="stok-desc">Stok Terbanyak</option>
                    <option value="stok-asc">Stok Terendah</option>
                </select>
            </div>
        </div>
    </div>

    <div class="bg-white rounded-xl border shadow-sm overflow-x-auto">
        <table class="w-full text-sm text-left">
            <thead class="text-xs text-slate-700 uppercase bg-slate-100">
                <tr>
                    <th class="px-6 py-3 font-semibold">Nama Produk / Varian</th>
                    <th class="px-6 py-3 font-semibold">SKU</th>
                    <th class="px-6 py-3 font-semibold">Warna</th>
                    <th class="px-6 py-3 font-semibold text-center">Stok</th>
                    <th class="px-6 py-3 font-semibold text-right">Nilai Stok (HPP)</th>
                    <th class="px-6 py-3 font-semibold text-center">Aksi</th>
                </tr>
            </thead>
            <tbody>
                <tr v-if="inventoryProductGroups.length === 0">
                    <td colspan="6" class="text-center py-12 text-slate-500">Produk tidak ditemukan.</td>
                </tr>
                <template v-for="group in inventoryProductGroups" :key="group.nama">
                    <tr class="bg-slate-50 border-b border-t cursor-pointer hover:bg-slate-100" @click="uiState.activeAccordion = uiState.activeAccordion === group.nama ? null : group.nama">
                        <td class="px-6 py-4 font-bold text-slate-800">
                            <div class="flex items-center">
                                <svg class="w-4 h-4 mr-2 transition-transform" :class="{ 'rotate-90': uiState.activeAccordion === group.nama }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                                <div>
                                    {{ group.nama }}
                                    <span class="block text-xs font-normal text-slate-500">{{ group.totalVariants }} varian</span>
                                </div>
                            </div>
                        </td>
                        <td class="px-6 py-3" colspan="2"></td>
                        <td class="px-6 py-3 text-center">
                            <span class="font-bold text-base text-slate-800">{{ formatNumber(group.totalStock) }}</span>
                            <span class="text-xs"> pcs</span>
                        </td>
                        <td class="px-6 py-3 text-right font-bold text-base text-slate-800">{{ formatCurrency(group.totalNilaiStok) }}</td>
                        <td class="px-6 py-3 text-center">
                            <button @click.stop="deleteGroup(group.variants)" class="p-2 text-red-400 hover:text-red-700" title="Hapus Grup Produk & Semua Variannya">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                            </button>
                        </td>
                    </tr>

                    <template v-if="uiState.activeAccordion === group.nama">
                        <tr v-for="v in group.variants" :key="v.docId" class="border-b hover:bg-gray-50">
    <td class="px-6 py-3 pl-12 text-slate-600">{{ v.varian }}</td>
    <td class="px-6 py-3 font-mono text-xs">{{ v.sku }}</td>
    <td class="px-6 py-3 text-slate-600">{{ v.warna }}</td>
    <td class="px-6 py-3 text-center">
        <span class="stock-badge" :class="{
            'stock-safe': v.stokFisik > state.settings.minStok,
            'stock-low': v.stokFisik > 0 && v.stokFisik <= state.settings.minStok,
            'stock-empty': v.stokFisik === 0
        }">
            {{ formatNumber(v.stokFisik) }}
        </span>
    </td>
    <td class="px-6 py-3 text-right text-slate-600">{{ formatCurrency(v.stokFisik * (v.hpp || 0)) }}</td>
    <td class="px-6 py-3 text-center space-x-3 whitespace-nowrap text-xs">
        <button @click.stop="removeProductVariant(v.docId)" class="font-semibold text-red-500 hover:underline">Hapus</button>
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

    <div v-if="activePage === 'harga-hpp'">
    <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
            <h2 class="text-3xl font-bold text-slate-800">Pengaturan Harga, HPP & Komisi</h2>
            <p class="text-slate-600 mt-1">Atur komisi per-model, lalu atur HPP dan harga jual per-varian.</p>
        </div>
        <div class="flex gap-2">
            <button @click="showModal('priceCalculator')" class="bg-indigo-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-indigo-700 transition-colors shadow">Kalkulator Harga</button>
            <button @click="saveData" :disabled="isSaving" class="bg-green-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-green-700 transition-colors shadow disabled:bg-green-400 disabled:cursor-not-allowed">
                <span v-if="isSaving">Menyimpan...</span>
                <span v-else>Simpan Semua Perubahan</span>
            </button>
        </div>
    </div>

    <div class="bg-white p-6 rounded-xl border">
        <div class="mb-6 max-w-lg">
            <label class="block text-sm font-medium text-slate-700 mb-1">Pilih Model Produk</label>
            <select v-model="uiState.hargaHppSelectedProduct" class="w-full p-3 border border-slate-300 rounded-md">
                <option value="">-- Pilih --</option>
                <option v-for="namaProduk in hargaHppProductNames" :key="namaProduk" :value="namaProduk">{{ namaProduk }}</option>
            </select>
        </div>

        <!-- [BAGIAN BARU] Pengaturan Komisi per Model -->
        <div v-if="uiState.hargaHppSelectedProduct" class="mb-6 p-4 border-2 border-dashed border-indigo-300 bg-indigo-50 rounded-lg">
            <h4 class="text-lg font-semibold text-indigo-800">Pengaturan Komisi untuk Model: {{ uiState.hargaHppSelectedProduct }}</h4>
            <p class="text-sm text-slate-600 mt-1 mb-4">Komisi yang Anda atur di sini akan berlaku untuk SEMUA varian dari model ini.</p>
            <div class="space-y-3">
                <div v-for="marketplace in state.settings.marketplaces" :key="marketplace.id" class="flex items-center justify-between">
                    <label class="text-sm font-medium text-slate-700">{{ marketplace.name }}</label>
                    <div class="relative w-36">
                        <input type="text" 
                               v-model="commissionModelComputed(uiState.hargaHppSelectedProduct, marketplace.id).value"
                               class="w-full p-2 pr-7 border border-slate-300 rounded-md text-right text-sm font-semibold" 
                               placeholder="0">
                        <span class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                    </div>
                </div>
            </div>
        </div>
        <!-- [AKHIR BAGIAN BARU] -->

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
                                {{ (varian.hargaJual[marketplace.id] && varian.hpp && varian.hargaJual[marketplace.id] > 0 ? (((varian.hargaJual[marketplace.id] - varian.hpp) / varian.hargaJual[marketplace.id]) * 100) : 0).toFixed(1) }}% Margin
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
    
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h4 class="text-lg font-semibold text-slate-800 border-b pb-2 mb-3">Promosi per Akun Penjualan</h4>
            <p class="text-sm text-slate-500 mb-4">Voucher ini berlaku untuk semua produk yang dijual di akun yang bersangkutan.</p>
            <div class="space-y-4">
                <div v-for="channel in state.settings.marketplaces" :key="channel.id" class="p-4 border rounded-lg bg-slate-50">
                    <p class="font-semibold text-slate-700">{{ channel.name }}</p>
                    <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-medium text-slate-600">Voucher Ikuti Toko (%)</label>
                            <input type="text" placeholder="Contoh: 5%" v-model="voucherTokoComputed(channel).value" class="mt-1 w-full p-1.5 text-sm border-slate-300 rounded-md">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-slate-600">Voucher Semua Produk (%)</label>
                            <input type="text" placeholder="Contoh: 10%" v-model="voucherSemuaProdukComputed(channel).value" class="mt-1 w-full p-1.5 text-sm border-slate-300 rounded-md">
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h4 class="text-lg font-semibold text-slate-800 border-b pb-2 mb-3">Promosi Spesifik per Model Produk</h4>
            <p class="text-sm text-slate-500 mb-4">Atur diskon dan voucher yang hanya berlaku untuk model produk tertentu di setiap akun.</p>
            <div class="mb-4">
                <label for="promo-model-filter" class="block text-sm font-medium text-slate-700">Pilih Model Produk</label>
                <div v-if="promosiProductModels.length === 0" class="mt-1 p-3 bg-red-100 text-red-800 border-l-4 border-red-500 rounded-lg shadow-sm">
                    <p class="font-semibold mb-1">Peringatan:</p>
                    <p class="text-sm">Anda belum memiliki produk di Inventaris. Silakan tambahkan di halaman **Manajemen Inventaris** terlebih dahulu.</p>
                    <a href="#" @click.prevent="changePage('inventaris')" class="mt-2 inline-block text-red-700 font-bold hover:underline">
                        Buka Halaman Inventaris &raquo;
                    </a>
                </div>
                <select v-else v-model="uiState.promosiSelectedModel" id="promo-model-filter" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm">
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
                            <input type="text" placeholder="Contoh: 10%" v-model="voucherProdukComputed(uiState.promosiSelectedModel, channel.id).value" class="mt-1 w-full p-1.5 text-sm border-slate-300 rounded-md">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-slate-600">Diskon Minimal Belanja Bertingkat</label>
                            <div class="space-y-2 mt-1">
                                <div v-for="(tier, index) in state.promotions.perModel[uiState.promosiSelectedModel][channel.id].diskonBertingkat" :key="index" class="flex items-center gap-2">
                                    <input type="text" v-model="tieredMinComputed(tier).value" placeholder="Min. Belanja (Rp)" class="w-full p-1.5 text-sm border-slate-300 rounded-md">
                                    <input type="text" v-model="tieredDiskonComputed(tier).value" placeholder="Diskon (%)" class="w-full p-1.5 text-sm border-slate-300 rounded-md">
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
        <button @click="saveData" :disabled="isSaving" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors shadow disabled:bg-green-400">
            <span v-if="isSaving">Menyimpan...</span>
            <span v-else>Simpan Semua Pengaturan Promosi</span>
        </button>
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
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
                <label for="produksi-search" class="block text-sm font-medium text-slate-700 mb-1">Cari (ID Batch / Nama Status)</label>
                <input v-model="uiState.produksiSearch" type="text" id="produksi-search" placeholder="Ketik untuk mencari..." class="w-full p-2 border border-slate-300 rounded-md shadow-sm">
            </div>
            <div>
                <label for="produksi-filter-type" class="block text-sm font-medium text-slate-700 mb-1">Jenis Status</label>
                <select v-model="uiState.produksiFilterType" id="produksi-filter-type" class="w-full p-2 border border-slate-300 rounded-md shadow-sm">
                    <option value="all">Semua Jenis</option>
                    <option value="pemaklun">Pemaklun</option>
                    <option value="penjahit">Penjahit</option>
                </select>
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
                        <span class="text-slate-500">Total Biaya {{ batch.produksiType === 'penjahit' ? 'Jahit' : 'Maklun' }}:</span>
                        <span class="font-medium text-indigo-600">{{ formatCurrency(
                            (batch.kainBahan || []).reduce((sum, item) => sum + (item.aktualJadi || 0) * (batch.produksiType === 'penjahit' ? (item.hargaJahitPerPcs || 0) : (item.hargaMaklunPerPcs || 0)), 0)
                        ) }}</span>
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
    <div class="flex items-center justify-between gap-4 mb-6">
        <h2 class="text-3xl font-bold">Manajemen Keuangan</h2>
        <button @click="uiState.isKeuanganInfoVisible = true" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path></svg>
            Informasi
        </button>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
            <div class="p-4 border-b bg-slate-50 rounded-t-xl">
                <div class="flex justify-between items-center">
                    <h3 class="text-lg font-semibold text-slate-800">Riwayat Pengeluaran</h3>
                    <button @click="showModal('addBiaya', { tanggal: new Date().toISOString().split('T')[0], kategori: '', jumlah: null, catatan: '', paymentMethod: 'transfer', selectedBankAccountId: null, adminFee: 0 })" class="bg-rose-500 text-white font-bold py-1.5 px-3 rounded-md hover:bg-rose-600 text-sm">Tambah Baru</button>
                </div>
            </div>
            <div class="p-4 border-b">
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
                    <button @click="exportKeuangan('pengeluaran')" class="bg-white border text-slate-700 font-bold py-2.5 px-4 rounded-lg hover:bg-slate-100 text-sm h-[42px]">Export</button>
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
                                <span v-else>{{ item.catatan }}</span>
                            </td>
                            <td class="px-4 py-3 font-medium text-red-600">{{ formatCurrency(item.jumlah) }}</td>
                            <td class="px-4 py-3 text-center">
                                <button @click="deleteBiaya(item.id)" class="text-xs text-red-500 hover:underline">Hapus</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col">
            <div v-if="uiState.isPemasukanLocked" class="flex flex-col items-center justify-center h-full p-8 min-h-[400px]">
                <h3 class="text-xl font-bold text-slate-800 mb-4">Riwayat Pemasukan Terkunci</h3>
                <p class="text-sm text-slate-600 mb-4">Masukkan PIN untuk melihat data pemasukan.</p>
                <form @submit.prevent="unlockPemasukan" class="max-w-xs w-full">
                    <input 
                        type="password" 
                        v-model="uiState.pemasukanPinInput" 
                        placeholder="Masukkan PIN" 
                        class="w-full p-2 border rounded-md text-center text-lg mb-2"
                    >
                    <p v-if="uiState.pemasukanPinError" class="text-red-500 text-xs mb-2">{{ uiState.pemasukanPinError }}</p>
                    <button type="submit" class="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg hover:bg-indigo-700">
                        Buka
                    </button>
                </form>
            </div>
        
            <div v-else class="animate-fade-in">
                <div class="p-4 border-b bg-slate-50 rounded-t-xl">
                    <div class="flex justify-between items-center">
                        <h3 class="text-lg font-semibold text-slate-800">Riwayat Pemasukan</h3>
                        <div class="flex gap-2">
                             <button @click="showModal('addPemasukan', { tanggal: new Date().toISOString().split('T')[0], kategori: 'Modal Masuk', jumlah: null, catatan: '' })" class="bg-sky-500 text-white font-bold py-1.5 px-3 rounded-md hover:bg-sky-600 text-sm">Tambah Baru</button>
                            <button @click="showNestedModal('manageInflowCategories')" class="bg-slate-100 p-1 text-slate-600 rounded-md hover:bg-slate-200" title="Kelola Kategori">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.82 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.82 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.82-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.82-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="p-4 border-b">
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
                        <button @click="exportKeuangan('pemasukan')" class="bg-white border text-slate-700 font-bold py-2.5 px-4 rounded-lg hover:bg-slate-100 text-sm h-[42px]">Export</button>
                    </div>
                </div>
                <div class="relative max-h-[60vh] overflow-y-auto">
                    <table class="w-full text-sm text-left text-slate-500">
                        <thead class="text-xs text-slate-700 uppercase bg-slate-100 sticky top-0">
                            <tr><th class="px-4 py-3">Detail</th><th class="px-4 py-3">Catatan</th><th class="px-4 py-3">Jumlah</th><th class="px-4 py-3 text-center">Aksi</th></tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            <tr v-if="filteredPemasukan.length === 0"><td colspan="4" class="p-4 text-center text-slate-500">Tidak ada data.</td></tr>
                            <tr v-for="item in filteredPemasukan" :key="item.id">
                                <td class="px-4 py-3">
                                    <p class="font-semibold">{{ item.kategori }}</p>
                                    <p class="text-xs text-slate-500">{{ new Date(item.tanggal).toLocaleDateString('id-ID') }}</p>
                                </td>
                                <td class="px-4 py-3 text-sm text-slate-600">
                                    <span v-if="!item.catatan">-</span>
                                    <span v-else>{{ item.catatan }}</span>
                                </td>
                                <td class="px-4 py-3 font-medium" :class="item.kategori === 'Ambilan Pribadi' ? 'text-orange-600' : 'text-green-600'">{{ formatCurrency(item.jumlah) }}</td>
                                <td class="px-4 py-3 text-center">
                                    <button @click="deletePemasukan(item.id)" class="text-xs text-red-500 hover:underline">Hapus</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <div v-if="uiState.isKeuanganInfoVisible" class="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center p-4">
        <div class="bg-white rounded-xl shadow-xl p-6 max-w-lg w-full">
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

<div v-if="uiState.modalType === 'addPemasukan' || uiState.modalType === 'editPemasukan'" class="fixed inset-0 flex items-center justify-center p-4">
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

<div v-if="activePage === 'investasi'">
    <div v-if="uiState.isInvestasiLocked" class="flex items-center justify-center h-full p-4">
        <div class="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full text-center">
            <h3 class="text-xl font-bold text-slate-800 mb-4">Halaman Investasi Terkunci</h3>
            <p class="text-sm text-slate-600 mb-4">Masukkan PIN untuk mengakses data investor dan laporan bagi hasil.</p>
            <form @submit.prevent="unlockInvestasi">
                <input 
                    type="password" 
                    v-model="uiState.investasiPinInput" 
                    placeholder="Masukkan PIN" 
                    class="w-full p-2 border rounded-md text-center text-lg mb-2"
                >
                <p v-if="uiState.investasiPinError" class="text-red-500 text-xs mb-2">{{ uiState.investasiPinError }}</p>
                <button type="submit" class="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg hover:bg-indigo-700">
                    Buka Halaman
                </button>
            </form>
        </div>
    </div>

    <div v-else class="animate-fade-in">
        <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
            <div>
                <div class="flex items-center gap-4">
                    <h2 class="text-3xl font-bold text-slate-800">Manajemen Investor</h2>
                    <button @click="showModal('investorInfo')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
                        Informasi
                    </button>
                </div>
                <p class="text-slate-500 mt-1">Kelola data investor dan modal yang masuk.</p>
            </div>
            <button @click="showModal('addInvestor', { name: '', amount: null, profitShare: null, startDate: new Date().toISOString().split('T')[0], status: 'aktif' })" class="bg-indigo-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-indigo-700 shadow">
                + Tambah Investor Baru
            </button>
        </div>

        <div class="mb-4">
            <label class="block text-sm font-medium">Filter Status Investor</label>
            <select v-model="uiState.investorStatusFilter" class="mt-1 p-2 border rounded-md bg-white shadow-sm">
                <option value="aktif">Hanya Aktif</option>
                <option value="selesai">Hanya Selesai</option>
                <option value="semua">Tampilkan Semua</option>
            </select>
        </div>
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table class="w-full text-sm text-left text-slate-500">
                <thead class="text-xs text-slate-700 uppercase bg-slate-50">
                    <tr>
                        <th class="px-6 py-3">Nama Investor</th>
                        <th class="px-6 py-3 text-center">Status</th>
                        <th class="px-6 py-3 text-right">Modal Masuk</th>
                        <th class="px-6 py-3 text-right">Total Bagi Hasil</th>
                        <th class="px-6 py-3 text-right">ROI</th>
                        <th class="px-6 py-3 text-center">Aksi</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                    <tr v-if="investorLedger.length === 0">
                        <td colspan="6" class="p-10 text-center text-slate-500">Tidak ada data investor yang cocok dengan filter.</td>
                    </tr>
                    <tr v-for="inv in investorLedger" :key="inv.id" class="hover:bg-slate-50">
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
                            <button @click="showModal('editInvestor', inv)" class="text-xs bg-slate-100 font-bold py-1 px-2 rounded hover:bg-slate-200">Edit</button>
                            
                            <button v-if="inv.status === 'selesai'" @click="deleteInvestor(inv.id)" class="text-xs bg-red-100 text-red-700 font-bold py-1 px-2 rounded hover:bg-red-200">
                                Hapus
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="mt-8 pt-6 border-t">
            <h2 class="text-2xl font-bold text-slate-800">Laporan Bagi Hasil Investor</h2>
            <p class="text-slate-500 mt-1 mb-6">Pilih investor dan periode untuk menghitung pembagian keuntungan secara otomatis.</p>
            <div class="p-4 bg-white rounded-xl border shadow-sm mb-6">
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
                                <button type="button" @click="recordBagiHasilPayment" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700">Catat Pembayaran Bagi Hasil</button>
                            </div>
                        </div>
                        <div v-else class="text-center py-8"><p class="font-semibold text-slate-700">Tidak ada keuntungan pada periode ini.</p></div>
                    </div>
                    <div class="space-y-2 p-4 bg-slate-50 rounded-lg">
                        <h4 class="font-bold text-base mb-2">Perhitungan Laba Bersih</h4>
                        <div class="flex justify-between"><span>Omset Bersih Penjualan</span> <span class="font-medium text-green-600">{{ formatCurrency(uiState.laporanBagiHasil.result.omsetBersihPenjualan) }}</span></div>
                        <div class="flex justify-between"><span>(-) Omset Bersih dari Retur</span> <span class="font-medium text-red-600">{{ formatCurrency(uiState.laporanBagiHasil.result.omsetBersihDariRetur) }}</span></div>
                        <div class="flex justify-between font-semibold border-t pt-1"><span>= Total Omset Bersih</span> <span>{{ formatCurrency(uiState.laporanBagiHasil.result.omsetBersihFinal) }}</span></div>
                        
                        <div class="flex justify-between mt-3"><span>(-) HPP Terjual</span> <span class="font-medium text-red-600">{{ formatCurrency(uiState.laporanBagiHasil.result.totalHppTerjual) }}</span></div>
                        <div class="flex justify-between"><span>(-) HPP dari Retur</span> <span class="font-medium text-red-600">{{ formatCurrency(uiState.laporanBagiHasil.result.totalHppRetur) }}</span></div>
                        <div class="flex justify-between font-semibold border-t pt-1"><span>= Total HPP</span> <span class="text-red-600">{{ formatCurrency(uiState.laporanBagiHasil.result.hppTerjualFinal) }}</span></div>

                        <div class="flex justify-between font-bold border-t-2 pt-2 mt-2"><span>LABA KOTOR</span> <span>{{ formatCurrency(uiState.laporanBagiHasil.result.labaKotor) }}</span></div>

                        <div class="flex justify-between mt-3"><span>(-) Biaya Marketplace (Penjualan)</span> <span class="font-medium text-red-600">{{ formatCurrency(uiState.laporanBagiHasil.result.biayaMarketplacePenjualan) }}</span></div>
                        <div class="flex justify-between"><span>(-) Biaya Marketplace (dari Retur)</span> <span class="font-medium text-red-600">{{ formatCurrency(uiState.laporanBagiHasil.result.biayaMarketplaceBatal) }}</span></div>
                        <div class="flex justify-between font-semibold border-t pt-1"><span>= Total Biaya Marketplace</span> <span class="text-red-600">{{ formatCurrency(uiState.laporanBagiHasil.result.totalBiayaTransaksi) }}</span></div>
                        
                        <div class="flex justify-between mt-2">
                            <span class="flex items-center gap-2">
                                (-) Biaya Operasional
                                <button @click="showModal('biayaOperasionalHelp')" type="button" class="w-5 h-5 rounded-full flex items-center justify-center bg-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-300">?</button>
                            </span> 
                            <span class="font-medium text-red-600">{{ formatCurrency(uiState.laporanBagiHasil.result.totalBiayaOperasional) }}</span>
                        </div>
                        <div class="flex justify-between font-bold text-lg text-indigo-700 border-t-2 pt-2 mt-2">
                            <div class="flex items-center gap-2">
                                <span>LABA BERSIH</span>
                                <button @click="showModal('labaBersihHelp')" type="button" class="w-5 h-5 rounded-full flex items-center justify-center bg-indigo-100 text-indigo-600 font-bold text-sm hover:bg-indigo-200">?</button>
                            </div>
                            <span>{{ formatCurrency(uiState.laporanBagiHasil.result.labaBersih) }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="mt-8 pt-6 border-t">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-2xl font-bold text-slate-800">Riwayat Pembayaran Investor</h2>
                <button @click="exportInvestorPayments" class="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">Export</button>
            </div>
            
            <div class="mb-6 p-4 bg-white rounded-xl border shadow-sm">
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
            <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                <table class="w-full text-sm text-left text-slate-500">
                    <thead class="text-xs text-slate-700 uppercase bg-slate-50">
                        <tr>
                            <th class="px-6 py-3">Tanggal</th>
                            <th class="px-6 py-3">Investor</th>
                            <th class="px-6 py-3">Periode</th>
                            <th class="px-6 py-3 text-right">Jumlah Dibayar</th>
                            <th class="px-6 py-3">Metode</th>
                            <th class="px-6 py-3 text-center">Aksi</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        <tr v-if="filteredInvestorPayments.length === 0">
                            <td colspan="6" class="p-10 text-center text-slate-500">Belum ada riwayat pembayaran yang sesuai dengan filter.</td>
                        </tr>
                        <tr v-for="p in filteredInvestorPayments" :key="p.id" class="hover:bg-slate-50">
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


<div v-if="activePage === 'retur'">
    <div class="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div class="flex items-center gap-4">
            <h2 class="text-3xl font-bold text-slate-800">Manajemen Retur</h2>
            <button @click="showModal('panduanRetur')" class="bg-indigo-100 text-indigo-700 font-bold py-2 px-4 rounded-lg hover:bg-indigo-200 text-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
                Informasi
            </button>
        </div>
        <button @click="showModal('addRetur', { tanggal: new Date().toISOString().split('T')[0], transactionIdSearch: '', foundTransaction: null, items: [] })" class="bg-orange-500 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-orange-600 shadow transition-colors">
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
                        <button @click="deleteReturnItem(item)" class="text-xs text-red-500 hover:underline">Hapus</button>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</div>

<div v-if="activePage === 'mitra'" class="animate-fade-in">
    <div v-if="!currentUser.isPartner" class="flex items-center justify-center h-full p-4">
        <div class="bg-white rounded-xl shadow-lg p-8 max-w-sm w-full text-center">
            <h3 class="text-xl font-bold text-slate-800 mb-4">Daftar Menjadi Mitra</h3>
            <p class="text-sm text-slate-600 mb-4">Dapatkan komisi 10% setiap bulan dari pelanggan yang Anda ajak. Jadilah bagian dari tim kami!</p>
            <button @click="showModal('registerPartner')" class="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg">Daftar Sekarang</button>
        </div>
    </div>
    <div v-else>
        <h2 class="text-3xl font-bold">Dashboard Mitra</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 mb-8">
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <h4 class="text-sm font-medium text-slate-500">Kode Rujukan Anda</h4>
                <p class="text-2xl font-mono font-bold text-indigo-600 mt-2">{{ currentUser.referralCode }}</p>
            </div>
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <h4 class="text-sm font-medium text-slate-500">Komisi Belum Dibayar</h4>
                <p class="text-2xl font-bold text-green-600 mt-2">{{ formatCurrency(totalUnpaidCommission) }}</p>
            </div>
            <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <h4 class="text-sm font-medium text-slate-500">Total Komisi Terkumpul</h4>
                <p class="text-2xl font-bold text-cyan-600 mt-2">{{ formatCurrency(totalPaidCommission + totalUnpaidCommission) }}</p>
            </div>
        </div>

        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-semibold text-slate-800">Riwayat Komisi Belum Dibayar</h3>
                <button @click="showModal('cashoutCommission')" :disabled="totalUnpaidCommission === 0" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg text-sm disabled:bg-green-400">
                    Cairkan Komisi
                </button>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left text-slate-500">
                    <thead class="text-xs text-slate-700 uppercase bg-slate-50">
                        <tr>
                            <th class="px-6 py-3">Tanggal</th>
                            <th class="px-6 py-3">Pelanggan Rujukan</th>
                            <th class="px-6 py-3 text-right">Jumlah Komisi</th>
                            <th class="px-6 py-3 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        <tr v-if="unpaidCommissions.length === 0">
                            <td colspan="4" class="p-10 text-center text-slate-500">Tidak ada komisi yang belum dibayar.</td>
                        </tr>
                        <tr v-for="com in unpaidCommissions" :key="com.id" class="hover:bg-slate-50">
                            <td class="px-6 py-4">{{ new Date(com.createdAt.seconds * 1000).toLocaleDateString('id-ID') }}</td>
                            <td class="px-6 py-4">{{ com.customerEmail }}</td>
                            <td class="px-6 py-4 text-right font-bold text-green-600">{{ formatCurrency(com.amount) }}</td>
                            <td class="px-6 py-4 text-center">
                                <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 capitalize">{{ com.status }}</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<div v-if="activePage === 'pengaturan'" class="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
    
    <div class="md:col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 md:sticky md:top-4">
        <h3 class="text-xl font-bold text-slate-800 mb-4">Pengaturan</h3>
        <ul class="space-y-1 text-base font-medium">
            <li>
                <button @click="uiState.pengaturanTab = 'umum'" class="w-full text-left p-3 rounded-lg transition-colors" :class="{'bg-indigo-600 text-white': uiState.pengaturanTab === 'umum', 'hover:bg-slate-100 text-slate-700': uiState.pengaturanTab !== 'umum'}">
                    Pengaturan Umum
                </button>
            </li>
            <li>
                <button @click="uiState.pengaturanTab = 'marketplace'" class="w-full text-left p-3 rounded-lg transition-colors" :class="{'bg-indigo-600 text-white': uiState.pengaturanTab === 'marketplace', 'hover:bg-slate-100 text-slate-700': uiState.pengaturanTab !== 'marketplace'}">
                    Aturan Marketplace
                </button>
            </li>
            <li>
                <button @click="uiState.pengaturanTab = 'modelproduk'" class="w-full text-left p-3 rounded-lg transition-colors" :class="{'bg-indigo-600 text-white': uiState.pengaturanTab === 'modelproduk', 'hover:bg-slate-100 text-slate-700': uiState.pengaturanTab !== 'modelproduk'}">
                    Model Produk
                </button>
            </li>
            <li>
                <button @click="uiState.pengaturanTab = 'rekening'" class="w-full text-left p-3 rounded-lg transition-colors" :class="{'bg-indigo-600 text-white': uiState.pengaturanTab === 'rekening', 'hover:bg-slate-100 text-slate-700': uiState.pengaturanTab !== 'rekening'}">
                    Rekening Bank
                </button>
            </li>
            <li v-if="isAdmin">
                <button @click="uiState.pengaturanTab = 'admin'" class="w-full text-left p-3 rounded-lg transition-colors" :class="{'bg-indigo-600 text-white': uiState.pengaturanTab === 'admin', 'hover:bg-slate-100 text-slate-700': uiState.pengaturanTab !== 'admin'}">
                    Admin
                </button>
            </li>
        </ul>
    </div>

    <div class="md:col-span-3 space-y-6">

        <div v-if="uiState.pengaturanTab === 'umum'" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 class="text-lg font-semibold text-slate-800 mb-4">Informasi Dasar & Keamanan</h3>
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
            <div class="border-t pt-4 mt-4">
                <h4 class="font-semibold text-slate-700 mb-2">Aktifkan Kunci PIN</h4>
                <p class="text-xs text-slate-500 mb-4">Pilih bagian mana saja yang ingin Anda amankan menggunakan PIN.</p>
                <div class="space-y-3">
                    <div class="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                        <span class="font-medium text-sm text-slate-800">Kunci Halaman Dashboard</span>
                        <button @click="requestPinForToggle('dashboard')" class="w-14 h-7 rounded-full flex items-center transition-colors px-1" :class="state.settings.pinProtection?.dashboard ? 'bg-indigo-600' : 'bg-slate-300'">
                            <span class="w-5 h-5 bg-white rounded-full shadow-md transition-transform" :class="{ 'transform translate-x-7': state.settings.pinProtection?.dashboard }"></span>
                        </button>
                    </div>
                    <div class="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                        <span class="font-medium text-sm text-slate-800">Kunci Tabel Riwayat Pemasukan</span>
                        <button @click="requestPinForToggle('incomeHistory')" class="w-14 h-7 rounded-full flex items-center transition-colors px-1" :class="state.settings.pinProtection?.incomeHistory ? 'bg-indigo-600' : 'bg-slate-300'">
                            <span class="w-5 h-5 bg-white rounded-full shadow-md transition-transform" :class="{ 'transform translate-x-7': state.settings.pinProtection?.incomeHistory }"></span>
                        </button>
                    </div>
                    <div class="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                        <span class="font-medium text-sm text-slate-800">Kunci Halaman Investasi</span>
                        <button @click="requestPinForToggle('investmentPage')" class="w-14 h-7 rounded-full flex items-center transition-colors px-1" :class="state.settings.pinProtection?.investmentPage ? 'bg-indigo-600' : 'bg-slate-300'">
                            <span class="w-5 h-5 bg-white rounded-full shadow-md transition-transform" :class="{ 'transform translate-x-7': state.settings.pinProtection?.investmentPage }"></span>
                        </button>
                    </div>
                </div>
            </div>
            <div class="border-t pt-4 mt-4">
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
                <button @click="saveGeneralSettings" :disabled="isSavingSettings" class="bg-indigo-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-400">
                    <span v-if="isSavingSettings">Menyimpan...</span>
                    <span v-else>Simpan Perubahan</span>
                </button>
            </div>
        </div>

        <div v-if="uiState.pengaturanTab === 'marketplace'" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-semibold text-slate-800">Daftar Marketplace</h3>
                <button @click="addMarketplace" class="bg-green-500 text-white font-bold py-1 px-3 rounded-md hover:bg-green-600 text-sm">Tambah</button>
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
                            <th class="p-2 font-medium">KOMISI</th>
                            <th class="p-2 font-medium">LAYANAN</th>
                            <th class="p-2 font-medium">PER PESANAN</th>
                            <th class="p-2 font-medium text-right">AKSI</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200">
                        <tr v-if="filteredMarketplaces.length === 0">
                            <td colspan="6" class="p-4 text-center text-slate-500">Tidak ada marketplace yang cocok.</td>
                        </tr>
                        <tr v-for="mp in (filteredMarketplaces || [])" :key="mp.id">
                            <td class="p-3 font-semibold text-slate-700">{{ mp.name }}</td>
                            <td class="p-3">{{ mp.adm }}%</td>
                            <td class="p-3">{{ mp.komisi }}%</td>
                            <td class="p-3">{{ mp.layanan }}%</td>
                            <td class="p-3">{{ formatCurrency(mp.perPesanan) }}</td>
                            <td class="p-3 text-right space-x-4">
                                <button @click="showModal('editMarketplace', JSON.parse(JSON.stringify(mp)))" class="font-semibold text-blue-500 hover:underline">Edit</button>
                                <button @click="removeMarketplace(mp.id)" class="text-red-500 hover:text-red-700">
                                    <svg class="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="flex justify-end pt-4 border-t mt-6">
                <button @click="saveSettingsData" :disabled="isSaving" class="bg-green-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-400">
                    <span v-if="isSaving">Menyimpan...</span>
                    <span v-else>Simpan Perubahan</span>
                </button>
            </div>
        </div>
        
        <div v-if="uiState.pengaturanTab === 'modelproduk'" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-semibold text-slate-800">Daftar Model Produk</h3>
                <button @click="addModelProduk" class="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">+ Tambah Model</button>
            </div>
            <div class="mb-4">
                <input type="text" v-model="uiState.pengaturanModelProdukSearch" placeholder="Cari nama model..." class="w-full p-2 border border-slate-300 rounded-md">
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="text-left text-slate-500">
                        <tr>
                            <th class="p-2 font-medium">NAMA MODEL</th>
                            <th class="p-2 font-medium">YARD/MODEL</th>
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
                            <td class="p-3">{{ model.yardPerModel || 0 }} m</td>
                            <td class="p-3">{{ formatCurrency(model.hargaMaklun || 0) }}</td>
                            <td class="p-3">{{ formatCurrency(model.hargaJahit || 0) }}</td>
                            <td class="p-3 text-right space-x-4">
                                <button @click="showModal('editModelProduk', JSON.parse(JSON.stringify(model)))" class="font-semibold text-blue-500 hover:underline">Edit</button>
                                <button @click="removeModelProduk(model.id)" class="text-red-500 hover:text-red-700">
                                    <svg class="w-5 h-5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="flex justify-end pt-4 border-t mt-6">
                <button @click="saveSettingsData" :disabled="isSaving" class="bg-green-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-green-700 transition-colors disabled:bg-green-400">
                    <span v-if="isSaving">Menyimpan...</span>
                    <span v-else>Simpan Perubahan</span>
                </button>
            </div>
        </div>
        
        <div v-if="uiState.pengaturanTab === 'rekening'" class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-semibold text-slate-800">Daftar Rekening Bank</h3>
                <button @click="showModal('addBankAccount', { bankName: '', accountNumber: '', accountName: '' })" class="bg-green-500 text-white font-bold py-1 px-3 rounded-md hover:bg-green-600 text-sm">Tambah</button>
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
                                <button @click="showModal('editBankAccount', acc)" class="font-semibold text-blue-500 hover:underline">Edit</button>
                                <button @click="deleteBankAccount(acc.id)" class="text-red-500 hover:text-red-700 font-semibold">Hapus</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div v-if="uiState.pengaturanTab === 'admin' && isAdmin" class="space-y-6">
    <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h3 class="text-lg font-semibold text-slate-800 mb-4">Kelola Akun Mitra</h3>
        <p class="text-sm text-slate-500 mb-4">
            Pilih pengguna di bawah ini untuk menjadikannya mitra. Kode rujukan unik akan dibuat otomatis.
        </p>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead>
                    <tr class="text-left text-slate-500">
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
                        <td class="p-3 text-right">
                            <button v-if="!user.isPartner" @click="makeUserPartner(user.uid)" class="bg-indigo-600 text-white font-bold py-1 px-3 rounded-md hover:bg-indigo-700 text-xs">
                                Jadikan Mitra
                            </button>
                            <button v-else @click="showModal('viewNote', { title: 'Kode Rujukan Mitra', content: user.referralCode })" class="bg-slate-200 text-slate-800 font-bold py-1 px-3 rounded-md hover:bg-slate-300 text-xs">
                                Lihat Kode
                            </button>
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
                    <option value="all_time">Semua</option>
                    <option value="last_30_days">1 Bulan Terakhir</option>
                    <option value="this_year">1 Tahun Terakhir</option>
                </select>
            </div>
            <button @click="exportAllDataForUser(uiState.selectedUserForExport?.uid, uiState.selectedUserForExport?.email, uiState.exportFilter)" :disabled="!uiState.selectedUserForExport || uiState.isExportingUserData" class="w-full bg-blue-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed">
                <span v-if="uiState.isExportingUserData">Mengekspor Data...</span>
                <span v-else>Export Data Pelanggan</span>
            </button>
        </div>
    </div>
</div>

    </div>
</div>

<div v-if="activePage === 'panduan'">
    <div class="max-w-5xl mx-auto bg-white p-6 sm:p-8 rounded-xl border border-slate-200 shadow-sm">
        <div class="border-b pb-6 mb-8">
            <h2 class="text-4xl font-bold text-slate-800">Pusat Panduan Aplikasi</h2>
            <p class="text-slate-500 mt-2 text-lg">Panduan komprehensif untuk membantu Anda menguasai setiap fitur dan memaksimalkan potensi bisnis Anda dengan Fashion OS.</p>
        </div>

        <div class="space-y-4">
            <div v-for="panduan in panduanData" :key="panduan.title" class="border rounded-lg transition-all duration-300" :class="panduanAccordion === panduan.title ? 'bg-slate-50' : 'bg-white'">
                <div @click="panduanAccordion = panduanAccordion === panduan.title ? null : panduan.title" class="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50 rounded-lg">
                    <div class="text-3xl flex-shrink-0">{{ panduan.icon }}</div>
                    <div class="flex-1">
                        <h3 class="text-lg font-semibold text-slate-800">{{ panduan.title }}</h3>
                        <p class="text-sm text-slate-500">{{ panduan.subtitle }}</p>
                    </div>
                    <svg class="w-6 h-6 text-slate-400 flex-shrink-0 transition-transform duration-300" :class="{ 'rotate-180': panduanAccordion === panduan.title }" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>

                <div class="accordion-content" :class="{ 'open': panduanAccordion === panduan.title }">
                    <div class="panduan-content p-4 pt-0 pl-14 text-slate-600 leading-relaxed" v-html="panduan.content"></div>
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
                <p class="mb-4">
                    Data Anda adalah aset berharga, dan kami memahami hal itu. Oleh karena itu, kami merancang Fashion OS dengan privasi sebagai prioritas tertinggi. Berikut adalah komitmen kami untuk memastikan data bisnis Anda tetap aman dan sepenuhnya di bawah kendali Anda:
                </p>
                
                <ul class="space-y-4">
                    <li class="p-4 bg-slate-50 rounded-lg">
                        <h4 class="font-bold text-slate-800">1. Arsitektur Tanpa Perantara</h4>
                        <p class="mt-1 text-sm">
                            Aplikasi ini beroperasi tanpa server perantara milik kami. Saat Anda memasukkan data seperti produk, penjualan, dan laporan keuangan, informasi tersebut akan terkirim <strong>langsung dari peramban (browser) Anda ke akun Google Firebase pribadi milik Anda sendiri</strong>. Sebagai pengembang, kami tidak pernah melihat, menyimpan, atau memiliki akses terhadap data operasional Anda.
                        </p>
                    </li>
                    <li class="p-4 bg-slate-50 rounded-lg">
                        <h4 class="font-bold text-slate-800">2. Kepemilikan Data Sepenuhnya di Tangan Anda</h4>
                        <p class="mt-1 text-sm">
                            Semua informasi bisnis Anda tersimpan secara eksklusif dalam proyek Firebase yang sepenuhnya Anda kelola. Keberadaan data ini ibarat **brankas digital pribadi di dalam ekosistem Google**—hanya Anda yang memegang kuncinya.
                        </p>
                    </li>
                    <li class="p-4 bg-slate-50 rounded-lg">
                        <h4 class="font-bold text-slate-800">3. Standar Keamanan Selevel Perbankan</h4>
                        <p class="mt-1 text-sm">
                            Setiap transmisi data antara aplikasi dan database Anda dilindungi oleh enkripsi **HTTPS/TLS**. Ini adalah protokol keamanan canggih yang sama seperti yang digunakan oleh lembaga perbankan dan layanan online terkemuka di seluruh dunia untuk melindungi setiap transaksi.
                        </p>
                    </li>
                </ul>

                <p class="mt-6 text-sm text-slate-500 italic">
                    Komitmen kami adalah menyediakan alat yang andal untuk mengembangkan bisnis Anda, dengan fondasi privasi dan keamanan yang tak tergoyahkan. Anda bisa fokus pada pertumbuhan brand, sementara kami memastikan integritas data Anda.
                </p>
            </section>
            
            <section class="mt-8">
                <h3 class="text-xl font-semibold text-slate-800 mb-2">Memahami Konsep "Kontrol Penuh"</h3>
                <p class="mb-4 text-sm text-slate-600">
                    Kami menggunakan analogi sederhana: **Proyek adalah Tanah, dan Kata Sandi adalah Kunci.**
                </p>
                
                <ul class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <li class="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
                        <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-xl">🏡</div>
                        <div>
                            <h4 class="font-bold text-slate-800">Akun Google Anda adalah Tanah Digital</h4>
                            <p class="mt-1 text-sm">
                                Seluruh database (Firebase) dibuat di bawah kepemilikan akun Google Anda. Ini menegaskan bahwa Anda adalah satu-satunya pemilik sah dari infrastruktur digital tempat semua data bisnis Anda disimpan.
                            </p>
                        </div>
                    </li>
                    <li class="flex items-start gap-4 p-4 bg-slate-50 rounded-lg">
                        <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-xl">🔑</div>
                        <div>
                            <h4 class="font-bold text-slate-800">Kata Sandi Anda adalah Kunci Utama</h4>
                            <p class="mt-1 text-sm">
                                Aplikasi Fashion OS hanyalah "alat" atau "bangunan" yang beroperasi di atas tanah digital Anda. Kata sandi Akun Google Anda berfungsi sebagai kunci utama untuk mengaksesnya. Tanpa kunci ini, tidak ada yang bisa masuk, termasuk kami sebagai pengembang.
                            </p>
                        </div>
                    </li>
                </ul>
            </section>

            <section>
    <h3 class="text-xl font-semibold text-slate-800 mb-2">Informasi Aplikasi</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
        <div class="bg-slate-50 p-4 rounded-lg">
            <p class="font-semibold text-slate-600">Dikembangkan oleh</p>
            <p>Arrasyid</p>
        </div>
        <div class="bg-slate-50 p-4 rounded-lg">
            <p class="font-semibold text-slate-600">Informasi Kontak</p>
            <p>Email: <a href="mailto:fashion234oss@gmail.com" class="text-blue-600 hover:underline">fashion234oss@gmail.com</a></p>
        </div>
        <div class="bg-slate-50 p-4 rounded-lg">
            <p class="font-semibold text-slate-600">Versi Aplikasi</p>
            <p>1.0.0 (Build 20250903)</p>
            <p class="font-semibold text-slate-600 mt-2">Tanggal Rilis</p>
            <p>03 September 2025</p>
        </div>
    </div>
</section>

            <section>
                <h3 class="text-xl font-semibold text-slate-800 mb-2">Hak Cipta</h3>
                <p class="text-sm">Hak Cipta © 2025 Arrasyid. Seluruh hak cipta dilindungi undang-undang. Dilarang keras untuk mereproduksi, mendistribusikan, atau menyalin sebagian maupun seluruh konten aplikasi ini dalam bentuk apa pun tanpa izin tertulis dari pemilik hak cipta.</p>
            </section>

        </div>
    </div>
</div>
<div v-if="activePage === 'langganan'">
    <div v-if="currentUser?.userData?.subscriptionStatus === 'active' && new Date(currentUser.userData.subscriptionEndDate?.seconds * 1000) > Date.now()" class="max-w-4xl mx-auto text-center py-12 px-4">
        <div class="bg-white p-8 sm:p-12 rounded-xl shadow-lg border border-green-300 flex flex-col items-center">
            <div class="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <h2 class="text-3xl font-bold text-slate-800 mb-2">Langganan Anda Aktif! 🎉</h2>
            <p class="text-slate-600 mb-6 max-w-xl">
                Selamat, Anda memiliki akses penuh ke semua fitur premium kami.
            </p>
            <div class="bg-green-50 text-green-800 px-6 py-4 rounded-lg w-full text-center">
                <p class="text-lg font-semibold">Status Langganan: Aktif</p>
                <p v-if="currentUser?.userData?.subscriptionEndDate" class="text-sm mt-1">
                    Berakhir pada: {{ new Date(currentUser.userData.subscriptionEndDate.seconds * 1000).toLocaleString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
                </p>
            </div>
        </div>
    </div>
    
    <div v-else class="max-w-4xl mx-auto text-center py-12 px-4">
        <h2 class="text-3xl font-bold text-slate-800">Mulai Langganan Anda</h2>
        <p class="text-slate-600 mt-4 mb-8 max-w-xl mx-auto">
            Pilih paket di bawah ini untuk memulai akses ke semua fitur dan kembangkan bisnis Anda bersama Fashion OS.
        </p>
        
        <div class="max-w-xl mx-auto mb-8 p-6 rounded-xl border border-dashed border-indigo-300 bg-indigo-50 text-left">
            <h3 class="text-lg font-semibold text-indigo-700">Dapat Diskon?</h3>
            <p v-if="!currentUser?.userData?.referredBy" class="text-sm text-slate-600 mb-2">
                Masukkan kode rujukan dari mitra kami untuk mendapatkan diskon khusus.
            </p>
            <div v-if="!currentUser?.userData?.referredBy" class="flex gap-2">
                <input type="text" v-model="uiState.referralCodeInput" class="w-full p-2 border rounded-md">
                <button @click.prevent="applyReferralCode" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">Terapkan</button>
            </div>
            <p v-if="uiState.referralCodeMessage" class="mt-2 text-xs font-medium" :class="uiState.referralCodeApplied ? 'text-green-600' : 'text-red-600'">
                {{ uiState.referralCodeMessage }}
            </p>
            <p v-if="currentUser?.userData?.referredBy" class="text-sm text-green-600 font-medium">
                Selamat! Diskon rujukan sudah berlaku selamanya untuk akun Anda.
            </p>
        </div>
        
        <div class="flex flex-col md:flex-row gap-8 justify-center">
            <div @click="selectedPlan = 'bulanan'"
                class="plan-card p-8 border-2 rounded-xl shadow-lg w-full md:w-80 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                :class="{ 'border-indigo-600 plan-card-selected': selectedPlan === 'bulanan', 'border-transparent': selectedPlan !== 'bulanan' }">
                <div>
                    <h3 class="text-xl font-semibold">Paket Bulanan</h3>
                    <p v-if="uiState.referralCodeApplied || currentUser?.userData?.referredBy" class="text-lg font-bold my-2 line-through text-slate-400">
                        {{ formatCurrency(monthlyPrice) }} <span class="text-base font-normal">/bulan</span>
                    </p>
                    <p v-if="uiState.referralCodeApplied || currentUser?.userData?.referredBy" class="text-4xl font-bold text-green-600">
                        {{ formatCurrency(discountedMonthlyPrice) }} <span class="text-base font-normal">/bulan</span>
                    </p>
                    <p v-else class="text-4xl font-bold my-4">
                        {{ formatCurrency(monthlyPrice) }} <span class="text-base font-normal">/bulan</span>
                    </p>
                    <ul class="text-left space-y-2 text-slate-600 mt-4">
                        <li>✔️ Akses semua fitur</li>
                        <li>✔️ Dukungan prioritas</li>
                        <li>✔️ Update berkala</li>
                    </ul>
                </div>
                <button @click="handleSubscriptionMayar('bulanan')"
                        :disabled="isSubscribingMonthly"
                        class="mt-8 w-full bg-indigo-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed">
                    <span v-if="isSubscribingMonthly">Memproses...</span>
                    <span v-else>Pilih Paket Bulanan</span>
                </button>
            </div>

            <div @click="selectedPlan = 'tahunan'"
                class="plan-card p-8 border-2 rounded-xl shadow-lg w-full md:w-80 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                :class="{ 'border-indigo-600 plan-card-selected': selectedPlan === 'tahunan', 'border-transparent': selectedPlan !== 'tahunan' }">
                <div>
                    <h3 class="text-xl font-semibold">Paket Tahunan</h3>
                    <p v-if="uiState.referralCodeApplied || currentUser?.userData?.referredBy" class="text-lg font-bold my-2 line-through text-slate-400">
                        {{ formatCurrency(yearlyPrice) }} <span class="text-base font-normal">/tahun</span>
                    </p>
                    <p v-if="uiState.referralCodeApplied || currentUser?.userData?.referredBy" class="text-4xl font-bold text-green-600">
                        {{ formatCurrency(discountedYearlyPrice) }} <span class="text-base font-normal">/tahun</span>
                    </p>
                    <p v-else class="text-4xl font-bold my-4">
                        {{ formatCurrency(yearlyPrice) }} <span class="text-base font-normal">/tahun</span>
                    </p>
                    <ul class="text-left space-y-2 text-slate-600 mt-4">
                        <li>✔️ Akses semua fitur</li>
                        <li>✔️ Dukungan prioritas</li>
                        <li>✔️ Update berkala</li>
                        <li>💰 <span class="font-semibold">Diskon 2 bulan!</span></li>
                    </ul>
                </div>
                <button @click="handleSubscriptionMayar('tahunan')"
                        :disabled="isSubscribingYearly"
                        class="mt-8 w-full bg-slate-800 text-white font-bold py-3 px-8 rounded-lg hover:bg-slate-700 disabled:bg-slate-400 disabled:cursor-not-allowed">
                    <span v-if="isSubscribingYearly">Memproses...</span>
                    <span v-else>Pilih Paket Tahunan</span>
                </button>
            </div>
        </div>
    </div>
</div>

</div>
</main>
    </div>

    <!-- Modal System -->
     
    <div v-if="uiState.isModalVisible" class="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-start justify-center p-20">        
       
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

<div v-if="uiState.modalType === 'cashoutCommission'" class="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full">
    <h3 class="text-xl font-bold mb-4">Ajukan Pencairan Komisi</h3>
    <p class="text-sm text-slate-600">Total komisi yang belum dibayar saat ini adalah: <span class="font-bold text-green-600">{{ formatCurrency(totalUnpaidCommission) }}</span></p>
    <p class="text-sm text-slate-600">Pastikan rekening bank Anda sudah terdaftar di halaman Pengaturan.</p>

    <form @submit.prevent="cashoutCommission">
        <div class="mt-4">
            <label class="block text-sm font-medium">Jumlah yang Ingin Dicairkan</label>
            <input type="number" v-model.number="uiState.modalData.amount" :max="totalUnpaidCommission" class="mt-1 w-full p-2 border rounded-md" required>
        </div>
        <div class="flex justify-end gap-3 pt-6 border-t mt-4">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" :disabled="uiState.modalData.amount <= 0 || uiState.modalData.amount > totalUnpaidCommission" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-indigo-400">
                Ajukan Pencairan
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

<div v-if="uiState.modalType === 'investorInfo'" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full max-h-[100vh] flex flex-col">
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
        
        <!-- KODE PERBAIKAN DI SINI -->
        <div>
            <label for="product-model" class="block text-sm font-medium text-slate-700">Model Produk</label>
            <div v-if="state.settings.modelProduk.length === 0" class="mt-1 p-3 bg-red-100 text-red-800 border-l-4 border-red-500 rounded-lg shadow-sm">
                <p class="font-semibold mb-1">Peringatan:</p>
                <p class="text-sm">Anda belum memiliki data model Produk. Silakan tambahkan di halaman **Pengaturan** terlebih dahulu.</p>
                <a href="#" @click.prevent="changePage('pengaturan'); hideModal();" class="mt-2 inline-block text-red-700 font-bold hover:underline">
                    Buka Halaman Pengaturan &raquo;
                </a>
            </div>
            <select v-else v-model="uiState.modalData.modelId" id="product-model" class="mt-1 block w-full p-2 border border-slate-300 rounded-md shadow-sm" required>
                <option value="">-- Pilih Model --</option>
                <option v-for="model in state.settings.modelProduk" :key="model.id" :value="model.id">{{ model.namaModel }}</option>
            </select>
        </div>
        <!-- AKHIR KODE PERBAIKAN -->
        
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
        <button type="button" @click="submitReturForm" class="bg-indigo-600 text-white py-2 px-4 rounded-lg">Simpan Data Retur</button>
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

<div v-if="uiState.modalType === 'editModelProduk'" class="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full h-full md:max-h-[55vh] flex flex-col">
    <h3 class="text-xl font-bold mb-4">Edit Model Produk</h3>
    <form @submit.prevent="saveModelProdukEdit" class="space-y-4">
        <div>
            <label class="block text-sm font-medium text-slate-700">Nama Model</label>
            <input type="text" v-model="uiState.modalData.namaModel" class="mt-1 w-full p-2 border rounded-md">
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
        <div class="flex justify-end gap-3 pt-6 border-t">
            <button type="button" @click="hideModal" class="bg-slate-200 py-2 px-4 rounded-lg">Batal</button>
            <button type="submit" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Simpan Perubahan</button>
        </div>
    </form>
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
        <button type="submit" @click="saveMarketplaceEdit" class="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg">Simpan Perubahan</button>
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


<div v-if="uiState.modalType === 'addProduksi'" class="bg-white rounded-lg shadow-xl p-6 max-w-6xl w-full h-full md:max-h-[90vh] flex flex-col">
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
                <label class="block text-sm font-medium text-slate-700">Jenis Status</label>
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
            <h4 class="text-lg font-semibold mb-2">Detail Produksi</h4>
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
                                    <label class="block text-xs font-medium">SKU Produk</label>
                                    <select v-if="state.produk.filter(p => p.model_id === item.modelProdukId).length > 0" 
                                            v-model="item.sku" 
                                            @change="handleProductSkuChange(item)" 
                                            class="mt-1 w-full p-2 text-sm border rounded-md bg-white" required>
                                        <option value="">Pilih SKU</option>
                                        <option v-for="product in state.produk.filter(p => p.model_id === item.modelProdukId)" :key="product.sku" :value="product.sku">
                                            {{ product.sku }} - {{ product.warna }} - {{ product.varian }}
                                        </option>
                                    </select>
                                    <div v-else class="mt-1 p-2 text-sm text-red-700 bg-red-100 border border-red-300 rounded-md">
                                        <p class="mb-2">Tidak ada produk yang tersedia untuk model ini.</p>
                                        <a href="#" @click.prevent="activePage = 'inventaris'" class="font-semibold underline">Silakan tambahkan produk baru di halaman Inventaris.</a>
                                    </div>
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
                                <div class="flex justify-between font-bold text-base text-red-600 border-t pt-2 mt-2">
                                    <span>HPP/Pcs (sudah include kerugian):</span>
                                    <span>{{ formatCurrency(calculateRowSummary(item, 'new')?.hpp || 0) }}</span>
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
                <label class="block text-sm font-medium text-slate-700">Jenis Status</label>
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
            <h4 class="text-lg font-semibold mb-2">Detail Produksi</h4>
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
                                    <label class="block text-xs font-medium">SKU Produk</label>
                                    <select v-model="item.sku" @change="handleProductSkuChange(item)" class="mt-1 w-full p-2 text-sm border rounded-md bg-white" required>
                                        <option value="">Pilih SKU</option>
                                        <option v-for="product in state.produk.filter(p => p.model_id === item.modelProdukId)" :key="product.sku" :value="product.sku">
                                            {{ product.sku }} - {{ product.warna }} - {{ product.varian }}
                                        </option>
                                    </select>
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
                                <div class="flex justify-between font-bold text-base text-red-600 border-t pt-2 mt-2">
                                    <span>HPP/Pcs (sudah include kerugian):</span>
                                    <span>{{ formatCurrency(calculateRowSummary(item, 'edit')?.hpp || 0) }}</span>
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
                        <li><strong>Bahan Utama/Dominan:</strong> Data untuk bahan yang paling banyak digunakan (misalnya, kain untuk bagian badan ModelProduk) harus dimasukkan ke dalam kolom "Aktual Jadi".</li>
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
                            Pilih salah satu input ("Aktual Jadi" atau "Aktual Jadi Kombinasi") untuk setiap baris bahan. Jika Anda ingin menambah data aktual jadi / aktual jadi kombinasi , klik <strong>"+ Tambah Kain & Bahan Lain"</strong>.
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
            <label for="laporan-Status-filter" class="block text-sm font-medium text-slate-700 mb-1">Pilih Jenis Status</label>
            <select v-model="uiState.produksiFilterType" id="laporan-Status-filter" class="w-full p-2 border rounded-md bg-white shadow-sm">
                <option value="all">Semua Jenis Status</option>
                <option value="pemaklun">Pemaklun</option>
                <option value="penjahit">Penjahit</option>
            </select>
        </div>

        <div class="p-4 mb-4 bg-blue-100 border border-blue-300 rounded-lg text-center">
            <p class="text-sm font-medium text-blue-800">Total Keseluruhan Biaya {{ uiState.produksiFilterType === 'all' ? 'Jasa Produksi' : uiState.produksiFilterType === 'penjahit' ? 'Jahit' : 'Maklun' }} (Status: {{ uiState.laporanData.statusTerpilih }})</p>
            <p class="text-3xl font-bold text-blue-900">{{ formatCurrency(laporanTotalBiayaJasa) }}</p>
        </div>

        <div class="space-y-4 bg-slate-100 border rounded-md">
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
                                <span v-if="kb.isInventoried" class="text-green-600 font-bold">
                                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline-block mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>
                                    Sudah Masuk Inventaris
                                </span>
                                <button v-else @click="updateProductionInventoryStatus(batch.id, index)" class="bg-indigo-600 text-white font-bold py-1 px-3 rounded-lg hover:bg-indigo-700 text-sm">
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

        <div class="flex-shrink-0 flex justify-end gap-3 mt-4 pt-12 border-t">
            <button @click="exportGroupedProduksiToExcel()" class="bg-green-600 text-white font-bold py-2 px-4 rounded-lg">Export Laporan</button>
            <button @click="hideModal" class="bg-slate-300 py-2 px-4 rounded-lg">Tutup</button>
        </div>
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
                            <li class="flex justify-between"><span>Biaya Layanan ({{ uiState.priceCalculator.result.breakdown.layananRate }}%)</span><span>-{{ formatCurrency(uiState.priceCalculator.result.breakdown.serviceFee) }}</span></li>
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