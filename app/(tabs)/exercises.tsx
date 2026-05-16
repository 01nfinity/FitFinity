import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../constants/Colors';
import { ExerciseImages } from '../../assets/images';

// Use statically mapped images keys for dummy exercises.
const DUMMY_EXERCISES = Object.keys(ExerciseImages).map((key, idx) => ({
  id: idx,
  name: key.replace(/-/g, ' ').replace('.gif', '').replace('.webp', ''),
  image_url: key,
}));

export default function ExercisesScreen() {
  const { isDark } = useTheme();
  const theme = isDark ? Colors.dark : Colors.light;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <FlatList
        data={DUMMY_EXERCISES}
        keyExtractor={item => item.id.toString()}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Image 
              source={ExerciseImages[item.image_url]} 
              style={styles.image} 
              resizeMode="contain"
            />
            <View style={styles.textContainer}>
              <Text style={[styles.name, { color: theme.text }]}>{item.name}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  image: {
    width: '100%',
    height: 150,
    backgroundColor: '#000',
  },
  textContainer: {
    padding: 16,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
});
