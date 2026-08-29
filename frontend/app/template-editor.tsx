import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, TouchableWithoutFeedback, ActivityIndicator, Modal, BackHandler, Platform, Switch } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { resolveExerciseImageSource } from '../utils/imageMapper';
import { Colors } from '../constants/Colors';
import { Plus, Save, Trash2, ArrowLeft, Dumbbell, ChevronUp, ChevronDown } from 'lucide-react-native';
import { fetchTemplate, createTemplate, updateTemplate, fetchExercises } from '../database/api';
import { showAlert } from '../utils/alert';

type TemplateExercise = {
  id: number | null;
  exercise_name: string;
  target_sets: number;
  target_reps: string;
  target_weight: string;
};

type LibraryExercise = { id: number; name: string; imageUrl: string | null };

export default function TemplateEditorScreen() {
  const { id } = useLocalSearchParams();
  const templateIdNum = id ? Number(Array.isArray(id) ? id[0] : id) : undefined;
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const { isAdmin } = useAuth();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isGlobal, setIsGlobal] = useState(false);
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);
  const [loading, setLoading] = useState(true);

  const [showExerciseSelector, setShowExerciseSelector] = useState(false);
  const [selectorTargetIndex, setSelectorTargetIndex] = useState<number | null>(null);
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState('');
  const [libraryExercises, setLibraryExercises] = useState<LibraryExercise[]>([]);

  const [isDirty, setIsDirty] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  useEffect(() => {
    fetchExercises()
      .then((data: any[]) => {
        const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name));
        setLibraryExercises(sorted.map(e => ({ id: e.id, name: e.name, imageUrl: e.imageUrl || null })));
      })
      .catch(() => {});
  }, []);

  const findLibraryImageUrl = (name: string) =>
    libraryExercises.find(e => e.name.toLowerCase() === name.toLowerCase())?.imageUrl || null;

  const handleBackPress = () => {
    if (isDirty) {
      setShowExitConfirm(true);
    } else {
      setIsDirty(false);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/templates');
      }
    }
  };

  useEffect(() => {
    const backAction = () => {
      if (isDirty) {
        handleBackPress();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      backAction
    );

    return () => backHandler.remove();
  }, [isDirty]);

  useEffect(() => {
    if (templateIdNum) {
      loadTemplate(templateIdNum);
    } else {
      setLoading(false);
    }
  }, [templateIdNum]);

  const loadTemplate = async (templateId: number) => {
    try {
      const template = await fetchTemplate(templateId);
      setName(template.name);
      setDescription(template.description || '');
      setIsGlobal(!!template.isGlobal);
      const normalized = (template.exercises || []).map((e: any) => ({
        id: e.id,
        exercise_name: e.exerciseName,
        target_sets: e.targetSets,
        target_reps: e.targetReps,
        target_weight: e.targetWeight !== null && e.targetWeight !== undefined ? e.targetWeight.toString() : '0',
      }));
      setExercises(normalized);
    } catch (err) {
      console.error(err);
      showAlert('Error', 'Failed to load routine');
    } finally {
      setLoading(false);
    }
  };

  const triggerAddExerciseSelector = () => {
    setSelectorTargetIndex(null);
    setExerciseSearchQuery('');
    setShowExerciseSelector(true);
  };

  const handleSelectExerciseName = (exerciseName: string) => {
    if (selectorTargetIndex === null) {
      // Add a new exercise
      setExercises([...exercises, { id: null, exercise_name: exerciseName, target_sets: 3, target_reps: '15', target_weight: '0' }]);
    } else {
      // Update an existing exercise
      const newEx = [...exercises];
      newEx[selectorTargetIndex].exercise_name = exerciseName;
      setExercises(newEx);
    }
    setShowExerciseSelector(false);
    setSelectorTargetIndex(null);
    setExerciseSearchQuery('');
  };

  const updateExercise = (index: number, field: keyof TemplateExercise, value: any) => {
    const newEx = [...exercises];
    // @ts-ignore
    newEx[index][field] = value;
    setExercises(newEx);
  };

  const removeExercise = (index: number) => {
    setIsDirty(true);
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const moveExercise = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= exercises.length) return;
    setIsDirty(true);
    const newEx = [...exercises];
    [newEx[index], newEx[targetIndex]] = [newEx[targetIndex], newEx[index]];
    setExercises(newEx);
  };

  // Both lists are padded/truncated to exactly setsCount so the number of
  // rows rendered always matches target_sets -- the single source of truth
  // for "how many sets" also used by active-workout.tsx. Previously reps
  // wasn't padded to setsCount, so a single-value reps string (e.g. "15")
  // rendered only 1 row no matter what target_sets said, and clicking "Add
  // Set" to compensate silently drove target_sets past the intended count.
  const getRepList = (targetReps: string, setsCount: number) => {
    const list = targetReps ? targetReps.split(',').map(r => r.trim()) : ['10'];
    while (list.length < setsCount) {
      list.push(list[list.length - 1] || '10');
    }
    return list.slice(0, setsCount);
  };

  const getWeightList = (targetWeight: any, setsCount: number) => {
    if (targetWeight === undefined || targetWeight === null) return Array(setsCount).fill('0');
    const str = targetWeight.toString();
    const list = str.split(',').map((w: string) => w.trim());
    while (list.length < setsCount) {
      list.push(list[list.length - 1] || '0');
    }
    return list.slice(0, setsCount);
  };

  const updateSetRepValue = (exerciseIndex: number, setIndex: number, value: string) => {
    setIsDirty(true);
    const newEx = [...exercises];
    const repList = getRepList(newEx[exerciseIndex].target_reps, newEx[exerciseIndex].target_sets);
    repList[setIndex] = value.replace(/[^0-9]/g, '');
    newEx[exerciseIndex].target_reps = repList.join(', ');
    setExercises(newEx);
  };

  const updateSetWeightValue = (exerciseIndex: number, setIndex: number, value: string) => {
    setIsDirty(true);
    const newEx = [...exercises];
    const weightList = getWeightList(newEx[exerciseIndex].target_weight, newEx[exerciseIndex].target_sets);
    weightList[setIndex] = value.replace(/[^0-9.]/g, '');
    newEx[exerciseIndex].target_weight = weightList.join(', ');
    setExercises(newEx);
  };

  const addSetToExercise = (exerciseIndex: number) => {
    setIsDirty(true);
    const newEx = [...exercises];
    const newSetsCount = newEx[exerciseIndex].target_sets + 1;
    newEx[exerciseIndex].target_reps = getRepList(newEx[exerciseIndex].target_reps, newSetsCount).join(', ');
    newEx[exerciseIndex].target_weight = getWeightList(newEx[exerciseIndex].target_weight, newSetsCount).join(', ');
    newEx[exerciseIndex].target_sets = newSetsCount;
    setExercises(newEx);
  };

  const removeSetFromExercise = (exerciseIndex: number, setIndex: number) => {
    setIsDirty(true);
    const newEx = [...exercises];
    const oldSetsCount = newEx[exerciseIndex].target_sets;
    if (oldSetsCount <= 1) return;

    const repList = getRepList(newEx[exerciseIndex].target_reps, oldSetsCount);
    repList.splice(setIndex, 1);
    newEx[exerciseIndex].target_reps = repList.join(', ');

    const weightList = getWeightList(newEx[exerciseIndex].target_weight, oldSetsCount);
    weightList.splice(setIndex, 1);
    newEx[exerciseIndex].target_weight = weightList.join(', ');

    newEx[exerciseIndex].target_sets = oldSetsCount - 1;
    setExercises(newEx);
  };

  const saveTemplate = async () => {
    if (!name.trim()) {
      showAlert('Validation Error', 'Please enter a template name');
      return;
    }

    const payload = exercises.map(ex => ({
      name: ex.exercise_name,
      sets: ex.target_sets,
      repsString: ex.target_reps,
      weight: parseFloat(ex.target_weight) || 0,
    }));

    try {
      if (templateIdNum) {
        await updateTemplate(templateIdNum, name, description, payload, isGlobal);
      } else {
        await createTemplate(name, description, payload, isGlobal);
      }

      showAlert('Success', 'Template saved!');
      setIsDirty(false);
      router.back();
    } catch (err) {
      console.error(err);
      showAlert('Error', 'Failed to save template');
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
        <TouchableOpacity onPress={handleBackPress} style={styles.backBtn}>
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
            onChangeText={(val) => { setName(val); setIsDirty(true); }}
            placeholder="e.g. Push Day"
            placeholderTextColor={theme.tabIconDefault}
          />
          <Text style={[styles.label, { color: theme.text }]}>Description (Optional)</Text>
          <TextInput
            style={[styles.input, { color: theme.text, borderColor: theme.border }]}
            value={description}
            onChangeText={(val) => { setDescription(val); setIsDirty(true); }}
            placeholder="e.g. Focus on chest and triceps"
            placeholderTextColor={theme.tabIconDefault}
          />
          {isAdmin && (
            <View style={styles.switchContainer}>
              <Text style={[styles.label, { color: theme.text, marginBottom: 0 }]}>Global Routine (Visible to all users)</Text>
              <Switch
                value={isGlobal}
                onValueChange={(val) => { setIsGlobal(val); setIsDirty(true); }}
                trackColor={{ false: theme.border, true: theme.tint }}
              />
            </View>
          )}
        </View>

        <View style={styles.exerciseHeader}>
          <Text style={[styles.subtitle, { color: theme.text }]}>Exercises</Text>
          <TouchableOpacity onPress={triggerAddExerciseSelector} style={[styles.addExBtn, { backgroundColor: theme.tint }]}>
            <Plus color={theme.onTint} size={16} />
            <Text style={[styles.addExText, { color: theme.onTint }]}>Add</Text>
          </TouchableOpacity>
        </View>

        {exercises.map((ex, index) => {
          const imgSource = resolveExerciseImageSource(ex.exercise_name, findLibraryImageUrl(ex.exercise_name));
          return (
          <View key={index} style={[styles.exCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.exCardHeader}>
              <View style={styles.reorderColumn}>
                <TouchableOpacity
                  onPress={() => moveExercise(index, -1)}
                  disabled={index === 0}
                  style={{ opacity: index === 0 ? 0.3 : 1 }}
                >
                  <ChevronUp color={theme.tabIconDefault} size={20} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveExercise(index, 1)}
                  disabled={index === exercises.length - 1}
                  style={{ opacity: index === exercises.length - 1 ? 0.3 : 1 }}
                >
                  <ChevronDown color={theme.tabIconDefault} size={20} />
                </TouchableOpacity>
              </View>
              <View style={styles.gifContainer}>
                {imgSource ? (
                  <Image source={imgSource} style={styles.gifImage} contentFit="cover" />
                ) : (
                  <Dumbbell color={theme.tabIconDefault} size={24} />
                )}
              </View>
              <TouchableOpacity
                style={{ flex: 1, marginRight: 10, paddingVertical: 8 }}
                onPress={() => {
                  setSelectorTargetIndex(index);
                  setExerciseSearchQuery('');
                  setShowExerciseSelector(true);
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: ex.exercise_name ? theme.text : theme.tabIconDefault, textTransform: 'capitalize' }}>
                  {ex.exercise_name || 'Select Exercise'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeExercise(index)}>
                <Trash2 color="#ff4444" size={20} />
              </TouchableOpacity>
            </View>

            <View style={styles.setHeader}>
              <Text style={[styles.setLabel, { color: theme.text, flex: 1 }]}>Set</Text>
              <Text style={[styles.setLabel, { color: theme.text, flex: 3 }]}>lbs</Text>
              <Text style={[styles.setLabel, { color: theme.text, flex: 3, marginLeft: 8 }]}>Reps</Text>
              <Text style={[styles.setLabel, { color: theme.text, width: 30 }]}></Text>
            </View>

            {getRepList(ex.target_reps, ex.target_sets).map((repsValue, setIndex) => {
              const weightList = getWeightList(ex.target_weight, ex.target_sets);
              const weightValue = weightList[setIndex] || '0';
              return (
                <View key={setIndex} style={styles.setRow}>
                  <Text style={[styles.setNumber, { color: theme.text, flex: 1 }]}>{setIndex + 1}</Text>
                  
                  {/* Weight Input */}
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.border, flex: 3, marginRight: 8, padding: 8, fontSize: 14, marginBottom: 0 }]}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={theme.tabIconDefault}
                    value={weightValue}
                    onChangeText={(val) => updateSetWeightValue(index, setIndex, val)}
                  />

                  {/* Reps Input */}
                  <TextInput
                    style={[styles.input, { color: theme.text, borderColor: theme.border, flex: 3, marginRight: 8, padding: 8, fontSize: 14, marginBottom: 0 }]}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={theme.tabIconDefault}
                    value={repsValue}
                    onChangeText={(val) => updateSetRepValue(index, setIndex, val)}
                  />

                  {ex.target_sets > 1 ? (
                    <TouchableOpacity 
                      onPress={() => removeSetFromExercise(index, setIndex)} 
                      style={{ width: 30, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 color="#ff4444" size={16} />
                    </TouchableOpacity>
                  ) : (
                    <View style={{ width: 30 }} />
                  )}
                </View>
              );
            })}

            <TouchableOpacity 
              style={[styles.addButton, { borderColor: theme.tint, marginTop: 8 }]} 
              onPress={() => addSetToExercise(index)}
            >
              <Plus color={theme.tint} size={16} />
              <Text style={[styles.addText, { color: theme.tint }]}>Add Set</Text>
            </TouchableOpacity>
          </View>
          );
        })}

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.tint }]} onPress={saveTemplate}>
          <Save color={theme.onTint} size={20} />
          <Text style={[styles.saveBtnText, { color: theme.onTint }]}>Save Routine</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Exercise Selector Modal */}
      <Modal
        visible={showExerciseSelector}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowExerciseSelector(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowExerciseSelector(false)}
        >
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.border, height: '80%' }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>
                  {selectorTargetIndex !== null ? 'Change Exercise' : 'Select Exercise'}
                </Text>
                <TouchableOpacity
                  onPress={() => setShowExerciseSelector(false)}
                  style={[styles.modalDoneBtn, { backgroundColor: theme.tint }]}
                >
                  <Text style={[styles.modalDoneText, { color: theme.onTint }]}>Close</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={[styles.searchInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                placeholder="Search exercises..."
                placeholderTextColor={theme.tabIconDefault}
                value={exerciseSearchQuery}
                onChangeText={setExerciseSearchQuery}
              />

              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, marginTop: 10 }}>
                {libraryExercises.filter(ex =>
                  ex.name.toLowerCase().includes(exerciseSearchQuery.toLowerCase())
                ).map(ex => {
                  const source = resolveExerciseImageSource(ex.name, ex.imageUrl);
                  return (
                    <TouchableOpacity
                      key={ex.id}
                      style={[styles.exerciseRow, { borderBottomColor: theme.border }]}
                      onPress={() => handleSelectExerciseName(ex.name)}
                    >
                      {source ? (
                        <Image source={source} style={styles.exerciseRowImage} contentFit="cover" />
                      ) : (
                        <View style={[styles.exerciseRowImage, { justifyContent: 'center', alignItems: 'center' }]}>
                          <Dumbbell color={theme.tabIconDefault} size={20} />
                        </View>
                      )}
                      <Text style={[styles.exerciseRowText, { color: theme.text }]}>
                        {ex.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>
      {/* Exit Confirmation Modal */}
      <Modal
        visible={showExitConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowExitConfirm(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={[styles.confirmModalContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.confirmTitle, { color: theme.text }]}>Unsaved Changes</Text>
            <Text style={[styles.confirmMessage, { color: theme.tabIconDefault }]}>
              You've made changes to this routine. Would you like to save them before leaving?
            </Text>
            <View style={styles.confirmButtonsRow}>
              <TouchableOpacity
                style={[styles.confirmButton, { borderColor: theme.border, borderWidth: 1 }]}
                onPress={() => setShowExitConfirm(false)}
              >
                <Text style={[styles.confirmButtonText, { color: theme.text }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: '#ff4444' }]}
                onPress={() => {
                  setShowExitConfirm(false);
                  setIsDirty(false);
                  if (router.canGoBack()) {
                    router.back();
                  } else {
                    router.replace('/(tabs)/templates');
                  }
                }}
              >
                <Text style={[styles.confirmButtonText, { color: '#ffffff' }]}>Discard</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: theme.tint }]}
                onPress={async () => {
                  setShowExitConfirm(false);
                  await saveTemplate();
                }}
              >
                <Text style={[styles.confirmButtonText, { color: theme.onTint }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  switchContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16 },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  subtitle: { fontSize: 20, fontWeight: '700' },
  addExBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  addExText: { color: '#fff', fontWeight: 'bold', marginLeft: 4 },
  exCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  exCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  reorderColumn: { justifyContent: 'center', alignItems: 'center', marginRight: 8, gap: 2 },
  gifContainer: { width: 60, height: 60, borderRadius: 10, overflow: 'hidden', backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  gifImage: { width: '100%', height: '100%' },
  exNameInput: { fontSize: 16, fontWeight: 'bold', flex: 1, marginRight: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { flex: 1, marginRight: 8 },
  minilabel: { fontSize: 12, marginBottom: 4 },
  miniInput: { borderWidth: 1, borderRadius: 8, padding: 8, fontSize: 14 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, marginTop: 24 },
  saveBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderBottomWidth: 0, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalDoneBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  modalDoneText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  searchInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 16 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  exerciseRowImage: { width: 50, height: 50, borderRadius: 8, marginRight: 16, backgroundColor: '#000' },
  exerciseRowText: { fontSize: 16, fontWeight: '700', textTransform: 'capitalize' },
  setHeader: { flexDirection: 'row', marginBottom: 8, paddingHorizontal: 8 },
  setLabel: { fontSize: 14, fontWeight: 'bold' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  setNumber: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 10, borderWidth: 1, borderRadius: 8, marginTop: 8, borderStyle: 'dashed' },
  addText: { fontSize: 14, fontWeight: 'bold', marginLeft: 8 },
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmModalContainer: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  confirmMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 8,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
