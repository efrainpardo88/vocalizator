import React from 'react';
import { createRoot } from 'react-dom/client';

import VocalLines from './VocalLines.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <VocalLines />
  </React.StrictMode>
);
