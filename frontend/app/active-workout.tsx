import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, TouchableWithoutFeedback, Image, Alert, Modal, BackHandler, Platform } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { useTheme } from '../context/ThemeContext';
import { getExerciseGif } from '../utils/imageMapper';
import { Colors } from '../constants/Colors';
import { Plus, Save, Trash2, CheckCircle2, Circle, Dumbbell, ArrowLeft } from 'lucide-react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ExerciseImages } from '../assets/images';
import { fetchLog, createLog, updateLog, fetchTemplate } from '../database/api';

type LogSet = { weight: string; reps: string; completed: boolean };
type ExerciseEntry = { name: string; sets: LogSet[] };

const AVAILABLE_EXERCISES = Object.keys(ExerciseImages).map((key, idx) => ({
  id: idx,
  name: key.replace(/-/g, ' ').replace('.gif', '').replace('.webp', ''),
  image_url: key,
}));

const SENTIMENTS = [
  { emoji: '😭', label: 'Not Well', value: 1 },
  { emoji: '🙁', label: 'Bad', value: 2 },
  { emoji: '😐', label: 'Average', value: 3 },
  { emoji: '🙂', label: 'Good', value: 4 },
  { emoji: '😆', label: 'Awesome', value: 5 },
];

const HOURS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

const convert24hTo12h = (time24: string): { hour12: string; minute: string; ampm: string } => {
  if (!time24 || !time24.includes(':')) {
    return { hour12: '12', minute: '00', ampm: 'AM' };
  }
  const [hrsStr, minsStr] = time24.split(':');
  const hrs = parseInt(hrsStr) || 0;
  const mins = (minsStr || '00').substring(0, 2);
  
  const ampm = hrs >= 12 ? 'PM' : 'AM';
  let hour12Val = hrs % 12;
  if (hour12Val === 0) hour12Val = 12;
  
  return {
    hour12: String(hour12Val),
    minute: mins,
    ampm
  };
};

const convert12hTo24h = (hour12: string, minute: string, ampm: string): string => {
  let hrs = parseInt(hour12) || 12;
  const mins = minute.padStart(2, '0');
  
  if (ampm === 'PM' && hrs < 12) {
    hrs += 12;
  } else if (ampm === 'AM' && hrs === 12) {
    hrs = 0;
  }
  
  const hrsStr = String(hrs).padStart(2, '0');
  return `${hrsStr}:${mins}`;
};

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const year = parts[0];
  const monthIndex = parseInt(parts[1]) - 1;
  const day = parseInt(parts[2]);
  if (monthIndex >= 0 && monthIndex < 12) {
    return `${months[monthIndex]} ${day}, ${year}`;
  }
  return dateStr;
};

const formatTimeDisplay = (time24: string) => {
  const parsed = convert24hTo12h(time24);
  const hr = parsed.hour12.padStart(2, '0');
  return `${hr}:${parsed.minute} ${parsed.ampm}`;
};

