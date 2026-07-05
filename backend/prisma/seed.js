const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const globalTemplates = [
  {
    name: 'Push Day',
    description: 'Chest, shoulders, and triceps focused workout',
    exercises: [
      { exerciseName: 'Bench Press', targetSets: 4, targetReps: '8-10', targetWeight: 135 },
      { exerciseName: 'Incline Dumbbell Press', targetSets: 3, targetReps: '10-12', targetWeight: 50 },
      { exerciseName: 'Overhead Press', targetSets: 3, targetReps: '8-10', targetWeight: 95 },
      { exerciseName: 'Lateral Raises', targetSets: 3, targetReps: '12-15', targetWeight: 20 },
      { exerciseName: 'Tricep Pushdowns', targetSets: 3, targetReps: '12-15', targetWeight: 50 },
    ]
  },
  {
    name: 'Pull Day',
    description: 'Back and biceps focused workout',
    exercises: [
      { exerciseName: 'Deadlift', targetSets: 4, targetReps: '5', targetWeight: 225 },
      { exerciseName: 'Pull-Ups', targetSets: 3, targetReps: '8-10', targetWeight: 0 },
      { exerciseName: 'Barbell Row', targetSets: 3, targetReps: '8-10', targetWeight: 135 },
      { exerciseName: 'Lat Pulldown', targetSets: 3, targetReps: '10-12', targetWeight: 120 },
      { exerciseName: 'Dumbbell Curl', targetSets: 3, targetReps: '12-15', targetWeight: 30 },
    ]
  },
  {
    name: 'Leg Day',
    description: 'Quads, hamstrings, and glutes focused workout',
    exercises: [
      { exerciseName: 'Squat', targetSets: 4, targetReps: '5-8', targetWeight: 185 },
      { exerciseName: 'Romanian Deadlift', targetSets: 3, targetReps: '10-12', targetWeight: 135 },
      { exerciseName: 'Leg Press', targetSets: 3, targetReps: '12-15', targetWeight: 270 },
      { exerciseName: 'Leg Curl', targetSets: 3, targetReps: '12-15', targetWeight: 80 },
      { exerciseName: 'Calf Raises', targetSets: 4, targetReps: '15-20', targetWeight: 100 },
    ]
  },
  {
    name: 'Full Body',
    description: 'Complete full body workout hitting all major muscle groups',
    exercises: [
      { exerciseName: 'Squat', targetSets: 3, targetReps: '8', targetWeight: 135 },
      { exerciseName: 'Bench Press', targetSets: 3, targetReps: '8', targetWeight: 135 },
      { exerciseName: 'Barbell Row', targetSets: 3, targetReps: '8', targetWeight: 115 },
      { exerciseName: 'Overhead Press', targetSets: 3, targetReps: '8', targetWeight: 75 },
      { exerciseName: 'Romanian Deadlift', targetSets: 3, targetReps: '10', targetWeight: 115 },
    ]
  },
  {
    name: 'Upper Body',
    description: 'Chest, back, shoulders, and arms',
    exercises: [
      { exerciseName: 'Bench Press', targetSets: 4, targetReps: '8', targetWeight: 135 },
      { exerciseName: 'Pull-Ups', targetSets: 3, targetReps: '8-10', targetWeight: 0 },
      { exerciseName: 'Overhead Press', targetSets: 3, targetReps: '10', targetWeight: 85 },
      { exerciseName: 'Dumbbell Row', targetSets: 3, targetReps: '10', targetWeight: 60 },
      { exerciseName: 'Dumbbell Curl', targetSets: 2, targetReps: '12', targetWeight: 25 },
      { exerciseName: 'Tricep Pushdowns', targetSets: 2, targetReps: '12', targetWeight: 40 },
    ]
  },
  {
    name: 'Lower Body',
    description: 'Quads, hamstrings, glutes, and calves',
    exercises: [
      { exerciseName: 'Squat', targetSets: 4, targetReps: '8', targetWeight: 185 },
      { exerciseName: 'Leg Press', targetSets: 3, targetReps: '12', targetWeight: 270 },
      { exerciseName: 'Romanian Deadlift', targetSets: 3, targetReps: '10', targetWeight: 135 },
      { exerciseName: 'Leg Curl', targetSets: 3, targetReps: '12', targetWeight: 70 },
      { exerciseName: 'Calf Raises', targetSets: 3, targetReps: '20', targetWeight: 90 },
    ]
  },
];

async function main() {
  console.log('Seeding global templates...');

  for (const t of globalTemplates) {
    // Check if already exists
    const existing = await prisma.template.findFirst({
      where: { name: t.name, isGlobal: true }
    });
    if (existing) {
      console.log(`Skipping "${t.name}" - already exists`);
      continue;
    }
    await prisma.template.create({
      data: {
        name: t.name,
        description: t.description,
        isGlobal: true,
        userId: null,
        exercises: {
          create: t.exercises.map(e => ({
            exerciseName: e.exerciseName,
            targetSets: e.targetSets,
            targetReps: e.targetReps,
            targetWeight: e.targetWeight,
          }))
        }
      }
    });
    console.log(`Created global template: "${t.name}"`);
  }

  console.log('Done!');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
