import * as React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, History, Shield, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../lib/auth-context';
import { auth } from '../lib/firebase';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

export default function Layout() {
  const { user, profile, isAdmin } = useAuth();
  const location = useLocation();

  const navItems = React.useMemo(() => [
    { label: 'Absen', path: '/', icon: Home },
    { label: 'Riwayat', path: '/history', icon: History },
    ...(isAdmin ? [{ label: 'Admin', path: '/admin', icon: Shield }] : []),
  ], [isAdmin]);

  const handleLogout = () => {
    auth.signOut();
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans">
      {/* Header Navigation */}
      <header className="sticky top-0 z-30 h-14 bg-indigo-900 text-white flex items-center justify-between px-6 shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 max-w-fit">
            <div className="bg-white p-1 rounded-xl flex items-center justify-center overflow-hidden">
              <img src="/pasti logo.png" alt="PASTI Logo" className="w-8 h-8 object-contain" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-black tracking-[0.02em] text-white flex items-center gap-1 leading-none" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                PASTI <span className="text-blue-300 font-normal text-[10px] tracking-widest hidden sm:inline" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>| {isAdmin ? 'KONTROL ADMIN' : 'PORTAL PEGAWAI'}</span>
              </h1>
              <p className="text-[7px] font-bold text-indigo-300/80 tracking-widest uppercase mt-0.5">Created By Alief Neutron</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden sm:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-xs font-black uppercase tracking-widest ${
                    isActive 
                      ? 'bg-white/10 text-white' 
                      : 'text-indigo-200 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon size={14} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col items-end mr-2">
            <div className="flex items-center gap-2 mb-1">
              {isAdmin && (
                <span className="px-1.5 py-0.5 bg-indigo-500 text-white text-[8px] font-black rounded tracking-widest uppercase">Admin</span>
              )}
              <span className="text-[9px] text-indigo-300 uppercase font-black tracking-widest leading-none">
                {isAdmin ? 'Istimewa' : 'Standar'}
              </span>
            </div>
            <span className="text-xs font-bold leading-none">{profile?.displayName || user?.displayName}</span>
          </div>
          <Avatar className="h-9 w-9 border-2 border-indigo-500 bg-indigo-500 shadow-sm">
            <AvatarImage src={user?.photoURL || ''} />
            <AvatarFallback className="text-xs bg-indigo-600 text-white font-bold">{user?.displayName?.charAt(0) || 'U'}</AvatarFallback>
          </Avatar>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-indigo-200 hover:text-white hover:bg-white/10 transition-colors">
            <LogOut size={18} />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-20 p-4 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>

      {/* Footer Info */}
      <footer className="hidden sm:flex h-10 bg-white border-t border-slate-200 px-6 items-center justify-between text-[10px] text-slate-400 shrink-0 font-medium">
        <div className="flex gap-4 items-center">
          <span className="font-bold uppercase tracking-widest">ID: {user?.uid.slice(0, 8)}</span>
          <span className="text-slate-300">|</span>
          <span className="text-emerald-600 font-black uppercase tracking-tighter flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            V.2.4.0 SECURE
          </span>
        </div>
        <div className="flex gap-4 items-center">
           <span className="font-mono text-slate-400">© aliefneutron</span>
          <span className="text-slate-300">|</span>
           <span className="uppercase">Jejak Terakhir: {new Date().toLocaleTimeString()}</span>
        </div>
      </footer>

      {/* Bottom Navigation for Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 px-6 py-2 flex items-center justify-around shadow-[0_-1px_15px_rgba(0,0,0,0.08)] sm:hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 p-1 transition-all ${
                isActive ? 'text-primary scale-105' : 'text-slate-400'
              }`}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] uppercase font-bold tracking-widest ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
