<template>

    <div>
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
                        <p class="text-slate-800">1.0.0 (Build 20251004)</p>
                    </div>
                </div>
            </div>

        </div>
    </div>
</div>

</template>

<style scoped>
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
</style>