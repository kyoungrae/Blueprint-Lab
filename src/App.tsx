import ERDCanvas from './components/ERDCanvas';
import ScreenDesignCanvas from './components/ScreenDesignCanvas';
import ComponentCanvas from './components/ComponentCanvas';
import LoginPage from './components/LoginPage';
import ProjectListPage from './components/ProjectListPage';
import { useAuthStore } from './store/authStore';
import { useProjectStore } from './store/projectStore';
import { useSyncStore } from './store/syncStore';
import { useEffect } from 'react';
import { fetchWithAuth } from './utils/fetchWithAuth';

const AUTH_API = import.meta.env.VITE_AUTH_API_URL || 'http://localhost:3001/api/auth';

function App() {
  const { isAuthenticated, user, logout, updateUser } = useAuthStore();
  const { currentProjectId, projects } = useProjectStore();
  const { isConnected, isAuthenticatedOnSocket, connect, disconnect, authenticate, joinProject, leaveProject } = useSyncStore();

  // 401 시 자동 로그아웃 (토큰 만료 등)
  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, [logout]);

  // Fetch current user (tier 등) when authenticated with token
  useEffect(() => {
    if (!isAuthenticated || !localStorage.getItem('auth-token')) return;
    if (user?.email === 'guest@test.com' || user?.id?.startsWith?.('guest_')) return;

    fetchWithAuth(`${AUTH_API}/me`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.tier) updateUser({ tier: data.tier });
      })
      .catch(() => {});
  }, [isAuthenticated, updateUser]);

  // Refetch tier when tab regains focus (e.g. after admin changed tier in another tab)
  useEffect(() => {
    const onFocus = () => {
      if (!localStorage.getItem('auth-token')) return;
      fetchWithAuth(`${AUTH_API}/me`)
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.tier) updateUser({ tier: data.tier });
        })
        .catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [updateUser]);

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

  if (projectType === 'COMPONENT') {
    return (
      <div className="w-full h-screen">
        <ComponentCanvas />
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
