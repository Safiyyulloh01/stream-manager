import { useState, useRef, useEffect } from 'react';
import { Search, Youtube, User, LogOut, Settings as SettingsIcon, Plus, X, Loader2, Tv, Users, Radio, Link, CheckCircle } from 'lucide-react';
import { useStore } from '../store';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuGroup } from './ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { toast } from 'sonner';

export function Topbar() {
  const { connectedAccounts, activeAccount, setActiveAccount, addAccount, removeAccount, addChannel, trackedChannels } = useStore();
  const [accountToRemove, setAccountToRemove] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveResult, setResolveResult] = useState<{type: string; message: string; channel?: any; stream?: any} | null>(null);
  const linkRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (linkRef.current && !linkRef.current.contains(e.target as Node)) setResolveResult(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleResolveLink = async () => {
    const url = linkInput.trim();
    if (!url) return;
    setResolving(true);
    setResolveResult(null);
    try {
      const res = await fetch('/api/links/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = await res.json();
        setResolveResult(data);
        if (data.type === 'channel' && data.id) useStore.getState().initFetch();
        if (data.type === 'video' && data.stream) useStore.getState().refreshCurrentAccount();
      } else {
        const err = await res.json();
        toast.error('Failed', { description: err.error || 'Could not resolve link' });
      }
    } catch(e) {
      toast.error('Error', { description: 'Could not reach server' });
    }
    setResolving(false);
  };

  const handleAddAccount = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      if (res.ok) { const { url } = await res.json(); if (url) { window.location.href = url; return; } }
    } catch(e) {}
    toast.error('OAuth not configured', { description: 'Set OAUTH_CLIENT_ID in .env to enable account connections.' });
  };

  const handleSignOut = () => {
    useStore.setState({ connectedAccounts: [], activeAccount: null, trackedChannels: [], streams: [], mirroringJobs: [], stats: null });
    toast.success('Signed out', { description: 'Accounts cleared from this session.' });
    setShowSignOut(false);
  };

  return (
    <header className="h-16 w-full shrink-0 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 z-10 relative">
      <div className="flex items-center gap-3 min-w-[180px]">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <Youtube className="w-5 h-5" />
        </div>
        <h1 className="font-semibold text-lg tracking-tight text-foreground hidden sm:block">Stream Manager</h1>
      </div>

      {/* Link Input */}
      <div className="flex-1 flex justify-center max-w-xl mx-2 lg:mx-4 relative" ref={linkRef}>
        <div className="relative w-full">
          <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Paste a YouTube link — channel or video..." 
            className="w-full bg-background border-border pl-10 pr-10 focus-visible:ring-primary focus-visible:ring-1 border-0 ring-offset-0 placeholder:text-muted-foreground/50 transition-all rounded-full h-10"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleResolveLink()}
          />
          {linkInput && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => { setLinkInput(''); setResolveResult(null); }}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {resolving && (
          <div className="absolute top-full mt-2 w-full bg-card border border-border rounded-xl shadow-xl z-50">
            <div className="flex items-center justify-center py-4 gap-2">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <span className="text-sm text-muted-foreground">Resolving link...</span>
            </div>
          </div>
        )}

        {resolveResult && !resolving && (
          <div className="absolute top-full mt-2 w-full bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="p-3">
              <div className="flex items-start gap-3">
                {resolveResult.type === 'channel' && resolveResult.channel && (
                  <>
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={resolveResult.channel.avatar} />
                      <AvatarFallback>{resolveResult.channel.name?.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{resolveResult.channel.name}</p>
                      <p className="text-xs text-muted-foreground">{resolveResult.channel.subscriberCount} subscribers</p>
                      <p className="text-xs text-primary mt-1 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Tracked
                      </p>
                    </div>
                  </>
                )}
                {resolveResult.type === 'video' && resolveResult.stream && (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{resolveResult.stream.title}</p>
                    <p className="text-xs text-primary mt-1 flex items-center gap-1">
                      <Radio className="w-3 h-3" /> Mirroring started
                    </p>
                  </div>
                )}
                {resolveResult.type === 'video' && !resolveResult.stream && (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{resolveResult.message}</p>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="sm" className="mt-2 w-full text-xs" onClick={() => setResolveResult(null)}>Dismiss</Button>
            </div>
          </div>
        )}
      </div>

      {/* Account Area */}
      <div className="flex items-center gap-2 lg:gap-4 min-w-[180px] justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger render={
            <Button variant="ghost" className="relative h-10 rounded-full pl-2 pr-3 lg:pr-4 flex items-center gap-3 bg-background/50 hover:bg-background border border-border">
              <Avatar className="h-7 w-7">
                <AvatarImage src={activeAccount?.avatar} alt={activeAccount?.name} />
                <AvatarFallback className="bg-primary/20 text-primary text-xs">{activeAccount?.name?.charAt(0) || 'U'}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium truncate max-w-[80px] lg:max-w-[120px] hidden sm:block">{activeAccount?.name}</span>
            </Button>
          } />
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Connected Accounts</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {connectedAccounts.map((account) => (
                <DropdownMenuItem key={account.id}
                  className={`cursor-pointer gap-2 ${activeAccount?.id === account.id ? 'bg-primary/10 text-primary focus:bg-primary/20 focus:text-primary' : ''}`}
                  onClick={() => setActiveAccount(account)}>
                  <Avatar className="h-5 w-5"><AvatarImage src={account.avatar} /><AvatarFallback>{account.name.charAt(0)}</AvatarFallback></Avatar>
                  <span className="truncate flex-1">{account.name}</span>
                  {activeAccount?.id === account.id && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                  <button className="opacity-0 hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity ml-1" onClick={(e) => { e.stopPropagation(); setAccountToRemove(account.id); }}><X className="w-3 h-3" /></button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer gap-2" onClick={handleAddAccount}><Plus className="w-4 h-4" /> Add Account</DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => setShowSettings(true)}><SettingsIcon className="w-4 h-4" /> Account Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer gap-2 text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => setShowSignOut(true)}><LogOut className="w-4 h-4" /> Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Dialogs */}
      <AlertDialog open={!!accountToRemove} onOpenChange={(open) => !open && setAccountToRemove(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader><AlertDialogTitle>Remove Account?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this YouTube account and all its data.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (accountToRemove) { removeAccount(accountToRemove); toast.success('Account removed'); setAccountToRemove(null); } }} className="bg-destructive">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border">
          <DialogHeader><DialogTitle>Account Settings</DialogTitle>
            <DialogDescription>Manage your connected accounts.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {connectedAccounts.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No accounts connected.</p>
            : connectedAccounts.map(acc => (
              <div key={acc.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-background/50">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8"><AvatarImage src={acc.avatar} /><AvatarFallback>{acc.name.charAt(0)}</AvatarFallback></Avatar>
                  <div><p className="text-sm font-medium">{acc.name}</p><p className="text-xs text-muted-foreground">{acc.subscriber_count || ''}</p></div>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => { setShowSettings(false); setAccountToRemove(acc.id); }}><X className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
            {activeAccount && (
              <div className="border-t border-border pt-4 mt-2">
                <p className="text-xs text-muted-foreground mb-2">To connect another channel, click <strong>Add Account</strong> in the dropdown.</p>
                <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={handleAddAccount}><Plus className="w-3.5 h-3.5" /> Connect Another Channel</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showSignOut} onOpenChange={setShowSignOut}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader><AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>Clear all connected accounts from this session.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSignOut} className="bg-destructive">Sign out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}
