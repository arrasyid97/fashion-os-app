import { auth } from './firebase.js';
import { invalidateModuleCache } from './app-read-cache.js';

export async function fabricShoppingRequest(userId, input) {
    const user = auth.currentUser;
    if (!user || user.uid !== userId) throw new Error('Silakan masuk kembali sebelum mencatat operasional.');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60000);
    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/fabric-shopping-operations', {
            method: 'POST', cache: 'no-store', signal: controller.signal,
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(input)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.message || 'Status operasional belum dapat dimuat.');
        if (auth.currentUser?.uid !== userId) throw new Error('Sesi akun berubah. Buka kembali Gudang Kain.');
        if (result.expense || result.deletedExpenseId) invalidateModuleCache('finance');
        return result;
    } catch (error) {
        if (error.name === 'AbortError') throw new Error('Koneksi melewati batas waktu. Perbarui status sebelum mencoba lagi; pembayaran yang sudah tercatat tidak dibuat dua kali.');
        throw error;
    } finally {
        window.clearTimeout(timeout);
    }
}
