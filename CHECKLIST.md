# Checklist di avanzamento — Budget App

> Riepilogo di quanto previsto in [PIANO_SVILUPPO.md](PIANO_SVILUPPO.md) rispetto a quanto realizzato.
> Aggiornata al 11/07/2026. Legenda: [x] fatto · [~] parziale · [ ] da fare.

Stato sintetico: **le Fasi 0–5 sono sostanzialmente complete**; restano rifiniture della
tabella movimenti, alcune feature avanzate (split, viste salvate, ricerca globale, obiettivi) e
tutta la Fase 6 (packaging firmato, CI, e2e).

---

## Fase 0 — Fondamenta

- [x] Scaffold electron-vite + React 18 + TypeScript strict
- [x] IPC tipizzato con contract condiviso (`src/shared/types.ts`, preload bridge)
- [x] Storage SQLite locale in `userData` (fuori da OneDrive), WAL mode, indici
- [x] Architettura sicura Electron (`contextIsolation`, `nodeIntegration:false`, logica nel main)
- [~] **Deviazione stack**: usato `node:sqlite` (nativo in Electron) invece di better-sqlite3 + Drizzle → nessuna dipendenza nativa da compilare, ma **niente sistema di migrazioni versionato** (schema con `CREATE TABLE IF NOT EXISTS`)
- [ ] CI (lint, typecheck, test) su repo
- [ ] Packaging Win/Mac installabile verificato end-to-end ("hello world" firmato)

## Fase 1 — Import & dati

- [x] Parser CSV/XLS/XLSX con formati it-IT (date dd/mm/yyyy + serial Excel, importi `1.234,56`)
- [x] Rilevamento preambolo e riga header euristico
- [x] Wizard mapping colonne con suggerimento automatico campo→colonna
- [x] Profili di mapping salvati e riusabili (profilo UniCredit "Elenco Movimenti" precaricato)
- [x] Dedup esatto (hash) + probabile (data ±1g, importo, similarità descrizione)
- [x] UI di staging con anteprima, stato riga (nuova/duplicato/errore), reinclusione riga per riga
- [x] Archivio file importato (copia + hash SHA-256) e report import
- [x] Tabella Movimenti base: filtri, ordinamento multi-colonna, ricerca, paginazione
- [x] Coppia colonne Dare/Avere gestita nel mapping (`amountIn`/`amountOut`)

## Fase 2 — Categorizzazione

- [x] Seed categorie a 2 livelli + regole precompilate formato UniCredit
- [x] Motore regole (contains/exact/regex, priorità, applicazione retroattiva)
- [x] Normalizzazione descrizione ed estrazione esercente
- [x] Suggerimento per similarità (movimenti simili) e azioni bulk (categoria/tag)
- [x] Gestione categorie: CRUD, gerarchia 2 livelli, colori, merge con riassegnazione, protezione categorie di sistema
- [x] Tag liberi N:N
- [x] Editor regole con test live ("N movimenti corrispondono")
- [x] Editing categoria/note del movimento (via modale)
- [ ] Editing **inline** in tabella (attuale: modale/bulk, non celle editabili)
- [ ] "Crea regola da questo movimento" con un click dal movimento
- [ ] Split di un movimento su più categorie

## Fase 3 — Dashboard & Budget

- [x] Dashboard: KPI (entrate/uscite mese e YTD, saldo, tasso risparmio, top categorie)
- [x] Dashboard: grafici andamento mensile (barre), spese per categoria (donut), trend saldo (linea)
- [x] Dashboard: zona import drag&drop + "Da Google Drive" + storico ultimi import
- [x] Dashboard: alert movimenti da categorizzare, budget superati, duplicati in sospeso
- [x] Budget annuale con ripartizione mensile personalizzabile
- [x] Budget su macro-categoria (cluster) e confronto actual vs budget con soglie colore
- [x] Copia budget da actual anno precedente
- [ ] Cluster di budget **arbitrari** (tabella dedicata; ora si usa la macro-categoria)
- [ ] Copia budget da **budget** anno precedente ±% (ora solo da actual)
- [ ] Rollover opzionale del residuo mese→mese
- [ ] Drill-down dal budget ai movimenti della categoria

## Fase 4 — Proiezioni & Scenari

- [x] Rilevamento automatico ricorrenze (frequenza/importo/esercente, ≥3 occorrenze)
- [x] Proiezione saldo fine anno (ricorrenze + media spese variabili)
- [x] Scenari what-if (aggiustamenti mensili da un mese in poi) con curva base vs scenario
- [ ] Scenari **salvabili/persistiti** (ora vivono solo in memoria nella sessione)
- [ ] Fan di proiezione ottimistico/atteso/pessimistico
- [ ] Stagionalità con ≥12 mesi di storico
- [ ] Pagina dedicata **Abbonamenti & Ricorrenze** (costo mensile/annuo, prossime scadenze)

