import mongoose, { Schema } from 'mongoose'

export interface DbDepartment {
  _id: string
  id: string
  facilityId: string
  name: string
  description?: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

const DepartmentSchema = new Schema<DbDepartment>(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true, index: true, unique: true },
    facilityId: { type: String, required: true, index: true, default: 'facility-default' },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    active: { type: Boolean, required: true, default: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false, _id: false },
)

DepartmentSchema.index({ facilityId: 1, name: 1 })

export const DepartmentModel = mongoose.model<DbDepartment>('Department', DepartmentSchema, 'departments')