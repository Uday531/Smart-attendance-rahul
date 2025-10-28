import React, { useState, useContext, useEffect, useRef, useCallback } from 'react';
import { QRCodeCanvas as QRCode } from 'qrcode.react';
import Webcam from 'react-webcam';
import { AppContext } from '../App';
import { AppContextType, Course, QrCodeData, TimetableSlot, User } from '../types';
import { getCurrentPosition } from '../services/locationService';
import { QrCodeIcon, CalendarIcon, ChartBarIcon, LogoutIcon, Spinner, UserGroupIcon, MenuIcon, BookOpenIcon, CameraIcon } from './common/icons';
import { db, storage } from '../services/firebase';
import { collection, query, where, getDocs, addDoc, onSnapshot, getDoc, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { registerFace, dataUrlToBlob } from '../services/faceRecognitionService';


const FacultyDashboard: React.FC = () => {
    const { currentUser, handleLogout } = useContext(AppContext) as AppContextType;
    const [activeTab, setActiveTab] = useState('qr');
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    const renderContent = () => {
        switch (activeTab) {
            case 'qr':
                return <GenerateQrCode />;
            case 'courses':
                return <ManageCourses />;
            case 'students':
                return <ManageStudents />;
            case 'timetable':
                return <ManageTimetable />;
            case 'reports':
                return <AttendanceReports />;
            default:
                return null;
        }
    };

    return (
        <div className="flex h-screen bg-secondary">
             <div className={`fixed inset-0 z-20 bg-black bg-opacity-50 md:hidden ${isSidebarOpen ? 'block' : 'hidden'}`} onClick={() => setSidebarOpen(false)}></div>
            <nav className={`fixed inset-y-0 left-0 z-30 w-64 bg-primary p-5 flex flex-col justify-between transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300 ease-in-out`}>
                <div>
                    <h1 className="text-2xl font-bold text-highlight mb-10">Faculty Portal</h1>
                    <ul>
                        <li className={`mb-4 cursor-pointer p-2 rounded ${activeTab === 'qr' ? 'bg-accent' : ''}`} onClick={() => { setActiveTab('qr'); setSidebarOpen(false); }}>
                            <a href="#" className="flex items-center space-x-3"><QrCodeIcon /> <span>Generate QR</span></a>
                        </li>
                        <li className={`mb-4 cursor-pointer p-2 rounded ${activeTab === 'courses' ? 'bg-accent' : ''}`} onClick={() => { setActiveTab('courses'); setSidebarOpen(false); }}>
                            <a href="#" className="flex items-center space-x-3"><BookOpenIcon /> <span>Manage Courses</span></a>
                        </li>
                        <li className={`mb-4 cursor-pointer p-2 rounded ${activeTab === 'students' ? 'bg-accent' : ''}`} onClick={() => { setActiveTab('students'); setSidebarOpen(false); }}>
                            <a href="#" className="flex items-center space-x-3"><UserGroupIcon /> <span>Manage Students</span></a>
                        </li>
                        <li className={`mb-4 cursor-pointer p-2 rounded ${activeTab === 'timetable' ? 'bg-accent' : ''}`} onClick={() => { setActiveTab('timetable'); setSidebarOpen(false); }}>
                            <a href="#" className="flex items-center space-x-3"><CalendarIcon /> <span>Timetable</span></a>
                        </li>
                        <li className={`mb-4 cursor-pointer p-2 rounded ${activeTab === 'reports' ? 'bg-accent' : ''}`} onClick={() => { setActiveTab('reports'); setSidebarOpen(false); }}>
                            <a href="#" className="flex items-center space-x-3"><ChartBarIcon /> <span>Reports</span></a>
                        </li>
                    </ul>
                </div>
                <button onClick={handleLogout} className="flex items-center space-x-3 p-2 rounded hover:bg-accent w-full">
                    <LogoutIcon /> <span>Logout</span>
                </button>
            </nav>
            <main className="flex-1 p-6 md:p-10 overflow-auto">
                 <div className="flex items-center mb-6">
                    <button className="md:hidden text-text-primary mr-4" onClick={() => setSidebarOpen(true)}>
                        <MenuIcon />
                    </button>
                    <h2 className="text-2xl sm:text-3xl font-bold">Welcome, {currentUser?.name}</h2>
                </div>
                {renderContent()}
            </main>
        </div>
    );
};

const GenerateQrCode: React.FC = () => {
    const { currentUser } = useContext(AppContext) as AppContextType;
    const [facultyCourses, setFacultyCourses] = useState<Course[]>([]);
    const [selectedCourse, setSelectedCourse] = useState<string>('');
    const [sessionActive, setSessionActive] = useState(false);
    const [qrData, setQrData] = useState<QrCodeData | null>(null);
    const [error, setError] = useState<string | null>(null);

    const intervalRef = useRef<number | null>(null);

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, "courses"), where("facultyId", "==", currentUser.id));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const courses: Course[] = [];
            querySnapshot.forEach((doc) => {
                courses.push({ id: doc.id, ...doc.data() } as Course);
            });
            setFacultyCourses(courses);
        });
        return () => unsubscribe();
    }, [currentUser]);

    const generateNewQrData = async () => {
        if (!selectedCourse) return;
        try {
            const position = await getCurrentPosition();
            const data: QrCodeData = {
                sessionId: `sess-${Date.now()}`,
                courseId: selectedCourse,
                facultyId: currentUser!.id,
                timestamp: Date.now(),
                location: {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                }
            };
            setQrData(data);
            setError(null);
        } catch (err) {
            setError('Could not get location. Please enable location services.');
            stopSession();
        }
    };

    const startSession = () => {
        if (!selectedCourse) {
            setError("Please select a course first.");
            return;
        }
        setSessionActive(true);
        generateNewQrData();
        intervalRef.current = window.setInterval(generateNewQrData, 10000);
    };

    const stopSession = () => {
        setSessionActive(false);
        setQrData(null);
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    };
    
    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-primary p-6 sm:p-8 rounded-lg shadow-xl">
                <h3 className="text-xl sm:text-2xl font-bold text-highlight mb-4">Start Attendance Session</h3>
                <div className="mb-4">
                    <label htmlFor="course-select" className="block mb-2 text-sm font-medium text-text-secondary">Select Course</label>
                    <select
                        id="course-select"
                        value={selectedCourse}
                        onChange={(e) => setSelectedCourse(e.target.value)}
                        disabled={sessionActive}
                        className="bg-accent border border-gray-600 text-text-primary text-sm rounded-lg focus:ring-highlight focus:border-highlight block w-full p-2.5"
                    >
                        <option value="">-- Select a Course --</option>
                        {facultyCourses.map(course => (
                            <option key={course.id} value={course.id}>{course.name}</option>
                        ))}
                    </select>
                </div>
                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
                {!sessionActive ? (
                    <button onClick={startSession} className="bg-highlight hover:bg-teal-500 text-white font-bold py-2 px-4 rounded-lg">Start Session</button>
                ) : (
                    <button onClick={stopSession} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">Stop Session</button>
                )}
                 {sessionActive && qrData && (
                    <div className="mt-8 text-center">
                        <p className="text-text-secondary mb-2">Scan this code for attendance</p>
                        <div className="p-4 bg-white inline-block rounded-lg">
                            <QRCode value={JSON.stringify(qrData)} size={256} />
                        </div>
                        <p className="text-sm text-text-secondary mt-2">QR will refresh automatically.</p>
                    </div>
                )}
            </div>
            {sessionActive && <LiveAttendance courseId={selectedCourse} />}
        </div>
    );
};