## Fase 5 — Google Drive & rifiniture

- [x] Google Drive OAuth 2.0 PKCE (browser di sistema + loopback), scope readonly
- [x] Token cifrati con `safeStorage`, configurazione Client ID nelle Impostazioni
- [x] Browser file Drive in-app + import nella stessa pipeline
- [x] Backup automatico del DB a rotazione (ultimi 10) + backup manuale
- [x] Report anno-su-anno (mensile + per categoria)
- [x] Export della vista filtrata (CSV/XLSX)
- [x] Tema scuro (shadcn/ui, palette validata per accessibilità/CVD)
- [ ] **Restore** da backup dall'interfaccia (ora solo creazione backup)
- [ ] Toggle tema chiaro/scuro (attualmente scuro fisso)
- [ ] Ricerca globale (Ctrl/Cmd+K) su movimenti/categorie/pagine
- [ ] Impostazioni: gestione conti, formato locale, scelta cartella dati

## Fase 6 — Hardening & release

- [ ] Test e2e Playwright sui flussi critici (import→dedup→categorizza→budget)
- [ ] Test su dataset reali di banche diverse
- [ ] Firma codice (Authenticode Win / notarizzazione Mac)
- [ ] Auto-update (electron-updater)
- [ ] Documentazione utente
- [x] Test unit sul parser/dedup/regole (17 test) + smoke test end-to-end del main process
- [x] Typecheck strict pulito e build di produzione funzionante

---

## Deviazioni dallo stack pianificato (consapevoli)

| Previsto | Realizzato | Motivo |
|---|---|---|
| better-sqlite3 + Drizzle | `node:sqlite` | Zero dipendenze native da compilare; **costo:** niente migrazioni versionate |
| TanStack Table | Tabella custom su shadcn `Table` | Sufficiente per l'attuale set di feature; **costo:** niente grouping/resize/colonne dinamiche |
| Zustand + TanStack Query | Stato React locale + chiamate IPC dirette | App a pagina singola con stato contenuto |
| Apache ECharts | Recharts | Grafici semplici, bundle più leggero |

---

## Nuovi TODO — miglioramenti e passi mancanti

### Priorità alta (qualità/robustezza)
- [ ] **Sistema di migrazioni** dello schema (versione DB in `settings` + step idempotenti) prima di distribuire, per non perdere dati ai futuri aggiornamenti
- [ ] **Restore da backup** dall'UI (con conferma e backup di sicurezza pre-restore)
- [ ] **Packaging firmato** Win/Mac + verifica installazione pulita su macchina senza toolchain
- [ ] **CI** minima: typecheck + test + build a ogni commit
- [ ] Gestione errori/utente più esplicita su import fallito, file corrotto, mapping incompleto (toast/dialog invece di soli `console.error`)
- [ ] Ridurre il bundle renderer (attuale ~1.7 MB): code-splitting per pagina, lazy import di Recharts/SheetJS

### Priorità media (feature di prodotto)
- [ ] Pagina **Abbonamenti & Ricorrenze** con totale mensile/annuo e prossime scadenze
- [ ] **Viste salvate** in Movimenti (es. "Non categorizzati", "Spese Q1") + raggruppamento e colonne configurabili
- [ ] **Split** di un movimento su più categorie
- [ ] **Ricerca globale** (Ctrl/Cmd+K)
- [ ] **Scenari salvabili** + fan ottimistico/atteso/pessimistico
- [ ] Toggle **tema chiaro/scuro** e formato locale nelle Impostazioni
- [ ] "Crea regola da questo movimento" e da pattern comune di una selezione
- [ ] Drill-down budget→movimenti e rollover del residuo mensile

### Priorità bassa (estensioni)
- [ ] **Multi-conto** reale (l'utente ne crea/gestisce più d'uno; oggi conto fisso id=1) con dashboard aggregata e filtro
- [ ] **Obiettivi di risparmio** con target e data
- [ ] Report stampabile/PDF e analisi per esercente
- [ ] Patrimonio netto (conti manuali: investimenti, contanti)
- [ ] Notifiche desktop su sforamento budget
- [ ] Import automatico da cartella osservata
- [ ] Cluster di budget arbitrari (oltre alla macro-categoria)

### Debito tecnico / da verificare
- [ ] Il bundle supera il warning Vite di 500 kB → valutare `manualChunks`
- [ ] Coprire con test: `stats.ts`, `forecast.ts`, `gdrive.ts` (ora testato solo l'importer)
- [ ] `DEFAULT_ACCOUNT = 1` cablato in più punti → estrarre quando arriva il multi-conto
- [ ] Verifica OAuth Google in produzione (consent screen / verifica app) se si esce dalla modalità testing
