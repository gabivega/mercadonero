import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { sendRegistrationEmail } from '../services/emailService.js';

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

export const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email y password requeridos' });
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email ya existe' });
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);
    const user = await User.create({ name, email, password: hashed, role });
    const token = generateToken(user);

    // Intentar enviar email de registro (no bloquear el registro si falla)
    try {
      await sendRegistrationEmail(user.email);
    } catch (emailErr) {
      console.error('Error sending registration email:', emailErr);
    }

    res.status(201).json({ success: true, data: { id: user._id, email: user.email, name: user.name }, token, message: 'Usuario creado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email y password requeridos' });
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ success: false, message: 'Credenciales inválidas' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ success: false, message: 'Credenciales inválidas' });
    const token = generateToken(user);
    res.json({ success: true, data: { id: user._id, email: user.email, name: user.name }, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};
