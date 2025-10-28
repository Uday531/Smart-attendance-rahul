
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { User, AppContextType, Role } from './types';
import LoginPage from './components/LoginPage';
import FacultyDashboard from './components/FacultyDashboard';
import StudentDashboard from './components/StudentDashboard';
import SignUpPage from './components/SignUpPage';
import { auth, db } from './services/firebase';
// FIX: The `onAuthStateChanged` and `User` exports are not available in the modular `firebase/auth` library with the current setup.
// Using the compat library for authentication.
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Spinner } from './components/common/icons';

export const AppContext = React.createContext<AppContextType | null>(null);

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // FIX: Switched from modular `onAuthStateChanged(auth, ...)` to compat `auth.onAuthStateChanged(...)`.
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser: firebase.User | null) => {
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            setCurrentUser({ id: userDoc.id, ...userDoc.data() } as User);
          } else {
            // Handle case where user exists in Auth but not Firestore
            console.error("User data not found in Firestore.");
            auth.signOut();
            setCurrentUser(null);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          auth.signOut();
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignUpSuccess = (user: User) => {
    setCurrentUser(user);
  };

  const handleLogout = () => {
    auth.signOut();
    setCurrentUser(null);
    setView('login');
  };

  const contextValue = useMemo(() => ({
    currentUser,
    handleLogout,
  }), [currentUser]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <Spinner />
        </div>
      );
    }

    if (currentUser) {
      switch (currentUser.role) {
        case Role.Faculty:
          return <FacultyDashboard />;
        case Role.Student:
          return <StudentDashboard />;
        default:
          return <LoginPage onNavigateToSignUp={() => setView('signup')} />;
      }
    }

    switch (view) {
      case 'signup':
        return <SignUpPage onSignUpSuccess={handleSignUpSuccess} onNavigateToLogin={() => setView('login')} />;
      case 'login':
      default:
        return <LoginPage onNavigateToSignUp={() => setView('signup')} />;
    }
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className="min-h-screen bg-primary font-sans">
        {renderContent()}
      </div>
    </AppContext.Provider>
  );
};

export default App;
