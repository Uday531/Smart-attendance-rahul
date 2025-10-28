export enum Role {
  Student = 'student',
  Faculty = 'faculty',
}

export interface User {
  id: string; // This will be the Firebase Auth UID
  name: string;
  email: string;
  role: Role;
  rollNo?: string;
  section?: string;
  faceImageUrl?: string;
}

export interface Course {
  id: string; // Firestore document ID
  name: string;
  facultyId: string;
  studentIds: string[];
}

export interface TimetableSlot {
  id: string; // Firestore document ID
  courseId: string;
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export interface AttendanceRecord {
  id:string; // Firestore document ID
  studentId: string;
  courseId: string;
  date: string; // "YYYY-MM-DD"
  status: 'present' | 'absent';
  markedBy: string; // facultyId
}

export interface QrCodeData {
    sessionId: string;
    courseId: string;
    facultyId: string;
    timestamp: number;
    location: {
        latitude: number;
        longitude: number;
    };
}

export type AppContextType = {
  currentUser: User | null;
  handleLogout: () => void;
};