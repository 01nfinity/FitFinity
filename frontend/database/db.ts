import { SQLiteDatabase } from 'expo-sqlite';

const APPSHEET_TEMPLATES = [
  { Name: "C1 Monday", Exercises: ["Cable Crossovers (High to Low) - 3x15 @ 50", "Seated Cable Chest Press - 3x (15, 12, 12) @ 50", "Cable Rope Tricep Pushdown - 3x15 @ 60", "Cable High Pulley Overhead Tricep Extension - 3x15 @ 20", "Rucking - 55lb, 40min, 2.2mi"] },
  { Name: "C1 Wednesday", Exercises: ["Cable Bar Lat Pulldowns - 3x15 @ 115", "Cable Seated Rows - 3x (15, 12, 12) @ 90", "One Arm Cable Curl - 3x15 @ 50", "Rope Cable Bicep Curls - 3x15 @ 50", "Rucking - 55lb, 40min, 2.2mi"] },
  { Name: "C1 Friday", Exercises: ["Cable Pull Throughs - 3x15 @ 60", "Cable Squats - 3x (15, 12, 12) @ 90", "Cable Abduction - 3x15 @ 20", "Cable Glute Kickbacks - 3x15 @ 20", "Rucking - 55lb, 40min, 2.2mi"] },
  { Name: "C2 Monday", Exercises: ["Cable Standing Chest Press - 3x15 @ 70", "Cable Incline Fly - 3x (15, 12, 12) @ 70", "Cable High Pulley Overhead Tricep Extension - 3x15 @ 25", "Cable Rope Tricep Pushdown - 3x15 @ 70", "Rucking - 55lb, 40min, 2.2mi"] },
  { Name: "C2 Wednesday", Exercises: ["Cable Bar Lat Pulldowns - 3x15 @ 125", "Cable Seated Rows - 3x (15, 12, 12) @ 115", "Cable Rope Hammer Curls - 3x15 @ 60", "Rope Cable Bicep Curls - 3x15 @ 60", "Rucking - 55lb, 40min, 2.2mi"] },
  { Name: "C2 Friday", Exercises: ["Cable Pull Throughs - 3x15 @ 115", "Cable Squats - 3x12 @ 115", "Cable Standing Leg Curl - 3x30 @ 60", "Cable Glute Kickbacks - 3x30 @ 60", "Rucking - 55lb, 40min, 2.2mi"] },
  { Name: "C3 Monday", Exercises: ["Seated Cable Chest Press - 3x15 @ 70", "Cable Crossovers (High to Low) - 3x (15, 12, 12) @ 70", "Cable Pushdown - 3x (15, 12, 15) @ 60", "Cable High Pulley Overhead Tricep Extension - 3x15 @ 30", "Rucking - 55lb, 40min, 2.2mi"] },
  { Name: "C3 Wednesday", Exercises: ["Cable Underhand Pulldown - 3x15 @ 115", "Cable Bent Over Row - 3x (15, 12, 12) @ 80", "Cable Pushdown - 3x (15, 12, 15) @ 60", "Cable Bar Bicep Curl - 3x15 @ 60", "Rucking - 55lb, 40min, 2.2mi"] },
  { Name: "C3 Friday", Exercises: ["Cable Romanian Deadlift - 3x15 @ 125", "Cable Forward Lunge - 3x (15, 12, 12) @ 70", "Cable Hip Adduction - 3x30 @ 25", "Cable Concentration Curl - 3x (15, 12, 15) @ 60", "Rucking - 55lb, 40min, 2.2mi"] },
  { Name: "C4 Monday", Exercises: ["Cable Incline Chest Press - 3x15 @ 100", "Cable Middle Fly - 3x (15, 12, 12) @ 70", "Cable Lying Triceps Extension - 3x15 @ 60", "Cable One Arm Triceps Extension - 3x24 @ 40", "Rucking - 55lb, 40min, 2.2mi"] },
  { Name: "C4 Wednesday", Exercises: ["Cable Pulldown - 3x15 @ 115", "Cable Standing Row - 3x (15, 12, 12) @ 115", "Cable Close Grip Curl - 3x15 @ 60", "Rope Cable Bicep Curls - 3x15 @ 30", "Rucking - 55lb, 40min, 2.2mi"] },
  { Name: "C4 Friday", Exercises: ["Cable Deadlift - 3x15 @ 130", "Cable Donkey Kickback - 3x24 @ 30", "Cable Standing Calf Raise - 3x15 @ 60", "Cable Twist - 3x15 @ 60", "Rucking - 55lb, 40min, 2.2mi"] },
  { Name: "C5 Monday", Exercises: ["Cable Decline Press - 3x15 @ 60", "Cable Low Fly - 3x (15, 12, 12) @ 60", "Cable Rope Tricep Pushdown - 3x15 @ 60", "Cable Twist - 3x15 @ 60", "Rucking - 55lb, 40min, 2.2mi"] },
  { Name: "C5 Wednesday", Exercises: ["Cable Bar Lat Pulldown - 3x15 @ 115", "Cable Straight Back Seated Row - 3x (15, 12, 12) @ 115", "Cable Drag Curl - 3x15 @ 60", "Cable Shrug - 3x15 @ 60", "Rucking - 55lb, 40min, 2.2mi"] },
  { Name: "C5 Friday", Exercises: ["Cable Standing Hip Extension - 3x15 @ 70", "Cable Seated Row (V-Bar) - 3x (15, 12, 12) @ 115", "Cable Hip Adduction - 3x15 @ 30", "Cable Bar Bicep Curl - 3x15 @ 60", "Rucking - 55lb, 40min, 2.2mi"] }
];

