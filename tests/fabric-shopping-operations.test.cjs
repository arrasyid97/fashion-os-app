const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { recordId, listOperations, settleOperations, cancelOperationsPayment } = require('../server/fabric-shopping-operations.cjs');
const Vue = require('vue'), { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc');
const helper = {};
vm.createContext(helper);
vm.runInContext(fs.readFileSync('src/fabric-shopping-operations.js', 'utf8').replace(/export /g, '') + '\nglobalThis.helpers={buildShoppingGroups,summarizeShoppingGroups,shoppingAmount,shoppingDate};', helper);
const { buildShoppingGroups, summarizeShoppingGroups } = helper.helpers;

function harness() {
    let next = 0, tail = Promise.resolve();
    const h = { rows: new Map([
        ['fabric_stock/A', { userId: 'owner', purchaseId: 'P1', namaKain: 'Sabrina', toko: '46', jumlahBeliYard: 66, sisaYard: 0, statusPemakaian: 'selesai', shoppingOperationsVersion: 1, shoppingOperationsRate: 100, tanggalBeli: new Date('2026-11-16') }],
        ['fabric_stock/B', { userId: 'owner', purchaseId: 'P1', namaKain: 'Sabrina', toko: '46', jumlahBeliYard: 61, sisaYard: 40, shoppingOperationsVersion: 1, shoppingOperationsRate: 100, tanggalBeli: new Date('2026-11-16') }],
        ['fabric_stock/C', { userId: 'owner', purchaseId: 'P2', namaKain: 'Golden Crush', toko: '46', jumlahBeliYard: 992, sisaYard: 50, shoppingOperationsVersion: 1, shoppingOperationsRate: 100, tanggalBeli: new Date('2026-11-17') }],
        ['fabric_stock/OLD', { userId: 'owner', namaKain: 'Sabrina lama', jumlahBeliYard: 50, sisaYard: 0, statusPemakaian: 'selesai', tanggalBeli: new Date('2026-11-10') }],
        ['fabric_movements/MOVE', { userId: 'owner', fabricId: 'A', yardPotong: 66 }]
    ]), fail: false, retry: false };
    const ref = path => ({ id: path.split('/').at(-1), path });
    const snapshot = path => ({ ...ref(path), ref: ref(path), exists: h.rows.has(path), data: () => structuredClone(h.rows.get(path)) });
    const matching = target => ({ docs: [...h.rows].filter(([path, row]) => path.startsWith(target.name + '/') && target.conditions.every(([field,, value]) => row[field] === value)).map(([path]) => snapshot(path)) });
    const query = (name, conditions = []) => ({ name, conditions, doc: id => ref(name + '/' + (id || 'AUTO' + ++next)), where: (...condition) => query(name, [...conditions, condition]), get: async () => matching({ name, conditions }) });
    h.db = { collection: name => query(name), runTransaction: callback => {
        const pending = tail.then(async () => {
            let writes = [];
            const transaction = { get: async target => { assert.equal(writes.length, 0, 'all reads precede writes'); return target.path ? snapshot(target.path) : matching(target); }, set: (target, data) => writes.push(['set', target.path, data]), delete: target => writes.push(['delete', target.path]) };
            if (h.retry) { await callback(transaction); writes = []; h.retry = false; }
            const result = await callback(transaction);
            if (h.fail) throw Error('Commit failed');
            for (const [action, path, data] of writes) if (action === 'delete') h.rows.delete(path); else h.rows.set(path, structuredClone(data));
            return result;
        });
        tail = pending.catch(() => {}); return pending;
    } };
    h.input = { action: 'pay', date: '2026-11-25', purchases: [{ purchaseId: 'P1', yard: 127, rate: 100 }, { purchaseId: 'P2', yard: 992, rate: 100 }] };
    h.settle = (input = h.input, userId = 'owner') => settleOperations({ db: h.db, userId, input });
    h.cancel = (financeId, userId = 'owner') => cancelOperationsPayment({ db: h.db, userId, input: { financeId } });
    h.records = () => [...h.rows].filter(([path]) => path.startsWith('fabric_shopping_operations/')).map(([path, row]) => ({ ...structuredClone(row), id: ref(path).id }));
    h.stocks = () => [...h.rows].filter(([path]) => path.startsWith('fabric_stock/')).map(([path, row]) => ({ ...structuredClone(row), id: ref(path).id }));
    h.expenses = () => [...h.rows].filter(([path]) => path.startsWith('keuangan/'));
    return h;
}

(async () => {
    const h = harness(), originalStock = JSON.stringify(h.stocks()), originalCut = JSON.stringify(h.rows.get('fabric_movements/MOVE'));
    let summary = summarizeShoppingGroups(buildShoppingGroups(h.stocks(), []));
    assert.equal(summary.unpaid.yard, 1119); assert.equal(summary.unpaid.amount, 111900); assert.equal(summary.review.yard, 50);
    h.retry = true;
    const [first, concurrent] = await Promise.all([h.settle(), h.settle()]);
    assert.equal(first.expense.jumlah, 111900); assert.equal(first.expense.tipeBiaya, 'produksi'); assert.equal(first.expense.jenis, 'pengeluaran');
    assert.equal(concurrent.alreadyPaid, true); assert.equal(h.expenses().length, 1, 'double-click, transaction retry and simultaneous callers cannot duplicate the expense');
    assert.equal(first.expense.fabricShoppingItems[0].yard, 127, 'completed and already-cut cloth still uses original purchase length');
    assert.equal(JSON.stringify(h.stocks()), originalStock); assert.equal(JSON.stringify(h.rows.get('fabric_movements/MOVE')), originalCut);
    summary = summarizeShoppingGroups(buildShoppingGroups(h.stocks(), h.records())); assert.equal(summary.paid.amount, 111900); assert.equal(summary.unpaid.yard, 0);
    h.rows.set('fabric_stock/NEW', { userId: 'owner', purchaseId: 'P3', jumlahBeliYard: 20, sisaYard: 20, shoppingOperationsVersion: 1, shoppingOperationsRate: 100, tanggalBeli: new Date('2026-11-25') });
    summary = summarizeShoppingGroups(buildShoppingGroups(h.stocks(), h.records())); assert.equal(summary.paid.yard, 1119); assert.equal(summary.unpaid.yard, 20); assert.equal(summary.unpaid.amount, 2000);
    h.rows.get('fabric_stock/A').jumlahBeliYard = 80;
    assert.equal(buildShoppingGroups(h.stocks(), h.records()).find(group => group.purchaseId === 'P1').amount, 12700, 'paid amounts and yard stay frozen after inventory edits');
    h.rows.get('fabric_stock/A').jumlahBeliYard = 66;
    const oldInput = { action: 'legacy_paid', date: '2026-11-01', purchases: [{ purchaseId: 'OLD', yard: 50, rate: 100 }] };
    await h.settle(oldInput); assert.equal(h.expenses().length, 1, 'marking previously paid costs never creates another expense');
    await h.settle({ ...oldInput, action: 'pay' }); assert.equal(h.expenses().length, 1);
    await h.settle({ ...oldInput, action: 'reopen_legacy' }); assert.equal(h.records().find(row => row.purchaseId === 'OLD').status, 'unpaid');
    await assert.rejects(h.settle({ ...h.input, action: 'reopen_legacy' }), error => error.status === 409);
    const canceled = await h.cancel(first.expense.id); assert.equal(canceled.records.length, 2); assert.equal(h.expenses().length, 0); assert(canceled.records.every(row => row.status === 'unpaid' && !row.financeRecordId));
    assert.equal((await h.cancel(first.expense.id)).alreadyDeleted, true);
    const paidAgain = await h.settle(); assert.equal(paidAgain.expense.jumlah, 111900); assert.equal(h.expenses().length, 1);
    const listed = await listOperations({ db: h.db, userId: 'owner' }); assert.equal(listed.records.length, 3);
    assert.equal((await listOperations({ db: h.db, userId: 'stranger' })).records.length, 0);
    h.rows.delete('fabric_stock/A'); h.rows.delete('fabric_stock/B');
    const archived = buildShoppingGroups(h.stocks(), h.records()).find(group => group.purchaseId === 'P1'); assert.equal(archived.archived, true); assert.equal(archived.amount, 12700);

    const fail = harness(), before = JSON.stringify([...fail.rows]); fail.fail = true;
    await assert.rejects(fail.settle(), /Commit failed/); assert.equal(JSON.stringify([...fail.rows]), before, 'failed commit cannot leave a paid marker without an expense');
    const stale = harness(); stale.rows.get('fabric_stock/B').jumlahBeliYard = 62; await assert.rejects(stale.settle(), error => error.status === 409); assert.equal(stale.expenses().length, 0);
    const foreign = harness(); await assert.rejects(foreign.settle(undefined, 'other'), error => error.status === 409); assert.equal(foreign.expenses().length, 0);
    const paid = await foreign.settle(); await assert.rejects(foreign.cancel(paid.expense.id, 'other'), error => error.status === 403); assert.equal(foreign.expenses().length, 1);
    const broken = harness(); const payment = await broken.settle(); broken.rows.get('fabric_shopping_operations/' + recordId('owner', 'P1')).financeRecordId = 'DIFFERENT'; await assert.rejects(broken.cancel(payment.expense.id), error => error.status === 409); assert.equal(broken.expenses().length, 1);
    for (const rate of [0, -100, 0.5, Infinity]) await assert.rejects(harness().settle({ action: 'pay', date: '2026-11-25', purchases: [{ purchaseId: 'P1', yard: 127, rate }] }), error => error.status === 400);
    await assert.rejects(harness().settle({ action: 'pay', date: '2026-02-30', purchases: [{ purchaseId: 'P1', yard: 127, rate: 100 }] }), error => error.status === 400);
    await assert.rejects(harness().settle({ action: 'pay', date: '2026-11-25', purchases: [{ purchaseId: '../BAD', yard: 127, rate: 100 }] }), error => error.status === 400);
    const decimal = harness(); decimal.rows.get('fabric_stock/A').jumlahBeliYard = 1.23; decimal.rows.get('fabric_stock/B').jumlahBeliYard = 2.34;
    assert.equal((await decimal.settle({ action: 'pay', date: '2026-11-25', purchases: [{ purchaseId: 'P1', yard: 3.57, rate: 100 }] })).expense.jumlah, 357);

    // Exercise the actual component setup and requests, not a mirrored UI implementation.
    const descriptor = parse(fs.readFileSync('src/components/FabricShoppingOperations.vue', 'utf8')).descriptor;
    assert.equal(compileTemplate({ id: 'shopping-test', source: descriptor.template.content }).errors.length, 0);
    const componentSource = compileScript(descriptor, { id: 'shopping-test' }).content.replace(/^import .*;\n/gm, '').replace('export default', 'globalThis.component=');
    const uiData = harness(), events = [], calls = [];
    const context = { ...Vue, ...helper.helpers, filterFabricHistory: rows => rows, onMounted() {}, window: { confirm: () => true },
        fabricShoppingRequest: async (uid, input) => { calls.push(input); return input.action === 'list' ? listOperations({ db: uiData.db, userId: uid }) : settleOperations({ db: uiData.db, userId: uid, input }); } };
    vm.createContext(context); vm.runInContext(componentSource, context);
    const props = Vue.reactive({ userId: 'owner', subscriptionActive: true, rows: uiData.stocks() });
    const ui = context.component.setup(props, { expose() {}, emit: (...args) => events.push(args) });
    await ui.load(); ui.statusFilter.value = 'unpaid'; ui.toggleAll(true); assert.equal(ui.selectedGroups.value.length, 2);
    ui.openForm('pay'); assert.equal(ui.formYard.value, 1119); assert.equal(ui.formAmount.value, 111900); assert(ui.canSubmit.value);
    await ui.save(); assert.equal(ui.summary.value.paid.amount, 111900); assert.equal(ui.form.value, null); assert.equal(events.filter(([name]) => name === 'updated').length, 1);
    await ui.save(); assert.equal(calls.filter(call => call.action === 'pay').length, 1);
    props.rows.push({ id: 'LATER', userId: 'owner', purchaseId: 'LATER', jumlahBeliYard: 33, shoppingOperationsVersion: 1, shoppingOperationsRate: 100 });
    assert.equal(ui.summary.value.unpaid.amount, 3300); assert.equal(ui.summary.value.paid.amount, 111900);

    const pendingOnly = harness(); await pendingOnly.settle({ action: 'mark_unpaid', purchases: [{ purchaseId: 'OLD', yard: 50, rate: 125 }] });
    assert.equal(pendingOnly.expenses().length, 0); assert.equal(pendingOnly.records()[0].status, 'unpaid'); assert.equal(pendingOnly.records()[0].amount, 6250);
    const mixed = harness(); await mixed.settle({ ...mixed.input, purchases: [mixed.input.purchases[0]] });
    const remaining = await mixed.settle(); assert.equal(remaining.expense.jumlah, 99200); assert.equal(mixed.expenses().length, 2, 'a partially settled selection only charges the remaining note');
    const duplicate = harness(); await assert.rejects(duplicate.settle({ ...duplicate.input, purchases: [duplicate.input.purchases[0], duplicate.input.purchases[0]] }), issue => issue.status === 400);

    const appDescriptor = parse(fs.readFileSync('src/App.vue', 'utf8')).descriptor;
    assert.equal(compileTemplate({ id: 'app-shopping-test', source: appDescriptor.template.content }).errors.length, 0);
    const appFunctions = require('@babel/parser').parse(appDescriptor.scriptSetup.content, { sourceType: 'module' }).program.body
        .filter(node => ['handleFabricShoppingUpdated', 'deleteBiaya'].includes(node.id?.name))
        .map(node => appDescriptor.scriptSetup.content.slice(node.start, node.end)).join('\n');
    const ledger = harness(), ledgerPayment = await ledger.settle(), invalidated = [], questions = [];
    const appContext = { state: { keuangan: [] }, currentUser: Vue.ref({ uid: 'owner' }), dataFetched: { finance: true },
        asFabricDate: value => new Date(value), invalidateModuleCache: name => invalidated.push(name), dashboardSummaryV2MemoryCache: { clear() {} },
        fabricShoppingRequest: (uid, input) => cancelOperationsPayment({ db: ledger.db, userId: uid, input }),
        deleteDoc: () => { throw Error('Linked payments must be canceled atomically'); }, fetchKeuanganData: async force => assert.equal(force, true),
        confirm: text => { questions.push(text); return true; }, alert() {}, console: { error() {} } };
    vm.createContext(appContext); vm.runInContext(appFunctions, appContext);
    appContext.handleFabricShoppingUpdated(ledgerPayment); appContext.handleFabricShoppingUpdated(ledgerPayment);
    assert.equal(appContext.state.keuangan.length, 1, 'the finance page sees a new payment immediately and only once');
    assert(appContext.state.keuangan[0].tanggal instanceof Date); assert(invalidated.includes('finance'));
    await appContext.deleteBiaya(ledgerPayment.expense.id);
    assert.equal(appContext.state.keuangan.length, 0); assert.equal(ledger.expenses().length, 0); assert(ledger.records().every(row => row.status === 'unpaid'));
    assert(questions[0].includes('Belum dibayar'), 'deleting the finance entry explains its payment-status consequence');
    assert(appDescriptor.scriptSetup.content.includes('shoppingOperationsVersion: 1'));
    assert(appDescriptor.scriptSetup.content.includes('shoppingOperationsRate: 100'));

    const clientCalls = [], clientInvalidations = [];
    const clientContext = { auth: { currentUser: { uid: 'owner', getIdToken: async () => 'TOKEN' } }, AbortController,
        window: { setTimeout, clearTimeout }, invalidateModuleCache: name => clientInvalidations.push(name),
        fetch: async (url, options) => { clientCalls.push({ url, options }); return { ok: true, json: async () => ({ expense: { id: 'ONE' } }) }; } };
    vm.createContext(clientContext);
    vm.runInContext(fs.readFileSync('src/fabric-shopping-api.js', 'utf8').replace(/^import .*;\n/gm, '').replace('export async function', 'async function'), clientContext);
    await clientContext.fabricShoppingRequest('owner', { action: 'pay' }); assert.equal(clientInvalidations[0], 'finance');
    assert.equal(clientCalls[0].options.headers.Authorization, 'Bearer TOKEN');
    await assert.rejects(clientContext.fabricShoppingRequest('other', { action: 'pay' }), /masuk kembali/);
    clientContext.fetch = async () => { clientContext.auth.currentUser = { uid: 'changed' }; return { ok: true, json: async () => ({ expense: {} }) }; };
    await assert.rejects(clientContext.fabricShoppingRequest('owner', { action: 'pay' }), /Sesi akun berubah/);

    const apiContext = { module: { exports: {} }, process: { env: {} }, console: { error() {} }, require: name => name === 'firebase-admin' ? { apps: [{ name: 'fabric-shopping-operations', auth: () => ({ verifyIdToken: async token => { if (token !== 'good') throw Error('bad'); return { uid: 'owner' }; } }), firestore: () => ({}) }] } : { listOperations: async args => ({ user: args.userId }), settleOperations: async args => ({ user: args.userId }), cancelOperationsPayment: async args => ({ user: args.userId }) } };
    vm.runInNewContext(fs.readFileSync('api/fabric-shopping-operations.js', 'utf8'), apiContext);
    async function request(method, token, action = 'pay') { const response = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } }; await apiContext.module.exports({ method, headers: token ? { authorization: 'Bearer ' + token } : {}, body: { action, userId: 'other' } }, response); return response; }
    assert.equal((await request('GET')).code, 405); assert.equal((await request('POST')).code, 401); assert.equal((await request('POST', 'bad')).code, 401); assert.equal((await request('POST', 'good', 'bad-action')).code, 400);
    assert.equal((await request('POST', 'good')).data.user, 'owner');
    console.log('PASS: 1,119 yard × Rp100; original purchase lengths, per-note paid/unpaid/legacy tracking; once-only bulk production expense; concurrent retries, rollback and ownership; new purchases, correction, cancellation, frozen paid totals, archived payments, real component flow and API authentication.');
})().catch(error => { console.error(error); process.exitCode = 1; });
