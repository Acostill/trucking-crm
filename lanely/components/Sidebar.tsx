import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Kanban, 
  List, 
  Wallet, 
  BarChart3, 
  Settings, 
  LogOut
} from 'lucide-react';
import { ViewState } from '../types';

interface SidebarProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: any;
}

interface NavButtonProps {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}

const NavButton: React.FC<NavButtonProps> = ({ item, isActive, onClick }) => {
  const Icon = item.icon;
  
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group
        ${isActive 
          ? 'bg-white shadow-sm text-gray-900 ring-1 ring-gray-200' 
          : 'text-gray-500 hover:bg-white/50 hover:text-gray-700'
        }
      `}
    >
      <Icon size={18} className={`${isActive ? 'text-indigo-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
      <span>{item.label}</span>
    </button>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'shipments', label: 'Shipments', icon: Package },
    { id: 'pipeline', label: 'Pipeline', icon: Kanban },
    { id: 'commissions', label: 'Commissions', icon: Wallet },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  const bottomItems = [
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="w-64 h-screen fixed left-0 top-0 flex flex-col border-r border-gray-200/60 bg-gray-50/50 backdrop-blur-xl z-50">
      <div className="p-6 flex items-center gap-3">
        {/* Exact reproduction of the provided logo image */}
        <svg 
          width="40" 
          height="40" 
          viewBox="0 0 40 40" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0"
        >
          <circle cx="20" cy="20" r="20" fill="#111827"/>
          <path d="M12 28L28 12M28 12H18M28 12V22" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-2xl font-bold tracking-wide text-gray-900 uppercase">Lanely</span>
      </div>

      <div className="flex-1 px-3 py-4 flex flex-col gap-1">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">Operations</div>
        {navItems.map((item) => (
          <NavButton 
            key={item.id} 
            item={item} 
            isActive={currentView === item.id}
            onClick={() => onChangeView(item.id as ViewState)}
          />
        ))}
      </div>

      <div className="px-3 py-4 flex flex-col gap-1 border-t border-gray-200/60">
        {bottomItems.map((item) => (
          <NavButton 
            key={item.id} 
            item={item} 
            isActive={currentView === item.id}
            onClick={() => onChangeView(item.id as ViewState)}
          />
        ))}
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors">
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </div>
      
      {/* User Profile Snippet */}
      <div className="p-4 mx-3 mb-4 rounded-xl bg-white/60 border border-white/60 flex items-center gap-3">
        <img 
          src="https://picsum.photos/40/40" 
          alt="User" 
          className="w-8 h-8 rounded-full border border-white shadow-sm"
        />
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-gray-900">Alex Morgan</span>
          <span className="text-[10px] text-gray-500">Freight Broker</span>
        </div>
      </div>
    </div>
  );
};