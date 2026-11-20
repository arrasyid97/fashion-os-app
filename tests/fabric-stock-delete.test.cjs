const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Vue = require('vue');
const { parse, compileTemplate } = require('@vue/compiler-sfc');
const { parse: parseJS } = require('@babel/parser');
const { parse: parseDOM, compile } = require('@vue/compiler-dom');

const helperContext = {};
vm.createContext(helperContext);
vm.runInContext(fs.readFileSync('src/fabric-warehouse.js', 'utf8').replace(/export /g, '') +
    '\nglobalThis.helpers={deleteFabricStocks,isFabricComplete,asFabricDate,filterFabricHistory,summarizeFabricHistory};', helperContext);
const helpers = helperContext.helpers;
const descriptor = parse(fs.readFileSync('src/App.vue', 'utf8')).descriptor;
assert.equal(compileTemplate({ id: 'fabric-delete', source: descriptor.template.content }).errors.length, 0);
const names = new Set(['getFabricCode', 'getFabricPurchaseGroupTotals', 'deleteFabricRows', 'deleteKain', 'deleteFabricPurchaseGroup',
    'fabricHistoryRows', 'filteredGudangKainGroups', 'fabricHistorySummary']);
const actualCode = parseJS(descriptor.scriptSetup.content, { sourceType: 'module' }).program.body
    .filter(node => names.has(node.id?.name) || node.declarations?.some(item => names.has(item.id.name)))
    .map(node => descriptor.scriptSetup.content.slice(node.start, node.end)).join('\n');
const nodes = [];
function walk(node) { if (node.type === 1) nodes.push(node); for (const child of node.children || []) walk(child); }
walk(parseDOM(descriptor.template.content));
const groupAction = nodes.find(node => node.tag === 'td' && node.loc.source.includes('@click="deleteFabricPurchaseGroup(group)"'));
const rowAction = nodes.find(node => node.tag === 'td' && !node.props.some(prop => prop.name === 'colspan') && node.loc.source.includes('@click="deleteKain(kain.id)"'));
assert(groupAction && rowAction);
const renderCell = source => new Function('Vue', compile(source, { mode: 'function', prefixIdentifiers: true }).code)(Vue);
const groupRender = renderCell(groupAction.loc.source), rowRender = renderCell(rowAction.loc.source);
function findButton(node, label) {
    if (node?.type === 'button' && node.children === label) return node;
    for (const child of Array.isArray(node?.children) ? node.children : []) { const found = findButton(child, label); if (found) return found; }
}

