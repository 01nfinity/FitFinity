const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const globalExercises = [
  // Chest
  { name: 'Bench Press', categories: ['Chest'], description: 'Lie flat on a bench. Grip the bar just wider than shoulder-width. Lower the bar to mid-chest, then press back up until arms are fully extended. Keep your feet flat on the floor and back slightly arched.' },
  { name: 'Incline Dumbbell Press', categories: ['Chest'], description: 'Set bench to 30-45 degrees. Hold dumbbells at shoulder width, palms facing forward. Press up until arms are extended, lower slowly back down. Targets the upper chest.' },
  { name: 'Push-Ups', categories: ['Chest'], description: 'Start in a plank position with hands shoulder-width apart. Lower your chest to the floor, keeping elbows at 45 degrees. Push back up to starting position. Keep core tight throughout.' },
  { name: 'Cable Fly', categories: ['Chest'], description: 'Set cables to chest height. Stand in the middle and bring handles together in front of you in a hugging motion. Slowly return with control. Focus on the stretch and squeeze.' },
  // Back
  { name: 'Deadlift', categories: ['Back'], description: 'Stand with feet hip-width, bar over mid-foot. Hinge at hips, grip the bar just outside legs. Keep back flat, brace core, then drive through your heels to stand up. Hinge back down with control.' },
  { name: 'Pull-Ups', categories: ['Back'], description: 'Hang from a bar with an overhand grip slightly wider than shoulders. Pull yourself up until your chin is above the bar. Lower slowly. Keep core engaged and avoid swinging.' },
  { name: 'Barbell Row', categories: ['Back'], description: 'Hinge forward at 45 degrees with back flat. Hold bar with overhand grip. Pull bar to lower ribcage, squeezing shoulder blades together. Lower with control. Keep hips still.' },
  { name: 'Lat Pulldown', categories: ['Back'], description: 'Sit at a lat pulldown machine, grip the bar wide. Pull the bar down to your upper chest while leaning back slightly. Control the return. Focus on pulling with your elbows, not your hands.' },
  { name: 'Dumbbell Row', categories: ['Back'], description: 'Place one hand and knee on a bench for support. Hold a dumbbell in the other hand, arm extended. Pull the weight to your hip, keeping elbow close to body. Lower slowly.' },
  // Shoulders
  { name: 'Overhead Press', categories: ['Shoulders'], description: 'Stand with feet shoulder-width apart, bar at shoulder height. Brace your core and press the bar directly overhead until arms are locked out. Lower back to shoulders with control.' },
  { name: 'Lateral Raises', categories: ['Shoulders'], description: 'Hold dumbbells at your sides. Raise them out to the sides until parallel with the floor, keeping a slight bend in the elbows. Lower slowly. Do not swing.' },
  { name: 'Front Raises', categories: ['Shoulders'], description: 'Hold dumbbells at your thighs. Raise one or both arms forward to shoulder height, keeping them straight. Lower slowly. Targets the front deltoid.' },
  // Arms
  { name: 'Dumbbell Curl', categories: ['Biceps'], description: 'Stand holding dumbbells at your sides, palms facing forward. Curl the weights to your shoulders by bending your elbows. Keep your upper arms stationary. Lower slowly.' },
  { name: 'Barbell Curl', categories: ['Biceps'], description: 'Stand holding a barbell with an underhand grip at hip width. Curl the bar to your shoulders without swinging. Lower slowly and fully extend at the bottom.' },
  { name: 'Tricep Pushdowns', categories: ['Triceps'], description: 'Stand at a cable machine with a rope or bar attachment at head height. Push the attachment down by extending your elbows until arms are straight. Keep elbows at sides. Return slowly.' },
  { name: 'Skull Crushers', categories: ['Triceps'], description: 'Lie on a bench, hold a barbell or dumbbells above your chest. Keeping upper arms vertical, bend elbows to lower the weight toward your forehead. Extend back up.' },
  // Legs
  { name: 'Squat', categories: ['Legs'], description: 'Stand with feet shoulder-width apart, bar on upper back. Push hips back and bend knees to lower until thighs are parallel to floor. Drive through heels to stand. Keep chest up and knees over toes.' },
  { name: 'Romanian Deadlift', categories: ['Legs'], description: 'Hold a barbell at hips. Hinge forward by pushing hips back, keeping back flat and legs mostly straight with a slight knee bend. Lower bar to mid-shin. Drive hips forward to stand.' },
  { name: 'Leg Press', categories: ['Legs'], description: 'Sit in the leg press machine with feet shoulder-width on the platform. Lower the weight until knees are at 90 degrees. Press back up without locking out knees. Keep lower back on the seat.' },
  { name: 'Leg Curl', categories: ['Legs'], description: 'Lie face down on the leg curl machine. Curl your heels toward your glutes against the resistance. Lower slowly. Targets the hamstrings.' },
  { name: 'Leg Extension', categories: ['Legs'], description: 'Sit in the leg extension machine. Extend your legs until straight, then lower slowly. Isolates the quadriceps. Do not swing or use momentum.' },
  { name: 'Calf Raises', categories: ['Calves'], description: 'Stand on the edge of a step or platform with heels off the edge. Rise up onto your toes as high as possible, then lower your heels below the platform. Control the movement throughout.' },
  { name: 'Lunges', categories: ['Legs'], description: 'Step forward with one foot, lowering your back knee toward the floor. Keep your front knee over your front foot. Push off to return to standing. Alternate legs or complete one side at a time.' },
  // Core
  { name: 'Plank', categories: ['Core'], description: 'Hold a push-up position on your forearms. Keep your body in a straight line from head to heels. Engage your core, glutes, and legs. Do not let hips sag or rise.' },
  { name: 'Crunches', categories: ['Core'], description: 'Lie on your back with knees bent. Place hands behind your head. Curl your upper body toward your knees using your abs. Lower slowly. Do not pull on your neck.' },
  { name: 'Russian Twists', categories: ['Core'], description: 'Sit with knees bent, lean back slightly with back straight. Hold a weight and rotate your torso side to side, touching the weight to the floor on each side. Keep core tight.' },
];

async function main() {
  console.log('Seeding global exercises...');
  for (const e of globalExercises) {
    const existing = await prisma.exercise.findFirst({ where: { name: e.name, isGlobal: true } });
    if (existing) { console.log(`Skipping "${e.name}"`); continue; }
    await prisma.exercise.create({
      data: { name: e.name, categories: e.categories, description: e.description, isGlobal: true, userId: null }
    });
    console.log(`Created: "${e.name}"`);
  }
  console.log('Done!');
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
