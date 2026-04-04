import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useParams, useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowRight, BrainCircuit, Undo2, WifiOff } from 'lucide-react';
import { useSync } from '../hooks/useSync';
import { getLocalProtocolById, addToSyncQueue } from '../services/db';

const TriageRunner = () => {
    const { id: protocolId } = useParams();
    const navigate = useNavigate();

    // State
    const [sessionId, setSessionId] = useState(null);
    const [session, setSession] = useState(null);
    const [currentNode, setCurrentNode] = useState(null);
    const [inputValue, setInputValue] = useState('');
    const [isComplete, setIsComplete] = useState(false);
    const [finalResult, setFinalResult] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    const { isOnline, updatePendingCount } = useSync();

    // --- Front-end offline decision engine exact match from backend ---
    const getNextNodeLocally = (protocol, currentNodeId, responseValue) => {
        const rules = protocol.branchRules.filter((rule) => rule.nodeId === currentNodeId);
        let nextNodeId = null;

        for (const rule of rules) {
            if (String(rule.conditionValue).toLowerCase() === String(responseValue).toLowerCase()) {
                nextNodeId = rule.nextNodeId;
                break;
            }
        }
        if (!nextNodeId) {
            const defaultRule = rules.find((rule) => rule.conditionValue === '*');
            if (defaultRule) nextNodeId = defaultRule.nextNodeId;
        }

        if (!nextNodeId) return null;

        const nextNode = protocol.nodes.find((node) => node.nodeId === nextNodeId) || null;

        // Attach expected Options just like backend
        if (nextNode) {
            const nextRules = protocol.branchRules.filter(r => r.nodeId === nextNode.nodeId);
            nextNode.expectedOptions = nextRules
                .map(r => r.conditionValue)
                .filter(v => v !== '*' && !v.includes('>') && !v.includes('<'));
        }
        return nextNode;
    };
    // ------------------------------------------------------------------

    // Initialization: Fetch latest protocol active version and start session
    useEffect(() => {
        const initSession = async () => {
            try {
                if (isOnline) {
                    const { data: protocolData } = await api.get(`/protocols/${protocolId}`);
                    if (!protocolData.activeVersion) {
                        setError('This protocol has no active/published version.');
                        setLoading(false);
                        return;
                    }
                    const { data: sessionData } = await api.post('/triage/sessions', {
                        versionId: protocolData.activeVersion._id
                    });
                    setSessionId(sessionData.session._id);
                    setSession(sessionData.session);
                    setCurrentNode(sessionData.nextNode);
                } else {
                    // Initialize OFFLINE Session
                    const localProtocol = await getLocalProtocolById(protocolId);
                    if (!localProtocol) {
                        setError('Protocol not found in offline cache. Please reconnect to internet.');
                        setLoading(false); return;
                    }

                    // Create mock session state
                    const mockSession = {
                        _id: 'local_' + Date.now(),
                        protocolId: localProtocol._id,
                        versionId: localProtocol.versionNumber || 'v_local',
                        responses: [],
                        finalPriority: 'Pending',
                        totalScore: 0,
                        offlineStartedAt: new Date().toISOString()
                    };

                    const rootNode = localProtocol.nodes.find(n => n.type !== 'terminal') || localProtocol.nodes[0];
                    if (rootNode) {
                        const nextRules = localProtocol.branchRules.filter(r => r.nodeId === rootNode.nodeId);
                        rootNode.expectedOptions = nextRules
                            .map(r => r.conditionValue)
                            .filter(v => v !== '*' && !v.includes('>') && !v.includes('<'));
                    }

                    setSessionId(mockSession._id);
                    setSession(mockSession);
                    setCurrentNode(rootNode);
                }
            } catch (err) {
                setError('Failed to initialize triage session.');
            } finally {
                setLoading(false);
            }
        };

        if (protocolId) initSession();
    }, [protocolId, isOnline]);

    const isValidInput = (val) => {
        if (!val.trim()) return null;
        if (!currentNode) return false;

        const v = val.trim().toLowerCase();

        // If the node has explicit numeric edges (e.g. >38), or doctor set type to number
        if (currentNode.inputType === 'number') {
            return !isNaN(parseFloat(v)) && isFinite(v);
        }

        // If the node has explicit choices configured via edges
        if (currentNode.expectedOptions && currentNode.expectedOptions.length > 0) {
            return currentNode.expectedOptions.some(opt => opt.toLowerCase() === v);
        }

        // Otherwise fallback to inputType boolean
        if (currentNode.inputType === 'boolean') {
            return v === 'yes' || v === 'no';
        }

        // For text or choice without specific expected options
        return true;
    };

    const submitResponse = async (e) => {
        e.preventDefault();
        if (isValidInput(inputValue) !== true) return;

        setLoading(true);
        setError('');

        try {
            if (isOnline) {
                const { data } = await api.post(`/triage/sessions/${sessionId}/respond`, {
                    nodeId: currentNode.nodeId,
                    responseValue: inputValue
                });

                if (data.isComplete || data.defaultPriorityAssigned) {
                    setIsComplete(true);
                    setFinalResult(data);
                    setSession(data.session);
                } else {
                    setCurrentNode(data.nextNode);
                    setSession(data.session);
                    setInputValue('');
                }
            } else {
                // OFFLINE Execution
                const localProtocol = await getLocalProtocolById(protocolId);

                const scoreApplied = currentNode.scoreValue || 0;
                const newResponses = [...session.responses, {
                    nodeId: currentNode.nodeId,
                    responseValue: inputValue,
                    scoreApplied
                }];
                const newTotalScore = newResponses.reduce((acc, res) => acc + res.scoreApplied, 0);

                const newSessionState = {
                    ...session,
                    responses: newResponses,
                    totalScore: newTotalScore
                };

                const nextNode = getNextNodeLocally(localProtocol, currentNode.nodeId, inputValue);

                if (!nextNode) {
                    // Dead end
                    newSessionState.finalPriority = newTotalScore >= 15 ? 'Emergency' : newTotalScore >= 10 ? 'High' : newTotalScore >= 5 ? 'Medium' : 'Low';
                    setSession(newSessionState);
                    setFinalResult({ session: newSessionState, defaultPriorityAssigned: newSessionState.finalPriority });
                    setIsComplete(true);
                    await addToSyncQueue(newSessionState);
                    updatePendingCount();
                } else if (nextNode.type === 'terminal') {
                    if (['Emergency', 'High', 'Medium', 'Low'].includes(nextNode.content)) {
                        newSessionState.finalPriority = nextNode.content;
                    } else {
                        newSessionState.finalPriority = newTotalScore >= 15 ? 'Emergency' : newTotalScore >= 10 ? 'High' : newTotalScore >= 5 ? 'Medium' : 'Low';
                    }
                    setSession(newSessionState);
                    setFinalResult({ session: newSessionState, terminalNode: nextNode });
                    setIsComplete(true);

                    // Add finished session to Sync Queue since we are offline
                    await addToSyncQueue(newSessionState);
                    updatePendingCount();
                } else {
                    setSession(newSessionState);
                    setCurrentNode(nextNode);
                    setInputValue('');
                }
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to submit response');
        } finally {
            setLoading(false);
        }
    };

    const handleGoBack = async () => {
        if (!session || !session.responses || session.responses.length === 0) return;
        setLoading(true);
        setError('');
        try {
            if (isOnline) {
                const { data } = await api.post(`/triage/sessions/${sessionId}/back`);
                setSession(data.session);
                setCurrentNode(data.nextNode);
                setIsComplete(false);
                setFinalResult(null);
                setInputValue('');
            } else {
                // OFFLINE Undo Logic
                const localProtocol = await getLocalProtocolById(protocolId);
                const newResponses = [...session.responses];
                const lastResponse = newResponses.pop();

                const newScore = newResponses.reduce((acc, res) => acc + res.scoreApplied, 0);

                const newSessionState = {
                    ...session,
                    responses: newResponses,
                    totalScore: newScore,
                    finalPriority: 'Pending'
                };

                const previousNode = localProtocol.nodes.find(n => n.nodeId === lastResponse.nodeId);
                if (previousNode) {
                    const nextRules = localProtocol.branchRules.filter(r => r.nodeId === previousNode.nodeId);
                    previousNode.expectedOptions = nextRules
                        .map(r => r.conditionValue)
                        .filter(v => v !== '*' && !v.includes('>') && !v.includes('<'));
                }

                setSession(newSessionState);
                setCurrentNode(previousNode);
                setIsComplete(false);
                setFinalResult(null);
                setInputValue('');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to go back');
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
        let styleTheme = {};
        switch (finalResult.session.finalPriority) {
            case 'Emergency': styleTheme = { bg: 'from-red-600 to-red-500', icon: 'text-red-600', border: 'border-red-500' }; break;
            case 'High': styleTheme = { bg: 'from-orange-500 to-orange-400', icon: 'text-orange-500', border: 'border-orange-500' }; break;
            case 'Medium': styleTheme = { bg: 'from-yellow-500 to-yellow-400', icon: 'text-yellow-500', border: 'border-yellow-500' }; break;
            default: styleTheme = { bg: 'from-green-500 to-green-400', icon: 'text-green-500', border: 'border-green-500' }; break;
        }

        return (
            <div className="min-h-[calc(100vh-80px)] w-full flex items-center justify-center p-4 sm:p-8 relative">
                {/* Background glow effect based on priority */}
                <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-2xl max-h-2xl rounded-full blur-[120px] opacity-10 bg-gradient-to-r ${styleTheme.bg} pointer-events-none`}></div>

                <div className={`max-w-2xl w-full bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl overflow-hidden flex flex-col items-center justify-center p-16 border-t-[12px] ${styleTheme.border} transition-all duration-700 hover:shadow-3xl transform hover:-translate-y-1`}>
                    <div className="relative mb-10 mt-4 group">
                        <div className={`absolute inset-0 bg-gradient-to-tr ${styleTheme.bg} opacity-20 rounded-full blur-2xl group-hover:blur-3xl transition-all duration-500 animate-pulse`}></div>
                        <div className={`w-36 h-36 relative bg-white border border-slate-100 flex items-center justify-center rounded-[2.5rem] shadow-xl transform rotate-3 transition-transform duration-500 group-hover:rotate-6`}>
                            <ShieldAlert size={72} strokeWidth={1.5} className={styleTheme.icon} />
                        </div>
                    </div>

                    <h2 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-3 tracking-tight text-center">Triage Complete</h2>
                    <p className="text-slate-500 text-lg md:text-xl mb-12 font-medium">System Recommendation Acuity Level</p>

                    <div className={`px-14 py-5 rounded-2xl text-white font-black text-4xl md:text-5xl tracking-widest uppercase shadow-xl bg-gradient-to-r ${styleTheme.bg} transform hover:scale-105 transition-transform duration-300`}>
                        {finalResult.session.finalPriority || "PENDING"}
                    </div>

                    {finalResult.terminalNode?.content && (
                        <div className="mt-12 w-full max-w-lg">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3 pl-2">Doctor's Orders / Next Steps</h3>
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 shadow-sm">
                                <p className="text-lg md:text-xl font-medium text-slate-800 leading-relaxed">
                                    {finalResult.terminalNode.content}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="mt-12 mb-6 bg-slate-100/50 px-8 py-4 rounded-full border border-slate-200 flex items-center space-x-3 backdrop-blur-sm">
                        <BrainCircuit size={20} className="text-slate-400" />
                        <span className="text-sm md:text-base font-semibold text-slate-600 tracking-wide uppercase">Compute Score: <span className="text-slate-900 font-bold ml-2 text-lg">{finalResult.session.totalScore}</span></span>
                    </div>

                    <button
                        onClick={() => navigate('/dashboard/protocols')}
                        className="mt-6 text-slate-500 hover:text-slate-900 font-bold tracking-widest uppercase text-sm border-b-2 border-transparent hover:border-slate-900 transition-colors pb-1 flex items-center group"
                    >
                        <ArrowRight size={18} className="mr-3 rotate-180 transform group-hover:-translate-x-1 transition-transform" /> Return to Dashboard
                    </button>

                    {session?.responses?.length > 0 && (
                        <button
                            onClick={handleGoBack}
                            disabled={loading}
                            className="mt-6 text-teal-600 hover:text-teal-800 font-bold tracking-widest text-sm flex items-center group transition-colors px-6 py-2 bg-teal-50 rounded-full hover:bg-teal-100"
                        >
                            <Undo2 size={16} className="mr-2 transform group-hover:-translate-x-1 transition-transform" /> Re-evaluate Last Answer
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[calc(100vh-80px)] w-full flex items-center justify-center p-4 sm:p-8 relative">
            {/* Ambient Background Glow */}
            <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-3xl max-h-3xl rounded-full blur-[100px] opacity-[0.03] pointer-events-none ${!isOnline ? 'bg-orange-500' : 'bg-teal-500'}`}></div>

            <div className="max-w-3xl w-full bg-white rounded-[2rem] shadow-2xl overflow-hidden flex flex-col min-h-[550px] border border-slate-100 transition-all duration-300 transform relative z-10">
                {/* Header */}
                <div className={`p-8 text-white flex items-center justify-between border-b border-white/10 shadow-lg relative overflow-hidden ${!isOnline ? 'bg-gradient-to-r from-orange-900 via-orange-800 to-orange-900' : 'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900'}`}>
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
                    <div className="flex items-center relative z-10">
                        <div className="bg-white/10 p-3 rounded-2xl mr-4 backdrop-blur-md shadow-sm border border-white/20">
                            {isOnline ? <BrainCircuit size={32} className="text-teal-300" /> : <WifiOff size={32} className="text-orange-300" />}
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight">Active Evaluation</h2>
                            <p className="text-slate-300 text-sm mt-1 font-medium tracking-wide opacity-90"><span className={`w-1.5 h-1.5 rounded-full inline-block mr-2 animate-pulse ${isOnline ? 'bg-teal-400' : 'bg-orange-400'}`}></span>{isOnline ? 'Protocol AI Triage System' : 'Offline Triage Engine'}</p>
                        </div>
                    </div>

                    {session?.responses?.length > 0 && (
                        <button
                            onClick={handleGoBack}
                            disabled={loading}
                            className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg backdrop-blur-md shadow-sm border border-white/20 font-bold text-sm transition-colors relative z-10 disabled:opacity-50"
                        >
                            <Undo2 size={18} /> <span>Go Back</span>
                        </button>
                    )}
                </div>

                {/* Node Area */}
                <div className="flex-1 p-10 md:p-14 flex flex-col justify-center relative bg-slate-50/50">
                    <div className="mb-14">
                        <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold uppercase tracking-widest mb-6 border border-teal-200 shadow-sm transition-all duration-300 cursor-default hover:bg-teal-200">
                            <div className="w-1.5 h-1.5 rounded-full bg-teal-600 mr-2"></div>
                            {currentNode?.type} Check
                        </span>
                        <h3 className="text-6xl md:text-7xl font-extrabold text-slate-800 leading-tight tracking-tight selection:bg-teal-200">
                            {currentNode?.content}
                        </h3>
                    </div>

                    <form onSubmit={submitResponse} className="mt-auto pt-8 border-t border-slate-200/60 mt-8">
                        <label className="block text-sm font-bold text-slate-500 mb-4 uppercase tracking-wider pl-1">
                            Patient Assessment Input
                        </label>
                        <div className="flex shadow-lg rounded-2xl hover:shadow-xl transition-shadow duration-300 group bg-white">
                            <input
                                type="text"
                                autoFocus
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="e.g. Yes, No, 38.5..."
                                className={`flex-1 w-full px-6 py-5 rounded-l-2xl border-y border-l focus:ring-0 focus:outline-none text-2xl md:text-3xl transition-colors ${isValidInput(inputValue) === null
                                    ? 'border-slate-200 bg-white text-slate-800 focus:border-slate-400 placeholder-slate-300'
                                    : isValidInput(inputValue) === true
                                        ? 'border-green-400 bg-green-50 text-green-900 font-medium'
                                        : 'border-red-400 bg-red-50 text-red-900 font-medium'
                                    }`}
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                disabled={loading || isValidInput(inputValue) !== true}
                                className="inline-flex items-center justify-center px-10 border border-transparent text-xl font-bold text-white bg-slate-900 hover:bg-teal-600 focus:outline-none transition-all duration-300 rounded-r-2xl disabled:opacity-50 disabled:bg-slate-300 disabled:cursor-not-allowed group-hover:disabled:bg-slate-300 shadow-inner"
                            >
                                {loading ? 'Processing...' : (
                                    <>Next <ArrowRight className="ml-3" strokeWidth={2.5} size={24} /></>
                                )}
                            </button>
                        </div>
                        {isValidInput(inputValue) === false && (
                            <div className="mt-5 p-3.5 bg-red-50 rounded-xl border border-red-200 inline-flex items-center text-sm text-red-700 font-bold shadow-sm animate-pulse">
                                <ShieldAlert size={18} className="mr-2" strokeWidth={2.5} /> Invalid input. Expected:&nbsp;
                                {currentNode?.inputType === 'number'
                                    ? 'A valid number.'
                                    : currentNode?.expectedOptions?.length > 0
                                        ? `'${currentNode.expectedOptions.join("' or '")}'`
                                        : currentNode?.inputType === 'boolean'
                                            ? "'Yes' or 'No'"
                                            : 'Valid text.'}
                            </div>
                        )}
                        <p className="mt-6 text-xs text-slate-400 font-medium tracking-wide pl-1">
                            <span className="text-teal-500 font-bold mr-1">*</span> Input validates against Protocol Builder rules: {currentNode?.inputType?.toUpperCase() || 'TEXT'}.
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default TriageRunner;
