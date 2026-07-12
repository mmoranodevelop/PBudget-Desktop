# Piano di Sviluppo — Personal Budgeting App (Desktop Windows/macOS)

> Versione 1.1 — 11/07/2026
> Dati di riferimento: `data/Elenco_Movimenti.xls` (export UniCredit, 287 movimenti gen–lug 2026)

---

## Stato di avanzamento

Le **Fasi 0–5 sono sostanzialmente complete** e l'app è usabile end-to-end
(import → dedup → categorizzazione → dashboard → budget → proiezioni → report → export → Google Drive).
Restano rifiniture della tabella movimenti, alcune feature avanzate e l'intera **Fase 6**
(packaging firmato, CI, test e2e). Il dettaglio voce per voce è in **[CHECKLIST.md](CHECKLIST.md)**.

**Deviazioni consapevoli dallo stack pianificato** (motivate in CHECKLIST.md):
`node:sqlite` al posto di better-sqlite3 + Drizzle (niente dipendenze native, ma **niente migrazioni versionate** — da introdurre prima della distribuzione); tabella custom su
tabella custom dell'app al posto di TanStack Table; stato React locale al posto di Zustand + TanStack Query;
Recharts al posto di ECharts. Le sezioni seguenti restano il riferimento di design; dove il
realizzato diverge è annotato inline.

---

## 1. Validazione stack: TypeScript + Electron

**Verdetto: sì, è una scelta valida e consigliata per questo progetto.** Motivazioni:

| Criterio | Electron + TypeScript |
|---|---|
| Cross-platform Win/Mac | Nativo, stesso codice, packaging maturo (electron-builder) |
| Parsing CSV/XLS/XLSX | Ecosistema JS imbattibile: SheetJS (xls/xlsx), PapaParse (csv) |
| Storage locale | better-sqlite3 (sincrono, velocissimo, zero server) |
| Google Drive API | SDK ufficiale `googleapis` in JS/TS |
| UI dati (tabelle, grafici, dashboard) | React + TanStack Table + ECharts: il meglio disponibile |
| Velocità di sviluppo | Un solo linguaggio (TS) su main + renderer |

**Alternativa considerata — Tauri 2 (Rust + webview):** binari ~10x più piccoli e minor RAM, ma richiede Rust per la parte nativa, l'ecosistema plugin è più giovane e il parsing xls lato Rust è meno maturo. Per un'app dati-intensiva a sviluppatore singolo, la produttività di Electron vince. Il costo (installer ~80-100 MB, ~150-250 MB RAM) è accettabile per un'app desktop personale.

**Scartati:** .NET MAUI (supporto macOS debole per desktop), Flutter Desktop (ecosistema tabelle/grafici finanziari inferiore), app web pura (requisito: dati locali e file system).

### Stack proposto

- **Runtime:** Electron (ultima LTS) + TypeScript strict
- **Build:** electron-vite + electron-builder (NSIS per Windows, DMG per macOS)
- **UI:** React 18 + Tailwind CSS + Radix UI
- **Tabelle:** TanStack Table (sorting, filtering, grouping, virtualizzazione)
- **Grafici:** Apache ECharts (o Recharts se bastano grafici semplici)
- **Stato:** Zustand + TanStack Query verso IPC
- **DB:** SQLite via better-sqlite3 + Drizzle ORM (migrazioni tipizzate) — *realizzato con `node:sqlite`; migrazioni versionate ancora da introdurre*
- **Parsing:** SheetJS (xls/xlsx), PapaParse (csv)
- **Google Drive:** `googleapis` + OAuth 2.0 PKCE, token cifrati con `safeStorage` di Electron
- **Test:** Vitest (unit), Playwright (e2e Electron)

**Architettura di sicurezza Electron:** `contextIsolation: true`, `nodeIntegration: false`, tutta la logica dati (DB, parsing, Drive) nel main process, esposta al renderer via IPC tipizzato (preload + contract condiviso in TS).

---

## 2. Persistenza e consistenza dei dati

- **Database SQLite** in `app.getPath('userData')/budget.db` — unica fonte di verità.
- **Archivio import:** ogni file importato viene copiato in `userData/imports/<timestamp>_<nome>` con hash SHA-256 registrato in DB → audit trail, possibilità di re-import/rollback.
- **Transazioni atomiche** su ogni import (o tutto o niente).
- **Backup automatico:** snapshot del DB a rotazione (ultimi N) a ogni avvio/chiusura + export/import manuale del backup dalla pagina Impostazioni.
- **Migrazioni schema** versionate (Drizzle) per aggiornamenti dell'app senza perdita dati. — *⚠️ non ancora implementate: schema creato con `CREATE TABLE IF NOT EXISTS`, da sostituire con migrazioni versionate prima della distribuzione.*

