
import React, { useState } from 'react';
import { auth, db } from '../services/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { QrCodeIcon, Spinner, EyeIcon, EyeOffIcon } from './common/icons';

interface LoginPageProps {
  onNavigateToSignUp: () => void;
}

type LoginStage = 'idle' | 'authenticating' | 'fetching_data';

const LoginPage: React.FC<LoginPageProps> = ({ onNavigateToSignUp }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loginStage, setLoginStage] = useState<LoginStage>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoginStage('authenticating');
    
    try {
      // FIX: `signInWithEmailAndPassword` is not a named export from `firebase/auth`. Using compat version `auth.signInWithEmailAndPassword`.
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      
      setLoginStage('fetching_data');

      // Check for user data in Firestore to prevent getting stuck
      const userDocRef = doc(db, 'users', userCredential.user!.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
          // This handles the case where the user is in Auth but not Firestore.
          await auth.signOut();
          setError("Your user data could not be found. Please sign up again or contact support.");
          setLoginStage('idle');
          return;
      }
      // On success, App.tsx's onAuthStateChanged will handle navigation.
      
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else {
        setError('An unexpected error occurred. Please try again.');
        console.error("Login Error:", err);
      }
      setLoginStage('idle');
    }
  };
  
  const isLoading = loginStage !== 'idle';

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary to-secondary px-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-secondary rounded-xl shadow-lg">
        <div className="text-center">
            <div className="flex justify-center mb-6">
                <div className="p-4 bg-highlight rounded-full">
                    <QrCodeIcon />
                </div>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-text-primary">
              Welcome Back
            </h1>
            <p className="text-md text-text-secondary mt-2">
              Login to manage your attendance.
            </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="text-sm font-bold text-gray-400 block">Email Address</label>
            <input 
              type="email" 
              id="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 mt-2 text-gray-200 bg-accent rounded-md focus:outline-none focus:ring-2 focus:ring-highlight" 
              required 
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-bold text-gray-400 block">Password</label>
            <div className="relative">
              <input 
                type={showPassword ? 'text' : 'password'}
                id="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 mt-2 pr-10 text-gray-200 bg-accent rounded-md focus:outline-none focus:ring-2 focus:ring-highlight" 
                required 
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 mt-2 px-3 flex items-center text-gray-400 hover:text-white"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>
          {error && <p className="text-red-400 text-center text-sm">{error}</p>}
          <div>
            <button 
              type="submit" 
              disabled={isLoading}
              className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-highlight hover:bg-teal-500 disabled:bg-gray-500 transition"
            >
              {loginStage === 'idle' && 'Login'}
              {loginStage === 'authenticating' && <><Spinner /> <span className="ml-2">Authenticating...</span></>}
              {loginStage === 'fetching_data' && <><Spinner /> <span className="ml-2">Loading Profile...</span></>}
            </button>
          </div>
        </form>

        <div className="mt-8 text-center text-text-secondary">
          Don't have an account?{' '}
          <button onClick={onNavigateToSignUp} className="font-semibold text-highlight hover:underline">
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
