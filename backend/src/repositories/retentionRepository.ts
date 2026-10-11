import { RetentionRuleModel } from '../db/models/RetentionRule'
import { RetentionActionModel } from '../db/models/RetentionAction'
import type { RetentionAction, RetentionRule } from '../types'

export interface PersistedRule extends RetentionRule {
  version: string
  updatedAt: string
  updatedBy: string
}

/** Replaces the whole rule set atomically (the policy is small). */
export async function persistRules(rules: PersistedRule[]): Promise<void> {
  await RetentionRuleModel.deleteMany({})
  if (rules.length > 0) {
    await RetentionRuleModel.insertMany(rules.map((rule) => ({ ...rule, _id: rule.category })))
  }
}

export async function loadRules(): Promise<PersistedRule[]> {
  return RetentionRuleModel.find().sort({ category: 1 }).lean<PersistedRule[]>().exec()
}

export async function persistAction(action: RetentionAction): Promise<void> {
  await RetentionActionModel.replaceOne({ _id: action.id }, { ...action, _id: action.id }, { upsert: true })
}

export async function listActions(): Promise<RetentionAction[]> {
  return RetentionActionModel.find().sort({ at: 1 }).lean<RetentionAction[]>().exec()
}

export async function deleteActionsBefore(iso: string): Promise<number> {
  const result = await RetentionActionModel.deleteMany({ at: { $lt: iso } })
  return result.deletedCount ?? 0
}

export async function clearRetention(): Promise<void> {
  await RetentionRuleModel.deleteMany({})
  await RetentionActionModel.deleteMany({})
}
