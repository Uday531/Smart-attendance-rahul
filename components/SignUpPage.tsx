import React, { useState, useCallback, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Role, User } from '../types';
import { Spinner, CheckCircleIcon, CameraIcon, XCircleIcon, EyeIcon, EyeOffIcon } from './common/icons';
import { auth, db, storage } from '../services/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';

interface SignUpPageProps {
  onSignUpSuccess: (user: User) => void;
  onNavigateToLogin: () => void;
}

type SubmissionStage = 'idle' | 'creating_auth' | 'uploading_photo' | 'saving_user_data' | 'complete';

const SignUpPage: React.FC<SignUpPageProps> = ({ onSignUpSuccess, onNavigateToLogin }) => {
  const [step, setStep] = useState<'details' | 'faceCapture' | 'submitting' | 'success'>('details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rollNo, setRollNo] = useState('');
  const [section, setSection] = useState('');
  const [role, setRole] = useState<Role>(Role.Student);
  const [error, setError] = useState('');
  const [submissionStage, setSubmissionStage] = useState<SubmissionStage>('idle');
  
  const webcamRef = useRef<Webcam>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [zoom, setZoom] = useState(1);
  const [zoomCapabilities, setZoomCapabilities] = useState<{min: number, max: number, step: number} | null>(null);

  const [isSecureContextForCamera, setIsSecureContextForCamera] = useState(true);

  // Check for secure context as soon as the component loads
  useEffect(() => {
    if (window.isSecureContext === false && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      setIsSecureContextForCamera(false);
    }
  }, []);


  // Reset camera state when switching to face capture step
  useEffect(() => {
    if (step === 'faceCapture') {
      setIsCameraLoading(true);
      setCameraError(null);
      setImgSrc(null);
    }
  }, [step]);


  const capture = useCallback(() => {
    if (webcamRef.current && webcamRef.current.video) {
        const video = webcamRef.current.video;
        // Create a canvas to draw the video frame onto
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
            // Draw the current video frame to the canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Convert the canvas to a compressed JPEG data URL
            // The second argument is the quality, from 0 to 1.
            // 0.8 provides good compression with minimal quality loss.
            const compressedImageSrc = canvas.toDataURL('image/jpeg', 0.8);
            setImgSrc(compressedImageSrc);
        } else {
             setCameraError("Could not process image. Please try again.");
        }
    } else {
        setCameraError("Could not capture image. Please try again.");
    }
  }, [webcamRef]);

  const handleDetailsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Name, email, and password cannot be empty.');
      return;
    }
    
    if (role === Role.Student && (!rollNo.trim() || !section.trim())) {
      setError('Roll No. and Section are required for students.');
      return;
    }
    
    if (password.length < 6) {
        setError('Password should be at least 6 characters.');
        return;
    }

    if (role === Role.Student) {
        setStep('faceCapture');
    } else {
        handleFinalSubmit(); // Faculty skips face capture
    }
  };
  
  const handleFinalSubmit = async () => {
    setError('');
    setStep('submitting');
    try {
        setSubmissionStage('creating_auth');
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const firebaseUser = userCredential.user;

        let faceImageUrl: string | undefined = undefined;
        if (imgSrc && role === Role.Student) {
            setSubmissionStage('uploading_photo');
            const storageRef = ref(storage, `user_faces/${firebaseUser.uid}.jpg`);
            await uploadString(storageRef, imgSrc, 'data_url');
            faceImageUrl = await getDownloadURL(storageRef);
        }
        
        setSubmissionStage('saving_user_data');
        const userData: Omit<User, 'id'> = {
            name,
            email,
            role,
            ...(role === Role.Student && { rollNo, section, faceImageUrl }),
        };

        await setDoc(doc(db, "users", firebaseUser.uid), userData);
        
        setSubmissionStage('complete');
        setStep('success');
        setTimeout(() => {
            onSignUpSuccess({ id: firebaseUser.uid, ...userData });
        }, 1500);

    } catch (err: any) {
        if(err.code === 'auth/email-already-in-use') {
            setError('An account with this email already exists.');
        } else if (err.code === 'auth/weak-password') {
            setError('Password should be at least 6 characters.');
        } else {
            setError('Failed to create account. Please try again.');
        }
        setSubmissionStage('idle');
        setStep('details'); // Go back to details page on error
    }
  };

  const onUserMedia = () => {
    setIsCameraLoading(false);
    if (webcamRef.current && webcamRef.current.stream) {
      const stream = webcamRef.current.stream;
      if (stream) {
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();
        // @ts-ignore
        if (capabilities.zoom) {
            // @ts-ignore
            setZoomCapabilities({ min: capabilities.zoom.min, max: capabilities.zoom.max, step: capabilities.zoom.step });
            // @ts-ignore
            setZoom(capabilities.zoom.value || 1);
        }
      }
    }
  };

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (webcamRef.current && webcamRef.current.stream) {
        const newZoom = parseFloat(e.target.value);
        setZoom(newZoom);
        const stream = webcamRef.current.stream;
        if (stream) {
            const track = stream.getVideoTracks()[0];
            // @ts-ignore
            track.applyConstraints({ advanced: [{ zoom: newZoom }] });
        }
    }
  };
  
  const renderDetailsForm = () => {
    const isNextDisabled = role === Role.Student && !isSecureContextForCamera;
    
    return (
    <div>
      <h2 className="text-3xl font-bold text-center text-highlight">Create Account</h2>
      <form onSubmit={handleDetailsSubmit} className="space-y-4 mt-8">
        <div>
          <label htmlFor="name" className="text-sm font-bold text-gray-400 block">Full Name</label>
          <input type="text" id="name" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full p-3 mt-1 text-gray-200 bg-accent rounded-md focus:outline-none focus:ring-2 focus:ring-highlight" required />
        </div>
        <div>
          <label htmlFor="email" className="text-sm font-bold text-gray-400 block">Email</label>
          <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full p-3 mt-1 text-gray-200 bg-accent rounded-md focus:outline-none focus:ring-2 focus:ring-highlight" required />
        </div>
         <div>
          <label htmlFor="password" className="text-sm font-bold text-gray-400 block">Password</label>
            <div className="relative">
                <input 
                    type={showPassword ? 'text' : 'password'}
                    id="password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-3 mt-1 pr-10 text-gray-200 bg-accent rounded-md focus:outline-none focus:ring-2 focus:ring-highlight" 
                    required 
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-white"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
            </div>
        </div>
        <div>
          <label htmlFor="role" className="text-sm font-bold text-gray-400 block">I am a...</label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value as Role)}
            className="w-full p-3 mt-1 text-gray-200 bg-accent rounded-md focus:outline-none focus:ring-2 focus:ring-highlight">
            <option value={Role.Student}>Student</option>
            <option value={Role.Faculty}>Faculty</option>
          </select>
        </div>

        {role === Role.Student && (
            <>
              <div>
                  <label htmlFor="rollNo" className="text-sm font-bold text-gray-400 block">Roll Number</label>
                  <input type="text" id="rollNo" value={rollNo} onChange={(e) => setRollNo(e.target.value)}
                  className="w-full p-3 mt-1 text-gray-200 bg-accent rounded-md focus:outline-none focus:ring-2 focus:ring-highlight" required />
              </div>
               <div>
                  <label htmlFor="section" className="text-sm font-bold text-gray-400 block">Section</label>
                  <input type="text" id="section" value={section} onChange={(e) => setSection(e.target.value)}
                  className="w-full p-3 mt-1 text-gray-200 bg-accent rounded-md focus:outline-none focus:ring-2 focus:ring-highlight" required />
              </div>
            </>
        )}

        {isNextDisabled && (
            <div className="p-4 bg-red-900 bg-opacity-50 text-red-300 border border-red-700 rounded-md text-sm text-center">
                <p className="font-bold">Camera Required for Student Sign-Up</p>
                <p className="mt-1">To continue, please access this page via a secure (HTTPS) connection.</p>
            </div>
        )}

        {error && <p className="text-red-400 text-center text-sm">{error}</p>}
        <div className="pt-2">
          <button type="submit" disabled={isNextDisabled} className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-highlight hover:bg-teal-500 transition disabled:bg-gray-500 disabled:cursor-not-allowed">
            {role === Role.Student ? 'Next' : 'Create Account'}
          </button>
        </div>
      </form>
    </div>
  );
  }
  
  const renderFaceCapture = () => (
      <div>
        <h2 className="text-3xl font-bold text-center text-highlight">Capture Your Photo</h2>
        <p className="text-center text-text-secondary mt-2">Make sure your face is well-lit and centered.</p>
        <div className="mt-6 relative flex justify-center items-center bg-accent rounded-lg overflow-hidden h-64 w-full">
            {imgSrc ? (
                <img src={imgSrc} alt="Your selfie" className="h-full w-auto object-cover" />
            ) : (
                <>
                  {isCameraLoading && <Spinner />}
                  {cameraError && !isCameraLoading && (
                    <div className="text-center text-red-400 p-4 flex flex-col items-center">
                        <XCircleIcon />
                        <p className="mt-2 text-sm">{cameraError}</p>
                    </div>
                  )}
                  <Webcam
                      audio={false}
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      className={`absolute top-0 left-0 h-full w-full object-cover transition-opacity duration-300 ${isCameraLoading || cameraError ? 'opacity-0' : 'opacity-100'}`}
                      mirrored={true}
                      videoConstraints={{ facingMode: "user", width: 720, height: 720 }}
                      onUserMedia={onUserMedia}
                      onUserMediaError={(error) => {
                          setIsCameraLoading(false);
                          if (window.isSecureContext === false && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
                            setCameraError("Camera requires a secure connection (HTTPS). This site is not secure.");
                          } else {
                            setCameraError("Camera permission denied or not available. Please check your browser settings.");
                          }
                          console.error("Webcam Error:", error);
                      }}
                  />
                </>
            )}
        </div>
        {!imgSrc && !isCameraLoading && !cameraError && zoomCapabilities && (
            <div className="flex items-center gap-2 mt-4">
                <label htmlFor="zoom" className="text-sm text-text-secondary">Zoom</label>
                <input
                    id="zoom"
                    type="range"
                    min={zoomCapabilities.min}
                    max={zoomCapabilities.max}
                    step={zoomCapabilities.step}
                    value={zoom}
                    onChange={handleZoomChange}
                    className="w-full h-2 bg-accent rounded-lg appearance-none cursor-pointer"
                />
            </div>
        )}
        <div className="mt-6 flex gap-4">
            {imgSrc ? (
                <>
                    <button onClick={() => { setImgSrc(null); setIsCameraLoading(true); setCameraError(null); }} className="w-full py-3 px-4 rounded-md text-sm font-medium bg-accent hover:bg-gray-600 transition">Retake</button>
                    <button onClick={handleFinalSubmit} className="w-full flex justify-center items-center py-3 px-4 rounded-md text-sm font-medium text-white bg-highlight hover:bg-teal-500 transition">
                        Create Account
                    </button>
                </>
            ) : (
                <button 
                  onClick={capture} 
                  disabled={isCameraLoading || !!cameraError}
                  className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-md text-sm font-medium text-white bg-highlight hover:bg-teal-500 transition disabled:bg-gray-500 disabled:cursor-not-allowed">
                    <CameraIcon /> Capture Photo
                </button>
            )}
        </div>
         <div className="mt-4 text-center">
            <button onClick={() => setStep('details')} className="text-sm font-semibold text-text-secondary hover:text-highlight transition">
                Go Back
            </button>
        </div>
    </div>
  );

  const SubmissionStatus = ({ stage, isStudent }: { stage: SubmissionStage, isStudent: boolean }) => {
      const steps = [
        { id: 'creating_auth', text: 'Creating Your Account' },
        ...(isStudent ? [{ id: 'uploading_photo', text: 'Uploading Profile Photo' }] : []),
        { id: 'saving_user_data', text: 'Saving Your Details' },
      ];

      const stageOrder: SubmissionStage[] = ['creating_auth', 'uploading_photo', 'saving_user_data', 'complete'];
      const currentIndex = stageOrder.indexOf(stage);

      return (
        <div className="flex flex-col items-center justify-center p-4 min-h-[300px]">
            <h2 className="text-2xl font-bold text-highlight mb-8">Finalizing Account...</h2>
            <div className="space-y-4 w-full">
                {steps.map((step, index) => {
                    const stepIndex = stageOrder.indexOf(step.id as SubmissionStage);
                    const isCompleted = currentIndex > stepIndex;
                    const isCurrent = currentIndex === stepIndex;

                    return (
                        <div key={step.id} className="flex items-center space-x-4 transition-opacity duration-300">
                            <div className="flex-shrink-0">
                                {isCompleted ? <CheckCircleIcon /> : (isCurrent ? <Spinner /> : <div className="h-8 w-8"><div className="w-5 h-5 mt-1.5 ml-1.5 border-2 border-gray-500 rounded-full"></div></div>)}
                            </div>
                            <span className={`font-medium ${isCompleted ? 'text-green-400' : isCurrent ? 'text-text-primary' : 'text-text-secondary'}`}>
                                {step.text}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
      );
  };
  
  const renderSuccess = () => (
      <div className="text-center p-8 flex flex-col items-center min-h-[300px] justify-center">
        <CheckCircleIcon />
        <h2 className="text-2xl font-bold text-white mt-4">Registration Successful!</h2>
        <p className="text-gray-400">Redirecting to your dashboard...</p>
      </div>
  );

  const renderContent = () => {
    switch (step) {
        case 'details':
            return renderDetailsForm();
        case 'faceCapture':
            return renderFaceCapture();
        case 'submitting':
            return <SubmissionStatus stage={submissionStage} isStudent={role === Role.Student}/>;
        case 'success':
            return renderSuccess();
        default:
            return null;
    }
  };


  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary to-secondary px-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-secondary rounded-xl shadow-lg">
        {renderContent()}

        {step !== 'success' && step !== 'submitting' && (
          <div className="text-center text-text-secondary text-sm">
            <p>Already have an account?
              <button onClick={onNavigateToLogin} className="ml-1 font-semibold text-highlight hover:underline">
                Login
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SignUpPage;