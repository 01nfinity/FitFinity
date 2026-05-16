import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, Image } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import { Play, Copy, Plus, Dumbbell, Edit } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getExerciseGif } from '../../utils/imageMapper';

type Template = { id: number; name: string; description: string; exercises?: string[] };

export default function TemplatesScreen() {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const db = useSQLiteContext();
  const [templates, setTemplates] = useState<Template[]>([]);

  const loadTemplates = async () => {
    const result = await db.getAllAsync<Template>('SELECT * FROM templates ORDER BY id ASC');
    const mapped = await Promise.all(result.map(async (t) => {
      const ex = await db.getAllAsync<{ exercise_name: string }>('SELECT exercise_name FROM template_exercises WHERE template_id = ? ORDER BY id ASC', t.id);
      return { ...t, exercises: ex.map(e => e.exercise_name) };
    }));
    setTemplates(mapped);
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const copyTemplate = async (template: Template) => {
    const newName = `${template.name} (Copy)`;
    const result = await db.runAsync('INSERT INTO templates (name, description) VALUES (?, ?)', newName, template.description);
    const newId = result.lastInsertRowId;

    const exercises = await db.getAllAsync<any>('SELECT * FROM template_exercises WHERE template_id = ?', template.id);
    for (const ex of exercises) {
      await db.runAsync(
        'INSERT INTO template_exercises (template_id, exercise_name, target_sets, target_reps, target_weight) VALUES (?, ?, ?, ?, ?)',
        newId, ex.exercise_name, ex.target_sets, ex.target_reps, ex.target_weight
      );
    }
    
    alert(`Copied ${template.name}!`);
    loadTemplates();
  };

  const createNewTemplate = () => {
    router.push('/template-editor');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Workout Routines</Text>
        <TouchableOpacity style={[styles.newBtn, { backgroundColor: theme.tint }]} onPress={createNewTemplate}>
          <Plus color="#fff" size={20} />
          <Text style={styles.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={templates}
        keyExtractor={item => item.id.toString()}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
                {!!item.description && <Text style={[styles.desc, { color: theme.tabIconDefault }]}>{item.description}</Text>}
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => router.push({ pathname: '/template-editor', params: { id: item.id } })}>
                  <Edit color={theme.tabIconDefault} size={20} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => copyTemplate(item)}>
                  <Copy color={theme.tabIconDefault} size={20} />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.playBtn, { backgroundColor: theme.tint }]} 
                  onPress={() => router.push({ pathname: '/active-workout', params: { templateId: item.id } })}
                >
                  <Play color="#fff" size={16} fill="#fff" />
                  <Text style={styles.playText}>Start</Text>
                </TouchableOpacity>
              </View>
            </View>

            {item.exercises && item.exercises.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gifScroll}>
                {item.exercises.map((exName, index) => {
                  const source = getExerciseGif(exName);
                  return (
                    <View key={index} style={[styles.gifContainer, { backgroundColor: theme.border }]}>
                      {source ? (
                        <Image source={source} style={styles.gifImage} />
                      ) : (
                        <Dumbbell color={theme.tabIconDefault} size={24} />
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 10 },
  title: { fontSize: 28, fontWeight: '800' },
  newBtn: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, alignItems: 'center' },
  newBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 4 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 18, fontWeight: 'bold' },
  desc: { fontSize: 14, marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { padding: 8, marginRight: 8 },
  playBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  playText: { color: '#fff', fontWeight: 'bold', marginLeft: 4, fontSize: 14 },
  gifScroll: { marginTop: 12 },
  gifContainer: { width: 80, height: 80, borderRadius: 12, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  gifImage: { width: '100%', height: '100%', resizeMode: 'cover' }
});
