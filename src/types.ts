import { format, addDays, subDays, isWeekend, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, getWeek, startOfWeek, endOfWeek } from 'date-fns';

export enum KPILevel {
  LEVEL_1 = 1,
  LEVEL_2 = 2,
  LEVEL_3 = 3,
  LEVEL_4 = 4,
  LEVEL_5 = 5,
}

export const KPI_CONFIG = {
  [KPILevel.LEVEL_1]: { hours: 1, points: 0.25, color: '#ef4444', label: 'Mức 1', displayHours: '30 phút - 1 giờ' }, // Red
  [KPILevel.LEVEL_2]: { hours: 4, points: 1, color: '#f97316', label: 'Mức 2', displayHours: '2 giờ - 4 giờ' }, // Orange
  [KPILevel.LEVEL_3]: { hours: 10, points: 2.5, color: '#eab308', label: 'Mức 3', displayHours: '6 giờ - 10 giờ' }, // Yellow
  [KPILevel.LEVEL_4]: { hours: 16, points: 4, color: '#22c55e', label: 'Mức 4', displayHours: '12 giờ - 16 giờ' }, // Green
  [KPILevel.LEVEL_5]: { hours: 24, points: 6, color: '#3b82f6', label: 'Mức 5', displayHours: '18 giờ - 24 giờ' }, // Blue
};

export enum TaskStatus {
  NEW = 'NEW',
  INFO = 'INFO',
  IN_PROGRESS = 'IN_PROGRESS',
  REVIEW = 'REVIEW',
  COMPLETED = 'COMPLETED'
}

export const STATUS_CONFIG = {
  [TaskStatus.NEW]: { label: 'Dự án mới', gradient: 'bg-white' },
  [TaskStatus.INFO]: { label: 'Tìm thông tin', gradient: 'bg-gradient-to-t from-yellow-200 to-white' },
  [TaskStatus.IN_PROGRESS]: { label: 'Đang thực hiện', gradient: 'bg-gradient-to-t from-orange-300 to-white' },
  [TaskStatus.REVIEW]: { label: 'Chờ xác nhận', gradient: 'bg-gradient-to-t from-purple-300 to-white' },
  [TaskStatus.COMPLETED]: { label: 'Hoàn thành', gradient: 'bg-gradient-to-t from-green-300 to-white' }
};

export interface Task {
  id: string;
  project: string;
  description: string;
  files: string[]; // Base64 or URLs
  deadline: string; // ISO string
  kpiLevel: KPILevel;
  note: string;
  startDate: string; // ISO string
  workingDays: string[]; // Array of ISO strings
  dailyKpiPoints: number;
  createdAt: string; // ISO string
  status: TaskStatus;
}

export const WORKING_HOURS_PER_DAY = 6;

export function isWorkingDay(date: Date): boolean {
  return !isWeekend(date);
}

export function getWorkingDaysInInterval(start: Date, end: Date): Date[] {
  const days = eachDayOfInterval({ start, end });
  return days.filter(isWorkingDay);
}

export function calculateTaskDates(deadline: Date, kpiLevel: KPILevel): { startDate: Date; workingDays: Date[] } {
  if (kpiLevel === KPILevel.LEVEL_1 || kpiLevel === KPILevel.LEVEL_2) {
    return {
      startDate: deadline,
      workingDays: [deadline],
    };
  }

  const config = KPI_CONFIG[kpiLevel];
  const hoursNeeded = config.hours;
  const daysNeeded = Math.ceil(hoursNeeded / WORKING_HOURS_PER_DAY);
  const totalDays = daysNeeded + 1; // "theo như đánh giá của KPI + thêm 1 ngày"

  let workingDays: Date[] = [];
  let current = deadline;
  
  // Go backwards from deadline to find 'totalDays' working days
  while (workingDays.length < totalDays) {
    if (isWorkingDay(current)) {
      workingDays.unshift(new Date(current));
    }
    current = subDays(current, 1);
  }

  return {
    startDate: workingDays[0],
    workingDays,
  };
}
