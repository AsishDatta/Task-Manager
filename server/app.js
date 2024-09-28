import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import env from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authMiddleware } from './auth.js'; // Named import

env.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("Could not connect to MongoDB", err));

// User Schema and Model
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

const User = mongoose.model('User', UserSchema);

// Task Schema and Model
const TaskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: String,
    dueDate: Date,
    status: {
        type: String,
        enum: ['To Do', 'In Progress', 'Completed'],
        default: 'To Do'
    },
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High'],
        default: 'Medium'
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
});



const Task = mongoose.model('Task', TaskSchema);

// Register Route
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // Check if the user already exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create a new user
        user = new User({
            username,
            email,
            password: hashedPassword,
        });

        await user.save();

        // Create and send JWT
        const token = jwt.sign({ userId: user._id }, process.env.JWT_TOKEN, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Check if the user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Create and send JWT
        const token = jwt.sign({ userId: user._id }, process.env.JWT_TOKEN, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
});

// Middleware to protect routes
app.use(authMiddleware);

// Get all tasks for authenticated user
app.get('/tasks', async (req, res) => {
    try {
        const tasks = await Task.find({ userId: req.user.userId });
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Create a new task
app.post('/tasks', authMiddleware, async (req, res) => {
    try {
        const { title, description, dueDate, status, priority } = req.body;
        const task = new Task({
            title,
            description,
            dueDate,
            status,
            priority,
            userId: req.userId // Extracted from token
        });
        await task.save();
        res.status(201).json(task);
    } catch (error) {
        console.error("Error creating task:", error);
        res.status(500).json({ message: 'Failed to add task. Please try again.' });
    }
});


// Update a task
app.put('/tasks/:id', async (req, res) => {
    try {
        const updatedTask = await Task.findByIdAndUpdate(
            { _id: req.params.id, userId: req.user.userId }, // Ensure the task belongs to the user
            req.body,
            { new: true }
        );
        if (!updatedTask) {
            return res.status(404).json({ message: 'Task not found' });
        }
        res.json(updatedTask);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete a task
app.delete('/tasks/:id', async (req, res) => {
    try {
        const task = await Task.findByIdAndDelete({ _id: req.params.id, userId: req.user.userId });
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
