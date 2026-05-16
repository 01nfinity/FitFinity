import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';
import { useSQLiteContext } from 'expo-sqlite';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import { Plus, Dumbbell } from 'lucide-react-native';

type WorkoutHistoryRow = {
  id: number;
  date: string;
  template_name: string;
  sentiment: string | null;
  total_sets: number;
  exercises: string;
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
  const db = useSQLiteContext();
  const isFocused = useIsFocused();

  const [history, setHistory] = useState<WorkoutHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    try {
      const rows = await db.getAllAsync<WorkoutHistoryRow>(`
        SELECT l.id, l.date, l.template_name, l.sentiment, 
               (SELECT COUNT(*) FROM log_sets ls WHERE ls.log_id = l.id) as total_sets,
               (SELECT GROUP_CONCAT(DISTINCT ls.exercise_name) FROM log_sets ls WHERE ls.log_id = l.id) as exercises
        FROM logs l
        ORDER BY l.date DESC, l.id DESC
      `);
      setHistory(rows);
    } catch (err) {
      console.error('Failed to load workout history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      loadHistory();
    }
  }, [isFocused]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Workout Logs</Text>
        <TouchableOpacity 
          style={[styles.newBtn, { backgroundColor: theme.tint }]} 
          onPress={() => router.push('/active-workout')}
        >
          <Plus color="#fff" size={20} />
          <Text style={styles.newBtnText}>New Workout</Text>
        </TouchableOpacity>
      </View>

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
            <Text style={styles.startBtnText}>Start Workout</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScroll}>
          <View>
            {/* Table Header */}
            <View style={[styles.tableRow, styles.tableHeader, { borderBottomColor: theme.border }]}>
              <Text style={[styles.headerCell, { color: theme.text, width: 100 }]}>Date</Text>
              <Text style={[styles.headerCell, { color: theme.text, width: 150 }]}>Routine</Text>
              <Text style={[styles.headerCell, { color: theme.text, width: 250 }]}>Exercises</Text>
              <Text style={[styles.headerCell, { color: theme.text, width: 80, textAlign: 'center' }]}>Sets</Text>
              <Text style={[styles.headerCell, { color: theme.text, width: 80, textAlign: 'center' }]}>Feel</Text>
            </View>

            {/* Table Body */}
            <ScrollView showsVerticalScrollIndicator={false}>
              {history.map((row) => (
                <View 
                  key={row.id} 
                  style={[styles.tableRow, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}
                >
                  <Text style={[styles.cell, { color: theme.text, width: 100 }]}>{row.date}</Text>
                  <Text style={[styles.cell, { color: theme.text, width: 150, fontWeight: 'bold' }]}>
                    {row.template_name}
                  </Text>
                  <Text 
                    style={[styles.cell, { color: theme.tabIconDefault, width: 250 }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {row.exercises ? row.exercises.replace(/,/g, ', ') : 'Custom Exercises'}
                  </Text>
                  <Text style={[styles.cell, { color: theme.text, width: 80, textAlign: 'center' }]}>
                    {row.total_sets}
                  </Text>
                  <Text style={[styles.cell, { width: 80, textAlign: 'center', fontSize: 18 }]}>
                    {row.sentiment && SENTIMENTS[row.sentiment] ? SENTIMENTS[row.sentiment] : '—'}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      )}
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
});
