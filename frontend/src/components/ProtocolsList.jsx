import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Plus, Edit2, Play, Users } from 'lucide-react';

const ProtocolsList = () => {
    const [protocols, setProtocols] = useState([]);
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

    if (loading) return <div className="p-8">Loading protocols...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-slate-800">Clinical Protocols</h2>
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {protocols.map((protocol) => (
                    <div key={protocol._id} className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex flex-col">
                        <h3 className="text-lg font-bold text-slate-900 mb-1">{protocol.name}</h3>
                        <p className="text-sm text-slate-500 mb-4 line-clamp-2">{protocol.description}</p>

                        <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-xs text-slate-400 flex items-center">
                                <Users size={12} className="mr-1" />
                                {protocol.createdBy?.name || 'Unknown'}
                            </span>

                            {user?.role === 'doctor' ? (
                                <button
                                    onClick={() => window.location.href = `/dashboard/build/${protocol._id}`}
                                    className="text-teal-600 hover:text-teal-800 p-2 hover:bg-teal-50 rounded-full transition-colors"
                                    title="Edit Logic"
                                >
                                    <Edit2 size={18} />
                                </button>
                            ) : (
                                <button className="text-blue-600 hover:text-blue-800 flex items-center text-sm font-medium px-3 py-1 bg-blue-50 rounded-full hover:bg-blue-100 transition-colors">
                                    <Play size={14} className="mr-1" /> Run
                                </button>
                            )}
                        </div>
                    </div>
                ))}

                {protocols.length === 0 && (
                    <div className="col-span-full text-center py-12 text-slate-500 bg-white rounded-lg border border-dashed border-slate-300">
                        No protocols found. {user?.role === 'doctor' && 'Create one to get started!'}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProtocolsList;