function harness() {
    const rows = [
        { id: 'A', userId: 'owner', purchaseId: 'NOTE', statusPemakaian: 'selesai', namaKain: 'Sabrina', warna: 'Hitam', sisaYard: 0, jumlahRoll: 1, jumlahBeliYard: 66, hargaBeliPerYard: 20000, tanggalBeli: new Date('2026-11-16'), financeRecordId: 'EXPENSE' },
        { id: 'B', userId: 'owner', purchaseId: 'NOTE', statusPemakaian: 'aktif', namaKain: 'Sabrina', warna: 'Cream', sisaYard: 57, jumlahRoll: 1, jumlahBeliYard: 57, hargaBeliPerYard: 20000, tanggalBeli: new Date('2026-11-17') },
        { id: 'C', userId: 'owner', statusPemakaian: 'aktif', namaKain: 'Golden Crush', warna: 'Tanah', sisaYard: 40, jumlahRoll: 2, jumlahBeliYard: 40, hargaBeliPerYard: 25000, tanggalBeli: new Date('2026-11-17') }
    ];
    const h = { records: new Map(rows.map(row => ['fabric_stock/' + row.id, structuredClone(row)])), calls: 0, confirms: [], alerts: [], caches: [], answer: true, fail: false, retry: false };
    h.records.set('keuangan/EXPENSE', { jumlah: 1320000, source: 'fabric_completion', fabricStockIds: ['A'] });
    h.records.set('fabric_movements/MOVE', { fabricId: 'A', yardPotong: 66 });
    h.records.set('fabric_receipts/RECEIPT', { name: 'nota.pdf' });
    const doc = (_, collection, id) => ({ path: collection + '/' + id, id });
    const runTransaction = async (_, callback) => {
        h.calls++;
        if (h.gate) await h.gate;
        let writes = [];
        const tx = {
            get: async ref => { assert.equal(writes.length, 0, 'all ownership reads must finish before deletion'); return { id: ref.id, exists: () => h.records.has(ref.path), data: () => structuredClone(h.records.get(ref.path)) }; },
            delete: ref => writes.push(ref.path)
        };
        if (h.retry) { await callback(tx); writes = []; h.retry = false; }
        const result = await callback(tx);
        if (h.fail) throw Error('Commit failed');
        for (const path of writes) h.records.delete(path);
        return result;
    };
    h.direct = (selected = rows.slice(0, 2), userId = 'owner') => helpers.deleteFabricStocks({ db: {}, doc, runTransaction, userId, rows: selected });
    const ctx = { ...Vue, ...helpers, db: {}, doc, runTransaction, Date, Set, Map, console: { error() {} },
        state: Vue.reactive({ gudangKain: structuredClone(rows), keuangan: [{ id: 'EXPENSE', jumlah: 1320000 }] }),
        currentUser: Vue.ref({ uid: 'owner' }), isSubscriptionActive: Vue.ref(true), isSavingFabric: Vue.ref(false),
        fabricDeletionBusyIds: Vue.ref([]), fabricReceiptUploads: {}, expandedFabricPurchaseGroups: Vue.ref(['NOTE', 'C']),
        fabricWarehouseView: Vue.ref('history'), fabricHistoryPeriod: Vue.ref('all'), fabricHistoryStart: Vue.ref(''), fabricHistoryEnd: Vue.ref(''),
        uiState: { gudangKainSearch: '', gudangKainSort: 'tanggal-desc' },
        confirm: text => { h.confirms.push(text); return h.answer; }, alert: text => h.alerts.push(text),
        persistFabricInventoryCache: async () => h.caches.push(JSON.parse(JSON.stringify(ctx.state.gudangKain)))
    };
    vm.createContext(ctx);
    vm.runInContext(actualCode + '\nglobalThis.ui={deleteFabricRows,deleteKain,deleteFabricPurchaseGroup,filteredGudangKainGroups,fabricHistorySummary};', ctx);
    h.ctx = ctx; h.ui = ctx.ui; h.original = () => JSON.stringify([...h.records]);
    h.group = () => h.ui.filteredGudangKainGroups.value.find(group => group.key === 'NOTE');
    h.bindings = extra => Vue.proxyRefs({ ...ctx, ...h.ui, isFabricPurchaseGroupExpanded: () => false, toggleFabricPurchaseGroup() {}, completeFabricImmediately() {}, openFabricCutModal() {}, showModal() {}, fabricCompletionBusyIds: [], ...extra });
    return h;
}

