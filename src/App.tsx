import ERDCanvas from './components/ERDCanvas';
import ScreenDesignCanvas from './components/ScreenDesignCanvas';
import LoginPage from './components/LoginPage';
import ProjectListPage from './components/ProjectListPage';
import { useAuthStore } from './store/authStore';
import { useProjectStore } from './store/projectStore';
import { useSyncStore } from './store/syncStore';
import { useEffect } from 'react';

function App() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const { currentProjectId, projects } = useProjectStore();
  const { isConnected, isAuthenticatedOnSocket, connect, disconnect, authenticate, joinProject, leaveProject } = useSyncStore();

  // Guest Session Cleanup: Logout guest if browser was closed (sessionStorage cleared)
  useEffect(() => {
    const isSessionActive = sessionStorage.getItem('erd_session_active');

    if (!isSessionActive) {
      // Determine if user is guest based on LoginPage.tsx implementation
      const isGuest = user?.email === 'guest@test.com' || user?.id.startsWith('guest_');

      if (isAuthenticated && isGuest) {
        console.log('🧹 Clearing stale guest session on browser restart');
        logout();
        return;
      }

      // Mark session as active for this tab
      sessionStorage.setItem('erd_session_active', 'true');
    }
  }, [isAuthenticated, user, logout]);

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [isAuthenticated, connect, disconnect]);

  useEffect(() => {
    if (isConnected && isAuthenticated && user) {
      authenticate({
        id: user.id || 'anonymous',
        name: user.name || 'Anonymous',
        picture: user.picture
      });
    }
  }, [isConnected, isAuthenticated, user, authenticate]);

  useEffect(() => {
    if (isConnected && currentProjectId && isAuthenticatedOnSocket) {
      joinProject(currentProjectId);
    }
    return () => {
      if (isConnected) {
        leaveProject();
      }
    };
  }, [isConnected, isAuthenticatedOnSocket, currentProjectId, joinProject, leaveProject]);

  if (!isAuthenticated) return <LoginPage />;
  if (!currentProjectId) return <ProjectListPage />;

  // Determine project type and render appropriate canvas
  const currentProject = projects.find(p => p.id === currentProjectId);
  const projectType = currentProject?.projectType || 'ERD';

  if (projectType === 'SCREEN_DESIGN') {
    return (
      <div className="w-full h-screen">
        <ScreenDesignCanvas />
      </div>
    );
  }

  return (
    <div className="w-full h-screen">
      <ERDCanvas />
    </div>
  );
}

export default App;