const LiveAttendance: React.FC<{courseId: string}> = ({courseId}) => {
    const { currentUser } = useContext(AppContext) as AppContextType;
    const [presentStudents, setPresentStudents] = useState<User[]>([]);
    const [allStudents, setAllStudents] = useState<User[]>([]);
    const today = new Date().toISOString().split('T')[0];
    
    const handleManualMark = async (studentId: string) => {
        const attendanceId = `${studentId}_${courseId}_${today}`;
        const attendanceRef = doc(db, 'attendance', attendanceId);
        try {
            await setDoc(attendanceRef, {
                studentId: studentId,
                courseId: courseId,
                date: today,
                status: 'present',
                markedBy: currentUser!.id,
            });
        } catch (error) {
            console.error("Error manually marking attendance: ", error);
        }
    };

    useEffect(() => {
        const fetchCourseStudents = async () => {
            const courseDoc = await getDoc(doc(db, "courses", courseId));
            if (courseDoc.exists()) {
                const courseData = courseDoc.data() as Course;
                if (courseData.studentIds && courseData.studentIds.length > 0) {
                     const studentsQuery = query(collection(db, 'users'), where('__name__', 'in', courseData.studentIds));
                     const studentsSnapshot = await getDocs(studentsQuery);
                     setAllStudents(studentsSnapshot.docs.map(d => ({id: d.id, ...d.data()}) as User));
                } else {
                    setAllStudents([]);
                }
            }
        };
        fetchCourseStudents();

        const q = query(collection(db, "attendance"), where("courseId", "==", courseId), where("date", "==", today));
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const presentIds = snapshot.docs.map(doc => doc.data().studentId);
            if (presentIds.length > 0) {
                const studentsQuery = query(collection(db, 'users'), where('__name__', 'in', presentIds));
                const studentsSnapshot = await getDocs(studentsQuery);
                const presentUsers = studentsSnapshot.docs.map(d => ({id: d.id, ...d.data()}) as User);
                setPresentStudents(presentUsers);
            } else {
                setPresentStudents([]);
            }
            fetchCourseStudents(); // Re-fetch all students in case new ones got added
        });
        
        return () => unsubscribe();
    }, [courseId, today]);


    return (
        <div className="bg-primary p-6 sm:p-8 rounded-lg shadow-xl">
            <h3 className="text-xl sm:text-2xl font-bold text-highlight mb-4">Live Attendance</h3>
            <p className="text-text-secondary mb-4">{presentStudents.length} of {allStudents.length} students present.</p>
            <div className="h-80 overflow-y-auto pr-2">
                 {allStudents.length === 0 && <p className="text-text-secondary">Students will appear here once they scan their QR code.</p>}
                <ul>
                    {allStudents.sort((a,b) => a.name.localeCompare(b.name)).map(student => {
                        const isPresent = presentStudents.some(ps => ps.id === student.id);
                        return (
                             <li key={student.id} className={`flex items-center justify-between p-3 rounded-lg mb-2 ${isPresent ? 'bg-green-500 bg-opacity-20' : 'bg-accent'}`}>
                                <div className="flex items-center space-x-3">
                                    {student.faceImageUrl ? (
                                        <img src={student.faceImageUrl} alt={student.name} className="h-10 w-10 rounded-full object-cover" />
                                    ) : (
                                        <div className="h-10 w-10 rounded-full bg-gray-700 flex items-center justify-center">
                                            <span className="text-sm font-bold">{student.name.charAt(0)}</span>
                                        </div>
                                    )}
                                    <span>{student.name}</span>
                                </div>
                                <div className="flex items-center space-x-3">
                                    <span className={`font-bold text-sm ${isPresent ? 'text-green-400' : 'text-red-400'}`}>
                                        {isPresent ? 'PRESENT' : 'ABSENT'}
                                    </span>
                                    {!isPresent && (
                                        <button 
                                            onClick={() => handleManualMark(student.id)}
                                            className="text-xs bg-blue-500 hover:bg-blue-600 text-white font-semibold py-1 px-2 rounded-md transition-colors"
                                        >
                                            Mark Present
                                        </button>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
};

const ManageCourses: React.FC = () => {
    const { currentUser } = useContext(AppContext) as AppContextType;
    const [courseName, setCourseName] = useState('');
    const [facultyCourses, setFacultyCourses] = useState<Course[]>([]);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, "courses"), where("facultyId", "==", currentUser.id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setFacultyCourses(snapshot.docs.map(doc => ({id: doc.id, ...doc.data()}) as Course));
        });
        return () => unsubscribe();
    }, [currentUser]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        if (!courseName.trim()) {
            setError('Course name cannot be empty.');
            setLoading(false);
            return;
        }

        try {
            await addDoc(collection(db, 'courses'), {
                name: courseName,
                facultyId: currentUser!.id,
                studentIds: [],
            });
            setMessage(`Course "${courseName}" created successfully.`);
            setCourseName('');
        } catch(err) {
            setError("Failed to create course. Please try again.");
        }

        setLoading(false);
        setTimeout(() => setMessage(''), 3000);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-primary p-6 sm:p-8 rounded-lg shadow-xl">
                <h3 className="text-xl sm:text-2xl font-bold text-highlight mb-6">Add New Course</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="course-name" className="block mb-2 text-sm font-medium text-text-secondary">Course Name</label>
                        <input 
                            type="text" 
                            id="course-name" 
                            value={courseName} 
                            onChange={e => setCourseName(e.target.value)} 
                            className="bg-accent border border-gray-600 text-text-primary text-sm rounded-lg focus:ring-highlight focus:border-highlight block w-full p-2.5" 
                            placeholder="e.g., Quantum Physics"
                        />
                    </div>
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    {message && <p className="text-green-400 text-sm">{message}</p>}
                    <button type="submit" disabled={loading} className="w-full sm:w-auto bg-highlight hover:bg-teal-500 text-white font-bold py-2 px-6 rounded-lg transition disabled:bg-gray-500 flex items-center justify-center">
                        {loading ? <Spinner /> : 'Add Course'}
                    </button>
                </form>
            </div>
             <div className="bg-primary p-6 sm:p-8 rounded-lg shadow-xl">
                <h3 className="text-xl sm:text-2xl font-bold text-highlight mb-4">My Courses</h3>
                 <div className="h-80 overflow-y-auto pr-2">
                    {facultyCourses.length === 0 && <p className="text-text-secondary">Your created courses will appear here.</p>}
                    <ul>
                        {facultyCourses.map(course => (
                            <li key={course.id} className="p-3 rounded-lg mb-2 bg-accent">
                                {course.name}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};


const ManageTimetable: React.FC = () => {
    const { currentUser } = useContext(AppContext) as AppContextType;
    const [facultyCourses, setFacultyCourses] = useState<Course[]>([]);
    const [facultyTimetable, setFacultyTimetable] = useState<TimetableSlot[]>([]);
    const [courseId, setCourseId] = useState('');
    const [day, setDay] = useState<'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'>('Monday');
    const [startTime, setStartTime] = useState('');
    const [endTime, setEndTime] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, "courses"), where("facultyId", "==", currentUser.id));
        const unsubCourses = onSnapshot(q, (snap) => setFacultyCourses(snap.docs.map(d => ({id: d.id, ...d.data()}) as Course)));

        const courseIds = facultyCourses.map(c => c.id);
        if (courseIds.length > 0) {
            const tq = query(collection(db, "timetable"), where("courseId", "in", courseIds));
            const unsubTimetable = onSnapshot(tq, (snap) => setFacultyTimetable(snap.docs.map(d => ({id: d.id, ...d.data()}) as TimetableSlot)));
            return () => unsubTimetable();
        }
        return () => unsubCourses();
    }, [currentUser, facultyCourses.length]);


    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const formatTime12Hour = (time: string) => {
        if (!time) return '';
        const [hours, minutes] = time.split(':');
        let h = parseInt(hours, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h || 12; // Handle midnight (0) and noon (12)
        return `${h}:${minutes} ${ampm}`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        if (!courseId || !day || !startTime || !endTime) {
            setError('All fields are required.');
            setLoading(false);
            return;
        }
        if (startTime >= endTime) {
            setError('End time must be after start time.');
            setLoading(false);
            return;
        }

        try {
            await addDoc(collection(db, 'timetable'), { courseId, day, startTime, endTime });
            const courseName = facultyCourses.find(c => c.id === courseId)?.name;
            setMessage(`Successfully added class for ${courseName} on ${day}.`);
            setStartTime('');
            setEndTime('');
        } catch (err) {
            setError("Failed to add slot. Please try again.");
        }

        setLoading(false);
        setTimeout(() => setMessage(''), 3000);
    };

    return (
        <div className="space-y-8">
            <div className="bg-primary p-6 sm:p-8 rounded-lg shadow-xl">
                <h3 className="text-xl sm:text-2xl font-bold text-highlight mb-6">Add New Class Slot</h3>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="course" className="block mb-2 text-sm font-medium text-text-secondary">Course</label>
                        <select id="course" value={courseId} onChange={e => setCourseId(e.target.value)} className="bg-accent border border-gray-600 text-text-primary text-sm rounded-lg focus:ring-highlight focus:border-highlight block w-full p-2.5">
                            <option value="">Select Course</option>
                            {facultyCourses.map(course => <option key={course.id} value={course.id}>{course.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="day" className="block mb-2 text-sm font-medium text-text-secondary">Day of Week</label>
                        <select id="day" value={day} onChange={e => setDay(e.target.value as any)} className="bg-accent border border-gray-600 text-text-primary text-sm rounded-lg focus:ring-highlight focus:border-highlight block w-full p-2.5">
                            {daysOfWeek.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="start-time" className="block mb-2 text-sm font-medium text-text-secondary">Start Time</label>
                        <input type="time" id="start-time" value={startTime} onChange={e => setStartTime(e.target.value)} className="bg-accent border border-gray-600 text-text-primary text-sm rounded-lg focus:ring-highlight focus:border-highlight block w-full p-2.5" />
                    </div>
                    <div>
                        <label htmlFor="end-time" className="block mb-2 text-sm font-medium text-text-secondary">End Time</label>
                        <input type="time" id="end-time" value={endTime} onChange={e => setEndTime(e.target.value)} className="bg-accent border border-gray-600 text-text-primary text-sm rounded-lg focus:ring-highlight focus:border-highlight block w-full p-2.5" />
                    </div>
                    <div className="md:col-span-2">
                        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
                        {message && <p className="text-green-400 text-sm mb-2">{message}</p>}
                        <button type="submit" disabled={loading} className="w-full md:w-auto bg-highlight hover:bg-teal-500 text-white font-bold py-2 px-6 rounded-lg transition disabled:bg-gray-500 flex justify-center items-center">
                            {loading ? <Spinner /> : 'Add Slot'}
                        </button>
                    </div>
                </form>
            </div>

            <div className="bg-primary p-6 rounded-lg shadow-xl">
                 <h3 className="text-xl sm:text-2xl font-bold text-highlight mb-4">My Weekly Timetable</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {daysOfWeek.map(day => (
                        <div key={day}>
                            <h4 className="font-bold text-center border-b-2 border-accent pb-2 mb-2">{day}</h4>
                            <div className="space-y-2">
                                {facultyTimetable.filter(slot => slot.day === day)
                                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                                    .map(slot => (
                                    <div key={slot.id} className="bg-secondary p-2 rounded-md text-sm text-center">
                                        <p className="font-semibold">{facultyCourses.find(c => c.id === slot.courseId)?.name}</p>
                                        <p className="text-text-secondary">{formatTime12Hour(slot.startTime)} - {formatTime12Hour(slot.endTime)}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const AttendanceReports: React.FC = () => {
    const { currentUser } = useContext(AppContext) as AppContextType;
    const [selectedCourseId, setSelectedCourseId] = useState<string>('');
    const [facultyCourses, setFacultyCourses] = useState<Course[]>([]);
    const [reportData, setReportData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!currentUser) return;
        const q = query(collection(db, "courses"), where("facultyId", "==", currentUser.id));
        const unsub = onSnapshot(q, (snap) => setFacultyCourses(snap.docs.map(d => ({id: d.id, ...d.data()}) as Course)));
        return () => unsub();
    }, [currentUser]);

    useEffect(() => {
        const generateReport = async () => {
            if (!selectedCourseId) {
                setReportData([]);
                return;
            };
            setLoading(true);

            const courseDoc = await getDoc(doc(db, 'courses', selectedCourseId));
            const studentIds = (courseDoc.data() as Course)?.studentIds || [];
            if(studentIds.length === 0) {
                setReportData([]);
                setLoading(false);
                return;
            }
            
            const studentsQuery = query(collection(db, 'users'), where('__name__', 'in', studentIds));
            const studentsSnap = await getDocs(studentsQuery);
            const students = studentsSnap.docs.map(d => ({id: d.id, ...d.data()}) as User);

            const attendanceQuery = query(collection(db, 'attendance'), where('courseId', '==', selectedCourseId));
            const attendanceSnap = await getDocs(attendanceQuery);
            const allRecords = attendanceSnap.docs.map(d => d.data());
            const totalClasses = [...new Set(allRecords.map(r => r.date))].length || 1;
            
            const data = students.map(student => {
                const presentCount = allRecords.filter(r => r.studentId === student.id && r.status === 'present').length;
                const percentage = Math.round((presentCount / totalClasses) * 100);
                return { ...student, presentCount, totalClasses, percentage };
            });

            setReportData(data);
            setLoading(false);
        };
        generateReport();
    }, [selectedCourseId]);

    return (
        <div className="bg-primary p-6 sm:p-8 rounded-lg shadow-xl">
            <h3 className="text-xl sm:text-2xl font-bold text-highlight mb-4">Attendance Reports</h3>
            <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="bg-accent border border-gray-600 text-text-primary text-sm rounded-lg focus:ring-highlight focus:border-highlight block w-full md:w-1/2 lg:w-1/3 p-2.5 mb-6"
            >
                <option value="">-- Select a Course --</option>
                {facultyCourses.map(course => (
                    <option key={course.id} value={course.id}>{course.name}</option>
                ))}
            </select>
            {loading ? <div className="flex justify-center"><Spinner /></div> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-text-secondary">
                        <thead className="text-xs text-text-primary uppercase bg-accent">
                            <tr>
                                <th scope="col" className="px-6 py-3">Student Name</th>
                                <th scope="col" className="px-6 py-3">Attendance %</th>
                                <th scope="col" className="px-6 py-3">Classes Attended</th>
                                <th scope="col" className="px-6 py-3">Total Classes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reportData.length === 0 && (
                                <tr><td colSpan={4} className="text-center py-4">No students enrolled or no classes held.</td></tr>
                            )}
                            {reportData.sort((a,b) => a.name.localeCompare(b.name)).map(student => (
                                <tr key={student.id} className="bg-primary border-b border-gray-700">
                                    <th scope="row" className="px-6 py-4 font-medium text-text-primary whitespace-nowrap">{student.name}</th>
                                    <td className="px-6 py-4">{student.percentage}%</td>
                                    <td className="px-6 py-4">{student.presentCount}</td>
                                    <td className="px-6 py-4">{student.totalClasses}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const resizeImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
        let img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 400;
            const MAX_HEIGHT = 400;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx!.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
    });
};

const RegisterFaceModal: React.FC<{
    student: User;
    onClose: () => void;
    onSuccess: (updatedStudent: User) => void;
}> = ({ student, onClose, onSuccess }) => {
    const webcamRef = useRef<Webcam>(null);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const capture = useCallback(() => {
        const image = webcamRef.current?.getScreenshot();
        if (image) setImageSrc(image);
    }, [webcamRef]);

    const handleSubmit = async () => {
        if (!imageSrc) return;
        setLoading(true);
        setError('');

        try {
            const imageBlob = dataUrlToBlob(imageSrc);
            await registerFace(student.id, imageBlob);

            const resizedImage = await resizeImage(imageSrc);
            const storageRef = ref(storage, `profile_pictures/${student.id}.jpg`);
            await uploadString(storageRef, resizedImage, 'data_url');
            const faceImageUrl = await getDownloadURL(storageRef);

            const userDocRef = doc(db, 'users', student.id);
            await updateDoc(userDocRef, { faceImageUrl });
            
            onSuccess({ ...student, faceImageUrl });
            onClose();

        } catch (err) {
            console.error("Face registration failed:", err);
            const message = err instanceof Error ? err.message : "An unknown error occurred.";
            setError(`Failed to register face. ${message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-secondary rounded-lg shadow-2xl p-6 w-full max-w-md flex flex-col">
                <h3 className="text-xl font-bold text-highlight mb-2">Register Face for {student.name}</h3>
                <p className="text-sm text-text-secondary mb-4">Position the student's face in the center and capture a clear photo.</p>
                
                <div className="my-4 rounded-lg overflow-hidden aspect-square max-w-sm mx-auto bg-accent">
                    {imageSrc ? (
                        <img src={imageSrc} alt="Captured face" className="w-full h-full object-cover"/>
                    ) : (
                        <Webcam
                            audio={false}
                            ref={webcamRef}
                            screenshotFormat="image/jpeg"
                            videoConstraints={{ facingMode: "user" }}
                            className="w-full h-full object-cover"
                            mirrored={false}
                            forceScreenshotSourceSize={false}
                            imageSmoothing={true}
                            disablePictureInPicture={false}
                            onUserMedia={() => {}}
                            onUserMediaError={() => {}}
                            screenshotQuality={0.92}
                        />
                    )}
                </div>

                <div className="flex justify-center space-x-4">
                    {imageSrc ? (
                        <button onClick={() => setImageSrc(null)} className="w-1/2 flex justify-center items-center py-3 px-4 rounded-md text-white bg-accent hover:bg-gray-600 transition">Retake Photo</button>
                    ) : (
                        <button onClick={capture} className="w-1/2 flex justify-center items-center py-3 px-4 rounded-md text-white bg-secondary hover:bg-gray-900 transition"><CameraIcon/> <span className="ml-2">Capture</span></button>
                    )}
                    <button onClick={handleSubmit} disabled={!imageSrc || loading} className="w-1/2 flex justify-center items-center py-3 px-4 rounded-md text-white bg-highlight hover:bg-teal-500 transition disabled:bg-gray-500 disabled:cursor-not-allowed">
                        {loading ? <Spinner /> : 'Submit'}
                    </button>
                </div>
                 {error && <p className="text-red-400 text-center text-sm mt-4">{error}</p>}

                 <button onClick={onClose} className="mt-4 w-full bg-accent hover:bg-gray-600 text-white font-bold py-2 px-4 rounded">
                    Cancel
                </button>
            </div>
        </div>
    );
};


const ManageStudents: React.FC = () => {
    const [students, setStudents] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState<User | null>(null);

    useEffect(() => {
        const fetchStudents = async () => {
            setLoading(true);
            const q = query(collection(db, 'users'), where('role', '==', 'student'));
            const querySnapshot = await getDocs(q);
            setStudents(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
            setLoading(false);
        };
        fetchStudents();
    }, []);

    const handleDelete = async (studentId: string, studentName: string) => {
        if (window.confirm(`Are you sure you want to delete ${studentName}? This will remove their data and they won't be able to log in.`)) {
            try {
                await deleteDoc(doc(db, 'users', studentId));
                setStudents(prev => prev.filter(s => s.id !== studentId));
                // Note: This does not delete the user from Firebase Authentication.
                // A cloud function would be required for a full user deletion.
            } catch (error) {
                console.error("Error deleting student: ", error);
                alert("Failed to delete student.");
            }
        }
    };

    if (loading) return <div className="flex justify-center"><Spinner /></div>;

    return (
        <div className="bg-primary p-6 sm:p-8 rounded-lg shadow-xl">
            <h3 className="text-xl sm:text-2xl font-bold text-highlight mb-6">Manage Students</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-text-secondary">
                    <thead className="text-xs text-text-primary uppercase bg-accent">
                        <tr>
                            <th scope="col" className="px-6 py-3">Name</th>
                            <th scope="col" className="px-6 py-3">Email</th>
                            <th scope="col" className="px-6 py-3">Roll No.</th>
                            <th scope="col" className="px-6 py-3">Section</th>
                            <th scope="col" className="px-6 py-3">Biometric Status</th>
                            <th scope="col" className="px-6 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.length === 0 && (
                            <tr><td colSpan={6} className="text-center py-4">No students have signed up yet.</td></tr>
                        )}
                        {students.sort((a,b) => a.name.localeCompare(b.name)).map(student => (
                            <tr key={student.id} className="bg-primary border-b border-gray-700 hover:bg-secondary">
                                <td className="px-6 py-4 font-medium text-text-primary whitespace-nowrap">{student.name}</td>
                                <td className="px-6 py-4">{student.email}</td>
                                <td className="px-6 py-4">{student.rollNo}</td>
                                <td className="px-6 py-4">{student.section}</td>
                                <td className="px-6 py-4">
                                    {student.faceImageUrl ? (
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-200 text-green-800">
                                            Registered
                                        </span>
                                    ) : (
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-200 text-yellow-800">
                                            Not Registered
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap space-x-4">
                                    <button 
                                        onClick={() => {
                                            setSelectedStudent(student);
                                            setIsRegisterModalOpen(true);
                                        }}
                                        className="text-highlight hover:underline font-medium"
                                    >
                                        {student.faceImageUrl ? 'Update Face' : 'Register Face'}
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(student.id, student.name)}
                                        className="text-red-400 hover:underline font-medium"
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
             {isRegisterModalOpen && selectedStudent && (
                <RegisterFaceModal
                    student={selectedStudent}
                    onClose={() => setIsRegisterModalOpen(false)}
                    onSuccess={(updatedStudent) => {
                        setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
                        setIsRegisterModalOpen(false);
                    }}
                />
            )}
        </div>
    );
};

export default FacultyDashboard;