import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TextInput, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';
import { fetchExercises, getPendingSyncCount, subscribeSyncStatus, syncNow, getIsOffline } from '../../database/api';
import { useRouter } from 'expo-router';
import { Plus, CloudOff } from 'lucide-react-native';
import { getExerciseLibraryImage, resolveMediaUrl } from '../../utils/imageMapper';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';
import { SyncStatusBanner } from '../../components/SyncStatusBanner';

export default function ExercisesScreen() {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const router = useRouter();
  const [exercises, setExercises] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadExercises = async () => {
    try {
      const data = await fetchExercises();
      setExercises(data);
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
    loadExercises();
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await syncNow();
      loadExercises();
    } finally {
      setSyncing(false);
    }
  };

  useAutoRefresh(loadExercises);

  useEffect(() => {
    getPendingSyncCount().then(setPendingCount);
    return subscribeSyncStatus(() => {
      getPendingSyncCount().then(setPendingCount);
      setIsOffline(getIsOffline());
      loadExercises();
    });
  }, []);

  const filteredExercises = exercises.filter(item => {
    const query = searchQuery.toLowerCase();
    if (item.name.toLowerCase().includes(query)) return true;
    return (item.categories || []).some((c: string) => c.toLowerCase().includes(query));
  });

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Exercise Library</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.primary }]}
          onPress={() => router.push('/exercise-editor')}
        >
          <Plus color={theme.onTint} size={20} />
          <Text style={[styles.addButtonText, { color: theme.onTint }]}>Add New</Text>
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
        placeholder="Search exercises..."
        placeholderTextColor={theme.tabIconDefault}
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {loading ? (
        <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 50 }} />
      ) : filteredExercises.length === 0 ? (
        <Text style={[styles.emptyText, { color: theme.tabIconDefault }]}>No exercises found.</Text>
      ) : (
        <FlatList
          data={filteredExercises}
          keyExtractor={item => item.id.toString()}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => router.push(`/exercise-editor?id=${item.id}&name=${encodeURIComponent(item.name)}&description=${encodeURIComponent(item.description || '')}&isGlobal=${item.isGlobal}&categories=${encodeURIComponent((item.categories || []).join(','))}&imageUrl=${encodeURIComponent(item.imageUrl || '')}`)}
            >
              {item.imageUrl ? (
                <View style={[styles.imageContainer, { backgroundColor: theme.border }]}>
                  <Image
                    source={{ uri: resolveMediaUrl(item.imageUrl) }}
                    style={styles.image}
                    resizeMode="contain"
                  />
                </View>
              ) : getExerciseLibraryImage(item.name) ? (
                <View style={[styles.imageContainer, { backgroundColor: theme.border }]}>
                  <Image
                    source={getExerciseLibraryImage(item.name)}
                    style={styles.image}
                    resizeMode="contain"
                  />
                </View>
              ) : (
                <View style={[styles.imageContainer, { backgroundColor: theme.border, justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ color: theme.text, fontSize: 12 }}>No Image</Text>
                </View>
              )}
              <View style={styles.textContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
                  {item._pendingSync && <CloudOff color={theme.tabIconDefault} size={14} />}
                </View>
                {(item.isGlobal || (item.categories || []).length > 0) && (
                  <View style={styles.badgeRow}>
                    {item.isGlobal && (
                      <Text style={[styles.badge, { backgroundColor: theme.tint, color: theme.background }]}>GLOBAL</Text>
                    )}
                    {(item.categories || []).map((c: string) => (
                      <Text key={c} style={[styles.badge, styles.categoryBadge, { borderColor: theme.border, color: theme.text }]}>{c}</Text>
                    ))}
                  </View>
                )}
                {item.description && (
                  <Text style={[styles.description, { color: theme.text + '99' }]} numberOfLines={3}>
                    {item.description}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold' },
  addButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 4 },
  addButtonText: { fontWeight: 'bold' },
  searchInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16, marginBottom: 16 },
  emptyText: { textAlign: 'center', fontSize: 15, marginTop: 40 },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, marginBottom: 16, overflow: 'hidden', elevation: 5 },
  imageContainer: { width: 110, height: 110 },
  image: { width: '100%', height: '100%' },
  textContainer: { flex: 1, padding: 16, alignSelf: 'stretch', justifyContent: 'center', gap: 6 },
  name: { fontSize: 18, fontWeight: '700', textTransform: 'capitalize' },
  description: { fontSize: 14, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, fontSize: 10, fontWeight: 'bold', overflow: 'hidden' },
  categoryBadge: { borderWidth: 1, textTransform: 'uppercase' },
});
