export default async function handler(req, res) {
  // Kode ini akan langsung mencatat data yang dikirim dari frontend
  console.log('--- REQUEST BODY RECEIVED ---');
  console.log(JSON.stringify(req.body, null, 2));

  // Kode ini TIDAK menghubungi Xendit, tapi langsung mengirim balasan SUKSES
  res.status(200).json({
    message: "TEST BERHASIL, KODE TERBARU SUDAH BERJALAN.",
    data_yang_diterima: req.body
  });
}