---

## 3. Modello dati

```
Account          (id, nome, iban, banca, valuta, saldo_iniziale)
ImportFile       (id, account_id, filename, hash_sha256, origine[locale|gdrive],
                  profilo_mapping_id, data_import, righe_totali, righe_importate, righe_scartate)
MappingProfile   (id, nome, banca, config_json)        ← mapping colonne riusabile
Transaction      (id, account_id, import_file_id, data_registrazione, data_valuta,
                  causale, descrizione, descrizione_normalizzata, esercente,
                  importo, valuta, categoria_id, note, hash_dedup,
                  stato[attiva|ignorata_duplicato], created_at)
Category         (id, nome, colore, icona, tipo[spesa|entrata|trasferimento],
                  parent_id ← gerarchia a 2 livelli, is_system, ordine)
Tag              (id, nome, colore)
TransactionTag   (transaction_id, tag_id)               ← N:N
Rule             (id, pattern, campo[descrizione|esercente|causale], tipo_match
                  [contains|regex|exact], categoria_id, tag_ids, priorita, attiva)
Budget           (id, anno, nome)
BudgetLine       (id, budget_id, categoria_id | cluster_id, mese[1-12|null=annuale], importo)
Cluster          (id, nome)                             ← raggruppamento di categorie per budget
ClusterCategory  (cluster_id, categoria_id)
Scenario         (id, nome, parametri_json)             ← simulazioni what-if
Settings         (chiave, valore)
```

**Campi derivati chiave:**
- `descrizione_normalizzata`: descrizione ripulita (date, numeri carta, importi rimossi) → base per similarità e regole.
- `esercente`: estratto dalla descrizione (es. da `PAGAMENTO APPLE PAY ... LIDL 2090 COMO` → `LIDL`).
- `hash_dedup`: SHA-256 di `(account, data_registrazione, importo, descrizione_normalizzata)`.

### Kit base categorie (personalizzabili, seed iniziale)

- **Entrate:** Stipendio, Rimborsi, Interessi/Cashback, Altre entrate
- **Casa:** Affitto/Mutuo, Utenze (luce/gas/acqua), Internet/Telefono, Manutenzione
- **Alimentari:** Supermercato, Ristoranti/Bar, Delivery
- **Trasporti:** Carburante, Mezzi pubblici, Auto (assicurazione/bollo/manutenzione), Parcheggi/Pedaggi
- **Salute:** Medico/Farmacia, Assicurazioni
- **Svago:** Abbonamenti (streaming ecc.), Sport, Viaggi, Hobby, Shopping
- **Finanza:** Commissioni bancarie, Imposte/Bolli, Prestiti/Finanziamenti, Risparmio/Investimenti
- **Trasferimenti** (esclusi da spesa/entrata nei KPI)
- **Da categorizzare** (default)

Il seed include **regole precompilate per il formato UniCredit** osservato nel file di test: causale `043`+esercente → matching per merchant; `002` (SEPA DD) → Utenze/Abbonamenti; `027` (emolumenti) → Stipendio; `016` → Commissioni bancarie; `219` (imposta bollo) → Imposte; `198` (canone conto) → Commissioni bancarie; `087` (rimborso prestito carta) → Prestiti.

---

## 4. Pipeline di import

```
File (locale o Google Drive)
  → 1. Parse grezzo (SheetJS/PapaParse, encoding auto: UTF-8/Windows-1252)
  → 2. Rilevamento struttura: skip preambolo (es. 4 righe UniCredit con IBAN/saldi),
       individuazione riga header euristica
  → 3. Matching profilo di mapping:
       - fingerprint delle intestazioni → se profilo noto: mapping automatico
       - altrimenti: suggerimento automatico colonna→campo (euristiche su nome
         header e tipo dati: date, importi it-IT "1.234,56", testo)
       - UI di conferma/correzione mapping → salvataggio come nuovo profilo riusabile
  → 4. Normalizzazione: date (dd/mm/yyyy, serial Excel), importi (formato italiano,
       segno, eventuale coppia colonne Dare/Avere), trim descrizioni
  → 5. Rilevamento duplicati (vedi §5)
  → 6. Staging con anteprima: tabella righe con stato [nuova | duplicato | errore],
       categorie proposte dalle regole
  → 7. Conferma → commit transazionale + archiviazione file + report import
```

**Requisito coperto:** struttura colonne "leggermente diversa" → il passo 3 gestisce sempre il mapping manuale assistito e memorizza il profilo per gli import successivi (per banca/formato).

