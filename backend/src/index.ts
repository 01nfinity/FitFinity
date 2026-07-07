import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 5001;

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors());
app.use(express.json());

// Setup Multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// --- AUTHENTICATION ---
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) return res.status(400).json({ error: 'Username already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    // First registered user becomes admin
    const userCount = await prisma.user.count();
    const isAdmin = userCount === 0;
    
    const user = await prisma.user.create({
      data: { username, passwordHash, isAdmin }
    });
    
    const token = jwt.sign({ userId: user.id, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: user.id, username: user.username, isAdmin: user.isAdmin });
  } catch (error) {
    res.status(500).json({ error: 'Error registering user' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.id, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, userId: user.id, username: user.username, isAdmin: user.isAdmin });
  } catch (error) {
    res.status(500).json({ error: 'Error logging in' });
  }
});

// --- AUTH MIDDLEWARE ---
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

const requireAdmin = (req: any, res: any, next: any) => {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Admin access required' });
  next();
};

// --- ADMIN ROUTES ---
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req: any, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, isAdmin: true }
  });
  res.json(users);
});

app.put('/api/admin/users/:id', authenticateToken, requireAdmin, async (req: any, res) => {
  const { id } = req.params;
  const { isAdmin } = req.body;
  const user = await prisma.user.update({
    where: { id: parseInt(id) },
    data: { isAdmin },
    select: { id: true, username: true, isAdmin: true }
  });
  res.json(user);
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req: any, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.user.userId) return res.status(400).json({ error: 'Cannot delete yourself' });
  await prisma.user.delete({ where: { id: parseInt(id) } });
  res.json({ success: true });
});

// Not admin-gated by middleware: any authenticated user may reset their own
// password; only admins may reset someone else's.
app.put('/api/users/:id/password', authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  const targetId = parseInt(id);

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const isSelf = req.user.userId === targetId;
  if (!isSelf && !req.user.isAdmin) return res.status(403).json({ error: 'Unauthorized' });

  const existing = await prisma.user.findUnique({ where: { id: targetId } });
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: targetId }, data: { passwordHash } });
  res.json({ success: true });
});

// --- EXERCISES ---
app.get('/api/exercises', authenticateToken, async (req: any, res) => {
  const exercises = await prisma.exercise.findMany({
    where: {
      OR: [
        { isGlobal: true },
        { userId: req.user.userId }
      ]
    }
  });
  res.json(exercises);
});

function parseCategories(raw: any): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((c: any) => String(c).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

app.post('/api/exercises', authenticateToken, upload.single('image'), async (req: any, res) => {
  const { name, description } = req.body;
  const wantsGlobal = req.body.isGlobal === 'true' || req.body.isGlobal === true;
  const isGlobal = !!req.user.isAdmin && wantsGlobal;
  // An uploaded file takes priority over a pasted image URL.
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : (req.body.imageUrl || null);
  const categories = parseCategories(req.body.categories);

  const exercise = await prisma.exercise.create({
    data: {
      name,
      categories,
      description,
      imageUrl,
      isGlobal,
      userId: isGlobal ? null : req.user.userId
    },
  });
  res.json(exercise);
});

app.put('/api/exercises/:id', authenticateToken, upload.single('image'), async (req: any, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  const existing = await prisma.exercise.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return res.status(404).json({ error: 'Exercise not found' });

  const isOwner = existing.userId === req.user.userId;
  const canManageGlobal = existing.isGlobal && req.user.isAdmin;
  if (!isOwner && !canManageGlobal) return res.status(403).json({ error: 'Unauthorized' });

  // Only admins may change global visibility; other users keep the existing flag
  const wantsGlobal = req.body.isGlobal === 'true' || req.body.isGlobal === true;
  const isGlobal = req.user.isAdmin ? wantsGlobal : existing.isGlobal;

  const dataToUpdate: any = {
    name,
    categories: parseCategories(req.body.categories),
    description,
    isGlobal,
    userId: isGlobal ? null : (existing.userId ?? req.user.userId),
  };
  // An uploaded file takes priority over a pasted image URL; an explicitly
  // cleared URL field removes the image, otherwise the existing image is kept.
  if (req.file) {
    dataToUpdate.imageUrl = `/uploads/${req.file.filename}`;
  } else if (req.body.imageUrl !== undefined) {
    dataToUpdate.imageUrl = req.body.imageUrl || null;
  }

  const exercise = await prisma.exercise.update({
    where: { id: parseInt(id) },
    data: dataToUpdate,
  });
  res.json(exercise);
});

// --- TEMPLATES ---
app.get('/api/templates', authenticateToken, async (req: any, res) => {
  const templates = await prisma.template.findMany({
    where: {
      OR: [
        { isGlobal: true },
        { userId: req.user.userId }
      ]
    },
    include: { exercises: true }
  });
  res.json(templates);
});

app.get('/api/templates/:id', authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  const template = await prisma.template.findUnique({
    where: { id: parseInt(id) },
    include: { exercises: true }
  });
  if (!template) return res.status(404).json({ error: 'Template not found' });
  if (!template.isGlobal && template.userId !== req.user.userId) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  res.json(template);
});

