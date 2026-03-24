import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  LayoutDashboard, CalendarDays, CalendarRange, BarChart3, Plus, FileUp, 
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, FileText, Paperclip, 
  Trash2, Search, Edit, CheckCircle2, Clock, AlertCircle 
} from 'lucide-react';
import { format, parseISO, isWeekend, differenceInDays, isBefore, startOfDay } from 'date-fns';
import { KPILevel, KPI_CONFIG, Task, calculateTaskDates, TaskStatus } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- KẾT NỐI SUPABASE ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const gasUrl = import.meta.env.VITE_GAS_URL;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// (Các component phụ như ExpandableText, ExpandableFiles giữ nguyên như bản cũ của bạn...)
// [Tôi lược bớt phần hiển thị để tập trung vào logic kết nối]

export default function App() {
  const [activeSection, setActiveSection] = useState('giao-viec');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<any[]>([]);

  // --- 1. LẤY DỮ LIỆU TỪ SUPABASE ---
  const fetchTasks = async () => {
    const { data, error } = await supabase.from('projects').select('*').order('createdAt', { ascending: false });
    if (error) console.error("Lỗi lấy dữ liệu:", error);
    else setTasks(data || []);
  };

  useEffect(() => { fetchTasks(); }, []);

  // --- 2. HÀM GỬI FILE QUA GOOGLE DRIVE ---
  const uploadToDrive = async (base64: string, projectName: string) => {
    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        body: JSON.stringify({
          base64: base64,
          projectName: projectName,
          date: format(new Date(), 'yyyy-MM-dd')
        })
      });
      const result = await response.json();
      return result.status === 'success' ? result.url : null;
    } catch (e) { return null; }
  };

  // --- 3. HÀM THÊM DỰ ÁN MỚI ---
  const addTask = async (newTaskData: any) => {
    setLoading(true);
    let driveUrls: string[] = [];

    // Tự động đẩy từng file lên Drive và lấy link
    for (const fileBase64 of newTaskData.files) {
      const url = await uploadToDrive(fileBase64, newTaskData.project);
      if (url) driveUrls.push(url);
    }

    const deadlineDate = parseISO(newTaskData.deadline);
    const { startDate, workingDays } = calculateTaskDates(deadlineDate, newTaskData.kpiLevel);
    
    const finalTask = {
      ...newTaskData,
      id: crypto.randomUUID(),
      startDate: startDate.toISOString(),
      workingDays: workingDays.map(d => d.toISOString()),
      dailyKpiPoints: KPI_CONFIG[newTaskData.kpiLevel].points / workingDays.length,
      createdAt: new Date().toISOString(),
      status: TaskStatus.IN_PROGRESS,
      files: driveUrls // Lưu link Drive thay vì ảnh nặng
    };

    const { error } = await supabase.from('projects').insert([finalTask]);
    if (!error) {
      setTasks([finalTask, ...tasks]);
      showToast('Đã lưu lên Cloud & Google Drive!', 'success');
    }
    setLoading(false);
  };

  // (Các hàm deleteTask, updateTask cũng sẽ được thay đổi tương tự với supabase.from('projects').delete()...)
  // ... [Phần còn lại của giao diện giữ nguyên như file bạn gửi] ...
  return (
    // Copy toàn bộ phần giao diện (return) từ file cũ của bạn dán vào đây
    <div className="flex h-screen bg-[#f0f7ff] ..."> 
       {loading && <div className="loading-overlay">Đang tải file lên Drive...</div>}
       {/* Nội dung trang web của bạn */}
    </div>
  );
}
