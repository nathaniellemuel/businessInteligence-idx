# IDX Fundamental BI · 595 Emiten Bursa Efek Indonesia

Proyek analisis fundamental laporan keuangan emiten BEI tahun 2020–2023, lengkap dengan dashboard Business Intelligence interaktif berbasis HTML/CSS/JavaScript.

## Struktur Folder

```
businessInteligence-idx/
├── README.md
├── project1.rmp                        # Proses RapidMiner (ETL + ML)
│
├── data/
│   ├── raw/
│   │   └── combined_financial_data_idx.csv   # Dataset mentah gabungan
│   ├── clean/
│   │   ├── data_clean.csv              # Long format setelah cleaning
│   │   └── data_clean_pivot.csv        # Pivot per emiten × metrik × tahun
│   └── models/
│       ├── k_means.csv                 # Hasil K-Means clustering (3 cluster)
│       └── regresi_linear.csv          # Hasil regresi (data dinormalisasi)
│
├── dashboard/
│   ├── index.html                      # Layout dashboard
│   ├── styles.css                      # Tema BI gelap profesional
│   ├── app.js                          # Logika charts, filter, agregasi
│   ├── data.js                         # Auto-generated (1.7 MB)
│   └── build_data.js                   # Skrip konversi CSV → JS
│
└── docs/
    └── wordanalisis.docx               # Dokumentasi analisis
```

## Dataset

| Field | Deskripsi |
|---|---|
| Symbol | Kode saham emiten (mis. AALI, BBCA) |
| Account | Nama akun keuangan (Total Assets, Net Income, dll) |
| Type | BS = Balance Sheet, IS = Income Statement, CF = Cash Flow |
| Tahun | Nilai keuangan untuk 2020–2023 |

Total: **595 emiten × 20 metrik × 4 tahun**.

## Menjalankan Dashboard

**Cepat:** klik dua kali `dashboard/index.html`.

**Disarankan (local server):**

```cmd
:: opsi Python
python -m http.server 5500

:: opsi Node
npx serve .
```

Lalu buka `http://localhost:5500/dashboard/`.

## Halaman Dashboard

| Halaman | Isi |
|---|---|
| **Overview** | 6 KPI agregat (Revenue, Net Income, Aset, Ekuitas, NPM, ROE) dengan sparkline & YoY, tren agregat, bubble Profitabilitas vs Skala, Top 10 Revenue & NI, komposisi neraca |
| **Leaderboard** | Ranking emiten per metrik & tahun + tabel YoY |
| **Perusahaan** | Profil emiten: Income Statement, Balance Sheet, Cash Flow, 6 rasio keuangan, tabel fundamental lengkap |
| **Compare** | Bandingkan hingga 5 emiten + radar percentile populasi |
| **Rasio Keuangan** | Distribusi ROE, ROA, NPM, DER, Current Ratio, Gross Margin + Top ROE & NPM |
| **Screener** | Filter range fundamental (Revenue, NI, ROE, NPM, DER, CR) |
| **Tren Pasar** | Total absolut per tahun + YoY agregat 2021–2023 + Top growth |
| **Clustering** | K-Means 3 segmen: Sehat / Stabil / Beresiko, profil rata-rata, peta sebaran, daftar per klaster |
| **Prediksi EPS** | Forecast EPS 2024–2028 dengan regresi linier (a + bx), slope, R², top prediksi |

## Membangun Ulang Data

Jika CSV di `data/clean/` atau `data/models/` di-update:

```cmd
node dashboard/build_data.js
```

Akan menulis ulang `dashboard/data.js`.

## Metodologi

**K-Means Clustering** (RapidMiner, k=3):
Cluster terbesar (>50%) di-label *Stabil* (populasi normal pasar). Cluster lain diranking berdasarkan rata-rata fitur finansial — yang positif → *Sehat*, yang negatif → *Beresiko*.

**Regresi Linier EPS:**
Model OLS `y = a + b·x` dihitung untuk tiap emiten dari data EPS 2020–2023, kemudian di-ekstrapolasi ke 2024–2028. Slope (`b`) dan R² ditampilkan agar user tahu tingkat keandalan model. Median R² seluruh emiten = 0.679.

## Status Proyek

- [x] Pembersihan data (data cleaning)
- [x] Pivoting & feature aggregation
- [x] Feature engineering (rasio: ROE, ROA, NPM, GPM, DER, CR)
- [x] K-Means clustering (RapidMiner)
- [x] Regresi linier prediksi EPS
- [x] Dashboard BI interaktif

## Deploy ke Vercel

Dashboard ini adalah situs **statis** (HTML + CSS + JS) — tidak perlu server, tidak perlu build step.

**Sebelum deploy, pastikan `dashboard/data.js` sudah ter-generate:**

```cmd
node dashboard/build_data.js
```

File `data.js` adalah hasil konversi CSV → JSON yang dimuat oleh dashboard. Tanpa file ini, dashboard akan kosong di production.

**Cara deploy (3 opsi):**

1. **Push ke GitHub lalu import di Vercel:**
   - `git push` ke repo GitHub
   - Buka [vercel.com/new](https://vercel.com/new), pilih repo
   - Framework Preset: pilih **Other** (atau biarkan auto-detect)
   - Output Directory: kosongkan (root)
   - Klik Deploy

2. **Vercel CLI:**
   ```cmd
   npm i -g vercel
   vercel
   ```
   Ikuti prompt; pada pertanyaan output directory, jawab `./`.

3. **Drag & drop** folder ke [vercel.com/new](https://vercel.com/new).

**File `vercel.json`** sudah dikonfigurasi agar:
- URL root `/` otomatis menampilkan dashboard
- File `data.js` & assets di-cache dengan benar
- Folder `data/raw`, `data/clean`, `data/models`, `docs/` tidak ikut ter-upload (lihat `.vercelignore`)

**Catatan:** kalau update CSV, jalankan ulang `node dashboard/build_data.js`, commit `dashboard/data.js`, lalu push — Vercel akan re-deploy otomatis.
