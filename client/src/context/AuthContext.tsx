import { createContext, useState, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import api from '../services/api';

interface User {
    id: string;
    email: string;
    name: string | null;
    role: string;
}

interface AuthContextType {
    user: User | null;
    login: (email: string, pass: string) => Promise<void>;
    signup: (email: string, pass: string, name?: string) => Promise<boolean>;
    verifyOtp: (email: string, otp: string) => Promise<void>;
    logout: () => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check if user is already logged in
        const token = localStorage.getItem('token');
        if (token) {
            setLoading(true);
            api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            api.get('/auth/me')
                .then(res => {
                    setUser(res.data);
                })
                .catch(() => {
                    localStorage.removeItem('token');
                    setUser(null);
                })
                .finally(() => {
                    setLoading(false);
                });
        } else {
            setLoading(false);
        }
    }, []);

    const login = async (email: string, pass: string) => {
        const res = await api.post('/auth/login', { email, password: pass });
        setUser(res.data.user);
        localStorage.setItem('token', res.data.token);
        api.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
    };

    const signup = async (email: string, pass: string, name?: string) => {
        // Signup now only triggers OTP, doesn't return token yet
        await api.post('/auth/signup', { email, password: pass, name });
        // Return true to indicate OTP sent
        return true;
    };

    const verifyOtp = async (email: string, otp: string) => {
        const res = await api.post('/auth/verify-otp', { email, otp });
        setUser(res.data.user);
        localStorage.setItem('token', res.data.token);
        api.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
    };

    return (
        <AuthContext.Provider value={{ user, login, signup, verifyOtp, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
