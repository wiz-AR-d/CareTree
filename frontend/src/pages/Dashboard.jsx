import React from 'react';
import { useAuthStore } from '../store/authStore';
import { LogOut, LayoutDashboard, GitMerge, FileText } from 'lucide-react';
import { useNavigate, Routes, Route, Link } from 'react-router-dom';
import ProtocolsList from '../components/ProtocolsList';
import ProtocolBuilder from '../components/ProtocolBuilder';
import TriageRunner from '../components/TriageRunner';
import { useSync } from '../hooks/useSync';

const DoctorDashboard = () => (
    <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <Link
                to="/dashboard/protocols"
                className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-teal-300 rounded-xl hover:bg-teal-50 hover:border-teal-500 transition-colors text-teal-700 bg-white"
            >
                <GitMerge size={32} className="mb-2" />
                <span className="font-medium">Protocol Builder</span>
            </Link>
            <Link
                to="/dashboard/protocols"
                className="flex flex-col items-center justify-center p-6 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-700 bg-white"
            >
                <FileText size={32} className="mb-2" />
                <span className="font-medium">View Protocols</span>
            </Link>
        </div>
    </div>
);

const NurseDashboard = () => (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h2 className="text-xl font-semibold mb-4 text-slate-800">Nurse Triage</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
                to="/dashboard/protocols"
                className="flex flex-col items-center justify-center p-6 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-700 bg-white"
            >
                <FileText size={32} className="mb-2" />
                <span className="font-medium">Start Triage Session</span>
            </Link>
        </div>
    </div>
);


const Dashboard = () => {
    const { user, logout } = useAuthStore();
    const navigate = useNavigate();
    const { isOnline } = useSync();

    const handleLogout = () => {
        if (!isOnline) {
            alert("Logout disabled: You are currently offline. If you log out, you will not be able to log back in until you reconnect to the internet.");
            return;
        }
        logout();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans">
            {/* Nav */}
            <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <div className="flex items-center text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-600 hover:opacity-80 transition-opacity cursor-pointer" onClick={() => navigate('/dashboard')}>
                            <LayoutDashboard className="mr-2 text-teal-600" />
                            <span className="font-extrabold text-2xl tracking-tight">CareTree</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-medium text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                                {user?.name} <span className="text-slate-400 pl-1 capitalize">({user?.role})</span>
                            </span>
                            <button
                                onClick={handleLogout}
                                disabled={!isOnline}
                                title={!isOnline ? "Cannot logout while offline" : "Logout"}
                                className={`inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md transition-colors ${!isOnline ? 'text-slate-400 bg-slate-100 cursor-not-allowed' : 'text-red-600 bg-red-50 hover:bg-red-100'}`}
                            >
                                <LogOut size={16} className="mr-1.5" />
                                Logout
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-slate-900">Welcome back, {user?.name.split(' ')[0]}</h1>
                    <p className="mt-2 text-slate-600">Here's what is happening today.</p>
                </div>

                <Routes>
                    <Route path="/" element={user?.role === 'doctor' ? <DoctorDashboard /> : <NurseDashboard />} />
                    <Route path="/protocols" element={<ProtocolsList />} />
                    <Route path="/build/:id" element={<ProtocolBuilder />} />
                    <Route path="/run/:id" element={<TriageRunner />} />
                </Routes>
            </main>
        </div>
    );
};

export default Dashboard;
