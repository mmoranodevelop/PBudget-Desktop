// Contratto condiviso tra main process e renderer (via IPC)

export type CategoryType = 'expense' | 'income' | 'transfer'

export interface Category {
  id: number
  name: string
  color: string
  type: CategoryType
  parentId: number | null
  isSystem: boolean
  sortOrder: number
}

export interface Tag {
  id: number
  name: string
  color: string
}

export type RuleField = 'description' | 'merchant' | 'causale'
export type RuleMatchType = 'contains' | 'exact' | 'regex'

export interface Rule {
  id: number
  field: RuleField
  matchType: RuleMatchType
  pattern: string
  categoryId: number
  priority: number
  active: boolean
}

export type TransactionStatus = 'active' | 'duplicate_ignored'

export interface Transaction {
  id: number
  accountId: number
  importFileId: number | null
  dateReg: string // ISO yyyy-mm-dd
  dateVal: string | null
  causale: string | null
  description: string
  merchant: string | null
  amount: number
  currency: string
  categoryId: number | null
  notes: string | null
  status: TransactionStatus
  tags: Tag[]
}

export interface TransactionFilter {
  from?: string
  to?: string
  categoryIds?: number[]
  tagIds?: number[]
  search?: string
  uncategorized?: boolean
  minAmount?: number
  maxAmount?: number
  type?: 'expense' | 'income'
  includeIgnored?: boolean
  limit?: number
  offset?: number
  sortBy?: 'dateReg' | 'amount' | 'description' | 'categoryId'
  sortDir?: 'asc' | 'desc'
}

export interface TransactionListResult {
  rows: Transaction[]
  total: number
  sumIncome: number
  sumExpense: number
}

// ---------- Import ----------

export interface ColumnMapping {
  dateReg: number | null
  dateVal: number | null
  causale: number | null
  description: number | null
  amount: number | null // colonna unica con segno
  amountIn: number | null // oppure coppia entrate/uscite
  amountOut: number | null
}

export interface MappingProfile {
  id: number
  name: string
  fingerprint: string
  mapping: ColumnMapping
  headerRow: number
}

export interface ImportAnalysis {
  token: string
  fileName: string
  headerRow: number
  columns: string[]
  sampleRows: string[][]
  totalRows: number
  suggestedMapping: ColumnMapping
  matchedProfile: { id: number; name: string } | null
  preamble: string[]
}

export type StagedRowStatus = 'new' | 'duplicate' | 'probable_duplicate' | 'error'

export interface StagedRow {
  index: number
  dateReg: string
  dateVal: string | null
  causale: string | null
  description: string
  amount: number
  status: StagedRowStatus
  error?: string
  existing?: { id: number; dateReg: string; description: string; amount: number }
  suggestedCategoryId: number | null
  include: boolean
}

export interface StageResult {
  token: string
  rows: StagedRow[]
  stats: {
    total: number
    new: number
    duplicates: number
    probableDuplicates: number
    errors: number
    overlapFrom: string | null
    overlapTo: string | null
  }
}

export interface CommitResult {
  importFileId: number
  imported: number
  skippedDuplicates: number
  categorized: number
}

export interface ImportFileInfo {
  id: number
  filename: string
  source: string
  importedAt: string
  rowsTotal: number
  rowsImported: number
  rowsSkipped: number
}

// ---------- Budget ----------

export interface BudgetLine {
  id: number
  year: number
  categoryId: number
  month: number | null // null = annuale (ripartito), 1-12 = specifico mese
  amount: number
}

export interface BudgetVsActual {
  categoryId: number
  categoryName: string
  color: string
  budgetYear: number
  budgetMonth: number // budget del mese corrente/selezionato
  actualYear: number
  actualMonth: number
  monthly: { month: number; budget: number; actual: number }[]
}

// ---------- Dashboard ----------

export interface DashboardStats {
  year: number
  currentMonth: number
  monthIncome: number
  monthExpense: number
  ytdIncome: number
  ytdExpense: number
  savingsRate: number
  balance: number
  monthlySeries: { month: number; income: number; expense: number }[]
  balanceSeries: { date: string; balance: number }[]
  topCategories: { categoryId: number; name: string; color: string; amount: number }[]
  budgetAlerts: { categoryName: string; budget: number; actual: number }[]
  uncategorizedCount: number
  pendingDuplicates: number
}

