// Recreates the user's original AppSheet "Templates" table as global routines:
// 5 cycles (C1-C5) x Monday/Wednesday/Friday, each a Push/Pull/Legs split with
// 4 cable-machine lifting exercises + a Rucking session as the last exercise.
// Source data ported from the legacy frontend/database/db.ts APPSHEET_TEMPLATES.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const RUCK_WEIGHT = 55;
const RUCK_MINUTES = 40;
const RUCK_MILES = 2.2;

const CYCLES = [
  {
    Monday: ['Cable Crossovers (High to Low) - 3x15 @ 50', 'Seated Cable Chest Press - 3x (15, 12, 12) @ 50', 'Cable Rope Tricep Pushdown - 3x15 @ 60', 'Cable High Pulley Overhead Tricep Extension - 3x15 @ 20'],
    Wednesday: ['Cable Bar Lat Pulldowns - 3x15 @ 115', 'Cable Seated Rows - 3x (15, 12, 12) @ 90', 'One Arm Cable Curl - 3x15 @ 50', 'Rope Cable Bicep Curls - 3x15 @ 50'],
    Friday: ['Cable Pull Throughs - 3x15 @ 60', 'Cable Squats - 3x (15, 12, 12) @ 90', 'Cable Abduction - 3x15 @ 20', 'Cable Glute Kickbacks - 3x15 @ 20'],
  },
  {
    Monday: ['Cable Standing Chest Press - 3x15 @ 70', 'Cable Incline Fly - 3x (15, 12, 12) @ 70', 'Cable High Pulley Overhead Tricep Extension - 3x15 @ 25', 'Cable Rope Tricep Pushdown - 3x15 @ 70'],
    Wednesday: ['Cable Bar Lat Pulldowns - 3x15 @ 125', 'Cable Seated Rows - 3x (15, 12, 12) @ 115', 'Cable Rope Hammer Curls - 3x15 @ 60', 'Rope Cable Bicep Curls - 3x15 @ 60'],
    Friday: ['Cable Pull Throughs - 3x15 @ 115', 'Cable Squats - 3x12 @ 115', 'Cable Standing Leg Curl - 3x30 @ 60', 'Cable Glute Kickbacks - 3x30 @ 60'],
  },
  {
    Monday: ['Seated Cable Chest Press - 3x15 @ 70', 'Cable Crossovers (High to Low) - 3x (15, 12, 12) @ 70', 'Cable Pushdown - 3x (15, 12, 15) @ 60', 'Cable High Pulley Overhead Tricep Extension - 3x15 @ 30'],
    Wednesday: ['Cable Underhand Pulldown - 3x15 @ 115', 'Cable Bent Over Row - 3x (15, 12, 12) @ 80', 'Cable Pushdown - 3x (15, 12, 15) @ 60', 'Cable Bar Bicep Curl - 3x15 @ 60'],
    Friday: ['Cable Romanian Deadlift - 3x15 @ 125', 'Cable Forward Lunge - 3x (15, 12, 12) @ 70', 'Cable Hip Adduction - 3x30 @ 25', 'Cable Concentration Curl - 3x (15, 12, 15) @ 60'],
  },
  {
    Monday: ['Cable Incline Chest Press - 3x15 @ 100', 'Cable Middle Fly - 3x (15, 12, 12) @ 70', 'Cable Lying Triceps Extension - 3x15 @ 60', 'Cable One Arm Triceps Extension - 3x24 @ 40'],
    Wednesday: ['Cable Pulldown - 3x15 @ 115', 'Cable Standing Row - 3x (15, 12, 12) @ 115', 'Cable Close Grip Curl - 3x15 @ 60', 'Rope Cable Bicep Curls - 3x15 @ 30'],
    Friday: ['Cable Deadlift - 3x15 @ 130', 'Cable Donkey Kickback - 3x24 @ 30', 'Cable Standing Calf Raise - 3x15 @ 60', 'Cable Twist - 3x15 @ 60'],
  },
  {
    Monday: ['Cable Decline Press - 3x15 @ 60', 'Cable Low Fly - 3x (15, 12, 12) @ 60', 'Cable Rope Tricep Pushdown - 3x15 @ 60', 'Cable Twist - 3x15 @ 60'],
    Wednesday: ['Cable Bar Lat Pulldown - 3x15 @ 115', 'Cable Straight Back Seated Row - 3x (15, 12, 12) @ 115', 'Cable Drag Curl - 3x15 @ 60', 'Cable Shrug - 3x15 @ 60'],
    Friday: ['Cable Standing Hip Extension - 3x15 @ 70', 'Cable Seated Row (V-Bar) - 3x (15, 12, 12) @ 115', 'Cable Hip Adduction - 3x15 @ 30', 'Cable Bar Bicep Curl - 3x15 @ 60'],
  },
];

const DAY_FOCUS = { Monday: 'Push (Chest/Triceps)', Wednesday: 'Pull (Back/Biceps)', Friday: 'Legs/Glutes' };

// Parses "Name - 3x15 @ 50" or "Name - 3x (15, 12, 12) @ 50" into
// { exerciseName, targetSets, targetReps, targetWeight }, stripping any
// wrapping parens around a comma-separated per-set rep list.
function parseLiftLine(str) {
  const dashIdx = str.lastIndexOf(' - ');
  const exerciseName = str.slice(0, dashIdx).trim();
  const rest = str.slice(dashIdx + 3).trim();

  const atIdx = rest.lastIndexOf('@');
  const setsReps = rest.slice(0, atIdx).trim();
  const targetWeight = parseFloat(rest.slice(atIdx + 1).trim());

  const xIdx = setsReps.indexOf('x');
  const targetSets = parseInt(setsReps.slice(0, xIdx), 10);
  const targetReps = setsReps.slice(xIdx + 1).trim().replace(/^\(/, '').replace(/\)$/, '').trim();

  return { exerciseName, targetSets, targetReps, targetWeight };
}

function buildTemplates() {
  const templates = [];
  CYCLES.forEach((cycle, cycleIdx) => {
    const cycleNum = cycleIdx + 1;
    for (const day of ['Monday', 'Wednesday', 'Friday']) {
      const exercises = cycle[day].map(parseLiftLine);
      exercises.push({
        exerciseName: 'Rucking',
        targetSets: 1,
        targetReps: `${RUCK_MINUTES} min, ${RUCK_MILES} mi`,
        targetWeight: RUCK_WEIGHT,
      });
      templates.push({
        name: `C${cycleNum} ${day}`,
        description: `Week ${cycleNum} — ${DAY_FOCUS[day]}`,
        exercises,
      });
    }
  });
  return templates;
}

async function main() {
  console.log('Seeding AppSheet-derived workout routine templates...');
  for (const t of buildTemplates()) {
    const existing = await prisma.template.findFirst({ where: { name: t.name, isGlobal: true } });
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
        exercises: { create: t.exercises },
      },
    });
    console.log(`Created global template: "${t.name}"`);
  }
  console.log('Done!');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
