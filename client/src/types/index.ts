export interface User {
    id: string;
    email: string;
    name: string;
    role: 'USER' | 'ADMIN';
}

export interface Organization {
    id: string;
    name: string;
}

export interface Task {
    id: string;
    title: string;
    description?: string;
    status: 'CREATED' | 'IN_PROGRESS' | 'COMPLETED';
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
    dueDate?: string;
    assigneeId?: string;
}
