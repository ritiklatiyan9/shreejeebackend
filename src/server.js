import dotenv from 'dotenv';
import {app} from '../src/app.js';
import dbConnect from '../src/db/database.js';
dotenv.config({
    path:"./.env"
});

dbConnect()
        .then(() => {
            console.log('MongoDB Connected')
            app.listen(process.env.PORT || 8000 , () => {
                console.log(`Server is Running at ${process.env.PORT || 8000}`)
            })
        })
        .catch((err)=>{
            console.log("MongoDB Connection Failed",err);
        })