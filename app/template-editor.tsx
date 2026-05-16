import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useTheme } from '../context/ThemeContext';
import { getExerciseGif } from '../utils/imageMapper';
import { Colors } from '../constants/Colors';
import { Plus, Save, Trash2, ArrowLeft, Dumbbell } from 'lucide-react-native';

type TemplateExercise = {
  id: number | null;
  exercise_name: string;
  target_sets: number;
  target_reps: string;
  target_weight: number;
};

export default function TemplateEditorScreen() {
  const { id } = useLocalSearchParams();
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const db = useSQLiteContext();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadTemplate(Number(id));
    } else {
      setLoading(false);
    }
  }, [id]);

  const loadTemplate = async (templateId: number) => {
    const template = await db.getFirstAsync<{ name: string; description: string }>('SELECT name, description FROM templates WHERE id = ?', templateId);
    if (template) {
      setName(template.name);
      setDescription(template.description);
    }

    const ex = await db.getAllAsync<TemplateExercise>('SELECT * FROM template_exercises WHERE template_id = ? ORDER BY id ASC', templateId);
    setExercises(ex);
    setLoading(false);
  };

  const addExercise = () => {
    setExercises([...exercises, { id: null, exercise_name: '', target_sets: 3, target_reps: '15', target_weight: 0 }]);
  };

  const updateExercise = (index: number, field: keyof TemplateExercise, value: any) => {
    const newEx = [...exercises];
    // @ts-ignore
    newEx[index][field] = value;
    setExercises(newEx);
  };

  const removeExercise = (index: number) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const saveTemplate = async () => {
    if (!name.trim()) {
      alert('Please enter a template name');
      return;
    }

    try {
      if (id) {
        // Update existing template
        await db.runAsync('UPDATE templates SET name = ?, description = ? WHERE id = ?', name, description, id);
        
        // Simple strategy: Delete old exercises and insert new ones
        await db.runAsync('DELETE FROM template_exercises WHERE template_id = ?', id);
        
        for (const ex of exercises) {
          await db.runAsync(
            'INSERT INTO template_exercises (template_id, exercise_name, target_sets, target_reps, target_weight) VALUES (?, ?, ?, ?, ?)',
            id, ex.exercise_name, ex.target_sets, ex.target_reps, ex.target_weight
          );
        }
      } else {
        // Create new template
        const result = await db.runAsync('INSERT INTO templates (name, description) VALUES (?, ?)', name, description);
        const newId = result.lastInsertRowId;
        
        for (const ex of exercises) {
          await db.runAsync(
            'INSERT INTO template_exercises (template_id, exercise_name, target_sets, target_reps, target_weight) VALUES (?, ?, ?, ?, ?)',
            newId, ex.exercise_name, ex.target_sets, ex.target_reps, ex.target_weight
          );
        }
      }
      
      alert('Template saved!');
      router.back();
    } catch (err) {
      console.error(err);
      alert('Failed to save template');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={theme.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color={theme.text} size={24} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>{id ? 'Edit Routine' : 'New Routine'}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.label, { color: theme.text }]}>Routine Name</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Push Day"
            placeholderTextColor={theme.tabIconDefault}
          />
          <Text style={[styles.label, { color: theme.text }]}>Description (Optional)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Focus on chest and triceps"
            placeholderTextColor={theme.tabIconDefault}
          />
        </View>

        <View style={styles.exerciseHeader}>
          <Text style={[styles.subtitle, { color: theme.text }]}>Exercises</Text>
          <TouchableOpacity onPress={addExercise} style={[styles.addExBtn, { backgroundColor: theme.tint }]}>
            <Plus color="#fff" size={16} />
            <Text style={styles.addExText}>Add</Text>
          </TouchableOpacity>
        </View>

        {exercises.map((ex, index) => (
          <View key={index} style={[styles.exCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.exCardHeader}>
              <View style={styles.gifContainer}>
                {getExerciseGif(ex.exercise_name) ? (
                  <Image source={getExerciseGif(ex.exercise_name)} style={styles.gifImage} />
                ) : (
                  <Dumbbell color={theme.tabIconDefault} size={24} />
                )}
              </View>
              <TextInput
                style={[styles.exNameInput, { color: theme.text }]}
                value={ex.exercise_name}
                onChangeText={(val) => updateExercise(index, 'exercise_name', val)}
                placeholder="Exercise Name"
                placeholderTextColor={theme.tabIconDefault}
              />
              <TouchableOpacity onPress={() => removeExercise(index)}>
                <Trash2 color="#ff4444" size={20} />
              </TouchableOpacity>
            </View>

            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={[styles.minilabel, { color: theme.tabIconDefault }]}>Sets</Text>
                <TextInput
                  style={[styles.miniInput, { color: theme.text, borderColor: theme.border }]}
                  value={ex.target_sets.toString()}
                  onChangeText={(val) => updateExercise(index, 'target_sets', parseInt(val) || 0)}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.col}>
                <Text style={[styles.minilabel, { color: theme.tabIconDefault }]}>Reps</Text>
                <TextInput
                  style={[styles.miniInput, { color: theme.text, borderColor: theme.border }]}
                  value={ex.target_reps}
                  onChangeText={(val) => updateExercise(index, 'target_reps', val)}
                />
              </View>
              <View style={styles.col}>
                <Text style={[styles.minilabel, { color: theme.tabIconDefault }]}>Weight (lbs)</Text>
                <TextInput
                  style={[styles.miniInput, { color: theme.text, borderColor: theme.border }]}
                  value={ex.target_weight.toString()}
                  onChangeText={(val) => updateExercise(index, 'target_weight', parseFloat(val) || 0)}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>
        ))}

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.tint }]} onPress={saveTemplate}>
          <Save color="#fff" size={20} />
          <Text style={styles.saveBtnText}>Save Routine</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: { marginRight: 16 },
  title: { fontSize: 24, fontWeight: '800' },
  section: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16 },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  subtitle: { fontSize: 20, fontWeight: '700' },
  addExBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  addExText: { color: '#fff', fontWeight: 'bold', marginLeft: 4 },
  exCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  exCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  gifContainer: { width: 60, height: 60, borderRadius: 10, overflow: 'hidden', backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  gifImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  exNameInput: { fontSize: 16, fontWeight: 'bold', flex: 1, marginRight: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { flex: 1, marginRight: 8 },
  minilabel: { fontSize: 12, marginBottom: 4 },
  miniInput: { borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 14 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, marginTop: 24 },
  saveBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 8 }
});
