import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Pipeline } from './components/Pipeline';
import { ShipmentList } from './components/ShipmentList';
import { ViewState } from './types';
import { Construction } from 'lucide-react';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'pipeline':
        return <Pipeline />;
      case 'shipments':
        return <ShipmentList />;
      default:
        return (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
              <Construction size={40} className="text-gray-300" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2 capitalize">{currentView} Module</h2>
            <p className="max-w-md text-center">
              This module is currently under development. Check back later for updates on the {currentView} feature set.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <Sidebar currentView={currentView} onChangeView={setCurrentView} />
      
      {/* Main Content Area */}
      <main className="flex-1 ml-64 p-8 relative z-0 overflow-y-auto h-screen">
        {/* Decorative Background Blob for subtle ambiance */}
        <div className="fixed top-0 left-64 w-[500px] h-[500px] bg-indigo-200/20 rounded-full blur-[100px] -z-10 pointer-events-none translate-x-[-20%] translate-y-[-20%]" />
        <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-emerald-100/30 rounded-full blur-[100px] -z-10 pointer-events-none" />
        
        <div className="max-w-7xl mx-auto">
          {renderView()}
        </div>
      </main>
    </div>
  );
};

export default App;
