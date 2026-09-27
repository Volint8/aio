import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: "https://745818562c2142b9a84cfd3a27c26823@app.glitchtip.com/25973",
  tracesSampleRate: 0.01, // 1% of transactions — adjust to your needs
});

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { Server as IOServer } from 'socket.io';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const parseAllowedOrigins = (value?: string) => {
    return new Set(
        (value || '')
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean)
    );
};

const allowedOrigins = parseAllowedOrigins(process.env.CLIENT_URL || 'http://localhost:5173');

const isAllowedOrigin = (origin?: string | null) => {
    if (!origin) {
        return true;
    }

    if (allowedOrigins.has(origin)) {
        return true;
    }

    try {
        const url = new URL(origin);
        return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
    } catch {
        return false;
    }
};

app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
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
import internalProvisioningRoutes from './routes/internal-provisioning.routes';
import internalReportRoutes from './routes/internal-report.routes';
import internalSuiteRoutes from './routes/internal-suite.routes';
import { startTaskPurgeJob } from './jobs/taskPurge.job';
import { startUserPurgeJob } from './jobs/userPurge.job';

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
app.use('/internal/provisioning', internalProvisioningRoutes);
app.use('/internal/reports', internalReportRoutes);
// The Volint Suite reads summaries from {apiBaseUrl}/api/internal/suite/summary; both spellings are served.
app.use('/internal/suite', internalSuiteRoutes);
app.use('/api/internal/suite', internalSuiteRoutes);

// Sentry error handler must be registered after all controllers and before any other error middleware
Sentry.setupExpressErrorHandler(app);

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
const io = new IOServer(server, {
    cors: {
        origin: (origin, callback) => {
            if (isAllowedOrigin(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
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

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection at:', reason);
    Sentry.captureException(reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception thrown:', error);
    Sentry.captureException(error);
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startTaskPurgeJob();
    startUserPurgeJob();
});
