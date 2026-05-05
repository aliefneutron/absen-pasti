import * as React from 'react';
import { useState, useEffect } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { LogIn, Smartphone, AlertCircle, UserPlus, FileText, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const { user, profile, loading, isDeviceAuthorized, isProfileComplete, refreshProfile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [regForm, setRegForm] = useState({
    displayName: '',
    nip: '',
    bidang: ''
  });

  const prefilled = React.useRef(false);

  // Use an effect to pre-fill the name once when the user is available
  useEffect(() => {
    if (user && user.displayName && !prefilled.current) {
      prefilled.current = true;
      setRegForm(prev => ({ 
        ...prev, 
        displayName: prev.displayName || user.displayName || '' 
      }));
    }
  }, [user]);

  if (loading) return null;
  if (user && isDeviceAuthorized && isProfileComplete) return <Navigate to="/" />;

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error(error);
      toast.error(`Gagal login: ${error.message}`);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!regForm.displayName || !regForm.nip || !regForm.bidang) {
      toast.error('Semua bidang wajib diisi');
      return;
    }

    setIsSubmitting(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        displayName: regForm.displayName,
        nip: regForm.nip,
        bidang: regForm.bidang,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      
      toast.success('Profil berhasil dilengkapi!');
      await refreshProfile();
    } catch (error) {
      console.error(error);
      toast.error('Gagal menyimpan profil.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = () => {
    auth.signOut();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
      <Card className={`w-full ${!isProfileComplete && user && isDeviceAuthorized ? 'max-w-md' : 'max-w-sm'} overflow-hidden border-none shadow-2xl backdrop-blur-sm bg-white/95`}>
        {!isDeviceAuthorized ? (
          <div className="text-center">
            <CardHeader className="pt-8 pb-4">
              <div className="mx-auto bg-rose-100 p-4 rounded-full w-fit mb-4">
                <AlertCircle className="h-10 w-10 text-rose-600" />
              </div>
              <CardTitle className="text-2xl font-black tracking-tight text-rose-900 uppercase">
                Kunci Perangkat Aktif
              </CardTitle>
              <CardDescription className="text-rose-700 font-bold uppercase text-[10px] tracking-widest mt-2">
                Akses Perangkat Tidak Dikenali
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-8">
              <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 text-left">
                <p className="text-[11px] text-rose-800 font-medium leading-relaxed">
                  Akun Anda telah tertaut dengan perangkat lain. Untuk alasan keamanan, Anda hanya dapat melakukan absensi melalui perangkat yang didaftarkan pertama kali.
                </p>
                <div className="mt-3 pt-3 border-t border-rose-200">
                  <p className="text-[9px] text-rose-600 font-black uppercase tracking-tighter">
                    Solusi:
                  </p>
                  <p className="text-[10px] text-rose-700 font-medium">
                    Hubungi Admin untuk melakukan reset kunci perangkat (Device Reset).
                  </p>
                </div>
              </div>
              <Button 
                variant="outline"
                onClick={handleLogout} 
                className="w-full h-11 text-xs font-black uppercase tracking-widest border-rose-200 text-rose-700 hover:bg-rose-50"
              >
                Ganti Akun / Keluar
              </Button>
            </CardContent>
          </div>
        ) : user && !isProfileComplete ? (
          <div className="p-2">
            <CardHeader className="text-center pt-6 pb-2">
              <div className="mx-auto bg-indigo-100 p-4 rounded-full w-fit mb-4">
                <UserPlus className="h-8 w-8 text-indigo-600" />
              </div>
              <CardTitle className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                Lengkapi Profil
              </CardTitle>
              <CardDescription className="text-slate-500 font-medium">
                Satu langkah lagi sebelum Anda dapat menggunakan sistem.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 py-4">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                    <FileText size={12} className="text-indigo-500" /> Nama Lengkap
                    <span className="ml-auto text-[9px] font-bold text-indigo-400 normal-case tracking-normal">(dapat diubah)</span>
                  </Label>
                  <Input 
                    id="displayName"
                    value={regForm.displayName}
                    onChange={e => {
                      const val = e.target.value;
                      setRegForm(prev => ({ ...prev, displayName: val }));
                    }}
                    placeholder="Masukkan nama sesuai KTP"
                    className="bg-white border-indigo-200 focus-visible:ring-indigo-500 font-medium"
                  />
                  {regForm.displayName && user?.displayName && regForm.displayName !== user.displayName && (
                    <p className="text-[9px] text-emerald-600 font-bold flex items-center gap-1">
                      ✓ Nama telah diubah dari akun Google
                    </p>
                  )}
                </div>
                
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                    <Smartphone size={12} className="text-indigo-500" /> NIP / No. Pegawai
                  </Label>
                  <Input 
                    id="nip"
                    value={regForm.nip}
                    onChange={e => {
                      const val = e.target.value;
                      setRegForm(prev => ({ ...prev, nip: val }));
                    }}
                    placeholder="Masukkan NIP atau Nomor Identitas"
                    className="bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                    <LayoutGrid size={12} className="text-indigo-500" /> Bidang Kerja
                  </Label>
                  <Select 
                    value={regForm.bidang} 
                    onValueChange={val => setRegForm({...regForm, bidang: val})}
                  >
                    <SelectTrigger className="bg-slate-50 border-slate-200 focus:ring-indigo-500 font-medium">
                      <SelectValue placeholder="Pilih Bidang Anda" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RAWAT INAP">RAWAT INAP</SelectItem>
                      <SelectItem value="UGD">UGD</SelectItem>
                      <SelectItem value="KLASTER 1">KLASTER 1</SelectItem>
                      <SelectItem value="KLASTER 2">KLASTER 2</SelectItem>
                      <SelectItem value="KLASTER 3">KLASTER 3</SelectItem>
                      <SelectItem value="KLASTER 4">KLASTER 4</SelectItem>
                      <SelectItem value="LABORATORIUM">LABORATORIUM</SelectItem>
                      <SelectItem value="FARMASI">FARMASI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-4 space-y-3">
                  <Button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-[0.2em] shadow-lg shadow-indigo-200 transition-all active:scale-95"
                  >
                    {isSubmitting ? 'MENYIMPAN...' : 'SIMPAN PROFIL'}
                  </Button>
                  <Button 
                    type="button"
                    variant="ghost"
                    onClick={handleLogout}
                    className="w-full text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase tracking-widest"
                  >
                    Batal & Keluar
                  </Button>
                </div>
              </form>
            </CardContent>
          </div>
        ) : (
          <div className="text-center">
            <CardHeader className="pt-8 pb-4">
              <div className="mx-auto mb-4 flex flex-col items-center">
                <div className="bg-white rounded-[2.25rem] flex items-center justify-center overflow-hidden h-28 w-28 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border-b-4 border-slate-100 p-0">
                  <img src="/logo pasti.png" alt="PASTI Logo" className="w-full h-full object-cover" />
                </div>
              </div>
              <CardTitle 
                className="text-5xl font-black tracking-[0.02em] mb-1"
                style={{ fontFamily: "'Montserrat', sans-serif", color: '#034ea1' }}
              >
                PASTI
              </CardTitle>
              <CardDescription 
                className="text-slate-600 font-bold text-[9px] uppercase tracking-[0.3em] mb-2"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Pagerungan Absensi Terintegrasi
              </CardDescription>
              <CardDescription className="text-slate-400 font-medium">
                Sistem Absensi Pegawai Berbasis Lokasi
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 px-8">
              <div className="text-center space-y-2">
                <p className="text-sm text-slate-600 leading-relaxed">
                  Silakan masuk menggunakan akun Google Anda untuk mulai melakukan absensi.
                </p>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest bg-slate-100 py-1 rounded">
                  Kunci Perangkat: Diaktifkan
                </p>
              </div>
              <Button 
                onClick={handleLogin} 
                className="w-full h-12 text-md font-bold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-primary/20"
              >
                <LogIn className="mr-2 h-5 w-5" />
                Masuk dengan Google
              </Button>
            </CardContent>
          </div>
        )}
        <CardFooter className="pb-8 pt-4 flex justify-center border-t border-slate-100 bg-slate-50/50">
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
            Created by aliefneutron 2026
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
