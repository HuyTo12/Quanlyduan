import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  LayoutDashboard, CalendarDays, CalendarRange, BarChart3, Plus, FileUp, 
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, FileText, Paperclip, 
  Trash2, Search, Edit, CheckCircle2, Clock, AlertCircle 
} from 'lucide-react';
import { 
  format, addDays, subDays, isSameDay, startOfMonth, endOfMonth, 
  eachDayOfInterval, getWeek, startOfWeek, endOfWeek, parseISO, 
  differenceInDays, isWeekend, getMonth, getYear, startOfDay, isBefore, getDay, endOfDay 
} from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { KPILevel, KPI_CONFIG, Task, calculateTaskDates, TaskStatus } from './types';

// --- KẾT NỐI SUPABASE & GOOGLE DRIVE ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const gasUrl = import.meta.env.VITE_GAS_URL;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- COMPONENT PHỤ ---
function ExpandableText({ text, isProject = false }: { text: string, isProject?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <span>-</span>;
  if (isProject) return <div className="min-w-[150px] text-base font-bold text-blue-900 leading-tight">{text}</div>;
  return (
    <div className="relative max-w-[300px]">
      <div className={cn("text-sm transition-all duration-200 text-slate-600", !expanded && "line-clamp-2")}>{text}</div>
      {text.length > 50 && (
        <button onClick={() => setExpanded(!expanded)} className="text-blue-500 hover:text-blue-700 text-xs mt-1 flex items-center gap-1">
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
        <a key={i} href={file} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors" title="Xem trên Google Drive">
          <Paperclip size={16} />
        </a>
      ))}
    </div>
  );
}

