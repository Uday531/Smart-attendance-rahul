
import React, { useState, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Role, User } from '../types';
import { Spinner, CheckCircleIcon, CameraIcon, EyeIcon, EyeOffIcon } from './common/icons';
import { auth, db, storage } from '../services/firebase';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
// FIX: The `createUserWithEmailAndPassword` is not a named export from `firebase/auth`. Using compat version.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { registerFace, dataUrlToBlob } from '../services/faceRecognitionService';

interface SignUpPageProps {
  onSignUpSuccess: (user: User) => void;
  onNavigateToLogin: () => void;
}

type SubmissionStage = 'idle' | 'creating_auth' | 'uploading_photo' | 'saving_user_data' | 'complete';

const SignUpPage: React.FC<SignUpPageProps> = ({ onSignUpSuccess, onNavigateToLogin }) => {
  const [step, setStep] = useState<'details' | 'photo' | 'submitting' | 'success'>('details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rollNo, setRollNo] = useState('');
  const [section, setSection] = useState('');
  const [role, setRole] = useState<Role>(Role.Student);
  const [error, setError] = useState('');
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [submissionStage, setSubmissionStage] = useState<SubmissionStage>('idle');
  const webcamRef = useRef<Webcam>(null);

  const capture = useCallback(() => {
    const image = webcamRef.current?.getScreenshot();
    if (image) {
      setImageSrc(image);
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
    setStep('photo');
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

  const handleFinalSubmit = async () => {
    if (!imageSrc) {
        setError('Please capture a photo to proceed.');
        return;
    }
    setError('');
    setStep('submitting');

    setSubmissionStage('creating_auth');
    let userCredential: firebase.auth.UserCredential;
    try {
        userCredential = await auth.createUserWithEmailAndPassword(email, password);
    } catch (err: any) {
        if (err.code === 'auth/email-already-in-use') setError('An account with this email already exists.');
        else if (err.code === 'auth/weak-password') setError('Password should be at least 6 characters.');
        else {
            console.error("Auth creation error:", err);
            setError('Failed to create account. Please try again.');
        }
        setSubmissionStage('idle');
        setStep('details');
        return;
    }

    const firebaseUser = userCredential.user;
    if (!firebaseUser) {
        setError('Failed to create account. Please try again.');
        setSubmissionStage('idle');
        setStep('details');
        return;
    }

    // Create user data object (without image URL initially)
    const userData: Omit<User, 'id' | 'faceImageUrl'> & { faceImageUrl?: string } = {
        name,
        email,
        role,
        ...(role === Role.Student && { rollNo, section }),
    };

    // Immediately create the Firestore document to prevent the race condition
    try {
        await setDoc(doc(db, "users", firebaseUser.uid), userData);
    } catch (dbError) {
        console.error("Firestore initial save error:", dbError);
        await firebaseUser.delete(); // Rollback Auth user
        setError('Failed to save your profile. Your account was not created. Please try again.');
        setSubmissionStage('idle');
        setStep('details');
        return;
    }

    // Now, perform the longer operations (face registration, image upload)
    setSubmissionStage('uploading_photo');
    let faceImageUrl = '';
    try {
        const imageBlob = dataUrlToBlob(imageSrc);
        await registerFace(firebaseUser.uid, imageBlob);

        const resizedImage = await resizeImage(imageSrc);
        const storageRef = ref(storage, `profile_pictures/${firebaseUser.uid}.jpg`);
        await uploadString(storageRef, resizedImage, 'data_url');
        faceImageUrl = await getDownloadURL(storageRef);
    } catch (err) {
        console.error("Face registration or photo upload failed:", err);
        // Rollback: delete Firestore doc and Auth user to keep DB consistent
        await deleteDoc(doc(db, "users", firebaseUser.uid));
        await firebaseUser.delete();
        
        const message = err instanceof Error ? err.message : 'An unknown error occurred';
        setError(`Failed to process your photo: ${message}. Your account was not created. Please try again.`);
        setSubmissionStage('idle');
        setStep('photo');
        return;
    }
    
    setSubmissionStage('saving_user_data');
    try {
        // Update the existing document with the new image URL
        const userDocRef = doc(db, "users", firebaseUser.uid);
        await updateDoc(userDocRef, { faceImageUrl });
        userData.faceImageUrl = faceImageUrl; // update local object
    } catch (dbError) {
        console.error("Firestore image URL update error:", dbError);
        // Don't rollback the whole account for this. The user exists, just without a profile pic URL.
        // This is a non-critical failure.
    }
    
    setSubmissionStage('complete');
    setStep('success');

    setTimeout(() => {
        onSignUpSuccess({ id: firebaseUser.uid, ...userData } as User);
    }, 1500);
  };
  
  const renderDetailsForm = () => (
    <div>
      <h2 className="text-3xl font-bold text-center text-highlight">Create Account (Step 1/2)</h2>
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
                <input type={showPassword ? 'text' : 'password'} id="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-3 mt-1 pr-10 text-gray-200 bg-accent rounded-md focus:outline-none focus:ring-2 focus:ring-highlight" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-white"
                    aria-label={showPassword ? "Hide password" : "Show password"}>
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
        {error && <p className="text-red-400 text-center text-sm">{error}</p>}
        <div className="pt-2">
          <button type="submit" className="w-full flex justify-center items-center py-3 px-4 rounded-md text-white bg-highlight hover:bg-teal-500 transition">
            Continue to Photo Capture
          </button>
        </div>
      </form>
    </div>
  );

  const renderPhotoStep = () => (
    <div>
        <h2 className="text-3xl font-bold text-center text-highlight">Profile Photo (Step 2/2)</h2>
        <p className="text-center text-sm text-text-secondary mt-2">Position your face in the center and click capture. This photo will be used for attendance verification.</p>
        <div className="my-4 rounded-lg overflow-hidden aspect-square max-w-sm mx-auto bg-accent">
            {imageSrc ? (
                <img src={imageSrc} alt="Captured face" className="w-full h-full object-cover"/>
            ) : (
                // FIX: Add missing required props to satisfy WebcamProps type due to a likely typing issue in the library.
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
            <button onClick={handleFinalSubmit} disabled={!imageSrc} className="w-1/2 flex justify-center items-center py-3 px-4 rounded-md text-white bg-highlight hover:bg-teal-500 transition disabled:bg-gray-500 disabled:cursor-not-allowed">
                Create Account
            </button>
        </div>
        {error && <p className="text-red-400 text-center text-sm mt-4">{error}</p>}
    </div>
  );

  const SubmissionStatus = ({ stage }: { stage: SubmissionStage }) => {
      const steps = [
        { id: 'creating_auth', text: 'Creating Your Account' },
        { id: 'uploading_photo', text: 'Securing Biometric Data' },
        { id: 'saving_user_data', text: 'Saving Your Details' },
      ];
      const stageOrder: SubmissionStage[] = ['creating_auth', 'uploading_photo', 'saving_user_data', 'complete'];
      const currentIndex = stageOrder.indexOf(stage);

      return (
        <div className="flex flex-col items-center justify-center p-4 min-h-[400px]">
            <h2 className="text-2xl font-bold text-highlight mb-8">Finalizing Account...</h2>
            <div className="space-y-4 w-full">
                {steps.map((step, index) => {
                    const stepIndex = stageOrder.indexOf(step.id as SubmissionStage);
                    const isCompleted = currentIndex > stepIndex;
                    const isCurrent = currentIndex === stepIndex;
                    return (
                        <div key={step.id} className="flex items-center space-x-4 transition-opacity duration-300">
                            <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                                {isCompleted ? <CheckCircleIcon /> : (isCurrent ? <Spinner /> : <div className="w-5 h-5 border-2 border-gray-500 rounded-full"></div>)}
                            </div>
                            <span className={`font-medium ${isCompleted ? 'text-green-400' : isCurrent ? 'text-text-primary' : 'text-text-secondary'}`}>{step.text}</span>
                        </div>
                    );
                })}
            </div>
        </div>
      );
  };
  
  const renderSuccess = () => (
      <div className="text-center p-8 flex flex-col items-center min-h-[400px] justify-center">
        <CheckCircleIcon />
        <h2 className="text-2xl font-bold text-white mt-4">Registration Successful!</h2>
        <p className="text-gray-400">Redirecting to your dashboard...</p>
      </div>
  );

  const renderContent = () => {
    switch (step) {
        case 'details': return renderDetailsForm();
        case 'photo': return renderPhotoStep();
        case 'submitting': return <SubmissionStatus stage={submissionStage} />;
        case 'success': return renderSuccess();
        default: return null;
    }
  };


  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary to-secondary px-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-secondary rounded-xl shadow-lg">
        {renderContent()}
        {step === 'details' && (
          <div className="text-center text-text-secondary text-sm">
            <p>Already have an account?
              <button onClick={onNavigateToLogin} className="ml-1 font-semibold text-highlight hover:underline">Login</button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SignUpPage;
