import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ReactFlow,
    ReactFlowProvider,
    addEdge,
    useNodesState,
    useEdgesState,
    Controls,
    Background,
    Panel,
    Handle,
    Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import api from '../services/api';
import { Pencil, Trash2, Undo2, Redo2, RefreshCcw, Eraser } from 'lucide-react';

const CustomNode = ({ data, id }) => {
    return (
        <div style={{ ...data.style }} className="relative group">
            <Handle type="target" position={Position.Top} className="w-3 h-3 bg-slate-400" />

            <div className="flex justify-between items-start">
                <div className="font-semibold text-sm mb-1">{data.rawType.toUpperCase()}</div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (data.onEdit) data.onEdit(id, data);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-black/10 rounded"
                    title="Edit Node"
                >
                    <Pencil size={14} className="text-slate-600" />
                </button>
            </div>

            <div className="text-sm text-slate-700">{data.content}</div>

            {data.scoreValue !== undefined && data.scoreValue !== 0 && (
                <div className="text-xs text-slate-500 mt-2 font-medium">Score: {data.scoreValue}</div>
            )}

            <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-slate-400" />
        </div>
    );
};

const nodeTypes = { custom: CustomNode };

const initialNodes = [];


const getId = () => `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

const ProtocolBuilder = () => {
    const { id: protocolId } = useParams();
    const navigate = useNavigate();
    const reactFlowWrapper = useRef(null);
    const [reactFlowInstance, setReactFlowInstance] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const [nodeModal, setNodeModal] = useState({ isOpen: false, mode: 'add', type: '', position: null, id: null, data: {} });

    // History States for Undo/Redo
    const [past, setPast] = useState([]);
    const [future, setFuture] = useState([]);

    // Initialize state from localStorage if it exists for this protocol
    const localKey = `caretree_protocol_${protocolId}`;
    const getInitialNodes = () => {
        const stored = localStorage.getItem(localKey);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.nodes && parsed.nodes.length > 0) return parsed.nodes;
        }
        return initialNodes;
    };

    const getInitialEdges = () => {
        const stored = localStorage.getItem(localKey);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.edges) return parsed.edges;
        }
        return [];
    };

    const [nodes, setNodes, onNodesChange] = useNodesState(getInitialNodes());
    const [edges, setEdges, onEdgesChange] = useEdgesState(getInitialEdges());

    // Track nodes with no incoming edges (potential roots) for live visual feedback
    const [orphanIds, setOrphanIds] = useState(new Set());

    useEffect(() => {
        const targetNodeIds = new Set(edges.map(e => e.target));
        const candidates = nodes.filter(n => !targetNodeIds.has(n.id));
        // Only flag as errors when there is more than 1 root candidate
        if (candidates.length > 1) {
            setOrphanIds(new Set(candidates.map(n => n.id)));
        } else {
            setOrphanIds(new Set()); // 0 or 1 root is fine
        }
    }, [nodes, edges]);

    const fetchProtocol = useCallback(async (forceBackend = false) => {
        const stored = localStorage.getItem(localKey);
        if (stored && !forceBackend) return; // Prefer local draft unless forced

        try {
            const { data } = await api.get(`/protocols/${protocolId}`);
            if (data.activeVersion) {
                // Convert backend schema to React Flow schema
                const loadedNodes = data.activeVersion.nodes.map(n => ({
                    id: n.nodeId,
                    type: 'custom',
                    position: n.position || { x: Math.random() * 400, y: Math.random() * 400 },
                    data: {
                        label: `${n.type.toUpperCase()}: ${n.content}`,
                        rawType: n.type,
                        content: n.content,
                        scoreValue: n.scoreValue,
                        inputType: n.inputType || 'text',
                        onEdit: handleEditNode,
                        style: {
                            background: n.type === 'terminal' ? '#fee2e2' : (n.type === 'action' ? '#fef3c7' : '#e0f2fe'),
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            padding: '10px',
                            width: 200,
                        }
                    }
                }));

                const loadedEdges = data.activeVersion.branchRules.map(r => ({
                    id: `e-${r.nodeId}-${r.nextNodeId}`,
                    source: r.nodeId,
                    target: r.nextNodeId,
                    label: r.conditionValue,
                    animated: true
                }));

                if (loadedNodes.length > 0) {
                    setNodes(loadedNodes);
                    setEdges(loadedEdges);
                }
            } else if (forceBackend) {
                // No published version — reset to blank canvas
                setNodes([]);
                setEdges([]);
            }
        } catch (error) {
            console.error("Failed to load existing protocol:", error);
        }
    }, [protocolId, localKey, setNodes, setEdges]);

    // Fetch from backend if no local storage draft exists
    useEffect(() => {
        fetchProtocol();
    }, [fetchProtocol]);

    // Auto-save flow state to localStorage whenever nodes or edges change
    useEffect(() => {
        if (reactFlowInstance) {
            const flow = reactFlowInstance.toObject();
            if (flow.nodes.length > 1 || flow.nodes[0]?.id !== 'root' || flow.edges.length > 0) {
                // Remove non-serializable functions before saving
                const safeFlow = {
                    ...flow,
                    nodes: flow.nodes.map(n => ({
                        ...n,
                        data: { ...n.data, onEdit: undefined }
                    }))
                };
                localStorage.setItem(localKey, JSON.stringify(safeFlow));
            }
        }
    }, [nodes, edges, reactFlowInstance, localKey]);

    const takeSnapshot = useCallback(() => {
        if (!reactFlowInstance) return;
        const flow = reactFlowInstance.toObject();
        // Remove non-serializable properties
        const safeNodes = flow.nodes.map(n => ({ ...n, data: { ...n.data, onEdit: undefined } }));
        setPast(p => [...p, { nodes: safeNodes, edges: flow.edges }]);
        setFuture([]); // Clear future on new action
    }, [reactFlowInstance]);

    const undo = useCallback(() => {
        if (past.length === 0 || !reactFlowInstance) return;
        const currentFlow = reactFlowInstance.toObject();
        const safeNodes = currentFlow.nodes.map(n => ({ ...n, data: { ...n.data, onEdit: undefined } }));

        const previousState = past[past.length - 1];
        setPast(p => p.slice(0, p.length - 1));
        setFuture(f => [{ nodes: safeNodes, edges: currentFlow.edges }, ...f]);

        setNodes(previousState.nodes);
        setEdges(previousState.edges);
    }, [past, reactFlowInstance, setNodes, setEdges]);

    const redo = useCallback(() => {
        if (future.length === 0 || !reactFlowInstance) return;
        const currentFlow = reactFlowInstance.toObject();
        const safeNodes = currentFlow.nodes.map(n => ({ ...n, data: { ...n.data, onEdit: undefined } }));

        const nextState = future[0];
        setFuture(f => f.slice(1));
        setPast(p => [...p, { nodes: safeNodes, edges: currentFlow.edges }]);

        setNodes(nextState.nodes);
        setEdges(nextState.edges);
    }, [future, reactFlowInstance, setNodes, setEdges]);

    // Keyboard Shortcuts for Undo/Redo
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
                e.preventDefault();
                redo();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);

    const handleEditNode = useCallback((nodeId, nodeData) => {
        setNodeModal({
            isOpen: true,
            mode: 'edit',
            type: nodeData.rawType || 'start',
            position: null,
            id: nodeId,
            data: {
                content: nodeData.content || '',
                scoreValue: nodeData.scoreValue || 0,
                inputType: nodeData.inputType || 'text'
            }
        });
        setContextMenu(null);
    }, [setNodeModal]);

    const saveNodeModal = (formData) => {
        takeSnapshot();
        if (nodeModal.mode === 'add') {
            const newNode = {
                id: nodeModal.id,
                type: 'custom',
                position: nodeModal.position,
                data: {
                    label: `${nodeModal.type.toUpperCase()}: ${formData.content}`,
                    rawType: nodeModal.type,
                    content: formData.content,
                    scoreValue: formData.scoreValue,
                    inputType: formData.inputType,
                    onEdit: handleEditNode,
                    style: {
                        background: nodeModal.type === 'terminal' ? '#fee2e2' : (nodeModal.type === 'action' ? '#fef3c7' : '#e0f2fe'),
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        padding: '10px',
                        width: 200,
                    }
                },
            };
            setNodes((nds) => nds.concat(newNode));
        } else if (nodeModal.mode === 'edit') {
            setNodes((nds) =>
                nds.map((node) => {
                    if (node.id === nodeModal.id) {
                        const isRoot = node.id === 'root';
                        node.data = {
                            ...node.data,
                            content: formData.content,
                            label: `${nodeModal.type.toUpperCase()}: ${formData.content}`,
                            scoreValue: formData.scoreValue,
                            inputType: formData.inputType,
                            // Keep the root node's green style intact
                            style: isRoot ? {
                                background: '#ffffff',
                                border: '2px solid #0f172a',
                                borderRadius: '8px',
                                padding: '10px',
                                width: 200,
                            } : node.data.style
                        };
                    }
                    return node;
                })
            );
        }
        setNodeModal({ isOpen: false, mode: 'add', type: '', position: null, id: null, data: {} });
    };

    const handleDeleteNode = useCallback((nodeId) => {
        takeSnapshot();
        setNodes((nds) => nds.filter((node) => node.id !== nodeId));
        setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
        setContextMenu(null);
    }, [setNodes, setEdges, takeSnapshot]);

    const onNodeContextMenu = useCallback((event, node) => {
        event.preventDefault();
        setContextMenu({
            id: node.id,
            data: node.data,
            top: event.clientY,
            left: event.clientX,
        });
    }, [setContextMenu]);

    const onPaneClick = useCallback(() => setContextMenu(null), [setContextMenu]);

    const handleEraseAll = useCallback(() => {
        if (window.confirm("Are you sure you want to clear the entire canvas? This cannot be fully undone if you refresh.")) {
            takeSnapshot();
            setNodes([]);
            setEdges([]);
        }
    }, [takeSnapshot, setNodes, setEdges]);

    const handleResetToPublished = useCallback(() => {
        if (window.confirm("Are you sure you want to reset to the last published version? All unsaved changes will be lost.")) {
            takeSnapshot();
            localStorage.removeItem(localKey);
            fetchProtocol(true);
        }
    }, [takeSnapshot, localKey, fetchProtocol]);

    const onConnect = useCallback((params) => {
        // Automatically ask for edge label (the condition like "Yes" or "No")
        const condition = prompt("What is the condition for this branch? (e.g., 'Yes', 'No', '>38', or '*' for default)");
        takeSnapshot();
        if (condition) {
            setEdges((eds) => addEdge({ ...params, label: condition, animated: true }, eds));
        } else {
            setEdges((eds) => addEdge(params, eds));
        }
    }, [setEdges, takeSnapshot]);

    const onEdgeDoubleClick = useCallback((event, edge) => {
        event.stopPropagation();

        const action = prompt(
            `Editing edge from "${edge.source}" to "${edge.target}".\n\nCurrent condition: "${edge.label}"\n\nEnter new condition value, or type DELETE to remove this connection entirely:`,
            edge.label || ''
        );

        if (action === null) return; // Cancelled

        takeSnapshot();

        if (action === 'DELETE') {
            setEdges((eds) => eds.filter(e => e.id !== edge.id));
        } else if (action.trim() !== '') {
            setEdges((eds) => eds.map(e => {
                if (e.id === edge.id) {
                    return { ...e, label: action.trim() };
                }
                return e;
            }));
        }
    }, [setEdges, takeSnapshot]);

    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event) => {
            event.preventDefault();

            const type = event.dataTransfer.getData('application/reactflow');
            if (typeof type === 'undefined' || !type) {
                return;
            }

            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            setNodeModal({
                isOpen: true,
                mode: 'add',
                type,
                position,
                id: getId(),
                data: { content: '', scoreValue: 0, inputType: 'text' }
            });
        },
        [reactFlowInstance],
    );

    const onSave = async () => {
        if (!reactFlowInstance) return;

        const flow = reactFlowInstance.toObject();

        if (flow.nodes.length === 0) {
            alert('Your canvas is empty. Drag at least one node onto the canvas before publishing.');
            return;
        }

        // Auto-detect the starting node: the one with NO incoming edges
        const targetNodeIds = new Set(flow.edges.map(e => e.target));
        const rootCandidates = flow.nodes.filter(n => !targetNodeIds.has(n.id));

        if (rootCandidates.length === 0) {
            alert('Cannot detect a starting node. Make sure at least one node has no incoming connections (i.e., it is the entry point of the flowchart).');
            return;
        }

        if (rootCandidates.length > 1) {
            alert(`Error: ${rootCandidates.length} nodes have no incoming connections (highlighted in red on the canvas). A valid protocol must have exactly ONE starting node. Please connect the extra floating nodes before publishing.`);
            return;
        }

        // Put root first so the backend picks it as the starting node
        const rootNode = rootCandidates[0];
        const orderedNodes = [rootNode, ...flow.nodes.filter(n => n.id !== rootNode.id)];

        const backendNodes = orderedNodes.map(n => ({
            nodeId: n.id,
            type: n.data.rawType || 'question',
            content: n.data.content || n.data.label,
            scoreValue: n.data.scoreValue || 0,
            inputType: n.data.inputType || 'text',
            position: n.position
        }));

        const backendRules = flow.edges.map(e => ({
            nodeId: e.source,
            conditionValue: e.label || '*',
            nextNodeId: e.target
        }));

        try {
            await api.post(`/protocols/${protocolId}/versions`, {
                nodes: backendNodes,
                branchRules: backendRules
            });
            alert('Protocol Version Published Successfully!');
            navigate('/dashboard/protocols');
        } catch (error) {
            console.error(error);
            alert('Failed to publish protocol');
        }
    };


    return (
        <div className="flex flex-col h-[800px] border border-slate-200 rounded-lg overflow-hidden bg-white">
            <div className="bg-slate-100 p-4 border-b border-slate-200 flex justify-between items-center">
                <div>
                    <h2 className="font-bold text-slate-800">Protocol Builder</h2>
                    <p className="text-xs text-slate-500">Drag nodes from the sidebar onto the canvas and connect them.</p>
                </div>
                <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-1 bg-white border border-slate-200 rounded-md p-1 shadow-sm mr-2">
                        <button
                            onClick={undo}
                            disabled={past.length === 0}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-30 transition-colors"
                            title="Undo (Ctrl+Z)"
                        >
                            <Undo2 size={16} />
                        </button>
                        <button
                            onClick={redo}
                            disabled={future.length === 0}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-30 transition-colors"
                            title="Redo (Ctrl+Shift+Z)"
                        >
                            <Redo2 size={16} />
                        </button>
                    </div>

                    <div className="flex items-center space-x-1 border-r border-slate-300 pr-3 mr-3">
                        <button
                            onClick={handleEraseAll}
                            className="flex items-center space-x-1 bg-white border border-slate-200 hover:bg-red-50 text-slate-600 hover:text-red-600 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm transition-colors"
                            title="Clear Canvas"
                        >
                            <Eraser size={14} /> <span>Erase All</span>
                        </button>
                        <button
                            onClick={handleResetToPublished}
                            className="flex items-center space-x-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-md text-sm font-medium shadow-sm transition-colors"
                            title="Discard unsaved changes and reload"
                        >
                            <RefreshCcw size={14} /> <span>Reset</span>
                        </button>
                    </div>

                    <button
                        onClick={onSave}
                        className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-md font-medium text-sm shadow-sm transition-colors"
                    >
                        Publish Version
                    </button>
                </div>
            </div>

            <div className="flex flex-1">
                {/* Sidebar */}
                <aside className="w-80 bg-slate-50 border-r border-slate-200 shadow-inner flex flex-col h-full overflow-y-auto">
                    <div className="p-4 flex-shrink-0">
                        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Node Types</h3>
                        <div className="space-y-3">
                            <div
                                className="bg-blue-100 border border-blue-300 p-3 rounded-md cursor-grab text-blue-800 text-sm font-medium shadow-sm"
                                onDragStart={(event) => {
                                    event.dataTransfer.setData('application/reactflow', 'question');
                                    event.dataTransfer.effectAllowed = 'move';
                                }}
                                draggable
                            >
                                Question Node
                            </div>
                            <div
                                className="bg-yellow-100 border border-yellow-300 p-3 rounded-md cursor-grab text-yellow-800 text-sm font-medium shadow-sm"
                                onDragStart={(event) => {
                                    event.dataTransfer.setData('application/reactflow', 'action');
                                    event.dataTransfer.effectAllowed = 'move';
                                }}
                                draggable
                            >
                                Action Node
                            </div>
                            <div
                                className="bg-red-100 border border-red-300 p-3 rounded-md cursor-grab text-red-800 text-sm font-medium shadow-sm"
                                onDragStart={(event) => {
                                    event.dataTransfer.setData('application/reactflow', 'terminal');
                                    event.dataTransfer.effectAllowed = 'move';
                                }}
                                draggable
                            >
                                Terminal (Priority)
                            </div>
                        </div>
                    </div>

                    <div className="mt-auto p-4 bg-teal-50 border-t border-teal-100 text-teal-900 border-x-0 border-b-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] flex-shrink-0">
                        <h4 className="font-bold text-sm mb-2 flex items-center">
                            <span className="bg-teal-200 text-teal-800 w-5 h-5 rounded-full inline-flex items-center justify-center text-xs mr-2">i</span>
                            Builder Guide
                        </h4>
                        <ul className="text-xs space-y-2 text-teal-800/80 list-disc pl-4">
                            <li><strong>Drag & Drop:</strong> Drag nodes from above onto the canvas.</li>
                            <li><strong>Connect:</strong> Click and drag from a node's handle to another to create a rule.</li>
                            <li><strong>Condition Values:</strong> When connecting, enter the exact expected response (e.g., "Yes", "No"). Use <code>*</code> for a default 'catch-all' branch.</li>
                            <li><strong>Scoring:</strong> Assign scores to nodes. The engine totals these up as the nurse progresses.</li>
                            <li><strong>Terminals:</strong> Every branch must eventually end in a Red Terminal node (e.g., "Emergency", "Medium") which is given to the nurse as the final acuity.</li>
                        </ul>
                    </div>
                </aside>

                {/* Canvas */}
                <div className="flex-1 h-full" ref={reactFlowWrapper}>
                    <ReactFlowProvider>
                        <ReactFlow
                            nodes={nodes.map(n => {
                                // Attach the onEdit handler if missing
                                let updatedNode = n.type === 'custom' && n.data && !n.data.onEdit
                                    ? { ...n, data: { ...n.data, onEdit: handleEditNode } }
                                    : n;

                                // Inject red error style for orphan nodes (multiple roots)
                                if (orphanIds.has(n.id)) {
                                    updatedNode = {
                                        ...updatedNode,
                                        data: {
                                            ...updatedNode.data,
                                            style: {
                                                ...updatedNode.data.style,
                                                border: '2.5px solid #ef4444',
                                                background: '#fff1f2',
                                                boxShadow: '0 0 0 3px rgba(239,68,68,0.25)',
                                            }
                                        }
                                    };
                                }

                                return updatedNode;
                            })}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onInit={setReactFlowInstance}
                            onDrop={onDrop}
                            onDragOver={onDragOver}
                            onNodeDragStart={takeSnapshot}
                            onNodesDelete={takeSnapshot}
                            onEdgesDelete={takeSnapshot}
                            onNodeContextMenu={onNodeContextMenu}
                            onEdgeDoubleClick={onEdgeDoubleClick}
                            onPaneClick={onPaneClick}
                            nodeTypes={nodeTypes}
                            fitView
                        >
                            <Controls />
                            <Background color="#ccc" gap={16} />
                            <Panel position="top-right" className="bg-white/80 p-2 rounded text-xs shadow-sm">
                                Hint: Double-click an edge (dashed line) to edit its condition value or delete it. Select an edge and hit Backspace/Delete to quickly remove it.
                            </Panel>
                        </ReactFlow>
                    </ReactFlowProvider>

                    {/* Context Menu for right-click on node */}
                    {contextMenu && (
                        <div
                            style={{ top: contextMenu.top, left: contextMenu.left }}
                            className="fixed z-50 bg-white border border-slate-200 shadow-xl rounded-lg py-1 w-48 overflow-hidden"
                            onMouseLeave={() => setContextMenu(null)}
                        >
                            <button
                                onClick={() => handleEditNode(contextMenu.id, contextMenu.data)}
                                className="w-full text-left px-4 py-2 hover:bg-slate-100 text-sm text-slate-700 flex items-center"
                            >
                                <Pencil size={14} className="mr-2 text-slate-500" /> Edit Node & Score
                            </button>
                            {contextMenu.id !== 'root' && (
                                <button
                                    onClick={() => handleDeleteNode(contextMenu.id)}
                                    className="w-full text-left px-4 py-2 hover:bg-red-50 text-sm text-red-600 flex items-center"
                                >
                                    <Trash2 size={14} className="mr-2" /> Delete Node
                                </button>
                            )}
                        </div>
                    )}

                    {/* Node Modal */}
                    {nodeModal.isOpen && (
                        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
                            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    const fd = new FormData(e.target);
                                    saveNodeModal({
                                        content: fd.get('content'),
                                        scoreValue: parseInt(fd.get('scoreValue')) || 0,
                                        inputType: fd.get('inputType') || 'text'
                                    });
                                }}>
                                    <div className="px-6 py-5 border-b border-slate-100 bg-slate-50">
                                        <h3 className="text-xl font-bold text-slate-800">
                                            {nodeModal.mode === 'add' ? 'Create New' : 'Edit'}{' '}
                                            {nodeModal.type === 'start' ? '🟢 Start Triage Node' : nodeModal.type.charAt(0).toUpperCase() + nodeModal.type.slice(1) + ' Node'}
                                        </h3>
                                        <p className="text-sm text-slate-500 mt-1">
                                            {nodeModal.type === 'start'
                                                ? 'Edit the label shown at the beginning of this triage protocol.'
                                                : "Configure the node's content and patient input requirements."}
                                        </p>
                                    </div>
                                    <div className="p-6 space-y-5 flex-1">
                                        <div>
                                            <label className="block text-sm font-bold text-slate-700 mb-1.5">
                                                {nodeModal.type === 'terminal' ? "Doctor's Final Note / Next Steps" : "Question / Action Text"}
                                            </label>
                                            <textarea
                                                name="content"
                                                defaultValue={nodeModal.data.content}
                                                required
                                                rows={3}
                                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
                                                placeholder={nodeModal.type === 'terminal' ? "e.g., ADMIT TO ER IMMEDIATELY" : "e.g., Check patient's temperature"}
                                            />
                                        </div>

                                        {nodeModal.type !== 'terminal' && (
                                            <>
                                                <div>
                                                    <label className="block text-sm font-bold text-slate-700 mb-1.5 border-t pt-4 border-slate-100">Expected Input Type</label>
                                                    <select
                                                        name="inputType"
                                                        defaultValue={nodeModal.data.inputType || 'text'}
                                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors bg-white"
                                                    >
                                                        <option value="text">Any Text (Default)</option>
                                                        <option value="number">Number (e.g. 38.5)</option>
                                                        <option value="boolean">Yes or No Only</option>
                                                        <option value="choice">Exact Edge Matches Only (Multiple Choice)</option>
                                                    </select>
                                                    <p className="text-xs text-slate-500 mt-1">Nurses will face a red warning if they input the wrong type of answer.</p>
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-bold text-slate-700 mb-1.5 border-t pt-4 border-slate-100">Score Value (Optional)</label>
                                                    <input
                                                        name="scoreValue"
                                                        type="number"
                                                        defaultValue={nodeModal.data.scoreValue || 0}
                                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end space-x-3">
                                        <button
                                            type="button"
                                            onClick={() => setNodeModal({ isOpen: false, mode: 'add', type: '', position: null, id: null, data: {} })}
                                            className="px-4 py-2 font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-4 py-2 font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-sm transition-colors"
                                        >
                                            Save Node
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProtocolBuilder;
