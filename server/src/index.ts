import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Basic health check
app.get('/', (req, res) => {
    res.send('All-in-One API is running');
});

import authRoutes from './routes/auth.routes';
import orgRoutes from './routes/org.routes';
import taskRoutes from './routes/task.routes';

// Routes
app.use('/auth', authRoutes);
app.use('/orgs', orgRoutes);
app.use('/tasks', taskRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
