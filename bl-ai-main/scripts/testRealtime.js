import io from 'socket.io-client';
// Read from .env
import dotenv from 'dotenv';
dotenv.config();

const url = 'http://localhost:8000';
console.log('Connecting to', url);
const socket = io(url);

// Simulating a userId (need an actual DB userId later if testing properly)
// We'll emit directly from backend instead if we can write a mock endpoint.