(async () => {
    const cancel = harness(), beforeCancel = cancel.original(); cancel.answer = false;
    await cancel.ui.deleteFabricPurchaseGroup(cancel.group());
    assert.equal(cancel.calls, 0); assert.equal(cancel.original(), beforeCancel); assert.equal(cancel.ctx.state.gudangKain.length, 3);

    const filtered = harness(); filtered.ctx.fabricHistoryPeriod.value = 'custom'; filtered.ctx.fabricHistoryStart.value = filtered.ctx.fabricHistoryEnd.value = '2026-11-17';
    assert.equal(filtered.group().allRows.length, 1, 'history filter hides one finished color');
    const historical = JSON.stringify([...filtered.records].filter(([path]) => !path.startsWith('fabric_stock/')));
    filtered.retry = true;
    const button = findButton(groupRender(filtered.bindings({ group: filtered.group() }), []), 'Hapus grup');
    assert(button && !button.props.disabled, 'main list has a usable delete action');
    await button.props.onClick();
    assert.equal(filtered.records.has('fabric_stock/A'), false); assert.equal(filtered.records.has('fabric_stock/B'), false);
    assert.equal(filtered.records.has('fabric_stock/C'), true); assert.equal(filtered.ctx.state.gudangKain.length, 1);
    assert(filtered.confirms[0].includes('(2 batch)'), 'confirmation counts the entire group, including hidden colors');
    assert(filtered.confirms[0].includes('Pengeluaran produksi')); assert.equal(filtered.caches.length, 1); assert.equal(filtered.caches[0].length, 1);
    assert.equal(filtered.ui.fabricHistorySummary.value.rolls, 2); assert.equal(filtered.ui.fabricHistorySummary.value.yard, 40);
    assert.equal(filtered.ui.fabricHistorySummary.value.total, 1000000); assert.equal(filtered.ctx.expandedFabricPurchaseGroups.value.join(','), 'C');
    assert.equal(JSON.stringify([...filtered.records].filter(([path]) => !path.startsWith('fabric_stock/'))), historical, 'financial expenses, cuts and receipt bytes are retained');
    assert.equal(filtered.ctx.state.keuangan[0].jumlah, 1320000);

    const finished = harness(); finished.ctx.state.gudangKain[1].statusPemakaian = 'selesai';
    assert(findButton(groupRender(finished.bindings({ group: finished.group() }), []), 'Hapus grup'), 'finished groups can be deleted');
    const itemButton = findButton(rowRender(finished.bindings({ kain: finished.ctx.state.gudangKain[0], group: finished.group() }), []), 'Hapus');
    assert(itemButton && !itemButton.props.disabled, 'finished colors can also be deleted individually');
    await itemButton.props.onClick(); assert.equal(finished.ctx.state.gudangKain.length, 2); assert(finished.records.has('fabric_stock/B'));
    assert(finished.records.has('keuangan/EXPENSE'));

    const foreign = harness(), prior = foreign.original(); await assert.rejects(foreign.direct(undefined, 'other'), /bukan milik/); assert.equal(foreign.original(), prior);
    const moved = harness(); moved.records.get('fabric_stock/B').purchaseId = 'OTHER'; const movedPrior = moved.original(); await assert.rejects(moved.direct(), /berubah/); assert.equal(moved.original(), movedPrior, 'invalid second row cannot delete the first');
    const invalid = harness(); await assert.rejects(invalid.direct([{ id: 'A' }, { id: 'A' }]), /tidak valid/); await assert.rejects(invalid.direct([{ id: 'bad/path' }]), /tidak valid/);
    await assert.rejects(invalid.direct([]), /1–200/); await assert.rejects(invalid.direct(Array.from({ length: 201 }, (_, id) => ({ id: String(id) }))), /1–200/);
    const repeat = harness(); await repeat.direct(); const again = await repeat.direct(); assert.equal(again.deletedCount, 0); assert(repeat.records.has('fabric_stock/C'));
    const failed = harness(), failedBefore = failed.original(); failed.fail = true; await failed.ui.deleteFabricPurchaseGroup(failed.group());
    assert.equal(failed.original(), failedBefore); assert.equal(failed.ctx.state.gudangKain.length, 3); assert.equal(failed.caches.length, 0); assert.equal(failed.ctx.isSavingFabric.value, false);

    const upload = harness(); upload.ctx.fabricReceiptUploads.NOTE = { progress: 0 }; await upload.ui.deleteFabricPurchaseGroup(upload.group()); assert.equal(upload.calls, 0); assert.equal(upload.confirms.length, 0);
    const inactive = harness(); inactive.ctx.isSubscriptionActive.value = false; await inactive.ui.deleteKain('A'); assert.equal(inactive.calls, 0); assert.equal(inactive.confirms.length, 0);
    const busy = harness(); let release; busy.gate = new Promise(resolve => { release = resolve; });
    const pending = busy.ui.deleteFabricPurchaseGroup(busy.group()); assert.equal(busy.ctx.isSavingFabric.value, true);
    assert(findButton(groupRender(busy.bindings({ group: busy.group() }), []), 'Menghapus…').props.disabled);
    await busy.ui.deleteKain('C'); assert.equal(busy.confirms.length, 1); assert.equal(busy.calls, 1);
    release(); await pending; assert.equal(busy.ctx.isSavingFabric.value, false); assert.equal(busy.ctx.fabricDeletionBusyIds.value.length, 0);
    console.log('PASS: real group/finished-row actions; cancellation; complete deletion across filtered dates; atomic ownership checks, retries and rollback; finance/cut/receipt retention; live summaries/cache; upload, subscription and double-click guards.');
})().catch(error => { console.error(error); process.exitCode = 1; });
