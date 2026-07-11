// Smoke test end-to-end del main process (senza UI), eseguito con SMOKE_TEST=1.
// Usa un userData temporaneo per non toccare i dati reali.
import { app } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { initDb } from './db'
import { analyzeBuffer, stage, commit } from './importer/service'
import { applyRulesToExisting } from './rules'
import { dashboardStats } from './stats'
import { forecast } from './forecast'

export async function runSmokeTest(): Promise<void> {
  app.setPath('userData', join(tmpdir(), `budget-smoke-${Date.now()}`))
  initDb()
  const samplePath = join(app.getAppPath(), 'data', 'Elenco_Movimenti.xls')
  const buf = readFileSync(samplePath)

  const log = (label: string, value: unknown): void =>
    console.log(`[SMOKE] ${label}:`, JSON.stringify(value))

  // 1° import
  const analysis = analyzeBuffer(buf, 'Elenco_Movimenti.xls')
  log('profilo riconosciuto', analysis.matchedProfile?.name ?? null)
  log('righe totali', analysis.totalRows)

  const staged1 = stage(analysis.token, analysis.suggestedMapping, analysis.headerRow)
  log('staging 1 (nuovi/duplicati)', [staged1.stats.new, staged1.stats.duplicates])

  const result1 = commit(
    analysis.token, analysis.suggestedMapping, analysis.headerRow,
    staged1.rows.filter((r) => r.include).map((r) => r.index), null
  )
  log('import 1 (importati/categorizzati)', [result1.imported, result1.categorized])

  // 2° import dello stesso file: tutto deve risultare duplicato
  const analysis2 = analyzeBuffer(buf, 'Elenco_Movimenti.xls')
  const staged2 = stage(analysis2.token, analysis2.suggestedMapping, analysis2.headerRow)
  log('staging 2 (nuovi/duplicati)', [staged2.stats.new, staged2.stats.duplicates])
  if (staged2.stats.new !== 0) throw new Error('SMOKE FAIL: attesi 0 nuovi al secondo import')
  if (staged2.stats.duplicates !== result1.imported) {
    throw new Error(
      `SMOKE FAIL: attesi ${result1.imported} duplicati, trovati ${staged2.stats.duplicates}`
    )
  }

  // regole retroattive
  const applied = applyRulesToExisting(true)
  log('regole riapplicate', applied)

  // dashboard e forecast
  const stats = dashboardStats(2026)
  log('dashboard ytd (entrate/uscite)', [stats.ytdIncome.toFixed(2), stats.ytdExpense.toFixed(2)])
  log('dashboard saldo', stats.balance)
  log('non categorizzati', stats.uncategorizedCount)
  if (stats.ytdIncome <= 0 || stats.ytdExpense <= 0) throw new Error('SMOKE FAIL: KPI vuoti')

  const fc = forecast(2026, [{ id: 'x', label: 'test', monthlyAmount: -200, fromMonth: 8 }])
  log('ricorrenze rilevate', fc.recurring.length)
  log('saldo fine anno (base/scenario)', [fc.yearEndBalance, fc.yearEndScenarioBalance])
  if (fc.yearEndScenarioBalance >= fc.yearEndBalance) {
    throw new Error('SMOKE FAIL: lo scenario -200/mese deve abbassare il saldo')
  }

  console.log('[SMOKE] TUTTO OK')
}
