import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import userRoute from './routes/userRoute.js';

import { config } from 'dotenv';
import { corsOptions } from './origin/corsOptions.js';

// Load environment variables
config({ path: './.env' });

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


export { app };
