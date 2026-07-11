import { contextBridge, ipcRenderer } from 'electron'
import type { BudgetApi } from '@shared/types'

type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!res.ok) throw new Error(res.error)
  return res.data
}

const api: BudgetApi = {
  importPickFile: () => invoke('import:pickFile'),
  importAnalyzeBuffer: (name, buf) => invoke('import:analyzeBuffer', name, buf),
  importStage: (token, mapping, headerRow) => invoke('import:stage', token, mapping, headerRow),
  importCommit: (token, mapping, headerRow, includeIndexes, profileName) =>
    invoke('import:commit', token, mapping, headerRow, includeIndexes, profileName),
  importHistory: () => invoke('import:history'),
  txList: (filter) => invoke('tx:list', filter),
  txUpdate: (id, patch) => invoke('tx:update', id, patch),
  txBulkCategorize: (ids, categoryId) => invoke('tx:bulkCategorize', ids, categoryId),
  txSimilar: (id) => invoke('tx:similar', id),
  txAddTag: (ids, tagId) => invoke('tx:addTag', ids, tagId),
  txRemoveTag: (id, tagId) => invoke('tx:removeTag', id, tagId),
  txRestoreDuplicate: (id) => invoke('tx:restoreDuplicate', id),
  catList: () => invoke('cat:list'),
  catCreate: (c) => invoke('cat:create', c),
  catUpdate: (id, patch) => invoke('cat:update', id, patch),
  catDelete: (id, reassignTo) => invoke('cat:delete', id, reassignTo),
  tagList: () => invoke('tag:list'),
  tagCreate: (name, color) => invoke('tag:create', name, color),
  tagDelete: (id) => invoke('tag:delete', id),
  ruleList: () => invoke('rule:list'),
  ruleCreate: (r) => invoke('rule:create', r),
  ruleUpdate: (id, patch) => invoke('rule:update', id, patch),
  ruleDelete: (id) => invoke('rule:delete', id),
  ruleTest: (field, matchType, pattern) => invoke('rule:test', field, matchType, pattern),
  ruleApplyAll: (onlyUncategorized) => invoke('rule:applyAll', onlyUncategorized),
  budgetGet: (year) => invoke('budget:get', year),
  budgetSet: (year, categoryId, month, amount) => invoke('budget:set', year, categoryId, month, amount),
  budgetVsActual: (year, month) => invoke('budget:vsActual', year, month),
  budgetCopyFromActual: (year, sourceYear) => invoke('budget:copyFromActual', year, sourceYear),
  dashboard: (year) => invoke('dashboard:stats', year),
  forecast: (year, adjustments) => invoke('forecast:get', year, adjustments),
  dataInfo: () => invoke('settings:dataInfo'),
  backupNow: () => invoke('settings:backupNow'),
  settingGet: (key) => invoke('settings:get', key),
  settingSet: (key, value) => invoke('settings:set', key, value),
  profileList: () => invoke('profile:list'),
  profileDelete: (id) => invoke('profile:delete', id)
}

contextBridge.exposeInMainWorld('budgetApi', api)
