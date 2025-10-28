import React, { useState, useMemo, useEffect } from 'react';
import { User, AppContextType, Role } from './types';
import LoginPage from './components/LoginPage';
import FacultyDashboard from './components/FacultyDashboard';
import StudentDashboard from './components/StudentDashboard';
import SignUpPage from './components/SignUpPage';
import { auth, db } from './services/firebase';
import firebase from 'firebase/compat/app';
import { Spinner } from './components/common/icons';

export const AppContext = React.createContext<AppContextType | null>(null);

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser: firebase.User | null) => {
      if (firebaseUser) {
        try {
          const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
          
          if (userDoc.exists) {
            const userData = userDoc.data();
            setCurrentUser({ 
              id: userDoc.id, 
              ...userData 
            } as User);
          } else {
            console.error("User data not found in Firestore.");
            await auth.signOut();
            setCurrentUser(null);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          await auth.signOut();
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

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setCurrentUser(null);
      setView('login');
    } catch (error) {
      console.error("Logout error:", error);
    }
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