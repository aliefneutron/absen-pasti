import * as React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { serverTimestamp, doc, getDoc, setDoc, query, collection, limit, getDocs, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { getDeviceId } from './device';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  isAdmin: boolean;
  isDeviceAuthorized: boolean;
  isProfileComplete: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isDeviceAuthorized: true,
  isProfileComplete: true,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState(true);
  const [isProfileComplete, setIsProfileComplete] = useState(true);

  const checkProfile = async (currentUser: User) => {
    const currentDeviceId = getDeviceId();
    const userDocRef = doc(db, 'users', currentUser.uid);
    const userDoc = await getDoc(userDocRef);
    
    let userProfile: any = null;

    if (userDoc.exists()) {
      userProfile = userDoc.data();
    } else {
      // Check if a profile with this email was pre-registered
      const q = query(collection(db, 'users'), where('email', '==', currentUser.email), limit(1));
      const emailSnap = await getDocs(q);
      
      if (!emailSnap.empty) {
        const existingDoc = emailSnap.docs[0];
        userProfile = {
          ...existingDoc.data(),
          uid: currentUser.uid,
          displayName: currentUser.displayName || existingDoc.data().displayName || existingDoc.data().name,
          updatedAt: serverTimestamp(),
        };
        await setDoc(userDocRef, userProfile);
      } else {
        const usersSnap = await getDocs(query(collection(db, 'users'), limit(1)));
        const isFirstUser = usersSnap.empty;
        const isOwner = currentUser.email === 'aliefneutron@gmail.com';
        
        userProfile = {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
          role: (isFirstUser || isOwner) ? 'admin' : 'staff',
          createdAt: serverTimestamp(),
        };
        await setDoc(userDocRef, userProfile);
      }
    }

    // Device Lock Logic
    if (userProfile && userProfile.role !== 'admin') {
      if (!userProfile.deviceId) {
        // First time login - register device
        await setDoc(userDocRef, { deviceId: currentDeviceId }, { merge: true });
        userProfile.deviceId = currentDeviceId;
      } else if (userProfile.deviceId !== currentDeviceId) {
        // Mismatch
        setIsDeviceAuthorized(false);
      }
    }

    // Profile Completion Logic
    if (userProfile && userProfile.role !== 'admin') {
      const isComplete = !!(userProfile.nip && userProfile.bidang);
      setIsProfileComplete(isComplete);
    } else {
      setIsProfileComplete(true);
    }

    setProfile(userProfile);
  };

  const refreshProfile = async () => {
    if (user) {
      await checkProfile(user);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      try {
        if (currentUser) {
          setIsDeviceAuthorized(true);
          await checkProfile(currentUser);
        } else {
          setProfile(null);
          setIsDeviceAuthorized(true);
          setIsProfileComplete(true);
        }
      } catch (error) {
        console.error("Error during auth state change:", error);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const isAdmin = profile?.role === 'admin' || user?.email === 'aliefneutron@gmail.com';

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isDeviceAuthorized, isProfileComplete, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
