import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const connectSocket = (orgId?: string) => {
    if (socket) return socket;
    const token = localStorage.getItem('token');
    const url = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    socket = io(url, {
        auth: { token },
        transports: ['websocket'],
        query: { orgId },
    });

    socket.on('connect', () => {
        if (orgId) socket?.emit('joinOrg', orgId);
    });

    socket.on('disconnect', () => {
        // will fallback to polling if needed
    });

    return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
    if (socket) {
        socket.disconnect();
        socket = null;
    }
};
