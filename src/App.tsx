import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  LayoutDashboard, 
  Share2,
  Settings,
  CalendarDays,
  CalendarRange, 
  BarChart3, 
  Plus, 
  FileUp, 
  ChevronLeft, 
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Paperclip,
  Trash2,
  Download,
  Search,
  Edit,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react';
import { 
  format, 
  addDays, 
  subDays, 
  isSameDay, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  getWeek, 
  startOfWeek, 
  endOfWeek,
  parseISO,
  isWithinInterval,
  addMonths,
  differenceInDays,
  isWeekend,
  getMonth,
  getYear,
  startOfDay,
  isBefore,
  getDay,
  endOfDay
} from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { createClient } from '@supabase/supabase-js';
import { 
  KPILevel, 
  KPI_CONFIG, 
  Task, 
  calculateTaskDates, 
  isWorkingDay,
  TaskStatus
} from './types';

// --- KẾT NỐI SUPABASE & GOOGLE DRIVE ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const gasUrl = import.meta.env.VITE_GAS_URL || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function ExpandableText({ text, isProject = false }: { text: string, isProject?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <span>-</span>;
  
  if (isProject) {
    return (
      <div className="min-w-[150px]">
        <div className="text-base font-bold text-blue-900 break-words whitespace-pre-wrap leading-tight">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="relative max-w-[300px]">
      <div className={cn(
        "text-sm transition-all duration-200 break-words whitespace-pre-wrap text-slate-600", 
        !expanded && "line-clamp-2"
      )}>
        {text}
      </div>
      {text.length > 50 && (
        <button 
          onClick={() => setExpanded(!expanded)}
          className="text-blue-500 hover:text-blue-700 text-xs mt-1 flex items-center gap-1"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      )}
    </div>
  );
}

function ExpandableFiles({ files }: { files: string[] }) {
  if (!files || files.length === 0) return <span>-</span>;
  
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((file, i) => (
        <a 
          key={i} 
          href={file} 
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
          title={`Xem file ${i + 1}`}
        >
          <Paperclip size={16} />
        </a>
      ))}
    </div>
  );
}

type Section = 'giao-viec' | 'cong-viec-hang-ngay' | 'timeline' | 'danh-gia' | 'search';

type Toast = {
  id: number;
  message: string;
  type: 'success' | 'delete' | 'edit' | 'error' | 'cancel';
  task?: Task;
  isClosing?: boolean;
};
export default function App() {
  // --- BỘ NHỚ LƯU TRẠNG THÁI TAB KHI F5 ---
  const [activeSection, setActiveSection] = useState(() => {
    // --- BỘ NHỚ CHO PHÂN HỆ SOCIAL MEDIA ---
  const [activeSocialTab, setActiveSocialTab] = useState('danh-sach');
  const [showSocialSettings, setShowSocialSettings] = useState(false);
  const [socialColumns, setSocialColumns] = useState({
    facebook: true, zalo: true, oaZalo: true, tiktok: true, shopee: true
  });
  const [isAutoSchedule, setIsAutoSchedule] = useState(false);
    // Kiểm tra xem trình duyệt có lưu tab nào trước đó không
    const savedSection = localStorage.getItem('savedActiveSection');
    // Nếu có thì lấy tab đó, nếu không thì mặc định mở tab Công Việc Hằng Ngày
    return savedSection || 'cong-viec-hang-ngay';
  });

  // Mỗi khi bạn click chuyển tab, tự động lưu tên tab đó vào trình duyệt
  useEffect(() => {
    localStorage.setItem('savedActiveSection', activeSection);
  }, [activeSection]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  
  // BIẾN LƯU % TẢI FILE & XÓA THÔNG MINH
  const [uploadProgress, setUploadProgress] = useState<{ current: number, total: number, percentage: number } | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<any>(null);

  // Lấy dữ liệu từ Supabase
  const fetchTasks = async () => {
    const { data, error } = await supabase.from('projects').select('*').order('createdAt', { ascending: false });
    if (!error && data) setTasks(data);
  };

  useEffect(() => { fetchTasks(); }, []);

  useEffect(() => {
    const savedTasks = localStorage.getItem('kpi_tasks');
    if (savedTasks) setTasks(JSON.parse(savedTasks));
  }, []);

  useEffect(() => {
    localStorage.setItem('kpi_tasks', JSON.stringify(tasks));
  }, [tasks]);

  // Đẩy file lên Google Drive
  const uploadToDrive = async (base64: string, projectName: string, fileName: string, folderId?: string) => {
    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ base64, projectName, date: format(new Date(), 'dd-MM-yyyy'), fileName: fileName, folderId: folderId || "" })
      });
      const result = await response.json();
      if (result.status === 'error') alert("Lỗi từ Google Drive: " + result.error);
      return result.status === 'success' ? result.url : null;
    } catch (e: any) {
      alert("Lỗi kết nối Google Drive! Hãy kiểm tra lại VITE_GAS_URL. Chi tiết: " + e.message);
      return null;
    }
  };

  const showToast = (message: string, type: 'success' | 'delete' | 'edit' | 'error' | 'cancel', task?: Task) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, task }]);
    setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, isClosing: true } : t)), 4700);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

  // THÊM MỚI: Bộ nhớ để lưu các đồng hồ đếm ngược chờ xóa
  const deleteTimeouts = useRef<{ [key: string]: any }>({});

  const handleUndo = (task: Task, toastId: number) => {
    // 1. Dừng ngay đồng hồ đếm ngược xóa lại (Chặn không cho nó tự xóa nữa)
    if (deleteTimeouts.current[task.id]) {
      clearTimeout(deleteTimeouts.current[task.id]);
      delete deleteTimeouts.current[task.id];
    }

    // 2. Phục hồi trạng thái: Bỏ dự án khỏi danh sách "Chờ xóa"
    setPendingDeleteIds(prev => prev.filter(id => id !== task.id));

    // 3. Phục hồi giao diện (nếu vừa bấm xóa vĩnh viễn và bị ẩn đi)
    setTasks(prev => {
      const exists = prev.find(t => t.id === task.id);
      if (!exists) return [task, ...prev]; // Trả lại dự án lên đầu bảng
      return prev;
    });

    // 4. Tắt thông báo cũ và báo thành công
    setToasts(prev => prev.filter(t => t.id !== toastId));
    showToast('Đã hoàn tác, dự án trở lại bình thường', 'success');
  };

  // --- HỆ THỐNG XÓA THÔNG MINH 2 LỚP (CÓ HOÀN TÁC) ---
  const permanentlyDelete = async (task: any) => {
    // Xóa thật sự trên Drive
    const driveLink = task.files?.find((f: string) => f.includes('drive.google.com'));
    if (driveLink) {
      const match = driveLink.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (match) fetch(gasUrl, { method: 'POST', body: JSON.stringify({ action: 'delete', folderId: match[1] }) }).catch(() => {});
    }
    // Xóa thật sự trên Supabase
    const { error } = await supabase.from('projects').delete().eq('id', task.id);
    if (!error) {
      setTasks(prev => prev.filter(t => t.id !== task.id));
      setPendingDeleteIds(prev => prev.filter(id => id !== task.id));
    }
  };

  const executeDelete = async (task: any, isPermanent: boolean) => {
    setDeleteConfirmTask(null);
    
    if (!isPermanent) {
      // LẦN 1: Chuyển vào hàng chờ
      const isPast = isBefore(parseISO(task.deadline), startOfDay(new Date()));
      const waitTime = isPast ? 3 * 24 * 60 * 60 * 1000 : 30 * 60 * 1000;
      
      // Dùng type 'delete' để hiện nút Hoàn tác thay vì 'error'
      showToast(isPast ? 'Dự án sẽ bị xoá sau 3 ngày' : 'Dự án sẽ bị xoá sau 30 phút', 'delete', task);
      setPendingDeleteIds(prev => [...prev, task.id]);
      
      // Hẹn giờ xóa thật sự và cất vào bộ nhớ
      const timer = setTimeout(() => permanentlyDelete(task), waitTime);
      deleteTimeouts.current[task.id] = timer;
      
    } else {
      // LẦN 2: Bấm xóa vĩnh viễn
      showToast('Đang xóa dự án vĩnh viễn...', 'delete', task);
      
      // Xóa ảo trên giao diện ngay lập tức để người dùng thấy nó biến mất
      setTasks(prev => prev.filter(t => t.id !== task.id));
      setPendingDeleteIds(prev => prev.filter(id => id !== task.id));
      
      // Cho 5 giây hối hận trước khi gửi lệnh xóa đi thật sự
      const timer = setTimeout(() => permanentlyDelete(task), 5000);
      deleteTimeouts.current[task.id] = timer;
    }
  };

  const deleteTask = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    setDeleteConfirmTask(task);
  };

  // --- HÀM THÊM / SỬA CÓ TÍNH % TẢI FILE ---
  const addTask = async (newTask: Omit<Task, 'id' | 'startDate' | 'workingDays' | 'dailyKpiPoints' | 'createdAt' | 'status'>) => {
    let driveLinks: string[] = [];
    const filesToUpload = newTask.files?.filter(f => f.startsWith('data:')) || [];
    
    if (filesToUpload.length > 0) {
      setUploadProgress({ current: 0, total: filesToUpload.length, percentage: 0 });
      for (let i = 0; i < filesToUpload.length; i++) {
        const fileData = filesToUpload[i];
        const parts = fileData.split("|||");
        const actualBase64 = parts[0];
        const fileName = parts[1] || "file_dinh_kem";
        
        const link = await uploadToDrive(actualBase64, newTask.project, fileName);
        if (link && !driveLinks.includes(link)) driveLinks.push(link);
        
        setUploadProgress({ current: i + 1, total: filesToUpload.length, percentage: Math.round(((i + 1) / filesToUpload.length) * 100) });
      }
      setTimeout(() => setUploadProgress(null), 1000);
    }

    const deadlineDate = parseISO(newTask.deadline);
    const { startDate, workingDays } = calculateTaskDates(deadlineDate, newTask.kpiLevel);
    const kpiPoints = KPI_CONFIG[newTask.kpiLevel].points;
    
    const taskRecord = {
      ...newTask,
      id: crypto.randomUUID(),
      startDate: startDate.toISOString(),
      workingDays: workingDays.map(d => d.toISOString()),
      dailyKpiPoints: kpiPoints / workingDays.length,
      createdAt: new Date().toISOString(),
      status: 'NEW', // ĐÃ SỬA: Mặc định mọi dự án mới giao đều là "Dự án mới" (NEW)
      files: driveLinks
    };
    
    const { error } = await supabase.from('projects').insert([taskRecord]);
    if (!error) {
      setTasks(prev => [taskRecord, ...prev]);
      showToast('Đã giao việc & lưu Cloud thành công', 'success', taskRecord as Task);
    }
  };

  const updateTask = async (updatedTask: Task) => {
    let driveLinks: string[] = [];
    let existingFolderId = "";

    const oldLink = updatedTask.files.find(f => f.includes('drive.google.com'));
    if (oldLink) {
      driveLinks.push(oldLink);
      const match = oldLink.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (match) existingFolderId = match[1];
    }

    const filesToUpload = updatedTask.files?.filter(f => f.startsWith('data:')) || [];
    
    if (filesToUpload.length > 0) {
      setUploadProgress({ current: 0, total: filesToUpload.length, percentage: 0 });
      for (let i = 0; i < filesToUpload.length; i++) {
        const fileData = filesToUpload[i];
        const parts = fileData.split("|||");
        const actualBase64 = parts[0];
        const fileName = parts[1] || "file_dinh_kem";
        
        const link = await uploadToDrive(actualBase64, updatedTask.project, fileName, existingFolderId);
        if (link && !driveLinks.includes(link)) driveLinks.push(link);
        
        setUploadProgress({ current: i + 1, total: filesToUpload.length, percentage: Math.round(((i + 1) / filesToUpload.length) * 100) });
      }
      setTimeout(() => setUploadProgress(null), 1000);
    }

    updatedTask.files = driveLinks;
    const { error } = await supabase.from('projects').update(updatedTask).eq('id', updatedTask.id);
    if (!error) {
      setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    }
  };

  const [doubleClickTask, setDoubleClickTask] = useState<Task | null>(null);
  // BẬT TẮT BẢNG CHỈNH SỬA TOÀN CẦU
  const [globalEditTask, setGlobalEditTask] = useState<Task | null>(null);
  useEffect(() => {
    const listener = (e: any) => setGlobalEditTask(e.detail);
    window.addEventListener('TRIGGER_EDIT', listener);
    return () => window.removeEventListener('TRIGGER_EDIT', listener);
  }, []);
  const [timelineActionTask, setTimelineActionTask] = useState<Task | null>(null);
  // --- THÊM: TRẠNG THÁI KÉO THẢ TOÀN MÀN HÌNH ---
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) setIsGlobalDragging(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      // Chỉ tắt hiệu ứng khi con chuột thực sự rời khỏi trình duyệt
      if (e.clientX === 0 && e.clientY === 0) setIsGlobalDragging(false);
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsGlobalDragging(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        // Phóng sự kiện mang theo file đi toàn hệ thống
        window.dispatchEvent(new CustomEvent('GLOBAL_FILE_DROP', { detail: e.dataTransfer.files }));
      }
    };
    
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    
    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);
  // BẬT TẮT BẢNG XEM CHI TIẾT TOÀN CẦU
  const [globalViewTask, setGlobalViewTask] = useState<Task | null>(null);
  useEffect(() => {
    const listener = (e: any) => setGlobalViewTask(e.detail);
    window.addEventListener('TRIGGER_VIEW', listener);
    return () => window.removeEventListener('TRIGGER_VIEW', listener);
  }, []);

  return (
    <div className="flex h-screen bg-[#f0f7ff] text-slate-800 font-sans overflow-hidden">
      
      {/* OVERLAY KÉO THẢ FILE TOÀN MÀN HÌNH */}
      {isGlobalDragging && (
        <div className="fixed inset-0 z-[9999] bg-white/70 backdrop-blur-sm border border-blue-400 flex items-center justify-center pointer-events-none">
          <span className="text-sm font-light text-blue-600 tracking-wider">Thả file và hình ảnh</span>
        </div>
      )}
      
      {/* Bảng chọn Sửa/Xóa khi Double Click */}
      {doubleClickTask && (
        <div className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in">
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center space-y-4">
            <h3 className="text-2xl font-bold text-slate-800">Tùy chọn Dự án</h3>
            <p className="text-slate-500 text-sm mb-4">Bạn muốn thao tác gì với dự án này?</p>
            <div className="flex flex-col gap-3">
              <button 
  onClick={() => {
    window.dispatchEvent(new CustomEvent('TRIGGER_EDIT', { detail: doubleClickTask }));
    setDoubleClickTask(null);
  }}
  className="flex-1 bg-blue-600 text-white p-3 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-sm"
>
  <Edit size={20} /> Chỉnh sửa
</button>
              <button 
                onClick={() => {
                  deleteTask(doubleClickTask.id);
                  setDoubleClickTask(null);
                }} 
                className="w-full bg-red-500 text-white font-bold py-3 rounded-xl hover:bg-red-600 shadow-lg shadow-red-200 transition-colors flex justify-center items-center gap-2"
              >
                <Trash2 size={18} /> Xóa Dự án
              </button>
              <button 
                onClick={() => setDoubleClickTask(null)} 
                className="w-full bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 transition-colors mt-2"
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        </div>
      )}
{/* Bảng chọn khi Double Click ở Timeline */}
      {timelineActionTask && (
        <div className="fixed inset-0 z-[110] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in">
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center space-y-4">
            <h3 className="text-2xl font-bold text-slate-800">Tùy chọn Dự án</h3>
            <p className="text-slate-500 text-sm mb-4">Bạn muốn thao tác gì với dự án này?</p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('TRIGGER_VIEW', { detail: timelineActionTask }));
                  setTimelineActionTask(null);
                }} 
                className="w-full bg-emerald-500 text-white font-bold py-3 rounded-xl hover:bg-emerald-600 shadow-lg shadow-emerald-200 transition-colors flex justify-center items-center gap-2"
              >
                <Search size={18} /> Xem Dự án
              </button>
              <button 
  onClick={() => {
    window.dispatchEvent(new CustomEvent('TRIGGER_EDIT', { detail: timelineActionTask }));
    setTimelineActionTask(null);
  }}
  className="flex-1 bg-blue-600 text-white p-3 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-sm"
