import React, { useState } from 'react';
import { YouTubeStream, MirroringJob } from '../types';
import { useStore } from '../store';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Play, Square, ExternalLink, MoreVertical, Eye, Users, Radio, Activity, StopCircle, Youtube, VideoIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export const StreamCard: React.FC<{ stream: YouTubeStream }> = ({ stream }) => {
  const { startMirroring, stopMirroring, trackedChannels, mirroringJobs } = useStore();
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showMirrorStatus, setShowMirrorStatus] = useState(false);
  const channel = trackedChannels.find(c => c.id === stream.channelId);

  const isLive = stream.status === 'LIVE';
  const isMirroring = stream.status === 'MIRRORING';
  const isEnded = stream.status === 'ENDED';

  // Find the mirroring job for this stream
  const mirrorJob = mirroringJobs.find(j => j.source_stream_id === stream.id) || null;

  // Determine if we have a real YouTube video ID for "Open on YouTube"
  const youtubeVideoId = stream.sourceStreamId && stream.sourceStreamId.length === 11 ? stream.sourceStreamId : null;
  
  const handleStartMirroring = () => {
    toast.success('Mirroring started', { description: `Relaying ${stream.title} to your connected account...` });
    startMirroring(stream.id);
  };

  const handleStopMirroring = () => {
    setShowStopConfirm(true);
  };

  const confirmStopMirroring = () => {
    toast.success('Mirroring stopped', { description: `Ended relay for ${stream.title}` });
    stopMirroring(stream.id);
    setShowStopConfirm(false);
  };

  const handleOpenOnYouTube = () => {
    if (youtubeVideoId) {
      window.open(`https://youtube.com/watch?v=${youtubeVideoId}`, '_blank');
    } else {
      // Fallback: search by title
      window.open(`https://youtube.com/results?search_query=${encodeURIComponent(stream.title)}`, '_blank');
    }
  };

  return (
    <>
      <Card className={`overflow-hidden bg-card/40 border-border hover:border-border/80 transition-all duration-300 group ${isEnded ? 'opacity-60' : ''}`}>
        <div className="relative aspect-video bg-muted overflow-hidden flex items-center justify-center border-b border-border">
          {stream.type === '9:16' ? (
            <div className="absolute inset-0 flex items-center justify-center w-full h-full backdrop-blur-md bg-black/60">
               <img src={stream.thumbnail} alt={stream.title} className="h-full w-auto object-cover blur-3xl opacity-30 absolute inset-0 mix-blend-overlay" />
               <img src={stream.thumbnail} alt={stream.title} className="h-[90%] w-auto object-cover rounded-md z-10 shadow-2xl border border-white/10" />
            </div>
          ) : (
            <img src={stream.thumbnail} alt={stream.title} className={`w-full h-full object-cover ${!isEnded ? 'group-hover:scale-105' : ''} transition-transform duration-500`} />
          )}
          
          {isEnded && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
              <div className="bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2">
                <StopCircle className="w-5 h-5 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Stream Ended</span>
              </div>
            </div>
          )}
          
          <div className="absolute top-3 left-3 flex gap-2 z-20">
            {isLive && (
              <Badge variant="destructive" className="bg-red-500 text-white font-bold tracking-wider px-2 shadow-lg animate-pulse">
                <Radio className="w-3 h-3 mr-1" /> LIVE
              </Badge>
            )}
            {isMirroring && (
              <Badge className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold tracking-wider px-2 shadow-lg shadow-primary/20">
                <Activity className="w-3 h-3 mr-1 animate-pulse" /> MIRRORING
              </Badge>
            )}
            {isEnded && (
              <Badge variant="secondary" className="font-bold tracking-wider px-2 shadow-lg bg-muted/80">
                ENDED
              </Badge>
            )}
          </div>

          <div className="absolute bottom-3 left-3 flex gap-2 z-20">
            {!isEnded && (
              <>
                <Badge variant="secondary" className="bg-black/60 hover:bg-black/80 backdrop-blur-md text-white border-0 py-0.5 max-h-6">
                   <Users className="w-3 h-3 mr-1.5 opacity-70" /> {stream.viewerCount.toLocaleString()}
                </Badge>
                <Badge variant="secondary" className="bg-black/60 hover:bg-black/80 backdrop-blur-md text-white border-0 py-0.5 max-h-6">
                   {stream.type}
                </Badge>
                {youtubeVideoId && (
                  <Badge variant="secondary" className="bg-black/60 hover:bg-black/80 backdrop-blur-md text-white border-0 py-0.5 max-h-6 cursor-pointer" onClick={handleOpenOnYouTube}>
                     <Youtube className="w-3 h-3 mr-1" /> Watch
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>
        
        <CardContent className="p-4 pt-5 relative">
          <div className="flex gap-3">
            <Avatar className="w-9 h-9 border border-border shrink-0 mt-0.5">
              <AvatarImage src={channel?.avatar || stream.channel_avatar} />
              <AvatarFallback>{(channel?.name || stream.channel_name || '?').charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 pr-6">
              <h3 className="font-semibold text-foreground truncate text-sm mb-1 transition-colors">{stream.title}</h3>
              <p className="text-xs text-muted-foreground truncate">{channel?.name || stream.channel_name}</p>
              {stream.startedAt && (
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  Started {formatDistanceToNow(new Date(stream.startedAt))} ago
                </p>
              )}
            </div>
          </div>

          {!isEnded && (
            <div className="absolute right-3 top-4">
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                } />
                <DropdownMenuContent align="end" className="w-48">
                  {isLive ? (
                    <DropdownMenuItem className="cursor-pointer gap-2" onClick={handleStartMirroring}>
                      <Play className="w-4 h-4 text-primary" /> Start Mirroring
                    </DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuItem className="cursor-pointer gap-2" onClick={handleStopMirroring}>
                        <Square className="w-4 h-4 text-destructive" /> Stop Mirroring
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => setShowMirrorStatus(true)}>
                        <Activity className="w-4 h-4" /> View Mirror Status
                      </DropdownMenuItem>
                    </>
                  )}
                  
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer gap-2" onClick={() => setShowDetails(true)}>
                    <Eye className="w-4 h-4" /> View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer gap-2" onClick={handleOpenOnYouTube}>
                    <ExternalLink className="w-4 h-4" /> Open on YouTube
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stop Mirroring Confirmation */}
      <AlertDialog open={showStopConfirm} onOpenChange={setShowStopConfirm}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Stop Mirroring?</AlertDialogTitle>
            <AlertDialogDescription>
              This will end the mirrored broadcast for "{stream.title}". The source stream will not be affected, but the relay to your connected account will stop. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStopMirroring} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Stop Mirroring
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="sm:max-w-[500px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {stream.status === 'LIVE' && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
              {stream.status === 'MIRRORING' && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
              Stream Details
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-foreground pt-1">
              {stream.title}
            </DialogDescription>
          </DialogHeader>
          
          {stream.thumbnail && (
            <div className="rounded-lg overflow-hidden border border-border">
              <img src={stream.thumbnail} alt={stream.title} className="w-full aspect-video object-cover" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 py-2">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Channel</p>
              <p className="text-sm font-medium truncate">{channel?.name || stream.channel_name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Status</p>
              <p className="text-sm font-medium">
                {stream.status === 'LIVE' && <span className="text-red-400">Live</span>}
                {stream.status === 'MIRRORING' && <span className="text-primary">Mirroring</span>}
                {stream.status === 'ENDED' && <span className="text-muted-foreground">Ended</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Viewers</p>
              <p className="text-sm font-medium">{stream.viewerCount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Type</p>
              <p className="text-sm font-medium">{stream.type}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Started</p>
              <p className="text-sm font-medium">{stream.startedAt ? formatDistanceToNow(new Date(stream.startedAt), { addSuffix: true }) : '—'}</p>
            </div>
            {stream.description && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Description</p>
                <p className="text-sm text-muted-foreground/80 line-clamp-3">{stream.description}</p>
              </div>
            )}
            {youtubeVideoId && (
              <div className="col-span-2 pt-2">
                <Button variant="outline" className="w-full gap-2" onClick={handleOpenOnYouTube}>
                  <Youtube className="w-4 h-4" /> Watch on YouTube
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Mirror Status Dialog */}
      <Dialog open={showMirrorStatus} onOpenChange={setShowMirrorStatus}>
        <DialogContent className="sm:max-w-[500px] bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Mirror Status
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-foreground pt-1">
              {stream.title}
            </DialogDescription>
          </DialogHeader>

          {mirrorJob ? (
            <div className="grid grid-cols-2 gap-4 py-2">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  {mirrorJob.status === 'active' ? (
                    <><span className="w-2 h-2 rounded-full bg-green-500" /> Active</>
                  ) : (
                    <><span className="w-2 h-2 rounded-full bg-muted-foreground" /> {mirrorJob.status}</>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Broadcast ID</p>
                <p className="text-sm font-mono text-xs truncate">
                  {mirrorJob.target_broadcast_id?.startsWith('local_') ? (
                    <span className="text-muted-foreground">Local (no YouTube broadcast)</span>
                  ) : (
                    mirrorJob.target_broadcast_id
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Started</p>
                <p className="text-sm font-medium">{mirrorJob.started_at ? formatDistanceToNow(new Date(mirrorJob.started_at), { addSuffix: true }) : '—'}</p>
              </div>
              {mirrorJob.ended_at && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Ended</p>
                  <p className="text-sm font-medium">{formatDistanceToNow(new Date(mirrorJob.ended_at), { addSuffix: true })}</p>
                </div>
              )}
              {mirrorJob.ingest_url && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Ingest URL</p>
                  <p className="text-xs font-mono truncate bg-background rounded p-2 border border-border">{mirrorJob.ingest_url}</p>
                </div>
              )}
              {mirrorJob.stream_name && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Stream Key</p>
                  <p className="text-xs font-mono truncate bg-background rounded p-2 border border-border">{mirrorJob.stream_name}</p>
                </div>
              )}
              {mirrorJob.stream_title && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Streamed Video</p>
                  <p className="text-sm truncate">{mirrorJob.stream_title}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center">
              <VideoIcon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No mirroring job found for this stream.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Start mirroring to create a job.</p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setShowMirrorStatus(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
