import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
window.storage = {
  async get(key) {
    const value = localStorage.getItem(key);
    return value ? { value } : null;
  },

  async set(key, value) {
    localStorage.setItem(key, value);
    return true;
  },

  async remove(key) {
    localStorage.removeItem(key);
    return true;
  }
};
