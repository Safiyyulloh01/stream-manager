/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { Topbar } from './components/Topbar';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import { useStore } from './store';
import { toast } from 'sonner';

export default function App() {
  const { initFetch, wsConnect } = useStore();

  useEffect(() => {
    initFetch();
    wsConnect();

    // Handle OAuth callback feedback
    const params = new URLSearchParams(window.location.search);
    const oauthSuccess = params.get('oauth_success');
    const oauthError = params.get('oauth_error');
    if (oauthSuccess) {
      toast.success('Account connected', { description: `${decodeURIComponent(oauthSuccess)} linked via Google.` });
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (oauthError) {
      toast.error('OAuth failed', { description: decodeURIComponent(oauthError) });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [initFetch, wsConnect]);

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground dark">
        <Topbar />
        
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto no-scrollbar relative">
            <div className="p-6">
              <Dashboard />
            </div>
          </main>
        </div>
        
        <Toaster theme="dark" position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}

