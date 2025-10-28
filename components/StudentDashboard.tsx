import React, { useState, useContext, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { AppContext } from '../App';
import { AppContextType, Course, QrCodeData, AttendanceRecord, TimetableSlot } from '../types';
import { calculateDistance, getCurrentPosition } from '../services/locationService';
import { QrCodeIcon, CalendarIcon, ChartBarIcon, LogoutIcon, Spinner, CheckCircleIcon, XCircleIcon, MenuIcon } from './common/icons';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion, setDoc } from 'firebase/firestore';

const StudentDashboard: React.FC = () => {
    const { currentUser, handleLogout } = useContext(AppContext) as AppContextType;
    const [activeTab, setActiveTab] = useState('scan');
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    const renderContent = () => {
        switch (activeTab) {
            case 'scan':
                return <ScanAttendance />;
            case 'attendance':
                return <MyAttendance />;
            case 'timetable':
                return <MyTimetable />;
            default:
                return null;
        }
    };

    return (
        <div className="flex h-screen bg-secondary">
            <div className={`fixed inset-0 z-20 bg-black bg-opacity-50 md:hidden ${isSidebarOpen ? 'block' : 'hidden'}`} onClick={() => setSidebarOpen(false)}></div>
            <nav className={`fixed inset-y-0 left-0 z-30 w-64 bg-primary p-5 flex flex-col justify-between transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-300 ease-in-out`}>
                <div>
                    <h1 className="text-2xl font-bold text-highlight mb-10">Student Portal</h1>
                    <ul>
                        <li className={`mb-4 cursor-pointer p-2 rounded ${activeTab === 'scan' ? 'bg-accent' : ''}`} onClick={() => { setActiveTab('scan'); setSidebarOpen(false); }}>
                            <a href="#" className="flex items-center space-x-3"><QrCodeIcon /> <span>Scan QR</span></a>
                        </li>
                        <li className={`mb-4 cursor-pointer p-2 rounded ${activeTab === 'attendance' ? 'bg-accent' : ''}`} onClick={() => { setActiveTab('attendance'); setSidebarOpen(false); }}>
                            <a href="#" className="flex items-center space-x-3"><ChartBarIcon /> <span>My Attendance</span></a>
                        </li>
                        <li className={`mb-4 cursor-pointer p-2 rounded ${activeTab === 'timetable' ? 'bg-accent' : ''}`} onClick={() => { setActiveTab('timetable'); setSidebarOpen(false); }}>
                            <a href="#" className="flex items-center space-x-3"><CalendarIcon /> <span>Timetable</span></a>
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

const ScanAttendance: React.FC = () => {
    const [showScanner, setShowScanner] = useState(false);
    return (
        <div className="bg-primary p-6 sm:p-8 rounded-lg shadow-xl">
            <h3 className="text-xl sm:text-2xl font-bold text-highlight mb-4">Mark Your Attendance</h3>
            <p className="text-text-secondary mb-6">Click the button below to open the camera and scan the QR code presented by your faculty.</p>
            <button onClick={() => setShowScanner(true)} className="bg-highlight hover:bg-teal-500 text-white font-bold py-3 px-6 rounded-lg transition">
                Scan QR Code
            </button>
            {showScanner && <ScannerModal onClose={() => setShowScanner(false)} />}
        </div>
    );
};

const ScannerModal: React.FC<{onClose: () => void}> = ({ onClose }) => {
    const { currentUser } = useContext(AppContext) as AppContextType;
    const [step, setStep] = useState<'scanning' | 'verifying_location' | 'result'>('scanning');
    const [result, setResult] = useState<{success: boolean; message: string} | null>(null);

    const scannerRef = useRef<HTMLDivElement>(null);
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

    const handleScanSuccess = useCallback(async (decodedText: string) => {
        if (html5QrCodeRef.current) {
            try {
                await html5QrCodeRef.current.stop();
            } catch(err) {
                console.error("Failed to stop scanner", err);
            }
        }

        setStep('verifying_location');
        try {
            const parsedQrData: QrCodeData = JSON.parse(decodedText);
            
            if (Date.now() - parsedQrData.timestamp > 30000) { // Increased validity to 30s
                setResult({ success: false, message: 'Expired QR Code. Please scan the new one.' });
                setStep('result');
                return;
            }

            const studentPosition = await getCurrentPosition();
            const distance = calculateDistance(
                studentPosition.coords.latitude,
                studentPosition.coords.longitude,
                parsedQrData.location.latitude,
                parsedQrData.location.longitude
            );

            if (distance > 20) { // Increased range to 20m
                 setResult({ success: false, message: `You are ${Math.round(distance)}m away. Must be within 20m to mark attendance.` });
                 setStep('result');
                 return;
            }
            
            const today = new Date().toISOString().split('T')[0];
            const attendanceId = `${currentUser!.id}_${parsedQrData.courseId}_${today}`;
            const attendanceRef = doc(db, 'attendance', attendanceId);
            
            await setDoc(attendanceRef, {
                studentId: currentUser!.id,
                courseId: parsedQrData.courseId,
                date: today,
                status: 'present',
                markedBy: parsedQrData.facultyId,
            });

            const courseRef = doc(db, 'courses', parsedQrData.courseId);
            await updateDoc(courseRef, {
                studentIds: arrayUnion(currentUser!.id)
            });

            setResult({ success: true, message: 'Attendance marked successfully!' });
            setStep('result');

        } catch (error) {
            const message = error instanceof Error ? error.message : "An unknown error occurred.";
            setResult({ success: false, message: `Verification failed: ${message}` });
            setStep('result');
        }
    }, [currentUser]);
    
    useEffect(() => {
        if (step === 'scanning' && scannerRef.current && !html5QrCodeRef.current) {
            const html5QrCode = new Html5Qrcode(scannerRef.current.id);
            html5QrCodeRef.current = html5QrCode;
            html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: (viewfinderWidth, viewfinderHeight) => {
                        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                        const qrboxSize = Math.floor(minEdge * 0.8);
                        return { width: qrboxSize, height: qrboxSize };
                    }
                },
                handleScanSuccess,
                (errorMessage) => { /* ignore errors */ }
            ).catch(err => {
                console.error("Unable to start scanning.", err);
                setStep('result');
                setResult({ success: false, message: "Could not start camera. Please grant permission and try again." });
            });
        }

        return () => {
            if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
                html5QrCodeRef.current.stop().catch(err => console.error("Error stopping scanner on cleanup", err));
                html5QrCodeRef.current = null;
            }
        };
    }, [step, handleScanSuccess]);

    const VerificationStepper = ({ currentStep }: { currentStep: typeof step }) => {
        const steps = ['Scan QR', 'Location'];
        let activeIndex = 0;
        if (currentStep === 'verifying_location') activeIndex = 1;
        else if (currentStep === 'result') activeIndex = 2;

        return (
            <div className="w-full px-4 sm:px-8 mb-6">
                <div className="flex items-center">
                    {steps.map((stepName, i) => (
                        <React.Fragment key={stepName}>
                            <div className="flex flex-col items-center">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${i <= activeIndex ? 'bg-highlight' : 'bg-accent'}`}>
                                    {i < activeIndex ? 
                                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg> :
                                        <span className="text-white font-bold">{i + 1}</span>
                                    }
                                </div>
                                <p className={`mt-2 text-xs text-center font-semibold transition-colors duration-300 ${i <= activeIndex ? 'text-text-primary' : 'text-text-secondary'}`}>{stepName}</p>
                            </div>
                            {i < steps.length - 1 && <div className={`flex-grow h-1 transition-colors duration-300 mx-2 ${i < activeIndex ? 'bg-highlight' : 'bg-accent'}`}></div>}
                        </React.Fragment>
                    ))}
                </div>
            </div>
        );
    };
    
    const renderStepContent = () => {
        switch(step) {
            case 'scanning':
                return <>
                    <p className="text-text-secondary mb-4 text-center">Point your camera at the QR code.</p>
                    <div id="qr-reader" ref={scannerRef} className="w-full h-auto rounded-lg overflow-hidden"></div>
                </>;
            case 'verifying_location':
                 return <div className="text-center p-8 flex flex-col items-center justify-center min-h-[250px]">
                     <Spinner />
                     <p className="mt-4 text-lg">Verifying your location...</p>
                 </div>;
            case 'result':
                return <div className="text-center p-8 flex flex-col items-center justify-center min-h-[250px]">
                    {result?.success ? <CheckCircleIcon /> : <XCircleIcon />}
                    <p className="mt-4 text-lg">{result?.message}</p>
                </div>;
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-secondary rounded-lg shadow-2xl p-6 w-full max-w-md flex flex-col items-center">
                <VerificationStepper currentStep={step} />
                <div className="w-full">
                  {renderStepContent()}
                </div>
                <button onClick={onClose} className="mt-4 w-full bg-accent hover:bg-gray-600 text-white font-bold py-2 px-4 rounded">
                    Close
                </button>
            </div>
        </div>
    );
};


const MyAttendance: React.FC = () => {
    const { currentUser } = useContext(AppContext) as AppContextType;
    const [courses, setCourses] = useState<Course[]>([]);
    const [attendance, setAttendance] = useState<{[courseId: string]: AttendanceRecord[]}>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (!currentUser) return;
            setLoading(true);
            try {
                const coursesQuery = query(collection(db, 'courses'), where('studentIds', 'array-contains', currentUser.id));
                const courseSnapshot = await getDocs(coursesQuery);
                const studentCourses = courseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course));
                setCourses(studentCourses);

                const attendanceData: {[courseId: string]: AttendanceRecord[]} = {};
                for (const course of studentCourses) {
                    const attendanceQuery = query(collection(db, 'attendance'), where('studentId', '==', currentUser.id), where('courseId', '==', course.id));
                    const attendanceSnapshot = await getDocs(attendanceQuery);
                    attendanceData[course.id] = attendanceSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}) as AttendanceRecord);
                }
                setAttendance(attendanceData);
            } catch (error) {
                console.error("Error fetching attendance data: ", error);
            }
            setLoading(false);
        };
        fetchData();
    }, [currentUser]);

    if(loading) return <div className="flex justify-center items-center"><Spinner /></div>;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {courses.length === 0 && <p className="text-text-secondary md:col-span-2">Your attendance will appear here once you scan into a class.</p>}
            {courses.map(course => {
                const records = attendance[course.id] || [];
                const presentCount = records.filter(r => r.status === 'present').length;
                const totalClasses = records.length > 0 ? records.length : 1;
                const percentage = Math.round((presentCount / totalClasses) * 100);

                return (
                    <div key={course.id} className="bg-primary p-6 rounded-lg shadow-xl">
                        <h4 className="text-xl font-bold text-highlight">{course.name}</h4>
                        <p className="text-4xl font-bold my-4">{percentage}%</p>
                        <div className="w-full bg-accent rounded-full h-2.5">
                            <div className="bg-highlight h-2.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                        </div>
                        <p className="text-text-secondary mt-2">{presentCount} out of {records.length} classes attended.</p>
                    </div>
                );
            })}
        </div>
    );
};

const MyTimetable: React.FC = () => {
    const { currentUser } = useContext(AppContext) as AppContextType;
    const [timetable, setTimetable] = useState<TimetableSlot[]>([]);
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTimetable = async () => {
            if(!currentUser) return;
            setLoading(true);
            try {
                const coursesQuery = query(collection(db, 'courses'), where('studentIds', 'array-contains', currentUser.id));
                const courseSnapshot = await getDocs(coursesQuery);
                const studentCourses = courseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Course));
                setCourses(studentCourses);

                if (studentCourses.length > 0) {
                    const courseIds = studentCourses.map(c => c.id);
                    const timetableQuery = query(collection(db, 'timetable'), where('courseId', 'in', courseIds));
                    const timetableSnapshot = await getDocs(timetableQuery);
                    setTimetable(timetableSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}) as TimetableSlot));
                }
            } catch (error) {
                console.error("Error fetching timetable:", error);
            }
            setLoading(false);
        };
        fetchTimetable();
    }, [currentUser]);

    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const getCourseName = (courseId: string) => courses.find(c => c.id === courseId)?.name || 'Unknown Course';

    const formatTime12Hour = (time: string) => {
        if (!time) return '';
        const [hours, minutes] = time.split(':');
        let h = parseInt(hours, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h || 12; // Handle midnight (0) and noon (12)
        return `${h}:${minutes} ${ampm}`;
    };

    if (loading) return <div className="flex justify-center items-center"><Spinner/></div>

    return (
        <div className="bg-primary p-6 rounded-lg shadow-xl">
            <h3 className="text-2xl font-bold text-highlight mb-4">Weekly Timetable</h3>
            {timetable.length === 0 && <p className="text-text-secondary">Your timetable will appear here as you are added to courses.</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {days.map(day => (
                    <div key={day}>
                        <h4 className="font-bold text-center border-b-2 border-accent pb-2 mb-2">{day}</h4>
                        <div className="space-y-2">
                            {timetable.filter(slot => slot.day === day)
                                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                                .map(slot => (
                                <div key={slot.id} className="bg-secondary p-2 rounded-md text-sm text-center">
                                    <p className="font-semibold">{getCourseName(slot.courseId)}</p>
                                    <p className="text-text-secondary">{formatTime12Hour(slot.startTime)} - {formatTime12Hour(slot.endTime)}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


export default StudentDashboard;