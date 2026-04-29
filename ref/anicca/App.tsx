import React from 'react';
import { Canvas } from './components/Canvas';

const App: React.FC = () => {
  return (
    <div className="w-screen h-screen overflow-hidden font-sans">
      <Canvas />
    </div>
  );
};

export default App;