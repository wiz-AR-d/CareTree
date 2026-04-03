import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Plus, Edit2, Play, Users, Search, Trash2 } from 'lucide-react';

const ProtocolsList = () => {
    const [protocols, setProtocols] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const { user } = useAuthStore();

    useEffect(() => {
        const fetchProtocols = async () => {
            try {
                const { data } = await api.get('/protocols');
                setProtocols(data);
            } catch (error) {
                console.error("Failed to fetch protocols", error);
            } finally {
                setLoading(false);
            }
        };

        fetchProtocols();
    }, []);

    const createNewProtocol = async () => {
        const name = prompt("Enter a name for the new Protocol:");
        if (!name) return;

        try {
            const { data } = await api.post('/protocols', {
                name,
                description: "New protocol pending builder configuration"
            });
            // Automatically navigate to builder 
            window.location.href = `/dashboard/build/${data._id}`;
        } catch (error) {
            alert("Failed to create protocol");
        }
    };

    const deleteProtocol = async (id, name) => {
        if (!window.confirm(`Are you sure you want to completely delete "${name}"?\nThis will remove all versions and any sessions belonging to this protocol.`)) {
            return;
        }

        try {
            await api.delete(`/protocols/${id}`);
            // Remove from local state
            setProtocols(protocols.filter(p => p._id !== id));
        } catch (error) {
            alert(error.response?.data?.error || "Failed to delete protocol");
        }
    };

    const filteredProtocols = protocols.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) return <div className="p-8">Loading protocols...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-slate-800">
                    {user?.role === 'doctor' ? 'Clinical Protocols Master List' : ''}
                </h2>
                {user?.role === 'doctor' && (
                    <button
                        onClick={createNewProtocol}
                        className="inline-flex items-center px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-md hover:bg-teal-700 shadow-sm"
                    >
                        <Plus size={16} className="mr-2" />
                        Create Protocol
                    </button>
                )}
            </div>

            {/* Global Search Bar (Especially useful for Nurses searching Chief Complaints) */}
            {user?.role === 'nurse' ? (
                <div className="mb-12 mt-4 bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center flex flex-col items-center">
                    <div className="bg-teal-50 text-teal-600 p-4 rounded-full mb-4">
                        <Search size={32} />
                    </div>
                    <h2 className="text-3xl md:text-4xl font-extrabold text-slate-800 mb-6 tracking-tight">
                        What is the patient's Chief Complaint?
                    </h2>
                    <div className="relative w-full max-w-2xl mx-auto">
                        <input
                            type="text"
                            autoFocus
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="e.g. Chest Pain, Fever, Trouble Breathing..."
                            className="block w-full pl-6 pr-6 py-5 text-xl md:text-2xl border-2 border-slate-200 rounded-full leading-5 bg-white placeholder-slate-300 focus:outline-none focus:bg-white focus:ring-4 focus:ring-teal-500/20 focus:border-teal-500 transition-all shadow-md text-center font-medium text-slate-700"
                        />
                    </div>
                    <p className="mt-4 text-slate-400 font-medium">Type the symptom above to find the correct triage protocol.</p>
                </div>
            ) : (
                <div className="relative mb-6">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search protocols by name, chief complaint, or keyword..."
                        className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-xl leading-5 bg-white placeholder-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500 sm:text-sm transition-colors shadow-sm"
                    />
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProtocols.map((protocol) => (
                    <div key={protocol._id} className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex flex-col">
                        <h3 className="text-lg font-bold text-slate-900 mb-1">{protocol.name}</h3>
                        <p className="text-sm text-slate-500 mb-4 line-clamp-2">{protocol.description}</p>

                        <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-xs text-slate-400 flex items-center">
                                <Users size={12} className="mr-1" />
                                {protocol.createdBy?.name || 'Unknown'}
                            </span>

                            {user?.role === 'doctor' ? (
                                <div className="flex space-x-1">
                                    <button
                                        onClick={() => window.location.href = `/dashboard/build/${protocol._id}`}
                                        className="text-teal-600 hover:text-teal-800 p-2 hover:bg-teal-50 rounded-full transition-colors"
                                        title="Edit Logic"
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button
                                        onClick={() => deleteProtocol(protocol._id, protocol.name)}
                                        className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-full transition-colors"
                                        title="Delete Protocol"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => window.location.href = `/dashboard/run/${protocol._id}`}
                                    className="text-blue-600 hover:text-blue-800 flex items-center text-sm font-medium px-3 py-1 bg-blue-50 rounded-full hover:bg-blue-100 transition-colors"
                                >
                                    <Play size={14} className="mr-1" /> Run
                                </button>
                            )}
                        </div>
                    </div>
                ))}

                {filteredProtocols.length === 0 && (
                    <div className="col-span-full text-center py-12 text-slate-500 bg-white rounded-lg border border-dashed border-slate-300">
                        {protocols.length === 0 ? "No protocols found. Create one to get started!" : "No protocols match your search query."}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProtocolsList;
