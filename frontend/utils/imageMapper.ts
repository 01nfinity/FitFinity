import { ExerciseImages } from '../assets/images';

// Maps the seeded Exercise Library names (backend/prisma/seed-exercises.js) to
// the closest available bundled asset. Only exercises with a reasonable visual
// match are listed here; the rest fall back to the "No Image" placeholder.
const EXERCISE_LIBRARY_IMAGE_MAP: Record<string, string> = {
  'Incline Dumbbell Press': 'cable-incline-bench-press.webp',
  'Cable Fly': 'cable-middle-fly.webp',
  'Deadlift': 'Barbell-Deadlift.gif',
  'Barbell Row': 'cable-bent-over-row.webp',
  'Lat Pulldown': 'Lat-Pulldown.gif',
  'Dumbbell Row': 'Single-Arm-Twisting-Seated-Cable-Row.gif',
  'Overhead Press': 'cable-shoulder-press.webp',
  'Lateral Raises': 'one-arm-Cable-Lateral-Raise.gif',
  'Front Raises': 'cable-front-raise.webp',
  'Dumbbell Curl': 'Dumbbell-Curl.gif',
  'Barbell Curl': 'rope-bicep-curls.gif',
  'Tricep Pushdowns': 'Rope-Pushdown.gif',
  'Squat': 'bodyweight-squat-full-version.gif',
  'Romanian Deadlift': 'cable-romanian-deadlift.webp',
  'Leg Press': 'Leg-Press.gif',
  'Leg Curl': 'cable-standing-leg-curl.gif',
  'Calf Raises': 'cable-standing-calf-raise.webp',
  'Lunges': 'cable-forward-lunge.webp',
  'Crunches': 'Crunch.gif',
  'Russian Twists': 'Russian-Twist.gif',
};

export function getExerciseLibraryImage(exerciseName: string) {
  const key = EXERCISE_LIBRARY_IMAGE_MAP[exerciseName];
  return key && ExerciseImages[key] ? ExerciseImages[key] : null;
}

export function getExerciseGif(exerciseName: string) {
  const mapping: Record<string, string> = {
    'Cable Crossovers (High to Low)': 'High-Cable-Crossover.gif',
    'Seated Cable Chest Press': 'Seated-Cable-Chest-Press.gif',
    'Cable Rope Tricep Pushdown': 'Rope-Pushdown.gif',
    'Cable High Pulley Overhead Tricep Extension': 'Cable-Rope-Overhead-Triceps-Extension.gif',
    'Cable Bar Lat Pulldowns': 'Lat-Pulldown.gif',
    'Cable Seated Rows': 'Seated-Cable-Row.gif',
    'One Arm Cable Curl': 'One-Arm-Cable-Curl.gif',
    'Rope Cable Bicep Curls': 'rope-bicep-curls.gif',
    'Cable Pull Throughs': 'Cable-Pull-Through.gif',
    'Cable Squats': 'Cable-Front-Squat.gif',
    'Cable Glute Kickbacks': 'cable-donkey-kickback.webp',
    'Cable Standing Chest Press': 'cable-standing-chest-press.webp',
    'Cable Incline Fly': 'Incline-Cable-Fly.gif',
    'Cable Standing Leg Curl': 'cable-standing-leg-curl.gif',
    'Cable Underhand Pulldown': 'cable-underhand-pulldown.webp',
    'Cable Bent Over Row': 'cable-bent-over-row.webp',
    'Cable Pushdown': 'Rope-Pushdown.gif',
    'Cable Romanian Deadlift': 'cable-romanian-deadlift.webp',
    'Cable Forward Lunge': 'cable-forward-lunge.webp',
    'Cable Hip Adduction': 'cable-hip-adduction.webp',
    'Cable Concentration Curl': 'cable-concentration-curl.webp',
    'Cable Incline Chest Press': 'cable-incline-bench-press.webp',
    'Cable Middle Fly': 'cable-middle-fly.webp',
    'Cable Close Grip Curl': 'cable-close-grip-curl.webp',
    'Cable Deadlift': 'cable-deadlift.webp',
    'Cable Donkey Kickback': 'cable-donkey-kickback.webp',
    'Cable Standing Calf Raise': 'cable-standing-calf-raise.webp',
    'Cable Twist': 'cable-twist.webp',
    'Cable Decline Press': 'cable-decline-press.webp',
    'Cable Low Fly': 'cable-low-fly.webp',
    'Cable Straight Back Seated Row': 'cable-straight-back-seated-row.webp',
    'Cable Drag Curl': 'cable-drag-curl.gif',
    'Cable Standing Hip Extension': 'cable-standing-hip-extension.webp',
    'Cable Seated Row (V-Bar)': 'Seated-Cable-Row.gif',
    'Cable Bar Bicep Curl': 'Dumbbell-Curl.gif', 
  };

  // 1. Direct friendly name match
  const key = mapping[exerciseName];
  if (key && ExerciseImages[key]) {
    return ExerciseImages[key];
  }

  // 2. Generic fallback normalization match (e.g. for selector names)
  if (exerciseName) {
    const cleanInput = exerciseName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchedKey = Object.keys(ExerciseImages).find(k => {
      const cleanKey = k.toLowerCase().replace('.gif', '').replace('.webp', '').replace(/[^a-z0-9]/g, '');
      return cleanKey === cleanInput;
    });
    if (matchedKey) {
      return ExerciseImages[matchedKey];
    }
  }

  return null;
}
