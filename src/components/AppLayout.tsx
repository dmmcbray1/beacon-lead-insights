import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="pl-60 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