app.post('/api/templates', authenticateToken, async (req: any, res) => {
  const { name, description, exercises } = req.body;
  const wantsGlobal = req.body.isGlobal === true || req.body.isGlobal === 'true';
  const isGlobal = !!req.user.isAdmin && wantsGlobal;
  const template = await prisma.template.create({
    data: {
      name,
      description,
      isGlobal,
      userId: isGlobal ? null : req.user.userId,
      exercises: {
        create: exercises.map((e: any) => ({
          exerciseName: e.name,
          targetSets: e.sets,
          targetReps: e.repsString,
          targetWeight: e.weight
        }))
      }
    },
    include: { exercises: true }
  });
  res.json(template);
});

app.put('/api/templates/:id', authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  const { name, description, exercises } = req.body;

  const existing = await prisma.template.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return res.status(404).json({ error: 'Template not found' });

  const isOwner = existing.userId === req.user.userId;
  const canManageGlobal = existing.isGlobal && req.user.isAdmin;
  if (!isOwner && !canManageGlobal) return res.status(403).json({ error: 'Unauthorized' });

  // Only admins may change global visibility; other users keep the existing flag
  const wantsGlobal = req.body.isGlobal === true || req.body.isGlobal === 'true';
  const isGlobal = req.user.isAdmin ? wantsGlobal : existing.isGlobal;

  if (Array.isArray(exercises)) {
    await prisma.templateExercise.deleteMany({ where: { templateId: parseInt(id) } });
  }

  const template = await prisma.template.update({
    where: { id: parseInt(id) },
    data: {
      name,
      description,
      isGlobal,
      userId: isGlobal ? null : (existing.userId ?? req.user.userId),
      ...(Array.isArray(exercises) ? {
        exercises: {
          create: exercises.map((e: any) => ({
            exerciseName: e.name,
            targetSets: e.sets,
            targetReps: e.repsString,
            targetWeight: e.weight
          }))
        }
      } : {})
    },
    include: { exercises: true }
  });
  res.json(template);
});

app.delete('/api/templates/:id', authenticateToken, async (req: any, res) => {
  const { id } = req.params;

  const existing = await prisma.template.findUnique({ where: { id: parseInt(id) } });
  if (!existing) return res.status(404).json({ error: 'Template not found' });

  const isOwner = existing.userId === req.user.userId;
  const canManageGlobal = existing.isGlobal && req.user.isAdmin;
  if (!isOwner && !canManageGlobal) return res.status(403).json({ error: 'Unauthorized' });

  await prisma.template.delete({ where: { id: parseInt(id) } });
  res.json({ success: true });
});

// --- LOGS ---
app.get('/api/logs', authenticateToken, async (req: any, res) => {
  const logs = await prisma.log.findMany({
    where: { userId: req.user.userId },
    include: { sets: true },
    orderBy: [{ date: 'desc' }, { id: 'desc' }]
  });
  res.json(logs);
});

app.get('/api/logs/:id', authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  const log = await prisma.log.findUnique({ where: { id: parseInt(id) }, include: { sets: true } });
  if (!log || log.userId !== req.user.userId) return res.status(404).json({ error: 'Log not found' });
  res.json(log);
});

app.post('/api/logs', authenticateToken, async (req: any, res) => {
  const { date, templateName, sentiment, sets } = req.body;
  const log = await prisma.log.create({
    data: {
      userId: req.user.userId,
      date,
      templateName,
      sentiment: sentiment != null ? String(sentiment) : null,
      sets: {
        create: (sets || []).map((s: any) => ({
          exerciseName: s.exerciseName,
          weight: s.weight,
          reps: s.reps,
          completed: !!s.completed,
        }))
      }
    },
    include: { sets: true }
  });
  res.json(log);
});

app.put('/api/logs/:id', authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  const { date, templateName, sentiment, sets } = req.body;

  const existing = await prisma.log.findUnique({ where: { id: parseInt(id) } });
  if (!existing || existing.userId !== req.user.userId) return res.status(403).json({ error: 'Unauthorized' });

  await prisma.logSet.deleteMany({ where: { logId: parseInt(id) } });

  const log = await prisma.log.update({
    where: { id: parseInt(id) },
    data: {
      date,
      templateName,
      sentiment: sentiment != null ? String(sentiment) : null,
      sets: {
        create: (sets || []).map((s: any) => ({
          exerciseName: s.exerciseName,
          weight: s.weight,
          reps: s.reps,
          completed: !!s.completed,
        }))
      }
    },
    include: { sets: true }
  });
  res.json(log);
});

app.delete('/api/logs/:id', authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  const existing = await prisma.log.findUnique({ where: { id: parseInt(id) } });
  if (!existing || existing.userId !== req.user.userId) return res.status(403).json({ error: 'Unauthorized' });
  await prisma.log.delete({ where: { id: parseInt(id) } });
  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
