import mongoose from 'mongoose'

const MONGODB_URI = 'mongodb+srv://techptm31_db_user:fn1ZZYHyKTb0Ngz8@cluster0.rhppusv.mongodb.net/swasthyaflow?appName=Cluster0'

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })

    console.log(`MongoDB Connected: ${conn.connection.host}`)
    return conn
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`)
    process.exit(1)
  }
}

export default connectDB