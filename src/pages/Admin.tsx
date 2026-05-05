import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, getDocs, doc, setDoc, getDoc, where, serverTimestamp, updateDoc, deleteField, deleteDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isAfter, isBefore, isSameDay, subMinutes, parse, addMinutes } from 'date-fns';
import { id } from 'date-fns/locale';
import { BarChart as BarChartIcon, Settings, Download, Search, MapPin, Users, UserPlus, Upload, X, Smartphone, RefreshCw, Edit2, Trash2, FileText, CalendarRange, Clock, AlertTriangle, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';

export default function Admin() {
  const [logs, setLogs] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<string[]>(['RAWAT INAP', 'UGD', 'KLASTER 1', 'KLASTER 2', 'KLASTER 3', 'KLASTER 4', 'LABORATORIUM', 'FARMASI']);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ 
    officeLat: 0, 
    officeLng: 0, 
    radius: 100, 
    startTime: '07:00', 
    lateTime: '08:00',
    enabledDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    locations: [] as any[],
    shifts: [
      { name: 'Pagi', startTime: '07:30', endTime: '13:30' },
      { name: 'Sore', startTime: '13:30', endTime: '19:30' },
      { name: 'Malam', startTime: '19:30', endTime: '07:30' },
    ]
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
  const [leaveEmployeeSearchTerm, setLeaveEmployeeSearchTerm] = useState('');
  
  const [reportType, setReportType] = useState<'harian' | 'bulanan'>('harian');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reportMonth, setReportMonth] = useState(format(new Date(), 'yyyy-MM'));
  
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayDesc, setNewHolidayDesc] = useState('');

  // Leave management state
  const [leaveForm, setLeaveForm] = useState({
    employeeId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    leaveType: 'I',
    reason: ''
  });
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  
  // Employee management state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ name: '', email: '', role: 'staff', nip: '', bidang: 'RAWAT INAP' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Edit employee state
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isUpdatingEmployee, setIsUpdatingEmployee] = useState(false);

  // Delete employee state
  const [deletingEmployee, setDeletingEmployee] = useState<any | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingEmployee, setIsDeletingEmployee] = useState(false);

  // Reset device state
  const [resettingEmployee, setResettingEmployee] = useState<any | null>(null);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Database flush state
  const [isClearLogsDialogOpen, setIsClearLogsDialogOpen] = useState(false);
  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [isDeduplicating, setIsDeduplicating] = useState(false);
  const [newDepartment, setNewDepartment] = useState('');
  const [isAddingDepartment, setIsAddingDepartment] = useState(false);

  // Roster management state
  const [rosters, setRosters] = useState<any[]>([]);
  const [rosterMonth, setRosterMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [isImportingRoster, setIsImportingRoster] = useState(false);
  const rosterFileRef = useRef<HTMLInputElement>(null);

  // Trigger fetchLogs setiap kali reportMonth berubah
  useEffect(() => {
    fetchLogs(reportMonth);
  }, [reportMonth]);

  // Update reportMonth secara otomatis jika user mengganti reportDate ke bulan yang berbeda
  useEffect(() => {
    const newMonth = reportDate.substring(0, 7);
    if (newMonth !== reportMonth) {
      setReportMonth(newMonth); // Ini otomatis memanggil fetchLogs untuk bulan tersebut
    }
  }, [reportDate]);

  useEffect(() => {
    fetchEmployees();
    fetchSettings();
    fetchDepartments();
    fetchRosters(rosterMonth);
  }, []);

  const fetchLogs = async (monthStr: string) => {
    setLoading(true);
    try {
      // Paginasi & Filter Bulan: Hanya ambil data untuk bulan yang dipilih agar irit kuota Reads
      const q = query(
        collection(db, 'attendance'),
        where('month', '==', monthStr)
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
    } finally {
      setLoading(false);
    }
  };

  const fetchRosters = async (monthStr: string) => {
    try {
      const q = query(collection(db, 'rosters'), where('date', '>=', `${monthStr}-01`), where('date', '<=', `${monthStr}-31`));
      const snap = await getDocs(q);
      setRosters(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      console.error("Fetch Rosters Error:", err);
    }
  };

  const updateRoster = async (employeeId: string, date: string, shiftName: string) => {
    try {
      const docId = `${employeeId}_${date}`;
      const emp = employees.find(e => e.id === employeeId || e.uid === employeeId);
      if (!emp) return;

      if (shiftName === 'OFF' || shiftName === '') {
        await deleteDoc(doc(db, 'rosters', docId));
        setRosters(prev => prev.filter(r => r.id !== docId));
      } else {
        const data = {
          userId: employeeId,
          userName: emp.displayName || emp.name,
          bidang: emp.bidang || '-',
          date: date,
          shiftName: shiftName,
          updatedAt: serverTimestamp()
        };
        await setDoc(doc(db, 'rosters', docId), data);
        setRosters(prev => {
          const filtered = prev.filter(r => r.id !== docId);
          return [...filtered, { id: docId, ...data }];
        });
      }
      toast.success('Jadwal diperbarui');
    } catch (err) {
      toast.error('Gagal memperbarui jadwal');
    }
  };

  const importRosterExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingRoster(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        
        // Peek at data to decide format
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        if (rows.length < 2) throw new Error("File kosong");

        let count = 0;
        
        // Detect Grid Format (Row 2 has 'email' and '1')
        const row2 = rows[1] || [];
        const isGridFormat = row2[0]?.toString().toLowerCase() === 'email' && row2[1]?.toString() === '1';

        if (isGridFormat) {
          const monthStr = rosterMonth; // e.g., "2026-05"
          if (!monthStr) {
             toast.error("Pilih bulan di aplikasi terlebih dahulu agar sistem tahu bulan apa yang diimpor");
             return;
          }

          for (let i = 2; i < rows.length; i++) {
            const row = rows[i];
            const email = row[0]?.toString().trim().toLowerCase();
            if (!email) continue;

            const emp = employees.find(e => e.email?.toLowerCase() === email);
            if (!emp) continue;

            // Iterate days 1-31
            for (let day = 1; day <= 31; day++) {
              const code = row[day]?.toString().toUpperCase();
              if (!code) continue;

              let shiftName = '';
              if (code === 'P') shiftName = 'Pagi';
              else if (code === 'S') shiftName = 'Sore';
              else if (code === 'M') shiftName = 'Malam';
              else if (code === 'L' || code === 'OFF') shiftName = 'OFF';

              if (shiftName) {
                const dateStr = `${monthStr}-${day.toString().padStart(2, '0')}`;
                // Check if day is valid for this month
                try {
                   const dateObj = parse(dateStr, 'yyyy-MM-dd', new Date());
                   if (format(dateObj, 'yyyy-MM') === monthStr) {
                      const docId = `${emp.id || emp.uid}_${dateStr}`;
                      await setDoc(doc(db, 'rosters', docId), {
                        userId: emp.id || emp.uid,
                        userName: emp.displayName || emp.name,
                        bidang: emp.bidang || '-',
                        date: dateStr,
                        shiftName: shiftName,
                        updatedAt: serverTimestamp()
                      });
                      count++;
                   }
                } catch(e) {}
              }
            }
          }
        } else {
          // Fallback to Vertical Format
          const data = XLSX.utils.sheet_to_json(ws) as any[];
          for (const item of data) {
            const email = (item.email || item.Email || '').toLowerCase().trim();
            let rawDate = item.tanggal || item.Tanggal || item.date || item.Date;
            const shift = item.shift || item.Shift || 'OFF';

            if (email && rawDate) {
              let normalizedDate = '';
              if (rawDate instanceof Date) {
                normalizedDate = format(rawDate, 'yyyy-MM-dd');
              } else if (typeof rawDate === 'string') {
                if (rawDate.includes('-')) {
                  const parts = rawDate.split('-');
                  if (parts[0].length === 2) {
                    try {
                      const parsed = parse(rawDate, 'dd-MM-yyyy', new Date());
                      normalizedDate = format(parsed, 'yyyy-MM-dd');
                    } catch (e) { normalizedDate = rawDate; }
                  } else {
                    normalizedDate = rawDate;
                  }
                } else {
                  normalizedDate = rawDate;
                }
              }

              const emp = employees.find(e => e.email?.toLowerCase() === email);
              if (emp && normalizedDate) {
                const docId = `${emp.id || emp.uid}_${normalizedDate}`;
                await setDoc(doc(db, 'rosters', docId), {
                  userId: emp.id || emp.uid,
                  userName: emp.displayName || emp.name,
                  bidang: emp.bidang || '-',
                  date: normalizedDate,
                  shiftName: shift,
                  updatedAt: serverTimestamp()
                });
                count++;
              }
            }
          }
        }

        toast.success(`${count} jadwal berhasil diimpor`);
        fetchRosters(rosterMonth);
      } catch (err) {
        console.error(err);
        toast.error('Gagal impor jadwal. Pastikan format sesuai.');
      } finally {
        setIsImportingRoster(false);
        if (rosterFileRef.current) rosterFileRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const downloadJadwalTemplate = () => {
    try {
      const baseDate = parse(rosterMonth || format(new Date(), 'yyyy-MM'), 'yyyy-MM', new Date());
      const monthName = format(baseDate, 'MMMM yyyy', { locale: id }).toUpperCase();
      
      // Header Row 2: email, 1, 2, 3...
      const headers = ['email'];
      for (let i = 1; i <= 31; i++) headers.push(i.toString());
      
      // Auto-fill with current employee emails
      let rows = employees.map(emp => [emp.email || '']);
      
      // Add empty columns for each day
      rows = rows.map(row => {
        const fullRow = [...row];
        for (let i = 1; i <= 31; i++) fullRow.push('');
        return fullRow;
      });

      if (rows.length === 0) {
        const placeholder = ['contoh@email.com'];
        for (let i = 1; i <= 31; i++) placeholder.push('');
        rows.push(placeholder);
      }

      const data = [
        [monthName], // Row 1
        headers,      // Row 2
        ...rows
      ];
      
      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Jadwal');
      XLSX.writeFile(wb, `Template_Jadwal_${rosterMonth || format(new Date(), 'yyyy-MM')}.xlsx`);
    } catch (err) {
      console.error("Template Error:", err);
      toast.error("Gagal mengunduh template. Pastikan bulan sudah dipilih.");
    }
  };
  
  const fetchEmployees = async () => {
    try {
      // First try with ordering (requires index)
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setEmployees(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err: any) {
      console.error("Fetch Employees (ordered) failed:", err);
      // Fallback: try without ordering if index is missing
      try {
        const qSimple = query(collection(db, 'users'));
        const snapSimple = await getDocs(qSimple);
        setEmployees(snapSimple.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err2: any) {
        console.error("Fetch Employees (simple) failed:", err2);
        toast.error('Gagal mengambil data pegawai. Cek koneksi atau izin database.');
      }
    }
  };

  const fetchDepartments = async () => {
    try {
      const docRef = doc(db, 'settings', 'departments');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setDepartments(docSnap.data().list || []);
      } else {
        // Initialize with defaults if not exists
        const defaults = ['RAWAT INAP', 'UGD', 'KLASTER 1', 'KLASTER 2', 'KLASTER 3', 'KLASTER 4', 'LABORATORIUM', 'FARMASI'];
        await setDoc(docRef, { list: defaults });
        setDepartments(defaults);
      }
    } catch (err) {
      console.error("Fetch Departments Error:", err);
    }
  };

  const addDepartment = async () => {
    if (!newDepartment.trim()) return;
    if (departments.includes(newDepartment.trim().toUpperCase())) {
      toast.error('Bidang sudah ada');
      return;
    }
    
    setIsAddingDepartment(true);
    try {
      const updated = [...departments, newDepartment.trim().toUpperCase()];
      await setDoc(doc(db, 'settings', 'departments'), { list: updated });
      setDepartments(updated);
      setNewDepartment('');
      toast.success('Bidang berhasil ditambahkan');
    } catch (err) {
      toast.error('Gagal menambahkan bidang');
    } finally {
      setIsAddingDepartment(false);
    }
  };

  const removeDepartment = async (dept: string) => {
    try {
      const updated = departments.filter(d => d !== dept);
      await setDoc(doc(db, 'settings', 'departments'), { list: updated });
      setDepartments(updated);
      toast.success('Bidang berhasil dihapus');
    } catch (err) {
      toast.error('Gagal menghapus bidang');
    }
  };

  const manualAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployee.name || !newEmployee.email) {
      toast.error('Nama dan Email wajib diisi');
      return;
    }

    setIsAddingEmployee(true);
    const toastId = toast.loading('Menambahkan/Memperbarui pegawai...');
    try {
      const emailLower = newEmployee.email.toLowerCase().trim();
      
      // Check if exists
      const q = query(collection(db, 'users'), where('email', '==', emailLower));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        // Update existing first matching document
        const existingDoc = snap.docs[0];
        await updateDoc(doc(db, 'users', existingDoc.id), {
          displayName: newEmployee.name,
          nip: newEmployee.nip,
          bidang: newEmployee.bidang,
          role: newEmployee.role,
          updatedAt: serverTimestamp()
        });
        toast.success('Data pegawai diperbarui', { id: toastId });
      } else {
        // Create new
        const id = `pre_${Date.now()}`;
        await setDoc(doc(db, 'users', id), {
          ...newEmployee,
          email: emailLower,
          displayName: newEmployee.name,
          createdAt: serverTimestamp(),
        });
        toast.success('Pegawai berhasil ditambahkan', { id: toastId });
      }

      setNewEmployee({ name: '', email: '', role: 'staff', nip: '', bidang: 'RAWAT INAP' });
      setShowAddForm(false);
      await fetchEmployees();
    } catch (err: any) {
      console.error("Manual Add Error:", err);
      toast.error(`Gagal: ${err.message || 'Izin ditolak'}`, { id: toastId });
    } finally {
      setIsAddingEmployee(false);
    }
  };

  const handleDeduplicate = async () => {
    setIsDeduplicating(true);
    const toastId = toast.loading('Membersihkan data ganda...');
    try {
      const q = query(collection(db, 'users'));
      const snap = await getDocs(q);
      const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      
      const emailMap = new Map<string, any[]>();
      allUsers.forEach(u => {
        const email = u.email?.toLowerCase().trim();
        if (!email) return;
        if (!emailMap.has(email)) emailMap.set(email, []);
        emailMap.get(email)?.push(u);
      });

      let deleteCount = 0;
      for (const [email, users] of emailMap.entries()) {
        if (users.length > 1) {
          // Identify the "best" record to keep:
          // 1. One with a 'uid' (meaning they've logged in)
          // 2. One with the longest ID (usually 'pre_...' is longer than raw uid) - actually raw UID is usually better as it holds auth connection
          // Let's prioritize ones that have a deviceId or whose ID is NOT pre_ or import_
          users.sort((a, b) => {
            const score = (u: any) => {
              let s = 0;
              if (u.id.length < 25) s += 10; // Simple heuristic: real UIDs are usually shorter than our 'pre_timestamp'
              if (u.deviceId) s += 5;
              if (u.nip) s += 2;
              if (u.createdAt?.toDate) s += 1;
              return s;
            };
            return score(b) - score(a);
          });

          // Keep the first one, delete the rest
          const toDelete = users.slice(1);
          for (const u of toDelete) {
            await deleteDoc(doc(db, 'users', u.id));
            deleteCount++;
          }
        }
      }

      toast.success(`Berhasil membersihkan ${deleteCount} data ganda.`, { id: toastId });
      fetchEmployees();
    } catch (err: any) {
      console.error("Deduplicate Error:", err);
      toast.error("Gagal membersihkan data.", { id: toastId });
    } finally {
      setIsDeduplicating(false);
    }
  };

  const submitLeaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveForm.employeeId || !leaveForm.date || !leaveForm.leaveType) {
      toast.error('Mohon lengkapi data izin');
      return;
    }
    const emp = employees.find(e => e.id === leaveForm.employeeId || e.uid === leaveForm.employeeId);
    if (!emp) return;

    setIsSubmittingLeave(true);
    try {
      const recordId = `${emp.id || emp.uid}_${leaveForm.date}`;
      const record = {
        userId: emp.id || emp.uid,
        userName: emp.displayName || emp.name || emp.email?.split('@')[0] || 'Unknown',
        userEmail: emp.email,
        timestamp: serverTimestamp(),
        date: leaveForm.date,
        isLeave: true,
        leaveType: leaveForm.leaveType,
        leaveReason: leaveForm.reason
      };

      await setDoc(doc(db, 'attendance', recordId), record);
      toast.success(`Status ${leaveForm.leaveType} berhasil disimpan untuk ${record.userName}`);
      setLeaveForm({ ...leaveForm, employeeId: '', reason: '' });
      fetchLogs();
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan data izin');
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  const confirmResetDevice = (emp: any) => {
    setResettingEmployee({
      id: emp.id || emp.uid,
      name: emp.displayName || emp.name || 'Pegawai'
    });
    setIsResetDialogOpen(true);
  };

  const handleResetDevice = async () => {
    if (!resettingEmployee) return;
    
    setIsResetting(true);
    try {
      await updateDoc(doc(db, 'users', resettingEmployee.id), {
        deviceId: deleteField()
      });
      toast.success('Kunci perangkat berhasil direset');
      setIsResetDialogOpen(false);
      fetchEmployees();
    } catch (err) {
      console.error('Reset Device Error:', err);
      toast.error('Gagal mereset perangkat');
    } finally {
      setIsResetting(false);
    }
  };

  const startEditEmployee = (emp: any) => {
    setEditingEmployee({
      id: emp.id || emp.uid,
      displayName: emp.displayName || emp.name || '',
      nip: emp.nip || '',
      bidang: emp.bidang || '',
      role: emp.role || 'staff'
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateEmployee = async () => {
    if (!editingEmployee) return;
    setIsUpdatingEmployee(true);
    try {
      await updateDoc(doc(db, 'users', editingEmployee.id), {
        displayName: editingEmployee.displayName,
        nip: editingEmployee.nip,
        bidang: editingEmployee.bidang,
        role: editingEmployee.role,
        updatedAt: serverTimestamp()
      });
      toast.success('Profil pegawai diperbarui');
      setIsEditDialogOpen(false);
      fetchEmployees();
    } catch (err) {
      console.error('Update Employee Error:', err);
      toast.error('Gagal memperbarui pegawai');
    } finally {
      setIsUpdatingEmployee(false);
    }
  };

  const confirmDeleteEmployee = (emp: any) => {
    setDeletingEmployee({
      id: emp.id || emp.uid,
      name: emp.displayName || emp.name || 'Pegawai'
    });
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteEmployee = async () => {
    if (!deletingEmployee) return;
    
    setIsDeletingEmployee(true);
    try {
      await deleteDoc(doc(db, 'users', deletingEmployee.id));
      toast.success('Pegawai berhasil dihapus');
      setIsDeleteDialogOpen(false);
      fetchEmployees();
    } catch (err) {
      console.error('Delete Employee Error:', err);
      toast.error('Gagal menghapus pegawai');
    } finally {
      setIsDeletingEmployee(false);
    }
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        let count = 0;
        for (const item of data) {
          const email = item.email || item.Email || item.EMAIL || item['Email'] || item['email'] || '';
          const name = item['nama lengkap'] || item['Nama Lengkap'] || item['NAMA LENGKAP'] || item.nama || item.Nama || item.NAMA || item.name || item.Name || item.NAME || '';
          const nip = item.nip || item.Nip || item.NIP || '';
          const bidang = item.bidang || item.Bidang || item.BIDANG || '';
          const role = (item.role || item.Role || item.ROLE || 'staff').toLowerCase();

          if (email && name) {
            const emailLower = email.toLowerCase().trim();
            
            // Check if exists
            const q = query(collection(db, 'users'), where('email', '==', emailLower));
            const snap = await getDocs(q);
            
            if (!snap.empty) {
              // Update existing
              const existingDoc = snap.docs[0];
              await updateDoc(doc(db, 'users', existingDoc.id), {
                displayName: name,
                nip: nip.toString().trim(),
                bidang: bidang.toString().trim(),
                role: role === 'admin' ? 'admin' : 'staff',
                updatedAt: serverTimestamp()
              });
            } else {
              // Create new
              const id = `import_${Date.now()}_${count}`;
              await setDoc(doc(db, 'users', id), {
                email: emailLower,
                displayName: name,
                nip: nip.toString().trim(),
                bidang: bidang.toString().trim(),
                role: role === 'admin' ? 'admin' : 'staff',
                createdAt: serverTimestamp(),
              });
            }
            count++;
          }
        }

        toast.success(`${count} pegawai berhasil diproses (tambah/update)`);
        fetchEmployees();
      } catch (err) {
        toast.error('Gagal mengimpor file Excel');
        console.error(err);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const exportToExcel = () => {
    try {
      if (logs.length === 0 && employees.length === 0) {
        toast.error('Tidak ada data untuk diekspor');
        return;
      }

      const wb = XLSX.utils.book_new();

      // Sheet 1: Attendance Logs
      if (logs.length > 0) {
        const attendanceData = logs.map(log => ({
          'Nama Pegawai': log.userName,
          'Email': log.userEmail,
          'Tanggal': log.date,
          'Shift': log.shiftName || '-',
          'Waktu (Masuk | Pulang)': `${log.timestamp?.toDate ? format(log.timestamp.toDate(), 'HH:mm:ss') : format(new Date(log.timestamp), 'HH:mm:ss')} | ${log.checkOutTimestamp ? (log.checkOutTimestamp?.toDate ? format(log.checkOutTimestamp.toDate(), 'HH:mm:ss') : format(new Date(log.checkOutTimestamp), 'HH:mm:ss')) : '--:--:--'}`,
          'Status': log.isLate ? 'TERLAMBAT' : 'ON-TIME',
          'Latitude': log.location?.latitude || 'N/A',
          'Longitude': log.location?.longitude || 'N/A',
          'Foto': log.selfieUrl?.startsWith('data:') ? 'BASE64_IMAGE_DATA' : log.selfieUrl
        }));
        const wsLogs = XLSX.utils.json_to_sheet(attendanceData);
        XLSX.utils.book_append_sheet(wb, wsLogs, 'Attendance_Logs');
      }

      // Sheet 2: Employee Data
      if (employees.length > 0) {
        const employeeData = employees.map(emp => ({
          'Nama Lengkap': emp.displayName || emp.name || 'Unknown',
          'NIP': emp.nip || '-',
          'Bidang': emp.bidang || '-',
          'Email': emp.email || '-',
          'Role / Akses': emp.role?.toUpperCase() || 'STAFF',
          'Device ID': emp.deviceId ? 'TERKUNCI' : 'TIDAK ADA',
          'Tanggal Bergabung': emp.createdAt?.toDate ? format(emp.createdAt.toDate(), 'dd/MM/yyyy') : 'N/A'
        }));
        const wsEmployees = XLSX.utils.json_to_sheet(employeeData);
        XLSX.utils.book_append_sheet(wb, wsEmployees, 'Data_Pegawai');
      }

      // Sheet 3: Global Config
      if (settings) {
        const configData = [{
          'Latitude Kantor': settings.officeLat || '-',
          'Longitude Kantor': settings.officeLng || '-',
          'Radius Absen (m)': settings.radius || '-',
          'Jam Masuk (WIB)': settings.startTime || '-',
          'Batas Terlambat (WIB)': settings.lateTime || '-',
          'Hari Operasional': settings.enabledDays ? settings.enabledDays.join(', ') : '-'
        }];
        const wsConfig = XLSX.utils.json_to_sheet(configData);
        XLSX.utils.book_append_sheet(wb, wsConfig, 'Global_Config');
      }
      
      const fileName = `PASTI_System_Arch_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('Semua data berhasil diekspor!');
    } catch (err) {
      toast.error('Gagal mengekspor data');
      console.error(err);
    }
  };

  const exportLaporanHarian = () => {
    try {
      const wb = XLSX.utils.book_new();
      const dailyData = dailyReportData.map(item => ({
        'Nama Lengkap': item.displayName || item.name || 'Unknown',
        'NIP': item.nip || '-',
        'Bidang': item.bidang || '-',
        'Status': item.log ? (item.log.isLeave ? `IZIN/SAKIT (${item.log.leaveType})` : (item.log.isLate ? 'TERLAMBAT' : 'TEPAT WAKTU')) : (item.roster && item.roster.shiftName !== 'OFF' ? 'ALFA / TIDAK ABSEN' : 'LIBUR / TIDAK TERJADWAL'),
        'Waktu (Masuk | Pulang)': item.log ? (item.log.isLeave ? '-' : `${format(item.log.timestamp?.toDate ? item.log.timestamp.toDate() : new Date(item.log.timestamp), 'HH:mm:ss')} | ${item.log.checkOutTimestamp ? format(item.log.checkOutTimestamp?.toDate ? item.log.checkOutTimestamp.toDate() : new Date(item.log.checkOutTimestamp), 'HH:mm:ss') : '--:--:--'}`) : '-'
      }));
      const ws = XLSX.utils.json_to_sheet(dailyData);
      XLSX.utils.book_append_sheet(wb, ws, `Harian_${reportDate}`);
      XLSX.writeFile(wb, `Laporan_Harian_${reportDate}.xlsx`);
      toast.success('Laporan Harian berhasil diekspor!');
    } catch (err) {
      toast.error('Gagal mengekspor Laporan Harian');
    }
  };

  const exportLaporanBulanan = () => {
    try {
      const wb = XLSX.utils.book_new();
      const monthlyData = monthlyReportData.map(item => ({
        'Nama Lengkap': item.displayName || item.name || 'Unknown',
        'NIP': item.nip || '-',
        'Bidang': item.bidang || '-',
        'Total Hari Kerja Act': item.workingDays,
        'Hadir Tepat Waktu': item.totalTepatWaktu,
        'Hadir Terlambat': item.totalTelat,
        'Izin/Sakit/Cuti/Tugas': item.totalLeave || 0,
        'Total Hadir': item.totalHadir,
        'Total Alfa': item.alfa
      }));
      const ws = XLSX.utils.json_to_sheet(monthlyData);
      XLSX.utils.book_append_sheet(wb, ws, `Bulanan_${reportMonth}`);
      XLSX.writeFile(wb, `Laporan_Bulanan_${reportMonth}.xlsx`);
      toast.success('Laporan Bulanan berhasil diekspor!');
    } catch (err) {
      toast.error('Gagal mengekspor Laporan Bulanan');
    }
  };

  const fetchSettings = async () => {
    const docSnap = await getDoc(doc(db, 'settings', 'global'));
    if (docSnap.exists()) {
      setSettings(docSnap.data() as any);
    }
  };

  const setToMyLocation = () => {
    if (navigator.geolocation) {
      toast.promise(
        new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setSettings({
                ...settings,
                officeLat: parseFloat(pos.coords.latitude.toFixed(6)),
                officeLng: parseFloat(pos.coords.longitude.toFixed(6))
              });
              resolve(pos);
            },
            (err) => reject(err),
            { enableHighAccuracy: true }
          );
        }),
        {
          loading: 'Mengambil koordinat GPS...',
          success: 'Koordinat berhasil diset ke lokasi Anda!',
          error: 'Gagal mendapatkan lokasi. Pastikan izin GPS aktif.'
        }
      );
    } else {
      toast.error('Browser tidak mendukung Geolocation');
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      // Validate settings to avoid NaN which Firestore rejects
      const sanitizedSettings: any = {
        ...settings,
        officeLat: Number(settings.officeLat) || 0,
        officeLng: Number(settings.officeLng) || 0,
        radius: Number(settings.radius) || 100,
        startTime: settings.startTime || '07:00',
        lateTime: settings.lateTime || '08:00',
        enabledDays: settings.enabledDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        holidays: (settings as any).holidays || {},
        locations: (settings.locations || []).map((loc: any) => ({
          ...loc,
          lat: Number(loc.lat),
          lng: Number(loc.lng),
          radius: Number(loc.radius) || 100
        })),
        shifts: settings.shifts || [
          { name: 'Pagi', startTime: '07:30', endTime: '13:30' },
          { name: 'Sore', startTime: '13:30', endTime: '19:30' },
          { name: 'Malam', startTime: '19:30', endTime: '07:30' },
        ],
        fridayEarlyEnd: {
          enabled: (settings as any).fridayEarlyEnd?.enabled || false,
          checkOutTime: (settings as any).fridayEarlyEnd?.checkOutTime || '10:30',
          exemptBidangs: (settings as any).fridayEarlyEnd?.exemptBidangs || ['RAWAT INAP', 'UGD'],
        }
      };
      
      await setDoc(doc(db, 'settings', 'global'), sanitizedSettings);
      setSettings(sanitizedSettings);
      toast.success('Pengaturan berhasil disinkronisasi!');
    } catch (err: any) {
      console.error('Save Settings Error:', err);
      toast.error(`Gagal menyimpan: ${err.message || 'Izin ditolak'}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h} Jam, ${m} Menit, ${s} Detik`;
  };

  const handleClearLogs = async () => {
    setIsClearingLogs(true);
    try {
      const q = query(collection(db, 'attendance'));
      const snap = await getDocs(q);
      const docs = snap.docs;
      
      // Delete in chunks of 100 to avoid client-side choking
      for (let i = 0; i < docs.length; i += 100) {
        const chunk = docs.slice(i, i + 100);
        await Promise.all(chunk.map(d => deleteDoc(doc(db, 'attendance', d.id))));
      }
      
      toast.success(`Berhasil menghapus ${docs.length} riwayat absensi. Data pegawai tetap terjaga.`);
      setIsClearLogsDialogOpen(false);
      fetchLogs(reportMonth);
    } catch (err) {
      console.error('Clear DB Error:', err);
      toast.error('Gagal mengosongkan database absen');
    } finally {
      setIsClearingLogs(false);
    }
  };

  const filteredLogs = logs.filter(log => 
    log.userName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.userEmail?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredEmployees = employees.filter(emp =>
    emp.name?.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
    emp.email?.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
    emp.displayName?.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
    emp.nip?.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
    emp.bidang?.toLowerCase().includes(employeeSearchTerm.toLowerCase())
  );

  // Group data for chart (Daily count for current month)
  const chartData = logs.reduce((acc: any[], log) => {
    const date = log.date;
    const existing = acc.find(i => i.date === date);
    if (existing) {
      existing.count += 1;
      if (log.isLate) existing.late += 1;
    } else {
      acc.push({ date, count: 1, late: log.isLate ? 1 : 0 });
    }
    return acc;
  }, []).sort((a: any,b: any) => a.date.localeCompare(b.date)).slice(-7);

  // Generate Daily Report Data
  const dailyReportData = employees.map(emp => {
    const email = emp.email?.toLowerCase();
    const log = logs.find(l => l.userEmail?.toLowerCase() === email && l.date === reportDate);
    const roster = rosters.find(r => (r.userId === emp.id || r.userId === emp.uid || r.userEmail?.toLowerCase() === email) && r.date === reportDate);
    return { ...emp, log, roster };
  });

  // Generate Monthly Report Data
  const monthlyReportData = employees.map(emp => {
    const email = emp.email?.toLowerCase();
    const empLogs = logs.filter(l => l.userEmail?.toLowerCase() === email && l.date.startsWith(reportMonth));
    
    const totalHadir = empLogs.filter(l => !l.isLeave).length;
    const totalTelat = empLogs.filter(l => !l.isLeave && l.isLate).length;
    const totalLateDuration = empLogs.reduce((acc, l) => acc + (l.lateDuration || 0), 0);
    const totalTepatWaktu = totalHadir - totalTelat;
    const totalLeave = empLogs.filter(l => l.isLeave).length;

    const today = new Date();
    const [year, month] = reportMonth.split('-');
    const start = new Date(parseInt(year), parseInt(month) - 1, 1);
    const endOfThisMonth = new Date(parseInt(year), parseInt(month), 0);
    const end = endOfThisMonth > today && start.getMonth() === today.getMonth() && start.getFullYear() === today.getFullYear() ? today : endOfThisMonth;

    let workingDays = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
      const isEnabledDay = ((settings as any).enabledDays || []).includes(dayName);
      const isHoliday = !!((settings as any).holidays && (settings as any).holidays[dateStr]);
      if (isEnabledDay && !isHoliday) {
         workingDays++;
      }
    }
    
    const alfa = Math.max(0, workingDays - totalHadir - totalLeave);
    return { ...emp, totalHadir, totalTelat, totalLateDuration, totalTepatWaktu, totalLeave, alfa, workingDays };
  });

  return (
    <div id="admin-main-container" className="space-y-6 pb-12">
      <div id="admin-header" className="flex items-center justify-between px-2">
        <div>
          <h2 id="admin-title" className="text-2xl font-black tracking-tight text-slate-800 uppercase">Pusat Kontrol</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Manajemen & Analitik Keamanan</p>
        </div>
        <div className="flex gap-2">
          <Button id="admin-export-btn" variant="outline" size="sm" onClick={exportToExcel} className="h-8 text-[10px] font-black uppercase tracking-widest border-slate-200 shadow-sm">
            <Download size={14} className="mr-1" /> Ekspor Arsip
          </Button>
        </div>
      </div>

      <Tabs id="admin-tabs" defaultValue="rekap" className="w-full">
        <TabsList id="admin-tabs-list" className="grid w-full grid-cols-2 md:grid-cols-6 bg-slate-200/50 p-1 rounded-xl h-auto border border-slate-200 gap-1">
          <TabsTrigger id="trigger-rekap" value="rekap" className="font-black text-[10px] py-2 uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm rounded-lg transition-all shrink-0">
            <Users size={14} className="mr-2" /> Rekap Data
          </TabsTrigger>
          <TabsTrigger id="trigger-laporan" value="laporan" className="font-black text-[10px] py-2 uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm rounded-lg transition-all shrink-0">
            <FileText size={14} className="mr-2" /> Laporan
          </TabsTrigger>
          <TabsTrigger id="trigger-roster" value="roster" className="font-black text-[10px] py-2 uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm rounded-lg transition-all shrink-0">
            <CalendarRange size={14} className="mr-2" /> Jadwal Piket
          </TabsTrigger>
          <TabsTrigger id="trigger-employees" value="employees" className="font-black text-[10px] py-2 uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm rounded-lg transition-all shrink-0">
            <Users size={14} className="mr-2" /> List Pegawai
          </TabsTrigger>
          <TabsTrigger id="trigger-izin" value="izin" className="font-black text-[10px] py-2 uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm rounded-lg transition-all shrink-0">
            <CalendarRange size={14} className="mr-2" /> Kelola Izin
          </TabsTrigger>
          <TabsTrigger id="trigger-settings" value="settings" className="font-black text-[10px] py-2 uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm rounded-lg transition-all shrink-0">
            <Settings size={14} className="mr-2" /> Konfigurasi Global
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rekap" className="space-y-6 mt-6">
          {/* Stats Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden group">
              <div className="p-4 flex flex-col justify-center">
                <p className="text-[9px] uppercase font-black text-slate-400 tracking-widest mb-1 group-hover:text-indigo-600 transition-colors">Jumlah Rekaman</p>
                <div className="flex items-baseline gap-1">
                  <h3 className="text-3xl font-black text-slate-800 tabular-nums">{logs.length}</h3>
                  <span className="text-[10px] font-bold text-slate-400 font-mono">UUID</span>
                </div>
              </div>
            </Card>
            <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden group">
              <div className="p-4 flex flex-col justify-center border-l-4 border-amber-500">
                <p className="text-[9px] uppercase font-black text-slate-400 tracking-widest mb-1">Terlambat</p>
                <div className="flex items-baseline gap-1">
                  <h3 className="text-3xl font-black text-amber-600 tabular-nums">{logs.filter(l => l.isLate).length}</h3>
                  <span className="text-[10px] font-bold text-slate-400 font-mono">PENGGUNA</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Chart */}
          <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-row items-center justify-between">
              <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <BarChartIcon size={14} className="text-indigo-500" />
                Tren Kehadiran (7 Hari)
              </CardTitle>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Dataset Langsung</span>
            </CardHeader>
            <CardContent className="h-56 pt-6 px-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} 
                    tickFormatter={(val) => val.split('-').slice(1).reverse().join('/')} 
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{fontSize: 9, fontWeight: 700, fill: '#94a3b8'}} 
                    axisLine={false} 
                    tickLine={false}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: '10px', fontWeight: 800 }}
                    cursor={{fill: '#f8fafc'}}
                  />
                  <Bar dataKey="count" name="TEPAT WAKTU" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="late" name="TERLAMBAT" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Detailed Table */}
          <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Log Audit Utama</h3>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                <Input 
                  placeholder="Cari nama/email..." 
                  className="pl-9 h-8 bg-white border-slate-200 text-xs font-medium placeholder:text-slate-300 focus-visible:ring-indigo-500" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-b border-slate-200">
                    <TableHead className="font-black text-[9px] uppercase tracking-widest py-4">Identitas Pegawai</TableHead>
                    <TableHead className="font-black text-[9px] uppercase tracking-widest py-4">Shift</TableHead>
                    <TableHead className="font-black text-[9px] uppercase tracking-widest py-4">Tanggal</TableHead>
                    <TableHead className="font-black text-[9px] uppercase tracking-widest py-4">Waktu (Masuk | Pulang)</TableHead>
                    <TableHead className="font-black text-[9px] uppercase tracking-widest py-4">Status</TableHead>
                    <TableHead className="font-black text-[9px] uppercase tracking-widest py-4 text-right">Jejak Visual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.slice(0, 50).map((log) => ( // Batasi tampilan tabel hanya 50 data teratas
                    <TableRow key={log.id} className="group hover:bg-indigo-50/30 transition-colors border-b border-slate-100 last:border-0 italic">
                      <TableCell className="py-4">
                        <p className="font-black text-slate-800 text-[11px] leading-tight uppercase">{log.userName}</p>
                        <p className="text-[9px] text-slate-400 font-mono lower-case tracking-tight">{log.userEmail}</p>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant="outline" className="text-[9px] font-black uppercase border-indigo-200 text-indigo-700 bg-indigo-50">
                          {log.shiftName || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4">
                        <p className="text-[10px] font-black text-slate-700 tabular-nums leading-tight uppercase font-mono">
                          {(() => {
                            const [y, m, d] = log.date.split('-');
                            return `${d}-${m}-${y}`;
                          })()}
                        </p>
                      </TableCell>
                      <TableCell className="py-4">
                        <p className="text-[10px] font-black text-slate-700 tabular-nums leading-tight uppercase font-mono">
                          {format(log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp), 'HH:mm:ss')} | {log.checkOutTimestamp ? format(log.checkOutTimestamp?.toDate ? log.checkOutTimestamp.toDate() : new Date(log.checkOutTimestamp), 'HH:mm:ss') : '--:--:--'}
                        </p>
                      </TableCell>
                      <TableCell className="py-4">
                        {log.isLate ? (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[9px] font-black uppercase tracking-tighter">TERLAMBAT</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase tracking-tighter">TEPAT WAKTU</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right py-4">
                        <div className="inline-block">
                          <div 
                            onClick={() => log.selfieUrl && setSelectedPhoto(log.selfieUrl)}
                            className={`h-10 w-10 rounded-lg overflow-hidden border border-slate-200 shadow-sm transition-all hover:ring-2 ring-indigo-500 scale-95 hover:scale-100 ${log.selfieUrl ? 'cursor-pointer' : ''}`}
                          >
                            {log.selfieUrl ? (
                              <img src={log.selfieUrl} alt="Selfie" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full bg-slate-100 flex items-center justify-center text-[8px] font-black text-slate-300 uppercase">Tidak Ada Foto</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="laporan" className="space-y-6 mt-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
             <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                <Button variant={reportType === 'harian' ? 'default' : 'ghost'} size="sm" onClick={() => setReportType('harian')} className="h-8 text-[10px] font-black uppercase tracking-widest"><CalendarRange size={14} className="mr-2"/> Harian</Button>
                <Button variant={reportType === 'bulanan' ? 'default' : 'ghost'} size="sm" onClick={() => setReportType('bulanan')} className="h-8 text-[10px] font-black uppercase tracking-widest"><Clock size={14} className="mr-2"/> Bulanan</Button>
             </div>
             <div className="flex gap-2 items-center">
               {reportType === 'harian' ? (
                 <>
                   <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="h-9 font-mono text-xs w-40 bg-white" />
                   <Button onClick={exportLaporanHarian} size="sm" variant="outline" className="h-9 border-slate-200 shadow-sm text-[10px] font-black uppercase"><Download size={14} className="mr-1"/> Export Harian</Button>
                 </>
               ) : (
                 <>
                   <Input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="h-9 font-mono text-xs w-40 bg-white" />
                   <Button onClick={exportLaporanBulanan} size="sm" variant="outline" className="h-9 border-slate-200 shadow-sm text-[10px] font-black uppercase"><Download size={14} className="mr-1"/> Export Bulanan</Button>
                 </>
               )}
             </div>
          </div>
          
          <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white">
             {reportType === 'harian' ? (
                <>
                <CardHeader className="p-4 border-b bg-slate-50/50">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Laporan Presensi Harian: {(() => {
                      const [y, m, d] = reportDate.split('-');
                      return `${d}-${m}-${y}`;
                    })()}
                  </h3>
                </CardHeader>
                <div className="overflow-x-auto">
                   <Table>
                      <TableHeader className="bg-slate-50/80">
                         <TableRow>
                           <TableHead className="font-black text-[9px] uppercase tracking-widest py-4">Nama Pegawai</TableHead>
                           <TableHead className="font-black text-[9px] uppercase tracking-widest py-4">NIP / Bidang</TableHead>
                           <TableHead className="font-black text-[9px] uppercase tracking-widest py-4">Status / Waktu</TableHead>
                         </TableRow>
                      </TableHeader>
                      <TableBody>
                         {dailyReportData.map((item, idx) => (
                            <TableRow key={idx} className="group hover:bg-slate-50 border-b border-slate-100 last:border-0 italic">
                               <TableCell className="py-4">
                                  <p className="font-black text-slate-800 text-[11px] leading-tight uppercase">{item.displayName || item.name || 'Unknown'}</p>
                                  <p className="text-[9px] text-slate-400 font-mono tracking-tight">{item.email}</p>
                               </TableCell>
                               <TableCell className="py-4">
                                  <p className="font-mono text-[10px] text-slate-500">{item.nip || '-'}</p>
                                  <Badge variant="secondary" className="text-[9px] font-bold uppercase py-0 px-2 mt-1 bg-slate-100 text-slate-600">{item.bidang || '-'}</Badge>
                               </TableCell>
                               <TableCell className="py-4">
                                  {item.log ? (
                                     <>
                                        <Badge variant={item.log.isLate ? 'destructive' : 'default'} className="text-[9px] font-black uppercase tracking-tighter shadow-none">
                                           {item.log.isLate ? 'TERLAMBAT' : 'TEPAT WAKTU'}
                                        </Badge>
                                        {item.log.isLate && (
                                           <div className="text-[9px] font-black text-rose-500 mt-1 uppercase tracking-tighter">
                                             Terlambat: {Math.floor((item.log.lateDuration || 0) / 60)} Menit
                                           </div>
                                        )}
                                                                                 <div className="text-[10px] font-mono text-slate-500 mt-1">
                                            {format(item.log.timestamp?.toDate ? item.log.timestamp.toDate() : new Date(item.log.timestamp), 'HH:mm:ss')} | {item.log.checkOutTimestamp ? format(item.log.checkOutTimestamp?.toDate ? item.log.checkOutTimestamp.toDate() : new Date(item.log.checkOutTimestamp), 'HH:mm:ss') : '--:--:--'}
                                         </div>

                                     </>
                                                                     ) : item.roster && item.roster.shiftName !== 'OFF' ? (

                                     <Badge variant="outline" className="text-[9px] font-black uppercase tracking-tighter border-rose-200 text-rose-500 bg-rose-50/50">
                                        <AlertTriangle size={10} className="mr-1"/> ALFA / TIDAK ABSEN
                                     </Badge>
                                                                     ) : (
                                      <Badge variant="outline" className="text-[9px] font-black uppercase tracking-tighter border-slate-200 text-slate-400 bg-slate-50/50">
                                         LIBUR / TIDAK TERJADWAL
                                      </Badge>
                                   )}

                               </TableCell>
                            </TableRow>
                         ))}
                      </TableBody>
                   </Table>
                </div>
                </>
             ) : (
                <>
                <CardHeader className="p-4 border-b bg-slate-50/50">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Hari Kerja Efektif: {monthlyReportData[0]?.workingDays || 0} Hari (sd Hari Ini)</h3>
                </CardHeader>
                <div className="overflow-x-auto">
                   <Table>
                      <TableHeader className="bg-slate-50/80">
                         <TableRow>
                           <TableHead className="font-black text-[9px] uppercase tracking-widest py-4">Nama Pegawai</TableHead>
                           <TableHead className="font-black text-[9px] uppercase tracking-widest py-4 text-center">Hadir</TableHead>
                           <TableHead className="font-black text-[9px] uppercase tracking-widest py-4 text-center">Tepat Wkt</TableHead>
                           <TableHead className="font-black text-[9px] uppercase tracking-widest py-4 text-center">Terlambat</TableHead>
                            <TableHead className="font-black text-[9px] uppercase tracking-widest py-4 text-center">Total Terlambat</TableHead>
                           <TableHead className="font-black text-[9px] uppercase tracking-widest py-4 text-center text-rose-600">Alfa</TableHead>
                         </TableRow>
                      </TableHeader>
                      <TableBody>
                         {monthlyReportData.map((item, idx) => (
                            <TableRow key={idx} className="group hover:bg-slate-50 border-b border-slate-100 last:border-0 italic">
                               <TableCell className="py-4">
                                  <p className="font-black text-slate-800 text-[11px] leading-tight uppercase">{item.displayName || item.name || 'Unknown'}</p>
                                  <p className="text-[9px] text-slate-400 font-mono tracking-tight">{item.bidang || '-'}</p>
                               </TableCell>
                               <TableCell className="py-4 text-center font-black text-[12px] text-indigo-600">{item.totalHadir}</TableCell>
                               <TableCell className="py-4 text-center font-bold text-[11px] text-emerald-600">{item.totalTepatWaktu}</TableCell>
                               <TableCell className="py-4 text-center font-bold text-[11px] text-amber-500">{item.totalTelat}</TableCell>
                               <TableCell className="py-4 text-center font-bold text-[9px] text-rose-600">
                                  {formatDuration(item.totalLateDuration)}
                               </TableCell>
                               <TableCell className="py-4 text-center font-black text-[12px] text-rose-600 bg-rose-50/30">{item.alfa}</TableCell>
                            </TableRow>
                         ))}
                      </TableBody>
                   </Table>
                </div>
                </>
             )}
          </Card>
        </TabsContent>
        <TabsContent value="roster" className="space-y-6 mt-6 italic">
          {/* Monitoring Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
               <div className="p-4 flex flex-col justify-center border-l-4 border-indigo-500">
                 <p className="text-[9px] uppercase font-black text-slate-400 tracking-widest mb-1">Harusnya Hadir Hari Ini</p>
                 <h3 className="text-2xl font-black text-slate-800 tabular-nums">
                   {rosters.filter(r => r.date === format(new Date(), 'yyyy-MM-dd') && r.shiftName !== 'OFF').length}
                 </h3>
                 <p className="text-[8px] font-bold text-slate-400 uppercase">Sesuai Jadwal Piket</p>
               </div>
             </Card>
             <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
               <div className="p-4 flex flex-col justify-center border-l-4 border-emerald-500">
                 <p className="text-[9px] uppercase font-black text-slate-400 tracking-widest mb-1">Sudah Absen</p>
                 <h3 className="text-2xl font-black text-emerald-600 tabular-nums">
                   {rosters.filter(r => {
                     const isToday = r.date === format(new Date(), 'yyyy-MM-dd');
                     const hasLog = logs.some(l => l.date === r.date && l.shiftName === r.shiftName && (l.userId === r.userId || l.userEmail === r.userEmail));
                     return isToday && r.shiftName !== 'OFF' && hasLog;
                   }).length}
                 </h3>
                 <p className="text-[8px] font-bold text-slate-400 uppercase">Terverifikasi Sistem</p>
               </div>
             </Card>
             <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
               <div className="p-4 flex flex-col justify-center border-l-4 border-rose-500">
                 <p className="text-[9px] uppercase font-black text-slate-400 tracking-widest mb-1">Tidak Absen (Bolos/Telat)</p>
                 <h3 className="text-2xl font-black text-rose-600 tabular-nums">
                   {rosters.filter(r => {
                     const isToday = r.date === format(new Date(), 'yyyy-MM-dd');
                     const hasLog = logs.some(l => l.date === r.date && l.shiftName === r.shiftName && (l.userId === r.userId || l.userEmail === r.userEmail));
                     return isToday && r.shiftName !== 'OFF' && !hasLog;
                   }).length}
                 </h3>
                 <p className="text-[8px] font-bold text-rose-400 uppercase animate-pulse">Perlu Tindak Lanjut</p>
               </div>
             </Card>
          </div>

          {/* List Monitoring Detail */}
          {rosters.filter(r => r.date === format(new Date(), 'yyyy-MM-dd') && r.shiftName !== 'OFF' && !logs.some(l => l.date === r.date && l.shiftName === r.shiftName && (l.userId === r.userId || l.userEmail === r.userEmail))).length > 0 && (
            <Card className="border border-rose-200 shadow-md bg-rose-50/30 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
               <CardHeader className="p-4 border-b border-rose-100 bg-rose-50 flex flex-row items-center justify-between">
                 <CardTitle className="text-[10px] font-black text-rose-700 uppercase tracking-widest flex items-center gap-2">
                    <AlertTriangle size={14} className="text-rose-500 animate-bounce" />
                    Daftar Tidak Absen Hari Ini
                 </CardTitle>
                 <Badge variant="outline" className="bg-white border-rose-200 text-rose-600 text-[8px] font-black uppercase">Segera Cek</Badge>
               </CardHeader>
               <div className="overflow-x-auto">
                 <Table>
                   <TableHeader>
                     <TableRow className="border-b border-rose-100">
                       <TableHead className="text-[9px] font-black uppercase text-rose-600/70">Nama Pegawai</TableHead>
                       <TableHead className="text-[9px] font-black uppercase text-rose-600/70">Bidang</TableHead>
                       <TableHead className="text-[9px] font-black uppercase text-rose-600/70 text-center">Shift</TableHead>
                       <TableHead className="text-[9px] font-black uppercase text-rose-600/70 text-right">Status</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody>
                     {rosters.filter(r => {
                        const isToday = r.date === format(new Date(), 'yyyy-MM-dd');
                        const hasLog = logs.some(l => l.date === r.date && l.shiftName === r.shiftName && (l.userId === r.userId || l.userEmail === r.userEmail));
                        return isToday && r.shiftName !== 'OFF' && !hasLog;
                     }).map((m, idx) => (
                       <TableRow key={idx} className="border-b border-rose-50 last:border-0 hover:bg-rose-100/30 transition-colors">
                         <TableCell className="py-3">
                           <p className="font-black text-slate-800 text-[10px] uppercase">{m.userName}</p>
                         </TableCell>
                         <TableCell className="py-3">
                           <p className="text-[9px] text-slate-500 font-bold uppercase">{m.bidang}</p>
                         </TableCell>
                         <TableCell className="py-3 text-center">
                            <Badge className={cn(
                              "text-[8px] font-black px-2 py-0",
                              m.shiftName === 'Pagi' ? "bg-emerald-500" : m.shiftName === 'Sore' ? "bg-amber-500" : "bg-indigo-500"
                            )}>
                              {m.shiftName}
                            </Badge>
                         </TableCell>
                         <TableCell className="py-3 text-right">
                           <span className="text-[8px] font-black text-rose-500 uppercase tracking-tighter italic">Belum Ada Rekaman</span>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               </div>
            </Card>
          )}

          <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Manajemen Jadwal Piket</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Input jadwal piket harian pegawai</p>
              </div>
              <div className="flex items-center gap-2">
                <Input 
                  type="month" 
                  value={rosterMonth} 
                  onChange={(e) => {
                    setRosterMonth(e.target.value);
                    fetchRosters(e.target.value);
                  }}
                  className="h-8 text-[10px] w-40 bg-white"
                />
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => rosterFileRef.current?.click()}
                  disabled={isImportingRoster}
                  className="h-8 text-[9px] font-black uppercase tracking-widest border-slate-200"
                >
                  <Upload size={14} className="mr-1.5" /> {isImportingRoster ? 'Mengimpor...' : 'Impor Jadwal'}
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={downloadJadwalTemplate}
                  className="h-8 text-[8px] font-bold uppercase tracking-widest text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                >
                  <Download size={12} className="mr-1.5" /> Template
                </Button>
                <input type="file" ref={rosterFileRef} className="hidden" accept=".xlsx, .xls" onChange={importRosterExcel} />
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow>
                    <TableHead className="sticky left-0 bg-slate-50 z-20 font-black text-[9px] uppercase tracking-widest py-4 border-r shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Pegawai</TableHead>
                    {rosterMonth && eachDayOfInterval({ 
                      start: startOfMonth(parse(rosterMonth, 'yyyy-MM', new Date())), 
                      end: endOfMonth(parse(rosterMonth, 'yyyy-MM', new Date())) 
                    }).map(date => (
                      <TableHead key={format(date, 'yyyy-MM-dd')} className="text-center min-w-[50px] font-black text-[9px] uppercase tracking-widest py-2 px-1 border-r last:border-0">
                        <span className="opacity-50">{format(date, 'EEE')}</span><br/>
                        <span className="text-slate-800">{format(date, 'dd')}</span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map(emp => (
                    <TableRow key={emp.id} className="hover:bg-slate-50 italic">
                      <TableCell className="sticky left-0 bg-white z-10 py-3 border-r min-w-[150px] shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                        <p className="font-black text-slate-800 text-[10px] uppercase leading-tight">{emp.displayName || emp.name}</p>
                        <p className="text-[8px] text-slate-400 font-mono">{emp.bidang || '-'}</p>
                      </TableCell>
                      {rosterMonth && eachDayOfInterval({ 
                        start: startOfMonth(parse(rosterMonth, 'yyyy-MM', new Date())), 
                        end: endOfMonth(parse(rosterMonth, 'yyyy-MM', new Date())) 
                      }).map(date => {
                        const dateStr = format(date, 'yyyy-MM-dd');
                        const roster = rosters.find(r => r.userId === (emp.id || emp.uid) && r.date === dateStr);
                        return (
                          <TableCell key={dateStr} className="p-0 text-center border-r last:border-0 h-12">
                            <select
                              value={roster?.shiftName || ''}
                              onChange={(e) => updateRoster(emp.id || emp.uid, dateStr, e.target.value)}
                              className={cn(
                                "w-full h-full text-[9px] font-black p-0 text-center border-none appearance-none cursor-pointer focus:ring-1 focus:ring-inset focus:ring-indigo-500 bg-transparent transition-colors",
                                roster?.shiftName === 'Pagi' ? "bg-emerald-50 text-emerald-700" :
                                roster?.shiftName === 'Sore' ? "bg-amber-50 text-amber-700" :
                                roster?.shiftName === 'Malam' ? "bg-indigo-50 text-indigo-700" :
                                roster?.shiftName === 'OFF' ? "bg-rose-50 text-rose-500" : "text-slate-200"
                              )}
                            >
                              <option value="" className="text-slate-300">-</option>
                              <option value="Pagi" className="bg-white text-emerald-600 font-bold">P</option>
                              <option value="Sore" className="bg-white text-amber-600 font-bold">S</option>
                              <option value="Malam" className="bg-white text-indigo-600 font-bold">M</option>
                              <option value="OFF" className="bg-white text-rose-600 font-bold text-[8px]">OFF</option>
                            </select>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <CardFooter className="p-3 bg-slate-50 border-t flex justify-between items-center">
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">P: Pagi | S: Sore | M: Malam | OFF: Libur</p>
              <p className="text-[8px] font-bold text-indigo-500 uppercase tracking-widest">Klik sel untuk mengubah shift</p>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="employees" className="space-y-6 mt-6">
          <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-4 border-b bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Direktori Pegawai</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Kelola akses & izin</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-8 text-[9px] font-black uppercase tracking-widest border-slate-200"
                  onClick={() => setShowAddForm(!showAddForm)}
                >
                  <UserPlus size={14} className="mr-1.5" /> {showAddForm ? 'Batal' : 'Tambah Pegawai'}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-8 text-[9px] font-black uppercase tracking-widest border-slate-200"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                >
                  <Upload size={14} className="mr-1.5" /> {isImporting ? 'Mengimpor...' : 'Impor Excel'}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-8 text-[9px] font-black uppercase tracking-widest border-rose-200 text-rose-600 hover:bg-rose-50"
                  onClick={handleDeduplicate}
                  disabled={isDeduplicating}
                >
                  <Trash2 size={14} className="mr-1.5" /> {isDeduplicating ? 'Membersihkan...' : 'Bersihkan Duplikat'}
                </Button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleExcelImport}
                />
                
                <div id="employee-search-container" className="relative w-full sm:w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3" />
                  <Input 
                    placeholder="Cari..." 
                    className="pl-8 h-8 bg-white border-slate-200 text-[10px] font-medium placeholder:text-slate-300 focus-visible:ring-indigo-500" 
                    value={employeeSearchTerm}
                    onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>

            {showAddForm && (
              <div className="p-4 bg-slate-50/50 border-b border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
                <form onSubmit={manualAddEmployee} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase text-slate-400">Nama Lengkap</Label>
                    <Input 
                      placeholder="misal: John Doe" 
                      value={newEmployee.name} 
                      onChange={e => setNewEmployee({...newEmployee, name: e.target.value})}
                      className="h-8 text-[10px] bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase text-slate-400">Alamat Email</Label>
                    <Input 
                      placeholder="email@perusahaan.com" 
                      type="email" 
                      value={newEmployee.email} 
                      onChange={e => setNewEmployee({...newEmployee, email: e.target.value})}
                      className="h-8 text-[10px] bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase text-slate-400">NIP</Label>
                    <Input 
                      placeholder="NIP" 
                      value={newEmployee.nip} 
                      onChange={e => setNewEmployee({...newEmployee, nip: e.target.value})}
                      className="h-8 text-[10px] bg-white font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase text-slate-400">Bidang</Label>
                    <select 
                      value={newEmployee.bidang} 
                      onChange={e => setNewEmployee({...newEmployee, bidang: e.target.value})}
                      className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-[10px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
                    >
                      {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase text-slate-400">Peran Sistem</Label>
                    <select 
                      value={newEmployee.role} 
                      onChange={e => setNewEmployee({...newEmployee, role: e.target.value})}
                      className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-[10px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500"
                    >
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <Button 
                    type="submit" 
                    disabled={isAddingEmployee}
                    className="h-8 bg-indigo-600 text-white font-black text-[9px] uppercase tracking-widest"
                  >
                    {isAddingEmployee ? 'Menambahkan...' : 'Konfirmasi Tambah'}
                  </Button>
                </form>
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80">
                  <TableRow className="border-b border-slate-200">
                    <TableHead className="font-black text-[9px] uppercase tracking-widest py-4">Nama Pegawai</TableHead>
                    <TableHead className="font-black text-[9px] uppercase tracking-widest py-4">NIP</TableHead>
                    <TableHead className="font-black text-[9px] uppercase tracking-widest py-4">Bidang</TableHead>
                    <TableHead className="font-black text-[9px] uppercase tracking-widest py-4">Email Kontak</TableHead>
                    <TableHead className="font-black text-[9px] uppercase tracking-widest py-4">Peran / Akses</TableHead>
                    <TableHead className="font-black text-[9px] uppercase tracking-widest py-4">Bergabung</TableHead>
                    <TableHead className="font-black text-[9px] uppercase tracking-widest py-4 text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.map((emp) => (
                    <TableRow key={emp.id} className="group hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 italic">
                      <TableCell className="py-4">
                        <p className="font-black text-slate-800 text-[11px] leading-tight uppercase">{emp.displayName || emp.name || 'Unknown'}</p>
                      </TableCell>
                      <TableCell className="py-4 font-mono text-[10px] text-slate-500">
                        {emp.nip || '-'}
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant="secondary" className="text-[9px] font-bold uppercase py-0 px-2 bg-slate-100 text-slate-600">
                          {emp.bidang || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4 font-mono text-[10px] text-slate-400">
                        {emp.email}
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant="outline" className={`text-[9px] font-black uppercase ${emp.role === 'admin' ? 'border-indigo-200 text-indigo-700 bg-indigo-50' : 'border-slate-200 text-slate-500 bg-slate-50'}`}>
                          {emp.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4 text-[10px] font-mono text-slate-400">
                        {emp.createdAt?.toDate ? format(emp.createdAt.toDate(), 'dd/MM/yyyy') : 'N/A'}
                      </TableCell>
                      <TableCell className="py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {emp.email === 'aliefneutron@gmail.com' ? (
                            <Badge className="bg-indigo-600 text-white text-[8px] font-black uppercase tracking-widest px-3 py-1 border-none shadow-sm">
                              Master Admin
                            </Badge>
                          ) : (
                            <>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => startEditEmployee(emp)}
                                className="h-7 w-7 p-0 border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-all"
                              >
                                <Edit2 size={12} />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => confirmDeleteEmployee(emp)}
                                className="h-7 w-7 p-0 border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-all"
                              >
                                <Trash2 size={12} />
                              </Button>
                              <div className="w-px h-7 bg-slate-100 mx-1" />
                              {emp.deviceId ? (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => confirmResetDevice(emp)}
                                  className="h-7 text-[8px] font-black uppercase tracking-widest border-rose-200 text-rose-600 hover:bg-rose-50 px-2"
                                >
                                  <RefreshCw size={10} className="mr-1" /> Reset Perangkat
                                </Button>
                              ) : (
                                <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest italic pr-2 self-center">Tidak Ada Perangkat</span>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center text-slate-400 font-bold uppercase tracking-widest">
                        Tidak ada pegawai yang ditemukan sesuai kriteria
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-6 space-y-6">
          <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b p-4">
              <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex gap-2 items-center">
                <Clock size={14} className="text-indigo-500" /> Siklus Shift & Tugas
              </CardTitle>
              <CardDescription className="text-xs font-medium text-slate-400">Konfigurasi shift, jendela operasional, dan masa tenggang.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-8">
              {/* Shift Configuration */}
              <div className="space-y-4">
                <Label className="text-[11px] font-black uppercase text-indigo-600 tracking-wider">Jadwal Shift & Jendela Waktu</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(settings.shifts || []).map((shift, idx) => (
                    <Card key={idx} className="border border-slate-200 shadow-sm bg-slate-50/50 p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <Badge className="bg-indigo-600 text-white font-black text-[9px] uppercase tracking-widest">Shift {shift.name}</Badge>
                        <span className="text-[9px] font-bold text-slate-400 uppercase italic">Toleransi Keterlambatan: 30m</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-black uppercase text-slate-400">Waktu Mulai</Label>
                          <Input 
                            type="time" 
                            value={shift.startTime} 
                            className="h-8 text-[10px] font-mono bg-white border-slate-200"
                            onChange={(e) => {
                              const newShifts = [...(settings.shifts || [])];
                              newShifts[idx].startTime = e.target.value;
                              setSettings({...settings, shifts: newShifts});
                            }}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-black uppercase text-slate-400">Waktu Selesai</Label>
                          <Input 
                            type="time" 
                            value={shift.endTime} 
                            className="h-8 text-[10px] font-mono bg-white border-slate-200"
                            onChange={(e) => {
                              const newShifts = [...(settings.shifts || [])];
                              newShifts[idx].endTime = e.target.value;
                              setSettings({...settings, shifts: newShifts});
                            }}
                          />
                        </div>
                      </div>
                      <div className="pt-1 border-t border-slate-200">
                         <p className="text-[8px] font-bold text-slate-400 uppercase leading-tight italic">
                           * Absen diizinkan mulai {shift.startTime} WIB. Terlambat setelah {format(addMinutes(parse(shift.startTime, 'HH:mm', new Date()), 30), 'HH:mm')} WIB.
                         </p>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="w-full h-px bg-slate-100" />

              {/* === ATURAN KHUSUS JUMAT === */}
              <div className="space-y-4">
                <CardHeader className="p-0">
                  <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex gap-2 items-center">
                    <Clock size={14} className="text-amber-500" /> Aturan Khusus Jumat — Rawat Jalan
                  </CardTitle>
                  <CardDescription className="text-xs font-medium text-slate-400 mt-1">
                    Pegawai Shift Pagi (non-24 jam) dapat absen pulang lebih awal di hari Jumat untuk keperluan rawat jalan.
                  </CardDescription>
                </CardHeader>

                <div className="p-4 bg-amber-50/60 border border-amber-100 rounded-xl space-y-5">
                  {/* Toggle aktif */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase text-amber-800 tracking-wider">Aktifkan Fitur Rawat Jalan</p>
                      <p className="text-[9px] text-amber-600 font-medium mt-0.5">Jika aktif, window absen pulang di hari Jumat akan disesuaikan untuk shift pagi.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const current = (settings as any).fridayEarlyEnd?.enabled || false;
                        setSettings({
                          ...settings,
                          fridayEarlyEnd: {
                            ...((settings as any).fridayEarlyEnd || {}),
                            enabled: !current,
                            checkOutTime: (settings as any).fridayEarlyEnd?.checkOutTime || '10:30',
                            exemptBidangs: (settings as any).fridayEarlyEnd?.exemptBidangs || ['RAWAT INAP', 'UGD'],
                          }
                        } as any);
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                        (settings as any).fridayEarlyEnd?.enabled ? 'bg-amber-500' : 'bg-slate-200'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${
                        (settings as any).fridayEarlyEnd?.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  {(settings as any).fridayEarlyEnd?.enabled && (
                    <>
                      {/* Jam Absen Pulang */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-black uppercase text-amber-700">Jam Absen Pulang Jumat</Label>
                          <Input
                            type="time"
                            value={(settings as any).fridayEarlyEnd?.checkOutTime || '10:30'}
                            onChange={(e) => setSettings({
                              ...settings,
                              fridayEarlyEnd: {
                                ...((settings as any).fridayEarlyEnd || {}),
                                checkOutTime: e.target.value,
                              }
                            } as any)}
                            className="h-9 text-sm font-mono bg-white border-amber-200 focus-visible:ring-amber-400"
                          />
                          <p className="text-[8px] text-amber-600 font-bold italic">
                            * Window aktif: dari jam ini sampai +30 menit
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-black uppercase text-amber-700">Contoh Window</Label>
                          <div className="h-9 px-3 bg-white border border-amber-200 rounded-md flex items-center">
                            <span className="text-[10px] font-mono font-black text-amber-700">
                              {(() => {
                                const t = (settings as any).fridayEarlyEnd?.checkOutTime || '10:30';
                                const [h, m] = t.split(':').map(Number);
                                const startMin = h * 60 + m;
                                const endMin = h * 60 + m + 30;
                                const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2,'0')}:${String(min % 60).padStart(2,'0')}`;
                                return `${fmt(startMin)} – ${fmt(endMin)} WIB`;
                              })()}
                            </span>
                          </div>
                          <p className="text-[8px] text-amber-600 font-bold italic">Interval window absen pulang aktif</p>
                        </div>
                      </div>

                      {/* Bidang yang dikecualikan */}
                      <div className="space-y-2">
                        <Label className="text-[9px] font-black uppercase text-amber-700">Bidang yang Dikecualikan (Shift 24 Jam)</Label>
                        <p className="text-[8px] text-amber-600 font-bold">Bidang di bawah tetap mengikuti jam shift normal, tidak terpengaruh aturan Jumat.</p>
                        <div className="flex flex-wrap gap-2">
                          {departments.map(dept => {
                            const exempts: string[] = (settings as any).fridayEarlyEnd?.exemptBidangs || ['RAWAT INAP', 'UGD'];
                            const isExempt = exempts.includes(dept);
                            return (
                              <button
                                key={dept}
                                type="button"
                                onClick={() => {
                                  const current: string[] = (settings as any).fridayEarlyEnd?.exemptBidangs || ['RAWAT INAP', 'UGD'];
                                  const updated = isExempt
                                    ? current.filter(b => b !== dept)
                                    : [...current, dept];
                                  setSettings({
                                    ...settings,
                                    fridayEarlyEnd: {
                                      ...((settings as any).fridayEarlyEnd || {}),
                                      exemptBidangs: updated,
                                    }
                                  } as any);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border ${
                                  isExempt
                                    ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                                    : 'bg-white border-amber-200 text-amber-600 hover:border-amber-400'
                                }`}
                              >
                                {isExempt ? '⛔ ' : ''}{dept}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[8px] text-amber-500 font-bold italic">
                          * Bidang berwarna oranye = dikecualikan (shift 24 jam, absen normal).
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="w-full h-px bg-slate-100" />

              <div className="space-y-4">
                <CardHeader className="p-0">
                  <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex gap-2 items-center">
                    <Users size={14} className="text-indigo-500" /> Daftar Bidang / Departemen
                  </CardTitle>
                  <CardDescription className="text-xs font-medium text-slate-400 mt-1">Tambahkan atau hapus nama bidang yang terdaftar di sistem.</CardDescription>
                </CardHeader>
                <div className="flex gap-2 max-w-md">
                   <Input 
                     placeholder="Nama Bidang Baru..." 
                     value={newDepartment} 
                     onChange={(e) => setNewDepartment(e.target.value)}
                     className="h-9 text-xs bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
                   />
                   <Button 
                     onClick={addDepartment} 
                     disabled={isAddingDepartment}
                     className="h-9 px-4 bg-indigo-600 text-white font-black text-[9px] uppercase tracking-widest"
                   >
                     {isAddingDepartment ? 'Menyimpan...' : 'Tambah'}
                   </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                   {departments.map(dept => (
                      <Badge key={dept} variant="secondary" className="px-3 py-1.5 bg-slate-100 text-slate-700 font-bold text-[10px] uppercase flex items-center gap-2 group">
                        {dept}
                        <button onClick={() => removeDepartment(dept)} className="text-slate-400 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100">
                          <X size={12} />
                        </button>
                      </Badge>
                   ))}
                </div>
              </div>

              <div className="w-full h-px bg-slate-100" />

              <CardHeader className="p-0">
                <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex gap-2 items-center">
                  <MapPin size={14} className="text-indigo-500" /> Multi-Lokasi Presensi
                </CardTitle>
                <CardDescription className="text-xs font-medium text-slate-400 mt-1">Daftarkan beberapa titik koordinat wilayah absen.</CardDescription>
              </CardHeader>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase text-slate-400">Nama Lokasi</Label>
                    <Input id="loc-name" placeholder="Kantor Utama" className="h-8 text-xs bg-white" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase text-slate-400">Latitude</Label>
                    <Input id="loc-lat" type="number" step="any" placeholder="0.0000" className="h-8 text-xs bg-white font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase text-slate-400">Longitude</Label>
                    <Input id="loc-lng" type="number" step="any" placeholder="0.0000" className="h-8 text-xs bg-white font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-black uppercase text-slate-400">Radius (m)</Label>
                    <div className="flex gap-2">
                      <Input id="loc-radius" type="number" placeholder="100" className="h-8 text-xs bg-white w-20" />
                      <Button 
                        type="button" 
                        size="sm" 
                        onClick={() => {
                          const name = (document.getElementById('loc-name') as HTMLInputElement).value;
                          const lat = parseFloat((document.getElementById('loc-lat') as HTMLInputElement).value);
                          const lng = parseFloat((document.getElementById('loc-lng') as HTMLInputElement).value);
                          const rad = parseInt((document.getElementById('loc-radius') as HTMLInputElement).value) || 100;
                          
                          if (name && !isNaN(lat) && !isNaN(lng)) {
                            const newLocs = [...(settings.locations || []), { name, lat, lng, radius: rad }];
                            setSettings({...settings, locations: newLocs});
                            (document.getElementById('loc-name') as HTMLInputElement).value = '';
                            (document.getElementById('loc-lat') as HTMLInputElement).value = '';
                            (document.getElementById('loc-lng') as HTMLInputElement).value = '';
                            (document.getElementById('loc-radius') as HTMLInputElement).value = '';
                            toast.success('Lokasi ditambahkan! Jangan lupa klik "Terapkan Pola Konfigurasi" di bawah untuk menyimpan permanen.');
                          } else {
                            toast.error('Lengkapi data lokasi');
                          }
                        }}
                        className="h-8 bg-indigo-600 text-white font-black text-[9px] uppercase tracking-widest px-4"
                      >
                        Tambah
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(settings.locations || []).map((loc, i) => (
                    <Card key={i} className="p-3 border border-slate-200 bg-white relative group overflow-hidden">
                      <div className="flex justify-between items-start relative z-10">
                        <div>
                          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{loc.name}</p>
                          <p className="text-[9px] font-mono text-slate-400 mt-1">{loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}</p>
                          <Badge variant="outline" className="mt-2 text-[8px] font-bold uppercase tracking-tighter border-slate-200">Radius: {loc.radius}m</Badge>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => {
                            const newLocs = settings.locations.filter((_, idx) => idx !== i);
                            setSettings({...settings, locations: newLocs});
                          }}
                          className="h-6 w-6 text-slate-300 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                      <div className="absolute -right-2 -bottom-2 opacity-[0.03] group-hover:scale-110 transition-transform">
                        <MapPin size={60} />
                      </div>
                    </Card>
                  ))}
                  {(settings.locations || []).length === 0 && (
                    <div className="col-span-full p-8 text-center border-2 border-dashed border-slate-100 rounded-2xl">
                      <MapPin className="mx-auto text-slate-200 mb-2" size={32} />
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Belum ada multi-lokasi. Menggunakan koordinat default.</p>
                    </div>
                  )}
                </div>

                <div className="w-full h-px bg-slate-100" />

                <CardHeader className="p-0">
                  <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex gap-2 items-center">
                    <Clock size={14} className="text-indigo-500" /> Parameter Hari & Libur
                  </CardTitle>
                </CardHeader>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Hari Operasional</Label>
                      <div className="flex flex-wrap gap-2">
                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                          const isSelected = (settings.enabledDays || []).includes(day);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => {
                                const currentDays = settings.enabledDays || [];
                                const newDays = isSelected 
                                  ? currentDays.filter(d => d !== day)
                                  : [...currentDays, day];
                                setSettings({...settings, enabledDays: newDays});
                              }}
                              className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border ${
                                isSelected 
                                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100' 
                                  : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-300'
                              }`}
                            >
                              {day.substring(0, 3)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                </div>
              </div>

          </CardContent>
          <CardFooter className="bg-slate-50 border-t p-4 flex justify-between items-center gap-4 flex-wrap">
              <Button 
                type="button" 
                onClick={() => setIsClearLogsDialogOpen(true)}
                variant="outline"
                className="h-10 px-6 border-rose-200 text-rose-600 hover:bg-rose-50 font-black uppercase tracking-widest text-[10px] transition-all"
              >
                <Trash2 size={14} className="mr-2" /> Kosongkan Data Absensi
              </Button>
              <Button 
                onClick={saveSettings} 
                disabled={savingSettings}
                className="h-10 px-8 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-100 transition-all active:scale-95"
              >
                {savingSettings ? 'Menyinkronkan...' : 'Terapkan Pola Konfigurasi'}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        <TabsContent value="izin" className="space-y-6 mt-6">
          <Card className="border border-slate-200 shadow-sm overflow-hidden bg-white">
            <CardHeader className="p-4 border-b bg-slate-50/50">
              <CardTitle className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <FileText size={14} className="text-indigo-500" />
                Input Status Izin / Sakit / Cuti / Tugas Luar
              </CardTitle>
              <CardDescription className="text-xs uppercase tracking-widest font-medium text-slate-400">Bypass absensi harian dengan status presensi khusus.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={submitLeaveForm} className="space-y-4 max-w-xl">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase text-slate-400">Pilih Pegawai</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                    <Input 
                      placeholder="Cari nama pegawai..." 
                      className="pl-9 h-10 bg-white border-slate-200 text-sm font-medium placeholder:text-slate-300 focus-visible:ring-indigo-500 mb-2" 
                      value={leaveEmployeeSearchTerm}
                      onChange={(e) => setLeaveEmployeeSearchTerm(e.target.value)}
                    />
                  </div>
                  <select 
                    value={leaveForm.employeeId} 
                    onChange={e => setLeaveForm({...leaveForm, employeeId: e.target.value})}
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">-- Pilih Pegawai --</option>
                    {employees
                      .filter(emp => 
                        (emp.displayName || emp.name || emp.email || '').toLowerCase().includes(leaveEmployeeSearchTerm.toLowerCase())
                      )
                      .slice(0, 100) // Batasi tampilan agar tidak berat
                      .map(emp => (
                        <option key={emp.id || emp.uid} value={emp.id || emp.uid}>{emp.displayName || emp.name || emp.email}</option>
                      ))
                    }
                  </select>
                  {leaveEmployeeSearchTerm && (
                    <p className="text-[9px] text-slate-400 font-bold uppercase italic mt-1">
                      Ditemukan {employees.filter(emp => (emp.displayName || emp.name || emp.email || '').toLowerCase().includes(leaveEmployeeSearchTerm.toLowerCase())).length} pegawai
                    </p>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Pilih Tanggal</Label>
                    <Input 
                      type="date" 
                      value={leaveForm.date} 
                      onChange={e => setLeaveForm({...leaveForm, date: e.target.value})}
                      className="h-10 text-sm bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase text-slate-400">Jenis Status</Label>
                    <select 
                      value={leaveForm.leaveType} 
                      onChange={e => setLeaveForm({...leaveForm, leaveType: e.target.value})}
                      className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus:ring-1 focus:ring-indigo-500 font-black uppercase text-slate-700"
                    >
                      <option value="I">Izin (I)</option>
                      <option value="S">Sakit (S)</option>
                      <option value="C">Cuti (C)</option>
                      <option value="T">Tugas Luar (T)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                   <Label className="text-[10px] font-black uppercase text-slate-400">Keterangan / Alasan (Opsional)</Label>
                   <Input 
                     value={leaveForm.reason} 
                     onChange={e => setLeaveForm({...leaveForm, reason: e.target.value})}
                     placeholder="Misal: Surat dokter terlampir"
                     className="h-10 text-sm bg-white"
                   />
                </div>

                <div className="pt-2">
                  <Button type="submit" disabled={isSubmittingLeave} className="h-10 px-8 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-100">
                     {isSubmittingLeave ? 'MEMPROSES...' : 'SIMPAN STATUS ABSENSI'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Employee Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-white border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="bg-slate-50/80 p-6 border-b">
            <DialogTitle className="text-xl font-black uppercase tracking-widest text-slate-800 flex items-center gap-2">
              <Edit2 size={20} className="text-indigo-600" /> Edit Profil
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-slate-400 uppercase tracking-widest">
              Perbarui identitas & akses pegawai.
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Nama Lengkap</Label>
              <Input 
                value={editingEmployee?.displayName || ''} 
                onChange={e => setEditingEmployee({...editingEmployee, displayName: e.target.value})}
                className="bg-slate-50 border-slate-200 focus:ring-indigo-500 font-medium h-10"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">NIP</Label>
                <Input 
                  value={editingEmployee?.nip || ''} 
                  onChange={e => setEditingEmployee({...editingEmployee, nip: e.target.value})}
                  className="bg-slate-50 border-slate-200 focus:ring-indigo-500 font-mono text-sm h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Bidang</Label>
                <select 
                  value={editingEmployee?.bidang || ''} 
                  onChange={e => setEditingEmployee({...editingEmployee, bidang: e.target.value})}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500 font-medium"
                >
                  {departments.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">System Role</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="role" 
                    value="staff" 
                    checked={editingEmployee?.role === 'staff'} 
                    onChange={() => setEditingEmployee({...editingEmployee, role: 'staff'})}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                  />
                  <span className={`text-xs font-bold uppercase tracking-wider ${editingEmployee?.role === 'staff' ? 'text-indigo-600' : 'text-slate-400'}`}>Staff</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="radio" 
                    name="role" 
                    value="admin" 
                    checked={editingEmployee?.role === 'admin'} 
                    onChange={() => setEditingEmployee({...editingEmployee, role: 'admin'})}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                  />
                  <span className={`text-xs font-bold uppercase tracking-wider ${editingEmployee?.role === 'admin' ? 'text-indigo-600' : 'text-slate-400'}`}>Admin</span>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter className="bg-slate-50 p-6 border-t gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setIsEditDialogOpen(false)}
              className="font-black uppercase tracking-widest text-[10px] h-10 border-slate-200"
            >
              Batal
            </Button>
            <Button 
              onClick={handleUpdateEmployee}
              disabled={isUpdatingEmployee}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-[10px] h-10 shadow-lg shadow-indigo-100"
            >
              {isUpdatingEmployee ? 'Menyinkronkan...' : 'Simpan Perubahan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px] bg-white border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="bg-rose-50 p-6 border-b">
            <DialogTitle className="text-xl font-black uppercase tracking-widest text-rose-800 flex items-center gap-2">
              <Trash2 size={20} className="text-rose-600" /> Hapus Pegawai
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-rose-600 uppercase tracking-widest opacity-70">
              Tindakan ini permanen & tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-6">
            <p className="text-sm text-slate-600 font-medium">
              Apakah Anda yakin ingin menghapus data pegawai <span className="font-black text-slate-900">"{deletingEmployee?.name}"</span>?
            </p>
            <p className="text-[10px] text-slate-400 mt-2 italic font-bold uppercase tracking-tight">
              * Akses login & riwayat perangkat terkait akan diputuskan.
            </p>
          </div>

          <DialogFooter className="bg-slate-50 p-6 border-t gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setIsDeleteDialogOpen(false)}
              className="font-black uppercase tracking-widest text-[10px] h-10 border-slate-200"
            >
              Batal
            </Button>
            <Button 
              onClick={handleDeleteEmployee}
              disabled={isDeletingEmployee}
              className="bg-rose-600 hover:bg-rose-700 text-white font-black uppercase tracking-widest text-[10px] h-10 shadow-lg shadow-rose-100"
            >
              {isDeletingEmployee ? 'MENGHAPUS...' : 'YA, HAPUS DATA'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Device Confirmation Dialog */}
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="sm:max-w-[400px] bg-white border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="bg-amber-50 p-6 border-b">
            <DialogTitle className="text-xl font-black uppercase tracking-widest text-amber-800 flex items-center gap-2">
              <RefreshCw size={20} className="text-amber-600" /> Reset Device Lock
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-amber-600 uppercase tracking-widest opacity-70">
              Sinkronisasi ulang identitas perangkat.
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-6">
            <p className="text-sm text-slate-600 font-medium">
              Yakin ingin mereset kunci perangkat untuk <span className="font-black text-slate-900">"{resettingEmployee?.name}"</span>?
            </p>
            <p className="text-[10px] text-slate-400 mt-2 italic font-bold uppercase tracking-tight">
              * Pegawai akan diizinkan mendaftarkan perangkat baru pada login berikutnya.
            </p>
          </div>

          <DialogFooter className="bg-slate-50 p-6 border-t gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setIsResetDialogOpen(false)}
              className="font-black uppercase tracking-widest text-[10px] h-10 border-slate-200"
            >
              Batal
            </Button>
            <Button 
              onClick={handleResetDevice}
              disabled={isResetting}
              className="bg-amber-600 hover:bg-amber-700 text-white font-black uppercase tracking-widest text-[10px] h-10 shadow-lg shadow-amber-100"
            >
              {isResetting ? 'RESETTING...' : 'KONFIRMASI RESET'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Database Confirmation Dialog */}
      <Dialog open={isClearLogsDialogOpen} onOpenChange={setIsClearLogsDialogOpen}>
        <DialogContent className="sm:max-w-[400px] bg-white border-none shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="bg-rose-50 p-6 border-b border-rose-100">
            <DialogTitle className="text-xl font-black uppercase tracking-widest text-rose-800 flex items-center gap-2">
              <AlertTriangle size={20} className="text-rose-600" /> PERINGATAN
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-rose-600 uppercase tracking-widest opacity-70">
              Pengosongan Database Absensi
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-6">
            <p className="text-sm text-slate-600 font-medium">
              Apakah Anda yakin ingin <span className="font-black text-rose-600">menghapus SEMUA data absensi</span>?
            </p>
            <p className="text-[10px] text-slate-400 mt-2 italic font-bold uppercase tracking-tight">
              * Info: Data daftar pegawai Anda akan dipertahankan tetap aman. Pastikan Anda telah melakukan Export/Backup arsip bulan ini sebelum melanjutkan!
            </p>
          </div>

          <DialogFooter className="bg-slate-50 p-6 border-t gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setIsClearLogsDialogOpen(false)}
              className="font-black uppercase tracking-widest text-[10px] h-10 border-slate-200"
              disabled={isClearingLogs}
            >
              Batal
            </Button>
            <Button 
              onClick={handleClearLogs}
              disabled={isClearingLogs}
              className="bg-rose-600 hover:bg-rose-700 text-white font-black uppercase tracking-widest text-[10px] h-10 shadow-lg shadow-rose-100"
            >
              {isClearingLogs ? 'MENGHAPUS...' : 'YA, KOSONGKAN ABSENSI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Photo Viewer Dialog */}
      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="sm:max-w-[400px] bg-transparent border-none shadow-none p-0 overflow-hidden outline-none">
           {selectedPhoto && (
             <div className="flex flex-col items-center justify-center p-4">
               <div className="relative group">
                 <img 
                   src={selectedPhoto} 
                   alt="Visual Trace Zoom" 
                   className="w-full max-w-sm rounded-2xl object-contain shadow-2xl border-4 border-white/20" 
                 />
                 <div className="absolute inset-0 rounded-2xl ring-1 ring-white/10 pointer-events-none" />
               </div>
               <p className="mt-4 px-4 py-1.5 bg-black/60 backdrop-blur-md rounded-full text-[9px] font-black text-white uppercase tracking-[0.2em] border border-white/20 shadow-xl">
                 Klik di luar untuk menutup
               </p>
             </div>
           )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