### Google Drive
- OAuth 2.0 con PKCE (browser di sistema + loopback redirect), scope minimo `drive.readonly` o `drive.file`.
- Browser file Drive in-app (ricerca per nome/tipo csv-xls), download nel sandbox e ingresso nella stessa pipeline.
- Token refresh cifrati con `safeStorage`; nessun dato inviato all'esterno.

---

## 5. Gestione duplicati (periodi incrociati)

1. **Match esatto:** `hash_dedup` già presente → riga marcata **Duplicato** e di default esclusa.
2. **Match probabile:** stessa data ±1 giorno + stesso importo + similarità descrizione (trigram/Jaro-Winkler > soglia) → marcata **Possibile duplicato**, decisione all'utente.
3. **UI dedicata nello staging:** banner "X duplicati rilevati (periodi sovrapposti: <range>)", vista affiancata riga nuova vs. movimento esistente, azioni: *Ignora tutti / Importa comunque / decisione riga per riga*.
4. I duplicati ignorati restano registrati (`stato=ignorata_duplicato`) collegati al file di import → tracciabilità e possibilità di ripristino.

---

## 6. Categorizzazione, tag e suggerimenti massivi

- **Regole automatiche** (tabella `Rule`): applicate all'import e ri-applicabili on-demand; priorità ordinabile; create anche "al volo" ("crea regola da questo movimento").
- **Suggerimento per similarità:** quando l'utente categorizza un movimento, l'app cerca movimenti con stesso `esercente`/descrizione simile non categorizzati e propone: *"Trovati 12 movimenti simili (LIDL) — applica 'Alimentari > Supermercato' a tutti?"* con anteprima e selezione parziale.
- **Azioni bulk in tabella:** selezione multipla → assegna categoria/tag, crea regola dal pattern comune.
- **Tag liberi N:N** (es. `vacanza-2026`, `detraibile`) indipendenti dalla categoria.
- Gestione categorie: CRUD completo, gerarchia a 2 livelli, colori/icone, merge di categorie (riassegnazione movimenti), protezione categorie di sistema (Trasferimenti, Da categorizzare).

---

## 7. Pagine dell'applicazione

### 7.1 Dashboard (main page)
- **KPI cards:** entrate/uscite mese corrente e YTD, saldo, tasso di risparmio, delta vs. budget (over/under per cluster), top 5 categorie di spesa.
- **Grafici:** andamento mensile entrate/uscite (barre), spese per categoria (donut/treemap), trend saldo (linea).
- **Zona import:** drag & drop file + pulsanti "Importa file" / "Da Google Drive" + storico ultimi import con esito.
- **Alert:** movimenti da categorizzare, budget superati, duplicati in sospeso.

### 7.2 Movimenti (gestione tabellare)
- Tabella virtualizzata: filtri per periodo/conto/categoria/tag/testo/importo, ordinamento multi-colonna, raggruppamento (per mese, categoria, esercente), colonne mostrabili/nascondibili e ridimensionabili (layout persistito).
- Editing inline (categoria, tag, note), azioni bulk, split di un movimento su più categorie.
- Export della vista filtrata (CSV/XLSX).
- Viste salvate (es. "Spese Q1", "Non categorizzati").

### 7.3 Budget
- Budget **annuale** con ripartizione **mensile** (equidistribuita o personalizzata mese per mese).
- Righe di budget su **categoria singola o cluster** di categorie (es. cluster "Auto" = Carburante + Assicurazione + Manutenzione).
- Vista actual vs. budget: barre di avanzamento con soglie colore (verde <80%, giallo 80–100%, rosso >100%), drill-down nei movimenti.
- Copia budget da anno precedente / da actual anno precedente ±%.
- Rollover opzionale del residuo mese→mese.

### 7.4 Proiezioni & Scenari (forecasting)
- **Rilevamento ricorrenze:** individuazione automatica di movimenti periodici (stipendio, canoni, SEPA DD, abbonamenti) per frequenza/importo/esercente.
- **Proiezione fine mese / fine anno:** ricorrenze note + media mobile per categoria sulle spese variabili (media 3-6 mesi, con stagionalità se ≥12 mesi di storico).
- **Scenari what-if salvabili:** modifica parametri (es. "+200€/mese risparmio", "rata mutuo da settembre", "-15% svago", entrata una tantum) e confronto curve saldo proiettato base vs. scenario.
- Grafico saldo storico + fan di proiezione (ottimista/atteso/pessimista).
- Fase 1: modelli statistici semplici e spiegabili (no ML): ricorrenze + medie mobili stagionalizzate. Estensioni future eventualmente valutabili.

