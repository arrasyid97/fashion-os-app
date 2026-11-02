/**
 * Fashion OS - Google Sheets helper
 * Scan package codes, match them against shipped marketplace exports,
 * and create the standardized SIAP_IMPORT tab used by Fashion OS.
 */
const FASHION_OS_SHEETS = {
  scans: {
    Shopee: 'SCAN_SHOPEE',
    'TikTok Shop': 'SCAN_TIKTOK'
  },
  exports: {
    Shopee: 'DATA_SHOPEE',
    'TikTok Shop': 'DATA_TIKTOK'
  },
  importSheet: 'SIAP_IMPORT',
  resultSheet: 'HASIL_CEK',
  incomeSheet: 'SIAP_PENGHASILAN'
};

const FASHION_OS_IMPORT_HEADERS = [
  'Channel',
  'ID Pesanan',
  'ID Paket',
  'No Resi',
  'Tanggal Terkirim',
  'SKU',
  'Qty',
  'Status'
];

const FASHION_OS_INCOME_HEADERS = [
  'Channel',
  'ID Pesanan',
  'ID Paket',
  'No Resi',
  'Penghasilan Bersih',
  'Status Pencairan',
  'Tanggal Pencairan'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Fashion OS')
    .addItem('Siapkan tab Fashion OS', 'setupFashionOsSheets')
    .addSeparator()
    .addItem('Cocokkan scan dengan ekspor terkirim', 'matchScansToShippedExports')
    .addToUi();
}

function setupFashionOsSheets() {
  const ss = SpreadsheetApp.getActive();
  ensureSheet_(ss, FASHION_OS_SHEETS.scans.Shopee, ['ID Scan']);
  ensureSheet_(ss, FASHION_OS_SHEETS.scans['TikTok Shop'], ['ID Scan']);
  ensureSheet_(ss, FASHION_OS_SHEETS.exports.Shopee, []);
  ensureSheet_(ss, FASHION_OS_SHEETS.exports['TikTok Shop'], []);
  ensureSheet_(ss, FASHION_OS_SHEETS.importSheet, FASHION_OS_IMPORT_HEADERS);
  ensureSheet_(ss, FASHION_OS_SHEETS.resultSheet, ['Channel', 'ID Scan', 'Hasil', 'Jumlah baris']);
  ensureSheet_(ss, FASHION_OS_SHEETS.incomeSheet, FASHION_OS_INCOME_HEADERS);
  SpreadsheetApp.getUi().alert(
    'Tab Fashion OS siap. Scan ID ke SCAN_SHOPEE atau SCAN_TIKTOK, tempel ekspor marketplace pada DATA_SHOPEE atau DATA_TIKTOK, lalu pilih menu Fashion OS > Cocokkan scan dengan ekspor terkirim.'
  );
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (headers.length && sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#e0e7ff');
  }
  return sheet;
}

function normalizeFashionOsText_(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function headerIndex_(headers, aliases) {
  const accepted = aliases.map(normalizeFashionOsText_);
  return headers.findIndex(header => accepted.indexOf(normalizeFashionOsText_(header)) >= 0);
}

function firstValue_(row, index) {
  return index >= 0 ? row[index] : '';
}

function parseShippedStatus_(value) {
  const status = normalizeFashionOsText_(value);
  return [
    'dikirim',
    'sudahdikirim',
    'pesanandikirim',
    'terkirim',
    'sedangdikirim',
    'shipped',
    'delivered',
    'selesai',
    'completed',
    'pesananselesai'
  ].indexOf(status) >= 0;
}

function dateForImport_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  const dmy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? '' : parsed;
}

