import { connectDB } from './connect'

export const db = {
  connect: () => connectDB(),
  User: require('./models').User,
  Case: require('./models').Case,
  Report: require('./models').Report,
  Audit: require('./models').Audit,
}

db.connect().catch(console.error)

export default db