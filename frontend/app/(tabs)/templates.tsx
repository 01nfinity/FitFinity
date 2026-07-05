import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, Image, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/Colors';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Play, Copy, Plus, Dumbbell, Edit } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { getExerciseGif } from '../../utils/imageMapper';
import { fetchTemplates, createTemplate } from '../../database/api';
import { showAlert } from '../../utils/alert';

type TemplateExercise = { exerciseName: string; targetSets: number; targetReps: string; targetWeight: number };
type Template = { id: number; name: string; description: string; isGlobal: boolean; exercises: TemplateExercise[] };

export default function TemplatesScreen() {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTemplates = async () => {
    try {
      const data = await fetchTemplates();
      setTemplates(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadTemplates();
    }, [])
  );

  const copyTemplate = async (template: Template) => {
    const newName = `${template.name} (Copy)`;
    const exercises = template.exercises.map(e => ({
      name: e.exerciseName,
      sets: e.targetSets,
      repsString: e.targetReps,
      weight: e.targetWeight,
    }));
    await createTemplate(newName, template.description, exercises, false);
    showAlert('Success', `Copied ${template.name}!`);
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
          <Plus color={theme.onTint} size={20} />
          <Text style={[styles.newBtnText, { color: theme.onTint }]}>New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={templates}
          keyExtractor={item => item.id.toString()}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
                    {item.isGlobal && (
                      <Text style={[styles.badge, { backgroundColor: theme.tint, color: theme.background }]}>GLOBAL</Text>
                    )}
                  </View>
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
                    <Play color={theme.onTint} size={16} fill={theme.onTint} />
                    <Text style={[styles.playText, { color: theme.onTint }]}>Start</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {item.exercises && item.exercises.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gifScroll}>
                  {item.exercises.map((ex, index) => {
                    const source = getExerciseGif(ex.exerciseName);
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
  card: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 18, fontWeight: 'bold' },
  desc: { fontSize: 14, marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { padding: 8, marginRight: 8 },
  playBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  playText: { color: '#fff', fontWeight: 'bold', marginLeft: 4, fontSize: 14 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, fontSize: 10, fontWeight: 'bold', overflow: 'hidden' },
  gifScroll: { marginTop: 12 },
  gifContainer: { width: 80, height: 80, borderRadius: 12, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  gifImage: { width: '100%', height: '100%', resizeMode: 'cover' }
});
