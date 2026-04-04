import { useState, useEffect } from 'react';
import api from '../services/api';
import { getSyncQueue, clearEntireSyncQueue } from '../services/db';

export const useSync = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isSyncing, setIsSyncing] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);

    const checkPendingCount = async () => {
        try {
            const queue = await getSyncQueue();
            setPendingCount(queue.length);
        } catch (error) {
            console.error("Failed to check sync queue", error);
        }
    };

    const syncPendingSessions = async () => {
        if (!navigator.onLine) return; // double check

        try {
            const queue = await getSyncQueue();
            if (queue.length === 0) return;

            setIsSyncing(true);

            // Group up the offline sessions into one bulk request
            const bulkPayload = queue.map(session => ({
                protocolId: session.protocolId,
                versionId: session.versionId,
                startTime: session.startTime || session.offlineSavedAt,
                endTime: new Date().toISOString(),
                state: session.state,
                responses: session.responses,
                finalPriority: session.finalPriority
            }));

            // Sync with backend
            // Note: The backend route /api/sessions/bulk needs to accept this array.
            await api.post('/sessions/bulk', { sessions: bulkPayload });

            // If sync is completely successful, clear the local queue
            await clearEntireSyncQueue();
            setPendingCount(0);
            console.log(`Successfully synced ${queue.length} sessions to Cloud.`);
        } catch (error) {
            console.error("Failed to sync offline sessions", error);
        } finally {
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        // Initial setup
        checkPendingCount();

        const handleOnline = () => {
            setIsOnline(true);
            syncPendingSessions(); // Automatically try to sync when coming back online
        };

        const handleOffline = () => {
            setIsOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return {
        isOnline,
        isSyncing,
        pendingCount,
        syncNow: syncPendingSessions, // Manual trigger if needed
        updatePendingCount: checkPendingCount // Call this after saving something offline
    };
};