// ---------- Forecast ----------

export interface RecurringItem {
  key: string
  label: string
  avgAmount: number
  frequency: 'monthly' | 'weekly'
  occurrences: number
  lastDate: string
  categoryName: string | null
}

export interface ScenarioAdjustment {
  id: string
  label: string
  monthlyAmount: number // positivo = entrata extra, negativo = spesa extra
  fromMonth: number // 1-12
}

export interface ForecastMonth {
  month: number
  label: string
  isActual: boolean
  income: number
  expense: number
  balance: number
  scenarioBalance: number
}

export interface ForecastResult {
  months: ForecastMonth[]
  recurring: RecurringItem[]
  avgVariableExpense: number
  avgVariableIncome: number
  yearEndBalance: number
  yearEndScenarioBalance: number
}

// ---------- Settings ----------

export interface DataInfo {
  dbPath: string
  dbSizeBytes: number
  transactionCount: number
  importCount: number
  backups: { file: string; date: string; sizeBytes: number }[]
}

// ---------- API (esposta dal preload) ----------

export interface BudgetApi {
  // import
  importPickFile(): Promise<ImportAnalysis | null>
  importAnalyzeBuffer(name: string, buf: ArrayBuffer): Promise<ImportAnalysis>
  importStage(token: string, mapping: ColumnMapping, headerRow: number): Promise<StageResult>
  importCommit(
    token: string,
    mapping: ColumnMapping,
    headerRow: number,
    includeIndexes: number[],
    profileName: string | null
  ): Promise<CommitResult>
  importHistory(): Promise<ImportFileInfo[]>
  // transactions
  txList(filter: TransactionFilter): Promise<TransactionListResult>
  txUpdate(id: number, patch: Partial<Pick<Transaction, 'categoryId' | 'notes'>>): Promise<void>
  txBulkCategorize(ids: number[], categoryId: number | null): Promise<number>
  txSimilar(id: number): Promise<Transaction[]>
  txAddTag(ids: number[], tagId: number): Promise<void>
  txRemoveTag(id: number, tagId: number): Promise<void>
  txRestoreDuplicate(id: number): Promise<void>
  // categories
  catList(): Promise<Category[]>
  catCreate(c: Omit<Category, 'id' | 'isSystem'>): Promise<Category>
  catUpdate(id: number, patch: Partial<Omit<Category, 'id' | 'isSystem'>>): Promise<void>
  catDelete(id: number, reassignTo: number | null): Promise<void>
  // tags
  tagList(): Promise<Tag[]>
  tagCreate(name: string, color: string): Promise<Tag>
  tagDelete(id: number): Promise<void>
  // rules
  ruleList(): Promise<Rule[]>
  ruleCreate(r: Omit<Rule, 'id'>): Promise<Rule>
  ruleUpdate(id: number, patch: Partial<Omit<Rule, 'id'>>): Promise<void>
  ruleDelete(id: number): Promise<void>
  ruleTest(field: RuleField, matchType: RuleMatchType, pattern: string): Promise<number>
  ruleApplyAll(onlyUncategorized: boolean): Promise<number>
  // budget
  budgetGet(year: number): Promise<BudgetLine[]>
  budgetSet(year: number, categoryId: number, month: number | null, amount: number): Promise<void>
  budgetVsActual(year: number, month: number): Promise<BudgetVsActual[]>
  budgetCopyFromActual(year: number, sourceYear: number): Promise<number>
  // dashboard / forecast
  dashboard(year: number): Promise<DashboardStats>
  forecast(year: number, adjustments: ScenarioAdjustment[]): Promise<ForecastResult>
  // settings
  dataInfo(): Promise<DataInfo>
  backupNow(): Promise<string>
  settingGet(key: string): Promise<string | null>
  settingSet(key: string, value: string): Promise<void>
  profileList(): Promise<MappingProfile[]>
  profileDelete(id: number): Promise<void>
}
