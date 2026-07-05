import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Switch, Image, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/Colors';
import * as ImagePicker from 'expo-image-picker';
import { X, Plus } from 'lucide-react-native';
import { createExercise, updateExercise, fetchExercises } from '../database/api';
import { getExerciseLibraryImage } from '../utils/imageMapper';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';
// Uploaded images are served from the API host at /uploads, not under /api itself.
const MEDIA_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

export default function ExerciseEditorScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const { isAdmin } = useAuth();

  const isEditing = !!params.id;

  const [name, setName] = useState((params.name as string) || '');
  const [description, setDescription] = useState((params.description as string) || '');
  const [categories, setCategories] = useState<string[]>(
    params.categories ? (params.categories as string).split(',').filter(Boolean) : []
  );
  const [categoryInput, setCategoryInput] = useState('');
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [isGlobal, setIsGlobal] = useState(params.isGlobal === 'true');
  const [imageUrl, setImageUrl] = useState((params.imageUrl as string) || '');
  const [image, setImage] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const existingImagePreviewUri = imageUrl
    ? (imageUrl.startsWith('http') ? imageUrl : `${MEDIA_BASE_URL}${imageUrl}`)
    : null;

  useEffect(() => {
    fetchExercises()
      .then((data: any[]) => {
        const set = new Set<string>();
        data.forEach(ex => (ex.categories || []).forEach((c: string) => set.add(c)));
        setAllCategories(Array.from(set).sort());
      })
      .catch(() => {});
  }, []);

  const addCategory = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (categories.some(c => c.toLowerCase() === value.toLowerCase())) {
      setCategoryInput('');
      return;
    }
    setCategories([...categories, value]);
    setCategoryInput('');
  };

  const removeCategory = (value: string) => {
    setCategories(categories.filter(c => c !== value));
  };

  const suggestedCategories = allCategories.filter(
    c => !categories.some(sel => sel.toLowerCase() === c.toLowerCase())
  );

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], // Updated enum replacement
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImage(result.assets[0]);
      setImageUrl('');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Exercise name is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        description,
        categories,
        isGlobal,
        imageUrl: image ? '' : imageUrl.trim(),
        image
      };

      if (isEditing) {
        await updateExercise(parseInt(params.id as string), payload);
      } else {
        await createExercise(payload);
      }
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save exercise');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>
        {isEditing ? 'Edit Exercise' : 'New Exercise'}
      </Text>

      <Text style={[styles.label, { color: theme.text }]}>Name</Text>
      <TextInput
        style={[styles.input, { color: theme.text, borderColor: theme.border }]}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Bench Press"
        placeholderTextColor={theme.text + '80'}
      />

      <Text style={[styles.label, { color: theme.text }]}>Description / Instructions</Text>
      <TextInput
        style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.border }]}
        value={description}
        onChangeText={setDescription}
        placeholder="How to perform this exercise..."
        placeholderTextColor={theme.text + '80'}
        multiline
        numberOfLines={4}
      />

      <Text style={[styles.label, { color: theme.text }]}>Categories</Text>
      {categories.length > 0 && (
        <View style={styles.chipRow}>
          {categories.map(c => (
            <View key={c} style={[styles.chip, { backgroundColor: theme.tint }]}>
              <Text style={[styles.chipText, { color: theme.onTint }]}>{c}</Text>
              <TouchableOpacity onPress={() => removeCategory(c)} hitSlop={8}>
                <X color={theme.onTint} size={14} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.categoryInputRow}>
        <TextInput
          style={[styles.input, { flex: 1, color: theme.text, borderColor: theme.border }]}
          value={categoryInput}
          onChangeText={setCategoryInput}
          onSubmitEditing={() => addCategory(categoryInput)}
          placeholder="Add a category and press enter"
          placeholderTextColor={theme.text + '80'}
          returnKeyType="done"
        />
        <TouchableOpacity
          style={[styles.addCategoryBtn, { backgroundColor: theme.primary }]}
          onPress={() => addCategory(categoryInput)}
        >
          <Plus color={theme.onTint} size={20} />
        </TouchableOpacity>
      </View>

      {suggestedCategories.length > 0 && (
        <View style={styles.chipRow}>
          {suggestedCategories.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, styles.suggestionChip, { borderColor: theme.border }]}
              onPress={() => addCategory(c)}
            >
              <Plus color={theme.text} size={12} />
              <Text style={[styles.chipText, { color: theme.text }]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {isAdmin && (
        <View style={styles.switchContainer}>
          <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Global Exercise (Visible to all users)</Text>
          <Switch
            value={isGlobal}
            onValueChange={setIsGlobal}
            trackColor={{ false: theme.border, true: theme.primary }}
          />
        </View>
      )}

      <Text style={[styles.label, { color: theme.text }]}>Image</Text>
      <TouchableOpacity
        style={[styles.imagePicker, { borderColor: theme.border, backgroundColor: theme.border }]}
        onPress={pickImage}
      >
        {image ? (
          <Image source={{ uri: image.uri }} style={styles.previewImage} resizeMode="contain" />
        ) : existingImagePreviewUri ? (
          <Image source={{ uri: existingImagePreviewUri }} style={styles.previewImage} resizeMode="contain" />
        ) : getExerciseLibraryImage(name) ? (
          <Image source={getExerciseLibraryImage(name)} style={styles.previewImage} resizeMode="contain" />
        ) : (
          <Text style={{ color: theme.text }}>Tap to upload an image</Text>
        )}
      </TouchableOpacity>

      <Text style={[styles.label, { color: theme.text }]}>Or Image URL</Text>
      <TextInput
        style={[styles.input, { color: theme.text, borderColor: theme.border }]}
        value={imageUrl}
        onChangeText={(val) => { setImageUrl(val); setImage(null); }}
        placeholder="https://example.com/image.jpg"
        placeholderTextColor={theme.text + '80'}
        autoCapitalize="none"
        keyboardType="url"
      />

      <TouchableOpacity
        style={[styles.saveButton, { backgroundColor: theme.primary }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={theme.onTint} />
        ) : (
          <Text style={[styles.saveButtonText, { color: theme.onTint }]}>Save Exercise</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.cancelButton, { borderColor: theme.border }]}
        onPress={() => router.back()}
        disabled={saving}
      >
        <Text style={[styles.cancelButtonText, { color: theme.text }]}>Cancel</Text>
      </TouchableOpacity>
      
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 24, marginTop: 10 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
  textArea: { height: 100, textAlignVertical: 'top' },
  switchContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  chipText: { fontSize: 13, fontWeight: '600' },
  suggestionChip: { borderWidth: 1 },
  categoryInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  addCategoryBtn: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  imagePicker: { height: 200, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  previewImage: { width: '100%', height: '100%' },
  saveButton: { padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 32 },
  saveButtonText: { fontSize: 18, fontWeight: 'bold' },
  cancelButton: { padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 12, borderWidth: 1 },
  cancelButtonText: { fontSize: 16, fontWeight: '600' },
});
