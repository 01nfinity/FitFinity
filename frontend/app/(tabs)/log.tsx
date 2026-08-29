import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, RefreshControl } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';
import { router } from 'expo-router';
import { Plus, Dumbbell, Trash2, CloudOff } from 'lucide-react-native';
import { fetchLogs, deleteLog, getPendingSyncCount, subscribeSyncStatus, syncNow, getIsOffline } from '../../database/api';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { SyncStatusBanner } from '../../components/SyncStatusBanner';

type WorkoutHistoryRow = {
  id: number;
  date: string;
  template_name: string;
  sentiment: string | null;
  total_sets: number;
  total_weight: number | null;
  exercises: string;
  pendingSync: boolean;
};

const SENTIMENTS: Record<string, string> = {
  '1': '😭',
  '2': '🙁',
  '3': '😐',
  '4': '🙂',
  '5': '😆',
};

export default function HistoryTableScreen() {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;

  const [history, setHistory] = useState<WorkoutHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadHistory = async () => {
    try {
      const logs = await fetchLogs();
      const rows: WorkoutHistoryRow[] = logs.map((l: any) => {
        const completedSets = (l.sets || []).filter((s: any) => s.completed);
        const exerciseNames = Array.from(new Set((l.sets || []).map((s: any) => s.exerciseName)));
        return {
          id: l.id,
          date: l.date,
          template_name: l.templateName || 'Custom Workout',
          sentiment: l.sentiment,
          total_sets: (l.sets || []).length,
          total_weight: completedSets.reduce((sum: number, s: any) => sum + (s.weight || 0), 0),
          exercises: exerciseNames.join(','),
          pendingSync: !!l._pendingSync,
        };
      });
      setHistory(rows);
      setIsOffline(getIsOffline());
    } catch (err) {
      console.error('Failed to load workout history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleDeleteLog = (id: number, name: string) => {
    setDeleteTarget({ id, name });
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadHistory();
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await syncNow();
      loadHistory();
    } finally {
      setSyncing(false);
    }
  };

  useAutoRefresh(loadHistory);

  useEffect(() => {
    getPendingSyncCount().then(setPendingCount);
    return subscribeSyncStatus(() => {
      getPendingSyncCount().then(setPendingCount);
      setIsOffline(getIsOffline());
      loadHistory();
    });
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Workout Logs</Text>
        <TouchableOpacity 
          style={[styles.newBtn, { backgroundColor: theme.tint }]} 
          onPress={() => router.push('/active-workout')}
        >
          <Plus color={theme.onTint} size={20} />
          <Text style={[styles.newBtnText, { color: theme.onTint }]}>New Workout</Text>
        </TouchableOpacity>
      </View>

      <SyncStatusBanner
        theme={theme}
        pendingCount={pendingCount}
        isOffline={isOffline}
        syncing={syncing}
        onSyncNow={handleSyncNow}
      />

      {loading ? (
        <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 40 }} />
      ) : history.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Dumbbell color={theme.tabIconDefault} size={48} />
          <Text style={[styles.emptyText, { color: theme.tabIconDefault }]}>No workouts logged yet.</Text>
          <TouchableOpacity 
            style={[styles.startBtn, { backgroundColor: theme.tint }]}
            onPress={() => router.push('/active-workout')}
          >
            <Text style={[styles.startBtnText, { color: theme.onTint }]}>Start Workout</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScroll}>
          <View>
            {/* Table Header */}
            <View style={[styles.tableRow, styles.tableHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.headerCell, { color: theme.text, width: 90 }]}>Date</Text>
              <Text style={[styles.headerCell, { color: theme.text, width: 130 }]}>Routine</Text>
              <Text style={[styles.headerCell, { color: theme.text, width: 200 }]}>Exercises</Text>
              <Text style={[styles.headerCell, { color: theme.text, width: 60, textAlign: 'center' }]}>Sets</Text>
              <Text style={[styles.headerCell, { color: theme.text, width: 80, textAlign: 'center' }]}>Weight</Text>
              <Text style={[styles.headerCell, { color: theme.text, width: 60, textAlign: 'center' }]}>Feel</Text>
              <Text style={[styles.headerCell, { color: theme.text, width: 60, textAlign: 'center' }]}>Actions</Text>
            </View>

            {/* Table Body */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.tint} />}
            >
              {history.map((row) => (
                <TouchableOpacity 
                  key={row.id} 
                  style={[styles.tableRow, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}
                  onPress={() => router.push({ pathname: '/active-workout', params: { logId: row.id } })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.cell, { color: theme.text, width: 90 }]}>{row.date.split(' ')[0]}</Text>
                  <View style={{ width: 130, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[styles.cell, { color: theme.text, fontWeight: 'bold' }]} numberOfLines={1}>
                      {row.template_name}
                    </Text>
                    {row.pendingSync && <CloudOff color={theme.tabIconDefault} size={12} />}
                  </View>
                  <Text 
                    style={[styles.cell, { color: theme.tabIconDefault, width: 200 }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {row.exercises ? row.exercises.replace(/,/g, ', ') : 'Custom Exercises'}
                  </Text>
                  <Text style={[styles.cell, { color: theme.text, width: 60, textAlign: 'center' }]}>
                    {row.total_sets}
                  </Text>
                  <Text style={[styles.cell, { color: theme.text, width: 80, textAlign: 'center' }]}>
                    {row.total_weight ? `${row.total_weight} lbs` : '0 lbs'}
                  </Text>
                  <Text style={[styles.cell, { width: 60, textAlign: 'center', fontSize: 18 }]}>
                    {row.sentiment && SENTIMENTS[row.sentiment] ? SENTIMENTS[row.sentiment] : '—'}
                  </Text>
                  <TouchableOpacity 
                    style={{ width: 60, alignItems: 'center', justifyContent: 'center' }} 
                    onPress={(e) => {
                      e.stopPropagation();
                      handleDeleteLog(row.id, row.template_name);
                    }}
                  >
                    <Trash2 color="#EF4444" size={18} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      )}
      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteTarget !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setDeleteTarget(null)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={[styles.confirmModalContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.confirmTitle, { color: theme.text }]}>Delete Workout Log</Text>
            <Text style={[styles.confirmMessage, { color: theme.tabIconDefault }]}>
              Are you sure you want to delete the workout log for "{deleteTarget?.name}"? This action cannot be undone.
            </Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={[styles.confirmButton, { borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => setDeleteTarget(null)}
              >
                <Text style={[styles.confirmButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: '#ff4444' }]}
                onPress={async () => {
                  if (deleteTarget) {
                    try {
                      await deleteLog(deleteTarget.id);
                      setDeleteTarget(null);
                      loadHistory();
                    } catch (err) {
                      console.error('Failed to delete workout log:', err);
                      setDeleteTarget(null);
                    }
                  }
                }}
              >
                <Text style={[styles.confirmButtonText, { color: '#ffffff' }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 10 },
  title: { fontSize: 28, fontWeight: '800' },
  newBtn: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, alignItems: 'center' },
  newBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 4 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 16, marginTop: 16, marginBottom: 24 },
  startBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  startBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  tableScroll: { flex: 1 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8 },
  tableHeader: { borderBottomWidth: 2, paddingVertical: 8 },
  headerCell: { fontWeight: 'bold', fontSize: 14 },
  cell: { fontSize: 14 },
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmModalContainer: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 12,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
