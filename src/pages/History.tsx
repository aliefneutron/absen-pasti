import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/auth-context';
import { collection, query, where, orderBy, getDocs, doc, getDoc, limit } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isAfter, isBefore, isSameDay } from 'date-fns';
import { id } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, MapPin, Camera, AlertTriangle } from 'lucide-react';

export default function History({ standalone = true }: { standalone?: boolean }) {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ 
    enabledDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    shifts: [
      { name: 'Pagi', startTime: '07:30', endTime: '13:30' },
      { name: 'Sore', startTime: '13:30', endTime: '19:30' },
      { name: 'Malam', startTime: '19:30', endTime: '07:30' },
    ]
  });
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));

  useEffect(() => {
    if (user) {
      setLoading(true);
      Promise.all([fetchLogs(), fetchSettings()]).finally(() => setLoading(false));
    }
  }, [user]);

  const fetchLogs = async () => {
    try {
      // Paginasi History: Batasi muat data hanya 50 data log terakhir agar irit baca database
      const q = query(
        collection(db, 'attendance'),
        where('userId', '==', user?.uid),
        limit(100)
      );
      const snap = await getDocs(q);
      const fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort manually to avoid index requirement
      fetched.sort((a: any, b: any) => {
        const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
        const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });
      
      setLogs(fetched);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSettings = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'settings', 'global'));
      if (docSnap.exists()) {
        setSettings({ ...settings, ...docSnap.data() });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const generateHistoryData = () => {
    if (!settings) return [];
    
    let start, end;
    const today = new Date();

    if (standalone) {
      const [yearStr, monthStr] = selectedMonth.split('-');
      const year = parseInt(yearStr);
      const month = parseInt(monthStr) - 1;
      
      start = new Date(year, month, 1);
      const endOfSelectedMonth = new Date(year, month + 1, 0);
      
      end = (start.getMonth() === today.getMonth() && start.getFullYear() === today.getFullYear()) 
        ? today 
        : endOfSelectedMonth;

      if (start > today) return [];
    } else {
      start = new Date();
      start.setDate(today.getDate() - 7);
      end = today;
    }
    
    const days = eachDayOfInterval({ start, end });
    days.reverse();
    
    return days.map(d => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const log = logs.find(l => l.date === dateStr);
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
      const isEnabledDay = (settings?.enabledDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']).includes(dayName);
      const isWorkingDay = isEnabledDay;
      
      return {
        id: dateStr,
        date: d,
        dateStr,
        log,
        isWorkingDay
      };
    });
  };

  const historyData = generateHistoryData();

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-12 gap-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Memuat Riwayat...</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {standalone && (
        <div className="flex flex-col md:flex-row md:items-center justify-between px-2 mb-2 gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-800 uppercase">Riwayat Absensi</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Data verifikasi dan rekam jejak kehadiran</p>
          </div>
          <div className="flex items-center gap-2">
            <Input 
              type="month" 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(e.target.value)} 
              className="h-9 font-mono text-xs w-40 bg-white" 
            />
            <Badge variant="outline" className="h-fit py-1 px-3 border-slate-200 text-xs font-bold text-slate-500">
              {logs.length} CATATAN
            </Badge>
          </div>
        </div>
      )}

      <Card className={`bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col ${!standalone && 'flex-1 min-h-[400px]'}`}>
        {!standalone && (
          <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Riwayat Aktivitas (7 Hari)</h3>
            <Badge variant="outline" className="text-[9px] border-slate-200 font-black">{historyData.filter(d => d.log).length} CATATAN</Badge>
          </div>
        )}
        
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-black uppercase">
              <tr>
                <th className="px-4 py-3 text-[10px] tracking-widest">Tanggal / Shift</th>
                <th className="px-4 py-3 text-[10px] tracking-widest">Status Kehadiran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 italic">
              {historyData.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-12 text-center text-slate-400 font-bold uppercase tracking-wider">
                    Belum Ada Riwayat
                  </td>
                </tr>
              ) : (
                historyData.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group text-[11px]">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <CalendarIcon size={12} className={item.log ? "text-indigo-400" : "text-slate-400"} />
                        <span className={`font-mono font-black uppercase leading-none ${item.log ? 'text-slate-700' : 'text-slate-500'}`}>
                          {format(item.date, 'dd-MM-yyyy')}
                        </span>
                      </div>
                      {item.log && (
                        <div className="flex flex-col gap-1 mt-1.5 ml-5">
                          <span className="text-[10px] font-mono text-slate-600 font-bold">
                            Datang: {format(item.log.timestamp?.toDate ? item.log.timestamp.toDate() : new Date(item.log.timestamp), 'HH:mm')} WIB
                          </span>
                          <span className="text-[10px] font-mono text-slate-600 font-bold">
                            Pulang: {item.log.checkOutTimestamp ? format(item.log.checkOutTimestamp?.toDate ? item.log.checkOutTimestamp.toDate() : new Date(item.log.checkOutTimestamp), 'HH:mm') + ' WIB' : 'Tidak Absen'}
                          </span>
                          <span className="w-fit px-1.5 py-0.5 bg-indigo-50 text-indigo-500 rounded text-[8px] font-black uppercase tracking-tighter border border-indigo-100 mt-0.5">
                            Shift {item.log.shiftName || '-'}
                          </span>
                        </div>
                      )}
                      {!item.log && (
                        <div className="flex items-center gap-1 mt-1.5 ml-5 text-slate-400 font-bold">
                           <span>-</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {item.log ? (
                        item.log.isLeave ? (
                          <div className="flex flex-col gap-1">
                            <span className="w-fit px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-[9px] font-black uppercase tracking-widest border border-indigo-200">
                               {item.log.leaveType === 'I' ? 'IZIN' : item.log.leaveType === 'S' ? 'SAKIT' : item.log.leaveType === 'C' ? 'CUTI' : 'TUGAS LUAR'}
                            </span>
                            <span className="text-[8px] text-indigo-400 font-bold uppercase ml-1">Admin Bypass</span>
                          </div>
                        ) : item.log.isLate ? (
                          <div className="flex flex-col gap-1">
                            <span className="w-fit px-3 py-1 bg-rose-100 text-rose-700 rounded-lg text-[9px] font-black uppercase tracking-widest border border-rose-200">TERLAMBAT</span>
                            <span className="text-[8px] text-rose-400 font-bold uppercase ml-1">Melebihi Batas</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <span className="w-fit px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-widest border border-emerald-200">TEPAT WAKTU</span>
                            <span className="text-[8px] text-emerald-400 font-bold uppercase ml-1">Dalam Radius</span>
                          </div>
                        )
                      ) : !item.isWorkingDay ? (
                        <div className="flex flex-col gap-1">
                           <span className="w-fit px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest border border-slate-200">
                             TIDAK ADA ABSEN
                           </span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                           <span className="w-fit px-3 py-1 bg-rose-50 text-rose-500 rounded-lg text-[9px] font-black uppercase tracking-widest border border-rose-200">
                             <AlertTriangle size={10} className="inline mr-1 mb-0.5" />ALFA / TIDAK ABSEN
                           </span>
                           <span className="text-[8px] text-rose-400 font-bold uppercase ml-1">Data Tidak Ditemukan</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
