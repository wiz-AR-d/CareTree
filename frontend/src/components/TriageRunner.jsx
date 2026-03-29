import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowRight, BrainCircuit } from 'lucide-react';

const TriageRunner = () => {
    const { id: protocolId } = useParams();
    const navigate = useNavigate();

    // State
    const [sessionId, setSessionId] = useState(null);
    const [currentNode, setCurrentNode] = useState(null);
    const [inputValue, setInputValue] = useState('');
    const [isComplete, setIsComplete] = useState(false);
    const [finalResult, setFinalResult] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    // Initialization: Fetch latest protocol active version and start session
    useEffect(() => {
        const initSession = async () => {
            try {
                // 1. Get the active version ID for this protocol
                const { data: protocolData } = await api.get(`/protocols/${protocolId}`);
                if (!protocolData.activeVersion) {
                    setError('This protocol has no active/published version.');
                    setLoading(false);
                    return;
                }

                // 2. Start the Triage Session
                const { data: sessionData } = await api.post('/triage/sessions', {
                    versionId: protocolData.activeVersion._id
                });

                setSessionId(sessionData.session._id);
                setCurrentNode(sessionData.nextNode);
                setLoading(false);
            } catch (err) {
                setError('Failed to initialize triage session.');
                setLoading(false);
            }
        };

        if (protocolId) initSession();
    }, [protocolId]);

    const submitResponse = async (e) => {
        e.preventDefault();
        if (!inputValue.trim()) return;

        setLoading(true);
        setError('');

        try {
            const { data } = await api.post(`/triage/sessions/${sessionId}/respond`, {
                nodeId: currentNode.nodeId,
                responseValue: inputValue
            });

            if (data.isComplete || data.defaultPriorityAssigned) {
                setIsComplete(true);
                setFinalResult(data);
            } else {
                setCurrentNode(data.nextNode);
                setInputValue(''); // Reset input for next node
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to submit response');
        } finally {
            setLoading(false);
        }
    };

    if (loading && !currentNode) {
        return <div className="p-8 flex items-center"><BrainCircuit className="animate-pulse mr-3 text-teal-600" /> Initializing AI Protocols...</div>;
    }

    if (error) {
        return (
            <div className="p-8 max-w-2xl mx-auto">
                <div className="bg-red-50 text-red-700 p-4 rounded-lg flex items-start">
                    <ShieldAlert className="mr-3 mt-1 flex-shrink-0" />
                    <div>
                        <h3 className="font-bold">Initialization Error</h3>
                        <p>{error}</p>
                        <button onClick={() => navigate('/dashboard')} className="mt-4 underline text-sm">Return to Dashboard</button>
                    </div>
                </div>
            </div>
        );
    }

    if (isComplete) {
        const priorityColor =
            finalResult.session.finalPriority === 'Emergency' ? 'bg-red-600' :
                finalResult.session.finalPriority === 'High' ? 'bg-orange-500' :
                    finalResult.session.finalPriority === 'Medium' ? 'bg-yellow-500' : 'bg-green-500';

        return (
            <div className="max-w-2xl mx-auto p-8">
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm text-center p-12">
                    <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center text-white mb-6 shadow-lg ${priorityColor}`}>
                        <ShieldAlert size={48} />
                    </div>
                    <h2 className="text-3xl font-bold text-slate-900 mb-2">Triage Complete</h2>
                    <p className="text-slate-600 mb-8">The Recommended Acuity Level is:</p>
                    <div className={`inline-block px-8 py-3 rounded-full text-white font-bold text-2xl tracking-wider uppercase ${priorityColor}`}>
                        {finalResult.session.finalPriority}
                    </div>

                    <div className="mt-12 text-sm text-slate-500">
                        Total Compute Score: {finalResult.session.totalScore}
                    </div>

                    <button
                        onClick={() => navigate('/dashboard/protocols')}
                        className="mt-8 text-teal-600 hover:text-teal-800 font-medium underline"
                    >
                        Return to Protocol List
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto p-4 sm:p-8">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
                {/* Header */}
                <div className="bg-teal-600 p-6 text-white flex items-center">
                    <BrainCircuit size={28} className="mr-3 opacity-80" />
                    <div>
                        <h2 className="text-xl font-semibold">Active Triage Evaluation</h2>
                        <p className="text-teal-100 text-sm">Follow the system prompts below.</p>
                    </div>
                </div>

                {/* Node Area */}
                <div className="flex-1 p-8 flex flex-col justify-center">
                    <div className="mb-8">
                        <span className="inline-block px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold uppercase tracking-wider mb-4 border border-slate-200">
                            {currentNode?.type} Check
                        </span>
                        <h3 className="text-2xl font-bold text-slate-800 leading-snug">
                            {currentNode?.content}
                        </h3>
                    </div>

                    <form onSubmit={submitResponse} className="mt-auto">
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Assessment Value / Input
                        </label>
                        <div className="flex shadow-sm rounded-md">
                            <input
                                type="text"
                                autoFocus
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="e.g., Yes, No, 38.5, Normal..."
                                className="flex-1 min-w-0 block w-full px-4 py-3 rounded-none rounded-l-md border border-slate-300 focus:ring-teal-500 focus:border-teal-500 text-lg transition-colors"
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                disabled={loading || !inputValue.trim()}
                                className="inline-flex items-center px-6 py-3 border border-transparent border-l-0 text-base font-medium rounded-r-md text-white bg-slate-800 hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-colors disabled:opacity-50"
                            >
                                {loading ? 'Processing...' : (
                                    <>Next <ArrowRight className="ml-2" size={18} /></>
                                )}
                            </button>
                        </div>
                        <p className="mt-3 text-xs text-slate-400">
                            * Input must exactly match configuration logic for MVP (case-insensitive).
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default TriageRunner;
