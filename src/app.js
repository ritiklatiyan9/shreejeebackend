// app.js
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import userRoute from './routes/userRoute.js';
import adminRoute from './routes/adminRoute.js';
import kycRoute from './routes/kycRoute.js';
import plotRoute from './routes/plotRoute.js';
import matchingIncomeRoute from './routes/matchingIncomeRoute.js';

// Remove any dotenv import/config from here if it exists
// import { config } from 'dotenv';
// config({ path: './.env' });

import { corsOptions } from './origin/corsOptions.js';

const app = express();

// Enable CORS with custom options
app.use(cors(corsOptions));

// Increase payload limits for JSON and URL-encoded bodies
app.use(express.json({ limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

app.get('/api/v1/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running perfectly 🚀'
  });
});

// Setup routes
app.use('/api/v1/users', userRoute);
app.use('/api/v1/kyc', kycRoute);
app.use('/api/v1/admin', adminRoute);
app.use('/api/v1/plots', plotRoute);
app.use('/api/v1/matching-income', matchingIncomeRoute);

export { app };