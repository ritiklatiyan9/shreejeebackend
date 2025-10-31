import mongoose from 'mongoose';

 const connectDb = async () => {
  try {
   const connectionInstance = await mongoose.connect(process.env.MONGODB_URI, {
      dbName:"shreejeeproject"  
    });
    console.log(`Mongo DB connected: ${connectionInstance.connection.host}`);
  } catch (error) {
    console.error('Error connecting to the database: ', error);
  }
};

export default connectDb