import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';
import { Calendar } from 'react-native-calendars';
import { useIsFocused } from '@react-navigation/native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { fetchLogs } from '../../database/api';

type LogSet = { exerciseName: string; weight: number | null; reps: number | null; completed: boolean };

type Log = {
  id: number;
  date: string;
  templateName: string | null;
  sentiment: string | null;
  sets: LogSet[];
};

type WorkoutLog = {
  id: number;
  date: string;
  template_name: string | null;
  sentiment: string | null;
  exercises: Record<string, { weight: number; reps: number; completed: boolean }[]>;
};

export default function CalendarScreen() {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const isFocused = useIsFocused();

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [allLogs, setAllLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const logs: Log[] = await fetchLogs();
      setAllLogs(logs);
    } catch (err) {
      console.error('Failed to load workout history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFocused) {
      loadLogs();
    }
  }, [isFocused]);

  // Dates with a logged workout, marked with a dot; the selected day's
  // highlight is merged in on every render so tapping a day doesn't need a refetch.
  const markedDates: Record<string, any> = {};
  allLogs.forEach(log => {
    const datePart = log.date.split(' ')[0];
    markedDates[datePart] = { marked: true, dotColor: theme.accent };
  });
  markedDates[selectedDate] = {
    ...markedDates[selectedDate],
    selected: true,
    selectedColor: theme.tint,
  };

  const dayWorkouts: WorkoutLog[] = allLogs
    .filter(log => log.date.split(' ')[0] === selectedDate)
    .map(log => {
      const exercises: Record<string, { weight: number; reps: number; completed: boolean }[]> = {};
      (log.sets || []).forEach(s => {
        if (!exercises[s.exerciseName]) {
          exercises[s.exerciseName] = [];
        }
        exercises[s.exerciseName].push({
          weight: s.weight || 0,
          reps: s.reps || 0,
          completed: !!s.completed,
        });
      });
      return { id: log.id, date: log.date, template_name: log.templateName, sentiment: log.sentiment, exercises };
    });

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} showsVerticalScrollIndicator={false}>
      <Text style={[styles.title, { color: theme.text }]}>Workout History</Text>

      <View style={[styles.calendarContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Calendar
          // react-native-calendars derives its internal stylesheet from the
          // theme prop once and doesn't fully re-derive all of it on a plain
          // prop update -- forcing a remount on theme change is the reliable
          // fix (this is also why navigating away and back "fixes" it: that
          // remounts the component too).
          key={isDark ? 'dark' : 'light'}
          current={selectedDate}
          onDayPress={(day: any) => setSelectedDate(day.dateString)}
          markedDates={markedDates}
          renderArrow={(direction: 'left' | 'right') =>
            direction === 'left'
              ? <ChevronLeft color={theme.text} size={28} />
              : <ChevronRight color={theme.text} size={28} />
          }
          theme={{
            calendarBackground: 'transparent',
            textSectionTitleColor: theme.tabIconDefault,
            selectedDayBackgroundColor: theme.tint,
            selectedDayTextColor: '#ffffff',
            todayTextColor: theme.tint,
            dayTextColor: theme.text,
            textDisabledColor: theme.border,
            // react-native-calendars uses a *separate* key for the leading/trailing
            // days from adjacent months (as opposed to genuinely disabled dates,
            // which this app never has any of) -- this was never set, so it silently
            // fell back to the library's hardcoded default (#d9e1e8), which has
            // ~1.2:1 contrast against the light-mode surface (essentially invisible).
            textInactiveColor: theme.tabIconDefault,
            dotColor: theme.accent,
            selectedDotColor: '#ffffff',
            arrowColor: theme.text,
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
                {workout.template_name || 'Custom Workout'}
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
