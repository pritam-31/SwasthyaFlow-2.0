import mongoose, { Schema } from 'mongoose'

export interface DbPatient {
  _id: string
  id: string
  createdAt: string
  updatedAt?: string
}

const PatientSchema = new Schema<DbPatient>(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true, index: true, unique: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String },
  },
  { versionKey: false, _id: false },
)

export const PatientModel = mongoose.model<DbPatient>('Patient', PatientSchema, 'patients')
