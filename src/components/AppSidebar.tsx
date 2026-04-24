import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Upload, Users, Building2, Search,
  Settings, LogOut, ShieldCheck, Moon, Sun, UserCog,
  DollarSign, TrendingUp
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function AppSidebar() {
  const location = useLocation();
  const { user, isAdmin, signOut } = useAuth();
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved ? saved === 'dark' : document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard, adminOnly: false },
    { name: 'Upload Center', href: '/upload', icon: Upload, adminOnly: false },
    { name: 'Lead Explorer', href: '/leads', icon: Search, adminOnly: false },
    { name: 'Staff Performance', href: '/staff', icon: Users, adminOnly: false },
    { name: 'Sales Tracking', href: '/sales', icon: DollarSign, adminOnly: false },
    { name: 'ROI Tracking', href: '/roi', icon: TrendingUp, adminOnly: false },
    { name: 'Staff Mgmt', href: '/staff-management', icon: UserCog, adminOnly: false },
    { name: 'Agency Performance', href: '/agency', icon: Building2, adminOnly: true },
    { name: 'User Management', href: '/admin/users', icon: ShieldCheck, adminOnly: true },
    { name: 'Admin', href: '/admin', icon: Settings, adminOnly: true },
  ];

  const visibleNav = navigation.filter(item => !item.adminOnly || isAdmin);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-60 bg-sidebar flex flex-col">
      {/* Logo */}
      <div className="flex items-center justify-center px-4 h-24 bg-white border-b border-sidebar-border">
        <img
          src="/beacon-logo.png"
          alt="Beacon Territory Group"
          className="max-h-full max-w-full object-contain"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleNav.map((item) => {
          const isActive = item.href === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.href);
          return (
            <NavLink
              key={item.name}
              to={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-150 ${
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.name}
            </NavLink>
          );
        })}
      </nav>

      {/* User + Sign Out */}
      <div className="px-3 py-4 border-t border-sidebar-border space-y-2">
        {user && (
          <div className="px-3">
            <p className="text-xs text-sidebar-muted truncate">{user.email}</p>
            {isAdmin && (
              <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-primary bg-sidebar-primary/10 px-1.5 py-0.5 rounded">
                Admin
              </span>
            )}
          </div>
        )}
        <button
          onClick={() => setIsDark((d) => { const next = !d; localStorage.setItem('theme', next ? 'dark' : 'light'); return next; })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-colors duration-150 w-full"
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun className="w-4 h-4 shrink-0" aria-hidden="true" /> : <Moon className="w-4 h-4 shrink-0" aria-hidden="true" />}
          {isDark ? 'Light Mode' : 'Dark Mode'}
        </button>
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-colors duration-150 w-full"
        >
          <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
          Sign Out
        </button>
        <p className="px-3 text-[11px] text-sidebar-muted">v1.0 · Beacon Call Dashboard</p>
      </div>
    </aside>
  );
}
