# Google Sheets untuk alur pesanan Fashion OS

File `FashionOS.gs` menyiapkan tab scan, menampung ekspor marketplace, lalu mencocokkan ID yang dipindai dengan baris yang berstatus terkirim. Fashion OS membaca hasil pada tab `SIAP_IMPORT`.

## Penyiapan satu kali

1. Buat atau buka Google Sheets yang akan dipakai untuk pesanan.
2. Buka **Ekstensi → Apps Script**.
3. Hapus kode contoh, lalu salin seluruh isi file `FashionOS.gs` dari repositori ini ke editor Apps Script.
4. Simpan. Pilih fungsi `setupFashionOsSheets`, tekan **Run/Jalankan**, lalu setujui izin Google Sheets yang diminta.
5. Kembali ke spreadsheet dan muat ulang. Menu **Fashion OS** akan muncul.

## Setiap hari

1. Scan kode paket/resi ke kolom A mulai baris 2 di `SCAN_SHOPEE` atau `SCAN_TIKTOK`. Scan ID pesanan juga didukung bila ekspor mempunyai kolom ID pesanan yang sama.
2. Setelah paket benar-benar tercatat terkirim, salin ekspor pesanan marketplace beserta baris judul kolom ke `DATA_SHOPEE` atau `DATA_TIKTOK`, mulai dari A1.
3. Pilih **Fashion OS → Cocokkan scan dengan ekspor terkirim**.
4. Periksa `HASIL_CEK`. Paket yang belum muncul atau belum berstatus terkirim tidak masuk ke `SIAP_IMPORT`.
5. Unduh spreadsheet sebagai Microsoft Excel. Fashion OS otomatis memilih tab `SIAP_IMPORT` jika ada, lalu memvalidasi channel, status, SKU, jumlah, tanggal, dan HPP.
6. Setelah impor pesanan berhasil dan laporan keuangan marketplace tersedia, isi atau salin satu baris per paket ke `SIAP_PENGHASILAN`. Headernya: Channel, ID Pesanan, ID Paket, No Resi, Penghasilan Bersih, Status Pencairan, Tanggal Pencairan. Impor tab itu pada bagian **Cocokkan Penghasilan Marketplace** di Fashion OS.

## Penting

- Ekspor marketplace harus punya kolom status, SKU penjual, jumlah, dan tanggal pengiriman agar hasil bisa divalidasi.
- Apps Script mengenali sejumlah nama header umum Indonesia dan Inggris. Jika kolom ekspor tidak dikenali, `HASIL_CEK` menampilkan masalahnya; jangan mengimpor data yang belum cocok.
- Bila satu pesanan dibagi beberapa paket, pastikan ekspor berisi ID Paket atau No Resi untuk setiap paket.
- Impor pesanan mengurangi stok hanya setelah data terkirim diimpor. Jika stok master kurang, Fashion OS meminta konfirmasi dan menampilkan produk yang akan menjadi stok minus.
- Data scan atau pesanan yang belum terkirim tidak membuat transaksi penjualan.
- Impor penghasilan memperbarui transaksi yang cocok dan aman diulang; impor tidak menambah penghasilan dua kali.
