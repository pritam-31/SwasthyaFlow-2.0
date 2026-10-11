import mongoose from 'mongoose'
import { connectDB } from './connect'

const PORT = 4000

;(async () => {
  try {
    await connectDB()
    console.log('✅ MongoDB connection successful')
    
    // Close the connection
    await mongoose.disconnect()
    console.log('✅ MongoDB disconnected')
    process.exit(0)
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message)
    process.exit(1)
  }
})()