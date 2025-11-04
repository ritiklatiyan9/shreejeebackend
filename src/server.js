// index.js - MAIN ENTRY POINT - Ensure this is the FIRST import
import dotenv from 'dotenv';

// Configure dotenv FIRST, BEFORE any other imports
console.log("Loading environment variables...");
dotenv.config({ path: "./.env" });

// Verify variables are loaded *in index.js* before importing other modules
console.log('--- Environment Variables Check (in index.js, BEFORE imports) ---');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'Loaded (value hidden for security)' : 'NOT FOUND or EMPTY');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? 'Loaded (value hidden for security)' : 'NOT FOUND or EMPTY');
console.log('AWS_REGION:', process.env.AWS_REGION || 'NOT FOUND or EMPTY');
console.log('AWS_S3_BUCKET_NAME:', process.env.AWS_S3_BUCKET_NAME || 'NOT FOUND or EMPTY');
console.log('------------------------------------');

// NOW import other modules (app, dbConnect) which depend on env vars
import {app} from './app.js'; // Adjust path if index.js is in src root
import dbConnect from './db/database.js';

dbConnect()
        .then(() => {
            console.log('MongoDB Connected')
            app.listen(process.env.PORT || 8000 , () => {
                console.log(`Server is Running at ${process.env.PORT || 8000}`)
            })
        })
        .catch((err)=>{
            console.log("MongoDB Connection Failed",err);
        });