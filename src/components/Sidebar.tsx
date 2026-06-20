import { useState } from 'react';
import { Plus, MoreVertical, Settings, Trash2, Home, Activity, Tv, Search, X, Menu, Bell } from 'lucide-react';
import { useStore } from '../store';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { TrackedChannel } from '../types';
import { toast } from 'sonner';

export function Sidebar() {
  const { trackedChannels, removeChannel, updateChannelSettings, addChannel, viewFilter, setViewFilter, streams } = useStore();
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  // Derive current channel state from store so toggles reflect in real time
  const selectedChannel = selectedChannelId ? trackedChannels.find(c => c.id === selectedChannelId) ?? null : null;
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [channelToRemove, setChannelToRemove] = useState<TrackedChannel | null>(null);
  const [newChannelUrl, setNewChannelUrl] = useState('');

  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleSaveSettings = () => {
    setSelectedChannelId(null);
  };

  const handleAddChannel = () => {
    if (!newChannelUrl.trim()) return;
    
    let channelName = 'New Channel';
    let channelId = 'UC_' + Date.now();
    let avatar = 'https://i.pravatar.cc/150?u=' + Date.now();

    // Try to resolve from URL
    if (newChannelUrl.includes('youtube.com/@')) {
      const handle = newChannelUrl.split('youtube.com/@')[1]?.split('/')[0]?.split('?')[0] || '';
      if (handle) {
        channelName = handle;
        channelId = 'UC_' + handle;
        avatar = `https://api.dicebear.com/9.x/icons/svg?seed=${handle}&backgroundColor=7AE2CF`;
      }
    } else if (newChannelUrl.includes('/channel/')) {
      const cid = newChannelUrl.split('/channel/')[1]?.split('/')[0]?.split('?')[0] || '';
      if (cid) {
        channelId = cid;
        channelName = 'Channel ' + cid.slice(0, 8);
      }
    } else {
      channelName = newChannelUrl;
    }

    addChannel({
      id: `c${Date.now()}`,
      channelId,
      name: channelName,
      avatar,
      subscriberCount: '...',
      autoMonitor: true,
      autoMirror: false,
      scanFrequency: 5,
    });
    
    toast.success('Channel Added', { description: 'Now monitoring for live streams.' });
    setNewChannelUrl('');
    setIsAddOpen(false);
  };

  const confirmRemove = () => {
    if (channelToRemove) {
      removeChannel(channelToRemove.id);
      toast.success('Channel removed', { description: 'Stopped tracking channel streams.' });
      setChannelToRemove(null);
    }
  };

  const sidebarContent = (
    <>
      <div className="p-4 flex flex-col gap-1">
        <Button variant={viewFilter === 'all' ? "secondary" : "ghost"} className="w-full justify-start gap-3 h-10 hover:bg-card" onClick={() => setViewFilter('all')}>
          <Home className="w-4 h-4 text-muted-foreground" />
          <span>Dashboard</span>
        </Button>
        <Button variant={viewFilter === 'MIRRORING' ? "secondary" : "ghost"} className="w-full justify-start gap-3 h-10 hover:bg-card" onClick={() => setViewFilter('MIRRORING')}>
          <Activity className="w-4 h-4 text-muted-foreground" />
          <span>Active Mirrors</span>
          <span className="ml-auto bg-primary text-primary-foreground text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold">
            {streams.filter(s => s.status === 'MIRRORING').length}
          </span>
        </Button>
        <Button variant={viewFilter === 'LIVE' ? "secondary" : "ghost"} className="w-full justify-start gap-3 h-10 hover:bg-card" onClick={() => setViewFilter('LIVE')}>
          <Tv className="w-4 h-4 text-muted-foreground" />
          <span>Live Streams</span>
          <span className="ml-auto bg-red-500/20 text-red-400 text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold">
            {streams.filter(s => s.status === 'LIVE').length}
          </span>
        </Button>
      </div>

      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Tracked Channels
        </h2>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <Tooltip>
            <TooltipTrigger render={
              <DialogTrigger render={
                <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-card">
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              } />
            } />
            <TooltipContent side="right">
              <p>Add new channel</p>
            </TooltipContent>
          </Tooltip>

          <DialogContent className="sm:max-w-[425px] bg-card border-border">
            <DialogHeader>
              <DialogTitle>Add Tracked Channel</DialogTitle>
              <DialogDescription>
                Enter a YouTube channel URL or username to begin monitoring.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="flex flex-col gap-3">
                <Label htmlFor="url">YouTube Channel URL</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="url"
                    placeholder="https://youtube.com/@channel" 
                    className="pl-9 bg-background/50 border-border"
                    value={newChannelUrl}
                    onChange={(e) => setNewChannelUrl(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAddChannel} className="bg-primary text-primary-foreground hover:bg-primary/90">Add Channel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="flex flex-col gap-1 pb-4">
          {trackedChannels.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">No tracked channels yet.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Click + to add your first channel.</p>
            </div>
          ) : trackedChannels.map((channel) => (
            <div key={channel.id} className="group flex items-center justify-between p-2 rounded-lg hover:bg-card transition-colors cursor-pointer">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="relative">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={channel.avatar} />
                    <AvatarFallback>{channel.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-background rounded-full"></div>
                </div>
                <div className="flex flex-col overflow-hidden">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate max-w-[120px]">{channel.name}</span>
                    {channel.autoMirror && (
                      <span className="text-[8px] font-bold bg-primary/20 text-primary rounded-full px-1.5 py-0.5 leading-none">MIRROR</span>
                    )}
                    {channel.autoMonitor && !channel.autoMirror && (
                      <span className="text-[8px] font-bold bg-blue-500/20 text-blue-400 rounded-full px-1.5 py-0.5 leading-none">WATCH</span>
                    )}
                  </div>
                  {channel.subscriberCount && (
                    <span className="text-[10px] text-muted-foreground">{channel.subscriberCount} subs</span>
                  )}
                </div>
              </div>
              
              <Dialog open={selectedChannel?.id === channel.id} onOpenChange={(open) => !open && setSelectedChannelId(null)}>
                <DropdownMenu>
                  <DropdownMenuTrigger render={
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  } />
                  <DropdownMenuContent align="end" className="w-48">
                    <DialogTrigger nativeButton={false} render={
                      <DropdownMenuItem className="gap-2 focus:bg-card cursor-pointer" onClick={() => setSelectedChannelId(channel.id)}>
                        <Settings className="w-4 h-4" /> Channel Settings
                      </DropdownMenuItem>
                    } />
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer gap-2"
                      onClick={() => setChannelToRemove(channel)}
                    >
                      <Trash2 className="w-4 h-4" /> Remove Channel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DialogContent className="sm:max-w-[425px] bg-card border-border">
                  <DialogHeader>
                    <DialogTitle>Channel Settings</DialogTitle>
                    <DialogDescription>
                      Configure monitoring and mirroring preferences for {selectedChannel?.name}.
                    </DialogDescription>
                  </DialogHeader>
                  
                  {selectedChannel && (
                    <div className="grid gap-6 py-4">
                      <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-background/50">
                        <div className="space-y-0.5">
                          <Label className="text-base">Auto Monitor</Label>
                          <p className="text-sm text-muted-foreground">Scan for new live streams automatically.</p>
                        </div>
                        <Switch 
                          checked={selectedChannel.autoMonitor}
                          onCheckedChange={(checked) => updateChannelSettings(selectedChannel.id, { autoMonitor: checked })}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-background/50">
                        <div className="space-y-0.5">
                          <Label className="text-base text-primary">Auto Mirror</Label>
                          <p className="text-sm text-muted-foreground">Automatically relay detected streams.</p>
                        </div>
                        <Switch 
                          checked={selectedChannel.autoMirror}
                          onCheckedChange={(checked) => updateChannelSettings(selectedChannel.id, { autoMirror: checked })}
                        />
                      </div>

                      <div className="space-y-3">
                        <Label>Scan Frequency</Label>
                        <Select 
                          value={selectedChannel.scanFrequency.toString()} 
                          onValueChange={(val) => updateChannelSettings(selectedChannel.id, { scanFrequency: parseInt(val) })}
                        >
                          <SelectTrigger className="w-full bg-background border-border">
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Every 1 minute</SelectItem>
                            <SelectItem value="2">Every 2 minutes</SelectItem>
                            <SelectItem value="5">Every 5 minutes</SelectItem>
                            <SelectItem value="10">Every 10 minutes</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">How often the engine checks for new broadcasts.</p>
                      </div>

                      <div className="space-y-3 pt-2 border-t border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <Bell className="w-4 h-4 text-muted-foreground" />
                          <Label className="text-base font-medium">Notifications</Label>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Live stream detected</span>
                          <Switch 
                            checked={selectedChannel.notifications?.live_detected ?? true}
                            onCheckedChange={(checked) => updateChannelSettings(selectedChannel.id, { 
                              notifications: { ...selectedChannel.notifications!, live_detected: checked }
                            })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Mirroring started</span>
                          <Switch 
                            checked={selectedChannel.notifications?.mirroring_started ?? true}
                            onCheckedChange={(checked) => updateChannelSettings(selectedChannel.id, { 
                              notifications: { ...selectedChannel.notifications!, mirroring_started: checked }
                            })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Mirroring ended</span>
                          <Switch 
                            checked={selectedChannel.notifications?.mirroring_ended ?? true}
                            onCheckedChange={(checked) => updateChannelSettings(selectedChannel.id, { 
                              notifications: { ...selectedChannel.notifications!, mirroring_ended: checked }
                            })}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Stream ended</span>
                          <Switch 
                            checked={selectedChannel.notifications?.stream_ended ?? true}
                            onCheckedChange={(checked) => updateChannelSettings(selectedChannel.id, { 
                              notifications: { ...selectedChannel.notifications!, stream_ended: checked }
                            })}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSelectedChannelId(null)}>Cancel</Button>
                    <Button onClick={handleSaveSettings} className="bg-primary text-primary-foreground hover:bg-primary/90">Save changes</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 mt-auto border-t border-border">
        <Button variant="outline" onClick={() => setIsAddOpen(true)} className="w-full gap-2 border-dashed border-muted-foreground/30 hover:border-primary/50 text-muted-foreground hover:text-primary transition-colors">
          <Plus className="w-4 h-4" /> Add Channel
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="w-[280px] shrink-0 border-r border-border bg-background flex flex-col hidden md:flex z-0 relative">
        {sidebarContent}
      </aside>

      {/* Mobile drawer trigger */}
      <button 
        onClick={() => setIsMobileOpen(true)}
        className="md:hidden fixed bottom-4 left-4 z-50 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile drawer overlay */}
      {isMobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setIsMobileOpen(false)} />
          <aside className="relative w-[280px] bg-background border-r border-border flex flex-col h-full animate-in slide-in-from-left">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="font-semibold text-sm">Navigation</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsMobileOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}

      <AlertDialog open={!!channelToRemove} onOpenChange={(open) => !open && setChannelToRemove(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {channelToRemove?.name} from your tracked channels. You will no longer automatically mirror their content. Any active streams from this channel will also be ended.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove Channel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