function matchScansToShippedExports() {
  const ss = SpreadsheetApp.getActive();
  const output = [FASHION_OS_IMPORT_HEADERS];
  const results = [['Channel', 'ID Scan', 'Hasil', 'Jumlah baris']];
  const emitted = new Map();

  Object.keys(FASHION_OS_SHEETS.scans).forEach(channel => {
    const scanSheet = ss.getSheetByName(FASHION_OS_SHEETS.scans[channel]);
    const dataSheet = ss.getSheetByName(FASHION_OS_SHEETS.exports[channel]);
    if (!scanSheet || !dataSheet) {
      results.push([channel, '', 'Tab scan atau tab ekspor belum tersedia. Jalankan Siapkan tab Fashion OS.', 0]);
      return;
    }

    const scanValues = scanSheet.getLastRow() > 1
      ? scanSheet.getRange(2, 1, scanSheet.getLastRow() - 1, 1).getDisplayValues().flat()
      : [];
    const scanIds = Array.from(new Set(scanValues.map(v => String(v).trim()).filter(Boolean)));
    const table = dataSheet.getDataRange().getValues();

    if (table.length < 2) {
      scanIds.forEach(scanId => results.push([channel, scanId, 'Ekspor belum ditempel atau belum berisi data.', 0]));
      return;
    }

    const headers = table[0];
    const rows = table.slice(1);
    const columns = {
      order: headerIndex_(headers, ['ID Pesanan', 'ID Pesanan Marketplace', 'Order ID', 'Order SN', 'Nomor Pesanan', 'No Pesanan']),
      package: headerIndex_(headers, ['ID Paket', 'Package ID', 'Package SN', 'Shipment ID', 'ID Pengiriman', 'Nomor Paket']),
      tracking: headerIndex_(headers, ['No Resi', 'Nomor Resi', 'Tracking Number', 'Tracking No', 'AWB', 'Airway Bill']),
      date: headerIndex_(headers, ['Tanggal Terkirim', 'Tanggal Dikirim', 'Tanggal Pengiriman', 'Waktu Pengiriman', 'Shipped At', 'Shipped Date', 'Ship Date']),
      sku: headerIndex_(headers, ['SKU', 'SKU Penjual', 'Seller SKU', 'Product SKU', 'Kode SKU']),
      qty: headerIndex_(headers, ['Qty', 'Quantity', 'Jumlah', 'Kuantitas', 'Jumlah Produk']),
      status: headerIndex_(headers, ['Status', 'Status Pesanan', 'Status Pengiriman', 'Shipping Status', 'Shipment Status', 'Order Status'])
    };

    const required = ['order', 'sku', 'qty', 'status'];
    const missing = required.filter(name => columns[name] < 0);
    if (missing.length) {
      results.push([channel, '', 'Header wajib tidak dikenali: ' + missing.join(', ') + '. Periksa baris pertama DATA_' + (channel === 'Shopee' ? 'SHOPEE' : 'TIKTOK') + '.', 0]);
      return;
    }

    const shippedRows = [];
    const unshippedKeys = new Set();
    rows.forEach(row => {
      const orderId = String(firstValue_(row, columns.order) || '').trim();
      const packageId = String(firstValue_(row, columns.package) || '').trim();
      const tracking = String(firstValue_(row, columns.tracking) || '').trim();
      const keyValues = [orderId, packageId, tracking].map(normalizeFashionOsText_).filter(Boolean);
      if (!orderId) return;
      const isShipped = parseShippedStatus_(firstValue_(row, columns.status));
      if (!isShipped) {
        keyValues.forEach(key => unshippedKeys.add(key));
        return;
      }
      shippedRows.push({ row, orderId, packageId, tracking, keys: keyValues });
    });

    scanIds.forEach(scanId => {
      const scanKey = normalizeFashionOsText_(scanId);
      const matched = shippedRows.filter(item => item.keys.indexOf(scanKey) >= 0);
      if (!matched.length) {
        const status = unshippedKeys.has(scanKey)
          ? 'Belum terkirim, masih diproses, atau dibatalkan.'
          : 'Belum ditemukan pada ekspor terkirim.';
        results.push([channel, scanId, status, 0]);
        return;
      }

      let added = 0;
      matched.forEach(item => {
        const sku = String(firstValue_(item.row, columns.sku) || '').trim();
        const qty = Number(String(firstValue_(item.row, columns.qty) || '').replace(',', '.'));
        const shippedAt = dateForImport_(firstValue_(item.row, columns.date));
        if (!sku || !Number.isInteger(qty) || qty <= 0) {
          results.push([channel, scanId, 'Baris ekspor cocok tetapi SKU atau Qty tidak valid; periksa DATA_' + (channel === 'Shopee' ? 'SHOPEE' : 'TIKTOK') + '.', 0]);
          return;
        }

        const packageKey = item.packageId || item.tracking || item.orderId;
        const lineKey = [channel, item.orderId, packageKey, sku].map(normalizeFashionOsText_).join('|');
        if (emitted.has(lineKey)) {
          const index = emitted.get(lineKey);
          output[index][6] += qty;
          return;
        }
        output.push([
          channel,
          item.orderId,
          item.packageId,
          item.tracking,
          shippedAt,
          sku,
          qty,
          'TERKIRIM'
        ]);
        emitted.set(lineKey, output.length - 1);
        added += 1;
      });
      results.push([channel, scanId, 'Cocok dengan ekspor terkirim.', added]);
    });
  });

  writeOutput_(ss, FASHION_OS_SHEETS.importSheet, output);
  writeOutput_(ss, FASHION_OS_SHEETS.resultSheet, results);
  SpreadsheetApp.getUi().alert(
    'Pencocokan selesai. ' + (output.length - 1) + ' baris produk siap di SIAP_IMPORT. Periksa HASIL_CEK untuk scan yang belum terkirim atau belum ditemukan.'
  );
}

function writeOutput_(ss, name, values) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clearContents();
  if (values.length) {
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, values[0].length)
      .setFontWeight('bold')
      .setBackground('#e0e7ff');
    sheet.autoResizeColumns(1, values[0].length);
  }
}
