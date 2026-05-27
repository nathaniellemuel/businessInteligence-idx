# Analisis Data Keuangan Saham IDX (2020-2023)

Proyek ini bertujuan untuk menganalisis laporan keuangan perusahaan-perusahaan yang terdaftar di Bursa Efek Indonesia (IDX) dari tahun 2020 hingga 2023.

## 🚧 Status Proyek: Tahap Pembersihan Data
Proyek ini saat ini **masih dalam tahap progress pembersihan data (data cleaning)**. Fokus utama saat ini meliputi:
- Identifikasi dan penanganan data yang hilang (missing values).
- Standarisasi format akun keuangan antar simbol saham.
- Validasi integritas data untuk memastikan kesiapan sebelum tahap pemodelan.

## Deskripsi Dataset
Dataset utama (`combined_financial_data_idx.csv`) berisi informasi keuangan yang mencakup:
- **Symbol**: Kode saham perusahaan.
- **Account**: Nama akun laporan keuangan (misal: Total Assets, Revenue, Net Income, dll).
- **Type**: Tipe laporan (BS: Balance Sheet, IS: Income Statement, CF: Cash Flow).
- **Tahun (2020-2023)**: Nilai keuangan untuk masing-masing tahun.

## Struktur Folder
- `combined_financial_data_idx.csv`: Dataset mentah gabungan.
- `project1.rmp`: File proyek RapidMiner untuk proses ETL dan analisis.
- `wordanalisis.docx`: Dokumentasi analisis awal.

## Rencana Selanjutnya
1. Menyelesaikan proses pembersihan data.
2. Melakukan Feature Engineering (perhitungan rasio keuangan seperti ROE, DER, dll).
3. Analisis dan pemodelan menggunakan RapidMiner.
4. Visualisasi hasil temuan utama.
