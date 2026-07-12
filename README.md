# Budget App

App desktop (Windows/macOS) per il budgeting personale: import di estratti conto CSV/XLS/XLSX,
categorizzazione automatica con regole, gestione duplicati, budget annuale/mensile e proiezioni con
scenari what-if. Piano di sviluppo completo in [PIANO_SVILUPPO.md](PIANO_SVILUPPO.md).

## Stack

- **Electron 37 + TypeScript** (main process con logica dati, renderer isolato via IPC tipizzato)
- **React 18 + Radix UI + Tailwind CSS v4 + lucide-react** per la UI
- **Recharts** per i grafici (palette validata per accessibilità/CVD su tema scuro)
- **SQLite** via `node:sqlite` (incluso nel Node di Electron, nessuna dipendenza nativa da compilare)
- **SheetJS + PapaParse** per il parsing di xls/xlsx/csv
- **electron-vite** per build e dev server, **Vitest** per i test

## Comandi

```bash
npm install        # installa le dipendenze
npm run dev        # avvia l'app in sviluppo (hot reload)
npm test           # test unitari (pipeline import sul file reale in data/)
npm run typecheck  # controllo tipi
npm run build      # build di produzione in out/
npm run dist       # pacchetto installabile (richiede: npm i -D electron-builder)
```

Smoke test end-to-end del main process (import → dedup → regole → dashboard → forecast, su DB temporaneo):

```bash
npm run build
SMOKE_TEST=1 ./node_modules/electron/dist/electron.exe .
```

## Dove sono i dati

Tutti i dati restano in locale, **fuori da OneDrive** per evitare corruzioni da sync:

- Database: `%APPDATA%/budgetting-app/budget.db` (Windows) · `~/Library/Application Support/budgetting-app/budget.db` (macOS)
- File importati archiviati: `.../budgetting-app/imports/`
- Backup automatici a rotazione (ultimi 10, creati a ogni chiusura): `.../budgetting-app/backups/`

## Funzionalità principali

- **Import guidato**: rilevamento automatico di preambolo e riga di intestazione, suggerimento del
  mapping colonne → campi, profili di mapping riusabili (quello UniCredit "Elenco Movimenti" è
  precaricato). Formati numerici e date it-IT gestiti.
- **Duplicati**: rilevati al caricamento (hash esatto + match probabile per data ±1 giorno e
  descrizione simile), esclusi di default con possibilità di reincludere riga per riga — pensato per
  estratti conto con periodi sovrapposti.
- **Categorizzazione**: kit base di categorie personalizzabili su 2 livelli, regole automatiche
  (con test live e applicazione retroattiva), suggerimento di categorizzazione massiva sui movimenti
  simili, azioni bulk e tag liberi.
- **Budget**: annuale con ripartizione mensile personalizzabile, budget su macro-categorie (cluster),
  confronto con lo speso e alert di sforamento in dashboard.
- **Proiezioni**: rilevamento automatico delle ricorrenze (stipendio, abbonamenti, SEPA), proiezione
  del saldo a fine anno e scenari what-if confrontabili col caso base.
- **Report**: confronto anno su anno di entrate/uscite mensili e delle spese per categoria.
- **Export**: la vista filtrata dei movimenti si esporta in CSV o XLSX.
- **Google Drive**: import diretto degli estratti conto dal proprio Drive (OAuth 2.0 PKCE nel browser
  di sistema, scope in sola lettura, token cifrati con `safeStorage`). Richiede un Client ID Google
  "Applicazione desktop" configurabile nelle Impostazioni.

## Struttura

```
src/main/        # Electron main: db, seed, importer/ (core puro + service), rules, stats, forecast, ipc
src/preload/     # bridge IPC tipizzato (window.budgetApi)
src/renderer/    # React: pages/ (Dashboard, Transactions, Budget, Forecast, CategoriesRules, Settings, ImportWizard)
src/shared/      # tipi e contratto IPC condivisi
tests/           # vitest sulla pipeline di import (usa data/Elenco_Movimenti.xls)
data/            # dataset di test
```
