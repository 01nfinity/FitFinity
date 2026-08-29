import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '../../constants/Colors';
import { router } from 'expo-router';
import { Play, Copy, Plus, Dumbbell, Edit, Trash2, CloudOff } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { resolveExerciseImageSource } from '../../utils/imageMapper';
import { fetchTemplates, createTemplate, deleteTemplate, fetchExercises, getPendingSyncCount, subscribeSyncStatus, syncNow, getIsOffline } from '../../database/api';
import { showAlert, confirmAction } from '../../utils/alert';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { SyncStatusBanner } from '../../components/SyncStatusBanner';

type TemplateExercise = { exerciseName: string; targetSets: number; targetReps: string; targetWeight: number };
type Template = { id: number; name: string; description: string; isGlobal: boolean; exercises: TemplateExercise[]; _pendingSync?: boolean };

export default function TemplatesScreen() {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [libraryImages, setLibraryImages] = useState<Record<string, string | null>>({});
  const [pendingCount, setPendingCount] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadTemplates = async () => {
    try {
      const [templatesData, exercisesData] = await Promise.all([fetchTemplates(), fetchExercises()]);
      setTemplates(templatesData);
      const map: Record<string, string | null> = {};
      (exercisesData || []).forEach((e: any) => { map[e.name.toLowerCase()] = e.imageUrl || null; });
      setLibraryImages(map);
      setIsOffline(getIsOffline());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadTemplates();
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await syncNow();
      loadTemplates();
    } finally {
      setSyncing(false);
    }
  };

  useAutoRefresh(loadTemplates);

  useEffect(() => {
    getPendingSyncCount().then(setPendingCount);
    return subscribeSyncStatus(() => {
      getPendingSyncCount().then(setPendingCount);
      setIsOffline(getIsOffline());
      loadTemplates();
    });
  }, []);

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

  const removeTemplate = (template: Template) => {
    confirmAction(
      'Delete Routine',
      `Are you sure you want to delete "${template.name}"? This cannot be undone.`,
      'Delete',
      async () => {
        try {
          await deleteTemplate(template.id);
          loadTemplates();
        } catch (e: any) {
          showAlert('Error', e.message || 'Failed to delete routine');
        }
      }
    );
  };

  const createNewTemplate = () => {
    router.push('/template-editor');
  };

  const filteredTemplates = templates.filter(item => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    if (item.name.toLowerCase().includes(query)) return true;
    if (item.description && item.description.toLowerCase().includes(query)) return true;
    return (item.exercises || []).some(e => e.exerciseName.toLowerCase().includes(query));
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Workout Routines</Text>
        <TouchableOpacity style={[styles.newBtn, { backgroundColor: theme.tint }]} onPress={createNewTemplate}>
          <Plus color={theme.onTint} size={20} />
          <Text style={[styles.newBtnText, { color: theme.onTint }]}>New</Text>
        </TouchableOpacity>
      </View>

      <SyncStatusBanner
        theme={theme}
        pendingCount={pendingCount}
        isOffline={isOffline}
        syncing={syncing}
        onSyncNow={handleSyncNow}
      />

      <TextInput
        style={[styles.searchInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
        placeholder="Search routines or exercises..."
        placeholderTextColor={theme.tabIconDefault}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {loading ? (
        <ActivityIndicator size="large" color={theme.tint} style={{ marginTop: 50 }} />
      ) : filteredTemplates.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.tabIconDefault }]}>No routines found.</Text>
      ) : (
        <FlatList
          data={filteredTemplates}
          keyExtractor={item => item.id.toString()}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.tint} />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
                    {item.isGlobal && (
                      <Text style={[styles.badge, { backgroundColor: theme.tint, color: theme.background }]}>GLOBAL</Text>
                    )}
                    {item._pendingSync && <CloudOff color={theme.tabIconDefault} size={14} />}
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
                  <TouchableOpacity style={styles.actionBtn} onPress={() => removeTemplate(item)}>
                    <Trash2 color="#EF4444" size={20} />
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
                    const source = resolveExerciseImageSource(ex.exerciseName, libraryImages[ex.exerciseName.toLowerCase()] ?? null);
                    return (
                      <View key={index} style={[styles.gifContainer, { backgroundColor: theme.border }]}>
                        {source ? (
                          <Image source={source} style={styles.gifImage} contentFit="cover" />
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
  searchInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16, marginBottom: 16 },
  emptyText: { textAlign: 'center', fontSize: 15, marginTop: 40 },
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
  gifImage: { width: '100%', height: '100%' }
});
