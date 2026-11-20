from pathlib import Path
import hashlib, json

def blob_sha(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()

p = Path("src/App.vue")
raw = p.read_bytes()
assert blob_sha(raw) == "b51e6bdc1a7b188e4eaa73e1e4e02aab8a8bcc5a", "Unexpected source version"
spec = json.loads(r'''{"before":[["completeFabricStock } from './fabric-warehouse.js';","completeFabricStock, deleteFabricStocks } from './fabric-warehouse.js';"],["const fabricCompletionBusyIds = ref([]);","const fabricCompletionBusyIds = ref([]);\nconst fabricDeletionBusyIds = ref([]);"],["    if (fabricReceiptUploads[group.purchaseId]) return;","    if (isSavingFabric.value || fabricReceiptUploads[group.purchaseId]) return;"]],"handlers":"async function deleteFabricRows(rows, label) {\n    if (!currentUser.value || !isSubscriptionActive.value || isSavingFabric.value || !rows.length) return;\n    if (rows.some(row => fabricReceiptUploads[row.purchaseId || row.id])) {\n        return alert('Tunggu unggahan nota selesai sebelum menghapus kain.');\n    }\n    const userId = currentUser.value.uid;\n    const selected = rows.map(row => ({ id: row.id, purchaseId: row.purchaseId || row.id }));\n    if (!confirm(`Hapus ${label} (${selected.length} batch)? Data stok dan riwayat pembelian yang dipilih akan dihapus permanen. Pengeluaran produksi serta riwayat pemotongan yang sudah tercatat tetap tersimpan.`)) return;\n    isSavingFabric.value = true;\n    fabricDeletionBusyIds.value = selected.map(row => row.id);\n    try {\n        const result = await deleteFabricStocks({ db, doc, runTransaction, userId, rows: selected });\n        if (currentUser.value?.uid !== userId) return;\n        const removed = new Set(result.ids);\n        state.gudangKain = state.gudangKain.filter(row => !removed.has(row.id));\n        const remainingGroups = new Set(state.gudangKain.map(row => row.purchaseId || row.id));\n        expandedFabricPurchaseGroups.value = expandedFabricPurchaseGroups.value.filter(key => remainingGroups.has(key));\n        await persistFabricInventoryCache();\n        alert('Data stok kain yang dipilih berhasil dihapus.');\n    } catch (error) {\n        console.error('Gagal menghapus stok kain:', error);\n        if (currentUser.value?.uid === userId) alert(error.message || 'Stok kain belum berhasil dihapus. Coba lagi.');\n    } finally {\n        fabricDeletionBusyIds.value = [];\n        isSavingFabric.value = false;\n    }\n}\n\nasync function deleteKain(kainId) {\n    const row = state.gudangKain.find(kain => kain.id === kainId);\n    if (row) await deleteFabricRows([row], `kain ${getFabricCode(row)} · ${row.namaKain} · ${row.warna}`);\n}\n\nasync function deleteFabricPurchaseGroup(group) {\n    // Use the complete inventory, including finished colors and dates excluded\n    // by the current history filter, rather than just the visible detail rows.\n    const key = group.purchaseId || group.key;\n    const rows = state.gudangKain.filter(row => (row.purchaseId || row.id) === key);\n    await deleteFabricRows(rows, `grup nota ${group.groupCode}`);\n}\n","after":[["                                        <button v-else disabled class=\"mt-2 block w-full cursor-default rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700\">Selesai</button>","                                        <button v-else disabled class=\"mt-2 block w-full cursor-default rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700\">Selesai</button>\n                                        <button type=\"button\" @click=\"deleteFabricPurchaseGroup(group)\" :disabled=\"!isSubscriptionActive || isSavingFabric || Boolean(fabricReceiptUploads[group.purchaseId])\" class=\"mt-2 block w-full rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50\">{{ group.allRows.some(row => fabricDeletionBusyIds.includes(row.id)) ? 'Menghapus…' : 'Hapus grup' }}</button>"],["@click=\"chooseFabricReceiptForGroup(group)\" :disabled=\"!isSubscriptionActive\"","@click=\"chooseFabricReceiptForGroup(group)\" :disabled=\"!isSubscriptionActive || isSavingFabric\""],["class=\"ml-1 rounded bg-slate-100 px-2 py-1.5 font-bold hover:bg-slate-200\" :disabled=\"!isSubscriptionActive\">Edit</button>","class=\"ml-1 rounded bg-slate-100 px-2 py-1.5 font-bold hover:bg-slate-200\" :disabled=\"!isSubscriptionActive || isSavingFabric\">Edit</button>"],["<button v-if=\"!isFabricComplete(kain)\" @click=\"deleteKain(kain.id)\" class=\"ml-1 px-1 font-bold text-red-600 hover:underline\" :disabled=\"!isSubscriptionActive\">Hapus</button>","<button type=\"button\" @click=\"deleteKain(kain.id)\" class=\"ml-1 px-1 font-bold text-red-600 hover:underline disabled:opacity-50\" :disabled=\"!isSubscriptionActive || isSavingFabric || Boolean(fabricReceiptUploads[group.purchaseId])\">{{ fabricDeletionBusyIds.includes(kain.id) ? 'Menghapus…' : 'Hapus' }}</button>"]]}''')
source = raw.decode("utf-8")
def replace_once(old, new):
    global source
    assert source.count(old) == 1, "Patch context changed"
    source = source.replace(old, new, 1)

for old, new in spec["before"]:
    replace_once(old, new)
start = source.index("async function deleteKain(kainId) {")
end = source.index("function exportLaporanSemuaToExcel()", start)
source = source[:start] + spec["handlers"] + source[end:]
for old, new in spec["after"]:
    replace_once(old, new)
updated = source.encode("utf-8")
assert blob_sha(updated) == "d01e0697e32b18bf191b107bd5b7d2fd763ec3e3", "Result differs from previously tested source"
for filename, expected in {
    "src/fabric-warehouse.js": "a9146bc985fe04284b28d04aa9a69e0e39d359e7",
    "tests/fabric-stock-delete.test.cjs": "a3ea4b578d4a4f2234fb4861d30aa3bf1e108b08",
}.items():
    assert blob_sha(Path(filename).read_bytes()) == expected, "Supporting source differs from tested version"
p.write_bytes(updated)
Path(".github/workflows/fabric-delete-apply.yml").unlink()
Path("tools/fabric-delete-apply.py").unlink()
print("All 3 source hashes match the previously tested production build.")
