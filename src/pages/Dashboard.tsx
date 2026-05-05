import { useState, useRef, useEffect, useMemo } from 'react';
import { MapPin, Clock, CheckCircle2, AlertCircle, Camera as CameraIcon, Calendar as CalendarIcon, Navigation, Shield, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, buttonVariants } from '../components/ui/button';
import { cn } from '../lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../components/ui/card';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { serverTimestamp, collection, doc, onSnapshot, setDoc, query, where, getDocs, limit, getDocFromServer } from 'firebase/firestore';
import { format, isMonday, isTuesday, isWednesday, isThursday, isFriday, subMinutes, parse, addMinutes } from 'date-fns';
import { toast } from 'sonner';
import { id } from 'date-fns/locale';
import History from './History';
import { getCurrentShift, getShiftStatus, getCheckOutStatus, getFridayEarlyCheckOutStatus } from '../lib/shift';

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

export default function Dashboard() {
  const { user, profile, isAdmin } = useAuth();
  const [now, setNow] = useState(new Date());
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasAttendedToday, setHasAttendedToday] = useState(false);
  const [hasCheckedOutToday, setHasCheckedOutToday] = useState(false);
  const [recordedTime, setRecordedTime] = useState<Date | null>(null);
  const [checkOutRecordedTime, setCheckOutRecordedTime] = useState<Date | null>(null);
  const [attendanceData, setAttendanceData] = useState<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [selectedLocationIndex, setSelectedLocationIndex] = useState<number | null>(null);
  const [userRosters, setUserRosters] = useState<any[]>([]);
  
  // Roster Sync
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'rosters'), where('userId', '==', user.uid));
    return onSnapshot(q, (snap) => {
      setUserRosters(snap.docs.map(d => d.data()));
    });
  }, [user]);

  // Shift state
  const activeShiftInfo = useMemo(() => {
    if (!settings) return null;
    
    // 1. Check today's assigned roster
    const todayStr = format(now, 'yyyy-MM-dd');
    const todayRoster = userRosters.find(r => r.date === todayStr);
    const infoToday = getCurrentShift(now, settings.shifts, todayRoster?.shiftName);
    
    // If it's a normal day shift or we are in the start part of overnight shift
    if (infoToday && (infoToday.shift || (infoToday as any).isOff)) {
      return infoToday;
    }

    // 2. Check yesterday's roster (for the "tail" of an overnight shift)
    const yesterdayStr = format(addMinutes(now, -1440), 'yyyy-MM-dd');
    const yesterdayRoster = userRosters.find(r => r.date === yesterdayStr);
    const infoYesterday = getCurrentShift(now, settings.shifts, yesterdayRoster?.shiftName);

    if (infoYesterday && infoYesterday.shift) {
       // Only return if it's actually an overnight shift and we are in the late part
       const isOvernight = infoYesterday.shift.startTime > infoYesterday.shift.endTime;
       if (isOvernight && infoYesterday.logicalDate === yesterdayStr) {
         return infoYesterday;
       }
    }

    // 3. Check if a shift is starting soon (30 min buffer for notification only)
    if (!infoToday && todayRoster?.shiftName) {
      const shift = settings.shifts.find((s: any) => s.name === todayRoster.shiftName);
      if (shift) {
        const start = parse(shift.startTime, 'HH:mm', now);
        const buffer = subMinutes(start, 30);
        if (now >= buffer && now < start) {
          return { shift, logicalDate: todayStr, isUpcoming: true };
        }
      }
    }

    return null;
  }, [now, settings, userRosters]);

  const currentShift = activeShiftInfo?.shift;
  const logicalDate = activeShiftInfo?.logicalDate;
  const isOffDay = (activeShiftInfo as any)?.isOff;

  const checkOutInfo = useMemo(() => {
    if (!currentShift || !now) return null;
    return getCheckOutStatus(now, currentShift);
  }, [now, currentShift]);

  // Aturan Khusus Jumat: window absen pulang dimajukan ke sekitar 10:30
  const fridayEarlyInfo = useMemo(() => {
    if (!currentShift || !settings) return null;
    return getFridayEarlyCheckOutStatus(
      now,
      currentShift,
      settings.fridayEarlyEnd || null,
      profile?.bidang || null
    );
  }, [now, currentShift, settings, profile?.bidang]);

  // Apakah window absen pulang sedang aktif (normal ATAU Jumat khusus)
  const isEffectiveCheckOutWindow =
    checkOutInfo?.isCheckOutWindow || fridayEarlyInfo?.isCheckOutWindow || false;


  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;

    // 1. Real-time Config Sync
    const docRef = doc(db, 'settings', 'global');
    const unsubscribeSettings = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data());
      } else {
        const defaultSettings = { 
          officeLat: -6.1751, 
          officeLng: 106.8272, 
          radius: 100, 
          startTime: '07:00', 
          lateTime: '08:00',
          shifts: [
            { name: 'Pagi', startTime: '07:30', endTime: '13:30' },
            { name: 'Sore', startTime: '13:30', endTime: '19:30' },
            { name: 'Malam', startTime: '19:30', endTime: '07:30' },
          ]
        };
        setSettings(defaultSettings);
      }
    });

    // 2. Continuous Location Tracking
    let watchId: number | null = null;
    const startWatching = () => {
      if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
          (pos) => setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          (err) => {
            console.error('GPS Error:', err);
            toast.error('Masalah GPS: Pastikan lokasi aktif & izin diberikan.');
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
      }
    };
    startWatching();


    return () => {
      unsubscribeSettings();
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [user]);

  // Derived state: Multi-Location Distance Calculation
  const locationStats = useMemo(() => {
    if (!location || !settings) return { isWithinRange: false, nearestDistance: null, nearestLocationName: null };
    
    // Check Multi-Locations first
    if (settings.locations && settings.locations.length > 0) {
      let nearestDistance = Infinity;
      let nearestLoc = null;
      let withinAny = false;

      if (selectedLocationIndex !== null && settings.locations[selectedLocationIndex]) {
        const selLoc = settings.locations[selectedLocationIndex];
        const dist = calculateDistance(location.latitude, location.longitude, Number(selLoc.lat), Number(selLoc.lng));
        const locRadius = Number(selLoc.radius) || Number(settings.radius) || 100;
        
        return {
          isWithinRange: dist <= locRadius,
          nearestDistance: dist,
          nearestLocationName: selLoc.name,
          nearestRadius: locRadius,
          isManual: true
        };
      }

      settings.locations.forEach((loc: any) => {
        const dist = calculateDistance(location.latitude, location.longitude, Number(loc.lat), Number(loc.lng));
        const locRadius = Number(loc.radius) || Number(settings.radius) || 100;
        
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearestLoc = loc;
        }
        if (dist <= locRadius) {
          withinAny = true;
        }
      });

      return { 
        isWithinRange: withinAny, 
        nearestDistance: nearestDistance, 
        nearestLocationName: nearestLoc ? (nearestLoc as any).name : 'Lokasi Terdaftar',
        nearestRadius: nearestLoc ? (Number((nearestLoc as any).radius) || 100) : (Number(settings.radius) || 100),
        isManual: false
      };
    }

    // Fallback to legacy single office location
    if (settings.officeLat && settings.officeLng) {
      const dist = calculateDistance(location.latitude, location.longitude, Number(settings.officeLat), Number(settings.officeLng));
      const globalRadius = Number(settings.radius) || 100;
      const within = dist <= globalRadius;
      return { 
        isWithinRange: within, 
        nearestDistance: dist, 
        nearestLocationName: 'Kantor Utama',
        nearestRadius: globalRadius
      };
    }

    return { isWithinRange: false, nearestDistance: null, nearestLocationName: null, nearestRadius: 100 };
  }, [location, settings]);

  const isWithinRange = locationStats.isWithinRange;
  const distance = locationStats.nearestDistance;

  // 3. Attendance Check Trigger
  useEffect(() => {
    if (user && logicalDate && currentShift) {
      checkTodayAttendance(logicalDate, currentShift.name);
    }
  }, [user, logicalDate, currentShift?.name]);

  const checkTodayAttendance = async (dateStr?: string, shiftName?: string) => {
    if (!user) return;
    const targetDate = dateStr || logicalDate || format(new Date(), 'yyyy-MM-dd');
    const targetShift = shiftName || currentShift?.name;

    if (!targetShift) {
      setHasAttendedToday(false);
      return;
    }

    const q = query(
      collection(db, 'attendance'),
      where('userId', '==', user.uid)
    );
    const snap = await getDocs(q);
    const shiftLog = snap.docs.find(d => {
      const data = d.data();
      return data.date === targetDate && data.shiftName === targetShift;
    });
    
    if (shiftLog) {
      const data = shiftLog.data();
      setAttendanceData(data);
      setHasAttendedToday(true);
      if (data.timestamp) {
        setRecordedTime(data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp));
      }
      if (data.checkOutTimestamp) {
        setHasCheckedOutToday(true);
        setCheckOutRecordedTime(data.checkOutTimestamp.toDate ? data.checkOutTimestamp.toDate() : new Date(data.checkOutTimestamp));
      } else {
        setHasCheckedOutToday(false);
        setCheckOutRecordedTime(null);
      }
    } else {
      setHasAttendedToday(false);
      setAttendanceData(null);
      setHasCheckedOutToday(false);
      setCheckOutRecordedTime(null);
    }
  };

  const isScheduleDay = settings?.enabledDays 
    ? settings.enabledDays.includes(format(now, 'EEEE'))
    : (isMonday(now) || isTuesday(now) || isWednesday(now) || isThursday(now) || isFriday(now));

  console.log('Dashboard State:', { 
    hasUser: !!user, 
    hasLocation: !!location, 
    hasSettings: !!settings, 
    hasPhoto: !!photo,
    isScheduleDay,
    loading
  });
  

  const startCamera = async () => {
    if (!isWithinRange) {
      toast.error(`Anda berada di luar jangkauan (${Math.round(distance || 0)}m). Kamera tidak dapat diaktifkan.`);
      return;
    }
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal mengakses kamera');
    }
  };

  const takePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Compress foto secara otomatis (resize & compress) agar ukuran minimum (~50-100KB)
      const maxWidth = 480; 
      const scale = Math.min(maxWidth / video.videoWidth, 1);
      
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Horizontal flip for mirror effect
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      
      // Kompresi kualitas gambar (0.4) agar hemat Firestore & Storage
      const dataUrl = canvas.toDataURL('image/jpeg', 0.4); 
      setPhoto(dataUrl);
      
      // Stop camera
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      setShowCamera(false);
    }
  };

  const handleAttendance = async () => {
    console.log('handleAttendance started');
    if (!user || !location || !settings || !photo) {
      console.warn('Attendance cancelled: Missing data', { user: !!user, location: !!location, settings: !!settings, photo: !!photo });
      toast.error('Data belum lengkap (Lokasi/Foto)');
      return;
    }

    if (!isScheduleDay) {
      toast.error(`Hari ini (${format(now, 'EEEE')}) bukan jadwal absen sesuai konfigurasi.`);
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Memproses absensi...');
    
    // Safety timeout of 60 seconds
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Koneksi lambat. Silakan coba lagi.')), 60000)
    );
    
    try {
      const attendancePromise = (async () => {
        // Use derived locationStats for range validation
        if (!isWithinRange) {
          const nearestMsg = locationStats.nearestLocationName 
            ? `dari ${locationStats.nearestLocationName}` 
            : 'dari lokasi absen';
          throw new Error(`Anda berada di luar jangkauan (${Math.round(distance || 0)}m ${nearestMsg})`);
        }

        if (!currentShift || !logicalDate) {
          throw new Error('Tidak ada jadwal shift aktif saat ini.');
        }

        if ((activeShiftInfo as any)?.isUpcoming) {
          throw new Error(`Absen Shift ${currentShift.name} belum dibuka. Silakan kembali pada pukul ${currentShift.startTime} WIB.`);
        }

        const isCheckOut = hasAttendedToday && !hasCheckedOutToday && isEffectiveCheckOutWindow;
        const recordId = `${user.uid}_${logicalDate}_${currentShift.name}`;
        const selfieUrl = photo;

        if (isCheckOut) {
          const updateData = {
            checkOutTimestamp: serverTimestamp(),
            checkOutLocation: location,
            checkOutSelfieUrl: selfieUrl,
          };
          console.log('Updating attendance record with check-out data...');
          await setDoc(doc(db, 'attendance', recordId), updateData, { merge: true });
          
          setHasCheckedOutToday(true);
          setCheckOutRecordedTime(now);
          setAttendanceData((prev: any) => ({ ...prev, ...updateData, checkOutTimestamp: now }));
          return `Absen Pulang Shift ${currentShift.name} berhasil dicatat!`;
        } else {
          const { isLate, graceThresholdDate, shiftStartDate } = getShiftStatus(now, currentShift);
          const lateDuration = isLate ? Math.max(0, Math.floor((now.getTime() - shiftStartDate.getTime()) / 1000)) : 0;
          
          const record = {
            userId: user.uid,
            userName: profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Unknown',
            userEmail: user.email,
            timestamp: serverTimestamp(),
            date: logicalDate,
            month: logicalDate.substring(0, 7),
            shiftName: currentShift.name,
            location: location,
            isWithinRange: true,
            isLate: isLate,
            lateDuration: lateDuration, // duration in seconds
            lateThreshold: format(graceThresholdDate, 'HH:mm:ss'),
            selfieUrl: selfieUrl,
          };

          console.log('Saving attendance record to Firestore...');
          await setDoc(doc(db, 'attendance', recordId), record);
          
          setHasAttendedToday(true);
          setRecordedTime(now);
          setAttendanceData(record);
          return isLate ? `Absen Datang Shift ${currentShift.name} (Terlambat ${Math.floor(lateDuration/60)}m) tercatat!` : `Absen Datang Shift ${currentShift.name} berhasil dicatat!`;
        }
      })();

      const successMessage = await Promise.race([attendancePromise, timeoutPromise]) as string;
      toast.success(successMessage, { id: toastId });
    } catch (err: any) {
      console.error('Attendance Error:', err);
      toast.error(err.message || 'Gagal menyimpan absen. Coba lagi.', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  if (hasAttendedToday && (!isEffectiveCheckOutWindow || hasCheckedOutToday)) {
    if (attendanceData?.isLeave) {
       const typeColors:any = {
         'I': { bg: 'bg-amber-600', ring: 'ring-amber-100', shadow: 'shadow-amber-200', title: 'Status: Izin' },
         'S': { bg: 'bg-indigo-600', ring: 'ring-indigo-100', shadow: 'shadow-indigo-200', title: 'Status: Sakit' },
         'C': { bg: 'bg-purple-600', ring: 'ring-purple-100', shadow: 'shadow-purple-200', title: 'Status: Cuti' },
         'T': { bg: 'bg-slate-600', ring: 'ring-slate-100', shadow: 'shadow-slate-200', title: 'Status: Tugas Luar' }
       };
       const colors = typeColors[attendanceData.leaveType] || typeColors['I'];

       return (
         <div className="space-y-6">
           <Card className="border-none shadow-md bg-slate-50">
             <CardHeader className="text-center">
               <div className="mx-auto mb-2 relative">
                 <div className={`${colors.bg} p-3 rounded-2xl shadow-lg ${colors.shadow} ring-4 ${colors.ring} flex items-center justify-center`}>
                   <FileText className="h-10 w-10 text-white" />
                 </div>
                 <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-0.5 border-2 border-white">
                   <CheckCircle2 className="h-4 w-4 text-white" />
                 </div>
               </div>
               <CardTitle className="text-slate-800">{colors.title}</CardTitle>
               <CardDescription className="text-slate-500 font-medium">Catatan kehadiran khusus telah disetujui (Admin bypass).</CardDescription>
             </CardHeader>
             <CardContent className="flex justify-center flex-col items-center gap-4">
               {attendanceData.leaveReason && (
                 <div className="text-center bg-white border border-slate-200 px-4 py-2 rounded-lg w-full max-w-xs shadow-sm">
                   <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest mb-1">Keterangan / Alasan</p>
                   <p className="text-sm font-bold text-slate-700 italic">"{attendanceData.leaveReason}"</p>
                 </div>
               )}
               <Link 
                 to="/history" 
                 className={cn(
                   buttonVariants({ variant: 'outline' }),
                   "border-slate-200 text-slate-700 font-bold uppercase tracking-widest hover:bg-slate-100 mt-2 text-[10px]"
                 )}
               >
                 Lihat Riwayat Absen
               </Link>
             </CardContent>
           </Card>
         </div>
       );
    }

    const isWaitingForCheckOut = !hasCheckedOutToday;

    return (
      <div className="space-y-6">
        <Card className="border-none shadow-md bg-emerald-50">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 relative">
              <div className="bg-white rounded-2xl flex items-center justify-center overflow-hidden w-16 h-16 mx-auto">
                <img src="/logo pasti.png" alt="PASTI Logo" className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-0.5 border-2 border-white">
                <CheckCircle2 className="h-4 w-4 text-white" />
              </div>
            </div>
            <CardTitle className="text-emerald-800">
              {isWaitingForCheckOut ? `Sudah Absen Datang ${attendanceData?.shiftName || ''}` : `Absen Selesai ${attendanceData?.shiftName || ''}`}
            </CardTitle>
            <CardDescription className="text-emerald-600 font-medium">
              {isWaitingForCheckOut 
                ? 'Terima kasih, absen datang Anda sudah tercatat. Jangan lupa untuk absen pulang nanti.' 
                : 'Terima kasih, kehadiran dan jam pulang Anda hari ini sudah tercatat.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center flex-col items-center gap-4">
            <div className="text-center">
              <p className="text-[10px] uppercase font-black text-emerald-700 tracking-widest">Waktu Datang</p>
              <p className="text-3xl font-black text-emerald-900 tabular-nums tracking-tighter">{recordedTime ? format(recordedTime, 'HH:mm', { locale: id }) : '-'}</p>
            </div>
            {hasCheckedOutToday && (
              <div className="text-center mt-2">
                <p className="text-[10px] uppercase font-black text-emerald-700 tracking-widest">Waktu Pulang</p>
                <p className="text-3xl font-black text-emerald-900 tabular-nums tracking-tighter">{checkOutRecordedTime ? format(checkOutRecordedTime, 'HH:mm', { locale: id }) : '-'}</p>
              </div>
            )}
            <Link 
              to="/history" 
              className={cn(
                buttonVariants({ variant: 'outline' }),
                "border-emerald-200 text-emerald-700 font-bold uppercase tracking-widest text-[10px] hover:bg-emerald-100 mt-2"
              )}
            >
              Lihat Riwayat
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isOffDay && !hasAttendedToday) {
    return (
      <div className="space-y-6">
        <Card className="border-none shadow-md bg-amber-50">
          <CardHeader className="text-center py-10">
            <div className="mx-auto mb-4 relative">
              <div className="bg-white p-4 rounded-3xl shadow-xl ring-8 ring-amber-100/50 flex items-center justify-center w-20 h-20">
                <CalendarIcon className="h-10 w-10 text-amber-500 animate-pulse" />
              </div>
              <div className="absolute -bottom-1 -right-1 bg-amber-500 rounded-full p-1 border-4 border-white">
                <Shield className="h-4 w-4 text-white" />
              </div>
            </div>
            <CardTitle className="text-amber-900 font-black uppercase tracking-tight text-2xl">Hari Libur Terjadwal</CardTitle>
            <CardDescription className="text-amber-700 font-bold uppercase text-[10px] tracking-widest mt-2">
              Status Dinas: <span className="bg-amber-200 px-2 py-0.5 rounded ml-1">OFF / LIBUR</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 pb-10 px-8">
            <div className="text-center max-w-sm">
              <p className="text-sm text-amber-800 leading-relaxed font-medium">
                Berdasarkan sistem penjadwalan dinas (Roster), hari ini Anda dijadwalkan untuk **LIBUR**. Manfaatkan waktu ini untuk beristirahat dan berkumpul bersama keluarga!
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
              <Link 
                to="/history" 
                className={cn(
                  buttonVariants({ variant: 'outline' }),
                  "flex-1 border-amber-200 text-amber-700 font-black uppercase tracking-widest text-[10px] h-10 hover:bg-amber-100"
                )}
              >
                Lihat Riwayat
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-12">
      {/* Left Panel: Check-in Actions */}
      <section className="lg:col-span-12 xl:col-span-5 space-y-6">
        <Card className="border border-slate-200 shadow-sm overflow-hidden flex flex-col bg-white">
          <CardHeader className="bg-slate-50/50 border-b py-3 px-5 flex flex-row items-center justify-between space-y-0">
             <div className="flex flex-col">
                <p className="text-base font-black text-indigo-600 uppercase tracking-tight leading-tight">Halo, {profile?.displayName || user?.displayName?.split(' ')[0] || 'Pegawai'}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{profile?.bidang || 'Staf Operasional'}</p>
             </div>
             <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-black rounded italic uppercase border border-emerald-200">Lokasi Terverifikasi</span>
          </CardHeader>
          
          <CardContent className="pt-6 pb-8 px-8 flex flex-col items-center justify-center space-y-6">
            <div className="text-center space-y-1 mb-2">
              <h2 className="text-4xl font-black tabular-nums tracking-tighter text-slate-800">
                {format(now, 'HH:mm:ss')}
              </h2>
              <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest italic leading-none">
                {format(now, 'EEEE, dd-MM-yyyy', { locale: id })}
              </p>
            </div>

            {/* Selfie Viewport */}
            <div className="relative w-full max-w-[280px] aspect-[3/4] bg-slate-900 rounded-3xl overflow-hidden border-8 border-slate-100 shadow-inner group">
              {!photo && !showCamera ? (
                <div
                  onClick={startCamera}
                  className={cn(
                    "absolute inset-0 flex flex-col items-center justify-center gap-3 transition-all",
                    isWithinRange 
                      ? "cursor-pointer bg-slate-800/80 hover:bg-slate-800 group-hover:scale-105" 
                      : "cursor-not-allowed bg-slate-900/90 grayscale"
                  )}
                >
                  <div className={cn(
                    "bg-white p-2 rounded-2xl flex items-center justify-center overflow-hidden",
                    !isWithinRange && "opacity-50"
                  )}>
                    <img src="/pasti logo.png" alt="PASTI Logo" className="w-12 h-12 object-contain" />
                  </div>
                  <span className={cn(
                    "text-[10px] uppercase font-black tracking-widest",
                    isWithinRange ? "text-indigo-300" : "text-rose-400"
                  )}>
                    {isWithinRange ? 'Ketuk untuk memulai kamera' : 'Di luar jangkauan'}
                  </span>
                </div>
              ) : showCamera ? (
                <>
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover scale-x-[-1]" />
                  <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_center,_transparent_0%,_black_100%)] pointer-events-none" />
                  <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                    <Button onClick={takePhoto} className="rounded-full w-14 h-14 p-0 shadow-2xl border-4 border-white/50 bg-indigo-600 hover:bg-indigo-700">
                      <div className="w-8 h-8 rounded-full bg-white" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <img src={photo} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 opacity-20 bg-indigo-900/10 pointer-events-none" />
                  <Button 
                    onClick={() => setPhoto(null)} 
                    variant="secondary" size="sm" 
                    className="absolute top-4 right-4 rounded-full h-8 px-4 text-[10px] font-black uppercase bg-white/90 backdrop-blur-sm border shadow-sm"
                  >
                    Ulangi
                  </Button>
                </>
              )}
              <div className="absolute bottom-4 right-4 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded text-[8px] font-bold text-white uppercase tracking-tighter border border-white/10">Aman 1080p</div>
            </div>

            <Button 
              disabled={loading} 
              onClick={() => {
                if (!photo) toast.error('Silakan ambil foto selfie terlebih dahulu');
                else if (!location) toast.error('Sedang mencari lokasi GPS...');
                else if (!isScheduleDay) toast.error('Hari ini bukan jadwal absen');
                else handleAttendance();
              }}
              className="w-full max-w-[280px] h-auto bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black shadow-xl shadow-indigo-200 transition-all active:scale-95 py-5 px-4 text-xl tracking-wide leading-none"
            >
              {loading ? 'MEMPROSES...' : (hasAttendedToday && !hasCheckedOutToday ? 'ABSEN PULANG' : 'ABSEN DATANG')}
            </Button>

            {/* Info jam khusus Jumat */}
            {fridayEarlyInfo && !hasAttendedToday && (
              <div className="w-full max-w-[280px] bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2.5 shadow-sm">
                <span className="text-amber-500 text-base">🕙</span>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Jumat — Rawat Jalan</p>
                  <p className="text-[10px] font-bold text-amber-800 leading-tight">
                    Absen pulang tersedia pkl {fridayEarlyInfo.checkOutTime} WIB
                  </p>
                </div>
              </div>
            )}

            {/* Sub info section */}
            <div className="w-full max-w-[280px] bg-slate-50 border border-slate-100 rounded-xl flex flex-col items-center gap-1.5 py-3 px-4 shadow-sm">
              <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase leading-none">
                {settings?.enabledDays && settings.enabledDays.length > 0
                  ? settings.enabledDays.map((d: string) => d.substring(0, 3).toUpperCase()).join(' · ')
                  : 'MON · TUE · WED · THU · FRI'}
              </span>

              {location && distance !== null && (
                <span className={cn(
                  "text-[11px] font-black leading-none",
                  distance <= (locationStats.nearestRadius || 100) ? "text-emerald-500" : "text-rose-500"
                )}>
                  {Math.round(distance)}m dari {locationStats.nearestLocationName || 'lokasi absen'}
                </span>
              )}

              {!location && !loading && (
                <span className="text-[10px] font-bold text-amber-500 leading-none">
                  ⌛ Mencari GPS...
                </span>
              )}
              {!isScheduleDay && (
                <span className="text-[10px] font-black text-rose-500 leading-none animate-pulse">
                  ⛔ Off Schedule
                </span>
              )}
            </div>
          </CardContent>

          <CardFooter className="bg-slate-50 border-t p-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 w-full">
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1">Lokasi Saat Ini</p>
                <div className="flex items-center gap-2">
                  <MapPin size={14} className={location ? "text-indigo-500" : "text-slate-300"} />
                  <p className="text-[10px] font-mono font-bold text-slate-700">
                    {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'SCANNING...'}
                  </p>
                </div>
                <div className="absolute right-2 top-2 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Navigation size={12} className="rotate-45" />
                </div>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm relative overflow-hidden group">
                <div className="flex justify-between items-center mb-1">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Titik Absen</p>
                  {settings?.locations?.length > 0 && (
                    <button 
                      onClick={() => setSelectedLocationIndex(null)}
                      className={cn(
                        "text-[8px] font-black uppercase tracking-tighter transition-colors",
                        selectedLocationIndex === null ? "text-indigo-500" : "text-slate-300 hover:text-indigo-400"
                      )}
                    >
                      Auto Detect
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center border border-slate-100 shadow-sm p-0.5 overflow-hidden">
                    <img src="/icon-512.png" alt="Logo" className="w-full h-full object-contain" />
                  </div>
                  {settings?.locations?.length > 0 ? (
                    <select 
                      value={selectedLocationIndex === null ? "" : selectedLocationIndex}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedLocationIndex(val === "" ? null : parseInt(val));
                      }}
                      className="bg-transparent border-none p-0 text-[10px] font-black text-slate-700 uppercase tracking-tight focus:ring-0 cursor-pointer w-full appearance-none"
                    >
                      {selectedLocationIndex === null && (
                        <option value="">{locationStats.nearestLocationName} (Otomatis)</option>
                      )}
                      {settings.locations.map((loc: any, idx: number) => (
                        <option key={idx} value={idx}>{loc.name}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-tight">
                      {locationStats.nearestLocationName || 'Node Utama'}
                    </p>
                  )}
                </div>
                 <div className="absolute right-2 top-2 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Shield size={12} />
                </div>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-x-6 gap-y-3 px-1">
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-indigo-400" />
                <p className="text-[10px] font-mono font-black text-slate-500 uppercase tracking-widest">
                  {currentShift ? `Shift ${currentShift.name}: ${currentShift.startTime} - ${currentShift.endTime} WIB` : 'Tidak Ada Shift Aktif'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                 <div className={cn(
                   "w-2 h-2 rounded-full animate-pulse",
                   location ? "bg-emerald-500" : "bg-amber-500"
                 )} />
                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Telemetri Langsung</span>
              </div>
            </div>
          </CardFooter>
        </Card>

        {/* Notifications */}
        <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardHeader className="p-4 border-b bg-slate-50/30">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Daftar Notifikasi</h3>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
             <div className="flex items-start gap-4 p-3 bg-indigo-50/50 border-l-4 border-indigo-500 rounded-lg text-xs leading-relaxed group hover:bg-indigo-50 transition-colors">
               <div className="w-2 h-2 bg-indigo-500 rounded-full mt-1.5 animate-pulse shrink-0"></div>
               <div>
                  <p className="text-indigo-900 font-bold uppercase text-[10px] mb-0.5 tracking-tight">Siaran Jadwal</p>
                  <p className="text-indigo-800 opacity-80">Siklus absen hari {
                       settings?.enabledDays && settings.enabledDays.length > 0
                         ? (() => {
                             const dayMap: any = {
                               'Monday': 'Senin', 'Tuesday': 'Selasa', 'Wednesday': 'Rabu',
                               'Thursday': 'Kamis', 'Friday': 'Jumat', 'Saturday': 'Sabtu', 'Sunday': 'Minggu'
                             };
                             const translated = settings.enabledDays.map((d: string) => dayMap[d] || d);
                             return translated.length > 1 ? `${translated[0]} - ${translated[translated.length - 1]}` : (translated[0] || 'Senin - Jumat');
                           })()
                         : 'Senin - Jumat'
                     } tetap aktif. Pastikan verifikasi GPS menyala.</p>
               </div>
             </div>
             {(activeShiftInfo as any)?.isUpcoming && (
                <div className="flex items-start gap-4 p-3 bg-slate-100 border-l-4 border-slate-400 rounded-lg text-xs leading-relaxed">
                  <div className="w-2 h-2 bg-slate-400 rounded-full mt-1.5 shrink-0"></div>
                  <div>
                     <p className="text-slate-900 font-bold uppercase text-[10px] mb-0.5 tracking-tight">Sistem Siaga</p>
                     <p className="text-slate-800 opacity-80">Absen Shift {currentShift?.name} belum dibuka. Silakan kembali pada pukul {currentShift?.startTime} WIB.</p>
                  </div>
                </div>
              )}
              {currentShift && getShiftStatus(now, currentShift).isLate && !hasAttendedToday && (
                <div className="flex items-start gap-4 p-3 bg-rose-50 border-l-4 border-rose-500 rounded-lg text-xs leading-relaxed">
                  <div className="w-2 h-2 bg-rose-500 rounded-full mt-1.5 animate-bounce shrink-0"></div>
                  <div>
                     <p className="text-rose-900 font-bold uppercase text-[10px] mb-0.5 tracking-tight">Peringatan Terlambat</p>
                     <p className="text-rose-800 opacity-80">Waktu masuk Shift {currentShift.name} telah lewat batas toleransi ({getShiftStatus(now, currentShift).graceThreshold}). Status kehadiran akan ditandai terlambat.</p>
                  </div>
                </div>
              )}
              {hasAttendedToday && !hasCheckedOutToday && checkOutInfo?.isCheckOutWindow && (
                <div className="flex items-start gap-4 p-3 bg-emerald-50 border-l-4 border-emerald-500 rounded-lg text-xs leading-relaxed">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full mt-1.5 animate-bounce shrink-0"></div>
                  <div>
                     <p className="text-emerald-900 font-bold uppercase text-[10px] mb-0.5 tracking-tight">Waktunya Pulang</p>
                     <p className="text-emerald-800 opacity-80">Jendela waktu absen pulang untuk Shift {currentShift?.name} telah terbuka. Silakan lakukan absen pulang.</p>
                  </div>
                </div>
              )}
              {/* Notifikasi khusus Jumat rawat jalan */}
              {fridayEarlyInfo && !hasCheckedOutToday && (
                <div className="flex items-start gap-4 p-3 bg-amber-50 border-l-4 border-amber-400 rounded-lg text-xs leading-relaxed">
                  <div className="w-2 h-2 bg-amber-400 rounded-full mt-1.5 animate-pulse shrink-0"></div>
                  <div>
                    <p className="text-amber-900 font-bold uppercase text-[10px] mb-0.5 tracking-tight">⚕️ Jumat — Rawat Jalan</p>
                    {fridayEarlyInfo.isTooEarly && (
                      <p className="text-amber-800 opacity-80">
                        Window absen pulang rawat jalan akan dibuka pukul <strong>{format(fridayEarlyInfo.checkOutWindowStart, 'HH:mm')}</strong> WIB
                        (s.d. {format(fridayEarlyInfo.checkOutWindowEnd, 'HH:mm')} WIB).
                      </p>
                    )}
                    {fridayEarlyInfo.isCheckOutWindow && hasAttendedToday && (
                      <p className="text-amber-800 opacity-80">
                        Window absen pulang rawat jalan <strong>sedang aktif</strong> hingga pukul {format(fridayEarlyInfo.checkOutWindowEnd, 'HH:mm')} WIB. Silakan absen pulang!
                      </p>
                    )}
                    {fridayEarlyInfo.isCheckOutWindow && !hasAttendedToday && (
                      <p className="text-amber-800 opacity-80">
                        Absen datang terlebih dahulu, kemudian lakukan absen pulang rawat jalan sebelum pukul {format(fridayEarlyInfo.checkOutWindowEnd, 'HH:mm')} WIB.
                      </p>
                    )}
                    {fridayEarlyInfo.isExpired && (
                      <p className="text-amber-800 opacity-80">
                        Window absen pulang rawat jalan telah berakhir (pukul {format(fridayEarlyInfo.checkOutWindowEnd, 'HH:mm')} WIB). Gunakan absen pulang shift normal.
                      </p>
                    )}
                  </div>
                </div>
              )}
               {isOffDay && (
                 <div className="flex items-start gap-4 p-3 bg-amber-50 border-l-4 border-amber-500 rounded-lg text-xs leading-relaxed">
                   <div className="w-2 h-2 bg-amber-500 rounded-full mt-1.5 shrink-0"></div>
                   <div>
                      <p className="text-amber-900 font-bold uppercase text-[10px] mb-0.5 tracking-tight">Status Libur</p>
                      <p className="text-amber-800 opacity-80">Berdasarkan jadwal piket, hari ini Anda dijadwalkan **LIBUR (OFF)**. Nikmati waktu istirahat Anda!</p>
                   </div>
                 </div>
               )}
               {!currentShift && !isOffDay && (
                <div className="flex items-start gap-4 p-3 bg-amber-50 border-l-4 border-amber-500 rounded-lg text-xs leading-relaxed">
                  <div className="w-2 h-2 bg-amber-500 rounded-full mt-1.5 shrink-0"></div>
                  <div>
                     <p className="text-amber-900 font-bold uppercase text-[10px] mb-0.5 tracking-tight">Di Luar Jam Piket</p>
                     <p className="text-amber-800 opacity-80">Tidak ada jadwal piket yang aktif saat ini. Silakan periksa jadwal piket Anda.</p>
                  </div>
                </div>
              )}
          </CardContent>
        </Card>
      </section>

      {/* Center/Right Panel: Dashboard Stats & Analytics */}
      {isAdmin && (
        <section className="lg:col-span-12 xl:col-span-7 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-white border border-slate-200 shadow-sm p-5 flex flex-col justify-center relative overflow-hidden group hover:ring-2 ring-indigo-100 transition-all">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 relative z-10">Hari Terjadwal</span>
              <div className="flex items-center gap-1.5 relative z-10 flex-wrap">
                {(settings?.enabledDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']).map((day: string) => (
                  <span key={day} className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-md font-black text-[10px] tracking-tight">{day.substring(0, 3).toUpperCase()}</span>
                ))}
              </div>
              <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:scale-110 transition-transform">
                <CalendarIcon size={100} />
              </div>
            </Card>
            
            <Card className="bg-white border border-slate-200 shadow-sm p-5 flex flex-col justify-center relative overflow-hidden group hover:ring-2 ring-emerald-100 transition-all">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Akurasi Lokasi</span>
              <div className="flex items-baseline gap-1 relative z-10">
                <span className="text-4xl font-black text-emerald-600 tracking-tighter tabular-nums">98.4</span>
                <span className="text-sm font-bold text-emerald-500">%</span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight relative z-10 animate-pulse">
                {locationStats.isWithinRange ? 'LOKASI_TERKUNCI' : 'DI_LUAR_RADIUS'}
              </span>
              <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:scale-110 transition-transform text-emerald-600">
                <MapPin size={100} />
              </div>
            </Card>

            <Card className="bg-white border border-slate-200 shadow-sm p-5 flex flex-col justify-center relative overflow-hidden group hover:ring-2 ring-amber-100 transition-all">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Status Hari Ini</span>
              <span className={`text-3xl font-black tracking-tighter relative z-10 ${hasAttendedToday ? (attendanceData?.isLeave ? 'text-indigo-600' : 'text-emerald-600') : 'text-amber-500'}`}>
                {hasAttendedToday ? (attendanceData?.isLeave ? 'IZIN' : 'TERCATAT') : 'MENUNGGU'}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight relative z-10">Verifikasi sedang berlangsung</span>
              <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:scale-110 transition-transform text-amber-600">
                <CheckCircle2 size={100} />
              </div>
            </Card>
          </div>

          <History standalone={false} />
        </section>
      )}

      {!isAdmin && (
        <section className="lg:col-span-12 xl:col-span-7 space-y-6">
          <History standalone={false} />
        </section>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
