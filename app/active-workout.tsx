import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image, Alert } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { getExerciseGif } from '../utils/imageMapper';
import { Colors } from '../constants/Colors';
import { Plus, Save, Trash2, CheckCircle2, Circle, Dumbbell, ArrowLeft } from 'lucide-react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

type LogSet = { weight: string; reps: string; completed: boolean };
type ExerciseEntry = { name: string; sets: LogSet[] };

const SENTIMENTS = [
  { emoji: '😭', label: 'Not Well', value: 1 },
  { emoji: '🙁', label: 'Bad', value: 2 },
  { emoji: '😐', label: 'Average', value: 3 },
  { emoji: '🙂', label: 'Good', value: 4 },
  { emoji: '😆', label: 'Awesome', value: 5 },
];

export default function ActiveWorkoutScreen() {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const db = useSQLiteContext();
  const { templateId } = useLocalSearchParams();

  const [workoutName, setWorkoutName] = useState('Custom Workout');
  const [exercises, setExercises] = useState<ExerciseEntry[]>([
    { name: '', sets: [{ weight: '', reps: '', completed: false }] }
  ]);
  const [sentiment, setSentiment] = useState<number>(3); // Default to Average

  useEffect(() => {
    if (templateId) {
      loadTemplate(Number(templateId));
    }
  }, [templateId]);

  const loadTemplate = async (id: number) => {
    const template = await db.getFirstAsync<{ name: string }>('SELECT name FROM templates WHERE id = ?', id);
    if (template) setWorkoutName(template.name);

    const templateExercises = await db.getAllAsync<any>('SELECT * FROM template_exercises WHERE template_id = ?', id);
    if (templateExercises.length > 0) {
      const mapped = templateExercises.map(te => {
        const sets: LogSet[] = [];
        for (let i = 0; i < te.target_sets; i++) {
          sets.push({ weight: te.target_weight.toString(), reps: te.target_reps, completed: false });
        }
        return { name: te.exercise_name, sets };
      });
      setExercises(mapped);
    }
  };

  const addExercise = () => {
    setExercises([...exercises, { name: '', sets: [{ weight: '', reps: '', completed: false }] }]);
  };

  const removeExercise = (index: number) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const updateExerciseName = (index: number, name: string) => {
    const newEx = [...exercises];
    newEx[index].name = name;
    setExercises(newEx);
  };

  const addSet = (exerciseIndex: number) => {
    const newEx = [...exercises];
    newEx[exerciseIndex].sets.push({ weight: '', reps: '', completed: false });
    setExercises(newEx);
  };

  const updateSet = (exerciseIndex: number, setIndex: number, field: keyof LogSet, value: any) => {
    const newEx = [...exercises];
    // @ts-ignore
    newEx[exerciseIndex].sets[setIndex][field] = value;
    setExercises(newEx);
  };

  const saveWorkout = async () => {
    const dateStr = new Date().toISOString().split('T')[0];
    try {
      const result = await db.runAsync(
        'INSERT INTO logs (date, template_name, sentiment) VALUES (?, ?, ?)', 
        dateStr, workoutName, sentiment.toString()
      );
      const logId = result.lastInsertRowId;

      for (const ex of exercises) {
        for (const set of ex.sets) {
          if (set.completed || set.weight || set.reps) {
            await db.runAsync(
              'INSERT INTO log_sets (log_id, exercise_name, weight, reps, completed) VALUES (?, ?, ?, ?, ?)',
              logId, ex.name, parseFloat(set.weight) || 0, parseInt(set.reps) || 0, set.completed ? 1 : 0
            );
          }
        }
      }
      alert('Workout Saved!');
      router.replace('/(tabs)/log');
    } catch (err) {
      console.error(err);
      alert('Error saving workout');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color={theme.text} size={24} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>Active Workout</Text>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
        <TextInput
          style={[styles.workoutNameInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={workoutName}
          onChangeText={setWorkoutName}
          placeholder="Workout Name"
          placeholderTextColor={theme.tabIconDefault}
        />

        {exercises.map((exercise, exIndex) => (
          <View key={exIndex} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.exHeader}>
              <View style={styles.gifContainer}>
                {getExerciseGif(exercise.name) ? (
                  <Image source={getExerciseGif(exercise.name)} style={styles.gifImage} />
                ) : (
                  <Dumbbell color={theme.tabIconDefault} size={24} />
                )}
              </View>
              <TextInput
                style={[styles.exNameInput, { color: theme.text }]}
                placeholder="Exercise Name"
                placeholderTextColor={theme.tabIconDefault}
                value={exercise.name}
                onChangeText={(val) => updateExerciseName(exIndex, val)}
              />
              <TouchableOpacity onPress={() => removeExercise(exIndex)}>
                <Trash2 color={Colors.dark.tabIconDefault} size={20} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.setHeader}>
              <Text style={[styles.setLabel, { color: theme.text, flex: 1 }]}>Set</Text>
              <Text style={[styles.setLabel, { color: theme.text, flex: 2 }]}>lbs</Text>
              <Text style={[styles.setLabel, { color: theme.text, flex: 2 }]}>Reps</Text>
              <Text style={[styles.setLabel, { color: theme.text, width: 30, textAlign: 'center' }]}>✓</Text>
            </View>

            {exercise.sets.map((set, setIndex) => (
              <View key={setIndex} style={[styles.setRow, set.completed && { opacity: 0.5 }]}>
                <Text style={[styles.setNumber, { color: theme.text, flex: 1 }]}>{setIndex + 1}</Text>
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border, flex: 2, marginRight: 8 }]}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={theme.tabIconDefault}
                  value={set.weight}
                  onChangeText={(val) => updateSet(exIndex, setIndex, 'weight', val)}
                />
                <TextInput
                  style={[styles.input, { color: theme.text, borderColor: theme.border, flex: 2, marginRight: 8 }]}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={theme.tabIconDefault}
                  value={set.reps}
                  onChangeText={(val) => updateSet(exIndex, setIndex, 'reps', val)}
                />
                <TouchableOpacity onPress={() => updateSet(exIndex, setIndex, 'completed', !set.completed)} style={{ width: 30, alignItems: 'center' }}>
                  {set.completed ? <CheckCircle2 color={theme.tint} size={24} /> : <Circle color={theme.border} size={24} />}
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={[styles.addButton, { borderColor: theme.tint }]} onPress={() => addSet(exIndex)}>
              <Plus color={theme.tint} size={16} />
              <Text style={[styles.addText, { color: theme.tint }]}>Add Set</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={[styles.addExButton, { borderColor: theme.text }]} onPress={addExercise}>
          <Plus color={theme.text} size={20} />
          <Text style={[styles.addExText, { color: theme.text }]}>Add Exercise</Text>
        </TouchableOpacity>

        <View style={[styles.sentimentSection, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sentimentTitle, { color: theme.text }]}>How You Feel Today?</Text>
          <View style={styles.sentimentPicker}>
            {SENTIMENTS.map((s) => (
              <TouchableOpacity 
                key={s.value} 
                onPress={() => setSentiment(s.value)} 
                style={[styles.sentimentBtn, sentiment === s.value && { backgroundColor: theme.tint, borderColor: theme.tint }]}
              >
                <Text style={styles.sentimentEmoji}>{s.emoji}</Text>
                <Text style={[styles.sentimentLabel, { color: sentiment === s.value ? '#fff' : theme.tabIconDefault }]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={[styles.saveButton, { backgroundColor: theme.tint }]} onPress={saveWorkout}>
          <Save color="#fff" size={20} />
          <Text style={styles.saveText}>Finish Workout</Text>
        </TouchableOpacity>
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
  backBtn: { marginRight: 16 },
  title: { fontSize: 24, fontWeight: '800' },
  workoutNameInput: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  exHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  gifContainer: { width: 80, height: 80, borderRadius: 12, overflow: 'hidden', backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  gifImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  exNameInput: { fontSize: 18, fontWeight: 'bold', flex: 1, marginRight: 10 },
  setHeader: { flexDirection: 'row', marginBottom: 8, paddingHorizontal: 8 },
  setLabel: { fontSize: 14, fontWeight: 'bold' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  setNumber: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 16 },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, borderWidth: 1, borderRadius: 8, marginTop: 8, borderStyle: 'dashed' },
  addText: { fontSize: 14, fontWeight: 'bold', marginLeft: 8 },
  addExButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderWidth: 2, borderRadius: 12, marginBottom: 20 },
  addExText: { fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  sentimentSection: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 24 },
  sentimentTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  sentimentPicker: { flexDirection: 'row', justifyContent: 'space-between' },
  sentimentBtn: { flex: 1, alignItems: 'center', padding: 8, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  sentimentEmoji: { fontSize: 24, marginBottom: 4 },
  sentimentLabel: { fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, elevation: 5 },
  saveText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
});