// --- ỨNG DỤNG CHÍNH ---
export default function App() {
  const [activeSection, setActiveSection] = useState<string>('giao-viec');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [toasts, setToasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // 1. LẤY DỮ LIỆU TỪ CLOUD SUPABASE
  const fetchTasks = async () => {
    const { data, error } = await supabase.from('projects').select('*').order('createdAt', { ascending: false });
    if (!error) setTasks(data || []);
  };

  useEffect(() => { fetchTasks(); }, []);

  const showToast = (message: string, type: 'success' | 'delete' | 'edit' | 'error') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

  // 2. HÀM TẢI FILE LÊN GOOGLE DRIVE
  const uploadToDrive = async (base64: string, projectName: string) => {
    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        body: JSON.stringify({ base64, projectName, date: format(new Date(), 'dd-MM-yyyy') })
      });
      const result = await response.json();
      return result.status === 'success' ? result.url : null;
    } catch (e) {
      console.error("Lỗi upload Drive:", e);
      return null;
    }
  };

  // 3. THÊM DỰ ÁN MỚI
  const addTask = async (formData: any) => {
    setLoading(true);
    let driveLinks: string[] = [];

    if (formData.files && formData.files.length > 0) {
      for (const base64 of formData.files) {
        const link = await uploadToDrive(base64, formData.project);
        if (link) driveLinks.push(link);
      }
    }

    const deadlineDate = parseISO(formData.deadline);
    const { startDate, workingDays } = calculateTaskDates(deadlineDate, formData.kpiLevel);
    
    const taskRecord = {
      ...formData,
      id: crypto.randomUUID(),
      startDate: startDate.toISOString(),
      workingDays: workingDays.map(d => d.toISOString()),
      dailyKpiPoints: KPI_CONFIG[formData.kpiLevel as KPILevel].points / workingDays.length,
      createdAt: new Date().toISOString(),
      status: TaskStatus.IN_PROGRESS,
      files: driveLinks
    };

    const { error } = await supabase.from('projects').insert([taskRecord]);
    if (!error) {
      setTasks([taskRecord, ...tasks]);
      showToast('Đã lưu dự án & đẩy file lên Google Drive thành công!', 'success');
    } else {
      showToast('Lỗi lưu Supabase: ' + error.message, 'error');
    }
    setLoading(false);
  };

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (!error) {
      setTasks(prev => prev.filter(t => t.id !== id));
      showToast('Đã xóa dự án khỏi hệ thống', 'delete');
    }
  };

  const updateTask = async (updatedTask: Task) => {
    const { error } = await supabase.from('projects').update(updatedTask).eq('id', updatedTask.id);
    if (!error) {
      setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
    }
  };

  return (
    <div className="flex h-screen bg-[#f0f7ff] text-slate-800 font-sans overflow-hidden">
      {loading && (
        <div className="fixed inset-0 bg-blue-900/60 z-[100] flex flex-col items-center justify-center text-white backdrop-blur-sm">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-white border-t-transparent mb-4"></div>
          <p className="text-xl font-bold animate-pulse">Đang đẩy file lên Google Drive...</p>
        </div>
      )}

      <aside className={cn("bg-white border-r border-slate-200 transition-all duration-300 flex flex-col z-20", isSidebarOpen ? "w-64" : "w-20")}>
        <div className="p-6 flex items-center gap-3 border-b border-slate-100">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shrink-0"><LayoutDashboard size={20} /></div>
          {isSidebarOpen && <h1 className="font-bold text-lg text-blue-900 truncate">KPI Manager</h1>}
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <SidebarItem icon={<Plus size={20} />} label="Giao việc" active={activeSection === 'giao-viec'} onClick={() => setActiveSection('giao-viec')} collapsed={!isSidebarOpen} />
          <SidebarItem icon={<CalendarDays size={20} />} label="Hàng ngày" active={activeSection === 'cong-viec-hang-ngay'} onClick={() => setActiveSection('cong-viec-hang-ngay')} collapsed={!isSidebarOpen} />
          <SidebarItem icon={<CalendarRange size={20} />} label="Timeline" active={activeSection === 'timeline'} onClick={() => setActiveSection('timeline')} collapsed={!isSidebarOpen} />
          <SidebarItem icon={<BarChart3 size={20} />} label="Đánh giá" active={activeSection === 'danh-gia'} onClick={() => setActiveSection('danh-gia')} collapsed={!isSidebarOpen} />
        </nav>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-4 border-t border-slate-100 flex items-center justify-center hover:bg-slate-50 transition-colors">
          {isSidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
          {toasts.map(toast => (
            <div key={toast.id} className={cn("px-6 py-4 rounded-xl shadow-2xl text-white font-medium flex items-center gap-4 animate-in slide-in-from-top-4", toast.type === 'success' ? "bg-emerald-500" : "bg-red-500")}>
              {toast.type === 'success' ? <CheckCircle2 size={20}/> : <AlertCircle size={20}/>}
              <span>{toast.message}</span>
            </div>
          ))}
        </div>

        <div className="max-w-6xl mx-auto">
          {activeSection === 'giao-viec' && (
            <div className="space-y-8 animate-in fade-in duration-500">
               <h2 className="text-3xl font-black text-center text-blue-900 uppercase">✨ Giao Việc ✨</h2>
               <GiaoViecForm onAdd={addTask} />
               <TaskTable tasks={tasks} onDelete={deleteTask} />
            </div>
          )}
          {activeSection === 'cong-viec-hang-ngay' && <DailyView tasks={tasks} onUpdate={updateTask} />}
          {activeSection === 'timeline' && <TimelineView tasks={tasks} />}
          {activeSection === 'danh-gia' && <ReportView tasks={tasks} />}
        </div>
      </main>
    </div>
  );
}

// --- CÁC COMPONENT GIAO DIỆN CHI TIẾT ---

