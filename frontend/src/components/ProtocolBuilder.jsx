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
    Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import api from '../services/api';

const initialNodes = [
    {
        id: 'root',
        type: 'input',
        data: { label: 'Start Triage' },
        position: { x: 250, y: 5 },
    },
];

let id = 0;
const getId = () => `node_${id++}`;

const ProtocolBuilder = () => {
    const { id: protocolId } = useParams();
    const navigate = useNavigate();
    const reactFlowWrapper = useRef(null);
    const [reactFlowInstance, setReactFlowInstance] = useState(null);

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

    // Fetch from backend if no local storage draft exists
    useEffect(() => {
        const fetchProtocol = async () => {
            const stored = localStorage.getItem(localKey);
            if (stored) return; // Prefer local draft

            try {
                const { data } = await api.get(`/protocols/${protocolId}`);
                if (data.activeVersion) {
                    // Convert backend schema to React Flow schema
                    const loadedNodes = data.activeVersion.nodes.map(n => ({
                        id: n.nodeId,
                        type: 'default',
                        position: n.position || { x: Math.random() * 400, y: Math.random() * 400 },
                        data: {
                            label: `${n.type.toUpperCase()}: ${n.content}`,
                            rawType: n.type,
                            content: n.content,
                            scoreValue: n.scoreValue
                        },
                        style: {
                            background: n.type === 'terminal' ? '#fee2e2' : (n.type === 'action' ? '#fef3c7' : '#e0f2fe'),
                            border: '1px solid #cbd5e1',
                            borderRadius: '8px',
                            padding: '10px',
                            width: 200,
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
                }
            } catch (error) {
                console.error("Failed to load existing protocol:", error);
            }
        };
        fetchProtocol();
    }, [protocolId, localKey, setNodes, setEdges]);

    // Auto-save flow state to localStorage whenever nodes or edges change
    useEffect(() => {
        if (reactFlowInstance) {
            const flow = reactFlowInstance.toObject();
            // Only save if we actually have nodes beyond the initial root node
            if (flow.nodes.length > 1 || flow.nodes[0].id !== 'root' || flow.edges.length > 0) {
                localStorage.setItem(localKey, JSON.stringify(flow));
            }
        }
    }, [nodes, edges, reactFlowInstance, localKey]);

    const onConnect = useCallback((params) => {
        // Automatically ask for edge label (the condition like "Yes" or "No")
        const condition = prompt("What is the condition for this branch? (e.g., 'Yes', 'No', '>38', or '*' for default)");
        if (condition) {
            setEdges((eds) => addEdge({ ...params, label: condition, animated: true }, eds));
        } else {
            setEdges((eds) => addEdge(params, eds));
        }
    }, [setEdges]);

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

            // Prompt for the content of the node
            const content = prompt(`Enter content for this ${type} node:`);
            if (!content) return;

            // Prompt for score if question or action
            let scoreValue = 0;
            if (type !== 'terminal') {
                const score = prompt(`Enter score value for this ${type} node (optional, default 0):`, "0");
                scoreValue = parseInt(score) || 0;
            }

            const newNode = {
                id: getId(),
                type: 'default', // Using default ReactFlow nodes for MVP to avoid complexity right now
                position,
                data: { label: `${type.toUpperCase()}: ${content}`, rawType: type, content, scoreValue },
                style: {
                    background: type === 'terminal' ? '#fee2e2' : (type === 'action' ? '#fef3c7' : '#e0f2fe'),
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '10px',
                    width: 200,
                }
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [reactFlowInstance, setNodes],
    );

    const onSave = async () => {
        if (!reactFlowInstance) return;

        // Transform ReactFlow state into CareTree Backend Schema
        const flow = reactFlowInstance.toObject();

        const backendNodes = flow.nodes.map(n => ({
            nodeId: n.id,
            type: n.data.rawType || 'question', // fallback for root
            content: n.data.content || n.data.label,
            scoreValue: n.data.scoreValue || 0,
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
                <button
                    onClick={onSave}
                    className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-md font-medium text-sm shadow-sm"
                >
                    Publish Version
                </button>
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
                            nodes={nodes}
                            edges={edges}
                            onNodesChange={onNodesChange}
                            onEdgesChange={onEdgesChange}
                            onConnect={onConnect}
                            onInit={setReactFlowInstance}
                            onDrop={onDrop}
                            onDragOver={onDragOver}
                            fitView
                        >
                            <Controls />
                            <Background color="#ccc" gap={16} />
                            <Panel position="top-right" className="bg-white/80 p-2 rounded text-xs shadow-sm">
                                Hint: Double-click an edge to remove it. (Basic Implementation)
                            </Panel>
                        </ReactFlow>
                    </ReactFlowProvider>
                </div>
            </div>
        </div>
    );
};

export default ProtocolBuilder;
