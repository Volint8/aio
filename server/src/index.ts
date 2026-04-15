import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server as IOServer } from 'socket.io';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(o => o.trim());
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
// Capture the raw request body for webhook signature verification.
app.use(express.json({
    verify: (req: any, _res, buf) => {
        req.rawBody = buf;
    }
}));
app.use('/uploads', express.static('uploads'));

// Basic health check
app.get('/', (req, res) => {
    res.send('AIO API is running');
});

import authRoutes from './routes/auth.routes';
import orgRoutes from './routes/org.routes';
import taskRoutes from './routes/task.routes';
import notificationRoutes from './routes/notification.routes';
import appraisalRoutes from './routes/appraisal.routes';
import paymentRoutes from './routes/payment.routes';
import subscriptionRoutes from './routes/subscription.routes';
import { startTaskPurgeJob } from './jobs/taskPurge.job';

// Make prisma available globally for controllers
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
(global as any).prisma = prisma;

// Routes
app.use('/auth', authRoutes);
app.use('/orgs', orgRoutes);
app.use('/tasks', taskRoutes);
app.use('/notifications', notificationRoutes);
app.use('/appraisals', appraisalRoutes);
app.use('/payments', paymentRoutes);
app.use('/subscriptions', subscriptionRoutes);

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new IOServer(server, {
    cors: {
        origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(o => o.trim()),
        methods: ['GET', 'POST'],
        credentials: true
    }
});

import { Socket } from 'socket.io';

io.on('connection', (socket: Socket) => {
    // allow clients to join org rooms
    socket.on('joinOrg', (orgId: string) => {
        if (orgId) socket.join(`org:${orgId}`);
    });
});

// expose io globally so controllers can emit events
(global as any).io = io;

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startTaskPurgeJob();
});
