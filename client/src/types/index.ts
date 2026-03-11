export interface User {
    id: string;
    email: string;
    name: string;
    role: 'USER' | 'ADMIN' | 'TEAM_LEAD' | 'MEMBER';
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

export interface Comment {
    id: string;
    content: string;
    taskId: string;
    userId: string;
    createdAt: string;
    user: User;
}

export interface Attachment {
    id: string;
    type: 'FILE' | 'LINK';
    filePath?: string;
    fileName?: string;
    fileType?: string;
    url?: string;
    taskId: string;
    createdAt: string;
}

export interface WorkSubmission {
    id: string;
    taskId: string;
    userId: string;
    description?: string;
    submittedAt: string;
    status: 'PENDING' | 'REVIEWED' | 'APPROVED' | 'REJECTED';
    reviewNotes?: string;
    reviewedAt?: string;
    reviewedBy?: string;
    user?: User;
}

export interface ActivityLog {
    id: string;
    taskId: string;
    userId?: string;
    action: string;
    description: string;
    metadata?: any;
    createdAt: string;
    user?: User;
}