function SidebarItem({ icon, label, active, onClick, collapsed }: any) {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center gap-3 p-3 rounded-xl transition-all", active ? "bg-blue-50 text-blue-600 font-bold shadow-sm" : "text-slate-500 hover:bg-slate-50", collapsed && "justify-center")}>
      {icon} {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

function GiaoViecForm({ onAdd }: any) {
  const [formData, setFormData] = useState({ project: '', description: '', deadline: format(new Date(), 'yyyy-MM-dd'), kpiLevel: KPILevel.LEVEL_1, note: '', files: [] as string[] });

  const handleFileUpload = (e: any) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file: any) => {
        const reader = new FileReader();
        reader.onloadend = () => setFormData(prev => ({ ...prev, files: [...prev.files, reader.result as string] }));
        reader.readAsDataURL(file);
      });
    }
  };

  const handleSubmit = (e: any) => {
    e.preventDefault();
    if (!formData.project) return;
    onAdd(formData);
    setFormData({ project: '', description: '', deadline: format(new Date(), 'yyyy-MM-dd'), kpiLevel: KPILevel.LEVEL_1, note: '', files: [] });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-8 rounded-3xl shadow-xl border border-blue-100 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="font-bold text-slate-600">Tên dự án</label>
          <input type="text" required value={formData.project} onChange={e => setFormData({ ...formData, project: e.target.value })} className="w-full p-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 outline-none" />
        </div>
        <div className="space-y-2">
          <label className="font-bold text-slate-600">Deadline</label>
          <input type="date" required value={formData.deadline} onChange={e => setFormData({ ...formData, deadline: e.target.value })} className="w-full p-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 outline-none" />
        </div>
        <div className="md:col-span-2 space-y-2">
          <label className="font-bold text-slate-600">Mô tả</label>
          <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={3} className="w-full p-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 outline-none" />
        </div>
        <div className="space-y-2">
          <label className="font-bold text-slate-600">KPI Level</label>
          <select value={formData.kpiLevel} onChange={e => setFormData({ ...formData, kpiLevel: parseInt(e.target.value) })} className="w-full p-4 rounded-2xl border-2 border-slate-100 focus:border-blue-500 outline-none">
            {Object.entries(KPI_CONFIG).map(([lvl, cfg]) => <option key={lvl} value={lvl}>{cfg.label} ({cfg.displayHours})</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="font-bold text-slate-600">File đính kèm</label>
          <div className="relative border-2 border-dashed border-blue-200 rounded-2xl p-4 text-center hover:bg-blue-50 cursor-pointer">
            <input type="file" multiple onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
            <div className="flex items-center justify-center gap-2 text-blue-600 font-bold"><FileUp size={20}/> {formData.files.length > 0 ? `Đã chọn ${formData.files.length} file` : "Chọn file dự án"}</div>
          </div>
        </div>
      </div>
      <button type="submit" className="w-full bg-blue-600 text-white p-5 rounded-2xl font-black text-lg hover:bg-blue-700 shadow-xl">LƯU & ĐẨY CLOUD</button>
    </form>
  );
}

function TaskTable({ tasks, onDelete }: any) {
  return (
    <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-blue-100">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-blue-600 text-white">
            <tr>
              <th className="p-4">Dự án</th>
              <th className="p-4">Deadline</th>
              <th className="p-4">File Drive</th>
              <th className="p-4">KPI</th>
              <th className="p-4">Xóa</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t: any) => (
              <tr key={t.id} className="border-b border-slate-100 hover:bg-blue-50/50 transition-colors">
                <td className="p-4"><ExpandableText text={t.project} isProject /></td>
                <td className="p-4 text-sm font-medium">{format(parseISO(t.deadline), 'dd/MM/yyyy')}</td>
                <td className="p-4"><ExpandableFiles files={t.files} /></td>
                <td className="p-4"><span className="px-3 py-1 rounded-full text-white text-[10px] font-black" style={{ backgroundColor: KPI_CONFIG[t.kpiLevel as KPILevel].color }}>{KPI_CONFIG[t.kpiLevel as KPILevel].label}</span></td>
                <td className="p-4"><button onClick={() => onDelete(t.id)} className="text-red-400 hover:text-red-600"><Trash2 size={18}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Placeholder cho các phần view khác để đảm bảo code không lỗi
function DailyView({ tasks }: any) { return <div className="p-12 text-center bg-white rounded-3xl">Dữ liệu công việc hàng ngày sẽ hiện ở đây! ✨</div> }
function TimelineView({ tasks }: any) { return <div className="p-12 text-center bg-white rounded-3xl">Dữ liệu Timeline sẽ hiện ở đây! 🚀</div> }
function ReportView({ tasks }: any) { return <div className="p-12 text-center bg-white rounded-3xl">Biểu đồ đánh giá sẽ hiện ở đây! 📊</div> }
