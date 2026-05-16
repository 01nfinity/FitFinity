import { ExerciseImages } from '../assets/images';

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

  const key = mapping[exerciseName];
  if (key && ExerciseImages[key]) {
    return ExerciseImages[key];
  }
  return null;
}
