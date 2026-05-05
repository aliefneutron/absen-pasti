import { format, parse, addMinutes, isBefore, isAfter, subMinutes } from 'date-fns';

export interface Shift {
  name: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}

export const DEFAULT_SHIFTS: Shift[] = [
  { name: 'Pagi', startTime: '07:30', endTime: '13:30' },
  { name: 'Sore', startTime: '13:30', endTime: '19:30' },
  { name: 'Malam', startTime: '19:30', endTime: '07:30' },
];

export function getCurrentShift(now: Date, shiftSettings?: Shift[], assignedShiftName?: string) {
  let shifts = shiftSettings || DEFAULT_SHIFTS;
  
  if (assignedShiftName) {
    if (assignedShiftName === 'OFF') return { isOff: true };
    shifts = shifts.filter(s => s.name === assignedShiftName);
  }
  
  const currentTimeStr = format(now, 'HH:mm');
  
  for (const shift of shifts) {
    const start = shift.startTime.trim();
    const end = shift.endTime.trim();
    
    // Allowed window: 30 mins before start to 30 mins after end
    const allowedStart = start;
    const allowedEnd = format(addMinutes(parse(end, 'HH:mm', now), 30), 'HH:mm');
    
    const isCrossMidnight = allowedStart > allowedEnd;
    
    if (isCrossMidnight) {
      if (currentTimeStr >= allowedStart || currentTimeStr <= allowedEnd) {
        let logicalDate = format(now, 'yyyy-MM-dd');
        if (currentTimeStr <= allowedEnd) {
          const yesterday = new Date(now);
          yesterday.setDate(now.getDate() - 1);
          logicalDate = format(yesterday, 'yyyy-MM-dd');
        }
        return { shift, logicalDate };
      }
    } else {
      if (currentTimeStr >= allowedStart && currentTimeStr <= allowedEnd) {
        return { shift, logicalDate: format(now, 'yyyy-MM-dd') };
      }
    }
  }
  
  return null;
}

export function getShiftStatus(now: Date, shift: Shift) {
  const start = shift.startTime.trim();
  const end = shift.endTime.trim();
  const isCrossMidnight = start > end;
  
  // Use a base date for parsing and RESET seconds/ms to ensure clean comparison
  let shiftStartDate = parse(start, 'HH:mm', now);
  shiftStartDate.setSeconds(0);
  shiftStartDate.setMilliseconds(0);
  
  // If it's a cross-midnight shift and current time is between 00:00 and shift end time,
  // it means the shift actually started on the previous calendar day.
  const currentTimeStr = format(now, 'HH:mm');
  if (isCrossMidnight && currentTimeStr <= end) {
    shiftStartDate = subMinutes(shiftStartDate, 1440); // subtract 24 hours
  }
  
  // Tolerance 30 minutes
  const graceThreshold = addMinutes(shiftStartDate, 30);
  
  // A record is late if current time is strictly AFTER grace threshold
  const isLate = isAfter(now, graceThreshold);
  
  return {
    isLate,
    startTime: format(shiftStartDate, 'HH:mm'),
    shiftStartDate: shiftStartDate,
    graceThreshold: format(graceThreshold, 'HH:mm'),
    graceThresholdDate: graceThreshold
  };
}

export function getCheckOutStatus(now: Date, shift: Shift) {
  const end = shift.endTime.trim();
  const start = shift.startTime.trim();
  const isCrossMidnight = start > end;
  
  let shiftEndDate = parse(end, 'HH:mm', now);
  shiftEndDate.setSeconds(0);
  shiftEndDate.setMilliseconds(0);
  
  const currentTimeStr = format(now, 'HH:mm');
  
  if (isCrossMidnight && currentTimeStr >= start) {
    shiftEndDate = addMinutes(shiftEndDate, 1440);
  }

  const checkOutWindowStart = shiftEndDate;
  const checkOutWindowEnd = addMinutes(shiftEndDate, 30);
  
  const isCheckOutWindow = now >= checkOutWindowStart && now <= checkOutWindowEnd;
  
  return {
    isCheckOutWindow,
    checkOutWindowStart,
    checkOutWindowEnd
  };
}

// === ATURAN KHUSUS JUMAT ===

export interface FridayEarlyEndConfig {
  enabled: boolean;
  checkOutTime: string;    // HH:mm, default "10:30"
  exemptBidangs: string[]; // Bidang yang dikecualikan, e.g. ["RAWAT INAP", "UGD"]
}

/**
 * Cek apakah window absen pulang khusus Jumat berlaku untuk pegawai ini.
 * Hanya berlaku jika:
 * 1. Hari ini Jumat
 * 2. Konfigurasi fridayEarlyEnd aktif
 * 3. Bidang pegawai TIDAK termasuk dalam daftar exemptBidangs
 * 4. Shift aktif adalah shift pagi (startTime sebelum jam 12:00)
 */
export function getFridayEarlyCheckOutStatus(
  now: Date,
  currentShift: Shift | null | undefined,
  fridayConfig: FridayEarlyEndConfig | null | undefined,
  userBidang: string | null | undefined
) {
  // 1. Hanya hari Jumat
  if (format(now, 'EEEE') !== 'Friday') return null;

  // 2. Konfigurasi harus aktif
  if (!fridayConfig?.enabled) return null;

  // 3. Bidang pegawai tidak boleh masuk daftar yang dikecualikan (shift 24 jam)
  const bidang = (userBidang || '').toUpperCase().trim();
  const exempts = (fridayConfig.exemptBidangs || ['RAWAT INAP', 'UGD']).map((b: string) => b.toUpperCase().trim());
  if (exempts.includes(bidang)) return null;

  // 4. Hanya untuk shift pagi (startTime sebelum jam 12:00)
  if (!currentShift) return null;
  const startHour = parseInt(currentShift.startTime.split(':')[0], 10);
  if (startHour >= 12) return null;

  // Bangun window check-out: mulai dari jam yang dikonfigurasi, +30 menit
  const checkOutTimeStr = fridayConfig.checkOutTime || '10:30';
  const checkOutBase = parse(checkOutTimeStr, 'HH:mm', now);
  const windowStart = checkOutBase;                        // default: 10:30
  const windowEnd = addMinutes(checkOutBase, 30);          // default: 11:00

  const isCheckOutWindow = now >= windowStart && now <= windowEnd;
  const isTooEarly = now < windowStart;
  const isExpired = now > windowEnd;

  return {
    isEarlyCheckOut: true,
    isCheckOutWindow,
    isTooEarly,
    isExpired,
    checkOutWindowStart: windowStart,
    checkOutWindowEnd: windowEnd,
    checkOutTime: checkOutTimeStr,
  };
}