export default function ActiveWorkoutScreen() {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;
  const { templateId, logId } = useLocalSearchParams();

  const [workoutName, setWorkoutName] = useState('Custom Workout');
  const [exercises, setExercises] = useState<ExerciseEntry[]>([
    { name: '', sets: [{ weight: '', reps: '', completed: false }] }
  ]);
  const [sentiment, setSentiment] = useState<number>(3); // Default to Average
  const [workoutDate, setWorkoutDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [workoutTime, setWorkoutTime] = useState<string>(() => {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    return `${hrs}:${mins}`;
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const time12Obj = convert24hTo12h(workoutTime);
  const [selectedHour, setSelectedHour] = useState(time12Obj.hour12);
  const [selectedMinute, setSelectedMinute] = useState(time12Obj.minute);
  const [selectedAmPm, setSelectedAmPm] = useState(time12Obj.ampm);

  const [showExerciseSelector, setShowExerciseSelector] = useState(false);
  const [selectorTargetIndex, setSelectorTargetIndex] = useState<number | null>(null);
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState('');

  // Reactive Calculations
  const totalCompletedWeight = exercises.reduce((acc, ex) => {
    return acc + ex.sets.reduce((setAcc, s) => s.completed ? setAcc + (parseFloat(s.weight) || 0) : setAcc, 0);
  }, 0);

  const totalCompletedSets = exercises.reduce((acc, ex) => {
    return acc + ex.sets.reduce((setAcc, s) => s.completed ? setAcc + 1 : setAcc, 0);
  }, 0);

  const totalRepsCount = exercises.reduce((acc, ex) => {
    return acc + ex.sets.reduce((setAcc, s) => s.completed ? setAcc + (parseInt(s.reps) || 0) : setAcc, 0);
  }, 0);

  const [isDirty, setIsDirty] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const handleBackPress = () => {
    if (isDirty) {
      setShowExitConfirm(true);
    } else {
      setIsDirty(false);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/log');
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
    const parsed = convert24hTo12h(workoutTime);
    setSelectedHour(parsed.hour12);
    setSelectedMinute(parsed.minute);
    setSelectedAmPm(parsed.ampm);
  }, [workoutTime]);

  useEffect(() => {
    if (logId) {
      loadWorkoutLog(Number(logId));
    } else if (templateId) {
      loadTemplate(Number(templateId));
    }
  }, [templateId, logId]);

  const loadWorkoutLog = async (id: number) => {
    try {
      const log = await fetchLog(id);
      setWorkoutName(log.templateName || 'Custom Workout');
      setSentiment(parseInt(log.sentiment) || 3);

      const dateParts = log.date.split(' ');
      setWorkoutDate(dateParts[0]);
      setWorkoutTime((dateParts[1] || '12:00').substring(0, 5));

      if (log.sets && log.sets.length > 0) {
        // Group sets by exercise name, preserving order
        const exerciseOrder: string[] = [];
        const exerciseGroups: Record<string, LogSet[]> = {};

        log.sets.forEach((s: any) => {
          if (!exerciseGroups[s.exerciseName]) {
            exerciseGroups[s.exerciseName] = [];
            exerciseOrder.push(s.exerciseName);
          }
          exerciseGroups[s.exerciseName].push({
            weight: (s.weight ?? 0).toString(),
            reps: (s.reps ?? 0).toString(),
            completed: !!s.completed
          });
        });

        const mapped = exerciseOrder.map(name => ({
          name,
          sets: exerciseGroups[name]
        }));
        setExercises(mapped);
      }
    } catch (err) {
      console.error('Failed to load workout log details:', err);
      Alert.alert('Error', 'Failed to load workout details.');
    }
  };

  const loadTemplate = async (id: number) => {
    try {
      const template = await fetchTemplate(id);
      setWorkoutName(template.name);

      if (template.exercises && template.exercises.length > 0) {
        const mapped = template.exercises.map((te: any) => {
          const sets: LogSet[] = [];

          // Parse reps list
          const repList = te.targetReps ? te.targetReps.split(',').map((r: string) => r.trim()) : ['10'];

          // Parse weight list
          const weightStr = te.targetWeight !== null && te.targetWeight !== undefined ? te.targetWeight.toString() : '0';
          const weightList = weightStr.split(',').map((w: string) => w.trim());

          for (let i = 0; i < te.targetSets; i++) {
            const repVal = repList[i] || repList[repList.length - 1] || '10';
            const weightVal = weightList[i] || weightList[weightList.length - 1] || '0';
            sets.push({ weight: weightVal, reps: repVal, completed: false });
          }
          return { name: te.exerciseName, sets };
        });
        setExercises(mapped);
      }
    } catch (err) {
      console.error('Failed to load template details:', err);
      Alert.alert('Error', 'Failed to load routine details.');
    }
  };

  const triggerAddExerciseSelector = () => {
    setSelectorTargetIndex(null);
    setExerciseSearchQuery('');
    setShowExerciseSelector(true);
  };

  const handleSelectExerciseName = (exerciseName: string) => {
    setIsDirty(true);
    if (selectorTargetIndex === null) {
      // Adding a new exercise
      setExercises([...exercises, { name: exerciseName, sets: [{ weight: '', reps: '', completed: false }] }]);
    } else {
      // Updating an existing exercise
      const newEx = [...exercises];
      newEx[selectorTargetIndex].name = exerciseName;
      setExercises(newEx);
    }
    setShowExerciseSelector(false);
    setSelectorTargetIndex(null);
    setExerciseSearchQuery('');
  };

  const removeExercise = (index: number) => {
    setIsDirty(true);
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const updateExerciseName = (index: number, name: string) => {
    setIsDirty(true);
    const newEx = [...exercises];
    newEx[index].name = name;
    setExercises(newEx);
  };

  const addSet = (exerciseIndex: number) => {
    setIsDirty(true);
    const newEx = [...exercises];
    newEx[exerciseIndex].sets.push({ weight: '', reps: '', completed: false });
    setExercises(newEx);
  };

  const updateSet = (exerciseIndex: number, setIndex: number, field: keyof LogSet, value: any) => {
    setIsDirty(true);
    const newEx = [...exercises];
    // @ts-ignore
    newEx[exerciseIndex].sets[setIndex][field] = value;
    setExercises(newEx);
  };

  const saveWorkout = async () => {
    // Validate Date and Time formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const timeRegex = /^\d{2}:\d{2}$/;

    if (!dateRegex.test(workoutDate.trim())) {
      Alert.alert('Invalid Date', 'Please enter a valid date in YYYY-MM-DD format (e.g., 2026-05-16).');
      return;
    }

    if (!timeRegex.test(workoutTime.trim())) {
      Alert.alert('Invalid Time', 'Please enter a valid time in HH:MM format (24-hour, e.g., 14:30).');
      return;
    }

    const combinedDateStr = `${workoutDate.trim()} ${workoutTime.trim()}`;

    const setsPayload = exercises.flatMap(ex =>
      ex.sets
        .filter(set => set.completed || set.weight || set.reps)
        .map(set => ({
          exerciseName: ex.name,
          weight: parseFloat(set.weight) || 0,
          reps: parseInt(set.reps) || 0,
          completed: set.completed,
        }))
    );

    try {
      if (logId) {
        await updateLog(Number(logId), combinedDateStr, workoutName, sentiment, setsPayload);
      } else {
        await createLog(combinedDateStr, workoutName, sentiment, setsPayload);
      }
      Alert.alert('Success', logId ? 'Workout Updated!' : 'Workout Saved!');
      setIsDirty(false);
      router.replace('/(tabs)/log');
    } catch (err) {
      console.error(err);
      Alert.alert('Error', logId ? 'Error updating workout' : 'Error saving workout');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backBtn}>
          <ArrowLeft color={theme.text} size={24} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text }]}>{logId ? 'Edit Workout Log' : 'Active Workout'}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
        <TextInput
          style={[styles.workoutNameInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
          value={workoutName}
          onChangeText={(val) => { setWorkoutName(val); setIsDirty(true); }}
          placeholder="Workout Name"
          placeholderTextColor={theme.tabIconDefault}
        />

        <View style={styles.dateTimeContainer}>
          <View style={styles.dateTimeCol}>
            <Text style={[styles.dateTimeLabel, { color: theme.text }]}>Date</Text>
            <TouchableOpacity 
              style={[styles.dateTimeButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={[styles.dateTimeButtonText, { color: theme.text }]}>
                {formatDateDisplay(workoutDate)}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.dateTimeCol, { marginLeft: 16 }]}>
            <Text style={[styles.dateTimeLabel, { color: theme.text }]}>Time</Text>
            <TouchableOpacity 
              style={[styles.dateTimeButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
              onPress={() => setShowTimePicker(true)}
            >
              <Text style={[styles.dateTimeButtonText, { color: theme.text }]}>
                {formatTimeDisplay(workoutTime)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

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
              <TouchableOpacity
                style={{ flex: 1, marginRight: 10, paddingVertical: 8 }}
                onPress={() => {
                  setSelectorTargetIndex(exIndex);
                  setExerciseSearchQuery('');
                  setShowExerciseSelector(true);
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: exercise.name ? theme.text : theme.tabIconDefault, textTransform: 'capitalize' }}>
                  {exercise.name || 'Select Exercise'}
                </Text>
              </TouchableOpacity>
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

        <TouchableOpacity style={[styles.addExButton, { borderColor: theme.text }]} onPress={triggerAddExerciseSelector}>
          <Plus color={theme.text} size={20} />
          <Text style={[styles.addExText, { color: theme.text }]}>Add Exercise</Text>
        </TouchableOpacity>

        <View style={[styles.reactiveStatsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.reactiveStatsTitle, { color: theme.text }]}>Session Summary</Text>
          <View style={styles.reactiveStatsGrid}>
            <View style={styles.reactiveStatItem}>
              <Text style={[styles.reactiveStatLabel, { color: theme.tabIconDefault }]}>Sets Ticked</Text>
              <Text style={[styles.reactiveStatValue, { color: theme.tint }]}>{totalCompletedSets}</Text>
            </View>
            <View style={styles.reactiveStatItem}>
              <Text style={[styles.reactiveStatLabel, { color: theme.tabIconDefault }]}>Total Weight</Text>
              <Text style={[styles.reactiveStatValue, { color: theme.accent }]}>{totalCompletedWeight} lbs</Text>
            </View>
            <View style={styles.reactiveStatItem}>
              <Text style={[styles.reactiveStatLabel, { color: theme.tabIconDefault }]}>Total Reps</Text>
              <Text style={[styles.reactiveStatValue, { color: theme.text }]}>{totalRepsCount}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.sentimentSection, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sentimentTitle, { color: theme.text }]}>How You Feel Today?</Text>
          <View style={styles.sentimentPicker}>
            {SENTIMENTS.map((s) => (
              <TouchableOpacity 
                key={s.value} 
                onPress={() => { setSentiment(s.value); setIsDirty(true); }} 
                style={[styles.sentimentBtn, sentiment === s.value && { backgroundColor: theme.tint, borderColor: theme.tint }]}
              >
                <Text style={styles.sentimentEmoji}>{s.emoji}</Text>
                <Text style={[styles.sentimentLabel, { color: sentiment === s.value ? theme.onTint : theme.tabIconDefault }]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={[styles.saveButton, { backgroundColor: theme.tint }]} onPress={saveWorkout}>
          <Save color={theme.onTint} size={20} />
          <Text style={[styles.saveText, { color: theme.onTint }]}>{logId ? 'Save Changes' : 'Finish Workout'}</Text>
        </TouchableOpacity>
        
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
        >
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Select Date</Text>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(false)}
                  style={[styles.modalDoneBtn, { backgroundColor: theme.tint }]}
                >
                  <Text style={[styles.modalDoneText, { color: theme.onTint }]}>Done</Text>
                </TouchableOpacity>
              </View>
              <Calendar
                current={workoutDate}
                onDayPress={(day: any) => {
                  setWorkoutDate(day.dateString);
                  setIsDirty(true);
                }}
                markedDates={{
                  [workoutDate]: { selected: true, selectedColor: theme.tint }
                }}
                theme={{
                  calendarBackground: theme.surface,
                  textSectionTitleColor: theme.tabIconDefault,
                  selectedDayBackgroundColor: theme.tint,
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: theme.tint,
                  dayTextColor: theme.text,
                  textDisabledColor: theme.tabIconDefault,
                  dotColor: theme.tint,
                  selectedDotColor: '#ffffff',
                  arrowColor: theme.tint,
                  monthTextColor: theme.text,
                  indicatorColor: theme.tint,
                }}
              />
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* Time Picker Modal */}
      <Modal
        visible={showTimePicker}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowTimePicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowTimePicker(false)}
        >
          <TouchableWithoutFeedback onPress={() => {}}>
            <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Select Time</Text>
                <TouchableOpacity
                  onPress={() => setShowTimePicker(false)}
                  style={[styles.modalDoneBtn, { backgroundColor: theme.tint }]}
                >
                  <Text style={[styles.modalDoneText, { color: theme.onTint }]}>Done</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.pickerContainer}>
                {/* Hours Column */}
                <View style={styles.pickerColumn}>
                  <Text style={[styles.columnLabel, { color: theme.tabIconDefault }]}>Hour</Text>
                  <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
                    {HOURS.map(h => {
                      const isSelected = selectedHour === h;
                      return (
                        <TouchableOpacity
                          key={h}
                          style={[styles.pickerItem, isSelected && { backgroundColor: theme.tint }]}
                          onPress={() => {
                            setSelectedHour(h);
                            setWorkoutTime(convert12hTo24h(h, selectedMinute, selectedAmPm));
                            setIsDirty(true);
                          }}
                        >
                          <Text style={[styles.pickerItemText, { color: isSelected ? '#ffffff' : theme.text }]}>
                            {h}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Minutes Column */}
                <View style={styles.pickerColumn}>
                  <Text style={[styles.columnLabel, { color: theme.tabIconDefault }]}>Minute</Text>
                  <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
                    {MINUTES.map(m => {
                      const isSelected = selectedMinute === m;
                      return (
                        <TouchableOpacity
                          key={m}
                          style={[styles.pickerItem, isSelected && { backgroundColor: theme.tint }]}
                          onPress={() => {
                            setSelectedMinute(m);
                            setWorkoutTime(convert12hTo24h(selectedHour, m, selectedAmPm));
                            setIsDirty(true);
                          }}
                        >
                          <Text style={[styles.pickerItemText, { color: isSelected ? '#ffffff' : theme.text }]}>
                            {m}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* AM/PM Column */}
                <View style={[styles.pickerColumn, { flex: 0.8 }]}>
                  <Text style={[styles.columnLabel, { color: theme.tabIconDefault }]}>AM/PM</Text>
                  <View style={styles.ampmContainer}>
                    {['AM', 'PM'].map(p => {
                      const isSelected = selectedAmPm === p;
                      return (
                        <TouchableOpacity
                          key={p}
                          style={[styles.ampmBtn, isSelected && { backgroundColor: theme.tint }]}
                          onPress={() => {
                            setSelectedAmPm(p);
                            setWorkoutTime(convert12hTo24h(selectedHour, selectedMinute, p));
                            setIsDirty(true);
                          }}
                        >
                          <Text style={[styles.ampmText, { color: isSelected ? '#ffffff' : theme.text }]}>
                            {p}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

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
                {AVAILABLE_EXERCISES.filter(ex =>
                  ex.name.toLowerCase().includes(exerciseSearchQuery.toLowerCase())
                ).map(ex => (
                  <TouchableOpacity
                    key={ex.id}
                    style={[styles.exerciseRow, { borderBottomColor: theme.border }]}
                    onPress={() => handleSelectExerciseName(ex.name)}
                  >
                    <Image source={ExerciseImages[ex.image_url]} style={styles.exerciseRowImage} />
                    <Text style={[styles.exerciseRowText, { color: theme.text }]}>
                      {ex.name}
                    </Text>
                  </TouchableOpacity>
                ))}
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
              You've made changes to this workout. Would you like to save them before leaving?
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
                    router.replace('/(tabs)/log');
                  }
                }}
              >
                <Text style={[styles.confirmButtonText, { color: '#ffffff' }]}>Discard</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: theme.tint }]}
                onPress={async () => {
                  setShowExitConfirm(false);
                  await saveWorkout();
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
  container: { flex: 1, paddingTop: 60 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
  backBtn: { marginRight: 16 },
  title: { fontSize: 24, fontWeight: '800' },
  workoutNameInput: { borderWidth: 1, borderRadius: 12, padding: 16, fontSize: 20, fontWeight: 'bold', marginBottom: 20 },
  dateTimeContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  dateTimeCol: { flex: 1 },
  dateTimeLabel: { fontSize: 14, fontWeight: '700', marginBottom: 6, marginLeft: 4 },
  dateTimeButton: { borderWidth: 1, borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center' },
  dateTimeButtonText: { fontSize: 16, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderBottomWidth: 0, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalDoneBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  modalDoneText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  pickerContainer: { flexDirection: 'row', justifyContent: 'space-between', height: 260 },
  pickerColumn: { flex: 1, alignItems: 'stretch' },
  columnLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', textAlign: 'center', marginBottom: 8 },
  scrollList: { height: 220 },
  pickerItem: { paddingVertical: 12, alignItems: 'center', borderRadius: 10, marginVertical: 2 },
  pickerItemText: { fontSize: 16, fontWeight: '700' },
  ampmContainer: { justifyContent: 'center', height: 220 },
  ampmBtn: { paddingVertical: 16, alignItems: 'center', borderRadius: 10, marginVertical: 6, borderWidth: 1, borderColor: 'transparent' },
  ampmText: { fontSize: 15, fontWeight: '700' },
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
  searchInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 16 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  exerciseRowImage: { width: 50, height: 50, borderRadius: 8, marginRight: 16, backgroundColor: '#000' },
  exerciseRowText: { fontSize: 16, fontWeight: '700', textTransform: 'capitalize' },
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
  reactiveStatsCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  reactiveStatsTitle: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reactiveStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  reactiveStatItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactiveStatLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
  },
  reactiveStatValue: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
});
