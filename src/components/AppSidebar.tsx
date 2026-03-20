import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Upload, Users, Building2, Search,
  Settings, BarChart3, Phone
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Upload Center', href: '/upload', icon: Upload },
  { name: 'Lead Explorer', href: '/leads', icon: Search },
  { name: 'Staff Performance', href: '/staff', icon: Users },
  { name: 'Agency Performance', href: '/agency', icon: Building2 },
  { name: 'Admin', href: '/admin', icon: Settings },
];

export default function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-60 bg-sidebar flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
          <Phone className="w-4 h-4 text-sidebar-primary-foreground" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-sidebar-accent-foreground tracking-tight">Beacon Call</h1>
          <p className="text-[10px] text-sidebar-muted uppercase tracking-widest">Dashboard</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
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

      {/* Footer */}
      <div className="px-5 py-4 border-t border-sidebar-border">
        <p className="text-[11px] text-sidebar-muted">v1.0 · Beacon Call Dashboard</p>
      </div>
    </aside>
  );
}