>
  <Edit size={20} /> Chỉnh sửa
</button>
              <button 
                onClick={() => setTimelineActionTask(null)} 
                className="w-full bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 transition-colors mt-2"
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Bảng xác nhận Xóa 2 Lớp */}
      {deleteConfirmTask && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in">
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto"><Trash2 size={32} /></div>
            <h3 className="text-2xl font-bold text-slate-800">
              {pendingDeleteIds.includes(deleteConfirmTask.id) ? 'Xác nhận xóa vĩnh viễn?' : 'Xác nhận xóa dự án?'}
            </h3>
            <p className="text-slate-500">
              {pendingDeleteIds.includes(deleteConfirmTask.id) 
                ? 'Dự án này sẽ bị xóa hoàn toàn khỏi hệ thống và Drive. KHÔNG THỂ KHÔI PHỤC!' 
                : 'Dự án sẽ được chuyển vào trạng thái chờ xóa. Bạn có chắc chắn muốn xóa?'}
            </p>
            <div className="flex gap-4 pt-4">
              <button onClick={() => setDeleteConfirmTask(null)} className="flex-1 bg-blue-900 text-white font-bold py-3 rounded-xl hover:bg-blue-800 transition-colors">
                {pendingDeleteIds.includes(deleteConfirmTask.id) ? 'Hủy xóa' : 'Hủy'}
              </button>
              {/* Mục Social Media mới bổ sung */}
<button
  onClick={() => setActiveSection('social_media')}
  className={twMerge(
    "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 group relative",
    activeSection === 'social_media'
      ? "bg-blue-600 text-white shadow-lg shadow-blue-200"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
  )}
>
  <Share2 size={20} className={activeSection === 'social_media' ? "text-white" : "text-slate-400 group-hover:text-slate-600"} />
  <span className={clsx("transition-opacity duration-200", !isSidebarExpanded && "md:hidden opacity-0 w-0 overflow-hidden")}>
    Social Media
  </span>
</button>
              <button 
                onClick={() => executeDelete(deleteConfirmTask, pendingDeleteIds.includes(deleteConfirmTask.id))} 
                className="flex-1 bg-red-500 text-white font-bold py-3 rounded-xl hover:bg-red-600 shadow-lg shadow-red-200 transition-colors"
              >
                {pendingDeleteIds.includes(deleteConfirmTask.id) ? 'Xóa vĩnh viễn' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className={cn("bg-white border-r border-slate-200 transition-all duration-300 flex flex-col z-20", isSidebarOpen ? "w-64" : "w-20")}>
        <div className="p-6 flex items-center gap-3 border-b border-slate-100">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shrink-0">
            <LayoutDashboard size={20} />
          </div>
          {isSidebarOpen && <h1 className="font-bold text-lg tracking-tight text-blue-900 truncate">KPI Manager</h1>}
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <SidebarItem icon={<CalendarDays size={20} />} label="Công việc hằng ngày" active={activeSection === 'cong-viec-hang-ngay'} onClick={() => setActiveSection('cong-viec-hang-ngay')} collapsed={!isSidebarOpen} />
          <SidebarItem icon={<CalendarRange size={20} />} label="Timeline công việc" active={activeSection === 'timeline'} onClick={() => setActiveSection('timeline')} collapsed={!isSidebarOpen} />
          <SidebarItem icon={<Plus size={20} />} label="Giao việc" active={activeSection === 'giao-viec'} onClick={() => setActiveSection('giao-viec')} collapsed={!isSidebarOpen} />
          <SidebarItem icon={<Share2 size={20} />} label="Social Media" active={activeSection === 'social_media'} onClick={() => setActiveSection('social_media')} collapsed={!isSidebarOpen} />
          <SidebarItem icon={<BarChart3 size={20} />} label="Đánh giá công việc" active={activeSection === 'danh-gia'} onClick={() => setActiveSection('danh-gia')} collapsed={!isSidebarOpen} />
          <SidebarItem icon={<Search size={20} />} label="Tìm kiếm" active={activeSection === 'search'} onClick={() => setActiveSection('search')} collapsed={!isSidebarOpen} />
        </nav>

        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-4 border-t border-slate-100 flex items-center justify-center hover:bg-slate-50 transition-colors">
          {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </aside>

      {/* Main Content */}
      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        <div className="fixed top-4 right-4 z-[999] flex flex-col gap-2">
          
          {/* Thanh Tiến độ Tải File */}
          {uploadProgress && (
            <div className="px-6 py-4 rounded-xl shadow-lg text-white font-medium flex flex-col gap-3 transition-all duration-300 animate-in slide-in-from-right-8 fade-in bg-blue-600 w-[350px]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-bold">Đang tải file lên Drive...</span>
                </div>
                <span className="text-xs font-bold bg-blue-800 px-2 py-1 rounded-lg">{uploadProgress.current}/{uploadProgress.total}</span>
              </div>
              <div className="w-full bg-blue-900/60 rounded-full h-2 overflow-hidden">
                <div className="bg-white h-full transition-all duration-300 rounded-full" style={{ width: `${uploadProgress.percentage}%` }}></div>
              </div>
              <div className="text-xs text-right opacity-90">{uploadProgress.percentage}% hoàn tất</div>
            </div>
          )}

          {toasts.map(toast => (
            <div 
              key={toast.id} 
              className={cn(
                "px-6 py-4 rounded-xl shadow-lg text-white font-medium flex items-center gap-4 transition-all duration-300",
                toast.isClosing ? "translate-x-full opacity-0" : "animate-in slide-in-from-right-8 fade-in",
                (toast.type === 'success' || toast.type === 'edit') ? "bg-emerald-500" : toast.type === 'cancel' ? "bg-slate-500" : "bg-red-500"
              )}
            >
              <div className="flex items-center gap-3">
                {toast.type === 'success' && <CheckCircle2 size={20} />}
                {toast.type === 'edit' && <Edit size={20} />}
                {toast.type === 'delete' && <Trash2 size={20} />}
                {toast.type === 'error' && <AlertCircle size={20} />}
                {toast.type === 'cancel' && <AlertCircle size={20} />}
                <span className={(toast.type === 'success' || toast.type === 'edit') ? "cursor-pointer hover:underline" : ""} onClick={() => { if (toast.type === 'success' || toast.type === 'edit') setActiveSection('cong-viec-hang-ngay'); }}>
                  {toast.message}
                </span>
              </div>
              {toast.type === 'delete' && toast.task && (
                <button onClick={() => handleUndo(toast.task!, toast.id)} className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors whitespace-nowrap">Hoàn tác</button>
              )}
              {toast.type === 'cancel' && toast.task && (
                <button 
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('TRIGGER_EDIT', { detail: toast.task }));
                    setToasts(prev => prev.filter(t => t.id !== toast.id));
                  }}
                  className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors whitespace-nowrap font-bold"
                >
                  Quay lại chỉnh sửa
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="max-w-[1440px] mx-auto">
          {activeSection === 'giao-viec' && <GiaoViec tasks={tasks} onAdd={addTask} onDelete={deleteTask} onUpdate={updateTask} showToast={showToast} onDoubleClickTask={setDoubleClickTask} />}
          {activeSection === 'cong-viec-hang-ngay' && <CongViecHangNgay tasks={tasks} onUpdate={updateTask} onDoubleClickTask={setDoubleClickTask} />}
          {activeSection === 'timeline' && <TimelineCongViec tasks={tasks} onSelectTask={(id) => {
            const taskToView = tasks.find(t => t.id === id);
            if (taskToView) window.dispatchEvent(new CustomEvent('TRIGGER_VIEW', { detail: taskToView }));
          }} onDoubleClickTask={setTimelineActionTask} />}
          {/* Vùng hiển thị của Social Media */}
          {activeSection === 'social_media' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">Quản lý Social Media</h1>
                  <p className="text-sm text-slate-500 mt-1">Hệ thống lập kế hoạch và tối ưu lịch đăng bài đa nền tảng</p>
                </div>
                <button className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors">
                  <Settings size={22} />
                </button>
              </div>

              {/* Thanh chuyển đổi Tab (Sub-tabs) */}
              <div className="flex bg-white rounded-2xl p-1.5 shadow-sm border border-slate-100 w-fit">
                <button
                  onClick={() => setActiveSocialTab('danh-sach')}
                  className={twMerge(
                    "px-6 py-2.5 rounded-xl font-medium transition-all duration-200",
                    activeSocialTab === 'danh-sach' ? "bg-blue-50 text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  )}
                >
                  Danh sách Dự án
                </button>
                <button
                  onClick={() => setActiveSocialTab('ke-hoach')}
                  className={twMerge(
                    "px-6 py-2.5 rounded-xl font-medium transition-all duration-200",
                    activeSocialTab === 'ke-hoach' ? "bg-blue-50 text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  )}
                >
                  Kế Hoạch Dự Án
                </button>
              </div>

              {/* Vùng hiển thị nội dung theo Tab */}
              {activeSocialTab === 'danh-sach' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm min-h-[500px]">
                  <p className="text-slate-400 text-center mt-20 font-medium">Khu vực kéo thả "Danh sách Dự án" sẽ được lắp ghép ở bước sau.</p>
                </div>
              )}

              {activeSocialTab === 'ke-hoach' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm min-h-[500px]">
                  <p className="text-slate-400 text-center mt-20 font-medium">Bảng Lịch "Kế Hoạch Dự Án" (Tháng/Tuần) sẽ được lắp ghép ở bước sau.</p>
                </div>
              )}
            </div>
          )}
          {activeSection === 'danh-gia' && <DanhGiaCongViec tasks={tasks} />}
          {activeSection === 'search' && <SearchSection tasks={tasks} selectedId={selectedTaskId} onClearSelection={() => setSelectedTaskId(null)} onDelete={deleteTask} />}
        </div>
        {/* KHUNG MODAL TOÀN CẦU SẼ HIỆN LÊN Ở ĐÂY */}
      {globalEditTask && (
        <GlobalEditModal 
          task={globalEditTask} 
          onClose={() => setGlobalEditTask(null)} 
          onUpdate={updateTask} 
          onDelete={deleteTask} 
          showToast={showToast} 
        />
      )}
        {/* KHUNG XEM CHI TIẾT TOÀN CẦU SẼ HIỆN LÊN Ở ĐÂY */}
{globalViewTask && (
  <GlobalViewModal 
    task={globalViewTask} 
    onClose={() => setGlobalViewTask(null)}
    onDelete={deleteTask}
  />
)}
      </main>
    </div>
  );
}
function SidebarItem({ icon, label, active, onClick, collapsed }: { 
  icon: React.ReactNode; 
  label: string; 
  active: boolean; 
  onClick: () => void;
  collapsed: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200",
        active 
          ? "bg-blue-50 text-blue-600 font-semibold shadow-sm" 
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
        collapsed && "justify-center"
      )}
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

// --- Section: Giao Việc ---
function GiaoViec({ tasks, onAdd, onDelete, onUpdate, showToast, onDoubleClickTask }: { 
  tasks: Task[], 
  onAdd: (task: any) => void, 
  onDelete: (id: string) => void,
  onUpdate: (task: Task) => void,
  showToast: (message: string, type: 'success' | 'delete' | 'edit' | 'error' | 'cancel', task?: Task) => void,
  onDoubleClickTask?: (task: Task) => void
}) {
  const [formData, setFormData] = useState({
    project: '',
    description: '',
    deadline: format(new Date(), 'yyyy-MM-dd'),
    kpiLevel: KPILevel.LEVEL_1,
    note: '',
    files: [] as string[]
  });

  const [isDragging, setIsDragging] = useState(false);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.project) return;
    
    // Kiểm tra chặn giao việc ngày nghỉ (Thứ 7, Chủ Nhật)
    const deadlineDate = parseISO(formData.deadline);
    if (isWeekend(deadlineDate)) {
      showToast('Không thể giao Deadline vào ngày nghỉ (Thứ 7, Chủ nhật)', 'error');
      return;
    }

    onAdd(formData);
    setFormData({ project: '', description: '', deadline: format(new Date(), 'yyyy-MM-dd'), kpiLevel: KPILevel.LEVEL_1, note: '', files: [] });
  };

  const processFiles = (files: FileList) => {
    if (!files) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const fileString = (reader.result as string) + "|||" + file.name;
        setFormData(prev => ({ ...prev, files: [...prev.files, fileString] }));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) processFiles(e.target.files); };
 // Bắt sự kiện thả file từ hệ thống toàn màn hình
  useEffect(() => {
    const handleGlobalDrop = (e: any) => {
      // Bỏ qua không nhận file nếu Bảng Chỉnh Sửa đang bật (để tránh 1 file bị add nhầm vào cả 2 nơi)
      if (!document.getElementById('global-edit-form')) {
        processFiles(e.detail);
      }
    };
    window.addEventListener('GLOBAL_FILE_DROP', handleGlobalDrop);
    return () => window.removeEventListener('GLOBAL_FILE_DROP', handleGlobalDrop);
  }, []);
// --- BẮT ĐẦU: LOGIC LỌC THÁNG, SẮP XẾP & PHÂN TRANG ---
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Tham chiếu thanh cuộn ngang
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollLeft = () => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
  };
  const scrollRight = () => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
  };

  // 1. Nhóm và đếm dự án theo tháng (Sắp xếp từ Cũ nhất đến Mới nhất -> Trái sang Phải)
  const monthGroups = useMemo(() => {
    const groups: { [key: string]: number } = {};
    tasks.forEach(task => {
      const date = parseISO(task.createdAt || task.startDate);
      const monthKey = format(date, 'MM/yyyy');
      groups[monthKey] = (groups[monthKey] || 0) + 1;
    });
    return Object.entries(groups).sort((a, b) => {
      const [m1, y1] = a[0].split('/');
      const [m2, y2] = b[0].split('/');
      if (y1 !== y2) return parseInt(y1) - parseInt(y2);
      return parseInt(m1) - parseInt(m2);
    });
  }, [tasks]);

  // 2. Lọc và sắp xếp dữ liệu
  const processedTasks = useMemo(() => {
    let filtered = [...tasks];
    
    if (selectedMonth) {
      // NẾU CHỌN THÁNG: Chỉ lấy dự án tháng đó, sắp xếp Deadline từ trên xuống
      filtered = filtered.filter(task => {
        const date = parseISO(task.createdAt || task.startDate);
        return format(date, 'MM/yyyy') === selectedMonth;
      });
      filtered.sort((a, b) => startOfDay(parseISO(a.deadline)).getTime() - startOfDay(parseISO(b.deadline)).getTime());
    } else {
      // MẶC ĐỊNH (Tất cả): Sắp xếp theo Thời gian giao dự án mới nhất lên đầu (từ trên xuống)
      filtered.sort((a, b) => {
         const dateA = new Date(a.createdAt || 0).getTime();
         const dateB = new Date(b.createdAt || 0).getTime();
         return dateB - dateA;
      });
    }
    return filtered;
  }, [tasks, selectedMonth]);

  // 3. Cắt dữ liệu cho trang hiện tại
  const totalPages = Math.max(1, Math.ceil(processedTasks.length / itemsPerPage));
  const paginatedTasks = processedTasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Tự động quay về trang 1 nếu đổi tháng hoặc số lượng task thay đổi
  useEffect(() => { setCurrentPage(1); }, [selectedMonth, tasks.length]);
  // --- KẾT THÚC LOGIC ---
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      <h2 className="text-3xl font-bold text-center text-blue-900 mb-12">Giao Việc Mới</h2>
      
      {/* 1. KHUNG FORM THÊM MỚI (Giữ nguyên) */}
      <form onSubmit={handleAddSubmit} className="bg-white p-6 md:p-8 rounded-3xl shadow-xl border border-blue-100 space-y-6">
        <h3 className="text-xl font-bold text-blue-900 mb-2 border-b border-blue-100 pb-4">Thêm Dự Án Mới</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-base font-semibold text-slate-600">Dự án</label>
            <input type="text" required value={formData.project} onChange={e => setFormData(prev => ({ ...prev, project: e.target.value }))} placeholder="Tên dự án..." className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-base" />
          </div>
          <div className="space-y-2">
            <label className="text-base font-semibold text-slate-600">Deadline</label>
            <input type="date" required min={format(new Date(), 'yyyy-MM-dd')} value={formData.deadline} onChange={e => setFormData(prev => ({ ...prev, deadline: e.target.value }))} className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-base" />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-base font-semibold text-slate-600">Mô tả và thông tin</label>
            <textarea value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} placeholder="Chi tiết công việc..." rows={4} className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-base" />
          </div>
          <div className="space-y-2">
            <label className="text-base font-semibold text-slate-600">Đánh giá KPI</label>
            <select value={formData.kpiLevel} onChange={e => setFormData(prev => ({ ...prev, kpiLevel: parseInt(e.target.value) }))} className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-base">
              {Object.entries(KPI_CONFIG).map(([level, config]) => (
                <option key={level} value={level}>{config.label} ({config.displayHours} - {config.points}đ)</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-base font-semibold text-slate-600">Ghi chú</label>
            <input type="text" value={formData.note} onChange={e => setFormData(prev => ({ ...prev, note: e.target.value }))} placeholder="Ghi chú thêm..." className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-base" />
          </div>
          <div className="md:col-span-2 space-y-2">
            <label className="text-base font-semibold text-slate-600">Hình ảnh và file đính kèm</label>
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-blue-400 transition-colors cursor-pointer relative">
              <input type="file" multiple onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
              <FileUp className="mx-auto text-slate-400 mb-2" size={32} />
              <p className="text-slate-500 text-sm">Kéo thả file vào bất cứ đâu trên màn hình hoặc click vào đây</p>
              {formData.files.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {formData.files.map((fileData, i) => {
                    let displayName = "File đính kèm";
                    if (fileData.includes("|||")) displayName = fileData.split("|||")[1];
                    else if (fileData.includes("drive.google.com")) displayName = "Thư mục Drive đã lưu";
                    return (
                      <div key={i} className="group relative px-3 py-1.5 bg-blue-100 rounded-lg flex items-center text-blue-600 text-sm font-medium gap-2 shadow-sm hover:pr-8 transition-all">
                        <Paperclip size={14} className="shrink-0" />
                        <span className="truncate max-w-[250px]">{displayName}</span>
                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, files: prev.files.filter((_, idx) => idx !== i) }))} className="absolute right-2 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 transition-opacity">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
        <button type="submit" className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-[0.98]">
          Giao Việc Ngay
        </button>
      </form>

     {/* 2. BẢNG DANH SÁCH VÀ BỘ LỌC */}
      <div className="flex flex-col gap-4">
        
        {/* THANH BỘ LỌC THÁNG NGANG */}
        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
          <button onClick={() => setSelectedMonth(null)} className={cn("shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all font-bold text-sm", selectedMonth === null ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200")}>
            <span>Tất cả Dự án</span>
            <span className={cn("px-2 py-0.5 rounded-lg text-[10px]", selectedMonth === null ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-500")}>{tasks.length}</span>
          </button>
          
          <div className="w-px h-8 bg-slate-200 mx-1"></div>
          
          <button onClick={scrollLeft} className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 shadow-sm shrink-0 active:scale-95 transition-all">
            <ChevronLeft size={18} />
          </button>
          
          <div ref={scrollContainerRef} className="flex-1 flex items-center gap-2 overflow-x-auto scroll-smooth px-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            {monthGroups.map(([month, count]) => (
              <button key={month} onClick={() => setSelectedMonth(month)} className={cn("shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all font-bold text-sm", selectedMonth === month ? "bg-blue-600 text-white shadow-md" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200")}>
                <span>Tháng {month}</span>
                <span className={cn("px-2 py-0.5 rounded-lg text-[10px]", selectedMonth === month ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-500")}>{count}</span>
              </button>
            ))}
          </div>

          <button onClick={scrollRight} className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 shadow-sm shrink-0 active:scale-95 transition-all">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* BẢNG DỮ LIỆU CÓ ĐỘ CAO TỐI THIỂU ĐỂ TRÁNH GIẬT TRANG LÊN XUỐNG */}
        <div className="bg-white rounded-3xl shadow-xl border border-blue-100 flex flex-col min-h-[850px]">
          <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-blue-600 text-white">
                <th className="p-4 font-semibold text-base w-16">Sửa</th>
                <th className="p-4 font-semibold text-base w-16">STT</th>
                <th className="p-4 font-semibold text-base min-w-[150px]">Dự án</th>
                <th className="p-4 font-semibold text-base max-w-[300px]">Mô tả</th>
                <th className="p-4 font-semibold text-base w-24">File</th>
                <th className="p-4 font-semibold text-base w-32 whitespace-nowrap">Deadline</th>
                <th className="p-4 font-semibold text-base w-24 whitespace-nowrap">KPI</th>
                <th className="p-4 font-semibold text-base max-w-[200px]">Ghi chú</th>
                <th className="p-4 font-semibold text-base w-16">Xóa</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTasks.map((task, index) => {
                const isPastDeadline = isBefore(parseISO(task.deadline), startOfDay(new Date()));
                const isCompleted = task.status === TaskStatus.COMPLETED;
                return (
                  <tr 
                    key={task.id} 
                    onDoubleClick={() => onDoubleClickTask && onDoubleClickTask(task)}
                    title="Nháy đúp chuột để Sửa hoặc Xóa"
                    className={cn(
                      "transition-colors",
                      isCompleted ? "bg-slate-100 text-slate-400" : (
                        isPastDeadline 
                          ? (index % 2 === 0 ? "bg-slate-100 text-slate-500" : "bg-slate-50 text-slate-500")
                          : (index % 2 === 0 ? "bg-blue-50/50" : "bg-white")
                      )
                    )}>
                    <td className="p-4 text-sm align-top">
                      {/* NÚT CHỈNH SỬA GỌI BẢNG TOÀN CẦU */}
                      <button 
                        onClick={() => window.dispatchEvent(new CustomEvent('TRIGGER_EDIT', { detail: task }))} 
                        className="text-blue-400 hover:text-blue-600 transition-colors"
                      >
                        <Edit size={18} />
                      </button>
                    </td>
                    <td className="p-4 text-sm font-medium">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                    <td className="p-4 text-sm align-top"><ExpandableText text={task.project} isProject /></td>
                    <td className="p-4 text-sm align-top max-w-[300px]"><ExpandableText text={task.description} /></td>
                    <td className="p-4 text-sm align-top"><ExpandableFiles files={task.files} /></td>
                    <td className="p-4 text-sm font-medium align-top whitespace-nowrap">{format(parseISO(task.deadline), 'dd/MM/yyyy')}</td>
                    <td className="p-4 text-sm align-top whitespace-nowrap">
                      <span className={cn("px-3 py-1 rounded-full text-white text-xs font-bold", (isPastDeadline || isCompleted) && "opacity-60")} style={{ backgroundColor: isCompleted ? '#94a3b8' : KPI_CONFIG[task.kpiLevel].color }}>
                        {KPI_CONFIG[task.kpiLevel].label}
                      </span>
                    </td>
                    <td className="p-4 text-sm align-top max-w-[200px]"><ExpandableText text={task.note || ''} /></td>
                    <td className="p-4 text-sm align-top">
                      <button onClick={() => onDelete(task.id)} className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {paginatedTasks.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-slate-400 italic">Chưa có công việc nào được giao</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* THANH ĐIỀU HƯỚNG PHÂN TRANG (PAGINATION) */}
        {totalPages > 0 && (
          <div className="flex items-center justify-center gap-2 p-4 border-t border-slate-100 bg-slate-50/50 mt-auto rounded-b-3xl">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-40 transition-all font-bold flex items-center shadow-sm active:scale-95" title="Trang đầu tiên">
              <ChevronLeft size={16} className="-mr-1"/><ChevronLeft size={16} />
            </button>
            <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-40 transition-all shadow-sm active:scale-95" title="Trang trước">
              <ChevronLeft size={16}/>
            </button>
            
            <span className="px-6 py-2 text-sm font-bold text-blue-700 bg-blue-50 rounded-lg border border-blue-100 shadow-inner min-w-[120px] text-center">
              Trang {currentPage} / {totalPages}
            </span>
            
            <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-40 transition-all shadow-sm active:scale-95" title="Trang sau">
              <ChevronRight size={16}/>
            </button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 disabled:opacity-40 transition-all font-bold flex items-center shadow-sm active:scale-95" title="Trang cuối cùng">
              <ChevronRight size={16} className="-mr-1"/><ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// --- Section: Công Việc Hàng Ngày ---
function CongViecHangNgay({ tasks, onUpdate, onDoubleClickTask }: { tasks: Task[], onUpdate: (task: Task) => void, onDoubleClickTask?: (task: Task) => void }) {
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const today = startOfDay(new Date());
  
  // Calculate valid dates (3 days ago to future days with tasks)
  const validDates = useMemo(() => {
    const dates = new Set<number>();
    
    // Add 3 days ago up to today
    for (let i = 3; i >= 0; i--) {
      dates.add(subDays(today, i).getTime());
    }
    
    // Add future days that have tasks
    tasks.forEach(task => {
      task.workingDays.forEach(day => {
        const date = startOfDay(parseISO(day)).getTime();
        if (date > today.getTime()) {
          dates.add(date);
        }
      });
    });
    
    return Array.from(dates).sort((a, b) => a - b).map(t => new Date(t));
  }, [tasks, today]);

  const currentIndex = validDates.findIndex(d => isSameDay(d, selectedDate));
  
  const handlePrevDay = () => {
    if (currentIndex > 0) {
      setSelectedDate(validDates[currentIndex - 1]);
    }
  };

  const handleNextDay = () => {
    if (currentIndex < validDates.length - 1) {
      setSelectedDate(validDates[currentIndex + 1]);
    }
  };
  
  const currentTasks = useMemo(() => {
    const today = startOfDay(new Date());
    return tasks
      .filter(task => {
        // 1. Công việc có lịch làm việc đúng vào ngày đang chọn trên lịch
        const isScheduledForSelectedDate = task.workingDays.some(day => isSameDay(parseISO(day), selectedDate));
        
        // 2. Dồn việc CHƯA XONG về ngày "Hôm nay" (trừ Thứ 7, CN)
        const isToday = isSameDay(selectedDate, today);
        const isNotWeekend = !isWeekend(today);
        const isUnfinished = task.status !== TaskStatus.COMPLETED;
        // Đảm bảo dự án đã đến ngày bắt đầu hoặc trễ hạn mới hiện lên
        const hasStarted = task.startDate && isBefore(startOfDay(parseISO(task.startDate)), addDays(today, 1));
        
        const isRollover = isToday && isNotWeekend && isUnfinished && hasStarted;

        return isScheduledForSelectedDate || isRollover;
      })
      .sort((a, b) => {
        const todayDate = startOfDay(new Date());

        // HÀM PHÂN LOẠI NHÓM ƯU TIÊN (1: Cao nhất -> 3: Thấp nhất)
        const getPriorityGroup = (task: Task) => {
          // NHÓM 3: Đã hoàn thành -> Nằm dưới cùng
          if (task.status === 'COMPLETED' || task.status === TaskStatus.COMPLETED) return 3; 
          
          const deadlineDate = startOfDay(parseISO(task.deadline));

          // NHÓM 2: Đã quá hạn nhưng chưa xong -> Ưu tiên nằm kế tiếp
          if (isBefore(deadlineDate, todayDate)) return 2; 
          
          // NHÓM 1: Đang trong thời hạn làm việc -> Lên trên cùng
          return 1; 
        };

        const groupA = getPriorityGroup(a);
        const groupB = getPriorityGroup(b);

        // 1. SẮP XẾP THEO NHÓM ƯU TIÊN (Nhóm 1 -> Nhóm 2 -> Nhóm 3)
        if (groupA !== groupB) {
          return groupA - groupB; 
        }

        // 2. NẾU CÙNG NHÓM -> Sắp xếp theo mức KPI giảm dần (Từ 5 xuống 1)
        if (a.kpiLevel !== b.kpiLevel) {
          return b.kpiLevel - a.kpiLevel;
        }

        // 3. NẾU CÙNG NHÓM & CÙNG KPI -> Dự án nào có Deadline gần hơn sẽ xếp trước
        const aDeadline = startOfDay(parseISO(a.deadline)).getTime();
        const bDeadline = startOfDay(parseISO(b.deadline)).getTime();
        return aDeadline - bDeadline;
      });
  }, [tasks, selectedDate]);

  const toggleStatus = (task: Task) => {
    const newStatus = task.status === TaskStatus.COMPLETED ? TaskStatus.IN_PROGRESS : TaskStatus.COMPLETED;
    onUpdate({ ...task, status: newStatus });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-3xl font-bold text-center text-blue-900 mb-12">Công Việc Hằng Ngày</h2>
      
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-blue-100">
        <div className="p-6 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button 
              onClick={handlePrevDay}
              disabled={currentIndex <= 0}
              className="p-2 rounded-full hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={20} className="text-blue-700" />
            </button>
            <span className="text-blue-900 font-bold text-lg min-w-[150px] text-center">
              {isSameDay(selectedDate, today) ? 'Hôm nay' : format(selectedDate, 'dd/MM/yyyy')}
            </span>
            <button 
              onClick={handleNextDay}
              disabled={currentIndex >= validDates.length - 1 || currentIndex === -1}
              className="p-2 rounded-full hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={20} className="text-blue-700" />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-blue-600 bg-blue-100 px-3 py-1 rounded-full">
              {currentTasks.length} công việc
            </span>
            <input 
              type="date" 
              value={format(selectedDate, 'yyyy-MM-dd')}
              onChange={e => setSelectedDate(startOfDay(new Date(e.target.value)))}
              className="px-4 py-2 rounded-xl border border-blue-200 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-blue-600 text-white">
                <th className="p-4 font-semibold text-base w-44">Tiến độ</th>
                <th className="p-4 font-semibold text-base w-16">STT</th>
                <th className="p-4 font-semibold text-base min-w-[150px]">Dự án</th>
                <th className="p-4 font-semibold text-base max-w-[300px]">Mô tả</th>
                <th className="p-4 font-semibold text-base w-24">File</th>
                <th className="p-4 font-semibold text-base w-32 whitespace-nowrap">Deadline</th>
                <th className="p-4 font-semibold text-base w-24 whitespace-nowrap">KPI</th>
                <th className="p-4 font-semibold text-base max-w-[200px]">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {currentTasks.map((task, index) => {
                const deadlineDate = startOfDay(parseISO(task.deadline));
                const todayDate = startOfDay(new Date());
                const isPastDeadline = isBefore(deadlineDate, todayDate);
                const daysToDeadline = differenceInDays(deadlineDate, todayDate);
                const isCompleted = task.status === TaskStatus.COMPLETED;
                
                let gradientClass = "bg-white";
                if (task.status === TaskStatus.INFO) gradientClass = "bg-gradient-to-t from-yellow-100 to-white";
                else if (task.status === TaskStatus.IN_PROGRESS) gradientClass = "bg-gradient-to-t from-orange-100 to-white";
                else if (task.status === TaskStatus.REVIEW) gradientClass = "bg-gradient-to-t from-purple-100 to-white";
                else if (task.status === TaskStatus.COMPLETED) gradientClass = "bg-gradient-to-t from-green-100 to-white opacity-70";

                const borderClass = "border-b border-slate-100";
                const rowBgClass = `${gradientClass} ${borderClass}`;

                return (
                  <tr 
                    key={task.id} 
                    onDoubleClick={() => onDoubleClickTask && onDoubleClickTask(task)}
                    className={cn("transition-colors hover:bg-slate-50", rowBgClass)}
                  >
                    <td className="p-3 align-middle w-44">
                      <select
                        value={task.status || 'NEW'}
                        onChange={e => onUpdate({ ...task, status: e.target.value as any })}
                        onClick={e => e.stopPropagation()}
                        className={cn(
                          "w-full min-w-[140px] px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer outline-none border-0 transition-all shadow-sm",
                          task.status === 'COMPLETED'   ? "bg-green-100 text-green-800" :
                          task.status === 'REVIEW'      ? "bg-purple-100 text-purple-800" :
                          task.status === 'IN_PROGRESS' ? "bg-orange-100 text-orange-800" :
                          task.status === 'INFO'        ? "bg-yellow-100 text-yellow-800" :
                                                          "bg-slate-100 text-slate-600"
                        )}
                      >
                        <option value="NEW">Dự án mới</option>
                        <option value="INFO">Tìm thông tin</option>
                        <option value="IN_PROGRESS">Đang thực hiện</option>
                        <option value="REVIEW">Chờ xác nhận</option>
                        <option value="COMPLETED">Hoàn thành</option>
                      </select>
                    </td>
                    <td className="p-4 text-sm font-medium">{index + 1}</td>
                    <td className="p-4 text-sm align-top"><ExpandableText text={task.project} isProject /></td>
                    <td className="p-4 text-sm align-top max-w-[300px]"><ExpandableText text={task.description} /></td>
                    <td className="p-4 text-sm align-top"><ExpandableFiles files={task.files} /></td>
                    <td className={cn(
                      "p-4 text-sm align-top whitespace-nowrap",
                      task.status !== 'COMPLETED' && (isPastDeadline || (daysToDeadline <= 1 && daysToDeadline >= 0)) 
                        ? "text-red-600 font-bold drop-shadow-sm" 
                        : "font-medium text-slate-700"
                    )}>
                      {format(parseISO(task.deadline), 'dd/MM/yyyy')}
                    </td>
                    <td className="p-4 text-sm align-top whitespace-nowrap">
                      <span className={cn("px-3 py-1 rounded-full text-white text-xs font-bold", task.status === 'COMPLETED' && "opacity-60")} style={{ backgroundColor: task.status === 'COMPLETED' ? '#94a3b8' : KPI_CONFIG[task.kpiLevel].color }}>
                        {KPI_CONFIG[task.kpiLevel].label}
                      </span>
                    </td>
                    <td className="p-4 text-sm align-top max-w-[200px]">
                      <ExpandableText text={task.note || ''} />
                    </td>
                  </tr>
                );
              })}
              {currentTasks.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-400 italic">Không có công việc nào cần xử lý</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Section: Tìm Kiếm ---
function SearchSection({ tasks, selectedId, onClearSelection, onDelete }: { 
  tasks: Task[], 
  selectedId?: string | null,
  onClearSelection?: () => void,
  onDelete: (id: string) => void
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    if (selectedId) {
      const task = tasks.find(t => t.id === selectedId);
      if (task) {
        setSelectedTask(task);
        setSearchTerm('');
      }
    }
  }, [selectedId, tasks]);

  const predictions = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return tasks.filter(task => {
      const project = task.project.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return project.includes(term);
    });
  }, [searchTerm, tasks]);

  const handleSelectTask = (task: Task) => {
    setSelectedTask(task);
    setSearchTerm('');
    if (onClearSelection) onClearSelection();
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1120px] mx-auto">
      <h2 className="text-3xl font-bold text-center text-blue-900 mb-12">Tìm Kiếm</h2>
      
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Nhập tên dự án để tìm kiếm..."
            className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-blue-100 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-lg shadow-sm"
          />
        </div>

        {searchTerm && predictions.length > 0 && (
          <div className="absolute z-10 w-full mt-2 bg-white rounded-2xl shadow-2xl border border-blue-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {predictions.map(task => (
              <button
                key={task.id}
                onClick={() => handleSelectTask(task)}
                className="w-full px-6 py-4 text-left hover:bg-blue-50 transition-colors flex justify-between items-center border-b border-blue-50 last:border-0"
              >
                <span className="font-bold text-blue-900">{task.project}</span>
                <span className="text-sm text-slate-400 font-medium">
                  {format(parseISO(task.deadline), 'dd/MM/yyyy')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedTask && (
        <div className="bg-white rounded-3xl shadow-xl border border-blue-100 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="p-8 space-y-8">
            <div className="flex justify-between items-start border-b border-blue-50 pb-6">
              <div>
                <h3 className="text-2xl font-bold text-blue-900 mb-2">{selectedTask.project}</h3>
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <Clock size={16} />
                  Deadline: {format(parseISO(selectedTask.deadline), 'dd/MM/yyyy')}
                </p>
              </div>
              
              {/* Bổ sung hiển thị Tiến độ song song với nhãn KPI */}
              <div className="flex gap-2">
                <span className={cn(
                  "px-4 py-2 rounded-full text-slate-800 text-sm font-bold shadow-sm border border-slate-200",
                  selectedTask.status === 'INFO' ? 'bg-gradient-to-t from-yellow-100 to-white' :
                  selectedTask.status === 'IN_PROGRESS' ? 'bg-gradient-to-t from-orange-100 to-white' :
                  selectedTask.status === 'REVIEW' ? 'bg-gradient-to-t from-purple-100 to-white' :
                  selectedTask.status === 'COMPLETED' ? 'bg-gradient-to-t from-green-100 to-white opacity-70' : 'bg-white'
                )}>
                  {selectedTask.status === 'INFO' ? 'Tìm thông tin' :
                   selectedTask.status === 'IN_PROGRESS' ? 'Đang thực hiện' :
                   selectedTask.status === 'REVIEW' ? 'Chờ xác nhận' :
                   selectedTask.status === 'COMPLETED' ? 'Hoàn thành' : 'Dự án mới'}
                </span>
                
                <span 
                  className="px-4 py-2 rounded-full text-white text-sm font-bold shadow-sm"
                  style={{ backgroundColor: KPI_CONFIG[selectedTask.kpiLevel].color }}
                >
                  {KPI_CONFIG[selectedTask.kpiLevel].label}
                </span>
              </div>
            </div>
              
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="text-base font-bold text-blue-900 flex items-center gap-2">
                  <FileText size={18} className="text-blue-500" />
                  Nội dung chi tiết
                </h4>
                <div className="bg-slate-50 p-6 rounded-2xl text-sm text-slate-700 leading-relaxed whitespace-pre-wrap min-h-[150px]">
                  {selectedTask.description}
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-base font-bold text-blue-900 flex items-center gap-2">
                    <Paperclip size={18} className="text-blue-500" />
                    File đính kèm
                  </h4>
                  <div className="bg-slate-50 p-6 rounded-2xl min-h-[80px]">
                    <ExpandableFiles files={selectedTask.files} />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-base font-bold text-blue-900 flex items-center gap-2">
                    <AlertCircle size={18} className="text-blue-500" />
                    Ghi chú & KPI
                  </h4>
                  <div className="bg-slate-50 p-6 rounded-2xl space-y-4">
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">KPI Points</span>
                      <p className="text-lg font-bold text-blue-900">{KPI_CONFIG[selectedTask.kpiLevel].points} điểm</p>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ghi chú</span>
                      <p className="text-sm text-slate-700 italic">{selectedTask.note || 'Không có ghi chú'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Nút Chỉnh Sửa và Nút Xóa (Đã sửa lỗi biến 'selectedTask' và thiết kế lại) */}
            <div className="pt-6 border-t border-blue-50 flex justify-end mt-4 gap-4">
              <button 
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('TRIGGER_EDIT', { detail: selectedTask }));
                }}
                className="bg-blue-100 text-blue-700 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-200 transition-colors shadow-sm active:scale-95"
                title="Chỉnh sửa dự án này"
              >
                <Edit size={18} /> Chỉnh sửa
              </button>
              
              <button 
                onClick={() => {
                  onDelete(selectedTask.id);
                  setSelectedTask(null); // Đóng bảng sau khi xóa
                }}
                className="bg-red-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-red-600 transition-colors shadow-lg shadow-red-200 active:scale-95"
                title="Xóa dự án này"
              >
                <Trash2 size={18} /> Xóa
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// --- Section: Timeline Công Việc ---
function TimelineCongViec({ tasks, onSelectTask, onDoubleClickTask }: { tasks: Task[], onSelectTask: (id: string) => void, onDoubleClickTask?: (task: Task) => void }) {
  const [centerDate, setCenterDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week'>('day');

  // NÚT CHUYỂN TRÁI PHẢI (Ngày nhảy 7 ngày, Tuần nhảy 1 tuần = 7 ngày)
  const handlePrev = () => {
    setCenterDate(prev => subDays(prev, 7));
  };

  const handleNext = () => {
    setCenterDate(prev => addDays(prev, 7));
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      setCenterDate(new Date(e.target.value));
    }
  };

  const timelineData = useMemo(() => {
    if (viewMode === 'week') {
      const result = [];
      const centerWeekStart = startOfWeek(centerDate, { weekStartsOn: 1 });
      let current = subDays(centerWeekStart, 14); 
      
      for (let i = 0; i < 5; i++) {
        const wStart = current;
        const wEnd = endOfWeek(current, { weekStartsOn: 1 });
        const mon = wStart;
        const fri = addDays(wStart, 4);
        
        const thursday = addDays(wStart, 3);
        const month = getMonth(thursday);
        const year = getYear(thursday);
        
        result.push({
          id: i,
          label: `Tuần ${getWeek(thursday)} (${format(mon, 'dd')} - ${format(fri, 'dd')})`,
          start: wStart,
          end: wEnd,
          month,
          year,
          isCurrent: isSameDay(wStart, startOfWeek(new Date(), { weekStartsOn: 1 }))
        });
        
        current = addDays(wStart, 7);
      }
      return result;
    } else {
      const result = [];
      let current = subDays(centerDate, 7);
      while (result.length < 14) {
        const day = getDay(current);
        if (day !== 0 && day !== 6) { 
          result.push({
            id: current.getTime(),
            label: format(current, 'dd/MM'),
            start: startOfDay(current),
            end: endOfDay(current),
            month: getMonth(current),
            year: getYear(current),
            isCurrent: isSameDay(current, new Date())
          });
        }
        current = addDays(current, 1);
      }
      return result;
    }
  }, [centerDate, viewMode]);

  const monthGroups = useMemo(() => {
    const groups: { label: string, colSpan: number, month: number }[] = [];
    let currentGroup: any = null;
    
    timelineData.forEach(item => {
      const monthYear = `Tháng ${item.month + 1} Năm ${item.year}`;
      if (!currentGroup || currentGroup.label !== monthYear) {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = { label: monthYear, colSpan: 1, month: item.month };
      } else {
        currentGroup.colSpan += 1;
      }
    });
    if (currentGroup) groups.push(currentGroup);
    return groups;
  }, [timelineData]);

  // THUẬT TOÁN SẮP XẾP TIMELINE THÔNG MINH
  const sortedTasks = useMemo(() => {
    const todayDate = startOfDay(new Date());
    const viewStart = timelineData[0]?.start;
    const viewEnd = timelineData[timelineData.length - 1]?.end;

    if (!viewStart || !viewEnd) return [];

    return tasks
      .filter(task => {
        const deadlineDate = startOfDay(parseISO(task.deadline));
        const isUnfinished = task.status !== 'COMPLETED';
        const isOverdue = isBefore(deadlineDate, todayDate);
        
        // Kiểm tra xem cột ngày "Hôm nay" có đang xuất hiện trong khung giao diện lịch đang xem không
        const isTodayInView = timelineData.some(item => todayDate >= item.start && todayDate <= item.end);

        // ĐIỀU KIỆN HIỂN THỊ
        return (deadlineDate >= viewStart && deadlineDate <= viewEnd) || (isUnfinished && isOverdue && isTodayInView);
      })
      .sort((a, b) => {
        const todayDate = startOfDay(new Date());

        // HÀM PHÂN LOẠI NHÓM ƯU TIÊN (1: Cao nhất -> 4: Thấp nhất)
        const getPriorityGroup = (task: Task) => {
          // NHÓM 4: Đã hoàn thành -> Nằm dưới cùng tuyệt đối của danh sách
          if (task.status === 'COMPLETED') return 4; 
          
          const deadlineDate = startOfDay(parseISO(task.deadline));
          const startDate = startOfDay(parseISO(task.startDate));

          // NHÓM 2: Đã quá hạn nhưng chưa xong -> Ưu tiên kế tiếp sau việc đang làm
          if (isBefore(deadlineDate, todayDate)) return 2; 
          
          // NHÓM 3: Dự án tương lai (chưa tới ngày bắt đầu) -> Nằm trên dự án đã xong
          if (isBefore(todayDate, startDate)) return 3; 
          
          // NHÓM 1: Đang trong thời hạn làm việc -> Lên trên cùng
          return 1; 
        };

        const groupA = getPriorityGroup(a);
        const groupB = getPriorityGroup(b);

        // 1. SẮP XẾP THEO NHÓM ƯU TIÊN (Nhóm 1 -> Nhóm 2 -> Nhóm 3 -> Nhóm 4)
        if (groupA !== groupB) {
          return groupA - groupB; 
        }

        // 2. NẾU CÙNG NHÓM -> Sắp xếp theo mức KPI giảm dần (Từ 5 xuống 1)
        if (a.kpiLevel !== b.kpiLevel) {
          return b.kpiLevel - a.kpiLevel;
        }

        // 3. NẾU CÙNG NHÓM & CÙNG KPI -> Dự án nào có Deadline gần hơn sẽ xếp trước
        const aDeadline = startOfDay(parseISO(a.deadline)).getTime();
        const bDeadline = startOfDay(parseISO(b.deadline)).getTime();
        return aDeadline - bDeadline;
      });
  }, [tasks, timelineData]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-3xl font-bold text-center text-blue-900 mb-12">Timeline Công Việc</h2>
      
      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-blue-100">
        <div className="p-6 bg-blue-50 border-b border-blue-100 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="flex bg-blue-100 p-1 rounded-xl">
              <button
                onClick={() => setViewMode('day')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                  viewMode === 'day' ? "bg-white text-blue-900 shadow-sm" : "text-blue-600 hover:bg-blue-50"
                )}
              >
                Ngày
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                  viewMode === 'week' ? "bg-white text-blue-900 shadow-sm" : "text-blue-600 hover:bg-blue-50"
                )}
              >
                Tuần
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handlePrev}
                className="p-2 rounded-full hover:bg-blue-100 transition-colors"
              >
                <ChevronLeft size={20} className="text-blue-700" />
              </button>
              <button 
                onClick={handleNext}
                className="p-2 rounded-full hover:bg-blue-100 transition-colors"
              >
                <ChevronRight size={20} className="text-blue-700" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-blue-900">Chọn ngày:</label>
            <input 
              type="date" 
              value={format(centerDate, 'yyyy-MM-dd')}
              onChange={handleDateChange}
              className="px-3 py-2 rounded-xl border border-blue-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        {/* Đã gỡ bỏ khung kéo thả, trả lại thanh cuộn ngang mượt mà mặc định của web */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-blue-700 text-white">
                <th className="p-2 border-r border-blue-600 sticky left-0 z-20 bg-blue-700 w-16" rowSpan={2}>STT</th>
                <th className="p-2 border-r border-blue-600 sticky left-16 z-20 bg-blue-700 w-48" rowSpan={2}>Dự án</th>
                {monthGroups.map((group, i) => (
                  <th key={i} colSpan={group.colSpan} className="p-2 text-center border-b border-r border-blue-600 font-bold">
                    {group.label}
                  </th>
                ))}
              </tr>
              <tr className="bg-blue-600 text-white">
                {timelineData.map((item, i) => (
                  <th key={i} className={cn("p-2 font-semibold text-sm text-center border-r border-blue-500/30 pointer-events-none", item.isCurrent && "bg-blue-800")}>
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map((task, index) => {
                const today = startOfDay(new Date());
                const deadlineDate = startOfDay(parseISO(task.deadline));
                const isCompleted = task.status === 'COMPLETED';
                const isPastDeadline = isBefore(deadlineDate, today);
                // CHỈ công việc đã HOÀN THÀNH mới bị chuyển sang màu xám nhạt
                const isInactive = isCompleted;
                
                return (
                  <tr key={task.id} className={cn(
                    "transition-colors h-16",
                    index % 2 === 0 ? "bg-blue-50/50" : "bg-white"
                  )}>
                    <td className="p-4 text-sm font-medium sticky left-0 bg-inherit z-10 border-r border-slate-100 pointer-events-none">
                      {index + 1}
                    </td>
                    <td className="p-4 text-sm font-bold text-blue-900 sticky left-16 bg-inherit z-10 border-r border-slate-100 min-w-[200px] break-words whitespace-pre-wrap pointer-events-none">
                      {task.project}
                    </td>
                    {(() => {
                      const cells = [];
                      let skipCount = 0;
                      
                      for (let i = 0; i < timelineData.length; i++) {
                        if (skipCount > 0) {
                          skipCount--;
                          continue;
                        }
                        
                        const item = timelineData[i];
                        
                        // 1. Kiểm tra ngày hiển thị gốc trên lịch
                        const isTaskInOriginalItem = task.workingDays.some(day => {
                          const d = parseISO(day);
                          return d >= item.start && d <= item.end;
                        });

                        // 2. Nhận diện các dự án quá hạn chưa hoàn thành
                        const todayStart = startOfDay(new Date());
                        const deadlineDate = startOfDay(parseISO(task.deadline));
                        const isUnfinished = task.status !== 'COMPLETED';
                        const isOverdue = isBefore(deadlineDate, todayStart);

                        // Tìm vị trí chính xác của cột ngày "Hôm nay" trên lịch đang hiển thị
                        const todayIndex = timelineData.findIndex(tItem => todayStart >= tItem.start && todayStart <= tItem.end);
                        
                        // THUẬT TOÁN DỊCH CHUYỂN: Tính toán ô bắt đầu sao cho thanh màu KẾT THÚC chạm sát lề phải cột Hôm nay
                        const overdueStartClassIndex = todayIndex >= 0 ? Math.max(0, todayIndex - task.workingDays.length + 1) : -1;

                        let isTaskInItem = false;
                        if (isUnfinished && isOverdue) {
                          isTaskInItem = (i === overdueStartClassIndex) && (todayIndex >= 0);
                        } else {
                          isTaskInItem = isTaskInOriginalItem;
                        }

                        if (isTaskInItem) {
                          let colSpan = 1;
                          
                          if (isUnfinished && isOverdue) {
                            // GIỮ NGUYÊN KÍCH THƯỚC: Gộp số cột tương đương với tổng số ngày làm việc gốc đổ ngược lại
                            colSpan = todayIndex - overdueStartClassIndex + 1;
                          } else {
                            // Tính độ dài tự nhiên đối với các công việc trong hạn bình thường
                            for (let j = i + 1; j < timelineData.length; j++) {
                              const nextItem = timelineData[j];
                              const isTaskInNextItem = task.workingDays.some(day => {
                                const d = parseISO(day);
                                return d >= nextItem.start && d <= nextItem.end;
                              });
                              if (isTaskInNextItem) {
                                colSpan++;
                              } else {
                                break;
                              }
                            }
                          }
                          
                          skipCount = colSpan - 1;
                          
                          cells.push(
                            <td key={i} colSpan={colSpan} className={cn(
                              "p-0 border-r border-slate-100 relative",
                              item.isCurrent 
                                ? "bg-blue-100/50" 
                                : (item.month % 2 === 0 ? "bg-slate-50/50" : "bg-transparent")
                            )}>
                              <div 
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  if (onDoubleClickTask) onDoubleClickTask(task);
                                }}
                                className="h-10 mx-0 rounded-none flex flex-col justify-center items-center text-[10px] text-white font-bold shadow-sm cursor-pointer hover:opacity-80 transition-opacity overflow-hidden whitespace-nowrap relative"
                                style={{ backgroundColor: isInactive ? '#cbd5e1' : KPI_CONFIG[task.kpiLevel].color }}
                                title={`${task.project} - Tiến độ: ${task.status === 'COMPLETED' ? 'Hoàn thành' : task.status === 'REVIEW' ? 'Chờ xác nhận' : task.status === 'IN_PROGRESS' ? 'Đang thực hiện' : task.status === 'INFO' ? 'Tìm thông tin' : 'Dự án mới'}`}
                              >
                                {viewMode === 'week' && (
                                  <span className="shrink-0 z-10 px-2">{format(deadlineDate, 'dd/MM')}</span>
                                )}

                                {/* THANH TIẾN ĐỘ NHỎ DƯỚI ĐÁY (Ẩn khi Hoàn thành, 5 mức tỷ lệ mới) */}
                                {task.status !== 'COMPLETED' && (
                                  <div className="absolute bottom-0 left-0 w-full h-1.5 bg-black/10 flex overflow-hidden">
                                    <div 
                                      // Sử dụng màu gốc KPI nhưng làm đậm hơn bằng bộ lọc brightness-75 của Tailwind
                                      style={task.status !== 'NEW' ? { backgroundColor: KPI_CONFIG[task.kpiLevel].color } : undefined}
                                      className={cn(
                                        "h-full transition-all duration-300",
                                        task.status === 'NEW' ? "w-full bg-white/40" : // Dự án mới: trắng nhạt toàn thanh
                                        task.status === 'INFO' ? "w-[25%] brightness-75" : // Tìm thông tin: 1/4 thanh
                                        task.status === 'IN_PROGRESS' ? "w-[50%] brightness-75" : // Đang thực hiện: 2/4 thanh
                                        task.status === 'REVIEW' ? "w-[75%] brightness-75" : "w-0" // Chờ xác nhận: 3/4 thanh
                                      )}
                                    ></div>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        } else {
                          cells.push(
                            <td key={i} className={cn(
                              "p-2 border-r border-slate-100 relative pointer-events-none",
                              item.isCurrent 
                                ? "bg-blue-100/50" 
                                : (item.month % 2 === 0 ? "bg-slate-50/50" : "bg-transparent")
                            )}></td>
                          );
                        }
                      }
                      return cells;
                    })()}
                  </tr>
                );
              })}
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={timelineData.length + 2} className="p-12 text-center text-slate-400 italic pointer-events-none">Chưa có dữ liệu timeline</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// --- Section: Đánh Giá Công Việc ---
function DanhGiaCongViec({ tasks }: { tasks: Task[] }) {
  // Generate months from Jan 2026 to Dec 2030
  const months = useMemo(() => {
    const start = new Date(2026, 0, 1); // Jan 2026
    const end = new Date(2030, 11, 1); // Dec 2030
    const result = [];
    let current = start;
    while (current <= end) {
      result.push(new Date(current));
      current = addMonths(current, 1);
    }
    return result;
  }, []);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    const currentMonth = startOfMonth(today);
    return currentMonth >= new Date(2026, 0, 1) && currentMonth <= new Date(2030, 11, 1) 
      ? currentMonth 
      : new Date(2026, 0, 1);
  });

  const chartData = useMemo(() => {
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(selectedMonth);
    const days = eachDayOfInterval({ start, end });
    
    const data: any[] = [];
    
    days.forEach(day => {
      if (isWeekend(day)) {
        if (day.getDay() === 6) { // Saturday
          // Add gap
          data.push({
            day: `gap-${format(day, 'dd')}`,
            kpi: null,
            isGap: true
          });
        }
        return; // Skip weekends
      }

      let totalKpi = 0;
      tasks.forEach(task => {
        if (task.workingDays.some(d => isSameDay(parseISO(d), day))) {
          totalKpi += task.dailyKpiPoints;
        }
      });
      
      data.push({
        day: format(day, 'dd'),
        kpi: Number(totalKpi.toFixed(2)),
        isWeekend: false
      });
    });

    return data;
  }, [selectedMonth, tasks]);

  const stats = useMemo(() => {
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(selectedMonth);
    
    const monthTasks = tasks.filter(task => {
      const deadline = parseISO(task.deadline);
      return deadline >= start && deadline <= end;
    });
    
    const totalKpi = monthTasks.reduce((sum, task) => sum + KPI_CONFIG[task.kpiLevel].points, 0);
    
    return {
      count: monthTasks.length,
      totalKpi: Number(totalKpi.toFixed(2))
    };
  }, [selectedMonth, tasks]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-3xl font-bold text-center text-blue-900 mb-12">Đánh Giá Công Việc</h2>
      
      <div className="bg-white p-4 md:p-8 rounded-3xl shadow-xl border border-blue-100 space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          
          {/* Thêm Cụm Mũi tên và Tiêu đề */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-blue-100 p-1 rounded-xl">
              <button 
                onClick={() => {
                  const currentIndex = months.findIndex(m => m.getTime() === selectedMonth.getTime());
                  if (currentIndex > 0) setSelectedMonth(months[currentIndex - 1]);
                }}
                className="p-1.5 hover:bg-blue-200 rounded-lg text-blue-700 transition-colors" title="Tháng trước"
              >
                <ChevronLeft size={20} />
              </button>
              <button 
                onClick={() => {
                  const currentIndex = months.findIndex(m => m.getTime() === selectedMonth.getTime());
                  if (currentIndex < months.length - 1) setSelectedMonth(months[currentIndex + 1]);
                }}
                className="p-1.5 hover:bg-blue-200 rounded-lg text-blue-700 transition-colors" title="Tháng sau"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            <h3 className="text-xl font-bold text-blue-800">Biểu đồ KPI tháng {format(selectedMonth, 'MM/yyyy')}</h3>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-2 scrollbar-hide">
            <select 
              className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-50 text-blue-600 outline-none cursor-pointer"
              onChange={(e) => setSelectedMonth(new Date(e.target.value))}
              value={selectedMonth.toISOString()}
            >
              {months.map((m, i) => (
                <option key={i} value={m.toISOString()}>Tháng {format(m, 'MM/yyyy')}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="h-[300px] md:h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis 
                dataKey="day" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#64748b', fontSize: 10 }}
                tickFormatter={(val) => val.startsWith('gap-') ? '' : val}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#64748b', fontSize: 10 }}
              />
              <Tooltip 
                cursor={{ fill: '#f1f5f9' }}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                labelFormatter={(label) => label.startsWith('gap-') ? '' : `Ngày ${label}`}
                formatter={(value: any) => value === null ? [] : [value.toFixed(2), 'KPI']}
              />
              <Bar dataKey="kpi" radius={[4, 4, 0, 0]} label={{ position: 'top', fill: '#1e3a8a', fontSize: 9, fontWeight: 'bold', formatter: (val: any) => val === null ? '' : val.toFixed(2) }}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.isGap ? 'transparent' : (index % 2 === 0 ? '#3b82f6' : '#1d4ed8')} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-slate-100">
          <div className="bg-blue-50 p-6 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-600 font-medium uppercase tracking-wider mb-1">Tổng dự án xử lý</p>
              <p className="text-3xl font-bold text-blue-900">{stats.count}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
              <FileText size={24} />
            </div>
          </div>
          <div className="bg-indigo-50 p-6 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs text-indigo-600 font-medium uppercase tracking-wider mb-1">Tổng điểm KPI</p>
              <p className="text-3xl font-bold text-indigo-900">{stats.totalKpi.toFixed(2)}đ</p>
            </div>
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
              <BarChart3 size={24} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- BẢNG CHỈNH SỬA TOÀN CẦU (GLOBAL MODAL) ---
function GlobalEditModal({ task, onClose, onUpdate, onDelete, showToast }: { 
  task: Task, 
  onClose: () => void, 
  onUpdate: (task: Task) => void, 
  onDelete: (id: string) => void, // Đã bổ sung hàm Xóa vào đây
  showToast: any
}) {
  const [editFormData, setEditFormData] = useState({
    project: task.project,
    description: task.description,
    deadline: task.deadline,
    kpiLevel: task.kpiLevel,
    status: task.status || 'NEW', // Thêm dòng này để nhận diện tiến độ hiện tại
    note: task.note || '',
    files: task.files || []
  });

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editFormData.project) return;
    const deadlineDate = parseISO(editFormData.deadline);
    if (isWeekend(deadlineDate)) {
      showToast('Không thể giao Deadline vào ngày nghỉ (Thứ 7, Chủ nhật)', 'error');
      return;
    }
    const { startDate, workingDays } = calculateTaskDates(deadlineDate, editFormData.kpiLevel);
    const kpiPoints = KPI_CONFIG[editFormData.kpiLevel].points;
    const updatedTask: Task = {
      ...task,
      ...editFormData,
      startDate: startDate.toISOString(),
      workingDays: workingDays.map(d => d.toISOString()),
      dailyKpiPoints: kpiPoints / workingDays.length,
    };
    onUpdate(updatedTask);
    showToast('Đã chỉnh sửa thành công', 'edit', updatedTask);
    onClose();
  };

  const processFiles = (files: FileList) => {
    if (!files) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const fileString = (reader.result as string) + "|||" + file.name;
        setEditFormData(prev => ({ ...prev, files: [...prev.files, fileString] }));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
  };
  // Nhận file từ sự kiện kéo thả toàn màn hình
  useEffect(() => {
    const handleGlobalDrop = (e: any) => processFiles(e.detail);
    window.addEventListener('GLOBAL_FILE_DROP', handleGlobalDrop);
    return () => window.removeEventListener('GLOBAL_FILE_DROP', handleGlobalDrop);
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="bg-white w-full max-w-[1280px] min-h-[65vh] rounded-3xl shadow-2xl relative z-10 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="px-8 py-5 border-b border-slate-100 bg-slate-50 rounded-t-3xl">
          <h3 className="text-2xl font-bold text-blue-900">Chỉnh Sửa Công Việc</h3>
        </div>
        <div className="p-8 overflow-y-auto flex-1">
          <form id="global-edit-form" onSubmit={handleEditSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
              <div className="md:col-span-2 space-y-2">
                <label className="text-base font-semibold text-slate-600">Dự án</label>
                <input type="text" required value={editFormData.project} onChange={e => setEditFormData(prev => ({ ...prev, project: e.target.value }))} className="w-full p-4 text-base rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="md:col-span-1 space-y-2">
                <label className="text-base font-semibold text-slate-600">Deadline</label>
                <input type="date" required value={editFormData.deadline} onChange={e => setEditFormData(prev => ({ ...prev, deadline: e.target.value }))} className="w-full p-4 text-base rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="md:col-span-3 space-y-2">
                <label className="text-base font-semibold text-slate-600">Mô tả chi tiết</label>
                <textarea value={editFormData.description} onChange={e => setEditFormData(prev => ({ ...prev, description: e.target.value }))} rows={5} className="w-full p-4 text-base rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="md:col-span-1 space-y-2">
                <label className="text-base font-semibold text-slate-600">Đánh giá KPI</label>
                <select value={editFormData.kpiLevel} onChange={e => setEditFormData(prev => ({ ...prev, kpiLevel: parseInt(e.target.value) }))} className="w-full p-4 text-base rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none">
                  {Object.entries(KPI_CONFIG).map(([level, config]) => (
                    <option key={level} value={level}>{config.label}</option>
                  ))}
                </select>
              </div>

              {/* BỔ SUNG: Ô CHỈNH SỬA TIẾN ĐỘ DỰ ÁN */}
              <div className="md:col-span-1 space-y-2">
                <label className="text-base font-semibold text-slate-600">Tiến độ công việc</label>
                <select value={editFormData.status} onChange={e => setEditFormData(prev => ({ ...prev, status: e.target.value as any }))} className="w-full p-4 text-base rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white cursor-pointer font-bold text-slate-700">
                  <option value="NEW">Dự án mới</option>
                  <option value="INFO">Tìm thông tin</option>
                  <option value="IN_PROGRESS">Đang thực hiện</option>
                  <option value="REVIEW">Chờ xác nhận</option>
                  <option value="COMPLETED">Hoàn thành</option>
                </select>
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="text-base font-semibold text-slate-600">Ghi chú</label>
                <input type="text" value={editFormData.note} onChange={e => setEditFormData(prev => ({ ...prev, note: e.target.value }))} className="w-full p-4 text-base rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="md:col-span-3 space-y-2">
                <label className="text-base font-semibold text-slate-600">File đính kèm</label>
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-blue-400 transition-colors relative">
                  <input type="file" multiple onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <p className="text-slate-500 text-sm">Click để tải thêm file</p>
                  {editFormData.files.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2 justify-center">
                      {editFormData.files.map((fileData, i) => {
                        let displayName = "File đính kèm";
                        if (fileData.includes("|||")) displayName = fileData.split("|||")[1];
                        else if (fileData.includes("drive.google.com")) displayName = "Thư mục Drive đã lưu";
                        return (
                          <div key={i} className="group relative px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-lg flex items-center text-blue-600 text-sm gap-2 hover:pr-8 transition-all">
                            <span className="truncate max-w-[300px]">{displayName}</span>
                            <button type="button" onClick={() => setEditFormData(prev => ({ ...prev, files: prev.files.filter((_, idx) => idx !== i) }))} className="absolute right-2 opacity-0 group-hover:opacity-100 text-red-500">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </form>
        </div>
        
        {/* THANH FOOTER ĐÃ ĐƯỢC BỔ SUNG NÚT XÓA BÊN PHẢI */}
        <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 rounded-b-3xl flex gap-4 mt-auto">
          <button type="button" onClick={onClose} className="flex-1 bg-white border border-slate-300 text-slate-700 p-4 text-base rounded-xl font-bold hover:bg-slate-100 transition-all">
            Hủy
          </button>
          <button form="global-edit-form" type="submit" className="flex-[2] bg-blue-600 text-white p-4 text-base rounded-xl font-bold hover:bg-blue-700 shadow-md transition-all">
            Lưu Thay Đổi
          </button>
          
          {/* NÚT XÓA MỚI */}
          <button 
            type="button" 
            onClick={() => {
              onDelete(task.id); // Gọi lệnh Xóa dự án
              onClose();         // Tự động đóng Bảng Sửa lại
            }} 
            className="bg-red-50 text-red-500 px-6 rounded-xl hover:bg-red-500 hover:text-white transition-all flex items-center justify-center border border-red-100" 
            title="Xóa dự án"
          >
            <Trash2 size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}
// --- BẢNG XEM CHI TIẾT TOÀN CẦU (GLOBAL VIEW MODAL) ---
function GlobalViewModal({ task, onClose, onDelete }: { 
  task: Task, 
  onClose: () => void,
  onDelete: (id: string) => void
}) {
  // Cấu hình màu sắc hiển thị 5 mức độ tiến độ an toàn
  const STATUS_CONFIG = {
    'NEW': { label: 'Dự án mới', gradient: 'bg-white' },
    'INFO': { label: 'Tìm thông tin', gradient: 'bg-gradient-to-t from-yellow-100 to-white' },
    'IN_PROGRESS': { label: 'Đang thực hiện', gradient: 'bg-gradient-to-t from-orange-100 to-white' },
    'REVIEW': { label: 'Chờ xác nhận', gradient: 'bg-gradient-to-t from-purple-100 to-white' },
    'COMPLETED': { label: 'Hoàn thành', gradient: 'bg-gradient-to-t from-green-100 to-white opacity-70' }
  };

  const currentStatus = task.status || 'NEW';
  const statusInfo = STATUS_CONFIG[currentStatus] || STATUS_CONFIG['NEW'];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      
      <div className="bg-white w-full max-w-[1120px] rounded-3xl shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="p-8 overflow-y-auto">
           {/* Header */}
           <div className="flex justify-between items-start border-b border-blue-50 pb-6 mb-8">
              <div>
                <h3 className="text-2xl font-bold text-blue-900 mb-2">{task.project}</h3>
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <Clock size={16} />
                  Deadline: {format(parseISO(task.deadline), 'dd/MM/yyyy')}
                </p>
              </div>
              {/* Đã sửa lỗi trùng thuộc tính className gây sập giao diện */}
              <div className="flex gap-2">
                <span className={cn("px-4 py-2 rounded-full text-slate-800 text-sm font-bold shadow-sm border border-slate-200", statusInfo.gradient)}>
                  {statusInfo.label}
                </span>
                <span className="px-4 py-2 rounded-full text-white text-sm font-bold shadow-sm" style={{ backgroundColor: KPI_CONFIG[task.kpiLevel].color }}>
                  {KPI_CONFIG[task.kpiLevel].label}
                </span>
              </div>
            </div>

            {/* Nội dung */}
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="text-base font-bold text-blue-900 flex items-center gap-2">
                  <FileText size={18} className="text-blue-500" />
                  Nội dung chi tiết
                </h4>
                <div className="bg-slate-50 p-6 rounded-2xl text-sm text-slate-700 leading-relaxed whitespace-pre-wrap min-h-[150px]">
                  {task.description}
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-4">
                  <h4 className="text-base font-bold text-blue-900 flex items-center gap-2">
                    <Paperclip size={18} className="text-blue-500" />
                    File đính kèm
                  </h4>
                  <div className="bg-slate-50 p-6 rounded-2xl min-h-[80px]">
                    <ExpandableFiles files={task.files} />
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-base font-bold text-blue-900 flex items-center gap-2">
                    <AlertCircle size={18} className="text-blue-500" />
                    Ghi chú & KPI
                  </h4>
                  <div className="bg-slate-50 p-6 rounded-2xl space-y-4">
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">KPI Points</span>
                      <p className="text-lg font-bold text-blue-900">{KPI_CONFIG[task.kpiLevel].points} điểm</p>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ghi chú</span>
                      <p className="text-sm text-slate-700 italic">{task.note || 'Không có ghi chú'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Các nút chức năng */}
            <div className="pt-6 border-t border-blue-50 flex mt-8 gap-4">
              <button onClick={onClose} className="px-6 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all mr-auto">
                Đóng
              </button>
              
              <button 
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('TRIGGER_EDIT', { detail: task }));
                  onClose();
                }}
                className="bg-blue-100 text-blue-700 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-200 transition-colors shadow-sm active:scale-95"
              >
                <Edit size={18} /> Chỉnh sửa
              </button>
              
              <button 
                onClick={() => {
                  onDelete(task.id);
                  onClose();
                }}
                className="bg-red-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-red-600 transition-colors shadow-lg shadow-red-200 active:scale-95"
              >
                <Trash2 size={18} /> Xóa
              </button>
            </div>
        </div>
      </div>
    </div>
  );
}