### 7.5 Categorie & Regole
- Gestione categorie/cluster/tag; editor regole con **test live** ("questa regola matcherebbe 34 movimenti"), riordino priorità, applicazione retroattiva.

### 7.6 Impostazioni
- Conti bancari, profili di mapping salvati, connessione Google Drive, backup/restore, tema chiaro/scuro, formato locale, cartella dati.

### 7.7 Pagine/funzionalità aggiuntive suggerite
- **Abbonamenti & Ricorrenze:** pagina dedicata alle spese fisse rilevate — costo mensile/annuale totale, prossime scadenze, "quanto spendi in abbonamenti".
- **Report:** confronto anno su anno, report mensile stampabile/PDF, analisi per esercente.
- **Ricerca globale** (Ctrl/Cmd+K) su movimenti, categorie, pagine.
- **Multi-conto** con dashboard aggregata e filtro per conto (lo schema lo prevede già).
- **Obiettivi di risparmio:** target con data, avanzamento alimentato dal tasso di risparmio.
- *(v2)* Patrimonio netto (conti manuali: investimenti, contanti), notifiche desktop su superamento budget, import automatico da cartella osservata.

---

## 8. Roadmap di sviluppo

### Fase 0 — Fondamenta (1 settimana)
Scaffold electron-vite + React + TS strict; IPC tipizzato con contract condiviso; SQLite + Drizzle + migrazioni; CI (lint, typecheck, test); packaging Win/Mac funzionante da subito ("hello world" installabile).

### Fase 1 — Import & dati (2-3 settimane) → prima build usabile
Parser CSV/XLS/XLSX con gestione formati it-IT; rilevamento preambolo/header; wizard mapping colonne + profili salvati (profilo UniCredit precompilato e testato su `Elenco_Movimenti.xls`); dedup esatto + probabile con UI di staging; archivio file e report import; tabella Movimenti base (filtri, ordinamento).

### Fase 2 — Categorizzazione (2 settimane)
Seed categorie + regole UniCredit; motore regole; normalizzazione descrizione ed estrazione esercente; suggerimenti di similarità e bulk actions; gestione categorie/tag/regole (pagina 7.5); editing inline e split.

### Fase 3 — Dashboard & Budget (2-3 settimane)
Dashboard con KPI e grafici; zona import in dashboard; pagina Budget completa (cluster, mensilizzazione, actual vs budget, copia da anno precedente).

### Fase 4 — Forecasting & Scenari (2-3 settimane)
Rilevamento ricorrenze; pagina Abbonamenti; proiezioni mese/anno; scenari what-if con confronto; arricchimento dashboard con proiezione.

### Fase 5 — Google Drive & rifiniture (1-2 settimane)
OAuth PKCE + browser file Drive; backup automatico + restore; ricerca globale; tema scuro; report YoY; export.

### Fase 6 — Hardening & release (1-2 settimane)
Test e2e Playwright sui flussi critici (import→dedup→categorizza→budget); test su dataset reali multipli (banche diverse); firma codice (Authenticode Win / notarizzazione Mac); auto-update (electron-updater); documentazione utente.

**Totale indicativo: 10-14 settimane** per una v1 completa; una build già utile quotidianamente (import + categorie + tabella) arriva a fine Fase 2 (~5-6 settimane).

---

## 9. Rischi principali e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Formati bancari eterogenei (xls legacy, csv con separatori/encoding vari) | Pipeline con profili di mapping + test su file reali fin da Fase 1 |
| Falsi positivi/negativi nel dedup | Doppio livello (esatto + probabile con conferma utente), mai eliminazione silenziosa |
| Verifica Google OAuth (consent screen) per app desktop | Scope minimo `drive.readonly`; in sviluppo modalità "testing"; Drive è in Fase 5, non blocca il resto |
| Corruzione/perdita DB locale (file su OneDrive!) | DB in `userData` (fuori da OneDrive), backup a rotazione, WAL mode |
| Performance con anni di storico | better-sqlite3 + indici su (data, categoria, hash), virtualizzazione tabelle |

---

## 10. Struttura repository proposta

```
budgetting-app/
├─ data/                    # dataset di test (esistente)
├─ src/
│  ├─ main/                 # Electron main: db/, import/ (parser, mapping, dedup),
│  │                        #   rules/, forecast/, gdrive/, ipc/
│  ├─ preload/              # bridge IPC tipizzato
│  ├─ renderer/             # React: pages/ (Dashboard, Transactions, Budget,
│  │                        #   Forecast, Rules, Settings), components/, stores/
│  └─ shared/               # tipi e contract IPC condivisi
├─ drizzle/                 # migrazioni
├─ tests/                   # unit + e2e
└─ electron-builder.yml
```
