# IDX Fundamental BI Dashboard

Dashboard interaktif untuk analisis fundamental 595 emiten BEI (2020–2023).

## Cara Menjalankan

**Cara cepat:** klik dua kali `index.html` (membuka di browser default).

**Disarankan (agar font & cache berjalan optimal):** jalankan local server.

```cmd
:: opsi 1 — Python (jika terpasang)
python -m http.server 5500

:: opsi 2 — Node.js
npx serve .
```

Lalu buka `http://localhost:5500`.

## Halaman

- **Overview** — KPI agregat (Revenue, Net Income, Aset, Ekuitas, NPM, ROE) + spark line, tren agregat IDX, bubble chart skala vs profitabilitas, top 10 emiten, komposisi neraca & struktur modal.
- **Leaderboard** — Ranking emiten per metrik & tahun, dengan Year-over-Year.
- **Perusahaan** — Profil emiten: Income Statement, Balance Sheet, Cash Flow, rasio keuangan & tabel fundamental lengkap.
- **Compare** — Bandingkan hingga 5 emiten + radar percentile fundamental.
- **Rasio Keuangan** — Distribusi (histogram) ROE, ROA, NPM, DER, Current Ratio, Gross Margin + Top ROE & Top NPM.
- **Screener** — Saring emiten berdasarkan range Revenue, NI, ROE, NPM, DER, CR.
- **Tren Pasar** — Pertumbuhan YoY agregat + Top growth.

## Mengupdate Data

```cmd
node build_data.js
```

Akan membaca `data_clean_pivot.csv` dan menulis ulang `data.js`.

## Struktur

| File | Fungsi |
| --- | --- |
| `index.html` | Layout & sidebar navigasi |
| `styles.css` | Tema gelap profesional, responsif |
| `app.js` | Semua logika dashboard, chart, filter, agregasi, rasio |
| `data.js` | Data hasil konversi CSV (1.7 MB, auto-generated) |
| `build_data.js` | Skrip konversi CSV → JS |
