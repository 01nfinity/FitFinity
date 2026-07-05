import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';
import { Calendar } from 'react-native-calendars';
// import { useSQLiteContext } from 'expo-sqlite';
import { useIsFocused } from '@react-navigation/native';
import { Dumbbell } from 'lucide-react-native';

type SetRow = {
  id: number;
  exercise_name: string;
  weight: number;
  reps: number;
  completed: number;
};

type WorkoutLog = {
  id: number;
  date: string;
  template_name: string;
  sentiment: string | null;
  exercises?: Record<string, { weight: number; reps: number; completed: boolean }[]>;
};

export default function CalendarScreen() {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const db: any = { getAllAsync: async () => [], runAsync: async () => {}, getFirstAsync: async () => null, execAsync: async () => {} };
  const isFocused = useIsFocused();

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [markedDates, setMarkedDates] = useState<Record<string, any>>({});
  const [dayWorkouts, setDayWorkouts] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all unique dates where workouts were performed
  const loadMarkedDates = async () => {
    try {
      const dates = await db.getAllAsync<{ date: string }>('SELECT DISTINCT date FROM logs');
      const marks: Record<string, any> = {};
      
      dates.forEach(d => {
        const datePart = d.date.split(' ')[0];
        marks[datePart] = { marked: true, dotColor: theme.accent };
      });

      // Add selected styling
      if (selectedDate) {
        marks[selectedDate] = {
          ...marks[selectedDate],
          selected: true,
          selectedColor: theme.tint,
        };
      }
      
      setMarkedDates(marks);
    } catch (err) {
      console.error('Failed to load marked calendar dates:', err);
    }
  };

  // Load exercises logged for the selected date
  const loadDayWorkouts = async (date: string) => {
    setLoading(true);
    try {
      const logs = await db.getAllAsync<WorkoutLog>('SELECT * FROM logs WHERE substr(date, 1, 10) = ?', date);
      
      const enrichedLogs = await Promise.all(logs.map(async (log) => {
        const sets = await db.getAllAsync<SetRow>(
          'SELECT * FROM log_sets WHERE log_id = ? ORDER BY id ASC', 
          log.id
        );
        
        // Group sets by exercise name
        const exercises: Record<string, { weight: number; reps: number; completed: boolean }[]> = {};
        sets.forEach(s => {
          if (!exercises[s.exercise_name]) {
            exercises[s.exercise_name] = [];
          }
          exercises[s.exercise_name].push({
            weight: s.weight,
            reps: s.reps,
            completed: s.completed === 1,
          });
        });

        return { ...log, exercises };
      }));

      setDayWorkouts(enrichedLogs);
    } catch (err) {
      console.error('Failed to load workouts for day:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      loadMarkedDates();
      loadDayWorkouts(selectedDate);
    }
  }, [isFocused, selectedDate]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
      <Text style={[styles.title, { color: theme.text }]}>Workout History</Text>

      <View style={[styles.calendarContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Calendar
          current={selectedDate}
          onDayPress={(day: any) => setSelectedDate(day.dateString)}
          markedDates={markedDates}
          theme={{
            calendarBackground: 'transparent',
            textSectionTitleColor: theme.tabIconDefault,
            selectedDayBackgroundColor: theme.tint,
            selectedDayTextColor: '#ffffff',
            todayTextColor: theme.tint,
            dayTextColor: theme.text,
            textDisabledColor: theme.border,
            dotColor: theme.accent,
            selectedDotColor: '#ffffff',
            arrowColor: theme.tint,
            monthTextColor: theme.text,
            textDayFontWeight: '500',
            textMonthFontWeight: 'bold',
            textDayHeaderFontWeight: '600',
          }}
        />
      </View>

      <View style={[styles.logList, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.listTitle, { color: theme.text }]}>
          {selectedDate ? `Activities for ${selectedDate}` : 'Select a date'}
        </Text>
        
        {loading ? (
          <ActivityIndicator size="small" color={theme.tint} style={{ marginTop: 20 }} />
        ) : dayWorkouts.length === 0 ? (
          <Text style={{ color: theme.tabIconDefault, marginTop: 10 }}>No workout logged on this date.</Text>
        ) : (
          dayWorkouts.map((workout, idx) => (
            <View key={workout.id} style={[styles.workoutCard, idx < dayWorkouts.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
              <Text style={[styles.workoutName, { color: theme.text }]}>
                {workout.template_name}
              </Text>
              
              {(() => {
                const workoutTotalWeight = workout.exercises 
                  ? Object.values(workout.exercises).reduce((total, sets) => {
                      return total + sets.reduce((sum, s) => s.completed ? sum + s.weight : sum, 0);
                    }, 0)
                  : 0;
                return (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 4 }}>
                    {workout.sentiment ? (
                      <Text style={[styles.sentimentText, { color: theme.tabIconDefault, marginBottom: 0 }]}>
                        Feel: {{ '1': '😭 Not Well', '2': '🙁 Bad', '3': '😐 Average', '4': '🙂 Good', '5': '😆 Awesome' }[workout.sentiment] || '—'}
                      </Text>
                    ) : <View />}
                    <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 14 }}>
                      Completed Load: {workoutTotalWeight} lbs
                    </Text>
                  </View>
                );
              })()}

              {workout.exercises && Object.keys(workout.exercises).map((exName) => (
                <View key={exName} style={styles.exerciseRow}>
                  <Text style={[styles.exerciseName, { color: theme.text }]}>
                    • {exName}
                  </Text>
                  <View style={styles.setsList}>
                    {workout.exercises![exName].map((set, sIdx) => (
                      <Text key={sIdx} style={[styles.setText, { color: theme.tabIconDefault }]}>
                        Set {sIdx + 1}: {set.weight} lbs × {set.reps} reps {set.completed ? '✓' : ''}
                      </Text>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 20,
    marginTop: 10,
  },
  calendarContainer: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 10,
  },
  logList: {
    marginTop: 20,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  workoutCard: {
    paddingVertical: 16,
  },
  workoutName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  sentimentText: {
    fontSize: 14,
    marginBottom: 12,
  },
  exerciseRow: {
    marginTop: 8,
    paddingLeft: 4,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  setsList: {
    paddingLeft: 16,
  },
  setText: {
    fontSize: 13,
    marginBottom: 2,
  }
});
