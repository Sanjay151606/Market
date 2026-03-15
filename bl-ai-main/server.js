import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import schedule from 'node-schedule';

dotenv.config();

// Import routes
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import insightRoutes from './routes/insights.js';
import priceRoutes from './routes/prices.js';
import competitorRoutes from './routes/competitors.js';
import reviewRoutes from './routes/reviews.js';
import logisticsRoutes from './routes/logistics.js';
import notificationRoutes from './routes/notifications.js';
import sheetRoutes from './routes/sheets.js';
import adminRoutes from './routes/admin.js';
import chatbotRoutes from './routes/chatbot.js';

const app = express();
const httpServer = createServer(app);

// CORS configuration - allow any localhost for development
const corsOptions = (origin, callback) => {
  // Allow requests with no origin (like mobile apps or curl requests)
  if (!origin) return callback(null, true);
  
  // Allow localhost and configured frontend URL
  if (origin.includes('localhost') || origin.includes(process.env.FRONTEND_URL)) {
    return callback(null, true);
  }
  return callback(new Error('Not allowed by CORS'));
};

const io = new Server(httpServer, {
  cors: {
    origin: corsOptions,
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors({
  origin: corsOptions,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/insights', insightRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/competitors', competitorRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/logistics', logisticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/sheets', sheetRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chatbot', chatbotRoutes);

// WS Connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join-seller', (sellerId) => {
    socket.join(`seller-${sellerId}`);
    console.log(`User ${sellerId} joined their room`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Export io for use in routes
app.locals.io = io;

// Scheduler - run sheet analysis every hour for all connected users
schedule.scheduleJob('0 * * * *', async () => {
  console.log('🔄 Running scheduled sheet analysis...');
  // This will be implemented by the analytics worker
  // For now, just log
});

const PORT = process.env.PORT || 8000;
httpServer.listen(PORT, () => {
  console.log(`✅ MarketMind AI Server running on http://localhost:${PORT}`);
  console.log(`📡 Real-time updates enabled via WebSocket`);
});

export default app;
export { io };