function parseExercise(str: string) {
  const match = str.match(/^(.*) - (\d+)x\s*(.*)\s*@\s*(\d+)$/);
  if (match) {
    return { name: match[1].trim(), sets: parseInt(match[2], 10), repsString: match[3].trim(), weight: parseFloat(match[4]) };
  }
  return { name: str, sets: 1, repsString: "1", weight: 0 };
}

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const DATABASE_VERSION = 2; // Increment version to run new migrations
  let result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentDbVersion = result?.user_version ?? 0;

  if (currentDbVersion >= DATABASE_VERSION) {
    return;
  }

  // Version 2 Migration: Add Normalized Templates
  await db.execAsync(`
    PRAGMA journal_mode = 'wal';

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS template_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      exercise_name TEXT NOT NULL,
      target_sets INTEGER DEFAULT 1,
      target_reps TEXT DEFAULT '1',
      target_weight REAL DEFAULT 0,
      FOREIGN KEY (template_id) REFERENCES templates (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      image_url TEXT
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      template_name TEXT,
      sentiment TEXT
    );

    CREATE TABLE IF NOT EXISTS log_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_id INTEGER NOT NULL,
      exercise_name TEXT NOT NULL,
      weight REAL,
      reps INTEGER,
      completed INTEGER DEFAULT 0,
      FOREIGN KEY (log_id) REFERENCES logs (id) ON DELETE CASCADE
    );
  `);

  if (currentDbVersion < 2) {
    // Clear out old dummy templates if any
    await db.execAsync('DELETE FROM template_exercises;');
    await db.execAsync('DELETE FROM templates;');

    for (const tpl of APPSHEET_TEMPLATES) {
      const result = await db.runAsync('INSERT INTO templates (name, description) VALUES (?, ?)', tpl.Name, '');
      const templateId = result.lastInsertRowId;
      
      for (const exStr of tpl.Exercises) {
        const parsed = parseExercise(exStr);
        await db.runAsync(
          'INSERT INTO template_exercises (template_id, exercise_name, target_sets, target_reps, target_weight) VALUES (?, ?, ?, ?, ?)',
          templateId, parsed.name, parsed.sets, parsed.repsString, parsed.weight
        );
      }
    }
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
